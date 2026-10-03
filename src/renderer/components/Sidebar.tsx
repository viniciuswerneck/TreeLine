import { Archive, Bookmark, FolderOpen, GitBranch, Globe, History, Search, Tag } from 'lucide-react'
import { dialogOps, useStore } from '../store'

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
  const stashes = useStore((s) => s.stashes)
  const tags = useStore((s) => s.tags)
  const remotes = useStore((s) => s.remotes)
  const selectRepo = useStore((s) => s.selectRepo)
  const openDialog = useStore((s) => s.openDialog)
  const openDlg = useStore((s) => s.openDlg)
  const openMenu = useStore((s) => s.openMenu)
  const copyText = useStore((s) => s.copyText)
  const revealFullPath = useStore((s) => s.revealFullPath)
  const removeBookmark = useStore((s) => s.removeBookmark)
  const confirmAction = useStore((s) => s.confirmAction)
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
                : tr('side.checkout', { n: b.name })
            }
            onDoubleClick={() => {
              if (!b.current) void dialogOps.checkoutBranch(b.name)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              if (b.current) return
              openMenu(e.clientX, e.clientY, [
                { label: tr('dlg.checkout'), onClick: () => void dialogOps.checkoutBranch(b.name) },
                { label: tr('toolbar.merge'), onClick: () => openDlg('merge') },
                { label: tr('toolbar.rebase'), onClick: () => openDlg('rebase') },
                {
                  label: tr('dlg.delete'),
                  danger: true,
                  onClick: () =>
                    void (async () => {
                      const ok = await confirmAction(
                        tr('branch.delT'),
                        tr('branch.delM', { n: b.name }),
                        tr('branch.delD'),
                        tr('dlg.delete')
                      )
                      if (ok) await dialogOps.deleteBranch(b.name, false)
                    })()
                }
              ])
            }}
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
        {remotes.map((r) => (
          <div key={r.name} className="sidebar-row" title={r.url} onClick={() => openDlg('remotes')}>
            <Globe size={14} />
            <span className="grow">{r.name}</span>
          </div>
        ))}
        {remotes.length === 0 && (
          <div className="sidebar-row muted" title={tr('side.remoteManager')} onClick={() => openDlg('remotes')}>
            <Globe size={14} />
            <span className="grow">{tr('side.remoteManager')}</span>
          </div>
        )}
      </Section>

      <Section title={tr('side.tags')}>
        {tags.map((t) => (
          <div key={t.name} className="sidebar-row" title={t.date} onClick={() => openDlg('tag')}>
            <Tag size={14} />
            <span className="grow">{t.name}</span>
          </div>
        ))}
        {tags.length === 0 && (
          <div className="sidebar-row muted" title={tr('side.tagList')} onClick={() => openDlg('tag')}>
            <Tag size={14} />
            <span className="grow">{tr('side.noTags')}</span>
          </div>
        )}
      </Section>

      <Section title={tr('side.stashes')}>
        {stashes.map((st) => (
          <div key={st.ref} className="sidebar-row" title={st.message} onClick={() => openDlg('stash')}>
            <Archive size={14} />
            <span className="grow">{st.message || st.ref}</span>
          </div>
        ))}
        {stashes.length === 0 && (
          <div className="sidebar-row muted" title={tr('side.stashList')} onClick={() => openDlg('stash')}>
            <Archive size={14} />
            <span className="grow">{tr('side.noStashes')}</span>
          </div>
        )}
      </Section>
    </div>
  )
}
