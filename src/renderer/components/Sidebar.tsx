import { Archive, Bookmark, FolderOpen, GitBranch, Globe, History, Search, Tag } from 'lucide-react'
import { useStore } from '../store'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <div className="sidebar-section-title">{title}</div>
      {children}
    </>
  )
}

export default function Sidebar() {
  const repos = useStore((s) => s.repos)
  const current = useStore((s) => s.current)
  const branches = useStore((s) => s.branches)
  const status = useStore((s) => s.status)
  const selectRepo = useStore((s) => s.selectRepo)
  const openDialog = useStore((s) => s.openDialog)
  const branchFilter = useStore((s) => s.branchFilter)
  const setBranchFilter = useStore((s) => s.setBranchFilter)
  const dirtyCount =
    (status?.unstaged.length ?? 0) + (status?.staged.length ?? 0) + (status?.untracked.length ?? 0)

  return (
    <div className="sidebar">
      <Section title={`Bookmarks (${repos.length})`}>
        {repos.map((r) => (
          <div
            key={r}
            className="sidebar-row"
            aria-selected={r === current}
            title={r}
            onClick={() => void selectRepo(r)}
          >
            <Bookmark size={14} />
            <span className="grow">{r.split('/').pop() ?? r}</span>
          </div>
        ))}
        <div className="sidebar-row" onClick={() => void openDialog()}>
          <FolderOpen size={14} />
          <span className="grow">Open repository…</span>
        </div>
      </Section>

      <Section title="Workspace">
        <div className="sidebar-row" aria-selected={false} title="Uncommitted changes in the working copy">
          <Globe size={14} />
          <span className="grow">Working Copy</span>
          {dirtyCount > 0 && <span className="sidebar-badge">{dirtyCount}</span>}
        </div>
        <div className="sidebar-row" aria-selected={false} title="Commit history">
          <History size={14} />
          <span className="grow">History</span>
        </div>
        <div className="sidebar-row" aria-selected={false} title="Search commits (toolbar filter)">
          <Search size={14} />
          <span className="grow">Search</span>
        </div>
      </Section>

      <Section title={`Branches (${branches.length})`}>
        <div className="sidebar-row small" title="Toggle: current branch only / all branches">
          <label className="check-row" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={branchFilter === 'current'}
              onChange={(e) => setBranchFilter(e.target.checked ? 'current' : 'all')}
            />
            <span className="grow">Current branch only</span>
          </label>
        </div>
        {branches.map((b) => (
          <div
            key={b.name}
            className="sidebar-row"
            aria-selected={b.current}
            title={b.current ? `Current branch — ${status?.ahead ?? 0} ahead, ${status?.behind ?? 0} behind` : `Checkout ${b.name} (Fase 1)`}
          >
            <GitBranch size={14} />
            <span className="grow">{b.name}</span>
            {b.current && (status?.ahead || status?.behind) ? (
              <span className="sidebar-badge">
                ↑{status.ahead} ↓{status.behind}
              </span>
            ) : null}
          </div>
        ))}
        {branches.length === 0 && <div className="sidebar-row muted">No branches yet</div>}
      </Section>

      <Section title="Remotes">
        <div className="sidebar-row muted" title="Remote manager (Fase 1)">
          <Globe size={14} />
          <span className="grow">origin (Fase 1)</span>
        </div>
      </Section>

      <Section title="Tags">
        <div className="sidebar-row muted" title="Tag list (Fase 2)">
          <Tag size={14} />
          <span className="grow">No tags (Fase 2)</span>
        </div>
      </Section>

      <Section title="Stashes">
        <div className="sidebar-row muted" title="Stash list (Fase 2)">
          <Archive size={14} />
          <span className="grow">No stashes (Fase 2)</span>
        </div>
      </Section>
    </div>
  )
}
