// Reflog (histórico de HEAD para undo) + reset --hard via reflog. O reset é
// destrutivo: bundle antes (política de reset hard).

import { ipcMain } from 'electron'
import { simpleGit } from 'simple-git'
import { enqueue, readOp } from './runner'
import { assertSafeRef } from './validate'
import { backupBundle } from './backup'

function parseReflog(raw: string): import('../../shared/types').ReflogEntry[] {
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