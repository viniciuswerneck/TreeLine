import { useStore } from '../store'
import Dialog from './Dialog'
import DiffViewer from './DiffViewer'

/** Dialog Compare: resumo a…b, arquivos com stats (+a −d) e diff read-only do arquivo. */
export default function CompareDialog() {
  const compareA = useStore((s) => s.compareA)
  const compareB = useStore((s) => s.compareB)
  const compare = useStore((s) => s.compare)
  const compareFile = useStore((s) => s.compareFile)
  const compareDiffText = useStore((s) => s.compareDiffText)
  const selectCompareFile = useStore((s) => s.selectCompareFile)
  const clearCompare = useStore((s) => s.clearCompare)
  const closeDlg = useStore((s) => s.closeDlg)
  const tr = useStore((s) => s.tr)

  return (
    <Dialog title={tr('cmp.title')} wide>
      {compare === null ? (
        <p className="dlg-hint">{tr('cmp.pickHint')}</p>
      ) : (
        <>
          {compareA && compareB && (
            <p className="dlg-hint">
              <span className="mono">{compareA.slice(0, 7)}</span>
              {'…'}
              <span className="mono">{compareB.slice(0, 7)}</span>
            </p>
          )}
          <div className="dlg-list">
            {compare.files.map((f) => {
              const stat = compare.stats.find((s) => s.path === f)
              return (
                <div key={f} className="dlg-row" onClick={() => void selectCompareFile(f)}>
                  <span className="grow mono">{f}</span>
                  {stat && (
                    <span className="muted">
                      +{stat.added} −{stat.deleted}
                    </span>
                  )}
                  {compareFile === f && <span className="mono">›</span>}
                </div>
              )
            })}
          </div>
          {compareDiffText && <DiffViewer text={compareDiffText} />}
        </>
      )}
      <div className="modal-actions">
        <button
          className="tool-btn"
          onClick={() => {
            clearCompare()
            closeDlg()
          }}
        >
          {tr('cmp.clear')}
        </button>
      </div>
    </Dialog>
  )
}
