import { Sparkles, X } from 'lucide-react'
import { useStore } from '../store'
import { shouldSuggest, useAiStore } from '../ai-store'

/** Banner dispensável: opencode instalado, assistente ainda desligado. */
export default function AiSuggestion() {
  const tr = useStore((s) => s.tr)
  const status = useAiStore((s) => s.status)
  const enabled = useAiStore((s) => s.enabled)
  const dismissed = useAiStore((s) => s.suggestionDismissed)
  const setEnabled = useAiStore((s) => s.setEnabled)
  const dismiss = useAiStore((s) => s.dismissSuggestion)

  if (!shouldSuggest(status, enabled, dismissed)) return null

  return (
    <div className="ai-suggest" role="status">
      <Sparkles size={16} className="ai-suggest-icon" aria-hidden="true" />
      <div className="ai-suggest-body">
        <strong>{tr('ai.suggest.title')}</strong>
        <span className="muted">{tr('ai.suggest.msg')}</span>
      </div>
      <button className="tool-btn primary" onClick={() => setEnabled(true)}>
        {tr('ai.suggest.enable')}
      </button>
      <button
        className="mini-btn"
        title={tr('ai.suggest.dismiss')}
        aria-label={tr('ai.suggest.dismiss')}
        onClick={dismiss}
      >
        <X size={14} />
      </button>
    </div>
  )
}
