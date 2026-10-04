import { useStore } from '../store'
import Dialog from './Dialog'

/** Dialog Blame: linhas do arquivo com hash clicável (vai ao commit). */
export default function BlameDialog() {
  const blame = useStore((s) => s.blame)
  const blameFile = useStore((s) => s.blameFile)
  const closeBlame = useStore((s) => s.closeBlame)
  const selectCommit = useStore((s) => s.selectCommit)
  const closeDlg = useStore((s) => s.closeDlg)
  const tr = useStore((s) => s.tr)

  return (
    <Dialog title={tr('blame.title')} wide>
      {blameFile && <p className="dlg-hint mono">{blameFile}</p>}
      {blame.length === 0 ? (
        <p className="dlg-hint">{tr('blame.empty')}</p>
      ) : (
        <div className="dlg-list">
          {blame.map((b) => (
            <div key={b.line} className="dlg-row">
              <span className="muted">{b.line}</span>
              <button
                className="mini-btn mono"
                onClick={() => {
                  void selectCommit(b.hash)
                  closeBlame()
                  closeDlg()
                }}
              >
                {b.hash.slice(0, 7)}
              </button>
              <span className="muted">{b.author}</span>
              <span className="grow">{b.content}</span>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  )
}
