// Estado da integração opcional com o opencode, separado do `store` principal
// (que está congelado por ratchet). O TreeLine funciona sem o assistente.
//
// Fase 2: servidor embutido (`opencode serve`) + painel de chat. Guardamos
// sessões, mensagens (streaming via eventos SSE repassados pelo main), o
// estado do servidor, o gate de permissões e as preferências (agente/modelo/
// auto-aprovar), persistidas no localStorage.

import { create } from 'zustand'
import type {
  AiAgent,
  AiEvent,
  AiMessage,
  AiModel,
  AiPart,
  AiPermissionRequest,
  AiServerStatus,
  AiSessionInfo,
  AiStatus
} from '../shared/types'
import { normalizePart, normalizePermission, shortError, type RawPart } from '../shared/ai'

const ENABLED_KEY = 'treeline-ai-enabled'
const DISMISS_KEY = 'treeline-ai-suggestion-dismissed'
const AGENT_KEY = 'treeline-ai-agent'
const MODEL_KEY = 'treeline-ai-model'
const AUTO_KEY = 'treeline-ai-auto-approve'

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* storage indisponível: segue só em memória */
  }
}

function readText(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeText(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* ignora */
  }
}

function readModel(): { providerID: string; modelID: string } | null {
  try {
    const raw = localStorage.getItem(MODEL_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as { providerID?: unknown; modelID?: unknown }
    return typeof o.providerID === 'string' && typeof o.modelID === 'string'
      ? { providerID: o.providerID, modelID: o.modelID }
      : null
  } catch {
    return null
  }
}

export interface AiState {
  // --- detecção (Fase 1) ---
  status: AiStatus | null
  loading: boolean
  enabled: boolean
  suggestionDismissed: boolean
  detect: () => Promise<void>
  setEnabled: (value: boolean) => void
  dismissSuggestion: () => void

  // --- servidor (Fase 2) ---
  server: AiServerStatus
  serverBusy: boolean
  startServer: () => Promise<void>
  stopServer: () => Promise<void>
  restartServer: () => Promise<void>
  refreshServer: () => Promise<void>

  // --- metadados ---
  agents: AiAgent[]
  models: AiModel[]
  agent: string
  model: { providerID: string; modelID: string } | null
  autoApprove: boolean
  setAgent: (name: string) => void
  setModel: (m: { providerID: string; modelID: string } | null) => void
  setAutoApprove: (v: boolean) => void
  loadMeta: () => Promise<void>

  // --- conversa ---
  open: boolean
  setOpen: (v: boolean) => void
  toggle: () => void
  /** Comando efêmero a digitar no Terminal integrado (ex.: `opencode`). */
  terminalCommand: string | null
  requestTerminalCommand: (cmd: string) => void
  consumeTerminalCommand: () => void
  sessionID: string | null
  sessions: AiSessionInfo[]
  messages: AiMessage[]
  busy: boolean
  error: string | null
  permissions: AiPermissionRequest[]
  loadSessions: (directory: string) => Promise<void>
  newSession: (directory: string) => Promise<void>
  selectSession: (id: string, directory: string) => Promise<void>
  deleteSession: (id: string, directory: string) => Promise<void>
  send: (directory: string, text: string) => Promise<void>
  abort: () => Promise<void>
  replyPermission: (request: AiPermissionRequest, response: 'once' | 'always' | 'reject') => Promise<void>
  onEvent: (ev: AiEvent) => void

  // --- ações git-aware (Fase 3, propose-only) ---
  /** Abre o painel, garante servidor/sessão e envia um prompt programático. */
  promptExternal: (directory: string, text: string) => Promise<void>
  assistOpen: boolean
  assistKind: 'commit' | 'review' | 'conflict'
  assistText: string
  assistLoading: boolean
  assistError: string | null
  generateAssist: (repo: string, kind: 'commit' | 'review' | 'conflict', lang?: string, file?: string) => Promise<void>
  closeAssist: () => void
}

const NO_SERVER: AiServerStatus = { running: false, url: null, pid: null, error: null }

function upsertMessage(list: AiMessage[], msg: AiMessage): AiMessage[] {
  const i = list.findIndex((m) => m.id === msg.id)
  if (i === -1) return [...list, msg]
  const next = list.slice()
  next[i] = { ...next[i], ...msg, parts: msg.parts.length ? msg.parts : next[i].parts }
  return next
}

function upsertPart(list: AiMessage[], messageID: string, partID: string, part: AiPart): AiMessage[] {
  const i = list.findIndex((m) => m.id === messageID)
  if (i === -1) return list
  const next = list.slice()
  const parts = next[i].parts.slice()
  const j = parts.findIndex((p) => p.id === partID)
  if (j === -1) parts.push(part)
  else parts[j] = part
  next[i] = { ...next[i], parts }
  return next
}

function mergeInfo(m: AiMessage, info: Record<string, unknown>): AiMessage {
  return {
    ...m,
    role: info['role'] === 'user' ? 'user' : 'assistant',
    created: Number((info['time'] as Record<string, unknown> | undefined)?.['created'] ?? m.created),
    agent: (info['agent'] as string | undefined) ?? m.agent,
    modelID: (info['modelID'] as string | undefined) ?? m.modelID,
    providerID: (info['providerID'] as string | undefined) ?? m.providerID,
    cost: typeof info['cost'] === 'number' ? info['cost'] : m.cost,
    error: info['error'] ? shortError(info['error']) : m.error
  }
}

export const useAiStore = create<AiState>((set, get) => ({
  status: null,
  loading: false,
  enabled: readFlag(ENABLED_KEY),
  suggestionDismissed: readFlag(DISMISS_KEY),
  detect: async () => {
    set({ loading: true })
    try {
      const status = await window.treeline.aiDetect()
      set({ status, loading: false, enabled: get().enabled && status.installed })
    } catch {
      set({ loading: false })
    }
  },
  setEnabled: (value) => {
    writeFlag(ENABLED_KEY, value)
    set({ enabled: value, open: value ? get().open : false })
    if (value) {
      void get().refreshServer()
      void get().loadMeta()
    } else {
      void get().stopServer()
      set({ permissions: [], busy: false })
    }
  },
  dismissSuggestion: () => {
    writeFlag(DISMISS_KEY, true)
    set({ suggestionDismissed: true })
  },

  // --- servidor ---
  server: NO_SERVER,
  serverBusy: false,
  startServer: async () => {
    set({ serverBusy: true })
    try {
      set({ server: await window.treeline.aiServerStart(), serverBusy: false })
    } catch (e) {
      set({ serverBusy: false, error: e instanceof Error ? e.message : String(e) })
    }
  },
  stopServer: async () => {
    set({ server: await window.treeline.aiServerStop() })
  },
  restartServer: async () => {
    set({ serverBusy: true })
    try {
      set({ server: await window.treeline.aiServerRestart(), serverBusy: false })
    } catch (e) {
      set({ serverBusy: false, error: e instanceof Error ? e.message : String(e) })
    }
  },
  refreshServer: async () => {
    try {
      set({ server: await window.treeline.aiServerStatus() })
    } catch {
      set({ server: NO_SERVER })
    }
  },

  // --- metadados ---
  agents: [],
  models: [],
  agent: readText(AGENT_KEY) ?? 'plan',
  model: readModel(),
  autoApprove: readFlag(AUTO_KEY),
  setAgent: (name) => {
    writeText(AGENT_KEY, name)
    set({ agent: name })
  },
  setModel: (m) => {
    writeText(MODEL_KEY, m ? JSON.stringify(m) : null)
    set({ model: m })
  },
  setAutoApprove: (v) => {
    writeFlag(AUTO_KEY, v)
    set({ autoApprove: v })
  },
  loadMeta: async () => {
    try {
      const [agents, models] = await Promise.all([window.treeline.aiAgents(), window.treeline.aiModels()])
      const primaries = agents.filter((a) => a.mode === 'primary')
      const names = primaries.map((a) => a.name)
      set({ agents: primaries, models })
      if (names.length && !names.includes(get().agent)) {
        get().setAgent(names.includes('plan') ? 'plan' : names[0])
      }
    } catch {
      /* servidor offline: mantém vazio */
    }
  },

  // --- conversa ---
  open: false,
  setOpen: (v) => set({ open: v }),
  toggle: () => set({ open: !get().open }),
  terminalCommand: null,
  requestTerminalCommand: (cmd) => set({ terminalCommand: cmd }),
  consumeTerminalCommand: () => set({ terminalCommand: null }),
  sessionID: null,
  sessions: [],
  messages: [],
  busy: false,
  error: null,
  permissions: [],

  loadSessions: async (directory) => {
    try {
      set({ sessions: await window.treeline.aiSessions(directory) })
    } catch {
      set({ sessions: [] })
    }
    void get().refreshServer()
  },
  newSession: async (directory) => {
    set({ error: null })
    try {
      const s = await window.treeline.aiSessionCreate(directory, {
        agent: get().agent,
        model: get().model ?? undefined
      })
      set((st) => ({ sessionID: s.id, messages: [], sessions: [s, ...st.sessions.filter((x) => x.id !== s.id)], busy: false }))
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
    void get().refreshServer()
  },
  selectSession: async (id, directory) => {
    set({ sessionID: id, messages: [], error: null })
    try {
      set({ messages: await window.treeline.aiMessages(id, directory) })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
    void get().refreshServer()
  },
  deleteSession: async (id, directory) => {
    try {
      await window.treeline.aiSessionDelete(id)
    } catch {
      /* já pode ter sumido */
    }
    set((st) => ({
      sessions: st.sessions.filter((s) => s.id !== id),
      sessionID: st.sessionID === id ? null : st.sessionID,
      messages: st.sessionID === id ? [] : st.messages
    }))
    void get().loadSessions(directory)
  },
  send: async (directory, text) => {
    const sid = get().sessionID
    if (!sid) return
    set({ busy: true, error: null })
    try {
      await window.treeline.aiSend(sid, directory, text, {
        agent: get().agent,
        model: get().model ?? undefined
      })
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : String(e) })
    }
  },
  abort: async () => {
    const sid = get().sessionID
    if (!sid) return
    try {
      await window.treeline.aiAbort(sid)
    } catch {
      /* ignora */
    }
    set({ busy: false })
  },
  replyPermission: async (request, response) => {
    set((st) => ({ permissions: st.permissions.filter((p) => p.id !== request.id) }))
    try {
      await window.treeline.aiPermissionReply(request.sessionID, request.id, response)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  onEvent: (ev) => {
    const sid = get().sessionID
    const props = (ev.properties ?? {}) as Record<string, unknown>
    switch (ev.type) {
      case 'message.updated': {
        const info = props['info'] as Record<string, unknown> | undefined
        if (!info || info['sessionID'] !== sid) return
        const id = String(info['id'] ?? '')
        if (!id) return
        const existing = get().messages.find((m) => m.id === id)
        const base: AiMessage =
          existing ?? { id, role: info['role'] === 'user' ? 'user' : 'assistant', created: 0, parts: [] }
        set((st) => ({ messages: upsertMessage(st.messages, mergeInfo(base, info)) }))
        return
      }
      case 'message.part.updated': {
        const raw = props['part'] as RawPart | undefined
        if (!raw || raw.messageID === undefined) return
        if (raw['sessionID'] !== undefined && raw['sessionID'] !== sid) return
        set((st) => ({ messages: upsertPart(st.messages, raw.messageID as string, raw.id ?? '', normalizePart(raw)) }))
        return
      }
      case 'session.status': {
        if (props['sessionID'] !== sid) return
        const type = (props['status'] as Record<string, unknown> | undefined)?.['type']
        set({ busy: type === 'busy' })
        return
      }
      case 'session.error': {
        if (props['sessionID'] !== sid) return
        set({ busy: false, error: shortError(props['error']) || 'erro' })
        return
      }
      case 'permission.asked':
      case 'permission.v2.asked': {
        const req = normalizePermission({ type: ev.type, properties: props })
        if (!req || req.sessionID !== sid) return
        set((st) => (st.permissions.some((p) => p.id === req.id) ? st : { permissions: [...st.permissions, req] }))
        if (get().autoApprove) void get().replyPermission(req, 'once')
        return
      }
      case 'permission.replied':
      case 'permission.v2.replied': {
        const id = String(props['id'] ?? props['requestID'] ?? '')
        set((st) => ({ permissions: st.permissions.filter((p) => p.id !== id) }))
        return
      }
      default:
        return
    }
  },

  // --- ações git-aware (propose-only) ---
  promptExternal: async (directory, text) => {
    set({ open: true, error: null })
    try {
      await get().startServer()
      if (!get().sessionID) await get().newSession(directory)
      await get().send(directory, text)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },
  assistOpen: false,
  assistKind: 'commit',
  assistText: '',
  assistLoading: false,
  assistError: null,
  generateAssist: async (repo, kind, lang, file) => {
    set({ assistOpen: true, assistKind: kind, assistText: '', assistLoading: true, assistError: null })
    try {
      const text =
        kind === 'commit'
          ? await window.treeline.aiCommitMessage(repo, lang)
          : kind === 'review'
            ? await window.treeline.aiReviewStaged(repo, lang)
            : await window.treeline.aiExplainConflict(repo, file ?? '', lang)
      set({ assistText: text, assistLoading: false })
    } catch (e) {
      set({ assistLoading: false, assistError: e instanceof Error ? e.message : String(e) })
    }
  },
  closeAssist: () => set({ assistOpen: false, assistLoading: false, assistText: '', assistError: null })
}))

/** Vale sugerir ativar? Instalado, ainda não ligado e não dispensado. */
export function shouldSuggest(status: AiStatus | null, enabled: boolean, dismissed: boolean): boolean {
  return !!status?.installed && !enabled && !dismissed
}

/**
 * Comando para abrir a TUI do `opencode` no Terminal integrado. Usa o caminho
 * absoluto detectado (o PATH do shell do pty pode não incluir ~/.opencode/bin);
 * cai para `opencode` quando não detectado.
 */
export function opencodeCommand(): string {
  const p = useAiStore.getState().status?.path
  return p ? `'${p.replace(/'/g, `'\\''`)}'` : 'opencode'
}
