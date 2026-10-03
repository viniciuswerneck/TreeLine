import { useEffect, useRef } from 'react'
import { GitBranch } from 'lucide-react'
import DetailsPanel from './components/DetailsPanel'
import ContextMenu from './components/ContextMenu'
import HistoryGraph from './components/HistoryGraph'
import SettingsDialog from './components/SettingsDialog'
import Sidebar from './components/Sidebar'
import StatusBar from './components/StatusBar'
import SyncToast from './components/SyncToast'
import Toolbar from './components/Toolbar'
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
  const commitRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    applyTheme(theme)
    applyLang(lang)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void loadRepos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      <Toolbar onCommitFocus={() => commitRef.current?.focus()} />
      <div className="body">
        <Sidebar />
        <div className="main">
          <HistoryGraph />
          <DetailsPanel ref={commitRef} />
        </div>
      </div>
      <StatusBar />
      <SyncToast />
      {settingsOpen && <SettingsDialog />}
      <ContextMenu />
    </div>
  )
}
