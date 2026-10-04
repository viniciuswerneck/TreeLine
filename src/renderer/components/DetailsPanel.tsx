import { ArrowLeft, Maximize2, Minimize2, RefreshCw } from 'lucide-react'
import { forwardRef, useEffect, useState } from 'react'
import { useStore } from '../store'
import DiffViewer, { loadDiffMode, saveDiffMode, type DiffMode } from './DiffViewer'
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
  const hunks = useStore((s) => s.hunks)
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
  const resolveOurs = useStore((s) => s.resolveOurs)
  const resolveTheirs = useStore((s) => s.resolveTheirs)

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
  const tr = useStore((s) => s.tr)
  const openMenu = useStore((s) => s.openMenu)
  const copyText = useStore((s) => s.copyText)
  const revealRepoFile = useStore((s) => s.revealRepoFile)
  const discardFile = useStore((s) => s.discardFile)
  const refresh = useStore((s) => s.refresh)
  const loading = useStore((s) => s.loading)
  const loadBlame = useStore((s) => s.loadBlame)
  const loadFileHistory = useStore((s) => s.loadFileHistory)
  const openDlg = useStore((s) => s.openDlg)
  const [commitFile, setCommitFile] = useState<string | null>(null)
  // Painel expandido (tela cheia): um por vez; Esc recolhe.
  const [expanded, setExpanded] = useState<string | null>(null)
  const [diffMode, setDiffMode] = useState<DiffMode>(() => loadDiffMode())

  const switchMode = (m: DiffMode): void => {
    setDiffMode(m)
    saveDiffMode(m)
  }

  const modeToggle = (): React.ReactNode => (
    <span className="diff-mode" role="group" aria-label="Diff mode">
      <button
        className={`mini-btn${diffMode === 'unified' ? ' active' : ''}`}
        title={tr('diff.unified')}
        onClick={(e) => {
          e.stopPropagation()
          switchMode('unified')
        }}
      >
        {tr('diff.unified')}
      </button>
      <button
        className={`mini-btn${diffMode === 'split' ? ' active' : ''}`}
        title={tr('diff.split')}
        onClick={(e) => {
          e.stopPropagation()
          switchMode('split')
        }}
      >
        {tr('diff.split')}
      </button>
    </span>
  )

  useEffect(() => {
    setCommitFile(null)
  }, [selectedCommit])

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setExpanded(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  const expandBtn = (id: string): React.ReactNode => {
    const open = expanded === id
    return (
      <button
        className="pane-expand"
        title={open ? tr('det.collapse') : tr('det.expand')}
        onClick={(e) => {
          e.stopPropagation()
          setExpanded(open ? null : id)
        }}
      >
        {open ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>
    )
  }
  const expandedClass = (id: string): string => `expandable${expanded === id ? ' expanded' : ''}`

  const fileMenu = (e: React.MouseEvent, path: string, staged: boolean, tracked: boolean): void => {
    e.preventDefault()
    const toggle = staged ? unstageSelected : stageSelected
    const conflicted = (status?.conflicted ?? []).includes(path)
    void selectFile({ path, staged }).then(() => {
      openMenu(e.clientX, e.clientY, [
        { label: staged ? tr('menu.unstageFile') : tr('menu.stageFile'), onClick: () => void toggle() },
        ...(conflicted
          ? [
              { label: tr('menu.ours'), onClick: () => void resolveOurs(path) },
              { label: tr('menu.theirs'), onClick: () => void resolveTheirs(path) }
            ]
          : []),
        { label: tr('menu.copyPath'), onClick: () => void copyText(path) },
        { label: tr('menu.reveal'), onClick: () => void revealRepoFile(path) },
        { label: tr('menu.blame'), onClick: () => { void loadBlame(path); openDlg('blame') } },
        { label: tr('menu.fileHistory'), onClick: () => { void loadFileHistory(path); openDlg('fileHistory') } },
        {
          label: tr('menu.discard'),
          danger: true,
          onClick: () => void discardFile(path, tracked)
        }
      ])
    })
  }

  const commitFileMenu = (e: React.MouseEvent, path: string): void => {
    e.preventDefault()
    openMenu(e.clientX, e.clientY, [
      { label: tr('menu.copyPath'), onClick: () => void copyText(path) },
      { label: tr('menu.reveal'), onClick: () => void revealRepoFile(path) }
    ])
  }

  const isConflicted = selectedFile ? (status?.conflicted ?? []).includes(selectedFile.path) : false

  // Vista de commit selecionado no histórico: meta + arquivos + diff.
  if (selectedCommit) {
    const files = commitDetail?.files ?? []
    return (
      <div className="details">
        {expanded && <div className="pane-backdrop" onClick={() => setExpanded(null)} />}
        <div className="details-title commit-title">
          <button className="mini-btn" title="Back to working copy" onClick={() => void selectCommit(null)}>
            <ArrowLeft size={13} /> {tr('det.backWc')}
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
              <div className="meta-grid">
                <span className="muted">{tr('det.author')}</span>
                <span>{commitDetail.author}</span>
                <span className="muted">{tr('det.committer')}</span>
                <span>{commitDetail.committer}</span>
                <span className="muted">{tr('det.date')}</span>
                <span>{commitDetail.date.slice(0, 16).replace('T', ' ')}</span>
                <span className="muted">Commit</span>
                <span className="mono">{commitDetail.hash}</span>
                {commitDetail.parents.length > 0 && (
                  <>
                    <span className="muted">{tr('det.parents')}</span>
                    <span className="mono">{commitDetail.parents.map((p) => p.slice(0, 7)).join(' ')}</span>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="muted">{tr('det.loadingCommit')}</div>
          )}
        </div>
        <div className="details-body">
          <div className={`file-col ${expandedClass('cfiles')}`}>
            <div className="file-col-head">
              <h4>{tr('det.files', { n: files.length })}</h4>
              {expandBtn('cfiles')}
            </div>
            {files.map((p) => {
              const st = commitDetail?.stats.find((s) => s.path === p)
              return (
                <div
                  key={p}
                  className="file-row"
                  aria-selected={commitFile === p}
                  onClick={() => {
                    setCommitFile(p)
                    void selectCommitFile(p)
                  }}
                  onContextMenu={(e) => commitFileMenu(e, p)}
                >
                  <span className="grow">{p}</span>
                  {st && (
                    <span className="mono muted">
                      (<span className="stat-add">+{st.added}</span> <span className="stat-del">−{st.deleted}</span>)
                    </span>
                  )}
                </div>
              )
            })}
            {commitDetail && files.length === 0 && <div className="file-empty">{tr('det.noFiles')}</div>}
          </div>
          <div className={`diff-pane ${expandedClass('cdiff')}`}>
            {expandBtn('cdiff')}
            {commitDiff ? <DiffViewer text={commitDiff} /> : tr('det.selectFile')}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="details">
      {expanded && <div className="pane-backdrop" onClick={() => setExpanded(null)} />}
      <div className="details-title">
        {tr('det.fileStatus')}
        <button className="mini-btn" title={`${tr('common.refresh')} (F5)`} onClick={() => void refresh()}>
          <RefreshCw size={12} className={loading ? 'spin' : undefined} /> {tr('common.refresh')}
        </button>
      </div>
      <div className="details-body">
        <div className={`file-col ${expandedClass('unstaged')}`}>
          <div className="file-col-head">
            <h4>{tr('det.unstaged', { n: unstaged.length + untracked.length })}</h4>
            {(unstaged.length > 0 || untracked.length > 0) && (
              <button className="mini-btn" title={tr('det.stageAllTitle')} onClick={() => void stageAll()}>
                                {tr('det.stageAll')}
              </button>
            )}
            {expandBtn('unstaged')}
          </div>
          {unstaged.map((f) => (
            <div
              key={f.path}
              className="file-row"
              aria-selected={selectedFile?.path === f.path && !selectedFile.staged}
              onClick={() => void selectFile({ path: f.path, staged: false })}
              onContextMenu={(e) => fileMenu(e, f.path, false, true)}
            >
              <span className="code">{f.code.trim() || '?'}</span>
              <span className="grow">{f.path}</span>
              <button
                className="mini-btn"
                title={tr('det.stageFile')}
                onClick={(e) => {
                  e.stopPropagation()
                  void selectFile({ path: f.path, staged: false }).then(() => stageSelected())
                }}
              >
                {tr('det.stage')}
              </button>
            </div>
          ))}
          {untracked.map((p) => (
            <div
              key={`??${p}`}
              className="file-row"
              aria-selected={selectedFile?.path === p && !selectedFile.staged}
              onClick={() => void selectFile({ path: p, staged: false })}
              onContextMenu={(e) => fileMenu(e, p, false, false)}
            >
              <span className="code">?</span>
              <span className="grow">{p}</span>
              <button
                className="mini-btn"
                title={tr('det.stageFile')}
                onClick={(e) => {
                  e.stopPropagation()
                  void selectFile({ path: p, staged: false }).then(() => stageSelected())
                }}
              >
                {tr('det.stage')}
              </button>
            </div>
          ))}
          {unstaged.length === 0 && untracked.length === 0 && (
            <div className="file-empty">{tr('det.noUnstaged')}</div>
          )}
        </div>
        <div className={`file-col ${expandedClass('staged')}`}>
          <div className="file-col-head">
            <h4>{tr('det.staged', { n: staged.length })}</h4>
            {staged.length > 0 && (
              <button className="mini-btn" title={tr('det.unstageAllTitle')} onClick={() => void unstageAll()}>
                                {tr('det.unstageAll')}
              </button>
            )}
            {expandBtn('staged')}
          </div>
          {staged.map((f) => (
            <div
              key={f.path}
              className="file-row"
              aria-selected={selectedFile?.path === f.path && selectedFile.staged}
              onClick={() => void selectFile({ path: f.path, staged: true })}
              onContextMenu={(e) => fileMenu(e, f.path, true, true)}
            >
              <span className="code">{f.code.trim() || '+'}</span>
              <span className="grow">{f.path}</span>
              <button
                className="mini-btn"
                title={tr('det.unstageFile')}
                onClick={(e) => {
                  e.stopPropagation()
                  void selectFile({ path: f.path, staged: true }).then(() => unstageSelected())
                }}
              >
                {tr('det.unstage')}
              </button>
            </div>
          ))}
          {staged.length === 0 && <div className="file-empty">{tr('det.noStaged')}</div>}
        </div>
        <div className={`diff-pane ${expandedClass('diff')}`}>
          {expandBtn('diff')}
          {isConflicted && (
            <div className="conflict-bar" title={tr('conflict.hint')}>
              <span>{tr('conflict.hint')}</span>
              <button className="mini-btn" onClick={() => selectedFile && void resolveOurs(selectedFile.path)}>
                {tr('conflict.ours')}
              </button>
              <button className="mini-btn" onClick={() => selectedFile && void resolveTheirs(selectedFile.path)}>
                {tr('conflict.theirs')}
              </button>
            </div>
          )}
          {diff ? (
            <>
              <div className="diff-toolbar">
                {modeToggle()}
              </div>
              <DiffViewer
                text={diff}
                file={selectedFile?.path}
                staged={selectedFile?.staged ?? false}
                hunks={hunks}
                interactive
                mode={diffMode}
              />
            </>
          ) : (
            tr('det.selectFile')
          )}
        </div>
      </div>
      <div className="commit-bar">
        <textarea
          ref={commitRef}
          placeholder={`${tr('det.commitMsgPh')} — ${tr('det.templateHint')}`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canCommit) {
              e.preventDefault()
              void doCommit()
            }
          }}
        />
        <div className="commit-row">
          <label>
            <input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} /> {tr('det.amend')}
          </label>
          <button
            className="tool-btn primary"
            onClick={() => void doCommit()}
            disabled={!canCommit}
            title={!canCommit ? tr('det.commitHint') : `${tr('toolbar.commitStaged')} (${tr('det.ctrlEnter')})`}
          >
            {tr('det.commit')}
          </button>
          {error && <span className="error">{error}</span>}
        </div>
      </div>
    </div>
  )
})

export default DetailsPanel
