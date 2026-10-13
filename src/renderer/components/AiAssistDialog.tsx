import { useEffect, useRef } from 'react'
import { Clipboard, X } from 'lucide-react'
import { useAiStore } from '../ai-store'
import { useStore } from '../store'
import Dialog from './Dialog'

/**
 * Modal de sugestão do assistente (Fase 3, propose-only): mostra a mensagem de
 * commit ou a revisão gerada pelo opencode. "Usar como mensagem" preenche a
 * caixa de commit — o app NUNCA commita sozinho.
 */
export default function AiAssistDialog() {
  const tr = useStore((s) => s.tr)
  const setMessage = useStore((s) => s.setMessage)
  const copyText = useStore((s) => s.copyText)
  const open = useAiStore((s) => s.assistOpen)
  const kind = useAiStore((s) => s.assistKind)
  const text = useAiStore((s) => s.assistText)
  const loading = useAiStore((s) => s.assistLoading)
  const error = useAiStore((s) => s.assistError)
  const close = useAiStore((s) => s.closeAssist)
  const boxRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open && !loading && text) boxRef.current?.focus()
  }, [open, loading, text])

  if (!open) return null

  const title =
    kind === 'commit' ? tr('ai.assistCommit') : kind === 'review' ? tr('ai.assistReview') : tr('ai.explainConflict')

  return (
    <Dialog title={`${tr('ai.assistTitle')} — ${title}`}>
      {loading ? (
        <p className="dlg-hint">{tr('ai.thinking')}</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : (
        <textarea
          ref={boxRef}
          className="ai-assist-text"
          value={text}
          onChange={() => undefined}
          readOnly
          rows={Math.min(18, Math.max(4, text.split('\n').length + 1))}
        />
      )}
      <div className="modal-actions">
        {kind === 'commit' && !loading && !error && (
          <button
            className="tool-btn primary"
            onClick={() => {
              setMessage(text)
              close()
            }}
          >
            {tr('ai.useSuggestion')}
          </button>
        )}
        {!loading && !error && (
          <button className="tool-btn" onClick={() => copyText(text)}>
            <Clipboard size={13} /> {tr('ai.copySuggestion')}
          </button>
        )}
        <button className="tool-btn" onClick={close}>
          <X size={13} /> {tr('ai.closeSuggestion')}
        </button>
      </div>
    </Dialog>
  )
}
