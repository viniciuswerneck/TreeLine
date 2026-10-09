// Resolvedor de conflito de 3 vias + estado de operação contínua (continue).
// `runContinue` mora aqui porque depende de `conflictLabels` (rótulos dos
// lados); os domínios merge/rebase/pick/revert importam dele sem ciclo.

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import { simpleGit } from 'simple-git'
import { mx, asLang, type UILang } from '../messages'
import { enqueue, readOp } from './runner'
import { relPathSafe } from './validate'
import { exists, gitDirOf, unmergedPaths, conflictErr } from './helpers'
import { backupBundle } from './backup'
import {
  isGitlink,
  looksBinary,
  parseLsFilesU,
  parseUnmergedXY,
  stagesByPath,
  conflictKindOf,
  shortRef
} from '../conflict-stages'
import type { ConflictFile, ConflictOp, ConflictSide, ConflictStages } from '../../shared/types'

/**
 * `simple-git` só transforma em erro quando o git escreve no STDERR.
 * `git commit --no-edit` / `--continue` recusados por "nada a commitar"
 * escrevem em STDOUT e saem com 1 — o promise RESOLVE e a UI reporta
 * sucesso enquanto a operação continua parada (revert vazio, merge vazio,
 * cherry-pick vazio). Confiamos no resultado: se a operação segue viva,
 * o comando não terminou o trabalho.
 */
export async function runContinue(repo: string, args: string[], l: UILang, conflictKey: string): Promise<void> {
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

/**
 * Operação interrompida e rótulos dos dois lados, para a UI dizer
 * "ours: main" / "theirs: develop" em vez de "ours/theirs" genéricos.
 */
export async function conflictLabels(repo: string): Promise<{ op: ConflictOp; ours: string; theirs: string }> {
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

/** ours + theirs com \n garantido entre os dois (union sem "No newline" no meio). */
function joinSides(a: string, b: string): string {
  return (a.endsWith('\n') || a === '' ? a : `${a}\n`) + (b.endsWith('\n') || b === '' ? b : `${b}\n`)
}

/**
 * Resolve o arquivo inteiro por um lado. É destrutivo, então grava bundle
 * antes (mesma política de reset hard/rebase).
 */
async function resolveSideRaw(repo: string, file: string, side: ConflictSide, l: UILang): Promise<void> {
  const rel = relPathSafe(repo, file, l)
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

ipcMain.handle('treeline:getConflictFiles', (_event, repo: string) =>
  // READ: fora da fila de escrita (o overlay abre enquanto outra op termina).
  readOp(async (): Promise<ConflictFile[]> => {
    const git = simpleGit(repo)
    const { ours: oursLabel, theirs: theirsLabel } = await conflictLabels(repo)
    const entries = parseLsFilesU(await git.raw(['ls-files', '-u', '-z']))
    const stages = stagesByPath(entries)
    const out: ConflictFile[] = []
    for (const { xy, path } of parseUnmergedXY(await git.raw(['status', '--porcelain=v2', '-z']))) {
      const st = stages.get(path) ?? []
      // Submódulo: o estágio aponta para um COMMIT (gitlink), não texto.
      const submodule = entries.some((e) => e.path === path && isGitlink(e.mode))
      // Só rotula como binário depois de olhar o blob; aqui é pré-checagem
      // barata (os 3 estágios presentes sem marcador).
      out.push({
        path,
        xy,
        kind: submodule ? 'submodule' : conflictKindOf(xy, st),
        oursLabel,
        theirsLabel,
        stages: st,
        binary: submodule
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

    const submodule = entries.some((e) => isGitlink(e.mode))
    const readBlob = async (stage: number): Promise<{ text: string; binary: boolean } | null> => {
      const e = byStage.get(stage)
      if (!e) return null
      // Gitlink: o sha é um commit do submódulo — `cat-file blob` falharia.
      if (isGitlink(e.mode)) return { text: '', binary: true }
      try {
        const raw = await git.raw(['cat-file', 'blob', e.sha])
        return { text: raw, binary: looksBinary(Buffer.from(raw, 'utf8')) }
      } catch {
        // Objeto ausente/corrompido não pode derrubar o resolvedor inteiro.
        return { text: '', binary: true }
      }
    }
    const s2 = await readBlob(2)
    const s3 = await readBlob(3)
    const s1 = await readBlob(1)

    // Binário/submódulo: a UI mostra "resolver por lado" e não tenta merge.
    if (submodule || s2?.binary || s3?.binary) {
      return {
        path: file,
        kind: submodule ? 'submodule' : 'binary',
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

ipcMain.handle('treeline:resolveOurs', (_event, repo: string, file: string, lang?: unknown) =>
  enqueue(repo, () => resolveSideRaw(repo, file, 'ours', asLang(lang)))
)

ipcMain.handle('treeline:resolveTheirs', (_event, repo: string, file: string, lang?: unknown) =>
  enqueue(repo, () => resolveSideRaw(repo, file, 'theirs', asLang(lang)))
)

ipcMain.handle('treeline:resolveConflictSide', (_event, repo: string, file: string, side: ConflictSide, lang?: unknown) =>
  enqueue(repo, () => resolveSideRaw(repo, file, side, asLang(lang)))
)

ipcMain.handle('treeline:applyConflictResult', (_event, repo: string, file: string, content: string, del: boolean, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    const rel = relPathSafe(repo, file, l)
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