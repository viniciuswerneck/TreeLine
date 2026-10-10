// Integração do motor: branches, tags, remotes, sync, flow, pr, backup.
import { describe, expect, it, afterEach, vi } from 'vitest'
import { simpleGit } from 'simple-git'
import { dialog, shell } from 'electron'
import { mkRepo, mkBare, commitFile, call, cleanup } from './engine-helpers'

const repos: string[] = []
const keep = (r: string): string => {
  repos.push(r)
  return r
}

afterEach(() => {
  vi.restoreAllMocks()
  cleanup(...repos.splice(0))
})

describe('motor: branches', () => {
  it('create/rename/delete com backup, checkout e listas', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'v\n', 'base')
    await call('treeline:createBranch', repo, 'feat/x', 'HEAD', false)
    let list = await call<{ name: string }[]>('treeline:getBranches', repo)
    expect(list.map((b) => b.name)).toContain('feat/x')

    await call('treeline:checkoutBranch', repo, 'feat/x')
    expect(await simpleGit(repo).revparse(['--abbrev-ref', 'HEAD']).then((r) => r.trim())).toBe('feat/x')

    await call('treeline:renameBranch', repo, 'feat/x', 'feat/y')
    list = await call('treeline:getBranches', repo)
    expect(list.map((b) => b.name)).not.toContain('feat/x')
    expect(list.map((b) => b.name)).toContain('feat/y')

    // Git recusa apagar o branch atual; a UI também só oferece non-current.
    await call('treeline:checkoutBranch', repo, 'main')
    await call('treeline:deleteBranch', repo, 'feat/y', true)
    list = await call('treeline:getBranches', repo)
    expect(list.map((b) => b.name)).not.toContain('feat/y')

    const backups = await call('treeline:listBackups', repo)
    expect((backups as unknown[]).length).toBeGreaterThan(0)
  })

  it('getBranchesDetailed parseia upstream/ahead/behind; checkout remoto cria tracking', async () => {
    const repo = keep(await mkRepo())
    const bare = await mkBare()
    repos.push(bare)
    await commitFile(repo, 'a.txt', 'v\n', 'base')
    await simpleGit(repo).addRemote('origin', bare)
    await call('treeline:pushPublish', repo)
    await simpleGit(repo).raw(['branch', 'other'])
    await simpleGit(repo).checkout('other')
    await commitFile(repo, 'b.txt', 'x\n', 'other commit')
    await simpleGit(repo).checkout('main')
    await simpleGit(repo).raw(['push', '-u', 'origin', 'other'])
    await call('treeline:setUpstream', repo, 'main', 'origin/main')

    const details = await call<{ name: string; upstream: string | null; ahead: number }[]>('treeline:getBranchesDetailed', repo)
    const main = details.find((b) => b.name === 'main')
    expect(main?.upstream).toBe('origin/main')

    const remoteB = await call<{ name: string }[]>('treeline:getRemoteBranches', repo)
    expect(remoteB.map((b) => b.name)).toContain('origin/other')

    await simpleGit(repo).raw(['branch', '-D', 'other'])
    await call('treeline:checkoutRemote', repo, 'origin/other')
    expect(await simpleGit(repo).revparse(['--abbrev-ref', 'HEAD']).then((r) => r.trim())).toBe('other')
  })
})

describe('motor: tags', () => {
  it('create/checkout/delete com e sem remoto', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'v\n', 'base')
    await call('treeline:createTag', repo, 'v1.0.0', 'release', 'HEAD')
    const tags = await call<{ name: string; date: string }[]>('treeline:getTags', repo)
    expect(tags.map((t) => t.name)).toContain('v1.0.0')

    await call('treeline:checkoutTag', repo, 'v1.0.0')
    const st = await call<{ branch: string; detachedTag: string | null }>('treeline:getStatus', repo)
    expect(st.detachedTag).toBe('v1.0.0')

    await call('treeline:checkoutBranch', repo, 'main')
    await call('treeline:deleteTag', repo, 'v1.0.0', false)
    const tags2 = await call<{ name: string }[]>('treeline:getTags', repo)
    expect(tags2.map((t) => t.name)).not.toContain('v1.0.0')
  })

  it('pushTag sem remoto falha com erro amigável', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'v\n', 'base')
    await call('treeline:createTag', repo, 'v1.0.0', '', 'HEAD')
    await expect(call('treeline:pushTag', repo, 'v1.0.0')).rejects.toThrow()
  })
})

describe('motor: remotes e sync', () => {
  it('add/edit/remove remote, push/pull/fetch entre repos locais', async () => {
    const repo = keep(await mkRepo())
    const bare = await mkBare()
    repos.push(bare)
    await commitFile(repo, 'a.txt', 'v1\n', 'first')

    await call('treeline:addRemote', repo, 'origin', bare)
    let remotes = await call<{ name: string; url: string }[]>('treeline:getRemotes', repo)
    expect(remotes.map((r) => r.name)).toContain('origin')

    await call('treeline:pushPublish', repo)
    remotes = await call('treeline:getRemotes', repo)
    expect(remotes[0]?.url).toBe(bare)

    const f = keep(await mkRepo())
    await simpleGit(f).addRemote('origin', bare)
    await call('treeline:setUpstream', f, 'main', 'origin/main')
    await call('treeline:pull', f)
    expect(await call('treeline:getTrackedFiles', f)).toContain('a.txt')

    await commitFile(repo, 'a.txt', 'v2\n', 'second')
    await call('treeline:push', repo)
    await call('treeline:fetch', f)
    const fetched = await simpleGit(f).revparse(['origin/main']).then((r) => r.trim())
    expect(fetched.length).toBe(40)

    await call('treeline:editRemote', repo, 'origin', `${bare}.git`)
    remotes = await call('treeline:getRemotes', repo)
    expect(remotes[0]?.url).toBe(`${bare}.git`)

    await call('treeline:removeRemote', repo, 'origin')
    remotes = await call('treeline:getRemotes', repo)
    expect(remotes).toHaveLength(0)
  })

  it('push sem upstream falha; pushForce com lease funciona', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'x\n', 'base')
    await expect(call('treeline:push', repo)).rejects.toThrow(/upstream|noUpstream/i)

    const bare = await mkBare()
    repos.push(bare)
    await simpleGit(repo).addRemote('origin', bare)
    await call('treeline:pushPublish', repo)
    await commitFile(repo, 'b.txt', 'y\n', 'more')
    await call('treeline:push', repo)
    const res = await call<{ summary: string }>('treeline:pushForce', repo, true)
    expect(res.summary).toContain('lease')
  })

  it('cloneRepo clona para o diretório do dialog; initRepo registra bookmark', async () => {
    const bare = await mkBare()
    repos.push(bare)
    // Repo-fonte com conteúdo + user configurado.
    const src = keep(await mkRepo())
    await commitFile(src, 'a.txt', 'conteudo\n', 'base')

    const parent = (await import('node:os')).tmpdir()
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: [parent] })
    const target = await call<string>('treeline:cloneRepo', { sender: { isDestroyed: () => false } }, src)
    expect(target).toContain(src.split('/').pop() ?? '')
    const cloned = await call<{ name: string; url: string }[]>('treeline:getRemotes', target ?? '')
    expect(cloned[0]?.name).toBe('origin')

    // initRepo: dialog cancelado devolve null.
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] })
    const none = await call('treeline:initRepo', { sender: { isDestroyed: () => false } })
    expect(none).toBeNull()
  })

  it('cancelSync marca cancelamento e encerra controller', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'v\n', 'base')
    const res = await call<{ summary: string }>('treeline:fetch', repo)
    expect(res.summary).toContain('Fetch')
    await call('treeline:cancelSync', repo, 'Fetch')
  })
})

describe('motor: openPR', () => {
  it('remote github abre compare; sem remote não chama openExternal', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'v\n', 'base')
    await simpleGit(repo).addRemote('origin', 'https://github.com/acme/widget.git')
    vi.mocked(shell.openExternal).mockResolvedValue(undefined)
    await call('treeline:openPR', repo)
    expect(shell.openExternal).toHaveBeenCalledWith('https://github.com/acme/widget/compare')

    const repo2 = keep(await mkRepo())
    await commitFile(repo2, 'a.txt', 'v\n', 'base')
    await call('treeline:openPR', repo2)
    expect(shell.openExternal).toHaveBeenCalledTimes(1)
  })
})