// Revert: commit individual + estado/continue/skip/abort da sequência.

import { join } from 'node:path'
import { ipcMain } from 'electron'
import { simpleGit } from 'simple-git'
import { mx, asLang } from '../messages'
import { enqueue, readOp } from './runner'
import { assertSafeRef } from './validate'
import { exists, gitDirOf, unmergedPaths, conflictErr } from './helpers'
import { runContinue } from './conflict'

ipcMain.handle('treeline:getRevertState', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../../shared/types').OpState> => ({
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