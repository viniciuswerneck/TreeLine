import { useState } from 'react'
import { dialogOps, useStore } from '../store'
import Dialog, { useDialogRunner } from './Dialog'

/** Dialog Cherry-Pick: hash manual ou commit selecionado no histórico; continue/abort em conflito. */
export default function PickDialog() {
  const pickState = useStore((s) => s.pickState)
  const selectedCommit = useStore((s) => s.selectedCommit)
  const status = useStore((s) => s.status)
  const tr = useStore((s) => s.tr)
  const { busy, run } = useDialogRunner()
  const openResolver = useStore((s) => s.openResolver)
  const closeDlg = useStore((s) => s.closeDlg)
  const confirmAction = useStore((s) => s.confirmAction)

  const [hash, setHash] = useState(selectedCommit ?? '')

  if (pickState.inProgress) {
    const conflicted = status?.conflicted ?? []
    return (
      <Dialog title={tr('pick.title')}>
        <p className="dlg-hint">{tr('pick.inProg')}</p>
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
          {conflicted.length > 0 && (
            <button
              className="tool-btn primary"
              disabled={busy}
              onClick={() => {
                closeDlg()
                void openResolver()
              }}
            >
              {tr('cr.title')}
            </button>
          )}
          <button
            className="tool-btn"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const ok = await confirmAction(
                  tr('abort.confirmT'),
                  tr('abort.confirmM'),
                  tr('abort.confirmD'),
                  tr('dlg.abort')
                )
                if (!ok) return false
                await dialogOps.abortCherryPick()
                return false
              })
            }
          >
            {tr('dlg.abort')}
          </button>
          <button
            className="tool-btn primary"
            disabled={busy || conflicted.length > 0}
            title={conflicted.length > 0 ? tr('cr.markerLeft') : undefined}
            onClick={() => void run(() => dialogOps.cherryPickContinue())}
          >
            {busy ? tr('dlg.working') : tr('dlg.continue')}
          </button>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog title={tr('pick.title')}>
      <label className="field">
        <span>{tr('pick.hash')}</span>
        <input value={hash} onChange={(e) => setHash(e.target.value)} placeholder={tr('pick.hashPh')} autoFocus />
      </label>
      {selectedCommit && hash !== selectedCommit && (
        <div className="modal-actions" style={{ justifyContent: 'flex-start', marginBottom: 8 }}>
          <button className="mini-btn" onClick={() => setHash(selectedCommit)}>
            {tr('pick.useSelected')} ({selectedCommit.slice(0, 7)})
          </button>
        </div>
      )}
      <div className="modal-actions">
        <button
          className="tool-btn primary"
          disabled={busy || !hash.trim()}
          onClick={() => void run(() => dialogOps.cherryPick(hash.trim()))}
        >
          {busy ? tr('dlg.working') : tr('dlg.pick')}
        </button>
      </div>
    </Dialog>
  )
}
