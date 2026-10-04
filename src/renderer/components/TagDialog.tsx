import { useEffect, useState } from 'react'
import { dialogOps, useStore } from '../store'
import Dialog, { useDialogRunner } from './Dialog'

/** Dialog Tag: criar (annotated se mensagem) + lista com push/delete. */
export default function TagDialog() {
  const tags = useStore((s) => s.tags)
  const selectedCommit = useStore((s) => s.selectedCommit)
  const refPreset = useStore((s) => s.refPreset)
  const setRefPreset = useStore((s) => s.setRefPreset)
  const confirmAction = useStore((s) => s.confirmAction)
  const tr = useStore((s) => s.tr)
  const { busy, run } = useDialogRunner()

  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [commit, setCommit] = useState(refPreset ?? selectedCommit ?? '')

  useEffect(() => () => setRefPreset(null), [setRefPreset])
  const [remoteToo, setRemoteToo] = useState(false)

  const doDelete = (tag: string): Promise<void> =>
    run(async () => {
      const ok = await confirmAction(tr('tag.delT'), tr('tag.delM', { n: tag }), tr('tag.delD'), tr('dlg.delete'))
      if (!ok) return false
      return dialogOps.deleteTag(tag, remoteToo)
    })

  return (
    <Dialog title={tr('tag.title')} wide>
      <div className="field-row">
        <label className="field">
          <span>{tr('tag.name')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('tag.namePh')} autoFocus />
        </label>
        <label className="field">
          <span>{tr('tag.commit')}</span>
          <input
            value={commit}
            onChange={(e) => setCommit(e.target.value)}
            placeholder={selectedCommit?.slice(0, 7) ?? tr('tag.commitPh')}
          />
        </label>
      </div>
      <label className="field">
        <span>{tr('tag.message')}</span>
        <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder={tr('tag.messagePh')} />
      </label>
      <div className="modal-actions">
        <button
          className="tool-btn primary"
          disabled={busy || !name.trim()}
          onClick={() => void run(() => dialogOps.createTag(name.trim(), message, commit))}
        >
          {busy ? tr('dlg.working') : tr('dlg.create')}
        </button>
      </div>

      <div className="dlg-section">{tr('tag.list')}</div>
      {tags.length === 0 && <p className="muted">{tr('tag.empty')}</p>}
      <label className="check-row" style={{ marginBottom: 6 }}>
        <input type="checkbox" checked={remoteToo} onChange={(e) => setRemoteToo(e.target.checked)} />
        <span className="grow">{tr('tag.remoteToo')}</span>
      </label>
      <div className="dlg-list">
        {tags.map((t) => (
          <div key={t.name} className="dlg-row">
            <span className="grow">
              <span className="mono">{t.name}</span> <span className="sub">{t.date}</span>
            </span>
            <span className="dlg-actions">
              <button className="mini-btn" disabled={busy} onClick={() => void run(() => dialogOps.pushTag(t.name))}>
                {tr('dlg.push')}
              </button>
              <button className="mini-btn" disabled={busy} onClick={() => void doDelete(t.name)}>
                {tr('dlg.delete')}
              </button>
            </span>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
