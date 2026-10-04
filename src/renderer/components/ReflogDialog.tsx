import { useEffect, useState } from 'react'
import type { BackupInfo } from '../../shared/types'
import { dialogOps, useStore } from '../store'
import Dialog, { useDialogRunner } from './Dialog'

/** Dialog Reflog: lista HEAD@{n} com Undo (hard-reset + backup bundle). */
export default function ReflogDialog() {
  const reflog = useStore((s) => s.reflog)
  const current = useStore((s) => s.current)
  const confirmAction = useStore((s) => s.confirmAction)
  const tr = useStore((s) => s.tr)
  const { busy, run } = useDialogRunner()

  const [backups, setBackups] = useState<BackupInfo[]>([])

  useEffect(() => {
    if (!current) return
    window.treeline.listBackups(current).then(setBackups).catch(() => setBackups([]))
  }, [current, reflog])

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

  const doRestore = (file: string): Promise<void> =>
    run(async () => {
      const ok = await confirmAction(
        tr('reflog.restoreT'),
        tr('reflog.restoreM', { n: file }),
        tr('reflog.restoreD'),
        tr('reflog.restore')
      )
      if (!ok) return false
      return dialogOps.restoreBackup(file)
    })

  const kb = (b: number): string => (b < 1024 ? `${b} B` : `${(b / 1024).toFixed(0)} KB`)

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

      <div className="dlg-section">{tr('reflog.backups')}</div>
      {backups.length === 0 && <p className="muted">{tr('reflog.backupsEmpty')}</p>}
      <div className="dlg-list">
        {backups.map((b) => (
          <div key={b.file} className="dlg-row">
            <span className="grow">
              <span className="mono">{b.file}</span>{' '}
              <span className="sub">
                {b.date.slice(0, 16).replace('T', ' ')} · {kb(b.size)}
              </span>
            </span>
            <span className="dlg-actions">
              <button className="mini-btn" disabled={busy} onClick={() => void doRestore(b.file)}>
                {tr('reflog.restore')}
              </button>
            </span>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
