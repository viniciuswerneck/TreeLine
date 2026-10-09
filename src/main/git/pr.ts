// Abrir Pull Request no navegador a partir do remote do repo. Só abre
// http/https (esquema estranho não vira protocol handler do SO).

import { ipcMain, shell } from 'electron'
import { simpleGit } from 'simple-git'
import { enqueue } from './runner'

ipcMain.handle('treeline:openPR', (_event, repo: string) =>
  enqueue(repo, async () => {
    const raw = await simpleGit(repo).raw(['remote', '-v'])
    const m = raw.split('\n').map((l) => /^\S+\t(\S+) \(fetch\)$/.exec(l)?.[1]).find(Boolean) ?? ''
    const url = (m ?? '').replace(/\.git$/, '')
    let web = ''
    let gh = /github\.com[:/]([^/]+\/[^/]+)/.exec(url)
    if (gh?.[1]) web = `https://github.com/${gh[1]}/compare`
    const gl = /gitlab[^/]*[:/]([^/]+\/[^/]+)/.exec(url)
    if (!web && gl?.[1]) web = `https://${/gitlab[^/:]*/.exec(url)?.[0] ?? 'gitlab.com'}/${gl[1]}/-/merge_requests`
    const bb = /bitbucket\.org[:/]([^/]+\/[^/]+)/.exec(url)
    if (!web && bb?.[1]) web = `https://bitbucket.org/${bb[1]}/pull-requests`
    if (!web) {
      const http = /https?:\/\/\S+/.exec(url)?.[0]
      web = http ?? ''
    }
    // Só abre http/https: esquema estranho (ou o próprio scp do git) não vira
    // invocação de protocol handler do SO.
    try {
      if (!web || !/^https?:\/\//i.test(web)) return
      const u = new URL(web)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return
    } catch {
      return
    }
    await shell.openExternal(web)
  })
)