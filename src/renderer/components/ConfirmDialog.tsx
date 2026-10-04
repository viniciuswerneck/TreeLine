import { useEffect } from 'react'
import { useStore } from '../store'

/**
 * Modal de confirmação interno (substitui o dialog nativo do SO):
 * title + message + detail + [Cancel | ok]. Esc/backdrop/X = cancelar.
 * Aberto via `confirmAction()` do store, que resolve a Promise.
 */
export default function ConfirmDialog() {
  const confirmState = useStore((s) => s.confirmState)
  const resolveConfirm = useStore((s) => s.resolveConfirm)
  const tr = useStore((s) => s.tr)

  useEffect(() => {
    if (!confirmState) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') resolveConfirm(false)
      if (e.key === 'Enter') resolveConfirm(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmState, resolveConfirm])

  if (!confirmState) return null
  return (
    <div className="modal-backdrop confirm-backdrop" onClick={() => resolveConfirm(false)}>
      <div className="modal" role="alertdialog" aria-label={confirmState.title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{confirmState.title}</h2>
        </div>
        <p className="confirm-msg">{confirmState.message}</p>
        {confirmState.detail && <p className="dlg-hint">{confirmState.detail}</p>}
        <div className="modal-actions">
          <button className="tool-btn" onClick={() => resolveConfirm(false)}>
            {tr('dlg.cancel')}
          </button>
          <button className="tool-btn primary" autoFocus onClick={() => resolveConfirm(true)}>
            {confirmState.ok}
          </button>
        </div>
      </div>
    </div>
  )
}
