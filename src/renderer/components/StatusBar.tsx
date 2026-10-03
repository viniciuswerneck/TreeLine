import { useStore } from '../store'

export default function StatusBar() {
  const current = useStore((s) => s.current)
  const status = useStore((s) => s.status)
  const commits = useStore((s) => s.commits)
  const error = useStore((s) => s.error)

  return (
    <div className="statusbar">
      <span className="dot" />
      <span title={current ?? ''}>{current ? current.split('/').pop() : 'No repository open'}</span>
      {status && (
        <>
          <span title="Current branch">{status.branch}</span>
          <span title="Ahead / behind the remote">
            ↑{status.ahead} ↓{status.behind}
          </span>
          <span title="Changed files">
            {status.staged.length} staged · {status.unstaged.length + status.untracked.length} unstaged
          </span>
        </>
      )}
      {commits.length > 0 && <span title="Commits loaded">{commits.length} commits</span>}
      {error && <span className="error">{error}</span>}
      <span style={{ marginLeft: 'auto' }}>TreeLine 0.1.0</span>
    </div>
  )
}
