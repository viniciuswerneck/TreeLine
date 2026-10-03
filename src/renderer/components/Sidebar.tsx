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
  const openMenu = useStore((s) => s.openMenu)
  const copyText = useStore((s) => s.copyText)
  const revealFullPath = useStore((s) => s.revealFullPath)
  const removeBookmark = useStore((s) => s.removeBookmark)
  const branchFilter = useStore((s) => s.branchFilter)
  const setBranchFilter = useStore((s) => s.setBranchFilter)
  const tr = useStore((s) => s.tr)
  const dirtyCount =
    (status?.unstaged.length ?? 0) + (status?.staged.length ?? 0) + (status?.untracked.length ?? 0)

  return (
    <div className="sidebar">
      <Section title={tr('side.bookmarks', { n: repos.length })}>
        {repos.map((r) => (
          <div
            key={r}
            className="sidebar-row"
            aria-selected={r === current}
            title={r}
            onClick={() => void selectRepo(r)}
            onContextMenu={(e) => {
              e.preventDefault()
              openMenu(e.clientX, e.clientY, [
                { label: tr('menu.openRepo'), onClick: () => void selectRepo(r) },
                { label: tr('menu.reveal'), onClick: () => void revealFullPath(r) },
                { label: tr('menu.copyPath'), onClick: () => void copyText(r) },
                {
                  label: tr('menu.removeBookmark'),
                  danger: true,
                  onClick: () => void removeBookmark(r)
                }
              ])
            }}
          >
            <Bookmark size={14} />
            <span className="grow">{r.split('/').pop() ?? r}</span>
          </div>
        ))}
        <div className="sidebar-row" onClick={() => void openDialog()}>
          <FolderOpen size={14} />
          <span className="grow">{tr('side.openRepo')}</span>
        </div>
      </Section>

      <Section title={tr('side.workspace')}>
        <div className="sidebar-row" aria-selected={false} title={tr('side.workingCopyTitle')}>
          <Globe size={14} />
          <span className="grow">{tr('side.workingCopy')}</span>
          {dirtyCount > 0 && <span className="sidebar-badge">{dirtyCount}</span>}
        </div>
        <div className="sidebar-row" aria-selected={false} title={tr('side.historyTitle')}>
          <History size={14} />
          <span className="grow">{tr('side.history')}</span>
        </div>
        <div className="sidebar-row" aria-selected={false} title={tr('side.searchTitle')}>
          <Search size={14} />
          <span className="grow">{tr('side.search')}</span>
        </div>
      </Section>

      <Section title={tr('side.branches', { n: branches.length })}>
        <div className="sidebar-row small" title={tr('side.currentOnlyTitle')}>
          <label className="check-row" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={branchFilter === 'current'}
              onChange={(e) => setBranchFilter(e.target.checked ? 'current' : 'all')}
            />
            <span className="grow">{tr('side.currentOnly')}</span>
          </label>
        </div>
        {branches.map((b) => (
          <div
            key={b.name}
            className="sidebar-row"
            aria-selected={b.current}
            title={
              b.current
                ? tr('side.currentBranch', { a: status?.ahead ?? 0, b: status?.behind ?? 0 })
                : `${tr('side.checkout', { n: b.name })} (${tr('toolbar.phase', { n: 1 })})`
            }
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
        {branches.length === 0 && <div className="sidebar-row muted">{tr('side.noBranches')}</div>}
      </Section>

      <Section title={tr('side.remotes')}>
        <div className="sidebar-row muted" title={`${tr('side.remoteManager')} (${tr('toolbar.phase', { n: 1 })})`}>
          <Globe size={14} />
          <span className="grow">
            {tr('side.origin')} ({tr('toolbar.phase', { n: 1 })})
          </span>
        </div>
      </Section>

      <Section title={tr('side.tags')}>
        <div className="sidebar-row muted" title={`${tr('side.tagList')} (${tr('toolbar.phase', { n: 2 })})`}>
          <Tag size={14} />
          <span className="grow">
            {tr('side.noTags')} ({tr('toolbar.phase', { n: 2 })})
          </span>
        </div>
      </Section>

      <Section title={tr('side.stashes')}>
        <div className="sidebar-row muted" title={`${tr('side.stashList')} (${tr('toolbar.phase', { n: 2 })})`}>
          <Archive size={14} />
          <span className="grow">
            {tr('side.noStashes')} ({tr('toolbar.phase', { n: 2 })})
          </span>
        </div>
      </Section>
    </div>
  )
}
