// Identidade do autor (global e por repo) + credential.helper.

import { ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import { mx, asLang } from '../messages'
import { readOp } from '../git/runner'

async function getGlobal(key: string): Promise<string> {
  try {
    const v = await simpleGit().raw(['config', '--global', '--get', key])
    return v.trim()
  } catch {
    return ''
  }
}

async function repoConfig(repo: string, key: string): Promise<string> {
  try {
    return (await simpleGit(repo).raw(['config', '--local', key])).trim()
  } catch {
    return ''
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

ipcMain.handle('treeline:getIdentity', async (): Promise<import('../../shared/types').GitIdentity> => {
  const [name, email] = await Promise.all([getGlobal('user.name'), getGlobal('user.email')])
  return { name, email }
})

ipcMain.handle('treeline:setIdentity', async (_event, id: import('../../shared/types').GitIdentity, lang?: unknown): Promise<void> => {
  const l = asLang(lang)
  const name = id.name.trim()
  const email = id.email.trim()
  if (!name) throw new Error(mx(l, 'nameEmpty'))
  if (!EMAIL_RE.test(email)) throw new Error(mx(l, 'emailInvalid'))
  await simpleGit().raw(['config', '--global', 'user.name', name])
  await simpleGit().raw(['config', '--global', 'user.email', email])
})

ipcMain.handle('treeline:getEffectiveIdentity', (_event, repo: string) =>
  readOp(async (): Promise<import('../../shared/types').EffectiveIdentity> => {
    const [globalName, globalEmail, localName, localEmail] = await Promise.all([
      getGlobal('user.name'),
      getGlobal('user.email'),
      repoConfig(repo, 'user.name'),
      repoConfig(repo, 'user.email')
    ])
    const name = localName || globalName
    const email = localEmail || globalEmail
    return {
      name,
      email,
      scope: localName || localEmail ? 'local' : name || email ? 'global' : 'none',
      globalName,
      globalEmail
    }
  })
)

ipcMain.handle('treeline:setRepoIdentity', async (_event, repo: string, id: import('../../shared/types').GitIdentity, lang?: unknown): Promise<void> => {
  const l = asLang(lang)
  const name = id.name.trim()
  const email = id.email.trim()
  if (!name) throw new Error(mx(l, 'nameEmpty'))
  if (!EMAIL_RE.test(email)) throw new Error(mx(l, 'emailInvalid'))
  await simpleGit(repo).raw(['config', 'user.name', name])
  await simpleGit(repo).raw(['config', 'user.email', email])
})

// credential.helper: reusa o keyring do sistema (libsecret) ou o cache em
// memória do git. Nunca oferece `store` (grava senha em texto puro). Token/
// senha nunca passam por aqui — só o NOME do helper entra na config.
ipcMain.handle('treeline:getCredentialHelper', () =>
  readOp(async (): Promise<import('../../shared/types').CredentialHelperInfo> => {
    const readScope = async (scope: string): Promise<string[]> => {
      try {
        const out = await simpleGit().raw(['config', scope, '--get-all', 'credential.helper'])
        return out
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
      } catch {
        return []
      }
    }
    const [globalH, systemH] = await Promise.all([readScope('--global'), readScope('--system')])
    let libsecretAvailable = false
    try {
      const execPath = (await simpleGit().raw(['--exec-path'])).trim()
      await fs.access(join(execPath, 'git-credential-libsecret'))
      libsecretAvailable = true
    } catch {
      libsecretAvailable = false
    }
    return { current: [...globalH, ...systemH], libsecretAvailable }
  })
)

ipcMain.handle('treeline:setCredentialHelper', async (_event, helper: unknown, lang?: unknown) => {
  const l = asLang(lang)
  const h = typeof helper === 'string' ? helper : ''
  if (h !== '' && h !== 'libsecret' && h !== 'cache') throw new Error(mx(l, 'credHelperInvalid'))
  // Substitui TODOS os helpers anteriores (um `--add` empilharia store+libsecret).
  try {
    await simpleGit().raw(['config', '--global', '--unset-all', 'credential.helper'])
  } catch {
    /* não havia nada para remover */
  }
  if (h) await simpleGit().raw(['config', '--global', '--add', 'credential.helper', h])
})