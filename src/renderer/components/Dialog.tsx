import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { useFocusTrap } from '../lib/a11y'

/**
 * Shell dos dialogs de operação: backdrop, Esc/X fecha, erro do store.
 * Sucesso fecha via `run` (só fecha quando a op retorna true).
 * Tab circula dentro (focus trap) e Esc fecha só se este for o overlay de cima.
 */
export default function Dialog({ title, wide, children }: { title: string; wide?: boolean; children: React.ReactNode }) {
  const closeDlg = useStore((s) => s.closeDlg)
  const error = useStore((s) => s.error)
  const tr = useStore((s) => s.tr)
  const modalRef = useRef<HTMLDivElement>(null)
  useFocusTrap(modalRef)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      // Um confirm ou menu de contexto aberto por cima é quem fecha no Esc.
      const st = useStore.getState()
      if (st.confirmState || st.menu) return
      closeDlg()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeDlg])

  return (
    <div className="modal-backdrop" onClick={closeDlg}>
      <div
        ref={modalRef}
        className={wide ? 'modal wide' : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="modal-x" title={tr('dlg.close')} onClick={closeDlg} aria-label={tr('dlg.close')}>
            <X size={16} />
          </button>
        </div>
        {children}
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  )
}

export function useDialogRunner(): { busy: boolean; run: (fn: () => Promise<boolean>) => Promise<void> } {
  const closeDlg = useStore((s) => s.closeDlg)
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<boolean>): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      if (await fn()) closeDlg()
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}
