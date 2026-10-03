import { useState } from 'react'
import { dialogOps, useStore } from '../store'
import Dialog, { useDialogRunner } from './Dialog'

/** Dialog Stash: criar (msg + untracked) + lista com apply/pop/drop. */
export default function StashDialog() {
  const stashes = useStore((s) => s.stashes)
  const status = useStore((s) => s.status)
  const confirmAction = useStore((s) => s.confirmAction)
  const tr = useStore((s) => s.tr)
  const { busy, run } = useDialogRunner()

  const [message, setMessage] = useState('')
  const [untracked, setUntracked] = useState(false)

  const dirty =
    (status?.unstaged.length ?? 0) + (status?.staged.length ?? 0) + (status?.untracked.length ?? 0)

  const doDrop = (ref: string): Promise<void> =>
    run(async () => {
      const ok = await confirmAction(tr('stash.dropT'), tr('stash.dropM', { n: ref }), tr('stash.dropD'), tr('dlg.drop'))
      if (!ok) return false
      return dialogOps.dropStash(ref)
    })

  return (
    <Dialog title={tr('stash.title')} wide>
      <label className="field">
        <span>{tr('stash.message')}</span>
        <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder={tr('stash.messagePh')} autoFocus />
      </label>
      <label className="check-row" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={untracked} onChange={(e) => setUntracked(e.target.checked)} />
        <span className="grow">{tr('stash.untracked')}</span>
      </label>
      <div className="modal-actions">
        <button
          className="tool-btn primary"
          disabled={busy || dirty === 0}
          onClick={() => void run(() => dialogOps.createStash(message, untracked))}
        >
          {busy ? tr('dlg.working') : tr('dlg.create')}
        </button>
      </div>

      <div className="dlg-section">{tr('stash.list')}</div>
      {stashes.length === 0 && <p className="muted">{tr('stash.empty')}</p>}
      <div className="dlg-list">
        {stashes.map((st) => (
          <div key={st.ref} className="dlg-row">
            <span className="grow">
              <span className="mono">{st.ref}</span> <span className="sub">{st.message}</span>
            </span>
            <span className="dlg-actions">
              <button className="mini-btn" disabled={busy} onClick={() => void run(() => dialogOps.applyStash(st.ref))}>
                {tr('dlg.apply')}
              </button>
              <button className="mini-btn" disabled={busy} onClick={() => void run(() => dialogOps.popStash(st.ref))}>
                {tr('dlg.pop')}
              </button>
              <button className="mini-btn" disabled={busy} onClick={() => void doDrop(st.ref)}>
                {tr('dlg.drop')}
              </button>
            </span>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
