import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import Dialog from './Dialog'

/** Dialog FileHistory: commits que tocaram o arquivo; timeline com datas (recent→antigo). */
export default function FileHistoryDialog() {
  const fileHistory = useStore((s) => s.fileHistory)
  const fileHistoryPath = useStore((s) => s.fileHistoryPath)
  const closeFileHistory = useStore((s) => s.closeFileHistory)
  const selectCommit = useStore((s) => s.selectCommit)
  const loadCommitDiffFile = useStore((s) => s.loadCommitDiffFile)
  const closeDlg = useStore((s) => s.closeDlg)
  const openDlg = useStore((s) => s.openDlg)
  const tr = useStore((s) => s.tr)
  const [showDiff, setShowDiff] = useState<string | null>(null)
  const [diffText, setDiffText] = useState('')

  const sorted = useMemo(() => {
    const arr = [...fileHistory]
    arr.sort((a, b) => {
      const da = new Date(a.date).getTime()
      const db = new Date(b.date).getTime()
      if (Number.isNaN(db) && Number.isNaN(da)) return 0
      if (Number.isNaN(db)) return -1
      if (Number.isNaN(da)) return 1
      return db - da
    })
    return arr
  }, [fileHistory])

  useEffect(() => {
    if (!showDiff || !fileHistoryPath) return
    let cancel = false
    setDiffText('')
    void loadCommitDiffFile(showDiff, fileHistoryPath).then((t) => {
      if (!cancel) setDiffText(t)
    })
    return () => {
      cancel = true
    }
  }, [showDiff, fileHistoryPath, loadCommitDiffFile])

  return (
    <Dialog title={tr('fhist.title')} wide>
      {fileHistoryPath && <p className="dlg-hint mono">{fileHistoryPath}</p>}
      {sorted.length === 0 ? (
        <p className="dlg-hint">{tr('fhist.empty')}</p>
      ) : (
        <div className="dlg-list fhist-large" style={{ maxHeight: '80vh', overflow: 'auto' }}>
          {sorted.map((h) => (
            <div key={h.hash} className="fhist-item">
              <div
                className="dlg-row fhist-row"
                onClick={() => {
                  void selectCommit(h.hash)
                  closeFileHistory()
                  closeDlg()
                }}
              >
                <span className="grow">{h.message}</span>
                <span className="muted">
                  {h.author} · {h.date}
                  {h.refs ? ` · ${h.refs}` : ''}
                </span>
                <span className="mono">{h.hash.slice(0, 7)}</span>
              </div>
              <button
                className="btn mini"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowDiff((cur) => (cur === h.hash ? null : h.hash))
                }}
              >
                {showDiff === h.hash ? 'Ocultar alteração' : 'Ver alteração'}
              </button>
              {showDiff === h.hash && (
                <pre className="fhist-diff">{diffText || 'Carregando...'}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  )
}
