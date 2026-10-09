// Info de worktree: se o repo é uma worktree linkada e o toplevel do repo.

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import { simpleGit } from 'simple-git'
import { readOp } from './runner'

ipcMain.handle('treeline:getWorktreeInfo', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../../shared/types').WorktreeInfo> => {
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