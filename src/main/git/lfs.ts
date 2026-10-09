// Git LFS: detecção (.gitattributes filter=lfs), contagem de arquivos
// rastreados e pull/push/track/untrack.

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import { simpleGit } from 'simple-git'
import { mx, asLang } from '../messages'
import { enqueue, readOp, runGitCancellable } from './runner'
import { friendlySyncError } from './helpers'

ipcMain.handle('treeline:getLfsInfo', (_event, repo: string) =>
  // READ: fora da fila de escrita.
  readOp(async (): Promise<import('../../shared/types').LfsInfo> => {
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
  enqueue(repo, async (): Promise<import('../../shared/types').SyncResult> => {
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
  enqueue(repo, async (): Promise<import('../../shared/types').SyncResult> => {
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
    try {
      await simpleGit(repo).raw(['lfs', 'track', pattern])
    } catch (e) {
      throw friendlySyncError('LFS Track', e, asLang(lang))
    }
  })
)

ipcMain.handle('treeline:lfsUntrack', (_event, repo: string, pattern: string, lang?: unknown) =>
  enqueue(repo, async () => {
    try {
      await simpleGit(repo).raw(['lfs', 'untrack', pattern])
    } catch (e) {
      throw friendlySyncError('LFS Untrack', e, asLang(lang))
    }
  })
)