import { ArrowLeft } from 'lucide-react'
import { forwardRef, useEffect, useState } from 'react'
import { useStore } from '../store'
import { RefBadge, visibleRefs } from './HistoryGraph'

/**
 * Painel inferior estilo SourceTree: listas Unstaged | Staged lado a lado,
 * diff ao lado e commit box sempre visível embaixo (stage → mensagem → Commit
 * na mesma tela, sem trocar de aba).
 */
const DetailsPanel = forwardRef<HTMLTextAreaElement>(function DetailsPanel(_, commitRef) {
  const status = useStore((s) => s.status)
  const selectedFile = useStore((s) => s.selectedFile)
  const diff = useStore((s) => s.diff)
  const message = useStore((s) => s.message)
  const amend = useStore((s) => s.amend)
  const error = useStore((s) => s.error)
  const selectFile = useStore((s) => s.selectFile)
  const stageSelected = useStore((s) => s.stageSelected)
  const unstageSelected = useStore((s) => s.unstageSelected)
  const stageAll = useStore((s) => s.stageAll)
  const unstageAll = useStore((s) => s.unstageAll)
  const setMessage = useStore((s) => s.setMessage)
  const setAmend = useStore((s) => s.setAmend)
  const doCommit = useStore((s) => s.doCommit)

  const unstaged = status?.unstaged ?? []
  const staged = status?.staged ?? []
  const untracked = status?.untracked ?? []
  // Sem nada em stage (e sem Amend), Commit não tem o que fazer:
  // desabilita em vez de deixar estourar erro.
  const canCommit = message.trim().length > 0 && (staged.length > 0 || amend)

  const selectedCommit = useStore((s) => s.selectedCommit)
  const commitDetail = useStore((s) => s.commitDetail)
  const commitDiff = useStore((s) => s.commitDiff)
  const selectCommit = useStore((s) => s.selectCommit)
  const selectCommitFile = useStore((s) => s.selectCommitFile)
  const [commitFile, setCommitFile] = useState<string | null>(null)

  useEffect(() => {
    setCommitFile(null)
  }, [selectedCommit])

  // Vista de commit selecionado no histórico: meta + arquivos + diff.
  if (selectedCommit) {
    const files = commitDetail?.files ?? []
    return (
      <div className="details">
        <div className="details-title commit-title">
          <button className="mini-btn" title="Back to working copy" onClick={() => void selectCommit(null)}>
            <ArrowLeft size={13} /> Working Copy
          </button>
          <span className="mono muted">{selectedCommit.slice(0, 7)}</span>
        </div>
        <div className="commit-meta">
          {commitDetail ? (
            <>
              <div className="msg">
                {visibleRefs(commitDetail.refs).map((r) => (
                  <RefBadge key={r} name={r} />
                ))}
                {commitDetail.message}
              </div>
              <div className="muted">
                {commitDetail.author} · {commitDetail.date.slice(0, 16).replace('T', ' ')} ·{' '}
                {files.length} file{files.length === 1 ? '' : 's'}
              </div>
            </>
          ) : (
            <div className="muted">Loading commit…</div>
          )}
        </div>
        <div className="details-body">
          <div className="file-col">
            <div className="file-col-head">
              <h4>Files ({files.length})</h4>
            </div>
            {files.map((p) => (
              <div
                key={p}
                className="file-row"
                aria-selected={commitFile === p}
                onClick={() => {
                  setCommitFile(p)
                  void selectCommitFile(p)
                }}
              >
                <span className="grow">{p}</span>
              </div>
            ))}
            {commitDetail && files.length === 0 && <div className="file-empty">No files (merge or empty commit)</div>}
          </div>
          <div className="diff-pane">
            <pre>{commitDiff || 'Select a file to preview the diff.'}</pre>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="details">
      <div className="details-title">File Status</div>
      <div className="details-body">
        <div className="file-col">
          <div className="file-col-head">
            <h4>Unstaged ({unstaged.length + untracked.length})</h4>
            {(unstaged.length > 0 || untracked.length > 0) && (
              <button className="mini-btn" title="Stage all files" onClick={() => void stageAll()}>
                Stage All
              </button>
            )}
          </div>
          {unstaged.map((f) => (
            <div
              key={f.path}
              className="file-row"
              aria-selected={selectedFile?.path === f.path && !selectedFile.staged}
              onClick={() => void selectFile({ path: f.path, staged: false })}
            >
              <span className="code">{f.code.trim() || '?'}</span>
              <span className="grow">{f.path}</span>
              <button
                className="mini-btn"
                title="Stage file"
                onClick={(e) => {
                  e.stopPropagation()
                  void selectFile({ path: f.path, staged: false }).then(() => stageSelected())
                }}
              >
                Stage
              </button>
            </div>
          ))}
          {untracked.map((p) => (
            <div
              key={`??${p}`}
              className="file-row"
              aria-selected={selectedFile?.path === p && !selectedFile.staged}
              onClick={() => void selectFile({ path: p, staged: false })}
            >
              <span className="code">?</span>
              <span className="grow">{p}</span>
              <button
                className="mini-btn"
                title="Stage file"
                onClick={(e) => {
                  e.stopPropagation()
                  void selectFile({ path: p, staged: false }).then(() => stageSelected())
                }}
              >
                Stage
              </button>
            </div>
          ))}
          {unstaged.length === 0 && untracked.length === 0 && (
            <div className="file-empty">No unstaged changes</div>
          )}
        </div>
        <div className="file-col">
          <div className="file-col-head">
            <h4>Staged ({staged.length})</h4>
            {staged.length > 0 && (
              <button className="mini-btn" title="Unstage all files" onClick={() => void unstageAll()}>
                Unstage All
              </button>
            )}
          </div>
          {staged.map((f) => (
            <div
              key={f.path}
              className="file-row"
              aria-selected={selectedFile?.path === f.path && selectedFile.staged}
              onClick={() => void selectFile({ path: f.path, staged: true })}
            >
              <span className="code">{f.code.trim() || '+'}</span>
              <span className="grow">{f.path}</span>
              <button
                className="mini-btn"
                title="Unstage file"
                onClick={(e) => {
                  e.stopPropagation()
                  void selectFile({ path: f.path, staged: true }).then(() => unstageSelected())
                }}
              >
                Unstage
              </button>
            </div>
          ))}
          {staged.length === 0 && <div className="file-empty">No staged changes</div>}
        </div>
        <div className="diff-pane">
          <pre>{diff || 'Select a file to preview the diff.'}</pre>
        </div>
      </div>
      <div className="commit-bar">
        <textarea
          ref={commitRef}
          placeholder="Commit message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="commit-row">
          <label>
            <input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} /> Amend
          </label>
          <button
            className="tool-btn primary"
            onClick={() => void doCommit()}
            disabled={!canCommit}
            title={!canCommit ? 'Stage files first (or type a message)' : 'Commit staged changes'}
          >
            Commit
          </button>
          {error && <span className="error">{error}</span>}
        </div>
      </div>
    </div>
  )
})

export default DetailsPanel
