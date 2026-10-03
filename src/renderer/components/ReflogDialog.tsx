import { dialogOps, useStore } from '../store'
import Dialog, { useDialogRunner } from './Dialog'

/** Dialog Reflog: lista HEAD@{n} com Undo (hard-reset + backup bundle). */
export default function ReflogDialog() {
  const reflog = useStore((s) => s.reflog)
  const confirmAction = useStore((s) => s.confirmAction)
  const tr = useStore((s) => s.tr)
  const { busy, run } = useDialogRunner()

  const doUndo = (ref: string, hash: string): Promise<void> =>
    run(async () => {
      const ok = await confirmAction(
        tr('reflog.undoT'),
        tr('reflog.undoM', { n: `${ref} (${hash.slice(0, 7)})` }),
        tr('reflog.undoD'),
        tr('dlg.undo')
      )
      if (!ok) return false
      return dialogOps.undoToReflog(ref)
    })

  return (
    <Dialog title={tr('reflog.title')} wide>
      <p className="dlg-hint">{tr('reflog.backup')}</p>
      {reflog.length === 0 && <p className="muted">{tr('reflog.empty')}</p>}
      <div className="dlg-list" style={{ maxHeight: 320 }}>
        {reflog.map((e, i) => (
          <div key={`${e.ref}-${e.hash}-${i}`} className="dlg-row">
            <span className="grow">
              <span className="mono">{e.ref}</span> <span className="mono">{e.hash.slice(0, 7)}</span>{' '}
              <span className="sub">{e.message}</span>
            </span>
            <span className="dlg-actions">
              <button className="mini-btn" disabled={busy} onClick={() => void doUndo(e.ref, e.hash)}>
                {tr('dlg.undo')}
              </button>
            </span>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
