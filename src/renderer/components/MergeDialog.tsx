import { useEffect, useState } from 'react'
import type { MergePreview } from '../../shared/types'
import { dialogOps, useStore } from '../store'
import Dialog, { useDialogRunner } from './Dialog'

/** Dialog Merge: preview (commits + arquivos) e merge plain/--no-ff; continua/aborta merge em conflito. */
export default function MergeDialog() {
  const branches = useStore((s) => s.branches)
  const status = useStore((s) => s.status)
  const mergeState = useStore((s) => s.mergeState)
  const tr = useStore((s) => s.tr)
  const { busy, run } = useDialogRunner()

  const others = branches.filter((b) => !b.current)
  const [ref, setRef] = useState(others[0]?.name ?? '')
  const [noFf, setNoFf] = useState(false)
  const [preview, setPreview] = useState<MergePreview | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)

  useEffect(() => {
    const current = useStore.getState().current
    if (!current || !ref || mergeState.inProgress) {
      setPreview(null)
      return
    }
    setPreviewBusy(true)
    window.treeline
      .mergePreview(current, ref)
      .then(setPreview)
      .catch(() => setPreview(null))
      .finally(() => setPreviewBusy(false))
  }, [ref, mergeState.inProgress])

  if (mergeState.inProgress) {
    const target = mergeState.target ? ` (${mergeState.target})` : ''
    const conflicted = status?.conflicted ?? []
    return (
      <Dialog title={tr('merge.title')}>
        <p className="dlg-hint">{tr('merge.inProg', { f: target })}</p>
        <p className="dlg-hint">{tr('merge.conflictHint')}</p>
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
          <button className="tool-btn" disabled={busy} onClick={() => void run(() => dialogOps.abortMerge())}>
            {tr('dlg.abort')}
          </button>
          <button className="tool-btn primary" disabled={busy} onClick={() => void run(() => dialogOps.mergeContinue())}>
            {busy ? tr('dlg.working') : tr('dlg.continue')}
          </button>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog title={tr('merge.title')}>
      <label className="field">
        <span>{tr('merge.ref')}</span>
        <select value={ref} onChange={(e) => setRef(e.target.value)}>
          {others.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="check-row" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={noFf} onChange={(e) => setNoFf(e.target.checked)} />
        <span className="grow">{tr('merge.noFf')}</span>
      </label>
      <div className="dlg-section">{tr('merge.preview')}</div>
      {previewBusy && <p className="muted">{tr('dlg.working')}</p>}
      {!previewBusy && preview && preview.commits === 0 && preview.files.length === 0 && (
        <p className="muted">{tr('merge.none')}</p>
      )}
      {!previewBusy && preview && (preview.commits > 0 || preview.files.length > 0) && (
        <>
          <p className="muted">
            {tr('merge.commits', { n: preview.commits })} · {tr('merge.files', { n: preview.files.length })}
          </p>
          <div className="dlg-list">
            {preview.files.map((f) => (
              <div key={f} className="dlg-row">
                <span className="grow mono">{f}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="modal-actions">
        <button
          className="tool-btn primary"
          disabled={busy || !ref}
          onClick={() => void run(() => dialogOps.mergeBranch(ref, noFf))}
        >
          {busy ? tr('dlg.working') : tr('dlg.merge')}
        </button>
      </div>
    </Dialog>
  )
}
