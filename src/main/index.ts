import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import type { BranchInfo, CommitDetail, CommitInfo, GitIdentity, RepoStatus, SyncResult } from '../shared/types'
import { SPLASH_HTML } from './splash'

// ---------------------------------------------------------------------------
// Bookmarks persistidos em JSON no userData.
// ---------------------------------------------------------------------------
function bookmarksFile(): string {
  return join(app.getPath('userData'), 'bookmarks.json')
}

function asStringList(raw: string): string[] {
  try {
    const list = JSON.parse(raw) as unknown
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

async function readBookmarks(): Promise<string[]> {
  try {
    const list = asStringList(await fs.readFile(bookmarksFile(), 'utf-8'))
    if (list.length > 0) return list
  } catch {
    /* segue para a migração legada */
  }
  // Migração do nome antigo (GitNest -> TreeLine): o userData mudou de
  // ~/.config/GitNest para ~/.config/TreeLine; reaproveita uma vez.
  try {
    const legacy = join(app.getPath('userData'), '..', 'GitNest', 'bookmarks.json')
    const list = asStringList(await fs.readFile(legacy, 'utf-8'))
    if (list.length > 0) {
      await writeBookmarks(list)
      return list
    }
  } catch {
    /* sem legado: lista vazia */
  }
  return []
}

async function writeBookmarks(list: string[]): Promise<string[]> {
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(bookmarksFile(), JSON.stringify(list.slice(0, 30), null, 2))
  return list.slice(0, 30)
}

// ---------------------------------------------------------------------------
// Fila por repo: serializa operações git e evita `index.lock` em
// push+fetch / stage+commit concorrentes.
// ---------------------------------------------------------------------------
const queues = new Map<string, Promise<unknown>>()

function enqueue<T>(repo: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(repo) ?? Promise.resolve()
  const next = prev.then(fn, fn) as Promise<T>
  queues.set(repo, next.catch(() => undefined))
  return next
}

// Sem TTY no Electron, prompt interativo de senha travaria o main.
// Mas ATENÇÃO: simple-git `.env()` SUBSTITUI o env inteiro do filho
// (spawn recebe só as chaves custom), apagando HOME/credential helper.
// Por isso a flag vai no process.env (herdado por todo git spawnado),
// nunca via `.env()`.
if (!process.env['GIT_TERMINAL_PROMPT']) {
  process.env['GIT_TERMINAL_PROMPT'] = '0'
}

// Rede pode pendurar (DNS, auth lenta): timeout explícito com erro legível.
const SYNC_TIMEOUT_MS = 120_000

function withTimeout<T>(op: string, p: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${op} timed out after ${SYNC_TIMEOUT_MS / 1000}s`)), SYNC_TIMEOUT_MS)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

// Erro técnico do git vira orientação acionável: o caso mais comum é remote
// HTTPS sem credencial salva (sem TTY no Electron, o prompt é desabilitado).
function friendlySyncError(op: string, e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e)
  if (/could not read Username|terminal prompts disabled|authentication failed|invalid username|credential/i.test(msg)) {
    return new Error(
      `${op}: o remote HTTPS pede login e não há credencial salva. ` +
        `Rode \`gh auth login\` no terminal, ou troque o remote para SSH. ` +
        `Detalhe: ${msg.split('\n')[0]}`
    )
  }
  return e instanceof Error ? e : new Error(msg)
}

// ---------------------------------------------------------------------------
// Janela principal.
// ---------------------------------------------------------------------------
function createWindow(splash: BrowserWindow | null, splashAt: number): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'TreeLine',
    autoHideMenuBar: true,
    backgroundColor: '#202020',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Splash fica no mínimo 900ms para não piscar; fecha ao mostrar a janela.
  win.once('ready-to-show', () => {
    const wait = Math.max(0, 900 - (Date.now() - splashAt))
    setTimeout(() => {
      splash?.close()
      win.show()
    }, wait)
  })
}

function createSplash(): { win: BrowserWindow; at: number } {
  const win = new BrowserWindow({
    width: 380,
    height: 500,
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
  const html = SPLASH_HTML.replace('__VERSION__', `v${app.getVersion()}`)
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  win.once('ready-to-show', () => win.show())
  return { win, at: Date.now() }
}

// ---------------------------------------------------------------------------
// IPC: repositórios.
// ---------------------------------------------------------------------------
ipcMain.handle('treeline:listRepos', async () => readBookmarks())

ipcMain.handle('treeline:openRepo', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const opts = {
    properties: ['openDirectory' as const],
    title: 'Open repository'
  }
  const res = win
    ? await dialog.showOpenDialog(win, opts)
    : await dialog.showOpenDialog(opts)
  if (res.canceled || res.filePaths.length === 0) return null
  const path = res.filePaths[0] as string
  // Valida que é um repo git antes de aceitar.
  await simpleGit(path).revparse(['--git-dir'])
  const list = [path, ...(await readBookmarks()).filter((p) => p !== path)]
  await writeBookmarks(list)
  return path
})

ipcMain.handle('treeline:addRecent', async (_event, path: string) => {
  const list = [path, ...(await readBookmarks()).filter((p) => p !== path)]
  return writeBookmarks(list)
})

// ---------------------------------------------------------------------------
// IPC: operações git (sempre via CLI do sistema, nunca lib embutida).
// ---------------------------------------------------------------------------
function parseLogBlock(block: string): CommitInfo | null {
  const parts = block.split('\0')
  if (parts.length < 6) return null
  // O git emite \n entre registros mesmo com separador %x1e próprio:
  // todo hash após o primeiro chega como "\n<hash>". Sem trim, a chave
  // nunca casa com o pai reservado e cada commit abre lane nova (staircase).
  const [hashRaw, parentStr, author, date, refStr, message] = parts as [string, string, string, string, string, string]
  const hash = hashRaw.trim()
  if (!hash) return null
  // %D vem como "HEAD -> main, origin/main, tag: v1": expande HEAD em badge próprio.
  const refs = (refStr ? refStr.split(', ') : []).flatMap((r) => {
    if (r.startsWith('HEAD -> ')) return ['HEAD', r.slice('HEAD -> '.length)]
    if (r === 'HEAD') return ['HEAD']
    return [r]
  })
  return {
    hash,
    parents: parentStr ? parentStr.split(/\s+/).map((p) => p.trim()).filter((p) => p.length > 0) : [],
    author,
    date,
    message,
    refs
  }
}

ipcMain.handle('treeline:getStatus', ( _event, repo: string) =>
  enqueue(repo, async (): Promise<RepoStatus> => {
    const s = await simpleGit(repo).status()
    const staged = s.files.filter((f) => f.index !== ' ' && f.index !== '?').map((f) => ({ path: f.path, code: `${f.index}${f.working_dir}` }))
    const unstaged = s.files.filter((f) => f.working_dir !== ' ').map((f) => ({ path: f.path, code: `${f.index}${f.working_dir}` }))
    const untracked = s.files.filter((f) => f.index === '?' && f.working_dir === '?').map((f) => f.path)
    return {
      branch: s.current ?? '(detached)',
      ahead: s.ahead ?? 0,
      behind: s.behind ?? 0,
      staged,
      unstaged,
      untracked
    }
  })
)

ipcMain.handle('treeline:getLog', (_event, repo: string, limit?: number) =>
  enqueue(repo, async (): Promise<CommitInfo[]> => {
    const n = Math.min(Math.max(limit ?? 300, 1), 2000)
    // %x1e (record separator) delimita commits; %x00 delimita campos.
    // Não usar \0\0 como separador: %P vazio (root commit) gera NUL duplo.
    // --topo-order é contrato do lane allocator single-pass: garante que
    // nenhum pai apareça antes de todos os seus filhos (ordem por data pura
    // embaralha a cadeia quando há múltiplas tips com clock skew, e cada
    // commit órfão de reserva vira uma lane nova = staircase).
    const raw = await simpleGit(repo).raw([
      'log', '--all', '--topo-order', `--max-count=${n}`, '--date=iso',
      '--pretty=format:%H%x00%P%x00%an%x00%ad%x00%D%x00%s%x1e'
    ])
    if (!raw.trim()) return []
    return raw.split('\x1e').flatMap((block) => {
      const c = parseLogBlock(block)
      return c ? [c] : []
    })
  })
)

ipcMain.handle('treeline:getBranches', (_event, repo: string) =>
  enqueue(repo, async (): Promise<BranchInfo[]> => {
    const b = await simpleGit(repo).branchLocal()
    return b.all.map((name) => ({ name, current: name === b.current }))
  })
)

ipcMain.handle('treeline:getDiff', (_event, repo: string, file: string, staged: boolean) =>
  enqueue(repo, async () => {
    const args = staged ? ['diff', '--cached', '--unified=3', '--', file] : ['diff', '--unified=3', '--', file]
    return simpleGit(repo).raw(args)
  })
)

ipcMain.handle('treeline:stage', (_event, repo: string, file: string) =>
  enqueue(repo, () => simpleGit(repo).add(file).then(() => undefined))
)

ipcMain.handle('treeline:unstage', (_event, repo: string, file: string) =>
  enqueue(repo, async () => {
    await simpleGit(repo).raw(['reset', '-q', 'HEAD', '--', file])
  })
)

ipcMain.handle('treeline:commit', (_event, repo: string, message: string, amend?: boolean) =>
  enqueue(repo, async () => {
    if (!message.trim()) throw new Error('Commit message is empty')
    // simple-git não rejeita commit sem nada em stage (vira no-op silencioso).
    const st = await simpleGit(repo).status()
    const stagedCount = st.files.filter((f) => f.index !== ' ' && f.index !== '?').length
    if (stagedCount === 0 && !amend) throw new Error('Nothing staged to commit')
    await simpleGit(repo).commit(message, undefined, amend ? { '--amend': null } : undefined)
  })
)

ipcMain.handle('treeline:push', (_event, repo: string) =>
  enqueue(repo, (): Promise<SyncResult> =>
    withTimeout('Push', (async () => {
      const r = await simpleGit(repo).push()
      const items = r.pushed ?? []
      if (items.length === 0) return { summary: 'Push concluído — nothing to update.' }
      const short = (ref: string): string => ref.replace('refs/heads/', '')
      const parts = items.map((p) =>
        p.alreadyUpdated ? `${short(p.local)} already up to date` : `${short(p.local)} → ${short(p.remote)}`
      )
      return { summary: `Push concluído: ${parts.join(', ')}` }
    })().catch((e: unknown): never => {
      throw friendlySyncError('Push', e)
    }))
  )
)

ipcMain.handle('treeline:pull', (_event, repo: string) =>
  enqueue(repo, (): Promise<SyncResult> =>
    withTimeout('Pull', (async () => {
      // ff-only por segurança: divergência vira erro legível em vez de merge surpresa.
      const r = await simpleGit(repo).pull(undefined, undefined, { '--ff-only': null })
      const changes = r.summary?.changes ?? 0
      if (changes === 0) return { summary: 'Pull concluído — already up to date.' }
      const ins = r.summary?.insertions ?? 0
      const del = r.summary?.deletions ?? 0
      return { summary: `Pull concluído: ${changes} file${changes === 1 ? '' : 's'}, +${ins} −${del}` }
    })().catch((e: unknown): never => {
      throw friendlySyncError('Pull', e)
    }))
  )
)

ipcMain.handle('treeline:fetch', (_event, repo: string) =>
  enqueue(repo, (): Promise<SyncResult> =>
    withTimeout('Fetch', (async () => {
      const r = await simpleGit(repo).fetch(['--all', '--prune'])
      const updated = r.updated?.length ?? 0
      const extra = updated > 0 ? ` — ${updated} remote branch${updated === 1 ? '' : 'es'} updated` : ''
      return { summary: `Fetch concluído${extra}.` }
    })().catch((e: unknown): never => {
      throw friendlySyncError('Fetch', e)
    }))
  )
)

// ---------------------------------------------------------------------------
// IPC: identidade do autor (Settings). Global, vale para todos os repos.
// ---------------------------------------------------------------------------
async function getGlobal(key: string): Promise<string> {
  try {
    const v = await simpleGit().raw(['config', '--global', '--get', key])
    return v.trim()
  } catch {
    return ''
  }
}

ipcMain.handle('treeline:getIdentity', async (): Promise<GitIdentity> => {
  const [name, email] = await Promise.all([getGlobal('user.name'), getGlobal('user.email')])
  return { name, email }
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

ipcMain.handle('treeline:setIdentity', async (_event, id: GitIdentity): Promise<void> => {
  const name = id.name.trim()
  const email = id.email.trim()
  if (!name) throw new Error('Nome do autor está vazio')
  if (!EMAIL_RE.test(email)) throw new Error('Email inválido — confira o formato')
  await simpleGit().raw(['config', '--global', 'user.name', name])
  await simpleGit().raw(['config', '--global', 'user.email', email])
})

ipcMain.handle('treeline:getCommitDetail', (_event, repo: string, hash: string) =>
  enqueue(repo, async (): Promise<CommitDetail> => {
    const out = await simpleGit(repo).raw([
      'show', '--name-only', '--date=iso',
      '--pretty=format:%H%x00%P%x00%an%x00%ad%x00%D%x00%s%x1e', hash
    ])
    const [head, ...rest] = out.split('\x1e')
    const info = head ? parseLogBlock(head) : null
    if (!info) throw new Error('Commit não encontrado')
    const files = rest
      .join('\x1e')
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.length > 0)
    return { ...info, files }
  })
)

ipcMain.handle('treeline:getCommitDiff', (_event, repo: string, hash: string, file: string) =>
  enqueue(repo, async () => simpleGit(repo).raw(['show', hash, '--unified=3', '--', file]))
)

// ---------------------------------------------------------------------------
void app.whenReady().then(() => {
  const { win: splash, at } = createSplash()
  createWindow(splash, at)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const s = createSplash()
      createWindow(s.win, s.at)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
