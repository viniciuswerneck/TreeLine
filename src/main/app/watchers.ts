// Watcher: avisa o renderer quando a worktree ou o gitdir mudam fora do app
// (terminal, outro GUI). Filtra árvores pesadas (node_modules, dist…) para
// não estourar inotify (ENOSPC) e mantém watches explícitos de HEAD/index.

import { join } from 'node:path'
import { ipcMain, BrowserWindow } from 'electron'
import { readOp } from '../git/runner'
import { gitDirOf } from '../git/helpers'

interface WatchEntry {
  watcher: import('chokidar').FSWatcher
  win: BrowserWindow | null
  timer: NodeJS.Timeout | null
}

const watches = new Map<string, WatchEntry>()

async function watchRepo(repo: string, win: BrowserWindow | null): Promise<void> {
  if (watches.has(repo)) {
    const w = watches.get(repo)
    if (w) w.win = win
    return
  }
  const { watch } = await import('chokidar')
  const gd = await gitDirOf(repo)
  const watcher = watch([repo, join(gd, 'HEAD'), join(gd, 'index')], {
    ignored: (path: string) => {
      // Worktree linkada: o gitdir mora FORA do repo (ex.: .git/worktrees/x).
      // Sem esta exceção o filtro de `.git` abaixo descarta os watches
      // explícitos de HEAD/index e o app deixa de ver commits do terminal.
      if (path === join(gd, 'HEAD') || path === join(gd, 'index')) return false
      const rel = path.startsWith(repo) ? path.slice(repo.length) : path
      // Ignora .git inteiro, EXCETO os arquivos de estado que importam.
      if (rel.startsWith('/.git/')) {
        const keep = ['/.git/HEAD', '/.git/index', '/.git/refs', '/.git/MERGE_HEAD', '/.git/MERGE_MSG', '/.git/CHERRY_PICK_HEAD', '/.git/REVERT_HEAD']
        return !keep.some((k) => rel === k || rel.startsWith(k + '/'))
      }
      // Árvores pesadas: sem elas o watcher monta milhões de inotify watches
      // (node_modules/.cache, build/) e o SO derruba o processo com ENOSPC.
      if (/(^|[/\\])(node_modules|dist|build|target|out|coverage|\.venv|\.next|\.turbo)([/\\]|$)/.test(rel)) return true
      return /(^|[/\\])\.(git|hg|svn)([/\\]|$)/.test(rel)
    },
    ignoreInitial: true,
    // Profundidade limitada: mudanças em .git/… são watches explícitos acima;
    // além de 20 níveis (raro em código) o custo de acompanhar deixa de valer.
    depth: 20
  })
  const entry: WatchEntry = { watcher, win, timer: null }
  const fire = (): void => {
    if (entry.timer) return
    entry.timer = setTimeout(() => {
      entry.timer = null
      entry.win?.webContents.send('treeline:changed', repo)
    }, 700)
  }
  watcher.on('all', () => fire())
  watcher.on('error', () => undefined)
  watches.set(repo, entry)
}

function unwatchRepo(repo: string): void {
  const w = watches.get(repo)
  if (!w) return
  watches.delete(repo)
  if (w.timer) clearTimeout(w.timer)
  void w.watcher.close().catch(() => undefined)
}

ipcMain.handle('treeline:watchRepo', (event, repo: string) =>
  readOp(async () => {
    await watchRepo(repo, BrowserWindow.fromWebContents(event.sender))
  })
)

ipcMain.handle('treeline:unwatchRepo', (_event, repo: string) => {
  unwatchRepo(repo)
})