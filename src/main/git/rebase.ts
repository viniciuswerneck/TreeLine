// Rebase: estado, onto, continue, skip, abort + interativo (GIT_SEQUENCE_EDITOR
// via plan file). Interativo roda em `enqueueGlobal` — mutex do env do processo.

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import { simpleGit } from 'simple-git'
import { mx, asLang, type UILang } from '../messages'
import { enqueue, enqueueGlobal, readOp } from './runner'
import { assertSafeRef } from './validate'
import { exists, gitDirOf, unmergedPaths, conflictErr } from './helpers'
import { runContinue } from './conflict'
import { backupBundle } from './backup'

/** Só os verbos que a UI gera: nada de `x/exec` (executa shell) nem `merge` cru. */
const REBASE_PLAN_ACTIONS = new Set(['pick', 'p', 'reword', 'r', 'edit', 'e', 'squash', 's', 'fixup', 'f', 'drop', 'd'])

function assertRebasePlan(plan: import('../../shared/types').RebasePlanEntry[], lang: UILang): void {
  for (const p of plan ?? []) {
    if (!p || !REBASE_PLAN_ACTIONS.has(p.action)) {
      throw new Error(mx(lang, 'unsafeRef', { x: 'rebase action' }))
    }
    if (!p.hash || !/^[0-9a-fA-F]{7,40}$/.test(p.hash)) {
      throw new Error(mx(lang, 'unsafeRef', { x: (p?.hash ?? '').slice(0, 40) }))
    }
  }
}

ipcMain.handle('treeline:getRebaseState', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../../shared/types').OpState> => {
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
    // Rebase reescreve histórico: bundle antes (mesma política do reset hard).
    await backupBundle(repo)
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

ipcMain.handle('treeline:getRebasePlan', (_event, repo: string, base: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../../shared/types').RebasePlanEntry[]> => {
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

// Rebase interativo via GIT_SEQUENCE_EDITOR=cp <plano>: o git executa
// `$EDITOR <todo>` via shell, então `cp plano todo` injeta nossa sequência.
// Mutex global (env do processo, não por repo): `enqueueGlobal` roda numa
// fila DEDICADA (`envQueue` em git/runner.ts). Antes ele aninhava `enqueue`
// na mesma fila do gitQueue e o rebase-i travava o app inteiro para sempre.
ipcMain.handle('treeline:rebaseInteractive', (_event, repo: string, base: string, plan: import('../../shared/types').RebasePlanEntry[], lang?: unknown, autostash?: unknown) =>
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