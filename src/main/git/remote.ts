// Remotes (listar/adicionar/remover/editar), clone e init. Clone com
// GIT_ASKPASS temporário 0600 para não vazar token em argv; init registra
// o repo nos bookmarks.

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { ipcMain, BrowserWindow, dialog } from 'electron'
import { simpleGit } from 'simple-git'
import { asLang } from '../messages'
import { enqueue, readOp, runGitCancellable, SYNC_TIMEOUT_MS } from './runner'
import { assertCloneUrl } from './validate'
import { friendlySyncError } from './helpers'
import { readBookmarks, writeBookmarks } from '../app/bookmarks'

ipcMain.handle('treeline:getRemotes', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../../shared/types').RemoteInfo[]> => {
    const raw = await simpleGit(repo).raw(['remote', '-v'])
    const seen = new Map<string, string>()
    for (const line of raw.split('\n')) {
      const m = line.match(/^(\S+)\t(\S+) \(fetch\)$/)
      if (m?.[1] && m?.[2] && !seen.has(m[1])) seen.set(m[1], m[2])
    }
    return [...seen].map(([name, url]) => ({ name, url }))
  })
)

ipcMain.handle('treeline:addRemote', (_event, repo: string, name: string, url: string, lang?: unknown) =>
  // Mesma validação do clone: URL `ext::`/`file://`/loopback não entra no
  // config (era executada num fetch/pull posterior).
  enqueue(repo, async () => {
    assertCloneUrl(url, asLang(lang))
    await simpleGit(repo).addRemote(name.trim(), url.trim())
  })
)

ipcMain.handle('treeline:removeRemote', (_event, repo: string, name: string) =>
  enqueue(repo, () => simpleGit(repo).removeRemote(name).then(() => undefined))
)

ipcMain.handle('treeline:editRemote', (_event, repo: string, name: string, url: string, lang?: unknown) =>
  enqueue(repo, async () => {
    assertCloneUrl(url, asLang(lang))
    await simpleGit(repo).raw(['remote', 'set-url', name.trim(), url.trim()])
  })
)

ipcMain.handle('treeline:cloneRepo', async (event, url: string, lang?: unknown) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const opts = { properties: ['openDirectory' as const], title: 'Clone destination' }
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (res.canceled || res.filePaths.length === 0) return null
  const parent = res.filePaths[0] as string
  const l = asLang(lang)
  assertCloneUrl(url, l)
  const rawUrl = url.trim()
  // URL sem credenciais para argv (token não pode vazar na lista de processos
  // nem no `remote.origin.url` do repo): a senha vai por GIT_ASKPASS (arquivo
  // temporário 0600, removido ao fim) e o usuário segue como "oauth2".
  let cloneUrl = rawUrl
  let askPass: string | null = null
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl)) {
    try {
      const u = new URL(rawUrl)
      if (u.password) {
        const pass = decodeURIComponent(u.password)
        const user = u.username ? decodeURIComponent(u.username) : 'oauth2'
        u.password = ''
        u.username = user
        cloneUrl = u.toString()
        const { tmpdir } = await import('node:os')
        const { randomBytes } = await import('node:crypto')
        const script = join(tmpdir(), `tl-askpass-${randomBytes(6).toString('hex')}`)
        await fs.writeFile(script, `#!/bin/sh\nprintf '%s\\n' '${pass.replace(/\\/g, '\\\\').replace(/'/g, `'\\''`)}'\n`, { mode: 0o700 })
        askPass = script
      }
    } catch {
      /* URL malformada: o git dá o erro de autenticação */
    }
  }
  const base = cloneUrl.replace(/\/$/, '').split('/').pop() ?? 'repo'
  const name = base.replace(/\.git$/, '') || 'repo'
  const target = join(parent, name)
  // GIT_ASKPASS vai SÓ no processo do clone (env do filho): não polui o
  // process.env global nem pode vazar para um fetch/pull concorrente.
  try {
    await runGitCancellable(parent, 'Clone', ['clone', cloneUrl, target], l, SYNC_TIMEOUT_MS, askPass ? { GIT_ASKPASS: askPass } : {})
  } catch (e) {
    throw friendlySyncError('Clone', e, l)
  } finally {
    if (askPass) await fs.rm(askPass, { force: true })
  }
  return target
})

ipcMain.handle('treeline:initRepo', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const opts = { properties: ['openDirectory' as const], title: 'Init location' }
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (res.canceled || res.filePaths.length === 0) return null
  const target = res.filePaths[0] as string
  await simpleGit(target).init()
  const list = [target, ...(await readBookmarks()).filter((p) => p !== target)]
  await writeBookmarks(list)
  return target
})