import { useStore } from '../store'

export default function StatusBar() {
  const current = useStore((s) => s.current)
  const status = useStore((s) => s.status)
  const commits = useStore((s) => s.commits)
  const error = useStore((s) => s.error)
  const tr = useStore((s) => s.tr)

  return (
    <div className="statusbar">
      <span className="dot" />
      <span title={current ?? ''}>{current ? current.split('/').pop() : tr('status.noRepo')}</span>
      {status && (
        <>
          <span title={tr('status.branch')}>{status.branch}</span>
          <span title={tr('status.aheadBehind')}>
            ↑{status.ahead} ↓{status.behind}
          </span>
          <span title={tr('status.files')}>
            {tr('status.stagedUnstaged', {
              s: status.staged.length,
              u: status.unstaged.length + status.untracked.length
            })}
          </span>
        </>
      )}
      {commits.length > 0 && (
        <span title={tr('status.loaded')}>
          {tr('hist.commits', { n: commits.length })}
        </span>
      )}
      {error && <span className="error">{error}</span>}
      <span style={{ marginLeft: 'auto' }} title={tr('status.credit')}>
        {tr('status.developedBy')}
      </span>
      <span>TreeLine 0.1.0</span>
    </div>
  )
}
