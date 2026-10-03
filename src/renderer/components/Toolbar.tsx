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
import { useStore } from '../store'
import ThemeMenu from './ThemeMenu'

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

// Ordem de ações familiar do SourceTree (Commit|Push|Pull|Fetch|Branch|Merge|
// Stash|Tag|Rebase|Cherry-Pick|Flow|Terminal|Settings), arte própria TreeLine
// com ícones Lucide. Push/Pull/Fetch funcionam com toast de progresso;
// resto chega nas Fases 1-3 e fica visível porém desabilitado.
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

  return (
    <div className="toolbar">
      <ToolButton
        title={stagedCount > 0 ? 'Commit staged changes' : 'Nothing staged — stage files first'}
        primary
        disabled={stagedCount === 0}
        onClick={onCommitFocus}
      >
        <Check size={15} /> Commit
      </ToolButton>
      <span className="toolbar-sep" />
      <ToolButton
        title={ahead > 0 ? `Push ${ahead} commit${ahead === 1 ? '' : 's'} to remote` : 'Push to remote'}
        primary={ahead > 0 && !busy}
        disabled={busy}
        onClick={() => void doPush()}
      >
        <Upload size={15} /> {sync.op === 'push' && busy ? '…' : ahead > 0 ? `Push (${ahead})` : 'Push'}
      </ToolButton>
      <ToolButton title="Pull from remote (fast-forward only)" disabled={busy} onClick={() => void doPull()}>
        <Download size={15} /> {sync.op === 'pull' && busy ? '…' : 'Pull'}
      </ToolButton>
      <ToolButton title="Fetch from all remotes" disabled={busy} onClick={() => void doFetch()}>
        <RefreshCw size={15} /> {sync.op === 'fetch' && busy ? '…' : loading ? '…' : 'Fetch'}
      </ToolButton>
      <span className="toolbar-sep" />
      <ToolButton title="Branch (Fase 1)" disabled>
        <GitBranch size={15} /> Branch
      </ToolButton>
      <ToolButton title="Merge (Fase 2)" disabled>
        <GitMerge size={15} /> Merge
      </ToolButton>
      <ToolButton title="Rebase (Fase 3)" disabled>
        <Repeat size={15} /> Rebase
      </ToolButton>
      <ToolButton title="Cherry-Pick (Fase 2)" disabled>
        <Cherry size={15} /> Cherry-Pick
      </ToolButton>
      <span className="toolbar-sep" />
      <ToolButton title="Stash (Fase 2)" disabled>
        <Archive size={15} /> Stash
      </ToolButton>
      <ToolButton title="Tag (Fase 2)" disabled>
        <Tag size={15} /> Tag
      </ToolButton>
      <ToolButton title="Git-flow (Fase 3)" disabled>
        <Workflow size={15} /> Flow
      </ToolButton>
      <span className="toolbar-sep" />
      <ToolButton title="History / Reflog (Fase 3)" disabled>
        <History size={15} />
      </ToolButton>
      <ToolButton title="Sync status (Fase 2)" disabled>
        <ArrowDownUp size={15} />
      </ToolButton>
      <ToolButton title="Open in Terminal (Fase 3)" disabled>
        <Terminal size={15} />
      </ToolButton>
      <ToolButton title="Settings" onClick={() => void openSettings()}>
        <Settings size={15} />
      </ToolButton>
      <ThemeMenu />
    </div>
  )
}
