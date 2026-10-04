import { dialogOps, useStore } from '../store'

export default function StatusBar() {
  const current = useStore((s) => s.current)
  const status = useStore((s) => s.status)
  const commits = useStore((s) => s.commits)
  const error = useStore((s) => s.error)
  const mergeBusy = useStore((s) => s.mergeState.inProgress)
  const rebaseBusy = useStore((s) => s.rebaseState.inProgress)
  const pickBusy = useStore((s) => s.pickState.inProgress)
  const revertBusy = useStore((s) => s.revertState.inProgress)
  const worktree = useStore((s) => s.worktree)
  const lfs = useStore((s) => s.lfs)
  const confirmAction = useStore((s) => s.confirmAction)
  const openDlg = useStore((s) => s.openDlg)
  const doFetch = useStore((s) => s.doFetch)
  const tr = useStore((s) => s.tr)

  const conflicted = status?.conflicted.length ?? 0
  const attention = mergeBusy || rebaseBusy || pickBusy || revertBusy || conflicted > 0 || !!error

  return (
    <div className="statusbar">
      <span className={`dot${attention ? ' warn' : ''}`} />
      <span title={current ?? ''}>{current ? current.split('/').pop() : tr('status.noRepo')}</span>
      {status && (
        <>
          <button
            className="status-link"
            title={status.detachedTag ? `${tr('tag.checkoutT')}: ${status.detachedTag}` : `${tr('status.branch')} — ${tr('branch.title')}`}
            onClick={() => openDlg('branch')}
          >
            {status.detachedTag ? `tag: ${status.detachedTag}` : status.branch}
          </button>
          <button
            className="status-link"
            title={`${tr('status.aheadBehind')} — ${tr('toolbar.fetchFrom')}`}
            onClick={() => void doFetch()}
          >
            ↑{status.ahead} ↓{status.behind}
          </button>
          <span title={tr('status.files')}>
            {tr('status.stagedUnstaged', {
              s: status.staged.length,
              u: status.unstaged.length + status.untracked.length
            })}
          </span>
          {conflicted > 0 && (
            <button className="status-link warn" title={tr('conflict.hint')} onClick={() => openDlg('merge')}>
              {tr('op.conflicted', { n: conflicted })}
            </button>
          )}
          {revertBusy && (
            <button
              className="status-link warn"
              title={tr('revert.abortD')}
              onClick={() =>
                void (async () => {
                  const ok = await confirmAction(
                    tr('revert.abortT'),
                    tr('revert.abortM'),
                    tr('revert.abortD'),
                    tr('dlg.abort')
                  )
                  if (ok) await dialogOps.abortRevert()
                })()
              }
            >
              {tr('revert.inProg')}
            </button>
          )}
          {worktree?.linked && (
            <span className="status-tag" title={`${tr('status.worktree')} (${worktree.toplevel})`}>
              worktree
            </span>
          )}
          {lfs?.tracked && (
            <span
              className="status-tag"
              title={tr('status.lfs', { n: lfs.files })}
            >
              LFS{lfs.files > 0 ? ` ${lfs.files}` : ''}
            </span>
          )}
        </>
      )}
      {commits.length > 0 && (
        <span title={tr('status.loaded')}>
          {tr('hist.commits', { n: commits.length })}
        </span>
      )}
      {error && (
        <span className="error status-error" title={error}>
          {error}
        </span>
      )}
      <span style={{ marginLeft: 'auto' }} title={tr('status.credit')}>
        {tr('status.developedBy')}
      </span>
      <span>TreeLine 0.5.0</span>
    </div>
  )
}
