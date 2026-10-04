import {
  Archive,
  ArrowDownUp,
  Cherry,
  Check,
  Download,
  ExternalLink,
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

// Barra superior padrão SourceTree moderno: mesma ordem e terminologia da
// visão (`01-visao.md` §4.2), arte própria TreeLine com ícones Lucide.
// Anatomia única: 34px de altura, ícone 16px + label; utilitários à direita
// são quadrados 34px só-ícone; contadores em badge; operação em conflito
// ganha dot de atenção âmbar.
export default function Toolbar({ onCommitFocus }: { onCommitFocus: () => void }) {
  const loading = useStore((s) => s.loading)
  const sync = useStore((s) => s.sync)
  const doPush = useStore((s) => s.doPush)
  const doPull = useStore((s) => s.doPull)
  const doFetch = useStore((s) => s.doFetch)
  const busy = sync.phase === 'running'
  const stagedCount = useStore((s) => s.status?.staged.length ?? 0)
  const ahead = useStore((s) => s.status?.ahead ?? 0)
  const stashCount = useStore((s) => s.stashes.length)
  const mergeBusy = useStore((s) => s.mergeState.inProgress)
  const rebaseBusy = useStore((s) => s.rebaseState.inProgress)
  const pickBusy = useStore((s) => s.pickState.inProgress)
  const openSettings = useStore((s) => s.openSettings)
  const openDlg = useStore((s) => s.openDlg)
  const toggleTerminal = useStore((s) => s.toggleTerminal)
  const doPushForce = useStore((s) => s.doPushForce)
  const openMenu = useStore((s) => s.openMenu)
  const terminalOpen = useStore((s) => s.terminalOpen)
  const current = useStore((s) => s.current)
  const tr = useStore((s) => s.tr)
  const ready = !!current && !busy

  function ActionButton(props: {
    title: string
    disabled?: boolean
    primary?: boolean
    attention?: boolean
    count?: number
    onClick?: () => void
    children: React.ReactNode
  }) {
    return (
      <button
        className={
          'tool-btn' + (props.primary ? ' primary' : '') + (props.attention ? ' attention' : '')
        }
        title={props.title}
        disabled={props.disabled}
        onClick={props.onClick}
      >
        {props.children}
        {(props.count ?? 0) > 0 && <span className="count-badge">{props.count}</span>}
      </button>
    )
  }

  function IconButton(props: { title: string; disabled?: boolean; onClick?: () => void; children: React.ReactNode }) {
    return (
      <button className="tool-btn icon-only" title={props.title} disabled={props.disabled} onClick={props.onClick}>
        {props.children}
      </button>
    )
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="TreeLine">
      <div className="toolbar-group">
        <ActionButton
          title={stagedCount > 0 ? tr('toolbar.commitStaged') : tr('toolbar.commitEmpty')}
          primary
          disabled={stagedCount === 0}
          onClick={onCommitFocus}
        >
          <Check size={16} /> {tr('toolbar.commit')}
        </ActionButton>
      </div>
      <span className="toolbar-sep" />
      <div className="toolbar-group">
        <span
          onContextMenu={(e) => {
            e.preventDefault()
            openMenu(e.clientX, e.clientY, [{ label: tr('menu.pushLease'), onClick: () => void doPushForce() }])
          }}
        >
          <ActionButton
            title={ahead > 0 ? tr('toolbar.pushAhead', { n: ahead }) : tr('toolbar.pushTo')}
            primary={ahead > 0 && !busy}
            disabled={busy}
            count={ahead}
            onClick={() => void doPush()}
          >
            <Upload size={16} /> {sync.op === 'push' && busy ? '…' : tr('toolbar.push')}
          </ActionButton>
        </span>
        <ActionButton title={tr('toolbar.pullFrom')} disabled={busy} onClick={() => void doPull()}>
          <Download size={16} /> {sync.op === 'pull' && busy ? '…' : tr('toolbar.pull')}
        </ActionButton>
        <ActionButton title={tr('toolbar.fetchFrom')} disabled={busy} onClick={() => void doFetch()}>
          <RefreshCw size={16} /> {sync.op === 'fetch' && busy ? '…' : loading ? '…' : tr('toolbar.fetch')}
        </ActionButton>
      </div>
      <span className="toolbar-sep" />
      <div className="toolbar-group">
        <ActionButton title={tr('toolbar.branch')} disabled={!ready} onClick={() => openDlg('branch')}>
          <GitBranch size={16} /> {tr('toolbar.branch')}
        </ActionButton>
        <ActionButton
          title={mergeBusy ? tr('merge.inProg', { f: '' }) : tr('toolbar.merge')}
          disabled={!ready}
          attention={mergeBusy}
          onClick={() => openDlg('merge')}
        >
          <GitMerge size={16} /> {tr('toolbar.merge')}
        </ActionButton>
        <ActionButton title={tr('toolbar.stash')} disabled={!ready} count={stashCount} onClick={() => openDlg('stash')}>
          <Archive size={16} /> {tr('toolbar.stash')}
        </ActionButton>
        <ActionButton title={tr('toolbar.tag')} disabled={!ready} onClick={() => openDlg('tag')}>
          <Tag size={16} /> {tr('toolbar.tag')}
        </ActionButton>
      </div>
      <span className="toolbar-sep" />
      <div className="toolbar-group">
        <ActionButton
          title={rebaseBusy ? tr('rebase.inProg', { f: '' }) : tr('toolbar.rebase')}
          disabled={!ready}
          attention={rebaseBusy}
          onClick={() => openDlg('rebase')}
        >
          <Repeat size={16} /> {tr('toolbar.rebase')}
        </ActionButton>
        <ActionButton
          title={pickBusy ? tr('pick.inProg') : tr('toolbar.cherryPick')}
          disabled={!ready}
          attention={pickBusy}
          onClick={() => openDlg('pick')}
        >
          <Cherry size={16} /> {tr('toolbar.cherryPick')}
        </ActionButton>
        <ActionButton title={tr('toolbar.gitflow')} disabled={!ready} onClick={() => openDlg('flow')}>
          <Workflow size={16} /> {tr('toolbar.flow')}
        </ActionButton>
      </div>
      <span className="toolbar-sep" />
      <div className="toolbar-group toolbar-right">
        <IconButton title={tr('toolbar.history')} disabled={!ready} onClick={() => openDlg('reflog')}>
          <History size={16} />
        </IconButton>
        <IconButton title={tr('toolbar.syncStatus')} disabled={!ready} onClick={() => openDlg('remotes')}>
          <ArrowDownUp size={16} />
        </IconButton>
        <IconButton title={tr('menu.openPR')} disabled={!ready} onClick={() => void dialogOps.openPR()}>
          <ExternalLink size={16} />
        </IconButton>
      <IconButton title={tr('toolbar.terminal')} disabled={!ready} onClick={toggleTerminal}>
        <Terminal size={16} />
      </IconButton>
        <IconButton title={tr('toolbar.settings')} onClick={() => void openSettings()}>
          <Settings size={16} />
        </IconButton>
      </div>
    </div>
  )
}
