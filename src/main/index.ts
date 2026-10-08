import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { simpleGit } from 'simple-git'
import { mx, asLang, type UILang } from './messages'

import { GitQueue, enqueue, enqueueGlobal, indexQueue, readIndexOp, readOp, runGitCancellable, syncControllers, type GitOp } from './git/runner'
export { readOp } from './git/runner'
import { assertCloneUrl, assertRefName, assertSafeRef, relPathSafe } from './git/validate'
import './git/search'
import type {
  BranchInfo,
  CommitDetail,
  CommitInfo,
  ConflictFile,
  ConflictOp,
  ConflictSide,
  ConflictStages,
  GitIdentity,
  RepoStatus,
  SyncResult
} from '../shared/types'
import { conflictKindOf, looksBinary, parseLsFilesU, parseUnmergedXY, shortRef, stagesByPath, type UnmergedEntry } from './conflict-stages'
import { SPLASH_H, SPLASH_MIN_MS, SPLASH_W, splashHtml, splashImagePath, splashLang, type SplashLang } from './splash'


export 
const APP_TITLE: Record<SplashLang, string> = {
  en: 'TreeLine — Where the Git maze becomes a straight path - WerneckLab',
  pt: 'TreeLine — Onde o labirinto do Git vira um caminho reto - WerneckLab',
  es: 'TreeLine — Donde el laberinto de Git se vuelve un camino recto - WerneckLab'
}

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



/** Leitura fora da fila de escrita: executa já (refresh não trava em sync longa). */


/**
 * Leitura que mexe no índice (ex.: `git status` faz refresh de stat) espera
 * qualquer escrita já enfileirada daquele repo terminar antes de rodar.
 * Entre si as leituras continuam em paralelo — só não concorrem com escrita
 * no `index.lock` (3.7).
 */


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


interface GitRun {
  stdout: string
  stderr: string
}



ipcMain.handle('treeline:cancelSync', (_event, repo: string, op: string) => {
  const c = syncControllers.get(`${repo}:${op}`)
  if (c?.proc) c.proc.kill('SIGTERM')
  if (op === 'Clone') {
    const cc = syncControllers.get('__clone__:Clone')
    if (cc?.proc) cc.proc.kill('SIGTERM')
  }
})

// Erro técnico do git vira orientação acionável: o caso mais comum é remote
// HTTPS sem credencial salva (sem TTY no Electron, o prompt é desabilitado).
function friendlySyncError(op: string, e: unknown, lang: UILang = 'en'): Error {
  const msg = e instanceof Error ? e.message : String(e)
  if (/could not read Username|terminal prompts disabled|authentication failed|invalid username|credential/i.test(msg)) {
    return new Error(mx(lang, 'authFail', { op, d: msg.split('\n')[0] as string }))
  }
  // Divergência de branches: Pull com --ff-only falha — orientar merge/rebase.
  if (/diverg|non-fast-forward|cannot fast-forward|fast-forward.*failed/i.test(msg)) {
    return new Error(mx(lang, 'pullDivergent', { op, d: msg.split('\n')[0] as string }))
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


/**
 * Valida ref/hash vindo da tela antes de entrar em argv do git. O risco real
 * de injeção aqui é um valor começando com `-` (viram opções: `--force=`,
 * `--upload-pack=` etc.) ou caracteres que quebram o parse de ref. Nomes de
 * branch/tag legítimos passam; reflog (`HEAD@{2}`) também.
 */


/** Só os verbos que a UI gera: nada de `x/exec` (executa shell) nem `merge` cru. */
const REBASE_PLAN_ACTIONS = new Set(['pick', 'p', 'reword', 'r', 'edit', 'e', 'squash', 's', 'fixup', 'f', 'drop', 'd'])

function assertRebasePlan(plan: import('../shared/types').RebasePlanEntry[], lang: UILang): void {
  for (const p of plan ?? []) {
    if (!p || !REBASE_PLAN_ACTIONS.has(p.action)) {
      throw new Error(mx(lang, 'unsafeRef', { x: 'rebase action' }))
    }
    if (!p.hash || !/^[0-9a-fA-F]{7,40}$/.test(p.hash)) {
      throw new Error(mx(lang, 'unsafeRef', { x: (p?.hash ?? '').slice(0, 40) }))
    }
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
    assertRefName(n, l)
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
    assertSafeRef(rb, asLang(lang))
    const slash = rb.indexOf('/')
    if (slash < 0) throw new Error(mx(asLang(lang), 'nameInvalid', { x: rb }))
    const local = rb.slice(slash + 1)
    assertRefName(local, asLang(lang))
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
    assertRefName(t, l)
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
    assertRefName(n, l)
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
  readOp(async (): Promise<import('../shared/types').OpState> => {
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
  })
)

ipcMain.handle('treeline:mergePreview', (_event, repo: string, ref: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../shared/types').MergePreview> => {
    const git = simpleGit(repo)
    const [filesRaw, countRaw] = await Promise.all([
      git.raw(['diff', '--name-only', `HEAD...${ref}`]),
      git.raw(['rev-list', '--count', `HEAD..${ref}`])
    ])
    return {
      files: filesRaw.split('\n').map((f) => f.trim()).filter(Boolean),
      commits: Number.parseInt(countRaw.trim(), 10) || 0
    }
  })
)

ipcMain.handle('treeline:mergeBranch', (_event, repo: string, ref: string, noFf: boolean, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    assertSafeRef(ref, l)
    try {
      await simpleGit(repo).merge([ref, ...(noFf ? ['--no-ff'] : [])])
    } catch (e) {
      throw conflictErr('mergeConflicts', e, l)
    }
  })
)

/**
 * Arquivos ainda unmerged (`git ls-files -u`). Continuar a operação com um
 * destes no index cria um commit que carrega os marcadores de conflito —
 * por isso abortamos antes, com o nome do arquivo na mensagem.
 */
async function unmergedPaths(repo: string): Promise<string[]> {
  // Sem `.catch(() => '')`: se o `ls-files -u` falhar (3.9), o erro PROPAGA
  // em vez de virar "nenhum conflito" — a UI mostra o erro real em vez de
  // fingir que a operação conflitante acabou.
  const raw = await simpleGit(repo).raw(['ls-files', '-u', '-z'])
  return parseLsFilesU(raw)
    .map((e) => e.path)
    .filter((p, i, a) => a.indexOf(p) === i)
}

/**
 * `simple-git` só transforma em erro quando o git escreve no STDERR.
 * `git commit --no-edit` / `--continue` recusados por "nada a commitar"
 * escrevem em STDOUT e saem com 1 — o promise RESOLVE e a UI reporta
 * sucesso enquanto a operação continua parada (revert vazio, merge vazio,
 * cherry-pick vazio). Confiamos no resultado: se a operação segue viva,
 * o comando não terminou o trabalho.
 */
async function runContinue(repo: string, args: string[], l: UILang, conflictKey: string): Promise<void> {
  let out = ''
  try {
    out = (await simpleGit(repo).raw(args)).trim()
  } catch (e) {
    // stderr real: falha genuína (ex.: rebase não consegue aplicar o patch)
    throw conflictErr(conflictKey, e, l)
  }
  if ((await conflictLabels(repo)).op === null) return
  const rest = await unmergedPaths(repo)
  if (rest.length > 0) throw new Error(mx(l, 'continueNextConflict', { n: rest.length, f: rest[0] }))
  throw new Error(mx(l, 'continueEmpty', { cmd: `git ${args.join(' ')}`, out: out.slice(0, 400) || '—' }))
}

ipcMain.handle('treeline:mergeContinue', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    const unmerged = await unmergedPaths(repo)
    if (unmerged.length > 0) throw new Error(mx(l, 'mergeUnresolved', { n: unmerged.length, f: unmerged[0] }))
    await runContinue(repo, ['commit', '--no-edit'], l, 'mergeConflicts')
  })
)

ipcMain.handle('treeline:abortMerge', (_event, repo: string) =>
  enqueue(repo, () => simpleGit(repo).merge(['--abort']).then(() => undefined))
)

/**
 * Aborta um `stash apply/pop` conflitante. Não existe `stash --abort` e
 * `merge --abort` falha ("no MERGE_HEAD"): `reset --merge` devolve index e
 * worktree ao HEAD descartando o merge parcial, e a entrada do stash intacta
 * — é ela a fonte da verdade, então nada se perde.
 */
ipcMain.handle('treeline:abortStash', (_event, repo: string) =>
  enqueue(repo, async () => {
    await backupBundle(repo)
    await simpleGit(repo).raw(['reset', '--merge'])
  })
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
  readOp(async () => parseStashList(await simpleGit(repo).raw(['stash', 'list', '--pretty=format:%gd%x00%H%x00%s%x1e'])))
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
      throw conflictErr('stashConflicts', e, asLang(lang))
    }
  })
)

ipcMain.handle('treeline:popStash', (_event, repo: string, ref: string, lang?: unknown) =>
  enqueue(repo, async () => {
    try {
      await simpleGit(repo).raw(['stash', 'pop', ref])
    } catch (e) {
      throw conflictErr('stashConflicts', e, asLang(lang))
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
  readOp(async (): Promise<import('../shared/types').TagInfo[]> => {
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
  })
)

ipcMain.handle('treeline:createTag', (_event, repo: string, name: string, message: string, commit: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    const n = name.trim()
    assertRefName(n, l)
    const args = ['tag']
    if (message.trim()) args.push('-a', n, '-m', message.trim())
    else args.push(n)
    if (commit.trim()) {
      assertSafeRef(commit.trim(), l)
      args.push(commit.trim())
    }
    await simpleGit(repo).raw(args)
  })
)

ipcMain.handle('treeline:pushTag', (_event, repo: string, name: string, lang?: unknown) =>
  enqueue(repo, async (): Promise<import('../shared/types').SyncResult> => {
    const l = asLang(lang)
    assertSafeRef(name, l)
    assertRefName(name, l)
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
    assertSafeRef(name, asLang(lang))
    await simpleGit(repo).raw(['tag', '-d', name])
    if (remoteToo) {
      const l = asLang(lang)
      assertRefName(name, l)
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
  readOp(async (): Promise<import('../shared/types').OpState> => {
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
  })
)

ipcMain.handle('treeline:rebaseOnto', (_event, repo: string, ref: string, lang?: unknown, autostash?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    assertSafeRef(ref, l)
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
    const unmerged = await unmergedPaths(repo)
    if (unmerged.length > 0) throw new Error(mx(l, 'rebaseUnresolved', { n: unmerged.length, f: unmerged[0] }))
    await runContinue(repo, ['rebase', '--continue'], l, 'rebaseConflicts')
  })
)

ipcMain.handle('treeline:skipRebase', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    // 3.10: pula o commit que travou e segue para o próximo do plano.
    try {
      await simpleGit(repo).raw(['rebase', '--skip'])
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
  readOp(async (): Promise<import('../shared/types').OpState> => ({
    inProgress: await exists(join(await gitDirOf(repo), 'CHERRY_PICK_HEAD'))
  }))
)

ipcMain.handle('treeline:cherryPick', (_event, repo: string, hash: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    assertSafeRef(hash, l)
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
    const unmerged = await unmergedPaths(repo)
    if (unmerged.length > 0) throw new Error(mx(l, 'pickUnresolved', { n: unmerged.length, f: unmerged[0] }))
    await runContinue(repo, ['cherry-pick', '--continue'], l, 'pickConflicts')
  })
)

ipcMain.handle('treeline:skipCherryPick', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    try {
      await simpleGit(repo).raw(['cherry-pick', '--skip'])
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
  readOp(async () => {
    try {
      await simpleGit(repo).raw(['flow', 'version'])
      return { installed: true }
    } catch {
      return { installed: false }
    }
  })
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
    assertRefName(full, l)
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
  readOp(async () => {
    const n = Math.min(Math.max(limit ?? 100, 1), 500)
    return parseReflog(
      await simpleGit(repo).raw(['reflog', `--max-count=${n}`, '--date=iso', '--pretty=format:%H%x00%gd%x00%an%x00%ad%x00%s%x1e'])
    )
  })
)

ipcMain.handle('treeline:undoToReflog', (_event, repo: string, ref: string) =>
  enqueue(repo, async () => {
    assertSafeRef(ref, 'en')
    // Backup automático antes do reset destrutivo (exigência Fase 3).
    await backupBundle(repo)
    await simpleGit(repo).raw(['reset', '--hard', ref])
  })
)

// ---------------------------------------------------------------------------
// IPC: backups bundle (listar + restaurar p/ namespace isolado).
// ---------------------------------------------------------------------------
ipcMain.handle('treeline:listBackups', (_event, repo: string) =>
  readOp(async (): Promise<import('../shared/types').BackupInfo[]> => {
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
  })
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
  readOp(async (): Promise<import('../shared/types').RemoteInfo[]> => {
    const raw = await simpleGit(repo).raw(['remote', '-v'])
    const seen = new Map<string, string>()
    for (const line of raw.split('\n')) {
      const m = line.match(/^(\S+)\t(\S+) \(fetch\)$/)
      if (m?.[1] && m?.[2] && !seen.has(m[1])) seen.set(m[1], m[2])
    }
    return [...seen].map(([name, url]) => ({ name, url }))
  })
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
  const l = asLang(lang)
  assertCloneUrl(url, l)
  const rawUrl = url.trim()
  // URL sem credenciais para argv (token não pode vazar na lista de processos
  // nem no `remote.origin.url` do repo): a senha vai por GIT_ASKPASS (arquivo
  // temporário 0600, removido ao fim) e o usuário segue como "oauth2".
  let cloneUrl = rawUrl
  let askPass: string | null = null
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl)) {
    try {
      const u = new URL(rawUrl)
      if (u.password) {
        const pass = decodeURIComponent(u.password)
        const user = u.username ? decodeURIComponent(u.username) : 'oauth2'
        u.password = ''
        u.username = user
        cloneUrl = u.toString()
        const { tmpdir } = await import('node:os')
        const { randomBytes } = await import('node:crypto')
        const script = join(tmpdir(), `tl-askpass-${randomBytes(6).toString('hex')}`)
        await fs.writeFile(script, `#!/bin/sh\nprintf '%s\\n' '${pass.replace(/\\/g, '\\\\').replace(/'/g, `'\\''`)}'\n`, { mode: 0o700 })
        askPass = script
      }
    } catch {
      /* URL malformada: o git dá o erro de autenticação */
    }
  }
  const base = cloneUrl.replace(/\/$/, '').split('/').pop() ?? 'repo'
  const name = base.replace(/\.git$/, '') || 'repo'
  const target = join(parent, name)
  const prevAsk = process.env['GIT_ASKPASS']
  const runClone = async (): Promise<void> => {
    try {
      await runGitCancellable(parent, 'Clone', ['clone', cloneUrl, target], l)
    } catch (e) {
      throw friendlySyncError('Clone', e, l)
    }
  }
  try {
    if (askPass) process.env['GIT_ASKPASS'] = askPass
    await runClone()
  } finally {
    if (prevAsk === undefined) delete process.env['GIT_ASKPASS']
    else process.env['GIT_ASKPASS'] = prevAsk
    if (askPass) await fs.rm(askPass, { force: true })
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
// Watcher: avisa o renderer quando a worktree ou o gitdir mudam fora do app
// (terminal, outro GUI). Sem chokidar aqui antes; refresh era só no foco.
// ---------------------------------------------------------------------------
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
      const rel = path.startsWith(repo) ? path.slice(repo.length) : path
      // Ignora .git inteiro, EXCETO os arquivos de estado que importam.
      if (rel.startsWith('/.git/')) {
        const keep = ['/.git/HEAD', '/.git/index', '/.git/refs', '/.git/MERGE_HEAD', '/.git/MERGE_MSG', '/.git/CHERRY_PICK_HEAD', '/.git/REVERT_HEAD']
        return !keep.some((k) => rel === k || rel.startsWith(k + '/'))
      }
      return /(^|[/\\])\.(git|hg|svn)([/\\]|$)/.test(rel)
    },
    ignoreInitial: true,
    depth: undefined
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
  // READ: lê fora da fila de escrita, MAS `git status` faz refresh de stat no
  // índice — espera escritas enfileiradas do repo para não brigar com o
  // `index.lock` de um commit/stage em andamento (3.7).
  readIndexOp(repo, async (): Promise<RepoStatus> => {
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
  })
)

ipcMain.handle('treeline:getLog', (_event, repo: string, limit?: number, skip?: number, ref?: string | string[]) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<CommitInfo[]> => {
    const n = Math.min(Math.max(limit ?? 300, 1), 2000)
    const s = Math.min(Math.max(skip ?? 0, 0), 100000)
    // `ref` aceita um ref (modo "branch atual") ou a seleção do combo de
    // branches do history. Vem qualificado (refs/heads/…, refs/remotes/…),
    // então nunca briga com path/tag de nome igual.
    const onlyRefs = (Array.isArray(ref) ? ref : ref?.trim() ? [ref] : [])
      .map((r) => r.trim())
      .filter(Boolean)
    // %x1e (record separator) delimita commits; %x00 delimita campos.
    // Não usar \0\0 como separador: %P vazio (root commit) gera NUL duplo.
    // --topo-order é contrato do lane allocator single-pass: garante que
    // nenhum pai apareça antes de todos os seus filhos (ordem por data pura
    // embaralha a cadeia quando há múltiplas tips com clock skew, e cada
    // commit órfão de reserva vira uma lane nova = staircase).
    // --skip pagina: mesma ordem estável enquanto o repo não muda.
    // refs explícitos (branch atual ou seleção múltipla): ancestry real em
    // vez de heurística de refs; sem seleção, `--all`.
    const raw = await simpleGit(repo).raw([
      'log', ...(onlyRefs.length ? onlyRefs : ['--all']), '--topo-order', `--max-count=${n}`, `--skip=${s}`, '--date=iso',
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
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<BranchInfo[]> => {
    const b = await simpleGit(repo).branchLocal()
    return b.all.map((name) => ({ name, current: name === b.current }))
  })
)

ipcMain.handle('treeline:getDiff', (_event, repo: string, file: string, staged: boolean, lang?: unknown) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async () => {
    const args = staged ? ['diff', '--cached', '--unified=3', '--', file] : ['diff', '--unified=3', '--', file]
    const out = await simpleGit(repo).raw(args)
    if (out.trim()) return out
    // Arquivo novo (untracked): `git diff` sai vazio porque ele nunca entrou
    // no index. Para revisar o código antes do commit, emite um diff sintético
    // com o arquivo inteiro como adicionado; sem hunks reais o DiffViewer
    // renderiza em modo somente leitura (stage continua na linha do arquivo).
    if (!staged) {
      try {
        const tracked = (await simpleGit(repo).raw(['ls-files', '--', file])).trim()
        if (!tracked) {
          const rel = relPathSafe(repo, file, 'en' as UILang)
          if (!rel) return ''
          const l = asLang(lang)
          const buf = await fs.readFile(join(repo, rel))
          const head = `--- /dev/null\n+++ b/${rel}\n`
          if (looksBinary(buf)) return head + mx(l, 'newBinary') + '\n'
          const MAX = 1024 * 1024
          const trunc = buf.length > MAX
          const lines = (trunc ? buf.subarray(0, MAX) : buf).toString('utf8').split('\n')
          if (lines[lines.length - 1] === '') lines.pop()
          if (lines.length > 0) {
            // Nota antes do `@@`: sem hunk ainda, os contadores estão em 0 e
            // os gutters saem vazios (num(0) === '').
            const note = trunc ? mx(l, 'newTruncated') + '\n' : ''
            return `${head}${note}@@ -0,0 +1,${lines.length} @@\n${lines.map((x) => `+${x}`).join('\n')}\n`
          }
        }
      } catch {
        // Sem fonte legível (sumiu, sem permissão): cai no placeholder.
      }
    }
    // Arquivo em conflito: `git diff` sai vazio porque o index tem 3 estágios
    // e não existe blob "único" para comparar. O BUG anterior devolvia um
    // pseudo-diff (`@@ ours @@` sem contagem de linhas), que o DiffViewer não
    // consegue parsear — a aba ficava em branco. Agora emitimos diff unificado
    // de verdade: o git aceita specs de blob no lugar de um commit, então
    // `git diff :1:f :2:f` funciona mesmo com o index unmerged.
    try {
      const l = asLang(lang)
      const unmerged = (await simpleGit(repo).raw(['ls-files', '-u', '--', file])).trim()
      if (!unmerged) return out
      const exists = async (spec: string): Promise<string> =>
        simpleGit(repo)
          .raw(['cat-file', '-e', spec])
          .then(() => spec)
          .catch(() => '')
      const s1 = await exists(`:1:${file}`)
      const s2 = await exists(`:2:${file}`)
      const s3 = await exists(`:3:${file}`)
      if (!s2 && !s3) return out

      /**
       * Um lado como diff unificado. Descarta o cabeçalho `diff --git`/`index`
       * do git e emite `---`/`+++` próprios com o rótulo do lado, que é o que
       * o usuário precisa ler; o DiffViewer só exige o `@@`.
       */
      const side = async (from: string, to: string, label: string): Promise<string> => {
        const d = await simpleGit(repo).raw(['diff', '--unified=3', from, to])
        const at = d.indexOf('@@')
        if (at < 0) return ''
        return `--- a/${label}\n+++ b/${label}\n${d.slice(at)}`
      }

      // Rótulos de verdade (branch de cada lado): o cabeçalho do diff é a
      // única pista de qual linha veio de qual branch durante a resolução.
      const { ours: oursRef, theirs: theirsRef } = await conflictLabels(repo)
      const oursLabel = `${file} — ${mx(l, 'conflictOursLabel', { r: oursRef })}`
      const theirsLabel = `${file} — ${mx(l, 'conflictTheirsLabel', { r: theirsRef })}`
      const parts: string[] = []
      if (s1 && s2) parts.push(await side(s1, s2, oursLabel))
      if (s1 && s3) parts.push(await side(s1, s3, theirsLabel))
      // add/add não tem base: a única comparação útil é um lado contra o outro.
      if (!s1 && s2 && s3) parts.push(await side(s2, s3, `${oursLabel} -> ${theirsLabel}`))
      const body = parts.filter(Boolean).join('')
      return body || out
    } catch {
      return out
    }
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
    const upBranch = up.slice(up.indexOf('/') + 1)
    if (!upBranch || upBranch.startsWith('-')) throw new Error(mx(l, 'noUpstream', { b: up }))
    const cur = (await simpleGit(repo).revparse(['--abbrev-ref', 'HEAD'])).trim()
    if (!cur || cur === 'HEAD') throw new Error(mx(l, 'nameInvalid', { x: cur }))
    assertSafeRef(cur, l)
    const before = await refHash(repo, '@{u}')
    // Push com refspec explícito `local:upstream`: nunca "empurra tudo" nem
    // entrega hash no lugar de branch (protege detached HEAD).
    try {
      await runGitCancellable(repo, 'Push', ['push', 'origin', `${cur}:${upBranch}`], l)
    } catch (e) {
      throw friendlySyncError('Push', e, l)
    }
    const after = await refHash(repo, '@{u}')
    if (before && after && before !== after) {
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

// ---------------------------------------------------------------------------
// Update check: compara a versão do pacote com o último release no GitHub.
// Sem telemetria out-bound — 1 request GET quando pedido explicitamente.
// ---------------------------------------------------------------------------
ipcMain.handle('treeline:checkUpdates', async () => {
  const current = app.getVersion()
  try {
    const res = await fetch('https://api.github.com/repos/viniciuswerneck/TreeLine/releases/latest', {
      headers: { 'User-Agent': `treeline/${current}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000)
    })
    if (!res.ok) return { current, latest: null, url: '' }
    const json = (await res.json()) as { tag_name?: string; html_url?: string }
    return { current, latest: json.tag_name?.replace(/^v/, '') ?? null, url: json.html_url ?? '' }
  } catch {
    return { current, latest: null, url: '' }
  }
})

// ---------------------------------------------------------------------------
// Custom Actions: comandos externos por repo (nome + shell), salvos em JSON
// no userData. Execução com timeout e saída truncada.
// ---------------------------------------------------------------------------
function customActionsFile(): string {
  return join(app.getPath('userData'), 'custom-actions.json')
}

async function readCustomActions(): Promise<import('../shared/types').CustomAction[]> {
  try {
    const raw = await fs.readFile(customActionsFile(), 'utf-8')
    const list = JSON.parse(raw) as unknown
    if (!Array.isArray(list)) return []
    return list
      .filter((x): x is { name?: unknown; cmd?: unknown; id?: unknown; args?: unknown } => typeof x === 'object' && x !== null)
      .map((x, i) => ({
        id: typeof x.id === 'string' && x.id ? x.id : `ca-${Date.now()}-${i}`,
        name: typeof x.name === 'string' ? x.name : '',
        cmd: typeof x.cmd === 'string' ? x.cmd : '',
        args: Array.isArray(x.args) ? x.args.filter((a): a is string => typeof a === 'string').slice(0, 20) : []
      }))
      .filter((x) => x.name.trim() && x.cmd.trim())
  } catch {
    return []
  }
}

/** Substitui tokens {{repo}} etc. em cmd/args de custom action. */
function expandActionTokens(s: string, ctx: import('../shared/types').ActionContext): string {
  const map: Record<string, string> = {
    repo: ctx.repo ?? '',
    branch: ctx.branch ?? '',
    remoteBranch: ctx.remoteBranch ?? '',
    file: ctx.file ?? '',
    commit: ctx.commit ?? ''
  }
  return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(map, key) ? shellQuote(map[key]) : whole
  )
}

/** Aspas simples para shell quando o valor tiver espaço ou metacaractere. */
function shellQuote(v: string): string {
  if (v === '') return "''"
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(v) ? v : `'${v.replace(/'/g, `'\\''`)}'`
}

ipcMain.handle('treeline:getCustomActions', async () => readCustomActions())

ipcMain.handle(
  'treeline:saveCustomAction',
  async (_event, a: { id?: string; name: string; cmd: string; args?: string[] }) => {
    const list = await readCustomActions()
    const args = Array.isArray(a.args)
      ? a.args.map((x) => String(x).slice(0, 200)).filter((x) => x.trim()).slice(0, 20)
      : []
    const clean = {
      id: a.id?.trim() || `ca-${Date.now()}`,
      name: a.name.trim().slice(0, 80),
      cmd: a.cmd.trim().slice(0, 2000),
      args
    }
    if (!clean.name || !clean.cmd) throw new Error('empty')
    const next = [clean, ...list.filter((x) => x.id !== clean.id)].slice(0, 50)
    await fs.mkdir(app.getPath('userData'), { recursive: true })
    await fs.writeFile(customActionsFile(), JSON.stringify(next, null, 2))
    return next
  }
)

ipcMain.handle('treeline:deleteCustomAction', async (_event, id: string) => {
  const next = (await readCustomActions()).filter((x) => x.id !== id)
  await fs.writeFile(customActionsFile(), JSON.stringify(next, null, 2))
  return next
})

ipcMain.handle(
  'treeline:runCustomAction',
  (_event, repo: string, id: string, ctx?: import('../shared/types').ActionContext, lang?: unknown) =>
    enqueue(repo, async (): Promise<import('../shared/types').ActionResult> => {
      const l = asLang(lang)
      const found = (await readCustomActions()).find((x) => x.id === id)
      if (!found) throw new Error(mx(l, 'nameInvalid', { x: id }))
      const context: import('../shared/types').ActionContext = { repo, ...(ctx ?? {}) }
      // Uma passada só por token: um valor com `{{...}}` literal não é reexpandido.
      const script = [
        expandActionTokens(found.cmd, context),
        ...found.args.map((a) => expandActionTokens(a, context))
      ].join(' ')
      return new Promise<import('../shared/types').ActionResult>((resolve, reject) => {
        const cp = require('node:child_process') as typeof import('node:child_process')
        const child = cp.spawn('sh', ['-c', script], {
          cwd: repo,
          timeout: 60_000,
          env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1', CLICOLOR_FORCE: '1' }
        })
        let out = ''
        child.stdout?.on('data', (d) => {
          out += String(d)
          if (out.length > 20000) out = out.slice(-20000)
        })
        child.stderr?.on('data', (d) => {
          out += String(d)
          if (out.length > 20000) out = out.slice(-20000)
        })
        child.on('error', (e) => reject(e instanceof Error ? e : new Error(String(e))))
        child.on('close', (code) => resolve({ code, output: out.trim().slice(-8000) }))
      })
    })
)

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

async function repoConfig(repo: string, key: string): Promise<string> {
  try {
    return (await simpleGit(repo).raw(['config', '--local', key])).trim()
  } catch {
    return ''
  }
}

ipcMain.handle('treeline:getEffectiveIdentity', (_event, repo: string) =>
  readOp(async (): Promise<import('../shared/types').EffectiveIdentity> => {
    const [globalName, globalEmail, localName, localEmail] = await Promise.all([
      getGlobal('user.name'),
      getGlobal('user.email'),
      repoConfig(repo, 'user.name'),
      repoConfig(repo, 'user.email')
    ])
    const name = localName || globalName
    const email = localEmail || globalEmail
    return {
      name,
      email,
      scope: localName || localEmail ? 'local' : name || email ? 'global' : 'none',
      globalName,
      globalEmail
    }
  })
)

ipcMain.handle('treeline:setRepoIdentity', async (_event, repo: string, id: GitIdentity, lang?: unknown): Promise<void> => {
  const l = asLang(lang)
  const name = id.name.trim()
  const email = id.email.trim()
  if (!name) throw new Error(mx(l, 'nameEmpty'))
  if (!EMAIL_RE.test(email)) throw new Error(mx(l, 'emailInvalid'))
  await simpleGit(repo).raw(['config', 'user.name', name])
  await simpleGit(repo).raw(['config', 'user.email', email])
})

ipcMain.handle('treeline:getCommitDetail', (_event, repo: string, hash: string, lang?: unknown) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<CommitDetail> => {
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
    const parents = parentStr ? parentStr.split(/\s+/).map((p) => p.trim()).filter((p) => p.length > 0) : []
    // Merge não tem diff próprio: `show --name-only` sai vazio (daí o famoso
    // "Arquivos (0)"). Arquivos e stats de um merge = mudança contra o
    // primeiro pai — o que ele trouxe para o branch.
    const isMerge = parents.length > 1
    const refs = (refStr ? refStr.split(', ') : []).flatMap((r) => {
      if (r.startsWith('HEAD -> ')) return ['HEAD', r.slice('HEAD -> '.length)]
      if (r === 'HEAD') return ['HEAD']
      return [r]
    })
    const files = isMerge
      ? (await simpleGit(repo).raw(['diff', '--name-only', `${h}^1`, h]))
          .split('\n')
          .map((f) => f.trim())
          .filter((f) => f.length > 0)
      : rest
          .join('\x1e')
          .split('\n')
          .map((f) => f.trim())
          .filter((f) => f.length > 0)
    // +/- por arquivo (merge sem diff próprio pode vir vazio: sem stats).
    let stats: import('../shared/types').FileStat[] = []
    try {
      const ns = await simpleGit(repo).raw(
        isMerge ? ['diff', '--numstat', `${h}^1`, h] : ['show', '--numstat', '--format=', h]
      )
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
      parents,
      author,
      committer,
      date,
      message: message ?? '',
      refs,
      files,
      stats
    }
  })
)

ipcMain.handle('treeline:getCommitDiff', (_event, repo: string, hash: string, file: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async () => {
    // Merge: `show -- <file>` sai vazio (diff combinado limpo não mostra
    // nada). Compara com o primeiro pai, igual aos arquivos/stats.
    const parents = (await simpleGit(repo).raw(['show', '-s', '--pretty=%P', hash])).trim().split(/\s+/).filter(Boolean)
    if (parents.length > 1) return simpleGit(repo).raw(['diff', `${hash}^1`, hash, '--unified=3', '--', file])
    return simpleGit(repo).raw(['show', hash, '--unified=3', '--', file])
  })
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
  readOp(async (): Promise<import('../shared/types').HunkInfo[]> => (await diffForHunks(repo, file, staged)).hunks)
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
  readOp(async (): Promise<import('../shared/types').OpState> => ({
    inProgress: await exists(join(await gitDirOf(repo), 'REVERT_HEAD'))
  }))
)

ipcMain.handle('treeline:revertContinue', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    // Revert em conflito não tinha Continue: a operação ficava travada até
    // o usuário usar o terminal. Mesma guarda dos outros continues.
    const unmerged = await unmergedPaths(repo)
    if (unmerged.length > 0) throw new Error(mx(l, 'revertUnresolved', { n: unmerged.length, f: unmerged[0] }))
    await runContinue(repo, ['revert', '--continue'], l, 'revertConflicts')
  })
)

ipcMain.handle('treeline:skipRevert', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    try {
      await simpleGit(repo).raw(['revert', '--skip'])
    } catch (e) {
      throw conflictErr('revertConflicts', e, l)
    }
  })
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
  readOp(async (): Promise<import('../shared/types').WorktreeInfo> => {
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
  })
)

// ---------------------------------------------------------------------------
// IPC: LFS (detecção + contagem) e Submodules (lista + update/init).
// ---------------------------------------------------------------------------
ipcMain.handle('treeline:getLfsInfo', (_event, repo: string) =>
  // READ: fora da fila de escrita.
  readOp(async (): Promise<import('../shared/types').LfsInfo> => {
    const installed = await simpleGit(repo).raw(['lfs', 'version']).then(() => true).catch(() => false)
    const patterns: string[] = []
    try {
      const attrs = await fs.readFile(join(repo, '.gitattributes'), 'utf-8')
      for (const line of attrs.split('\n')) {
        const m = /^\s*(\S+)\s+filter=lfs\b/.exec(line)
        if (m && !patterns.includes(m[1])) patterns.push(m[1])
      }
    } catch {
      /* sem .gitattributes */
    }
    const tracked = patterns.length > 0
    let files = 0
    if (installed && tracked) {
      try {
        const raw = await simpleGit(repo).raw(['lfs', 'ls-files'])
        files = raw.split('\n').map((l) => l.trim()).filter(Boolean).length
      } catch {
        /* segue zerado */
      }
    }
    return { installed, tracked, files, patterns }
  })
)

ipcMain.handle('treeline:lfsPull', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, async (): Promise<import('../shared/types').SyncResult> => {
    const l = asLang(lang)
    try {
      await runGitCancellable(repo, 'LFS Pull', ['lfs', 'pull'], l)
    } catch (e) {
      throw friendlySyncError('LFS Pull', e, l)
    }
    return { summary: mx(l, 'lfsPullDone') }
  })
)

ipcMain.handle('treeline:lfsPush', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, async (): Promise<import('../shared/types').SyncResult> => {
    const l = asLang(lang)
    try {
      await runGitCancellable(repo, 'LFS Push', ['lfs', 'push'], l)
    } catch (e) {
      throw friendlySyncError('LFS Push', e, l)
    }
    return { summary: mx(l, 'lfsPushDone') }
  })
)

ipcMain.handle('treeline:lfsTrack', (_event, repo: string, pattern: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    try {
      await simpleGit(repo).raw(['lfs', 'track', pattern])
    } catch (e) {
      throw friendlySyncError('LFS Track', e, asLang(lang))
    }
  })
)

ipcMain.handle('treeline:lfsUntrack', (_event, repo: string, pattern: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    try {
      await simpleGit(repo).raw(['lfs', 'untrack', pattern])
    } catch (e) {
      throw friendlySyncError('LFS Untrack', e, asLang(lang))
    }
  })
)

ipcMain.handle('treeline:getSubmodules', (_event, repo: string) =>
  // READ: fora da fila de escrita.
  readOp(async (): Promise<import('../shared/types').SubmoduleInfo[]> => {
    let raw = ''
    try {
      // --recursive: sub-submódulos (inner/deep) também aparecem na lista.
      raw = await simpleGit(repo).raw(['submodule', 'status', '--recursive'])
    } catch {
      return []
    }
    return raw.split('\n').flatMap((line) => {
      const m = /^([ +-U]?)([0-9a-f]{40}) (\S+)( \((.*)\))?$/.exec(line)
      if (!m?.[2] || !m?.[3]) return []
      return [{
        hash: m[2] as string,
        path: m[3] as string,
        state: (m[1] || ' ').trim() === '' ? ' ' : (m[1] as string),
        label: (m[5] ?? '').trim()
      }]
    })
  })
)

ipcMain.handle('treeline:updateSubmodules', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, async () => {
    try {
      await simpleGit(repo).raw(['submodule', 'update', '--init', '--recursive'])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(mx(asLang(lang), 'submoduleFail', { d: msg.split('\n')[0] as string }))
    }
  })
)

ipcMain.handle('treeline:revertCommit', (_event, repo: string, hash: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    assertSafeRef(hash, l)
    const h = hash.trim()
    if (!h) throw new Error(mx(l, 'unsafeRef', { x: '' }))
    try {
      await simpleGit(repo).raw(['revert', '--no-edit', h])
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
    assertSafeRef(ref, l)
    const m = mode === 'soft' || mode === 'hard' ? mode : 'mixed'
    const target = ref.trim() || 'HEAD'
    await backupBundle(repo)
    await simpleGit(repo).raw(['reset', `--${m}`, target])
    return { summary: mx(l, 'resetDone', { m, r: target }) }
  })
)

ipcMain.handle('treeline:resolveOurs', (_event, repo: string, file: string, lang?: unknown) =>
  enqueue(repo, () => resolveSideRaw(repo, file, 'ours', asLang(lang)))
)

ipcMain.handle('treeline:resolveTheirs', (_event, repo: string, file: string, lang?: unknown) =>
  enqueue(repo, () => resolveSideRaw(repo, file, 'theirs', asLang(lang)))
)
// ---------------------------------------------------------------------------
// IPC: resolvedor de conflito de 3 vias.
// ---------------------------------------------------------------------------
/**
 * Operação interrompida e rótulos dos dois lados, para a UI dizer
 * "ours: main" / "theirs: develop" em vez de "ours/theirs" genéricos.
 */
async function conflictLabels(repo: string): Promise<{ op: ConflictOp; ours: string; theirs: string }> {
  const gd = await gitDirOf(repo)
  const headRef = await simpleGit(repo)
    .raw(['rev-parse', '--abbrev-ref', 'HEAD'])
    .then((r) => r.trim())
    .catch(() => '')
  const ours = headRef && headRef !== 'HEAD' ? headRef : 'HEAD'

  // Rebase: o lado "theirs" é a série de commits sendo reaplicada, não um ref.
  const rebaseHeadName = join(gd, 'rebase-merge', 'head-name')
  if (await exists(rebaseHeadName)) {
    const head = (await fs.readFile(rebaseHeadName, 'utf-8').catch(() => '')).trim()
    return { op: 'rebase', ours: headRef || 'HEAD', theirs: shortRef(head.replace(/^refs\/heads\//, '')) || 'commits' }
  }
  if (await exists(join(gd, 'rebase-apply'))) return { op: 'rebase', ours: headRef || 'HEAD', theirs: 'commits' }

  const refAt = async (file: string): Promise<string> => {
    if (!(await exists(join(gd, file)))) return ''
    const sha = (await fs.readFile(join(gd, file), 'utf-8').catch(() => '')).trim()
    if (!sha) return ''
    // `--refs` aceita UM glob, não uma lista separada por vírgula: passar
    // `refs/heads/*,refs/remotes/*` casa com nada e o name-rev responde
    // "undefined" (rc 0). `refs/*` cobre heads, remotes e tags.
    const name = await simpleGit(repo)
      .raw(['name-rev', '--name-only', '--refs=refs/*', sha])
      .then((r) => r.trim())
      .catch(() => '')
    // CUIDADO: `name-rev` NÃO falha quando não acha nome — ele imprime a
    // string literal "undefined" (e "ambiguous") e sai com 0. Sem este
    // filtro o rótulo do lado deles virava literalmente "undefined" na UI.
    // O fallback honesto é o sha curto, que sempre identifica o commit.
    if (!name || name === 'undefined' || name.startsWith('ambiguous')) return sha.slice(0, 8)
    return shortRef(name)
  }

  const mergeHead = await refAt('MERGE_HEAD')
  if (mergeHead) return { op: 'merge', ours, theirs: mergeHead }
  const cherry = await refAt('CHERRY_PICK_HEAD')
  if (cherry) return { op: 'cherry-pick', ours, theirs: cherry }
  const revert = await refAt('REVERT_HEAD')
  if (revert) return { op: 'revert', ours, theirs: revert }
  return { op: null, ours, theirs: 'theirs' }
}

ipcMain.handle('treeline:getConflictFiles', (_event, repo: string) =>
  // READ: fora da fila de escrita (o overlay abre enquanto outra op termina).
  readOp(async (): Promise<ConflictFile[]> => {
    const git = simpleGit(repo)
    const { ours: oursLabel, theirs: theirsLabel } = await conflictLabels(repo)
    const stages = stagesByPath(parseLsFilesU(await git.raw(['ls-files', '-u', '-z'])))
    const out: ConflictFile[] = []
    for (const { xy, path } of parseUnmergedXY(await git.raw(['status', '--porcelain=v2', '-z']))) {
      const st = stages.get(path) ?? []
      // Só rotula como binário depois de olhar o blob; aqui é pré-checagem
      // barata (os 3 estágios presentes sem marcador).
      out.push({
        path,
        xy,
        kind: conflictKindOf(xy, st),
        oursLabel,
        theirsLabel,
        stages: st,
        binary: false
      })
    }
    return out
  })
)

ipcMain.handle('treeline:getConflictOp', (_event, repo: string) =>
  // READ: os rótulos mudam com a operação; fora da fila.
  readOp(async (): Promise<ConflictOp> => {
    const op = (await conflictLabels(repo)).op
    if (op) return op
    // `git stash apply/pop` conflitante NÃO deixa MERGE_HEAD nem cabeça de
    // rebase: o único sinal é o index ainda conflitante. `checkout -m` e
    // `restore --merge` caem no mesmo balde e também não têm `--continue`,
    // então o tratamento (concluir sem comando git) é o mesmo para os três.
    return (await unmergedPaths(repo)).length > 0 ? 'stash' : null
  })
)

ipcMain.handle('treeline:getConflictStages', (_event, repo: string, file: string) =>
  // READ: 3 `cat-file` + 1 `merge-file`, sem tocar no index.
  readOp(async (): Promise<ConflictStages> => {
    const git = simpleGit(repo)
    const entries = parseLsFilesU(await git.raw(['ls-files', '-u', '-z', '--', file]))
    if (entries.length === 0) throw new Error(`not unmerged: ${file}`)
    const byStage = new Map(entries.map((e) => [e.stage, e]))
    const { ours: oursLabel, theirs: theirsLabel } = await conflictLabels(repo)

    const readBlob = async (stage: number): Promise<{ text: string; binary: boolean } | null> => {
      const e = byStage.get(stage)
      if (!e) return null
      const raw = await git.raw(['cat-file', 'blob', e.sha])
      return { text: raw, binary: looksBinary(Buffer.from(raw, 'utf8')) }
    }
    const s2 = await readBlob(2)
    const s3 = await readBlob(3)
    const s1 = await readBlob(1)

    // Binário: a UI mostra "resolver por lado" e não tenta merge de texto.
    if (s2?.binary || s3?.binary) {
      return {
        path: file,
        kind: 'binary',
        marked: '',
        ours: null,
        theirs: null,
        base: null,
        oursLabel,
        theirsLabel,
        binary: true
      }
    }

    // delete/modify e both-deleted: falta um dos estágios e o git NÃO deixa
    // marcador no worktree. Devolvemos os lados crus com o ausente = null, e o
    // renderer monta a região (contrato 4 do `conflict3.ts`).
    if (byStage.size < 3) {
      return {
        path: file,
        kind: byStage.has(2) ? 'deleted-by-them' : byStage.has(3) ? 'deleted-by-us' : 'both-deleted',
        marked: '',
        ours: s2?.text ?? null,
        theirs: s3?.text ?? null,
        base: s1?.text ?? null,
        oursLabel,
        theirsLabel,
        binary: false
      }
    }

    // add/add não tem stage 1. O `merge-file --object-id` exige que o sha da
    // base exista no object store, então gravamos o blob vazio (imutável, sem
    // risco — é o mesmo objeto que o `git add` de arquivo vazio cria).
    // simple-git não faz stdin, então o vazio vai por arquivo temporário.
    let baseSha = byStage.get(1)?.sha
    if (!baseSha) {
      const { tmpdir } = await import('node:os')
      const { randomBytes } = await import('node:crypto')
      const tmp = join(tmpdir(), `treeline-${randomBytes(6).toString('hex')}.empty`)
      try {
        await fs.writeFile(tmp, '')
        baseSha = (await git.raw(['hash-object', '-w', '-t', 'blob', tmp])).trim()
      } finally {
        await fs.rm(tmp, { force: true })
      }
    }

    const marked = await git
      .raw([
        'merge-file',
        '-p',
        '--object-id',
        '--zdiff3',
        '-L',
        'ours',
        '-L',
        'base',
        '-L',
        'theirs',
        byStage.get(2)!.sha,
        baseSha,
        byStage.get(3)!.sha
      ])
      .catch((e: unknown) => {
        // rc = número de conflitos (1 um, N vários): o stdout é o que serve.
        const err = e as { stdout?: string }
        if (typeof err.stdout === 'string') return err.stdout
        throw e
      })

    return {
      path: file,
      kind: byStage.has(1) ? 'both-modified' : 'both-added',
      marked,
      ours: s2?.text ?? '',
      theirs: s3?.text ?? '',
      base: byStage.has(1) ? (s1?.text ?? '') : null,
      oursLabel,
      theirsLabel,
      binary: false
    }
  })
)

/** ours + theirs com \n garantido entre os dois (union sem "No newline" no meio). */
function joinSides(a: string, b: string): string {
  return (a.endsWith('\n') || a === '' ? a : `${a}\n`) + (b.endsWith('\n') || b === '' ? b : `${b}\n`)
}

/**
 * Resolve o arquivo inteiro por um lado. É destrutivo, então grava bundle
 * antes (mesma política de reset hard/rebase).
 */
async function resolveSideRaw(repo: string, file: string, side: ConflictSide, l: UILang): Promise<void> {
  const rel = relPathSafe(repo, file, 'en' as UILang)
  if (!rel) throw new Error(mx(l, 'unsafeRef', { x: file }))
  await backupBundle(repo)
  const git = simpleGit(repo)
  if (side === 'both-deleted') {
    await git.raw(['rm', '-f', '--', rel])
    return
  }
  if (side === 'both') {
    const entries = parseLsFilesU(await git.raw(['ls-files', '-u', '-z', '--', rel]))
    const byStage = new Map(entries.map((e) => [e.stage, e]))
    const s2 = byStage.get(2)
    const s3 = byStage.get(3)
    if (!s2 || !s3) throw new Error(mx(l, 'conflictNoBothSides', { f: rel }))
    await fs.writeFile(join(repo, rel), joinSides(await git.raw(['cat-file', 'blob', s2.sha]), await git.raw(['cat-file', 'blob', s3.sha])))
    await git.raw(['add', '--', rel])
    return
  }
  await git.raw(['checkout', `--${side}`, '--', rel])
  await git.raw(['add', '--', rel])
}

ipcMain.handle('treeline:resolveConflictSide', (_event, repo: string, file: string, side: ConflictSide, lang?: unknown) =>
  enqueue(repo, () => resolveSideRaw(repo, file, side, asLang(lang)))
)

ipcMain.handle('treeline:applyConflictResult', (_event, repo: string, file: string, content: string, del: boolean, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    const rel = relPathSafe(repo, file, 'en' as UILang)
    if (!rel) throw new Error(mx(l, 'unsafeRef', { x: file }))
    const git = simpleGit(repo)
    // Sem bundle aqui de propósito: o editor salva a cada região e um
    // `bundle create --all` por região custaria O(repo) inteiro. O undo é o
    // add, e o bundle do `Continue`/abort cobre a operação como um todo.
    if (del) {
      await git.raw(['rm', '-f', '--', rel])
      return
    }
    await fs.writeFile(join(repo, rel), content)
    await git.raw(['add', '--', rel])
  })
)

ipcMain.handle('treeline:getRerere', (_event, repo: string) =>
  // READ: só lê config do repo.
  readOp(async (): Promise<boolean> => {
    const v = await simpleGit(repo)
      .raw(['config', '--get', 'rerere.enabled'])
      .catch(() => '')
    return v.trim() === 'true'
  })
)

ipcMain.handle('treeline:setRerere', (_event, repo: string, on: boolean) =>
  enqueue(repo, async () => {
    // Opt-in explícito: mexe só no repo aberto, nunca no global.
    await simpleGit(repo).raw(on ? ['config', 'rerere.enabled', 'true'] : ['config', '--unset', 'rerere.enabled'])
  })
)

/** Publica o branch atual: `push -u origin <branch>` (primeiro push). */
ipcMain.handle('treeline:pushPublish', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, async (): Promise<import('../shared/types').SyncResult> => {
    const l = asLang(lang)
    const cur = (await simpleGit(repo).revparse(['--abbrev-ref', 'HEAD'])).trim()
    if (!cur || cur === 'HEAD') throw new Error(mx(l, 'nameInvalid', { x: cur }))
    try {
      await runGitCancellable(repo, 'Push', ['push', '-u', 'origin', cur], l)
    } catch (e) {
      throw friendlySyncError('Push', e, l)
    }
    return { summary: mx(l, 'pushDone', { x: `${cur} → origin/${cur}` }) }
  })
)

ipcMain.handle('treeline:pushForce', (_event, repo: string, forceLease: boolean, lang?: unknown) =>
  enqueue(repo, async (): Promise<import('../shared/types').SyncResult> => {
    const l = asLang(lang)
    const up = await upstreamName(repo)
    if (!up) throw new Error(mx(l, 'noUpstream', { b: 'HEAD' }))
    const upBranch = up.slice(up.indexOf('/') + 1)
    if (!upBranch || upBranch.startsWith('-')) throw new Error(mx(l, 'noUpstream', { b: up }))
    const cur = (await simpleGit(repo).revparse(['--abbrev-ref', 'HEAD'])).trim()
    if (!cur || cur === 'HEAD') throw new Error(mx(l, 'nameInvalid', { x: cur }))
    assertSafeRef(cur, l)
    // Refpec explícito + `--force-with-lease` (nunca `--force` sem proteção):
    // só reescreve o branch atual no upstream atual.
    const args = forceLease
      ? ['push', '--force-with-lease', 'origin', `${cur}:${upBranch}`]
      : ['push', 'origin', `${cur}:${upBranch}`]
    try {
      await runGitCancellable(repo, 'Push', args, l)
    } catch (e) {
      throw friendlySyncError('Push', e, l)
    }
    return { summary: mx(l, 'pushLeaseDone', { x: forceLease ? `${cur} → ${up} (lease)` : cur }) }
  })
)

// ---------------------------------------------------------------------------
// IPC: branches detalhados (upstream + ahead/behind), remotos, blame,
// file-history, rebase interativo, compare e abrir PR.
// ---------------------------------------------------------------------------
ipcMain.handle('treeline:getBranchesDetailed', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../shared/types').BranchDetail[]> => {
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
  })
)

ipcMain.handle('treeline:getRemoteBranches', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../shared/types').RemoteBranchInfo[]> => {
    const raw = await simpleGit(repo).raw(['branch', '-r'])
    return raw.split('\n').flatMap((line) => {
      const name = line.trim()
      if (!name || name.includes('->')) return []
      const slash = name.indexOf('/')
      return [{ name, remote: slash > 0 ? name.slice(0, slash) : 'origin' }]
    })
  })
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
  readOp(async (): Promise<import('../shared/types').BlameLine[]> => {
    const rel = relPathSafe(repo, file, 'en' as UILang)
    if (!rel) return []
    const args = ['blame', '--line-porcelain']
    if (rev?.trim()) {
      assertSafeRef(rev, 'en')
      args.push(rev.trim())
    }
    args.push('--', rel)
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
  })
)

ipcMain.handle('treeline:getFileHistory', (_event, repo: string, file: string, limit?: number) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../shared/types').FileHistoryEntry[]> => {
    const n = Math.min(Math.max(limit ?? 100, 1), 500)
    const raw = await simpleGit(repo).raw([
      'log', '--follow', `--max-count=${n}`, '--date=iso-strict',
      '--pretty=format:%H%x00%an%x00%ad%x00%s%x00%D%x1e', '--', file
    ])
    if (!raw.trim()) return []
    return raw.split('\x1e').flatMap((block) => {
      const parts = block.split('\0')
      if (parts.length < 5) return []
      const [h, author, date, message, dec] = parts as [string, string, string, string, string]
      const hash = (h ?? '').trim()
      if (!hash) return []
      return [{ hash, author: author ?? '', date: date ?? '', message: message?.trim() ?? '', refs: (dec ?? '').trim() }]
    })
  })
)

// Rebase interativo via GIT_SEQUENCE_EDITOR=cp <plano>: o git executa
// `$EDITOR <todo>` via shell, então `cp plano todo` injeta nossa sequência.
// Mutex global: process.env é do processo inteiro, não por repo.
let rebaseInteractiveTail: Promise<unknown> = Promise.resolve()



ipcMain.handle('treeline:getRebasePlan', (_event, repo: string, base: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../shared/types').RebasePlanEntry[]> => {
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
  })
)

ipcMain.handle('treeline:rebaseInteractive', (_event, repo: string, base: string, plan: import('../shared/types').RebasePlanEntry[], lang?: unknown, autostash?: unknown) =>
  enqueueGlobal(async () => enqueue(repo, async () => {
    const l = asLang(lang)
    assertSafeRef(base, l)
    assertRebasePlan(plan, l)
    await backupBundle(repo)
    const { tmpdir } = await import('node:os')
    const { randomBytes } = await import('node:crypto')
    const planFile = join(tmpdir(), `treeline-rebase-${randomBytes(6).toString('hex')}.txt`)
    const msg = (m: string): string => m.replace(/[\n\r]/g, ' ').replace(/[#;|&`$\\]/g, '')
    const body = plan.map((p) => `${p.action} ${p.hash} ${msg(p.message)}`).join('\n') + '\n'
    await fs.writeFile(planFile, body)
    const prev = process.env['GIT_SEQUENCE_EDITOR']
    // O env é global ao processo, MAS o bloco inteiro roda dentro de
    // enqueueGlobal (serializado com outros rebases interativos): o editor é
    // setado e restaurado sem nunca sobrepor outro rebase-i (3.8).
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
  readOp(async (): Promise<import('../shared/types').CompareSummary> => {
    assertSafeRef(a, 'en' as UILang)
    assertSafeRef(b, 'en' as UILang)
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
  })
)

ipcMain.handle('treeline:compareDiff', (_event, repo: string, a: string, b: string, file: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async () => {
    assertSafeRef(a, 'en' as UILang)
    assertSafeRef(b, 'en' as UILang)
    const rel = relPathSafe(repo, file, 'en' as UILang)
    return simpleGit(repo).raw(['diff', '--unified=3', a.trim(), b.trim(), '--', rel ?? ''])
  })
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
      web = http ?? ''
    }
    // Só abre http/https: esquema estranho (ou o próprio scp do git) não vira
    // invocação de protocol handler do SO.
    try {
      if (!web || !/^https?:\/\//i.test(web)) return
      const u = new URL(web)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return
    } catch {
      return
    }
    await shell.openExternal(web)
  })
)

ipcMain.handle('treeline:discard', async (_event, repo: string, file: string, tracked: boolean) => {
  const rel = relPathSafe(repo, file, 'en' as UILang)
  if (!rel) return
  await enqueue(repo, async () => {
    if (tracked) {
      await backupBundle(repo)
      await simpleGit(repo).raw(['checkout', '--', rel])
    } else {
      await shell.trashItem(join(repo, rel))
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

ipcMain.handle('treeline:getTrackedFiles', (_event, repo: string) =>
  readOp(async (): Promise<string[]> => {
    try {
      const out = await simpleGit(repo).raw(['ls-tree', '-r', '--name-only', 'HEAD'])
      return out.split('\n').map((x) => x.trim()).filter(Boolean)
    } catch {
      return []
    }
  })
)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
