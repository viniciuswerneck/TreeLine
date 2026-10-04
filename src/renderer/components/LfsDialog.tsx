import { useState } from 'react'
import { dialogOps, useStore } from '../store'
import Dialog, { useDialogRunner } from './Dialog'

/** Dialog LFS: status, pull/push, track/untrack de padrões. */
export default function LfsDialog() {
  const lfs = useStore((s) => s.lfs)
  const refresh = useStore((s) => s.refresh)
  const closeDlg = useStore((s) => s.closeDlg)
  const confirmAction = useStore((s) => s.confirmAction)
  const tr = useStore((s) => s.tr)
  const { busy, run } = useDialogRunner()

  const [pattern, setPattern] = useState('')

  if (!lfs) {
    return (
      <Dialog title={tr('lfs.title')}>
        <p className="muted">{tr('dlg.working')}</p>
      </Dialog>
    )
  }

  const doUntrack = (p: string): Promise<void> =>
    run(async () => {
      const ok = await confirmAction(
        tr('lfs.untrackT'),
        tr('lfs.untrackM', { pattern: p }),
        tr('lfs.untrackD'),
        tr('lfs.untrack')
      )
      if (!ok) return false
      const done = await dialogOps.lfsUntrack(p)
      if (done) void refresh()
      return done
    })

  return (
    <Dialog title={tr('lfs.title')}>
      <div className="dlg-section">{tr('lfs.status')}</div>
      <div className="dlg-list">
        <div className="dlg-row">
          <span className="grow">{tr('lfs.installed')}</span>
          <span className="mono">{lfs.installed ? tr('lfs.yes') : tr('lfs.no')}</span>
        </div>
        <div className="dlg-row">
          <span className="grow">{tr('lfs.tracked')}</span>
          <span className="mono">{lfs.tracked ? tr('lfs.yes') : tr('lfs.no')}</span>
        </div>
        <div className="dlg-row">
          <span className="grow">{tr('lfs.files', { n: lfs.files })}</span>
          <span className="mono">{lfs.files}</span>
        </div>
      </div>

      {!lfs.installed && <p className="dlg-hint">{tr('lfs.notInstalled')}</p>}

      <div className="modal-actions" style={{ marginBottom: 8 }}>
        <button
          className="tool-btn"
          disabled={busy || !lfs.installed}
          onClick={() => void run(() => dialogOps.lfsPull()).then(() => refresh())}
        >
          {tr('lfs.pull')}
        </button>
        <button
          className="tool-btn primary"
          disabled={busy || !lfs.installed}
          onClick={() => void run(() => dialogOps.lfsPush()).then(() => refresh())}
        >
          {tr('lfs.push')}
        </button>
      </div>

      <div className="dlg-section">{tr('lfs.patterns')}</div>
      {lfs.patterns.length === 0 && <p className="muted">{tr('lfs.noPatterns')}</p>}
      <div className="dlg-list">
        {lfs.patterns.map((p) => (
          <div key={p} className="dlg-row">
            <span className="grow mono">{p}</span>
            <span className="dlg-actions">
              <button className="mini-btn" disabled={busy || !lfs.installed} onClick={() => void doUntrack(p)}>
                {tr('lfs.untrack')}
              </button>
            </span>
          </div>
        ))}
      </div>

      <label className="field">
        <span>{tr('lfs.newPattern')}</span>
        <input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder={tr('lfs.patternPh')}
        />
      </label>
      <div className="modal-actions">
        <button className="tool-btn" onClick={closeDlg}>
          {tr('settings.close')}
        </button>
        <button
          className="tool-btn primary"
          disabled={busy || !lfs.installed || !pattern.trim()}
          onClick={() =>
            void run(() => dialogOps.lfsTrack(pattern.trim())).then(() => {
              setPattern('')
              refresh()
            })
          }
        >
          {busy ? tr('dlg.working') : tr('lfs.track')}
        </button>
      </div>
      <p className="dlg-hint">{tr('lfs.trackHint')}</p>
    </Dialog>
  )
}