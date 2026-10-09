// Stash: listar, criar, aplicar, pop e descartar. Leitura fora da fila;
// escrita serializada; descarte de stash grava bundle antes (destrutivo).

import { ipcMain } from 'electron'
import { simpleGit } from 'simple-git'
import { asLang } from '../messages'
import { enqueue, readOp } from './runner'
import { conflictErr } from './helpers'
import { backupBundle } from './backup'

function parseStashList(raw: string): import('../../shared/types').StashInfo[] {
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