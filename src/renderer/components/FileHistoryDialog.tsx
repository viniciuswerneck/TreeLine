import { useStore } from '../store'
import Dialog from './Dialog'

/** Dialog FileHistory: commits que tocaram o arquivo; clique vai ao commit. */
export default function FileHistoryDialog() {
  const fileHistory = useStore((s) => s.fileHistory)
  const fileHistoryPath = useStore((s) => s.fileHistoryPath)
  const closeFileHistory = useStore((s) => s.closeFileHistory)
  const selectCommit = useStore((s) => s.selectCommit)
  const closeDlg = useStore((s) => s.closeDlg)
  const tr = useStore((s) => s.tr)

  return (
    <Dialog title={tr('fhist.title')}>
      {fileHistoryPath && <p className="dlg-hint mono">{fileHistoryPath}</p>}
      {fileHistory.length === 0 ? (
        <p className="dlg-hint">{tr('fhist.empty')}</p>
      ) : (
        <div className="dlg-list">
          {fileHistory.map((h) => (
            <div
              key={h.hash}
              className="dlg-row"
              onClick={() => {
                void selectCommit(h.hash)
                closeFileHistory()
                closeDlg()
              }}
            >
              <span className="grow">{h.message}</span>
              <span className="muted">
                {h.author} · {h.date}
              </span>
              <span className="mono">{h.hash.slice(0, 7)}</span>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  )
}
