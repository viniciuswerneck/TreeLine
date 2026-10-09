// Tags: listar ordenadas por data, criar (anotada ou leve), push da tag para
// origin e apagar (local + remoto). Push usa a mesma linha de cancelamento.

import { ipcMain } from 'electron'
import { simpleGit } from 'simple-git'
import { mx, asLang } from '../messages'
import { enqueue, readOp, runGitCancellable } from './runner'
import { assertRefName, assertSafeRef } from './validate'
import { friendlySyncError } from './helpers'

ipcMain.handle('treeline:getTags', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../../shared/types').TagInfo[]> => {
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
  enqueue(repo, async (): Promise<import('../../shared/types').SyncResult> => {
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