// Cherry-pick: estado, pick, continue, skip, abort.

import { join } from 'node:path'
import { ipcMain } from 'electron'
import { simpleGit } from 'simple-git'
import { mx, asLang } from '../messages'
import { enqueue, readOp } from './runner'
import { assertSafeRef } from './validate'
import { exists, gitDirOf, unmergedPaths, conflictErr } from './helpers'
import { runContinue } from './conflict'

ipcMain.handle('treeline:getCherryPickState', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../../shared/types').OpState> => ({
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