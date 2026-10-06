import { Archive, Bookmark, Cloud, FolderOpen, GitBranch, Globe, History, Package, PanelLeftClose, PanelLeftOpen, RefreshCw, Search, Tag } from 'lucide-react'
import { useState } from 'react'
import { dialogOps, useStore } from '../store'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <div
        className="sidebar-section-title collapsible"
        onClick={() => setOpen((o) => !o)}
        role="button"
        aria-expanded={open}
      >
        {title}
      </div>
      {open && children}
    </>
  )
}

export default function Sidebar() {
  const repos = useStore((s) => s.repos)
  const current = useStore((s) => s.current)
  const branchesDetailed = useStore((s) => s.branchesDetailed)
  const remoteBranches = useStore((s) => s.remoteBranches)
  const status = useStore((s) => s.status)
  const stashes = useStore((s) => s.stashes)
  const submodules = useStore((s) => s.submodules)
  const lfs = useStore((s) => s.lfs)
  const tags = useStore((s) => s.tags)
  const remotes = useStore((s) => s.remotes)
  const selectRepo = useStore((s) => s.selectRepo)
  const selectCommit = useStore((s) => s.selectCommit)
  const setFilter = useStore((s) => s.setFilter)
  const openDialog = useStore((s) => s.openDialog)
  const openDlg = useStore((s) => s.openDlg)
  const openMenu = useStore((s) => s.openMenu)
  const copyText = useStore((s) => s.copyText)
  const revealFullPath = useStore((s) => s.revealFullPath)
  const removeBookmark = useStore((s) => s.removeBookmark)
  const confirmAction = useStore((s) => s.confirmAction)
  const setRefPreset = useStore((s) => s.setRefPreset)
  const branchFilter = useStore((s) => s.branchFilter)
  const setBranchFilter = useStore((s) => s.setBranchFilter)
  const tr = useStore((s) => s.tr)
  const checkoutBranch = useStore((s) => s.checkoutBranch)
  const checkoutRemote = useStore((s) => s.checkoutRemote)
  const checkoutTag = useStore((s) => s.checkoutTag)
  const [branchQuery, setBranchQuery] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const collapsed = useStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const dirtyCount =
    (status?.unstaged.length ?? 0) + (status?.staged.length ?? 0) + (status?.untracked.length ?? 0)

  const shown = branchesDetailed.filter((b) => b.name.toLowerCase().includes(branchQuery.trim().toLowerCase()))

  const branchMenu = (e: React.MouseEvent, name: string, isCurrent: boolean): void => {
    e.preventDefault()
    const items = isCurrent
      ? [
          { label: tr('menu.copyBranch'), onClick: () => void copyText(name) },
          {
            label: tr('side.setUpstream'),
            onClick: () => {
              const up = window.prompt('upstream (ex: origin/main):', 'origin/')
              if (up?.trim()) void dialogOps.setUpstream(name, up.trim())
            }
          }
        ]
      : [
          { label: tr('dlg.checkout'), onClick: () => void checkoutBranch(name) },
          {
            label: tr('toolbar.merge'),
            onClick: () => {
              setRefPreset(name)
              openDlg('merge')
            }
          },
          {
            label: tr('toolbar.rebase'),
            onClick: () => {
              setRefPreset(name)
              openDlg('rebase')
            }
          },
          { label: tr('menu.copyBranch'), onClick: () => void copyText(name) },
          {
            label: tr('dlg.delete'),
            danger: true,
            onClick: () =>
              void (async () => {
                const ok = await confirmAction(
                  tr('branch.delT'),
                  tr('branch.delM', { n: name }),
                  tr('branch.delD'),
                  tr('dlg.delete')
                )
                if (ok) await dialogOps.deleteBranch(name, false)
              })()
          }
        ]
    openMenu(e.clientX, e.clientY, items)
  }

  return (
    <div className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <button
        className="sidebar-toggle"
        title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
        onClick={() => toggleSidebar()}
      >
        {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
      </button>
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
        <div
          className="sidebar-row"
          aria-selected={false}
          title={tr('side.workingCopyTitle')}
          onClick={() => void selectCommit(null)}
        >
          <Globe size={14} />
          <span className="grow">{tr('side.workingCopy')}</span>
          {dirtyCount > 0 && <span className="sidebar-badge">{dirtyCount}</span>}
        </div>
        <div className="sidebar-row" aria-selected={false} title={tr('side.historyTitle')} onClick={() => openDlg('reflog')}>
          <History size={14} />
          <span className="grow">{tr('side.history')}</span>
        </div>
        <div
          className="sidebar-row"
          aria-selected={false}
          title={tr('side.searchTitle')}
          onClick={() => {
            setFilter('')
            document.querySelector<HTMLInputElement>('.history-search input')?.focus()
          }}
        >
          <Search size={14} />
          <span className="grow">{tr('side.search')}</span>
        </div>
      </Section>

      <Section title={tr('side.branches', { n: branchesDetailed.length })}>
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
        <div className="sidebar-row small">
          <Search size={12} />
          <input
            className="sidebar-filter"
            placeholder={tr('side.searchBranch')}
            value={branchQuery}
            onChange={(e) => setBranchQuery(e.target.value)}
          />
        </div>
        {shown.map((b) => (
          <div
            key={b.name}
            className={`sidebar-row${b.current ? ' current-branch' : ''}`}
            aria-selected={b.current}
            draggable={!b.current}
            onDragStart={(e) => e.dataTransfer.setData('text/treeline-branch', b.name)}
            title={
              b.current
                ? tr('side.currentBranch', { a: status?.ahead ?? 0, b: status?.behind ?? 0 })
                : `${tr('side.checkout', { n: b.name })}${b.upstream ? ` · ${tr('side.upstream', { n: b.upstream })}` : ` · ${tr('side.noUpstream')}`}`
            }
            onDoubleClick={() => {
              if (!b.current) void checkoutBranch(b.name)
            }}
            onContextMenu={(e) => branchMenu(e, b.name, b.current)}
          >
            <GitBranch size={14} />
            <span className="grow">{b.name}</span>
            {b.current && <span className="head-badge" title={tr('side.currentBranch', { a: status?.ahead ?? 0, b: status?.behind ?? 0 })}>HEAD</span>}
            {(b.ahead > 0 || b.behind > 0) && (
              <span className="sidebar-badge">
                ↑{b.ahead} ↓{b.behind}
              </span>
            )}
          </div>
        ))}
        {shown.length === 0 && <div className="sidebar-row muted">{tr('side.noBranches')}</div>}
        {/* Drop de branch sobre a área = merge no branch atual */}
        <div
          className={`sidebar-drop${dragOver ? ' over' : ''}`}
          title={tr('side.dropMergeHint')}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const name = e.dataTransfer.getData('text/treeline-branch')
            if (name) {
              setRefPreset(name)
              openDlg('merge')
            }
          }}
        >
          {tr('side.dropMergeHint')}
        </div>
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

      <Section title={tr('side.remoteBranches', { n: remoteBranches.length })}>
        {remoteBranches.slice(0, 30).map((r) => (
          <div
            key={r.name}
            className="sidebar-row small"
            title={r.name}
            onContextMenu={(e) => {
              e.preventDefault()
              openMenu(e.clientX, e.clientY, [
                { label: tr('dlg.checkout'), onClick: () => void checkoutRemote(r.name) },
                { label: tr('menu.copyBranch'), onClick: () => void copyText(r.name) },
                {
                  label: tr('menu.createBranchHere'),
                  onClick: () => {
                    setRefPreset(r.name)
                    openDlg('branch')
                  }
                }
              ])
            }}
          >
            <Cloud size={13} />
            <span className="grow">{r.name}</span>
          </div>
        ))}
      </Section>

      <Section title={tr('side.tags')}>
        {tags.map((t) => {
          const isHere = t.checkedOut && status?.detachedTag === t.name
          return (
            <div
              key={t.name}
              className={`sidebar-row${isHere ? ' current-branch' : ''}`}
              aria-selected={isHere}
              title={t.date}
              onClick={() => openDlg('tag')}
              onContextMenu={(e) => {
                e.preventDefault()
                openMenu(e.clientX, e.clientY, [
                  { label: tr('tag.checkout'), onClick: () => void checkoutTag(t.name) },
                  {
                    label: tr('menu.createBranchHere'),
                    onClick: () => {
                      setRefPreset(t.name)
                      openDlg('branch')
                    }
                  },
                  { label: tr('menu.copyBranch'), onClick: () => void copyText(t.name) }
                ])
              }}
            >
              <Tag size={14} />
              <span className="grow">{t.name}</span>
              {isHere && <span className="head-badge" title={tr('tag.checkoutT')}>HEAD</span>}
            </div>
          )
        })}
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

      {submodules.length > 0 && (
        <Section title={tr('side.submodules', { n: submodules.length })}>
          {submodules.map((sm) => (
            <div
              key={sm.path}
              className="sidebar-row small"
              title={`${sm.path} — ${sm.hash.slice(0, 7)}${sm.label ? ` (${sm.label})` : ''}`}
              onContextMenu={(e) => {
                e.preventDefault()
                openMenu(e.clientX, e.clientY, [
                  { label: tr('menu.copyPath'), onClick: () => void copyText(sm.path) },
                  { label: tr('sub.update'), onClick: () => void dialogOps.updateSubmodules() }
                ])
              }}
            >
              <Package size={13} />
              <span className="grow">{sm.path}</span>
              {sm.state !== ' ' && <span className="sidebar-badge">{sm.state === '-' ? '∅' : sm.state}</span>}
            </div>
          ))}
          <div
            className="sidebar-row small"
            title={tr('sub.updateAll')}
            onClick={() => void dialogOps.updateSubmodules()}
          >
            <RefreshCw size={12} />
            <span className="grow">{tr('sub.updateAll')}</span>
          </div>
        </Section>
      )}

      {(lfs?.installed || lfs?.tracked) && (
        <Section title={tr('lfs.title')}>
          <div
            className="sidebar-row small"
            title={lfs.installed ? tr('lfs.files', { n: lfs.files }) : tr('lfs.notInstalled')}
            onClick={() => openDlg('lfs')}
          >
            <Cloud size={13} />
            <span className="grow">
              {lfs.installed ? tr('lfs.files', { n: lfs.files }) : tr('lfs.notInstalledShort')}
            </span>
            <span className="sidebar-badge">{lfs.patterns.length}</span>
          </div>
        </Section>
      )}
    </div>
  )
}
