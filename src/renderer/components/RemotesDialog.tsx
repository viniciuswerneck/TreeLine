import { useState } from 'react'
import { dialogOps, useStore } from '../store'
import Dialog, { useDialogRunner } from './Dialog'

/** Dialog Remotes: listar/adicionar/editar/remover + Clone por URL + Init local. */
export default function RemotesDialog() {
  const remotes = useStore((s) => s.remotes)
  const confirmAction = useStore((s) => s.confirmAction)
  const cloneRepo = useStore((s) => s.cloneRepo)
  const initRepo = useStore((s) => s.initRepo)
  const doPushForce = useStore((s) => s.doPushForce)
  const doFetch = useStore((s) => s.doFetch)
  const closeDlg = useStore((s) => s.closeDlg)
  const tr = useStore((s) => s.tr)
  const { busy, run } = useDialogRunner()

  const [name, setName] = useState('origin')
  const [url, setUrl] = useState('')
  const [cloneUrl, setCloneUrl] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editUrl, setEditUrl] = useState('')

  const doRemove = (remote: string): Promise<void> =>
    run(async () => {
      const ok = await confirmAction(
        tr('remotes.delT'),
        tr('remotes.delM', { n: remote }),
        tr('remotes.delD'),
        tr('dlg.remove')
      )
      if (!ok) return false
      return dialogOps.removeRemote(remote)
    })

  return (
    <Dialog title={tr('remotes.title')} wide>
      <div className="dlg-section">{tr('remotes.list')}</div>
      {remotes.length === 0 && <p className="muted">{tr('remotes.empty')}</p>}
      <div className="dlg-list">
        {remotes.map((r) => (
          <div key={r.name} className="dlg-row">
            <span className="grow">
              <span className="mono">{r.name}</span> <span className="sub">{r.url}</span>
            </span>
            {editing === r.name ? (
              <span className="dlg-inline">
                <input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder={tr('remotes.urlPh')} />
                <button
                  className="mini-btn"
                  disabled={busy || !editUrl.trim()}
                  onClick={() =>
                    void run(() => dialogOps.editRemote(r.name, editUrl.trim())).then(() => setEditing(null))
                  }
                >
                  {tr('dlg.save')}
                </button>
                <button className="mini-btn" onClick={() => setEditing(null)}>
                  {tr('dlg.cancel')}
                </button>
              </span>
            ) : (
              <span className="dlg-actions">
                <button
                  className="mini-btn"
                  disabled={busy}
                  onClick={() => {
                    setEditing(r.name)
                    setEditUrl(r.url)
                  }}
                >
                  {tr('remotes.editUrl')}
                </button>
                <button className="mini-btn" disabled={busy} onClick={() => void doRemove(r.name)}>
                  {tr('dlg.remove')}
                </button>
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="modal-actions" style={{ marginBottom: 8 }}>
        <button
          className="tool-btn"
          title={tr('remotes.openPR')}
          onClick={() => {
            closeDlg()
            void dialogOps.openPR()
          }}
        >
          {tr('menu.openPR')}
        </button>
        <button
          className="tool-btn"
          title={tr('remotes.pushLease')}
          onClick={() => {
            closeDlg()
            void doPushForce()
          }}
        >
          {tr('menu.pushLease')}
        </button>
        <button
          className="tool-btn"
          title={tr('toolbar.fetchFrom')}
          onClick={() => {
            closeDlg()
            void doFetch()
          }}
        >
          {tr('toolbar.fetch')}
        </button>
      </div>

      <div className="field-row">
        <label className="field">
          <span>{tr('remotes.name')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('remotes.namePh')} />
        </label>
        <label className="field">
          <span>{tr('remotes.url')}</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={tr('remotes.urlPh')} />
        </label>
      </div>
      <div className="modal-actions" style={{ marginBottom: 8 }}>
        <button
          className="tool-btn"
          disabled={busy || !name.trim() || !url.trim()}
          onClick={() => void run(() => dialogOps.addRemote(name.trim(), url.trim()))}
        >
          {busy ? tr('dlg.working') : tr('dlg.add')}
        </button>
      </div>

      <div className="dlg-section">{tr('dlg.clone')}</div>
      <label className="field">
        <input value={cloneUrl} onChange={(e) => setCloneUrl(e.target.value)} placeholder={tr('remotes.cloneUrlPh')} />
      </label>
      <div className="modal-actions" style={{ marginBottom: 8 }}>
        <button className="tool-btn" disabled={busy} onClick={() => void run(() => initRepo())}>
          {tr('dlg.init')}
        </button>
        <button
          className="tool-btn primary"
          disabled={busy || !cloneUrl.trim()}
          onClick={() => void run(() => cloneRepo(cloneUrl.trim()))}
        >
          {busy ? tr('dlg.working') : tr('dlg.clone')}
        </button>
      </div>
      <p className="dlg-hint">{tr('remotes.initHint')}</p>
    </Dialog>
  )
}
