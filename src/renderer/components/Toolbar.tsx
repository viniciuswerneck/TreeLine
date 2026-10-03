import {
  Archive,
  ArrowDownUp,
  Cherry,
  Check,
  Download,
  GitBranch,
  GitMerge,
  History,
  RefreshCw,
  Repeat,
  Settings,
  Tag,
  Terminal,
  Upload,
  Workflow
} from 'lucide-react'
import { dialogOps, useStore } from '../store'

// Ordem de ações familiar do SourceTree (Commit|Push|Pull|Fetch|Branch|Merge|
// Stash|Tag|Rebase|Cherry-Pick|Flow|Terminal|Settings), arte própria TreeLine
// com ícones Lucide. History abre o Reflog + Undo; as setas abrem o Remote manager.
export default function Toolbar({ onCommitFocus }: { onCommitFocus: () => void }) {
  const loading = useStore((s) => s.loading)
  const sync = useStore((s) => s.sync)
  const doPush = useStore((s) => s.doPush)
  const doPull = useStore((s) => s.doPull)
  const doFetch = useStore((s) => s.doFetch)
  const busy = sync.phase === 'running'
  const stagedCount = useStore((s) => s.status?.staged.length ?? 0)
  const ahead = useStore((s) => s.status?.ahead ?? 0)
  const openSettings = useStore((s) => s.openSettings)
  const openDlg = useStore((s) => s.openDlg)
  const current = useStore((s) => s.current)
  const tr = useStore((s) => s.tr)
  const ready = !!current && !busy

  function ToolButton(props: {
    title: string
    disabled?: boolean
    primary?: boolean
    onClick?: () => void
    children: React.ReactNode
  }) {
    return (
      <button
        className={props.primary ? 'tool-btn primary' : 'tool-btn'}
        title={props.title}
        disabled={props.disabled}
        onClick={props.onClick}
      >
        {props.children}
      </button>
    )
  }

  return (
    <div className="toolbar">
      <ToolButton
        title={stagedCount > 0 ? tr('toolbar.commitStaged') : tr('toolbar.commitEmpty')}
        primary
        disabled={stagedCount === 0}
        onClick={onCommitFocus}
      >
        <Check size={15} /> {tr('toolbar.commit')}
      </ToolButton>
      <span className="toolbar-sep" />
      <ToolButton
        title={ahead > 0 ? tr('toolbar.pushAhead', { n: ahead }) : tr('toolbar.pushTo')}
        primary={ahead > 0 && !busy}
        disabled={busy}
        onClick={() => void doPush()}
      >
        <Upload size={15} /> {sync.op === 'push' && busy ? '…' : ahead > 0 ? `${tr('toolbar.push')} (${ahead})` : tr('toolbar.push')}
      </ToolButton>
      <ToolButton title={tr('toolbar.pullFrom')} disabled={busy} onClick={() => void doPull()}>
        <Download size={15} /> {sync.op === 'pull' && busy ? '…' : tr('toolbar.pull')}
      </ToolButton>
      <ToolButton title={tr('toolbar.fetchFrom')} disabled={busy} onClick={() => void doFetch()}>
        <RefreshCw size={15} /> {sync.op === 'fetch' && busy ? '…' : loading ? '…' : tr('toolbar.fetch')}
      </ToolButton>
      <span className="toolbar-sep" />
      <ToolButton title={tr('toolbar.branch')} disabled={!ready} onClick={() => openDlg('branch')}>
        <GitBranch size={15} /> {tr('toolbar.branch')}
      </ToolButton>
      <ToolButton title={tr('toolbar.merge')} disabled={!ready} onClick={() => openDlg('merge')}>
        <GitMerge size={15} /> {tr('toolbar.merge')}
      </ToolButton>
      <ToolButton title={tr('toolbar.rebase')} disabled={!ready} onClick={() => openDlg('rebase')}>
        <Repeat size={15} /> {tr('toolbar.rebase')}
      </ToolButton>
      <ToolButton title={tr('toolbar.cherryPick')} disabled={!ready} onClick={() => openDlg('pick')}>
        <Cherry size={15} /> {tr('toolbar.cherryPick')}
      </ToolButton>
      <span className="toolbar-sep" />
      <ToolButton title={tr('toolbar.stash')} disabled={!ready} onClick={() => openDlg('stash')}>
        <Archive size={15} /> {tr('toolbar.stash')}
      </ToolButton>
      <ToolButton title={tr('toolbar.tag')} disabled={!ready} onClick={() => openDlg('tag')}>
        <Tag size={15} /> {tr('toolbar.tag')}
      </ToolButton>
      <ToolButton title={tr('toolbar.gitflow')} disabled={!ready} onClick={() => openDlg('flow')}>
        <Workflow size={15} /> {tr('toolbar.flow')}
      </ToolButton>
      <span className="toolbar-sep" />
      <ToolButton title={tr('toolbar.history')} disabled={!ready} onClick={() => openDlg('reflog')}>
        <History size={15} />
      </ToolButton>
      <ToolButton title={tr('toolbar.syncStatus')} disabled={!ready} onClick={() => openDlg('remotes')}>
        <ArrowDownUp size={15} />
      </ToolButton>
      <ToolButton
        title={tr('toolbar.terminal')}
        disabled={!ready}
        onClick={() => void dialogOps.openTerminal()}
      >
        <Terminal size={15} />
      </ToolButton>
      <ToolButton title={tr('toolbar.settings')} onClick={() => void openSettings()}>
        <Settings size={15} />
      </ToolButton>
    </div>
  )
}
