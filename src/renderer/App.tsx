import { useEffect, useRef } from 'react'
import { GitBranch } from 'lucide-react'
import AboutDialog from './components/AboutDialog'
import BlameDialog from './components/BlameDialog'
import BranchDialog from './components/BranchDialog'
import CommandPalette from './components/CommandPalette'
import CodeSearchDialog from './components/CodeSearchDialog'
import CompareDialog from './components/CompareDialog'
import ConflictResolver from './components/ConflictResolver'
import ConfirmDialog from './components/ConfirmDialog'
import CustomActionsDialog from './components/CustomActionsDialog'
import ContextMenu from './components/ContextMenu'
import DetailsPanel from './components/DetailsPanel'
import FileHistoryDialog from './components/FileHistoryDialog'
import FlowDialog from './components/FlowDialog'
import HistoryGraph from './components/HistoryGraph'
import MergeDialog from './components/MergeDialog'
import PickDialog from './components/PickDialog'
import RebaseDialog from './components/RebaseDialog'
import RebaseInteractiveDialog from './components/RebaseInteractiveDialog'
import ReflogDialog from './components/ReflogDialog'
import RemotesDialog from './components/RemotesDialog'
import LfsDialog from './components/LfsDialog'
import ResetDialog from './components/ResetDialog'
import SettingsDialog from './components/SettingsDialog'
import Sidebar from './components/Sidebar'
import StashDialog from './components/StashDialog'
import StatusBar from './components/StatusBar'
import SyncToast from './components/SyncToast'
import TabBar from './components/TabBar'
import TagDialog from './components/TagDialog'
import TerminalPanel from './components/TerminalPanel'
import Toolbar from './components/Toolbar'
import GoToFile from './components/GoToFile'
import { useStore } from './store'
import { applyLang } from './i18n'
import { applyTheme } from './themes'

export default function App() {
  const current = useStore((s) => s.current)
  const loadRepos = useStore((s) => s.loadRepos)
  const openDialog = useStore((s) => s.openDialog)
  const theme = useStore((s) => s.theme)
  const lang = useStore((s) => s.lang)
  const tr = useStore((s) => s.tr)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const dialog = useStore((s) => s.dialog)
  const terminalOpen = useStore((s) => s.terminalOpen)
  const commitRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    applyTheme(theme)
    applyLang(lang)
    document.title = tr('app.title')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void loadRepos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mudanças feitas fora do app (terminal, outro GUI): atualiza ao voltar
  // o foco para a janela + F5 manual + watcher (chokidar no main).
  // Throttle de 2s contra foco repetido.
  // Ctrl+K abre a paleta de comandos.
  useEffect(() => {
    let last = 0
    const maybeRefresh = (): void => {
      const now = Date.now()
      if (now - last < 2000) return
      last = now
      const st = useStore.getState()
      if (st.current && st.sync.phase !== 'running') void st.refresh()
    }
    const onFocus = (): void => maybeRefresh()
    const offChanged = window.treeline.onRepoChanged((repo) => {
      if (repo === useStore.getState().current) maybeRefresh()
    })
    const onKey = (e: KeyboardEvent): void => {
      const st0 = useStore.getState()
      if (st0.matchShortcut('refresh', e)) {
        e.preventDefault()
        maybeRefresh()
        return
      }
      if (st0.matchShortcut('gotoFile', e)) {
        e.preventDefault()
        const st = useStore.getState()
        st.setGoToFileOpen(true)
        return
      }
      if (st0.matchShortcut('codeSearch', e)) {
        e.preventDefault()
        const st = useStore.getState()
        if (st.current) st.openDlg('codeSearch')
        return
      }
      if (st0.matchShortcut('palette', e)) {
        e.preventDefault()
        const st = useStore.getState()
        st.setPalette(!st.paletteOpen)
        return
      }
      if (st0.matchShortcut('sidebar', e)) {
        e.preventDefault()
        useStore.getState().toggleSidebar()
        return
      }
      if (st0.matchShortcut('terminal', e)) {
        const st = useStore.getState()
        // Não rouba crase/backtick digitado dentro do próprio terminal.
        const t = e.target as HTMLElement | null
        if (st.current && !(t && t.closest && t.closest('.xterm'))) {
          e.preventDefault()
          st.toggleTerminal()
        }
      }
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('keydown', onKey)
      offChanged()
    }
  }, [])

  // Observa o repo atual no main (desobserva o anterior).
  const watched = useRef<string | null>(null)
  useEffect(() => {
    if (watched.current && watched.current !== current) {
      void window.treeline.unwatchRepo(watched.current).catch(() => undefined)
    }
    watched.current = current
    if (current) void window.treeline.watchRepo(current).catch(() => undefined)
  }, [current])

  // Fetch automático (Settings; 0 = desligado). Se "executar em segundo plano"
  // estiver desligado, só busca com a janela focada.
  const autoFetchMin = useStore((s) => s.autoFetchMin)
  const autoFetchBg = useStore((s) => s.autoFetchBg)
  useEffect(() => {
    if (!autoFetchMin || !current) return
    const id = window.setInterval(() => {
      const st = useStore.getState()
      if (!st.autoFetchBg && document.hidden) return
      if (st.current && st.sync.phase !== 'running') void st.doFetch()
    }, autoFetchMin * 60_000)
    return () => window.clearInterval(id)
  }, [autoFetchMin, autoFetchBg, current])

  if (!current) {
    return (
      <div className="app">
        <Toolbar onCommitFocus={() => undefined} />
        <div className="welcome">
          <GitBranch size={40} color="var(--accent)" />
          <h1>{tr('app.welcome')}</h1>
          <p>{tr('app.welcomeHint')}</p>
          <button className="tool-btn primary" onClick={() => void openDialog()}>
            {tr('app.openRepo')}
          </button>
        </div>
        <StatusBar />
        <SyncToast />
        {settingsOpen && <SettingsDialog />}
      </div>
    )
  }

  return (
    <div className="app">
      <Toolbar onCommitFocus={() => {
        // Volta para Working Copy e foca o campo de commit.
        void useStore.getState().selectCommit(null)
        setTimeout(() => commitRef.current?.focus(), 80)
      }} />
      <TabBar />
      <div className="body">
        <Sidebar />
        <div className="main">
          <HistoryGraph />
          <DetailsPanel ref={commitRef} />
        </div>
      </div>
      {terminalOpen && <TerminalPanel />}
      <StatusBar />
      <SyncToast />
      {settingsOpen && <SettingsDialog />}
      {dialog === 'branch' && <BranchDialog />}
      <ConflictResolver />
      {dialog === 'merge' && <MergeDialog />}
      {dialog === 'stash' && <StashDialog />}
      {dialog === 'tag' && <TagDialog />}
      {dialog === 'rebase' && <RebaseDialog />}
      {dialog === 'rebaseInteractive' && <RebaseInteractiveDialog />}
      {dialog === 'pick' && <PickDialog />}
      {dialog === 'flow' && <FlowDialog />}
      {dialog === 'reflog' && <ReflogDialog />}
      {dialog === 'remotes' && <RemotesDialog />}
      {dialog === 'reset' && <ResetDialog />}
      {dialog === 'blame' && <BlameDialog />}
      {dialog === 'fileHistory' && <FileHistoryDialog />}
      {dialog === 'compare' && <CompareDialog />}
      {dialog === 'about' && <AboutDialog />}
      {dialog === 'custom' && <CustomActionsDialog />}
      {dialog === 'lfs' && <LfsDialog />}
      {dialog === 'codeSearch' && <CodeSearchDialog />}
      <CommandPalette />
      <GoToFile />
      <ConfirmDialog />
      <ContextMenu />
    </div>
  )
}
