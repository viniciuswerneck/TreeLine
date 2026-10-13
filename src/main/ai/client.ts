// Cliente HTTP do servidor embutido `opencode serve` (loopback). Só o main
// fala com ele; o renderer recebe eventos/estado já normalizados via IPC.
//
// A API do opencode v1 (1.18.x) expõe o namespace clássico (`/session`,
// `/event`, `/config/providers`) e as respostas são JSON. A normalização vive
// em `shared/ai.ts` (também usada pelo renderer).

import type { AiAgent, AiMessage, AiModel, AiPermissionRequest, AiSessionInfo } from '../../shared/types'
import { asArray, normalizeMessage, type RawMessage, type RawPart } from '../../shared/ai'

/** Erro de HTTP com status para diagnóstico (nunca vaza token). */
export class OpencodeHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
  }
}

/** Cliente mínimo do servidor do opencode. */
export class OpencodeClient {
  constructor(private readonly base: string) {}

  private async req<T>(path: string, init?: RequestInit, timeoutMs = 30_000): Promise<T> {
    const res = await fetch(this.base + path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new OpencodeHttpError(res.status, `${path} → ${res.status} ${body.slice(0, 200)}`)
    }
    if (res.status === 204) return undefined as T
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  health(): Promise<unknown> {
    return this.req('/global/health')
  }

  async agents(): Promise<AiAgent[]> {
    const raw = await this.req<unknown>('/agent')
    return asArray<Record<string, unknown>>(raw)
      .filter((a) => typeof a['name'] === 'string')
      .map((a) => ({
        name: String(a['name']),
        description: String(a['description'] ?? ''),
        mode: String(a['mode'] ?? 'primary')
      }))
  }

  async models(): Promise<AiModel[]> {
    const raw = await this.req<{ providers?: Array<Record<string, unknown>> }>('/config/providers')
    const out: AiModel[] = []
    for (const prov of asArray<Record<string, unknown>>(raw.providers)) {
      const providerID = String(prov['id'] ?? '')
      const providerName = String(prov['name'] ?? providerID)
      const models = (prov['models'] ?? {}) as Record<string, Record<string, unknown>>
      for (const modelID of Object.keys(models)) {
        out.push({
          providerID,
          providerName,
          modelID,
          name: String(models[modelID]?.['name'] ?? modelID)
        })
      }
    }
    return out.sort((a, b) => a.providerName.localeCompare(b.providerName) || a.name.localeCompare(b.name))
  }

  private mapSession(s: Record<string, unknown>): AiSessionInfo {
    return {
      id: String(s['id'] ?? ''),
      title: String(s['title'] ?? ''),
      directory: String(s['directory'] ?? ''),
      created: Number((s['time'] as Record<string, unknown> | undefined)?.['created'] ?? 0),
      updated: Number((s['time'] as Record<string, unknown> | undefined)?.['updated'] ?? 0),
      cost: Number(s['cost'] ?? 0)
    }
  }

  async sessions(directory?: string): Promise<AiSessionInfo[]> {
    const q = directory ? `?directory=${encodeURIComponent(directory)}` : ''
    const raw = await this.req<unknown>('/session' + q)
    return asArray<Record<string, unknown>>(raw)
      .map((s) => this.mapSession(s))
      .sort((a, b) => b.updated - a.updated)
  }

  async createSession(
    directory: string,
    opts?: { title?: string; agent?: string; model?: { providerID: string; modelID: string } }
  ): Promise<AiSessionInfo> {
    const body: Record<string, unknown> = {}
    if (opts?.title) body['title'] = opts.title
    if (opts?.agent) body['agent'] = opts.agent
    if (opts?.model) body['model'] = { id: opts.model.modelID, providerID: opts.model.providerID }
    const raw = await this.req<Record<string, unknown>>(
      `/session?directory=${encodeURIComponent(directory)}`,
      { method: 'POST', body: JSON.stringify(body) }
    )
    return this.mapSession(raw)
  }

  deleteSession(id: string): Promise<void> {
    return this.req(`/session/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  async messages(sessionID: string, directory?: string): Promise<AiMessage[]> {
    const q = directory ? `?directory=${encodeURIComponent(directory)}` : ''
    const raw = await this.req<unknown>(`/session/${encodeURIComponent(sessionID)}/message` + q)
    return asArray<RawMessage>(raw).map(normalizeMessage)
  }

  promptAsync(
    sessionID: string,
    directory: string,
    text: string,
    opts?: { agent?: string; model?: { providerID: string; modelID: string } }
  ): Promise<void> {
    const body: Record<string, unknown> = { parts: [{ type: 'text', text }] }
    if (opts?.agent) body['agent'] = opts.agent
    if (opts?.model) body['model'] = { providerID: opts.model.providerID, modelID: opts.model.modelID }
    return this.req(
      `/session/${encodeURIComponent(sessionID)}/prompt_async?directory=${encodeURIComponent(directory)}`,
      { method: 'POST', body: JSON.stringify(body) }
    )
  }

  abort(sessionID: string): Promise<void> {
    return this.req(`/session/${encodeURIComponent(sessionID)}/abort`, { method: 'POST', body: '{}' })
  }

  /**
   * Envia um prompt e AGUARDA a resposta completa (usado por ações pontuais,
   * ex.: gerar mensagem de commit). Devolve só o texto do assistant.
   */
  async prompt(
    sessionID: string,
    directory: string,
    text: string,
    opts?: { agent?: string; model?: { providerID: string; modelID: string } }
  ): Promise<string> {
    const body: Record<string, unknown> = { parts: [{ type: 'text', text }] }
    if (opts?.agent) body['agent'] = opts.agent
    if (opts?.model) body['model'] = { providerID: opts.model.providerID, modelID: opts.model.modelID }
    const raw = await this.req<{ parts?: RawPart[] }>(
      `/session/${encodeURIComponent(sessionID)}/message?directory=${encodeURIComponent(directory)}`,
      { method: 'POST', body: JSON.stringify(body) },
      180_000
    )
    return asArray<RawPart>(raw.parts)
      .filter((p) => p.type === 'text')
      .map((p) => p.text ?? '')
      .join('\n')
      .trim()
  }

  /** Responde o gate de permissão (endpoint antigo ou v2, conforme o evento). */
  async permissionReply(request: AiPermissionRequest, response: 'once' | 'always' | 'reject'): Promise<void> {
    if (request.scheme === 'v2') {
      await this.req(
        `/api/session/${encodeURIComponent(request.sessionID)}/permission/${encodeURIComponent(request.id)}/reply`,
        { method: 'POST', body: JSON.stringify({ reply: response }) }
      )
      return
    }
    await this.req(`/session/${encodeURIComponent(request.sessionID)}/permissions/${encodeURIComponent(request.id)}`, {
      method: 'POST',
      body: JSON.stringify({ response })
    })
  }
}
