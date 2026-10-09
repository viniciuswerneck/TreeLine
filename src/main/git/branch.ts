// IPC de branches: create/checkout/rename/delete, listas (simples + detalhada),
// branches remotas e upstream. Escritas sempre na fila do repo; leituras fora.

import { ipcMain } from 'electron'
import { simpleGit } from 'simple-git'
import { mx, asLang } from '../messages'
import { enqueue, readOp } from './runner'
import { assertRefName, assertSafeRef } from './validate'
import { backupBundle } from './backup'

ipcMain.handle('treeline:createBranch', (_event, repo: string, name: string, from: string, checkout: boolean, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    const n = name.trim()
    assertRefName(n, l)
    const start = from.trim() || 'HEAD'
    if (checkout) await simpleGit(repo).checkoutBranch(n, start)
    else await simpleGit(repo).branch([n, start])
  })
)

ipcMain.handle('treeline:checkoutBranch', (_event, repo: string, name: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    try {
      await simpleGit(repo).checkout(name)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/local changes|would be overwritten|needs merge|unstaged changes/i.test(msg)) {
        throw new Error(mx(l, 'checkoutDirty', { d: msg.split('\n')[0] as string }))
      }
      throw e instanceof Error ? e : new Error(msg)
    }
  })
)

ipcMain.handle('treeline:checkoutRemote', (_event, repo: string, remoteBranch: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const rb = remoteBranch.trim()
    assertSafeRef(rb, asLang(lang))
    const slash = rb.indexOf('/')
    if (slash < 0) throw new Error(mx(asLang(lang), 'nameInvalid', { x: rb }))
    const local = rb.slice(slash + 1)
    assertRefName(local, asLang(lang))
    try {
      // Cria branch local com tracking; se já existir, só faz checkout dela.
      await simpleGit(repo).raw(['checkout', '--track', rb])
    } catch {
      await simpleGit(repo).checkout(local)
    }
  })
)

ipcMain.handle('treeline:checkoutTag', (_event, repo: string, tag: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    const t = tag.trim()
    assertRefName(t, l)
    // `tags/<n>` sem ambiguidade com branch de mesmo nome; destaca o HEAD.
    try {
      await simpleGit(repo).raw(['checkout', `tags/${t}`])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/local changes|would be overwritten|needs merge|unstaged changes/i.test(msg)) {
        throw new Error(mx(l, 'checkoutDirty', { d: msg.split('\n')[0] as string }))
      }
      throw e instanceof Error ? e : new Error(msg)
    }
  })
)

ipcMain.handle('treeline:renameBranch', (_event, repo: string, oldName: string, newName: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    const n = newName.trim()
    assertRefName(n, l)
    await simpleGit(repo).branch(['-m', oldName, n])
  })
)

ipcMain.handle('treeline:deleteBranch', (_event, repo: string, name: string, force: boolean) =>
  enqueue(repo, async () => {
    await backupBundle(repo)
    await simpleGit(repo).branch([force ? '-D' : '-d', name])
  })
)

ipcMain.handle('treeline:getBranches', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../../shared/types').BranchInfo[]> => {
    const b = await simpleGit(repo).branchLocal()
    return b.all.map((name) => ({ name, current: name === b.current }))
  })
)

ipcMain.handle('treeline:getBranchesDetailed', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../../shared/types').BranchDetail[]> => {
    const raw = await simpleGit(repo).raw(['branch', '-vv'])
    const out: import('../../shared/types').BranchDetail[] = []
    for (const line of raw.split('\n')) {
      const m = /^\*?\s*(\S+)\s+\S+(?:\s+\[([^\]]+)\])?/.exec(line)
      const name = m?.[1]
      if (!name || name === '(HEAD') continue
      const bracket = m?.[2] ?? ''
      const up = bracket.split(':')[0]?.trim() ?? ''
      const ahead = /ahead (\d+)/.exec(bracket)?.[1]
      const behind = /behind (\d+)/.exec(bracket)?.[1]
      out.push({
        name,
        current: line.startsWith('*'),
        upstream: up && !/^(gone|ahead|behind)/.test(up) ? up : null,
        ahead: ahead ? Number.parseInt(ahead, 10) : 0,
        behind: behind ? Number.parseInt(behind, 10) : 0
      })
    }
    return out
  })
)

ipcMain.handle('treeline:getRemoteBranches', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../../shared/types').RemoteBranchInfo[]> => {
    const raw = await simpleGit(repo).raw(['branch', '-r'])
    return raw.split('\n').flatMap((line) => {
      const name = line.trim()
      if (!name || name.includes('->')) return []
      const slash = name.indexOf('/')
      return [{ name, remote: slash > 0 ? name.slice(0, slash) : 'origin' }]
    })
  })
)

ipcMain.handle('treeline:setUpstream', (_event, repo: string, branch: string, upstream: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    if (!upstream.trim()) throw new Error(mx(l, 'noUpstream', { b: branch }))
    await simpleGit(repo).raw(['branch', `--set-upstream-to=${upstream.trim()}`, branch.trim()])
  })
)