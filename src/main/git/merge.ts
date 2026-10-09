// Operações de merge: preview, merge, continue e abort, além do abort de
// stash conflitante (não existe `stash --abort`; usa `reset --merge`).

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import { simpleGit } from 'simple-git'
import { mx, asLang } from '../messages'
import { enqueue, readOp } from './runner'
import { assertSafeRef } from './validate'
import { exists, gitDirOf, unmergedPaths, conflictErr } from './helpers'
import { runContinue } from './conflict'
import { backupBundle } from './backup'

ipcMain.handle('treeline:getMergeState', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../../shared/types').OpState> => {
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
  readOp(async (): Promise<import('../../shared/types').MergePreview> => {
    const git = simpleGit(repo)
    const [filesRaw, countRaw] = await Promise.all([
      git.raw(['diff', '--name-only', '-z', `HEAD...${ref}`]),
      git.raw(['rev-list', '--count', `HEAD..${ref}`])
    ])
    const files = filesRaw
      .split('\0')
      .map((f) => f.trim())
      .filter(Boolean)
    return { files, commits: Number.parseInt(countRaw.trim(), 10) || 0 }
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