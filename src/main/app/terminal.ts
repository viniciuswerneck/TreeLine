// Terminal: abre emulador externo na pasta do repo (detecção de instalados)
// e terminal integrado (node-pty, uma sessão por repo).

import { ipcMain, BrowserWindow } from 'electron'
import { mx, asLang } from '../messages'
import { readOp } from '../git/runner'

ipcMain.handle('treeline:openTerminal', (_event, repo: string, lang?: unknown) =>
  readOp(async () => {
    const l = asLang(lang)
    const cp = await import('node:child_process')
    const candidates: Array<{ cmd: string; args: (dir: string) => string[] }> = [
      { cmd: 'ptyxis', args: (d) => ['--new-window', `--working-directory=${d}`] },
      { cmd: 'gnome-terminal', args: (d) => [`--working-directory=${d}`] },
      { cmd: 'kgx', args: (d) => [`--working-directory=${d}`] },
      { cmd: 'konsole', args: (d) => ['--workdir', d] },
      { cmd: 'xfce4-terminal', args: (d) => [`--working-directory=${d}`] },
      { cmd: 'x-terminal-emulator', args: (d) => [`--working-directory=${d}`] },
      { cmd: 'xterm', args: () => [] }
    ]
    // 'command -v' é builtin do shell: execFile NÃO o encontra (ENOENT sempre).
    // Usa o binário `which` (debianutils, sempre presente no Ubuntu/Debian).
    const which = (cmd: string): Promise<boolean> =>
      new Promise((resolve) => cp.execFile('which', [cmd], (err) => resolve(!err)))
    for (const c of candidates) {
      if (await which(c.cmd)) {
        cp.spawn(c.cmd, c.args(repo), { cwd: repo, detached: true, stdio: 'ignore' }).unref()
        return
      }
    }
    throw new Error(mx(l, 'noTerminal'))
  })
)

interface TermSession {
  proc: import('node-pty').IPty
  win: BrowserWindow | null
}

const terms = new Map<string, TermSession>()

function loadPty(): typeof import('node-pty') {
  // require tardio: erro vira mensagem legível em vez de quebrar o main.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('node-pty') as typeof import('node-pty')
  if (!mod?.spawn) throw new Error('node-pty unavailable')
  return mod
}

function termStopRepo(repo: string): void {
  const s = terms.get(repo)
  if (!s) return
  terms.delete(repo)
  try {
    s.proc.kill()
  } catch {
    /* já morreu */
  }
}

ipcMain.handle('treeline:termStart', (event, repo: string, cols: number, rows: number) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  termStopRepo(repo)
  const pty = loadPty()
  const shell = process.env['SHELL'] || '/bin/bash'
  const proc = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: Math.min(Math.max(cols || 80, 20), 500),
    rows: Math.min(Math.max(rows || 24, 5), 200),
    cwd: repo,
    env: { ...(process.env as Record<string, string>), TERM: 'xterm-256color' }
  })
  terms.set(repo, { proc, win })
  proc.onData((data) => {
    if (win && !win.isDestroyed()) win.webContents.send('treeline:termData', repo, data)
  })
  proc.onExit(() => {
    // Só limpa se AINDA é esta sessão: um restart (termStop + termStart) não
    // pode ter o onExit da sessão velha matando o registro da nova.
    if (terms.get(repo)?.proc === proc) terms.delete(repo)
    if (win && !win.isDestroyed()) win.webContents.send('treeline:termExit', repo)
  })
})

ipcMain.handle('treeline:termWrite', (_event, repo: string, data: string) => {
  terms.get(repo)?.proc.write(data)
})

ipcMain.handle('treeline:termResize', (_event, repo: string, cols: number, rows: number) => {
  try {
    terms.get(repo)?.proc.resize(
      Math.min(Math.max(cols, 20), 500),
      Math.min(Math.max(rows, 5), 200)
    )
  } catch {
    /* sessão já fechada */
  }
})

ipcMain.handle('treeline:termStop', (_event, repo: string) => {
  termStopRepo(repo)
})

ipcMain.handle('treeline:termAlive', (_event, repo: string) => terms.has(repo))