// Normalização pura do protocolo do opencode (usada no main e no renderer).
// Sem dependências de Node/Electron: só transforma shapes crus em `AiPart`,
// `AiMessage` e `AiPermissionRequest` que a UI entende.

import type { AiMessage, AiPart, AiPermissionRequest } from './types'

export interface RawPart {
  id?: string
  type?: string
  text?: string
  synthetic?: boolean
  messageID?: string
  sessionID?: string
  tool?: string
  state?: {
    status?: string
    title?: string
    output?: string
    error?: string
    input?: Record<string, unknown>
  }
}

export interface RawMessageInfo {
  id?: string
  role?: string
  time?: { created?: number }
  agent?: string
  modelID?: string
  providerID?: string
  cost?: number
  error?: unknown
}

export interface RawMessage {
  info?: RawMessageInfo
  parts?: RawPart[]
}

export function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

/** Resumo curto e legível de um erro do assistant (não despeja o payload). */
export function shortError(e: unknown): string {
  if (!e) return ''
  if (typeof e === 'string') return e
  const o = e as Record<string, unknown>
  const data = o['data'] as Record<string, unknown> | undefined
  const msg = (data?.['message'] ?? o['message'] ?? o['name']) as string | undefined
  return typeof msg === 'string' ? msg : 'erro'
}

/** Mapeia uma parte crua do opencode para o shape da UI. */
export function normalizePart(p: RawPart): AiPart {
  const id = p.id ?? ''
  if (p.type === 'text') return { kind: 'text', id, text: p.text ?? '', synthetic: p.synthetic }
  if (p.type === 'reasoning') return { kind: 'reasoning', id, text: p.text ?? '' }
  if (p.type === 'tool') {
    const s = p.state ?? {}
    const raw = s.status ?? 'pending'
    const status: 'pending' | 'running' | 'completed' | 'error' =
      raw === 'completed' || raw === 'error' || raw === 'running' ? raw : 'pending'
    return { kind: 'tool', id, tool: p.tool ?? 'tool', status, title: s.title, detail: s.error ?? s.output }
  }
  return { kind: 'other', id, type: p.type ?? 'unknown' }
}

/** Normaliza a mensagem do list-endpoint (`{info, parts}`). */
export function normalizeMessage(m: RawMessage): AiMessage {
  const info = m.info ?? {}
  const role = info.role === 'user' ? 'user' : 'assistant'
  const parts = asArray<RawPart>(m.parts)
    .filter((p) => p.type !== 'step-start' && p.type !== 'step-finish' && p.type !== 'snapshot')
    .map(normalizePart)
  return {
    id: info.id ?? '',
    role,
    created: info.time?.created ?? 0,
    agent: info.agent,
    modelID: info.modelID,
    providerID: info.providerID,
    cost: info.cost,
    error: info.error ? shortError(info.error) : undefined,
    parts
  }
}

/** Extrai o pedido de permissão de um evento (`permission.asked`/`v2`). */
export function normalizePermission(ev: {
  type?: string
  properties?: Record<string, unknown>
}): AiPermissionRequest | null {
  const p = ev.properties
  if (!p || typeof p.id !== 'string' || typeof p.sessionID !== 'string') return null
  const scheme: 'classic' | 'v2' = ev.type === 'permission.v2.asked' ? 'v2' : 'classic'
  const kind = (p['permission'] as string | undefined) ?? (p['action'] as string | undefined) ?? 'permission'
  const patterns = asArray<string>(p['patterns']).concat(asArray<string>(p['resources']))
  const title = patterns.length > 0 ? `${kind}: ${patterns.join(', ')}` : kind
  return { id: p.id, sessionID: p.sessionID, title, kind, scheme }
}
