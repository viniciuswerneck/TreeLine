// TreeLine — bootstrap do processo main (10.4/10.5). Handlers vivem nos
// módulos registrados abaixo (efeito colateral de import); este arquivo cuida
// só de janela/splash + ciclo de vida do app.
//
// Ordem dos imports importa: o setup de env (GIT_TERMINAL_PROMPT, LC_ALL,
// GIT_EDITOR) precisa rodar antes de qualquer handler ser chamado pelo
// renderer — como todos os `git/*` reexportam nada e só registram IPC na
// carga, a leitura é segura em qualquer ordem, mas o env fica no topo.

// Sem TTY no Electron, prompt interativo de senha travaria o main.
// Mas ATENÇÃO: simple-git `.env()` SUBSTITUI o env inteiro do filho
// (spawn recebe só as chaves custom), apagando HOME/credential helper.
// Por isso a flag vai no process.env (herdado por todo git spawnado),
// nunca via `.env()`.
// LC_ALL=C: com LANG=pt_BR o git localiza "[à frente 1]" e o simple-git
// (regex /ahead (\d+)/) e o parse de `branch -vv` falham. Datas usam
// --date=iso (independente de locale) e os textos da UI vêm do nosso i18n,
// então forçar C nos filhos é seguro.
if (!process.env['GIT_TERMINAL_PROMPT']) {
  process.env['GIT_TERMINAL_PROMPT'] = '0'
}
if (!process.env['LC_ALL']) {
  process.env['LC_ALL'] = 'C'
}
// Operações como `rebase --continue` ou `git flow finish` podem abrir editor:
// sem TTY no Electron isso travaria o main. `true` fecha o editor na hora.
if (!process.env['GIT_EDITOR']) {
  process.env['GIT_EDITOR'] = 'true'
}

import { app, BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { SPLASH_H, SPLASH_MIN_MS, SPLASH_W, splashHtml, splashImagePath, splashLang, type SplashLang } from './splash'
import { placeWindow, readWindowState, writeWindowState, type WindowState } from './window-state'

// Módulos de domínio (git) e infra (app): cada import registra seus handlers
// no ipcMain via efeito colateral — o mesmo padrão do antigo `git/search.ts`.
import './git/branch'
import './git/merge'
import './git/stash'
import './git/tag'
import './git/rebase'
import './git/pick'
import './git/revert'
import './git/flow'
import './git/reflog'
import './git/backup'
import './git/remote'
import './git/sync'
import './git/status'
import './git/history'
import './git/commit'
import './git/diff'
import './git/conflict'
import './git/lfs'
import './git/submodule'
import './git/worktree'
import './git/search'
import './git/pr'
import './app/bookmarks'
import './app/terminal'
import './app/watchers'
import './app/settings'
import './app/updates'
import './app/customActions'
import './app/identity'
import './app/sys'

const APP_TITLE: Record<SplashLang, string> = {
  en: 'TreeLine — Where the Git maze becomes a straight path - WerneckLab',
  pt: 'TreeLine — Onde o labirinto do Git vira um caminho reto - WerneckLab',
  es: 'TreeLine — Donde el laberinto de Git se vuelve un camino recto - WerneckLab'
}

// ---------------------------------------------------------------------------
// Janela principal.
// ---------------------------------------------------------------------------
async function createWindow(splash: BrowserWindow | null, splashAt: number): Promise<void> {
  const saved = placeWindow(await readWindowState())
  const win = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    ...(saved.x !== undefined && saved.y !== undefined ? { x: saved.x, y: saved.y } : {}),
    minWidth: 960,
    minHeight: 600,
    title: APP_TITLE[splashLang()],
    autoHideMenuBar: true,
    backgroundColor: '#202020',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (saved.maximized) win.maximize()

  // Persiste geometria com debounce (resize/move disparam em rajada) e no close.
  let stateTimer: NodeJS.Timeout | null = null
  const saveState = (): void => {
    if (win.isDestroyed()) return
    const b = win.getNormalBounds()
    const state: WindowState = { x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() }
    writeWindowState(state)
  }
  const scheduleSave = (): void => {
    if (stateTimer) clearTimeout(stateTimer)
    stateTimer = setTimeout(saveState, 400)
    stateTimer.unref?.()
  }
  win.on('resize', scheduleSave)
  win.on('move', scheduleSave)
  win.on('close', () => {
    if (stateTimer) clearTimeout(stateTimer)
    saveState()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Splash fica o mínimo anti-flash (SPLASH_MIN_MS ≈ 0.9s) e fecha ao mostrar
  // a janela. Fallback: em Wayland sem GPU (--disable-gpu) o 'ready-to-show'
  // pode nunca disparar e o usuário ficaria preso no splash; o timeout garante
  // a saída.
  let shown = false
  const showMain = (): void => {
    if (shown || win.isDestroyed()) return
    shown = true
    splash?.close()
    win.show()
  }
  win.once('ready-to-show', () => {
    console.log('[treeline] main ready-to-show')
    const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - splashAt))
    setTimeout(showMain, wait)
  })
  const fallbackTimer = setTimeout(showMain, SPLASH_MIN_MS + 8000)
  fallbackTimer.unref?.()
  win.on('close', () => clearTimeout(fallbackTimer))
  win.webContents.on('did-finish-load', () => console.log('[treeline] main did-finish-load'))
  win.webContents.on('did-fail-load', (_e, code, desc) => console.error(`[treeline] main did-fail-load ${code} ${desc}`))
}

async function createSplash(): Promise<{ win: BrowserWindow; at: number }> {
  const win = new BrowserWindow({
    width: SPLASH_W,
    height: SPLASH_H,
    resizable: false,
    minimizable: false,
    maximizable: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    center: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  const img = `file://${splashImagePath()}`
  let src = img
  try {
    // data: URL não carrega sub-recurso file:// — embute em base64.
    const buf = await fs.readFile(splashImagePath())
    src = `data:image/jpeg;base64,${buf.toString('base64')}`
  } catch {
    /* segue com file:// */
  }
  const html = splashHtml(src, app.getVersion(), splashLang())
  // HTML em arquivo temporário: URL data: gigante derruba o renderer.
  try {
    const { tmpdir } = await import('node:os')
    const { randomBytes } = await import('node:crypto')
    const file = join(tmpdir(), `treeline-splash-${randomBytes(4).toString('hex')}.html`)
    await fs.writeFile(file, html)
    await win.loadFile(file)
    win.once('closed', () => void fs.rm(file, { force: true }).catch(() => undefined))
  } catch {
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  }
  win.once('ready-to-show', () => win.show())
  return { win, at: Date.now() }
}

void app.whenReady().then(async () => {
  const { win: splash, at } = await createSplash()
  await createWindow(splash, at)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createSplash().then((s) => createWindow(s.win, s.at))
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})