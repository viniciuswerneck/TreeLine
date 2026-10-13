import { Bot, Loader2, Maximize2, Minimize2, Plus, RotateCcw, Send, ShieldAlert, Square, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AiMessage, AiPart } from '../../shared/types'
import type { DictKey } from '../i18n'
import { useAiStore } from '../ai-store'
import { useStore } from '../store'

type Tr = (k: DictKey, vars?: Record<string, string | number>) => string

/** Bloco de uma parte da mensagem (texto, raciocínio ou chamada de ferramenta). */
function PartView({ part, tr }: { part: AiPart; tr: Tr }) {
  if (part.kind === 'text') {
    if (!part.text.trim()) return null
    return <div className="ai-text">{part.text}</div>
  }
  if (part.kind === 'reasoning') {
    if (!part.text.trim()) return null
    return (
      <details className="ai-reasoning">
        <summary>{tr('ai.reasoning')}</summary>
        <div>{part.text}</div>
      </details>
    )
  }
  if (part.kind === 'tool') {
    return (
      <div className={`ai-tool ai-tool-${part.status}`}>
        <span className="ai-tool-name">{part.tool}</span>
        {part.title && <span className="ai-tool-title">{part.title}</span>}
        {part.status === 'running' && <Loader2 size={12} className="ai-spin" />}
        {part.detail && <pre className="ai-tool-detail">{part.detail.slice(0, 4000)}</pre>}
      </div>
    )
  }
  return null
}

function MessageView({ msg, tr }: { msg: AiMessage; tr: Tr }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`ai-msg ${isUser ? 'ai-msg-user' : 'ai-msg-assistant'}`}>
      <div className="ai-msg-role">{isUser ? tr('ai.roleYou') : tr('ai.roleAssistant')}</div>
      {msg.error && <div className="ai-msg-error">{msg.error}</div>}
      {msg.parts.map((p, i) => (
        <PartView key={p.id || `${msg.id}-${i}`} part={p} tr={tr} />
      ))}
    </div>
  )
}

/**
 * Painel do assistente (drawer inferior, ao lado do Terminal): conversa com o
 * opencode via servidor embutido em loopback. Propose-only por padrão (agente
 * `plan`, somente leitura); o gate de permissões aparece quando algo pede
 * aprovação. O app funciona sem isso.
 */
export default function AssistantPanel() {
  const tr = useStore((s) => s.tr)
  const current = useStore((s) => s.current)
  const enabled = useAiStore((s) => s.enabled)
  const server = useAiStore((s) => s.server)
  const sessions = useAiStore((s) => s.sessions)
  const sessionID = useAiStore((s) => s.sessionID)
  const messages = useAiStore((s) => s.messages)
  const busy = useAiStore((s) => s.busy)
  const error = useAiStore((s) => s.error)
  const permissions = useAiStore((s) => s.permissions)
  const agents = useAiStore((s) => s.agents)
  const models = useAiStore((s) => s.models)
  const agent = useAiStore((s) => s.agent)
  const model = useAiStore((s) => s.model)
  const autoApprove = useAiStore((s) => s.autoApprove)
  const setOpen = useAiStore((s) => s.setOpen)
  const newSession = useAiStore((s) => s.newSession)
  const loadSessions = useAiStore((s) => s.loadSessions)
  const selectSession = useAiStore((s) => s.selectSession)
  const send = useAiStore((s) => s.send)
  const abort = useAiStore((s) => s.abort)
  const replyPermission = useAiStore((s) => s.replyPermission)
  const setAgent = useAiStore((s) => s.setAgent)
  const setModel = useAiStore((s) => s.setModel)
  const setAutoApprove = useAiStore((s) => s.setAutoApprove)
  const restartServer = useAiStore((s) => s.restartServer)

  const [text, setText] = useState('')
  const [expanded, setExpanded] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!enabled || !current) return
    void loadSessions(current)
  }, [enabled, current, loadSessions])

  // Sessões são por repo: trocou de repositório, zera a conversa (e reabilita
  // o auto-select, que é "uma vez" por repo — daí resetar a flag aqui).
  const resetConversation = useAiStore((s) => s.resetConversation)
  useEffect(() => {
    autoRef.current = false
    resetConversation()
  }, [current, resetConversation])

  // Sem sessão selecionada: escolhe a mais recente ou cria uma nova (uma vez).
  const autoRef = useRef(false)
  useEffect(() => {
    if (!enabled || !current || sessionID || autoRef.current) return
    if (sessions.length > 0) {
      autoRef.current = true
      void selectSession(sessions[0].id, current)
    } else if (!busy) {
      autoRef.current = true
      void newSession(current)
    }
  }, [enabled, current, sessionID, sessions, busy, selectSession, newSession])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  const modelValue = model ? `${model.providerID}/${model.modelID}` : ''
  const modelLabel = useMemo(() => {
    if (!model) return tr('ai.modelDefault')
    const found = models.find((m) => m.providerID === model.providerID && m.modelID === model.modelID)
    return found ? `${found.providerName} · ${found.name}` : model.modelID
  }, [model, models, tr])

  const doSend = (): void => {
    const t = text.trim()
    if (!t || !current || !sessionID || busy) return
    setText('')
    void send(current, t)
  }

  return (
    <>
      {expanded && <div className="pane-backdrop" onClick={() => setExpanded(false)} />}
      <div className={`assistant-drawer expandable${expanded ? ' expanded' : ''}`}>
        <div className="assistant-head">
          <Bot size={14} className="ai-head-icon" />
          <span className="terminal-title">{tr('ai.panelTitle')}</span>
          <select
            className="ai-select"
            value={sessionID ?? ''}
            onChange={(e) => current && e.target.value && void selectSession(e.target.value, current)}
            title={tr('ai.session')}
          >
            <option value="">{tr('ai.sessionNone')}</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title || s.id.slice(0, 12)}
              </option>
            ))}
          </select>
          <button className="mini-btn" title={tr('ai.newSession')} onClick={() => current && void newSession(current)}>
            <Plus size={13} />
          </button>
          <span className="ai-head-spacer" />
          <span className={`ai-server ${server.running ? 'on' : 'off'}`} title={server.url ?? server.error ?? ''}>
            {server.running ? tr('ai.serverOn') : tr('ai.serverOff')}
          </span>
          {enabled && (
            <button className="pane-expand" title={tr('ai.restartServer')} onClick={() => void restartServer()}>
              <RotateCcw size={13} />
            </button>
          )}
          <button
            className="pane-expand"
            title={expanded ? tr('det.collapse') : tr('det.expand')}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button className="pane-expand" title={tr('dlg.close')} onClick={() => setOpen(false)}>
            <X size={14} />
          </button>
        </div>

        {!enabled ? (
          <div className="assistant-note">{tr('ai.panelDisabled')}</div>
        ) : (
          <>
            <div className="assistant-body" ref={listRef}>
              {messages.length === 0 && <div className="assistant-note">{tr('ai.empty')}</div>}
              {messages.map((m) => (
                <MessageView key={m.id} msg={m} tr={tr} />
              ))}
              {busy && (
                <div className="ai-typing">
                  <Loader2 size={13} className="ai-spin" /> {tr('ai.thinking')}
                </div>
              )}
            </div>

            {permissions.length > 0 && (
              <div className="ai-permission" role="alert">
                <ShieldAlert size={15} />
                <div className="ai-permission-body">
                  <strong>{tr('ai.permTitle')}</strong>
                  {permissions.map((p) => (
                    <div key={p.id} className="ai-permission-item">
                      <code>{p.title}</code>
                      <span className="ai-permission-actions">
                        <button className="mini-btn" onClick={() => void replyPermission(p, 'once')}>
                          {tr('ai.permAllow')}
                        </button>
                        <button className="mini-btn" onClick={() => void replyPermission(p, 'always')}>
                          {tr('ai.permAlways')}
                        </button>
                        <button className="mini-btn" onClick={() => void replyPermission(p, 'reject')}>
                          {tr('ai.permDeny')}
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <div className="assistant-error">{error}</div>}

            <div className="assistant-foot">
              <textarea
                className="ai-input"
                placeholder={tr('ai.inputPh')}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    doSend()
                  }
                }}
                rows={2}
              />
              <div className="ai-controls">
                <select className="ai-select" value={agent} onChange={(e) => setAgent(e.target.value)} title={tr('ai.agent')}>
                  {agents.length === 0 && <option value={agent}>{agent}</option>}
                  {agents.map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <select
                  className="ai-select"
                  value={modelValue}
                  onChange={(e) => {
                    const [p, m] = e.target.value.split('/')
                    setModel(e.target.value ? { providerID: p, modelID: m } : null)
                  }}
                  title={modelLabel}
                >
                  <option value="">{tr('ai.modelDefault')}</option>
                  {models.map((m) => (
                    <option key={`${m.providerID}/${m.modelID}`} value={`${m.providerID}/${m.modelID}`}>
                      {m.providerName} · {m.name}
                    </option>
                  ))}
                </select>
                <label className="ai-auto" title={tr('ai.autoTitle')}>
                  <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} />
                  {tr('ai.auto')}
                </label>
                {busy ? (
                  <button className="tool-btn" onClick={() => void abort()} title={tr('ai.stop')}>
                    <Square size={13} /> {tr('ai.stop')}
                  </button>
                ) : (
                  <button
                    className="tool-btn primary"
                    onClick={doSend}
                    disabled={!text.trim() || !sessionID}
                    title={tr('ai.send')}
                  >
                    <Send size={13} /> {tr('ai.send')}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
