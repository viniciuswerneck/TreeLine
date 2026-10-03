import { useState } from 'react'
import { dialogOps, useStore } from '../store'
import Dialog, { useDialogRunner } from './Dialog'

/** Dialog Rebase simples (onto + continue/abort). Interativo completo é Fase 3. */
export default function RebaseDialog() {
  const branches = useStore((s) => s.branches)
  const status = useStore((s) => s.status)
  const rebaseState = useStore((s) => s.rebaseState)
  const tr = useStore((s) => s.tr)
  const { busy, run } = useDialogRunner()

  const others = branches.filter((b) => !b.current)
  const [ref, setRef] = useState(others[0]?.name ?? '')

  if (rebaseState.inProgress) {
    const target = rebaseState.target ? ` (${rebaseState.target})` : ''
    const conflicted = status?.conflicted ?? []
    return (
      <Dialog title={tr('rebase.title')}>
        <p className="dlg-hint">{tr('rebase.inProg', { f: target })}</p>
        <p className="dlg-hint">{tr('rebase.hint')}</p>
        {conflicted.length > 0 && (
          <div className="dlg-list">
            {conflicted.map((f) => (
              <div key={f} className="dlg-row">
                <span className="grow mono">{f}</span>
              </div>
            ))}
          </div>
        )}
        <p className="muted">{tr('op.conflicted', { n: conflicted.length })}</p>
        <div className="modal-actions">
          <button className="tool-btn" disabled={busy} onClick={() => void run(() => dialogOps.abortRebase())}>
            {tr('dlg.abort')}
          </button>
          <button className="tool-btn primary" disabled={busy} onClick={() => void run(() => dialogOps.rebaseContinue())}>
            {busy ? tr('dlg.working') : tr('dlg.continue')}
          </button>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog title={tr('rebase.title')}>
      <label className="field">
        <span>{tr('rebase.ref')}</span>
        <select value={ref} onChange={(e) => setRef(e.target.value)}>
          {others.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <p className="dlg-hint">{tr('rebase.hint')}</p>
      <div className="modal-actions">
        <button
          className="tool-btn primary"
          disabled={busy || !ref}
          onClick={() => void run(() => dialogOps.rebaseOnto(ref))}
        >
          {busy ? tr('dlg.working') : tr('rebase.start')}
        </button>
      </div>
    </Dialog>
  )
}
