import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import type { BranchInfo, CommitDetail, CommitInfo, GitIdentity, RepoStatus, SyncResult } from '../shared/types'
import { SPLASH_HTML, SPLASH_MIN_MS } from './splash'

// ---------------------------------------------------------------------------
// Textos por idioma (en/pt/es) para resumos e erros visíveis no toast.
// O renderer passa seu `lang` em push/pull/fetch/commit/discard/identity.
// ---------------------------------------------------------------------------
export type UILang = 'en' | 'pt' | 'es'

function asLang(v: unknown): UILang {
  return v === 'en' || v === 'pt' || v === 'es' ? v : 'en'
}

const STR: Record<string, Record<UILang, string>> = {
  pushUpToDate: {
    en: 'Push done — nothing to update.',
    pt: 'Push concluído — nada para atualizar.',
    es: 'Push completado — nada que actualizar.'
  },
  pushDone: {
    en: 'Push done: {x}',
    pt: 'Push concluído: {x}',
    es: 'Push completado: {x}'
  },
  pushCurrent: {
    en: '{x} already up to date',
    pt: '{x} já atualizado',
    es: '{x} ya actualizado'
  },
  pullUpToDate: {
    en: 'Pull done — already up to date.',
    pt: 'Pull concluído — already up to date.',
    es: 'Pull completado — already up to date.'
  },
  pullDone: {
    en: 'Pull done: {n} file(s), +{i} −{d}',
    pt: 'Pull concluído: {n} arquivo(s), +{i} −{d}',
    es: 'Pull completado: {n} archivo(s), +{i} −{d}'
  },
  fetchDone: {
    en: 'Fetch done.',
    pt: 'Fetch concluído.',
    es: 'Fetch completado.'
  },
  fetchUpdated: {
    en: ' — {n} remote branch(es) updated',
    pt: ' — {n} branch(es) remoto(s) atualizado(s)',
    es: ' — {n} rama(s) remota(s) actualizada(s)'
  },
  timedOut: {
    en: '{op} timed out after {s}s',
    pt: '{op} excedeu o tempo após {s}s',
    es: '{op} agotó el tiempo tras {s}s'
  },
  authFail: {
    en: '{op}: the HTTPS remote asks for login and no credential is saved. Run `gh auth login` in a terminal, or switch the remote to SSH. Detail: {d}',
    pt: '{op}: o remote HTTPS pede login e não há credencial salva. Rode `gh auth login` no terminal, ou troque o remote para SSH. Detalhe: {d}',
    es: '{op}: el remoto HTTPS pide login y no hay credencial guardada. Ejecuta `gh auth login` en una terminal, o cambia el remoto a SSH. Detalle: {d}'
  },
  commitEmpty: {
    en: 'Commit message is empty',
    pt: 'Mensagem de commit vazia',
    es: 'Mensaje de commit vacío'
  },
  nothingStaged: {
    en: 'Nothing staged to commit',
    pt: 'Nada em stage para commitar',
    es: 'Nada en stage para el commit'
  },
  commitNotFound: {
    en: 'Commit not found',
    pt: 'Commit não encontrado',
    es: 'Commit no encontrado'
  },
  nameEmpty: {
    en: 'Author name is empty',
    pt: 'Nome do autor está vazio',
    es: 'El nombre del autor está vacío'
  },
  emailInvalid: {
    en: 'Invalid email — check the format',
    pt: 'Email inválido — confira o formato',
    es: 'Email inválido — revisa el formato'
  },
  discardTitle: {
    en: 'Discard changes',
    pt: 'Descartar alterações',
    es: 'Descartar cambios'
  },
  discardMsg: {
    en: 'Discard changes in {f}?',
    pt: 'Descartar alterações em {f}?',
    es: '¿Descartar cambios en {f}?'
  },
  discardTracked: {
    en: 'Tracked file: restores the last committed version. Cannot be undone.',
    pt: 'Arquivo rastreado: restaura a última versão commitada. Não dá para desfazer.',
    es: 'Archivo rastreado: restaura la última versión commiteada. No se puede deshacer.'
  },
  discardUntracked: {
    en: 'Untracked file: moves it to the Trash. You can restore it from there.',
    pt: 'Arquivo não rastreado: move para a Lixeira. Dá para restaurar de lá.',
    es: 'Archivo no rastreado: lo mueve a la Papelera. Puedes restaurarlo desde allí.'
  },
  btnCancel: { en: 'Cancel', pt: 'Cancelar', es: 'Cancelar' },
  btnDiscard: { en: 'Discard', pt: 'Descartar', es: 'Descartar' }
}

function mx(lang: UILang, key: string, vars?: Record<string, string | number>): string {
  let s: string = STR[key]?.[lang] ?? STR[key]?.['en'] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  }
  return s
}

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

function withTimeout<T>(op: string, p: Promise<T>, lang: UILang = 'en'): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(mx(lang, 'timedOut', { op, s: SYNC_TIMEOUT_MS / 1000 }))),
      SYNC_TIMEOUT_MS
    )
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

// Erro técnico do git vira orientação acionável: o caso mais comum é remote
// HTTPS sem credencial salva (sem TTY no Electron, o prompt é desabilitado).
function friendlySyncError(op: string, e: unknown, lang: UILang = 'en'): Error {
  const msg = e instanceof Error ? e.message : String(e)
  if (/could not read Username|terminal prompts disabled|authentication failed|invalid username|credential/i.test(msg)) {
    return new Error(mx(lang, 'authFail', { op, d: msg.split('\n')[0] as string }))
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

  // Splash fica 3s na tela (SPLASH_MIN_MS) para não piscar; fecha ao mostrar a janela.
  win.once('ready-to-show', () => {
    const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - splashAt))
    setTimeout(() => {
      splash?.close()
      win.show()
    }, wait)
  })
}

function createSplash(): { win: BrowserWindow; at: number } {
  const win = new BrowserWindow({
    width: 460,
    height: 400,
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

ipcMain.handle('treeline:commit', (_event, repo: string, message: string, amend?: boolean, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    if (!message.trim()) throw new Error(mx(l, 'commitEmpty'))
    // simple-git não rejeita commit sem nada em stage (vira no-op silencioso).
    const st = await simpleGit(repo).status()
    const stagedCount = st.files.filter((f) => f.index !== ' ' && f.index !== '?').length
    if (stagedCount === 0 && !amend) throw new Error(mx(l, 'nothingStaged'))
    await simpleGit(repo).commit(message, undefined, amend ? { '--amend': null } : undefined)
  })
)

ipcMain.handle('treeline:push', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, (): Promise<SyncResult> =>
    withTimeout('Push', (async () => {
      const l = asLang(lang)
      const r = await simpleGit(repo).push()
      const items = r.pushed ?? []
      if (items.length === 0) return { summary: mx(l, 'pushUpToDate') }
      const short = (ref: string): string => ref.replace('refs/heads/', '')
      const parts = items.map((p) =>
        p.alreadyUpdated ? mx(l, 'pushCurrent', { x: short(p.local) }) : `${short(p.local)} → ${short(p.remote)}`
      )
      return { summary: mx(l, 'pushDone', { x: parts.join(', ') }) }
    })().catch((e: unknown): never => {
      throw friendlySyncError('Push', e, asLang(lang))
    }), asLang(lang))
  )
)

ipcMain.handle('treeline:pull', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, (): Promise<SyncResult> =>
    withTimeout('Pull', (async () => {
      const l = asLang(lang)
      // ff-only por segurança: divergência vira erro legível em vez de merge surpresa.
      const r = await simpleGit(repo).pull(undefined, undefined, { '--ff-only': null })
      const changes = r.summary?.changes ?? 0
      if (changes === 0) return { summary: mx(l, 'pullUpToDate') }
      const ins = r.summary?.insertions ?? 0
      const del = r.summary?.deletions ?? 0
      return { summary: mx(l, 'pullDone', { n: changes, i: ins, d: del }) }
    })().catch((e: unknown): never => {
      throw friendlySyncError('Pull', e, asLang(lang))
    }), asLang(lang))
  )
)

ipcMain.handle('treeline:fetch', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, (): Promise<SyncResult> =>
    withTimeout('Fetch', (async () => {
      const l = asLang(lang)
      const r = await simpleGit(repo).fetch(['--all', '--prune'])
      const updated = r.updated?.length ?? 0
      const extra = updated > 0 ? mx(l, 'fetchUpdated', { n: updated }) : ''
      return { summary: `${mx(l, 'fetchDone')}${extra}` }
    })().catch((e: unknown): never => {
      throw friendlySyncError('Fetch', e, asLang(lang))
    }), asLang(lang))
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

ipcMain.handle('treeline:setIdentity', async (_event, id: GitIdentity, lang?: unknown): Promise<void> => {
  const l = asLang(lang)
  const name = id.name.trim()
  const email = id.email.trim()
  if (!name) throw new Error(mx(l, 'nameEmpty'))
  if (!EMAIL_RE.test(email)) throw new Error(mx(l, 'emailInvalid'))
  await simpleGit().raw(['config', '--global', 'user.name', name])
  await simpleGit().raw(['config', '--global', 'user.email', email])
})

ipcMain.handle('treeline:getCommitDetail', (_event, repo: string, hash: string, lang?: unknown) =>
  enqueue(repo, async (): Promise<CommitDetail> => {
    const out = await simpleGit(repo).raw([
      'show', '--name-only', '--date=iso',
      '--pretty=format:%H%x00%P%x00%an%x00%ad%x00%D%x00%s%x1e', hash
    ])
    const [head, ...rest] = out.split('\x1e')
    const info = head ? parseLogBlock(head) : null
    if (!info) throw new Error(mx(asLang(lang), 'commitNotFound'))
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
// IPC: utilidades de SO (reveal, clipboard, bookmarks) e descarte seguro.
// ---------------------------------------------------------------------------
ipcMain.handle('treeline:reveal', (_event, path: string) => {
  shell.showItemInFolder(path)
})

ipcMain.handle('treeline:copyText', (_event, text: string) => {
  clipboard.writeText(text)
})

ipcMain.handle('treeline:removeRecent', async (_event, path: string) => {
  const list = (await readBookmarks()).filter((p) => p !== path)
  return writeBookmarks(list)
})

ipcMain.handle('treeline:discard', async (event, repo: string, file: string, tracked: boolean, lang?: unknown) => {
  const l = asLang(lang)
  const win = BrowserWindow.fromWebContents(event.sender)
  const opts = {
    type: 'warning' as const,
    title: mx(l, 'discardTitle'),
    message: mx(l, 'discardMsg', { f: file }),
    detail: tracked ? mx(l, 'discardTracked') : mx(l, 'discardUntracked'),
    buttons: [mx(l, 'btnCancel'), mx(l, 'btnDiscard')],
    defaultId: 0,
    cancelId: 0
  }
  const res = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
  if (res.response !== 1) return
  await enqueue(repo, async () => {
    if (tracked) {
      await simpleGit(repo).raw(['checkout', '--', file])
    } else {
      await shell.trashItem(join(repo, file))
    }
  })
})

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
