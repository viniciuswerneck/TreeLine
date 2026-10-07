import { useEffect, useState } from 'react'
import { dialogOps, useStore } from '../store'
import Dialog, { useDialogRunner } from './Dialog'

/** Dialog Branch: criar (de branch/HEAD + checkout opcional) + lista com checkout/rename/delete. */
export default function BranchDialog() {
  const branches = useStore((s) => s.branches)
  const status = useStore((s) => s.status)
  const refPreset = useStore((s) => s.refPreset)
  const setRefPreset = useStore((s) => s.setRefPreset)
  const confirmAction = useStore((s) => s.confirmAction)
  const tr = useStore((s) => s.tr)
  const { busy, run } = useDialogRunner()

  const [name, setName] = useState('')
  const [from, setFrom] = useState(refPreset ?? status?.branch ?? 'HEAD')
  const [checkout, setCheckout] = useState(true)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [forceCandidate, setForceCandidate] = useState<string | null>(null)

  // Preset consumido uma vez (ex: "create branch here" no grafo).
  useEffect(() => () => setRefPreset(null), [setRefPreset])
  const fromOptions = refPreset && !branches.some((b) => b.name === refPreset) ? [refPreset, 'HEAD', ...branches.map((b) => b.name)] : ['HEAD', ...branches.map((b) => b.name)]

  const doDelete = (branch: string, force: boolean): Promise<void> =>
    run(async () => {
      const ok = await confirmAction(
        tr('branch.delT'),
        tr('branch.delM', { n: branch }),
        force ? tr('branch.delD') : tr('branch.delSafeD'),
        force ? tr('dlg.force') : tr('dlg.delete')
      )
      if (!ok) return false
      const done = await dialogOps.deleteBranch(branch, force)
      if (!done) {
        const err = useStore.getState().error ?? ''
        if (!force && /not fully merged/i.test(err)) setForceCandidate(branch)
        return false
      }
      setForceCandidate(null)
      return true
    })

  return (
    <Dialog title={tr('branch.title')} wide>
      <div className="field-row">
        <label className="field">
          <span>{tr('branch.name')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('branch.namePh')} autoFocus />
        </label>
        <label className="field">
          <span>{tr('branch.from')}</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {fromOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="check-row" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={checkout} onChange={(e) => setCheckout(e.target.checked)} />
        <span className="grow">{tr('branch.checkoutNow')}</span>
      </label>
      <div className="modal-actions">
        <button
          className="tool-btn primary"
          disabled={busy || !name.trim()}
          onClick={() => void run(() => dialogOps.createBranch(name.trim(), from, checkout))}
        >
          {busy ? tr('dlg.working') : tr('dlg.create')}
        </button>
      </div>

      <div className="dlg-section">{tr('branch.list')}</div>
      <div className="dlg-list">
        {branches.map((b) => (
          <div key={b.name} className="dlg-row">
            <span className="grow">
              {b.name} {b.current && <span className="sub">({tr('branch.current')})</span>}
            </span>
            {renaming === b.name ? (
              <span className="dlg-inline">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={tr('branch.renamePh')}
                  autoFocus
                />
                <button
                  className="mini-btn"
                  disabled={busy || !newName.trim()}
                  onClick={() => void run(() => dialogOps.renameBranch(b.name, newName.trim()))}
                >
                  {tr('dlg.rename')}
                </button>
                <button className="mini-btn" onClick={() => setRenaming(null)}>
                  {tr('dlg.cancel')}
                </button>
              </span>
            ) : (
              <span className="dlg-actions">
                {!b.current && (
                  <button className="mini-btn" disabled={busy} onClick={() => void run(() => dialogOps.checkoutBranch(b.name))}>
                    {tr('dlg.checkout')}
                  </button>
                )}
                <button
                  className="mini-btn"
                  disabled={busy}
                  onClick={() => {
                    setRenaming(b.name)
                    setNewName(b.name)
                  }}
                >
                  {tr('dlg.rename')}
                </button>
                {!b.current && (
                  <button className="mini-btn" disabled={busy} onClick={() => void doDelete(b.name, false)}>
                    {tr('dlg.delete')}
                  </button>
                )}
                {forceCandidate === b.name && (
                  <button className="mini-btn" disabled={busy} onClick={() => void doDelete(b.name, true)}>
                    {tr('dlg.force')}
                  </button>
                )}
              </span>
            )}
          </div>
        ))}
      </div>
    </Dialog>
  )
}
