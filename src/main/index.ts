import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { simpleGit } from 'simple-git'
import type { BranchInfo, CommitDetail, CommitInfo, GitIdentity, RepoStatus, SyncResult } from '../shared/types'
import { SPLASH_H, SPLASH_MIN_MS, SPLASH_W, splashHtml, splashImagePath, splashLang, type SplashLang } from './splash'

const APP_TITLE: Record<SplashLang, string> = {
  en: 'TreeLine — Where the Git maze becomes a straight path - WerneckLab',
  pt: 'TreeLine — Onde o labirinto do Git vira um caminho reto - WerneckLab',
  es: 'TreeLine — Donde el laberinto de Git se vuelve un camino recto - WerneckLab'
}

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
  syncCancelled: {
    en: '{op} cancelled.',
    pt: '{op} cancelado.',
    es: '{op} cancelado.'
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
  btnDiscard: { en: 'Discard', pt: 'Descartar', es: 'Descartar' },
  nameInvalid: {
    en: 'Invalid name for git: {x}',
    pt: 'Nome inválido para o git: {x}',
    es: 'Nombre inválido para git: {x}'
  },
  mergeConflicts: {
    en: 'Merge stopped on conflicts — resolve the files, then Continue, or Abort. {d}',
    pt: 'Merge parou em conflitos — resolva os arquivos, depois Continue, ou Abort. {d}',
    es: 'Merge detenido por conflictos — resuelve los archivos, luego Continue, o Abort. {d}'
  },
  rebaseConflicts: {
    en: 'Rebase stopped on conflicts — resolve the files, then Continue, or Abort. {d}',
    pt: 'Rebase parou em conflitos — resolva os arquivos, depois Continue, ou Abort. {d}',
    es: 'Rebase detenido por conflictos — resuelve los archivos, luego Continue, o Abort. {d}'
  },
  pickConflicts: {
    en: 'Cherry-pick stopped on conflicts — resolve the files, then Continue, or Abort. {d}',
    pt: 'Cherry-pick parou em conflitos — resolva os arquivos, depois Continue, ou Abort. {d}',
    es: 'Cherry-pick detenido por conflictos — resuelve los archivos, luego Continue, o Abort. {d}'
  },
  noTerminal: {
    en: 'No terminal emulator found (looked for ptyxis, gnome-terminal, kgx, konsole, xfce4-terminal, x-terminal-emulator, xterm).',
    pt: 'Nenhum emulador de terminal encontrado (procurei ptyxis, gnome-terminal, kgx, konsole, xfce4-terminal, x-terminal-emulator, xterm).',
    es: 'Ningún emulador de terminal encontrado (busqué ptyxis, gnome-terminal, kgx, konsole, xfce4-terminal, x-terminal-emulator, xterm).'
  },
  flowNoBase: {
    en: 'No base branch (develop/main) found for {t} {n}.',
    pt: 'Branch base (develop/main) não encontrado para {t} {n}.',
    es: 'Rama base (develop/main) no encontrada para {t} {n}.'
  },
  flowTaken: {
    en: 'Cannot create {x}: it collides with existing branch {y} (git forbids a branch and a folder with the same prefix). Pick another name.',
    pt: 'Não dá para criar {x}: colide com o branch existente {y} (o git proíbe branch e pasta com o mesmo prefixo). Escolha outro nome.',
    es: 'No se puede crear {x}: colisiona con el branch existente {y} (git prohíbe branch y carpeta con el mismo prefijo). Elige otro nombre.'
  },
  flowMissing: {
    en: 'Cannot finish: branch {x} does not exist (did you rename or delete it?).',
    pt: 'Não dá para finalizar: o branch {x} não existe (renomeou ou deletou?).',
    es: 'No se puede finalizar: el branch {x} no existe (¿lo renombraste o borraste?).'
  },
  backupRestored: {
    en: 'Restored {n} branch(es) from backup under {x}/ (delete them when done).',
    pt: '{n} branch(es) restaurados do backup em {x}/ (delete quando terminar).',
    es: '{n} branch(es) restaurados del backup en {x}/ (bórralos al terminar).'
  },
  noHunk: {
    en: 'Hunk {n} not found — the diff changed. Refresh and try again.',
    pt: 'Hunk {n} não encontrado — o diff mudou. Atualize e tente de novo.',
    es: 'Hunk {n} no encontrado — el diff cambió. Actualiza e inténtalo de nuevo.'
  },
  noLines: {
    en: 'Select at least one changed line (+/−).',
    pt: 'Selecione ao menos uma linha alterada (+/−).',
    es: 'Selecciona al menos una línea cambiada (+/−).'
  },
  revertConflicts: {
    en: 'Revert stopped on conflicts — resolve the files, then commit, or run `git revert --abort`. {d}',
    pt: 'Revert parou em conflitos — resolva os arquivos, depois commite, ou rode `git revert --abort`. {d}',
    es: 'Revert detenido por conflictos — resuelve los archivos, luego commitea, o ejecuta `git revert --abort`. {d}'
  },
  revertNothing: {
    en: 'No revert in progress — nothing to abort.',
    pt: 'Nenhum revert em andamento — nada para abortar.',
    es: 'Ningún revert en curso — nada que abortar.'
  },
  checkoutDirty: {
    en: 'Checkout blocked: uncommitted changes would be overwritten. Commit, stash or discard them first, then checkout again. {d}',
    pt: 'Checkout bloqueado: há alterações não commitadas que seriam sobrescritas. Commite, dê stash ou descarte antes, e faça checkout de novo. {d}',
    es: 'Checkout bloqueado: hay cambios sin commitear que se sobrescribirían. Commitea, haz stash o descarta antes, e intenta de nuevo. {d}'
  },
  resetDone: {
    en: 'Reset {m} to {r} done (backup bundle kept).',
    pt: 'Reset {m} para {r} concluído (backup bundle guardado).',
    es: 'Reset {m} a {r} completado (backup bundle guardado).'
  },
  pushLeaseDone: {
    en: 'Force-push with lease done: {x}',
    pt: 'Force-push com lease concluído: {x}',
    es: 'Force-push con lease completado: {x}'
  },
  noUpstream: {
    en: 'No upstream configured for {b}. Set it first (Sidebar → branch → Set upstream).',
    pt: 'Sem upstream configurado para {b}. Configure antes (Sidebar → branch → Set upstream).',
    es: 'Sin upstream configurado para {b}. Configúralo antes (Sidebar → rama → Set upstream).'
  },
  prOpened: {
    en: 'No pull-request URL detected for remote {r} ({u}). Opened the repo URL instead.',
    pt: 'Nenhuma URL de pull-request detectada para o remoto {r} ({u}). Abri a URL do repo.',
    es: 'Ninguna URL de pull-request detectada para el remoto {r} ({u}). Abrí la URL del repo.'
  }
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

// Rede pode pendurar (DNS, auth lenta): timeout com kill no spawn (ver
// `runGitCancellable` abaixo) + erro legível.
const SYNC_TIMEOUT_MS = 120_000

// ---------------------------------------------------------------------------
// Git com cancel real: network ops (push/pull/fetch/clone) rodam em spawn
// próprio com AbortController — timeout MATA o filho (SIGTERM→SIGKILL) e a UI
// pode cancelar via `treeline:cancelSync`. simple-git não expõe o filho,
// então aqui é `git` direto com env herdado (helpers/flags do process.env).
// ---------------------------------------------------------------------------
import { spawn } from 'node:child_process'

const syncControllers = new Map<string, AbortController>()

interface GitRun {
  stdout: string
  stderr: string
}

function runGitCancellable(repo: string, opKey: string, args: string[], lang: UILang): Promise<GitRun> {
  // Uma sync por vez por repo: cancela a anterior antes de começar.
  syncControllers.get(`${repo}:${opKey}`)?.abort()
  const ctrl = new AbortController()
  syncControllers.set(`${repo}:${opKey}`, ctrl)
  return new Promise<GitRun>((resolve, reject) => {
    const child = spawn('git', args, { cwd: repo, signal: ctrl.signal, timeout: SYNC_TIMEOUT_MS, env: process.env })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => {
      stdout += String(d)
      if (stdout.length > 1_000_000) stdout = stdout.slice(-1_000_000)
    })
    child.stderr?.on('data', (d) => {
      stderr += String(d)
      if (stderr.length > 1_000_000) stderr = stderr.slice(-1_000_000)
    })
    const done = (err: Error | null): void => {
      syncControllers.delete(`${repo}:${opKey}`)
      if (err) reject(err)
      else resolve({ stdout, stderr })
    }
    child.on('error', (e) => done(e instanceof Error ? e : new Error(String(e))))
    child.on('close', (code, signal) => {
      if (ctrl.signal.aborted) {
        done(new Error(mx(lang, 'syncCancelled', { op: opKey })))
      } else if (code !== 0) {
        done(new Error((stderr || stdout).trim().split('\n')[0] || `git ${args[0]} failed (${code})`))
      } else {
        done(null)
      }
    })
  })
}

ipcMain.handle('treeline:cancelSync', (_event, repo: string, op: string) => {
  syncControllers.get(`${repo}:${op}`)?.abort()
})

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
// IPC genérico: confirmação nativa (operações destrutivas).
// Textos vêm do renderer (i18n); o main só exibe. Retorna true = confirmar.
// ---------------------------------------------------------------------------
ipcMain.handle(
  'treeline:confirm',
  async (event, title: string, message: string, detail: string, ok: string, cancel: string) => {
    const opts = {
      type: 'question' as const,
      title,
      message,
      detail,
      buttons: [cancel, ok],
      defaultId: 0,
      cancelId: 0
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    const res = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
    return res.response === 1
  }
)

async function exists(path: string): Promise<boolean> {
  try {
    await fs.stat(path)
    return true
  } catch {
    return false
  }
}

/** Valida nome de branch/tag no git; erro legível no idioma da UI. */
async function assertRefName(repo: string, kind: 'branch' | 'tag', name: string, lang: UILang): Promise<void> {
  const target = kind === 'branch' ? name : `refs/tags/${name}`
  try {
    await simpleGit(repo).raw(['check-ref-format', '--branch', target])
  } catch {
    throw new Error(mx(lang, 'nameInvalid', { x: name }))
  }
}

/** Erro do git vira orientação de conflito (merge/rebase/pick) quando for o caso. */
function conflictErr(key: string, e: unknown, lang: UILang): Error {
  const msg = e instanceof Error ? e.message : String(e)
  if (/CONFLICT|conflict|needs merge|failed to merge/i.test(msg)) {
    return new Error(mx(lang, key, { d: msg.split('\n')[0] as string }))
  }
  return e instanceof Error ? e : new Error(msg)
}

/** gitdir real do repo. Em worktree linkada/submódulo, `.git` é ARQUIVO
 * (`gitdir: ...`) — `join(repo,'.git',X)` não existe e o estado da operação
 * (merge/rebase/pick) dava falso-negativo. Ver ADR-013. */
async function gitDirOf(repo: string): Promise<string> {
  try {
    const raw = (await simpleGit(repo).revparse(['--git-dir'])).trim()
    return isAbsolute(raw) ? raw : join(repo, raw)
  } catch {
    return join(repo, '.git')
  }
}

// ---------------------------------------------------------------------------
// IPC: Branch (create/checkout/rename/delete).
// ---------------------------------------------------------------------------
ipcMain.handle('treeline:createBranch', (_event, repo: string, name: string, from: string, checkout: boolean, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    const n = name.trim()
    await assertRefName(repo, 'branch', n, l)
    const start = from.trim() || 'HEAD'
    if (checkout) await simpleGit(repo).checkoutBranch(n, start)
    else await simpleGit(repo).branch([n, start])
  })
)

ipcMain.handle('treeline:checkoutBranch', (_event, repo: string, name: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    try {
      await simpleGit(repo).checkout(name)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/local changes|would be overwritten|needs merge|unstaged changes/i.test(msg)) {
        throw new Error(mx(l, 'checkoutDirty', { d: msg.split('\n')[0] as string }))
      }
      throw e instanceof Error ? e : new Error(msg)
    }
  })
)

ipcMain.handle('treeline:checkoutRemote', (_event, repo: string, remoteBranch: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const rb = remoteBranch.trim()
    const slash = rb.indexOf('/')
    if (slash < 0) throw new Error(mx(asLang(lang), 'nameInvalid', { x: rb }))
    const local = rb.slice(slash + 1)
    await assertRefName(repo, 'branch', local, asLang(lang))
    try {
      // Cria branch local com tracking; se já existir, só faz checkout dela.
      await simpleGit(repo).raw(['checkout', '--track', rb])
    } catch {
      await simpleGit(repo).checkout(local)
    }
  })
)

ipcMain.handle('treeline:checkoutTag', (_event, repo: string, tag: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    const t = tag.trim()
    await assertRefName(repo, 'tag', t, l)
    // `tags/<n>` sem ambiguidade com branch de mesmo nome; destaca o HEAD.
    try {
      await simpleGit(repo).raw(['checkout', `tags/${t}`])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/local changes|would be overwritten|needs merge|unstaged changes/i.test(msg)) {
        throw new Error(mx(l, 'checkoutDirty', { d: msg.split('\n')[0] as string }))
      }
      throw e instanceof Error ? e : new Error(msg)
    }
  })
)

ipcMain.handle('treeline:renameBranch', (_event, repo: string, oldName: string, newName: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    const n = newName.trim()
    await assertRefName(repo, 'branch', n, l)
    await simpleGit(repo).branch(['-m', oldName, n])
  })
)

ipcMain.handle('treeline:deleteBranch', (_event, repo: string, name: string, force: boolean) =>
  enqueue(repo, async () => {
    await backupBundle(repo)
    await simpleGit(repo).branch([force ? '-D' : '-d', name])
  })
)

// ---------------------------------------------------------------------------
// IPC: Merge (preview, merge, continue, abort).
// ---------------------------------------------------------------------------
ipcMain.handle('treeline:getMergeState', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async (): Promise<import('../shared/types').OpState> => {
    const gd = await gitDirOf(repo)
    if (!(await exists(join(gd, 'MERGE_HEAD')))) return { inProgress: false }
    let target: string | undefined
    try {
      const msg = await fs.readFile(join(gd, 'MERGE_MSG'), 'utf-8')
      target = msg.match(/Merge (?:branch|remote-tracking branch|tag) '([^']+)'/)?.[1]
    } catch {
      /* alvo desconhecido */
    }
    return { inProgress: true, target }
  })()
)

ipcMain.handle('treeline:mergePreview', (_event, repo: string, ref: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async (): Promise<import('../shared/types').MergePreview> => {
    const git = simpleGit(repo)
    const [filesRaw, countRaw] = await Promise.all([
      git.raw(['diff', '--name-only', `HEAD...${ref}`]),
      git.raw(['rev-list', '--count', `HEAD..${ref}`])
    ])
    return {
      files: filesRaw.split('\n').map((f) => f.trim()).filter(Boolean),
      commits: Number.parseInt(countRaw.trim(), 10) || 0
    }
  })()
)

ipcMain.handle('treeline:mergeBranch', (_event, repo: string, ref: string, noFf: boolean, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    try {
      await simpleGit(repo).merge([ref, ...(noFf ? ['--no-ff'] : [])])
    } catch (e) {
      throw conflictErr('mergeConflicts', e, l)
    }
  })
)

ipcMain.handle('treeline:mergeContinue', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    try {
      await simpleGit(repo).raw(['commit', '--no-edit'])
    } catch (e) {
      throw conflictErr('mergeConflicts', e, l)
    }
  })
)

ipcMain.handle('treeline:abortMerge', (_event, repo: string) =>
  enqueue(repo, () => simpleGit(repo).merge(['--abort']).then(() => undefined))
)

// ---------------------------------------------------------------------------
// IPC: Stash (list/create/apply/pop/drop).
// ---------------------------------------------------------------------------
function parseStashList(raw: string): import('../shared/types').StashInfo[] {
  if (!raw.trim()) return []
  return raw.split('\x1e').flatMap((block) => {
    const parts = block.split('\0')
    if (parts.length < 3) return []
    const [ref, hash, ...rest] = parts
    if (!ref?.trim()) return []
    return [{ ref: ref.trim(), hash: (hash ?? '').trim(), message: rest.join('\0').trim() }]
  })
}

ipcMain.handle('treeline:getStashes', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async () => parseStashList(await simpleGit(repo).raw(['stash', 'list', '--pretty=format:%gd%x00%H%x00%s%x1e'])))()
)

ipcMain.handle('treeline:createStash', (_event, repo: string, message: string, includeUntracked: boolean) =>
  enqueue(repo, async () => {
    const args = ['stash', 'push']
    if (includeUntracked) args.push('-u')
    if (message.trim()) args.push('-m', message.trim())
    await simpleGit(repo).raw(args)
  })
)

ipcMain.handle('treeline:applyStash', (_event, repo: string, ref: string, lang?: unknown) =>
  enqueue(repo, async () => {
    try {
      await simpleGit(repo).raw(['stash', 'apply', ref])
    } catch (e) {
      throw conflictErr('mergeConflicts', e, asLang(lang))
    }
  })
)

ipcMain.handle('treeline:popStash', (_event, repo: string, ref: string, lang?: unknown) =>
  enqueue(repo, async () => {
    try {
      await simpleGit(repo).raw(['stash', 'pop', ref])
    } catch (e) {
      throw conflictErr('mergeConflicts', e, asLang(lang))
    }
  })
)

ipcMain.handle('treeline:dropStash', (_event, repo: string, ref: string) =>
  enqueue(repo, async () => {
    await backupBundle(repo)
    await simpleGit(repo).raw(['stash', 'drop', ref])
  })
)

// ---------------------------------------------------------------------------
// IPC: Tag (list/create/push/delete).
// ---------------------------------------------------------------------------
ipcMain.handle('treeline:getTags', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async (): Promise<import('../shared/types').TagInfo[]> => {
    const raw = await simpleGit(repo).raw(['for-each-ref', '--sort=-creatordate', '--format=%(refname:short)%09%(creatordate:iso)', 'refs/tags'])
    let atHead = new Set<string>()
    try {
      const pointed = await simpleGit(repo).raw(['tag', '--points-at', 'HEAD'])
      atHead = new Set(pointed.split('\n').map((t) => t.trim()).filter(Boolean))
    } catch {
      /* sem tags no HEAD */
    }
    if (!raw.trim()) return []
    return raw.split('\n').flatMap((line) => {
      const [name, date] = line.split('\t')
      return name?.trim() ? [{ name: name.trim(), date: (date ?? '').trim(), checkedOut: atHead.has(name.trim()) }] : []
    })
  })()
)

ipcMain.handle('treeline:createTag', (_event, repo: string, name: string, message: string, commit: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    const n = name.trim()
    await assertRefName(repo, 'tag', n, l)
    const args = ['tag']
    if (message.trim()) args.push('-a', n, '-m', message.trim())
    else args.push(n)
    if (commit.trim()) args.push(commit.trim())
    await simpleGit(repo).raw(args)
  })
)

ipcMain.handle('treeline:pushTag', (_event, repo: string, name: string, lang?: unknown) =>
  enqueue(repo, async (): Promise<import('../shared/types').SyncResult> => {
    const l = asLang(lang)
    try {
      await runGitCancellable(repo, 'Push', ['push', 'origin', name], l)
    } catch (e) {
      throw friendlySyncError('Push', e, l)
    }
    return { summary: mx(l, 'pushDone', { x: name }) }
  })
)

ipcMain.handle('treeline:deleteTag', (_event, repo: string, name: string, remoteToo: boolean, lang?: unknown) =>
  enqueue(repo, async () => {
    await simpleGit(repo).raw(['tag', '-d', name])
    if (remoteToo) {
      const l = asLang(lang)
      try {
        await simpleGit(repo).raw(['push', 'origin', `:refs/tags/${name}`])
      } catch (e) {
        throw friendlySyncError('Push', e, l)
      }
    }
  })
)

// ---------------------------------------------------------------------------
// IPC: Rebase (onto/continue/abort) — rebase simples; interativo é Fase 3.
// ---------------------------------------------------------------------------
ipcMain.handle('treeline:getRebaseState', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async (): Promise<import('../shared/types').OpState> => {
    const gd = await gitDirOf(repo)
    const dir = (await exists(join(gd, 'rebase-merge')))
      ? join(gd, 'rebase-merge')
      : (await exists(join(gd, 'rebase-apply')))
        ? join(gd, 'rebase-apply')
        : null
    if (!dir) return { inProgress: false }
    let target: string | undefined
    try {
      const head = (await fs.readFile(join(dir, 'head-name'), 'utf-8')).trim()
      target = head.replace(/^refs\/heads\//, '')
    } catch {
      /* alvo desconhecido */
    }
    return { inProgress: true, target }
  })()
)

ipcMain.handle('treeline:rebaseOnto', (_event, repo: string, ref: string, lang?: unknown, autostash?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    try {
      await simpleGit(repo).rebase([ref, ...(autostash === true ? ['--autostash'] : [])])
    } catch (e) {
      throw conflictErr('rebaseConflicts', e, l)
    }
  })
)

ipcMain.handle('treeline:rebaseContinue', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    try {
      await simpleGit(repo).raw(['rebase', '--continue'])
    } catch (e) {
      throw conflictErr('rebaseConflicts', e, l)
    }
  })
)

ipcMain.handle('treeline:abortRebase', (_event, repo: string) =>
  enqueue(repo, () => simpleGit(repo).raw(['rebase', '--abort']).then(() => undefined))
)

// ---------------------------------------------------------------------------
// IPC: Cherry-pick (pick/continue/abort).
// ---------------------------------------------------------------------------
ipcMain.handle('treeline:getCherryPickState', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async (): Promise<import('../shared/types').OpState> => ({
    inProgress: await exists(join(await gitDirOf(repo), 'CHERRY_PICK_HEAD'))
  }))()
)

ipcMain.handle('treeline:cherryPick', (_event, repo: string, hash: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    try {
      await simpleGit(repo).raw(['cherry-pick', hash.trim()])
    } catch (e) {
      throw conflictErr('pickConflicts', e, l)
    }
  })
)

ipcMain.handle('treeline:cherryPickContinue', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    try {
      await simpleGit(repo).raw(['cherry-pick', '--continue'])
    } catch (e) {
      throw conflictErr('pickConflicts', e, l)
    }
  })
)

ipcMain.handle('treeline:abortCherryPick', (_event, repo: string) =>
  enqueue(repo, () => simpleGit(repo).raw(['cherry-pick', '--abort']).then(() => undefined))
)

// ---------------------------------------------------------------------------
// IPC: Git-flow (usa `git flow` se instalado, senão convenção de branches).
// ---------------------------------------------------------------------------
ipcMain.handle('treeline:detectFlow', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async () => {
    try {
      await simpleGit(repo).raw(['flow', 'version'])
      return { installed: true }
    } catch {
      return { installed: false }
    }
  })()
)

async function flowBase(repo: string, type: import('../shared/types').FlowType): Promise<string> {
  const want = type === 'hotfix' ? ['main', 'master'] : ['develop', 'main', 'master']
  const b = await simpleGit(repo).branchLocal()
  for (const name of want) {
    if (b.all.includes(name)) return name
  }
  throw new Error('no-base')
}

ipcMain.handle('treeline:flowStart', (_event, repo: string, type: import('../shared/types').FlowType, name: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    const n = name.trim().replace(/^\w+\//, '')
    const full = `${type}/${n}`
    await assertRefName(repo, 'branch', full, l)
    // Colisão de namespace: `feature` existente trava `feature/qa` (e vice-versa).
    const existing = (await simpleGit(repo).branchLocal()).all
    const clash = existing.find((b) => b === full || b.startsWith(full + '/') || full.startsWith(b + '/'))
    if (clash) throw new Error(mx(l, 'flowTaken', { x: full, y: clash }))
    const flow = await simpleGit(repo).raw(['flow', 'version']).then(() => true).catch(() => false)
    if (flow) {
      await simpleGit(repo).raw(['flow', type, 'start', n])
    } else {
      const base = await flowBase(repo, type).catch((): never => {
        throw new Error(mx(l, 'flowNoBase', { t: type, n }))
      })
      await simpleGit(repo).checkoutBranch(full, base)
    }
    return full
  })
)

ipcMain.handle('treeline:flowFinish', (_event, repo: string, type: import('../shared/types').FlowType, name: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    const flow = await simpleGit(repo).raw(['flow', 'version']).then(() => true).catch(() => false)
    if (flow) {
      try {
        await simpleGit(repo).raw(['flow', type, 'finish', '-m', `Finish ${type}/${name}`, name])
      } catch (e) {
        throw conflictErr('mergeConflicts', e, l)
      }
      return
    }
    const branch = `${type}/${name}`
    const exists = (await simpleGit(repo).branchLocal()).all.includes(branch)
    if (!exists) throw new Error(mx(l, 'flowMissing', { x: branch }))
    const base = await flowBase(repo, type).catch((): never => {
      throw new Error(mx(l, 'flowNoBase', { t: type, n: name }))
    })
    const git = simpleGit(repo)
    await git.checkout(base)
    try {
      await git.merge([branch, '--no-ff'])
    } catch (e) {
      throw conflictErr('mergeConflicts', e, l)
    }
    await git.branch(['-d', branch])
  })
)

// ---------------------------------------------------------------------------
// IPC: Terminal — abre emulador na pasta do repo (detecção de instalados).
// ---------------------------------------------------------------------------
ipcMain.handle('treeline:openTerminal', (_event, repo: string, lang?: unknown) =>
  (async () => {
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
  })()
)

// ---------------------------------------------------------------------------
// IPC: Reflog + Undo (reset --hard com confirmação prévia na UI e backup).
// ---------------------------------------------------------------------------
function parseReflog(raw: string): import('../shared/types').ReflogEntry[] {
  if (!raw.trim()) return []
  return raw.split('\x1e').flatMap((block) => {
    const parts = block.split('\0')
    // Formato: %H %gd %an %ad %s = 5 campos (não 6!).
    if (parts.length < 5) return []
    const [hashRaw, ref, author, date, ...rest] = parts
    const hash = (hashRaw ?? '').trim()
    if (!hash) return []
    return [{ hash, ref: (ref ?? '').trim(), author: author ?? '', date: date ?? '', message: rest.join('\0').trim() }]
  })
}

ipcMain.handle('treeline:getReflog', (_event, repo: string, limit?: number) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async () => {
    const n = Math.min(Math.max(limit ?? 100, 1), 500)
    return parseReflog(
      await simpleGit(repo).raw(['reflog', `--max-count=${n}`, '--date=iso', '--pretty=format:%H%x00%gd%x00%an%x00%ad%x00%s%x1e'])
    )
  })()
)

ipcMain.handle('treeline:undoToReflog', (_event, repo: string, ref: string) =>
  enqueue(repo, async () => {
    // Backup automático antes do reset destrutivo (exigência Fase 3).
    await backupBundle(repo)
    await simpleGit(repo).raw(['reset', '--hard', ref])
  })
)

// ---------------------------------------------------------------------------
// IPC: backups bundle (listar + restaurar p/ namespace isolado).
// ---------------------------------------------------------------------------
ipcMain.handle('treeline:listBackups', (_event, repo: string) =>
  (async (): Promise<import('../shared/types').BackupInfo[]> => {
    const dir = join(await gitDirOf(repo), 'treeline-backups')
    let files: string[] = []
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith('.bundle'))
    } catch {
      return []
    }
    const out: import('../shared/types').BackupInfo[] = []
    for (const f of files) {
      try {
        const st = await fs.stat(join(dir, f))
        out.push({ file: f, date: st.mtime.toISOString(), size: st.size })
      } catch {
        /* some */
      }
    }
    return out.sort((a, b) => (a.date < b.date ? 1 : -1))
  })()
)

ipcMain.handle('treeline:restoreBackup', (_event, repo: string, file: string, lang?: unknown) =>
  enqueue(repo, async (): Promise<import('../shared/types').SyncResult> => {
    const l = asLang(lang)
    // Sem path traversal: só basename *.bundle do nosso dir.
    const base = file.split('/').pop()?.split('\\').pop() ?? ''
    if (!base.endsWith('.bundle') || base !== file) throw new Error(mx(l, 'nameInvalid', { x: file }))
    const stamp = base.replace(/\.bundle$/, '').replace(/[^0-9A-Za-z-]/g, '')
    const ns = `treeline-restore-${stamp || 'x'}`
    await simpleGit(repo).raw(['fetch', join(await gitDirOf(repo), 'treeline-backups', base), `+refs/heads/*:refs/heads/${ns}/*`])
    const raw = await simpleGit(repo).raw(['for-each-ref', '--format=%(refname:short)', `refs/heads/${ns}`])
    const n = raw.split('\n').map((s) => s.trim()).filter(Boolean).length
    return { summary: mx(l, 'backupRestored', { n, x: ns }) }
  })
)

// ---------------------------------------------------------------------------
// IPC: Remotes (list/add/remove) + Clone + Init.
// ---------------------------------------------------------------------------
ipcMain.handle('treeline:getRemotes', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async (): Promise<import('../shared/types').RemoteInfo[]> => {
    const raw = await simpleGit(repo).raw(['remote', '-v'])
    const seen = new Map<string, string>()
    for (const line of raw.split('\n')) {
      const m = line.match(/^(\S+)\t(\S+) \(fetch\)$/)
      if (m?.[1] && m?.[2] && !seen.has(m[1])) seen.set(m[1], m[2])
    }
    return [...seen].map(([name, url]) => ({ name, url }))
  })()
)

ipcMain.handle('treeline:addRemote', (_event, repo: string, name: string, url: string) =>
  enqueue(repo, () => simpleGit(repo).addRemote(name.trim(), url.trim()).then(() => undefined))
)

ipcMain.handle('treeline:removeRemote', (_event, repo: string, name: string) =>
  enqueue(repo, () => simpleGit(repo).removeRemote(name).then(() => undefined))
)

ipcMain.handle('treeline:cloneRepo', async (event, url: string, lang?: unknown) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const opts = { properties: ['openDirectory' as const], title: 'Clone destination' }
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (res.canceled || res.filePaths.length === 0) return null
  const parent = res.filePaths[0] as string
  const base = url.trim().replace(/\/$/, '').split('/').pop() ?? 'repo'
  const name = base.replace(/\.git$/, '') || 'repo'
  const target = join(parent, name)
  const l = asLang(lang)
  try {
    await runGitCancellable(parent, 'Clone', ['clone', url.trim(), target], l)
  } catch (e) {
    throw friendlySyncError('Clone', e, l)
  }
  const list = [target, ...(await readBookmarks()).filter((p) => p !== target)]
  await writeBookmarks(list)
  return target
})

ipcMain.handle('treeline:initRepo', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const opts = { properties: ['openDirectory' as const], title: 'Init location' }
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (res.canceled || res.filePaths.length === 0) return null
  const target = res.filePaths[0] as string
  await simpleGit(target).init()
  const list = [target, ...(await readBookmarks()).filter((p) => p !== target)]
  await writeBookmarks(list)
  return target
})

// ---------------------------------------------------------------------------
// IPC: Terminal integrado (node-pty, uma sessão por repo).
// ---------------------------------------------------------------------------
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
    win?.webContents.send('treeline:termData', repo, data)
  })
  proc.onExit(() => {
    terms.delete(repo)
    win?.webContents.send('treeline:termExit', repo)
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

// ---------------------------------------------------------------------------
// Janela principal.
// ---------------------------------------------------------------------------
function createWindow(splash: BrowserWindow | null, splashAt: number): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
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

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Splash fica 3s na tela (SPLASH_MIN_MS) para não piscar; fecha ao mostrar a janela.
  // Fallback: em Wayland sem GPU (--disable-gpu) o 'ready-to-show' pode nunca
  // disparar e o usuário ficaria preso no splash; o timeout garante a saída.
  let shown = false
  const showMain = (): void => {
    if (shown) return
    shown = true
    splash?.close()
    win.show()
  }
  win.once('ready-to-show', () => {
    console.log('[treeline] main ready-to-show')
    const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - splashAt))
    setTimeout(showMain, wait)
  })
  setTimeout(showMain, SPLASH_MIN_MS + 8000)
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
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async (): Promise<RepoStatus> => {
    const s = await simpleGit(repo).status()
    const staged = s.files.filter((f) => f.index !== ' ' && f.index !== '?').map((f) => ({ path: f.path, code: `${f.index}${f.working_dir}` }))
    // Untracked (??) sai em lista própria: se ficar aqui, conta e renderiza em dobro.
    const unstaged = s.files.filter((f) => f.working_dir !== ' ' && f.index !== '?').map((f) => ({ path: f.path, code: `${f.index}${f.working_dir}` }))
    const untracked = s.files.filter((f) => f.index === '?' && f.working_dir === '?').map((f) => f.path)
    // HEAD destacado em tag exata: mostra qual (ex: "v1.0.0").
    let detachedTag: string | null = null
    if (s.detached) {
      try {
        detachedTag = (await simpleGit(repo).raw(['describe', '--exact-match', '--tags', 'HEAD'])).trim() || null
      } catch {
        detachedTag = null
      }
    }
    return {
      branch: s.current ?? '(detached)',
      ahead: s.ahead ?? 0,
      behind: s.behind ?? 0,
      staged,
      unstaged,
      untracked,
      conflicted: s.conflicted ?? [],
      detachedTag
    }
  })()
)

ipcMain.handle('treeline:getLog', (_event, repo: string, limit?: number, skip?: number, ref?: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async (): Promise<CommitInfo[]> => {
    const n = Math.min(Math.max(limit ?? 300, 1), 2000)
    const s = Math.min(Math.max(skip ?? 0, 0), 100000)
    const onlyRef = ref?.trim() || ''
    // %x1e (record separator) delimita commits; %x00 delimita campos.
    // Não usar \0\0 como separador: %P vazio (root commit) gera NUL duplo.
    // --topo-order é contrato do lane allocator single-pass: garante que
    // nenhum pai apareça antes de todos os seus filhos (ordem por data pura
    // embaralha a cadeia quando há múltiplas tips com clock skew, e cada
    // commit órfão de reserva vira uma lane nova = staircase).
    // --skip pagina: mesma ordem estável enquanto o repo não muda.
    // ref (branch atual): ancestry real em vez de heurística de refs.
    const raw = await simpleGit(repo).raw([
      'log', ...(onlyRef ? [onlyRef] : ['--all']), '--topo-order', `--max-count=${n}`, `--skip=${s}`, '--date=iso',
      '--pretty=format:%H%x00%P%x00%an%x00%ad%x00%D%x00%s%x1e'
    ])
    if (!raw.trim()) return []
    return raw.split('\x1e').flatMap((block) => {
      const c = parseLogBlock(block)
      return c ? [c] : []
    })
  })()
)

ipcMain.handle('treeline:getBranches', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async (): Promise<BranchInfo[]> => {
    const b = await simpleGit(repo).branchLocal()
    return b.all.map((name) => ({ name, current: name === b.current }))
  })()
)

ipcMain.handle('treeline:getDiff', (_event, repo: string, file: string, staged: boolean) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async () => {
    const args = staged ? ['diff', '--cached', '--unified=3', '--', file] : ['diff', '--unified=3', '--', file]
    return simpleGit(repo).raw(args)
  })()
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

/** Nome simbólico do upstream (ex: "origin/main") ou '' sem tracking. */
async function upstreamName(repo: string): Promise<string> {
  try {
    return (await simpleGit(repo).revparse(['--abbrev-ref', '--symbolic-full-name', '@{u}'])).trim()
  } catch {
    return ''
  }
}

async function refHash(repo: string, ref: string): Promise<string> {
  try {
    return (await simpleGit(repo).revparse([ref])).trim()
  } catch {
    return ''
  }
}

ipcMain.handle('treeline:push', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, async (): Promise<SyncResult> => {
    const l = asLang(lang)
    const up = await upstreamName(repo)
    if (!up) {
      let cur = 'HEAD'
      try {
        cur = (await simpleGit(repo).revparse(['--abbrev-ref', 'HEAD'])).trim()
      } catch {
        /* segue */
      }
      throw new Error(mx(l, 'noUpstream', { b: cur }))
    }
    const before = await refHash(repo, '@{u}')
    try {
      await runGitCancellable(repo, 'Push', ['push'], l)
    } catch (e) {
      throw friendlySyncError('Push', e, l)
    }
    const after = await refHash(repo, '@{u}')
    if (before && after && before !== after) {
      const cur = (await simpleGit(repo).revparse(['--abbrev-ref', 'HEAD'])).trim()
      return { summary: mx(l, 'pushDone', { x: `${cur} → ${up}` }) }
    }
    return { summary: mx(l, 'pushUpToDate') }
  })
)

ipcMain.handle('treeline:pull', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, async (): Promise<SyncResult> => {
    const l = asLang(lang)
    const before = await refHash(repo, 'HEAD')
    try {
      // ff-only por segurança: divergência vira erro legível em vez de merge surpresa.
      await runGitCancellable(repo, 'Pull', ['pull', '--ff-only'], l)
    } catch (e) {
      throw friendlySyncError('Pull', e, l)
    }
    const after = await refHash(repo, 'HEAD')
    if (!before || !after || before === after) return { summary: mx(l, 'pullUpToDate') }
    let n = 0
    let i = 0
    let d = 0
    try {
      const st = await simpleGit(repo).raw(['diff', '--shortstat', before, after])
      n = Number(/(\d+) files? changed/.exec(st)?.[1] ?? 0)
      i = Number(/(\d+) insertions?/.exec(st)?.[1] ?? 0)
      d = Number(/(\d+) deletions?/.exec(st)?.[1] ?? 0)
    } catch {
      /* resumo sem números */
    }
    return { summary: mx(l, 'pullDone', { n, i, d }) }
  })
)

ipcMain.handle('treeline:fetch', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, async (): Promise<SyncResult> => {
    const l = asLang(lang)
    const snap = async (): Promise<Map<string, string>> => {
      const m = new Map<string, string>()
      try {
        const raw = await simpleGit(repo).raw(['for-each-ref', '--format=%(objectname)%09%(refname)', 'refs/remotes'])
        for (const line of raw.split('\n')) {
          const [h, ref] = line.split('\t')
          if (h?.trim() && ref?.trim()) m.set(ref.trim(), h.trim())
        }
      } catch {
        /* sem remotos */
      }
      return m
    }
    const before = await snap()
    try {
      await runGitCancellable(repo, 'Fetch', ['fetch', '--all', '--prune'], l)
    } catch (e) {
      throw friendlySyncError('Fetch', e, l)
    }
    const after = await snap()
    let updated = 0
    for (const [ref, h] of after) {
      if (before.get(ref) !== h) updated++
    }
    for (const ref of before.keys()) {
      if (!after.has(ref)) updated++
    }
    const extra = updated > 0 ? mx(l, 'fetchUpdated', { n: updated }) : ''
    return { summary: `${mx(l, 'fetchDone')}${extra}` }
  })
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

ipcMain.handle('treeline:setLang', async (_event, lang: string) => {
  const l = lang === 'pt' || lang === 'es' || lang === 'en' ? lang : 'en'
  try {
    await fs.writeFile(join(app.getPath('userData'), 'lang'), l)
  } catch {
    /* segue sem persistir */
  }
})

ipcMain.handle('treeline:getVersion', () => app.getVersion())

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
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async (): Promise<CommitDetail> => {
    const l = asLang(lang)
    const out = await simpleGit(repo).raw([
      'show', '--name-only', '--date=iso',
      '--pretty=format:%H%x00%P%x00%an%x00%cn%x00%ad%x00%D%x00%s%x1e', hash
    ])
    const [head, ...rest] = out.split('\x1e')
    const parts = (head ?? '').split('\0')
    if (parts.length < 7) throw new Error(mx(l, 'commitNotFound'))
    const [hashRaw, parentStr, author, committer, date, refStr, message] = parts as [string, string, string, string, string, string, string]
    const h = hashRaw.trim()
    if (!h) throw new Error(mx(l, 'commitNotFound'))
    const refs = (refStr ? refStr.split(', ') : []).flatMap((r) => {
      if (r.startsWith('HEAD -> ')) return ['HEAD', r.slice('HEAD -> '.length)]
      if (r === 'HEAD') return ['HEAD']
      return [r]
    })
    const files = rest
      .join('\x1e')
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.length > 0)
    // +/- por arquivo (merge sem diff próprio pode vir vazio: sem stats).
    let stats: import('../shared/types').FileStat[] = []
    try {
      const ns = await simpleGit(repo).raw(['show', '--numstat', '--format=', hash])
      stats = ns.split('\n').flatMap((line) => {
        const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/)
        if (!m?.[3]) return []
        const num = (v: string): number => (v === '-' ? 0 : Number.parseInt(v, 10) || 0)
        return [{ path: (m[3] as string).trim(), added: num(m[1] as string), deleted: num(m[2] as string) }]
      })
    } catch {
      /* sem stats */
    }
    return {
      hash: h,
      parents: parentStr ? parentStr.split(/\s+/).map((p) => p.trim()).filter((p) => p.length > 0) : [],
      author,
      committer,
      date,
      message: message ?? '',
      refs,
      files,
      stats
    }
  })()
)

ipcMain.handle('treeline:getCommitDiff', (_event, repo: string, hash: string, file: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async () => simpleGit(repo).raw(['show', hash, '--unified=3', '--', file]))()
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

// ---------------------------------------------------------------------------
// IPC: hunks (stage/discard por hunk e por linha via `git apply`).
// ---------------------------------------------------------------------------
const HUNK_HEAD_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

interface SplitDiff {
  header: string[]
  hunks: import('../shared/types').HunkInfo[]
}

/** Quebra um unified diff de 1 arquivo em cabeçalho + hunks numerados. */
function splitDiffHunks(raw: string): SplitDiff {
  const header: string[] = []
  const hunks: import('../shared/types').HunkInfo[] = []
  let cur: string[] | null = null
  let curHeader = ''
  let curOld = '0'
  let curNew = '0'
  for (const line of raw.split('\n')) {
    const m = HUNK_HEAD_RE.exec(line)
    if (m) {
      if (cur) {
        hunks.push({
          index: hunks.length,
          header: curHeader,
          oldStart: Number(curOld),
          newStart: Number(curNew),
          lines: cur
        })
      }
      curHeader = line
      curOld = m[1] as string
      curNew = m[3] as string
      cur = []
    } else if (cur) {
      cur.push(line)
    } else {
      header.push(line)
    }
  }
  if (cur) {
    hunks.push({ index: hunks.length, header: curHeader, oldStart: Number(curOld), newStart: Number(curNew), lines: cur })
  }
  // Linha '' fantasma do split final: fica no último hunk, inofensiva ao apply.
  return { header, hunks }
}

async function diffForHunks(repo: string, file: string, staged: boolean): Promise<SplitDiff> {
  const args = staged
    ? ['diff', '--cached', '--unified=3', '--', file]
    : ['diff', '--unified=3', '--', file]
  return splitDiffHunks(await simpleGit(repo).raw(args))
}

/** Aplica um patch via arquivo temporário (simple-git não faz stdin). */
async function applyPatch(repo: string, patch: string, args: string[]): Promise<void> {
  const { tmpdir } = await import('node:os')
  const { randomBytes } = await import('node:crypto')
  const tmp = join(tmpdir(), `treeline-${randomBytes(6).toString('hex')}.patch`)
  try {
    await fs.writeFile(tmp, patch)
    await simpleGit(repo).raw([...args, tmp])
  } finally {
    await fs.rm(tmp, { force: true })
  }
}

/** Monta patch parcial com só as linhas selecionadas (+/- viram contexto ou somem). */
function buildPartialPatch(header: string[], hunk: import('../shared/types').HunkInfo, sel: Set<number>): string | null {
  const body: string[] = []
  let ctx = 0
  let add = 0
  let del = 0
  hunk.lines.forEach((ln, i) => {
    // '' fantasma do split final: fora da contagem e do patch.
    if (ln === '' && i === hunk.lines.length - 1) return
    if (ln.startsWith('+') && !ln.startsWith('+++')) {
      if (sel.has(i)) { body.push(ln); add++ } // fora: some do patch
    } else if (ln.startsWith('-') && !ln.startsWith('---')) {
      if (sel.has(i)) { body.push(ln); del++ }
      else { body.push(' ' + ln.slice(1)); ctx++ } // fora: vira contexto
    } else if (ln.startsWith('\\')) {
      body.push(ln) // "\ No newline" acompanha a linha anterior
    } else {
      body.push(ln); ctx++
    }
  })
  if (add === 0 && del === 0) return null
  const oldCount = ctx + del
  const newCount = ctx + add
  const head = `@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@`
  return [...header, head, ...body].join('\n') + '\n'
}

ipcMain.handle('treeline:getHunks', (_event, repo: string, file: string, staged: boolean) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async (): Promise<import('../shared/types').HunkInfo[]> => (await diffForHunks(repo, file, staged)).hunks)()
)

ipcMain.handle('treeline:stageHunk', (_event, repo: string, file: string, staged: boolean, hunkIndex: number, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    const { header, hunks } = await diffForHunks(repo, file, staged)
    const h = hunks.find((x) => x.index === hunkIndex)
    if (!h) throw new Error(mx(l, 'noHunk', { n: hunkIndex + 1 }))
    const patch = [...header, h.header, ...h.lines].join('\n') + '\n'
    // Unstaged → index (--cached); staged → volta p/ worktree (--cached -R).
    await applyPatch(repo, patch, staged ? ['apply', '--cached', '-R'] : ['apply', '--cached'])
  })
)

ipcMain.handle('treeline:discardHunk', (_event, repo: string, file: string, staged: boolean, hunkIndex: number, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    const { header, hunks } = await diffForHunks(repo, file, staged)
    const h = hunks.find((x) => x.index === hunkIndex)
    if (!h) throw new Error(mx(l, 'noHunk', { n: hunkIndex + 1 }))
    const patch = [...header, h.header, ...h.lines].join('\n') + '\n'
    // Unstaged → reverte no worktree (-R); staged → tira do index (--cached -R).
    await applyPatch(repo, patch, staged ? ['apply', '--cached', '-R'] : ['apply', '-R'])
  })
)

ipcMain.handle('treeline:stageLines', (_event, repo: string, file: string, staged: boolean, hunkIndex: number, lineIndexes: number[], lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    const { header, hunks } = await diffForHunks(repo, file, staged)
    const h = hunks.find((x) => x.index === hunkIndex)
    if (!h) throw new Error(mx(l, 'noHunk', { n: hunkIndex + 1 }))
    const patch = buildPartialPatch(header, h, new Set(lineIndexes))
    if (!patch) throw new Error(mx(l, 'noLines'))
    await applyPatch(repo, patch, staged ? ['apply', '--cached', '-R'] : ['apply', '--cached'])
    // Nota: unstage por linha usa o mesmo patch parcial em reverso no index.
    // Stage por linha no index (arquivo staged) segue o fluxo de unstage.
  })
)

// ---------------------------------------------------------------------------
// IPC: Revert / Reset direto / Ours-Theirs / Force-push com lease.
// ---------------------------------------------------------------------------
/** Backup `git bundle --all` antes de operação destrutiva; retorna o path. */
async function backupBundle(repo: string): Promise<string> {
  const dir = join(await gitDirOf(repo), 'treeline-backups')
  await fs.mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = join(dir, `${stamp}.bundle`)
  await simpleGit(repo).raw(['bundle', 'create', file, '--all'])
  return file
}

// ---------------------------------------------------------------------------
// IPC: estado de revert + abort + info de worktree.
// ---------------------------------------------------------------------------
ipcMain.handle('treeline:getRevertState', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async (): Promise<import('../shared/types').OpState> => ({
    inProgress: await exists(join(await gitDirOf(repo), 'REVERT_HEAD'))
  }))()
)

ipcMain.handle('treeline:abortRevert', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, async () => {
    try {
      await simpleGit(repo).raw(['revert', '--abort'])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/no .* in progress|revert failed/i.test(msg)) {
        throw new Error(mx(asLang(lang), 'revertNothing'))
      }
      throw e instanceof Error ? e : new Error(msg)
    }
  })
)

ipcMain.handle('treeline:getWorktreeInfo', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async (): Promise<import('../shared/types').WorktreeInfo> => {
    let toplevel = repo
    try {
      toplevel = (await simpleGit(repo).revparse(['--show-toplevel'])).trim() || repo
    } catch {
      /* segue com repo */
    }
    let linked = false
    try {
      linked = (await fs.lstat(join(repo, '.git'))).isFile()
    } catch {
      /* sem .git legível */
    }
    return { linked, toplevel }
  })()
)

ipcMain.handle('treeline:revertCommit', (_event, repo: string, hash: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    try {
      await simpleGit(repo).raw(['revert', '--no-edit', hash.trim()])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/CONFLICT|conflict|needs merge|failed to merge/i.test(msg)) {
        throw new Error(mx(l, 'revertConflicts', { d: msg.split('\n')[0] as string }))
      }
      throw e instanceof Error ? e : new Error(msg)
    }
  })
)

ipcMain.handle('treeline:resetTo', (_event, repo: string, ref: string, mode: import('../shared/types').ResetMode, lang?: unknown) =>
  enqueue(repo, async (): Promise<import('../shared/types').SyncResult> => {
    const l = asLang(lang)
    const m = mode === 'soft' || mode === 'hard' ? mode : 'mixed'
    await backupBundle(repo)
    await simpleGit(repo).raw(['reset', `--${m}`, ref.trim() || 'HEAD'])
    return { summary: mx(l, 'resetDone', { m, r: ref.trim() || 'HEAD' }) }
  })
)

ipcMain.handle('treeline:resolveOurs', (_event, repo: string, file: string) =>
  enqueue(repo, async () => {
    await simpleGit(repo).raw(['checkout', '--ours', '--', file])
    await simpleGit(repo).raw(['add', '--', file])
  })
)

ipcMain.handle('treeline:resolveTheirs', (_event, repo: string, file: string) =>
  enqueue(repo, async () => {
    await simpleGit(repo).raw(['checkout', '--theirs', '--', file])
    await simpleGit(repo).raw(['add', '--', file])
  })
)

ipcMain.handle('treeline:pushForce', (_event, repo: string, forceLease: boolean, lang?: unknown) =>
  enqueue(repo, async (): Promise<import('../shared/types').SyncResult> => {
    const l = asLang(lang)
    const up = await upstreamName(repo)
    const args = forceLease ? ['push', '--force-with-lease'] : ['push']
    try {
      await runGitCancellable(repo, 'Push', args, l)
    } catch (e) {
      throw friendlySyncError('Push', e, l)
    }
    const cur = (await simpleGit(repo).revparse(['--abbrev-ref', 'HEAD'])).trim()
    return { summary: mx(l, 'pushLeaseDone', { x: forceLease ? `${cur} → ${up || 'remote'} (lease)` : cur }) }
  })
)

// ---------------------------------------------------------------------------
// IPC: branches detalhados (upstream + ahead/behind), remotos, blame,
// file-history, rebase interativo, compare e abrir PR.
// ---------------------------------------------------------------------------
ipcMain.handle('treeline:getBranchesDetailed', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async (): Promise<import('../shared/types').BranchDetail[]> => {
    const raw = await simpleGit(repo).raw(['branch', '-vv'])
    const out: import('../shared/types').BranchDetail[] = []
    for (const line of raw.split('\n')) {
      const m = /^\*?\s*(\S+)\s+\S+(?:\s+\[([^\]]+)\])?/.exec(line)
      const name = m?.[1]
      if (!name || name === '(HEAD') continue
      const bracket = m?.[2] ?? ''
      const up = bracket.split(':')[0]?.trim() ?? ''
      const ahead = /ahead (\d+)/.exec(bracket)?.[1]
      const behind = /behind (\d+)/.exec(bracket)?.[1]
      out.push({
        name,
        current: line.startsWith('*'),
        upstream: up && !/^(gone|ahead|behind)/.test(up) ? up : null,
        ahead: ahead ? Number.parseInt(ahead, 10) : 0,
        behind: behind ? Number.parseInt(behind, 10) : 0
      })
    }
    return out
  })()
)

ipcMain.handle('treeline:getRemoteBranches', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async (): Promise<import('../shared/types').RemoteBranchInfo[]> => {
    const raw = await simpleGit(repo).raw(['branch', '-r'])
    return raw.split('\n').flatMap((line) => {
      const name = line.trim()
      if (!name || name.includes('->')) return []
      const slash = name.indexOf('/')
      return [{ name, remote: slash > 0 ? name.slice(0, slash) : 'origin' }]
    })
  })()
)

ipcMain.handle('treeline:setUpstream', (_event, repo: string, branch: string, upstream: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    if (!upstream.trim()) throw new Error(mx(l, 'noUpstream', { b: branch }))
    await simpleGit(repo).raw(['branch', `--set-upstream-to=${upstream.trim()}`, branch.trim()])
  })
)

ipcMain.handle('treeline:editRemote', (_event, repo: string, name: string, url: string) =>
  enqueue(repo, () => simpleGit(repo).raw(['remote', 'set-url', name.trim(), url.trim()]).then(() => undefined))
)

ipcMain.handle('treeline:getBlame', (_event, repo: string, file: string, rev?: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async (): Promise<import('../shared/types').BlameLine[]> => {
    const args = ['blame', '--line-porcelain']
    if (rev?.trim()) args.push(rev.trim())
    args.push('--', file)
    const raw = await simpleGit(repo).raw(args)
    const out: import('../shared/types').BlameLine[] = []
    let hash = ''
    let author = ''
    let date = ''
    let n = 0
    for (const line of raw.split('\n')) {
      const hm = /^[0-9a-f]{40} \d+ \d+ \d+$/.exec(line)
      if (hm) { hash = line.slice(0, 8); continue }
      if (line.startsWith('author ')) { author = line.slice(7); continue }
      if (line.startsWith('author-time ')) {
        const t = new Date(Number.parseInt(line.slice(12), 10) * 1000)
        date = Number.isNaN(t.getTime()) ? '' : t.toISOString().slice(0, 10)
        continue
      }
      if (line.startsWith('\t')) { n++; out.push({ line: n, hash, author, date, content: line.slice(1) }) }
    }
    return out
  })()
)

ipcMain.handle('treeline:getFileHistory', (_event, repo: string, file: string, limit?: number) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async (): Promise<import('../shared/types').FileHistoryEntry[]> => {
    const n = Math.min(Math.max(limit ?? 100, 1), 500)
    const raw = await simpleGit(repo).raw([
      'log', '--follow', `--max-count=${n}`, '--date=iso',
      '--pretty=format:%H%x00%an%x00%ad%x00%s%x1e', '--', file
    ])
    if (!raw.trim()) return []
    return raw.split('\x1e').flatMap((block) => {
      const parts = block.split('\0')
      if (parts.length < 4) return []
      const [h, author, date, ...rest] = parts
      const hash = (h ?? '').trim()
      if (!hash) return []
      return [{ hash, author: author ?? '', date: date ?? '', message: rest.join('\0').trim() }]
    })
  })()
)

// Rebase interativo via GIT_SEQUENCE_EDITOR=cp <plano>: o git executa
// `$EDITOR <todo>` via shell, então `cp plano todo` injeta nossa sequência.
// Mutex global: process.env é do processo inteiro, não por repo.
let rebaseInteractiveTail: Promise<unknown> = Promise.resolve()

function enqueueGlobal<T>(fn: () => Promise<T>): Promise<T> {
  const next = rebaseInteractiveTail.then(fn, fn) as Promise<T>
  rebaseInteractiveTail = next.catch(() => undefined)
  return next
}

ipcMain.handle('treeline:getRebasePlan', (_event, repo: string, base: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async (): Promise<import('../shared/types').RebasePlanEntry[]> => {
    // --no-merges: `pick` de merge commit falha no rebase -i.
    const raw = await simpleGit(repo).raw([
      'log', '--reverse', '--no-merges', '--date=iso', '--pretty=format:%H%x00%s%x1e', `${base.trim()}..HEAD`
    ])
    if (!raw.trim()) return []
    return raw.split('\x1e').flatMap((block) => {
      const parts = block.split('\0')
      const hash = (parts[0] ?? '').trim()
      if (!hash) return []
      return [{ hash, message: (parts[1] ?? '').trim(), action: 'pick' as const }]
    })
  })()
)

ipcMain.handle('treeline:rebaseInteractive', (_event, repo: string, base: string, plan: import('../shared/types').RebasePlanEntry[], lang?: unknown, autostash?: unknown) =>
  enqueueGlobal(async () => enqueue(repo, async () => {
    const l = asLang(lang)
    await backupBundle(repo)
    const { tmpdir } = await import('node:os')
    const { randomBytes } = await import('node:crypto')
    const planFile = join(tmpdir(), `treeline-rebase-${randomBytes(6).toString('hex')}.txt`)
    const body = plan.map((p) => `${p.action} ${p.hash} ${p.message.replace(/\n/g, ' ')}`).join('\n') + '\n'
    await fs.writeFile(planFile, body)
    const prev = process.env['GIT_SEQUENCE_EDITOR']
    process.env['GIT_SEQUENCE_EDITOR'] = `cp ${planFile}`
    try {
      await simpleGit(repo).raw(['rebase', '-i', ...(autostash === true ? ['--autostash'] : []), base.trim() || 'HEAD'])
    } catch (e) {
      throw conflictErr('rebaseConflicts', e, l)
    } finally {
      if (prev === undefined) delete process.env['GIT_SEQUENCE_EDITOR']
      else process.env['GIT_SEQUENCE_EDITOR'] = prev
      await fs.rm(planFile, { force: true })
    }
  }))
)

ipcMain.handle('treeline:compareCommits', (_event, repo: string, a: string, b: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async (): Promise<import('../shared/types').CompareSummary> => {
    const [names, ns] = await Promise.all([
      simpleGit(repo).raw(['diff', '--name-only', a.trim(), b.trim()]),
      simpleGit(repo).raw(['diff', '--numstat', a.trim(), b.trim()])
    ])
    const files = names.split('\n').map((f) => f.trim()).filter(Boolean)
    const stats: import('../shared/types').FileStat[] = ns.split('\n').flatMap((line) => {
      const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/)
      if (!m?.[3]) return []
      const num = (v: string): number => (v === '-' ? 0 : Number.parseInt(v, 10) || 0)
      return [{ path: (m[3] as string).trim(), added: num(m[1] as string), deleted: num(m[2] as string) }]
    })
    return { files, stats }
  })()
)

ipcMain.handle('treeline:compareDiff', (_event, repo: string, a: string, b: string, file: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  ( async () => simpleGit(repo).raw(['diff', '--unified=3', a.trim(), b.trim(), '--', file]))()
)

ipcMain.handle('treeline:openPR', (_event, repo: string) =>
  enqueue(repo, async () => {
    const raw = await simpleGit(repo).raw(['remote', '-v'])
    const m = raw.split('\n').map((l) => /^\S+\t(\S+) \(fetch\)$/.exec(l)?.[1]).find(Boolean) ?? ''
    const url = (m ?? '').replace(/\.git$/, '')
    let web = ''
    let gh = /github\.com[:/]([^/]+\/[^/]+)/.exec(url)
    if (gh?.[1]) web = `https://github.com/${gh[1]}/compare`
    const gl = /gitlab[^/]*[:/]([^/]+\/[^/]+)/.exec(url)
    if (!web && gl?.[1]) web = `https://${/gitlab[^/:]*/.exec(url)?.[0] ?? 'gitlab.com'}/${gl[1]}/-/merge_requests`
    const bb = /bitbucket\.org[:/]([^/]+\/[^/]+)/.exec(url)
    if (!web && bb?.[1]) web = `https://bitbucket.org/${bb[1]}/pull-requests`
    if (!web) {
      const http = /https?:\/\/\S+/.exec(url)?.[0]
      web = http ?? url
    }
    await shell.openExternal(web)
  })
)

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
      await backupBundle(repo)
      await simpleGit(repo).raw(['checkout', '--', file])
    } else {
      await shell.trashItem(join(repo, file))
    }
  })
})

// ---------------------------------------------------------------------------
void app.whenReady().then(async () => {
  const { win: splash, at } = await createSplash()
  createWindow(splash, at)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createSplash().then((s) => createWindow(s.win, s.at))
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
