// Integração do motor: history/blame/compare, busca de código, worktree,
// submódulo e LFS.
import { describe, expect, it, afterEach } from 'vitest'
import { simpleGit } from 'simple-git'
import { join } from 'node:path'
import { handler, mkRepo, commitFile, write, call, cleanup } from './engine-helpers'

const repos: string[] = []
const keep = (r: string): string => {
  repos.push(r)
  return r
}

afterEach(() => {
  cleanup(...repos.splice(0))
})

describe('motor: history e blame', () => {
  it('getLog/getCommitDetail/getCommitDiff/compare/blame/file-history', async () => {
    const repo = keep(await mkRepo())
    const c1 = await commitFile(repo, 'a.txt', 'a\nb\n', 'first')
    const c2 = await commitFile(repo, 'a.txt', 'a\nb\nc\n', 'second')

    const log = await call<{ hash: string; refs: string[]; message: string }[]>('treeline:getLog', repo, 10, 0)
    expect(log.length).toBeGreaterThanOrEqual(2)
    expect(log[0]?.message).toBe('second')
    expect(log[0]?.hash).toBe(c2)
    expect(log[0]?.refs).toContain('HEAD')

    const detail = await call<{ hash: string; parents: string[]; files: string[]; stats: unknown[] }>('treeline:getCommitDetail', repo, c2)
    expect(detail.parents).toContain(c1)
    expect(detail.files).toContain('a.txt')
    expect(detail.stats.length).toBeGreaterThan(0)

    const cd = await call<string>('treeline:getCommitDiff', repo, c2, 'a.txt')
    expect(cd).toContain('+c')

    const cmp = await call<{ files: string[]; stats: unknown[] }>('treeline:compareCommits', repo, c1, c2)
    expect(cmp.files).toContain('a.txt')

    const cmpDiff = await call<string>('treeline:compareDiff', repo, c1, c2, 'a.txt')
    expect(cmpDiff).toContain('+c')

    const blame = await call<{ line: number; content: string }[]>('treeline:getBlame', repo, 'a.txt')
    expect(blame.at(-1)?.content).toBe('c')

    const fh = await call<{ hash: string; message: string }[]>('treeline:getFileHistory', repo, 'a.txt')
    expect(fh.map((e) => e.message)).toEqual(['second', 'first'])
  })

  it('getCommitDetail com hash inexistente falha', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'x\n', 'base')
    await expect(call('treeline:getCommitDetail', repo, '0'.repeat(40))).rejects.toThrow()
  })
})

describe('motor: busca de código', () => {
  it('searchCode encontra cachorro no worktree e no history; cancelSearch é idempotente', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'mod.rs', 'let cat = 1;\n', 'add cat')

    const sender = { isDestroyed: () => false, send: () => undefined }
    const search = handler('treeline:searchCode')
    const stats = await search(
      { sender },
      repo,
      'cat',
      { regex: false, caseSensitive: false, remotes: false },
      1
    ) as { totalHits: number; branches: number; error: string | null }
    expect(stats.error).toBeNull()
    expect(stats.totalHits).toBeGreaterThanOrEqual(1)
    expect(stats.branches).toBeGreaterThanOrEqual(1)

    // Regex inválida reporta erro (não derruba) e cancel de token inativo é no-op.
    const bad = await search({ sender }, repo, '([', { regex: true }, 2) as { error: string | null }
    await call('treeline:cancelSearch', 999_999)
    await call('treeline:cancelSearch', 1)
    expect(typeof bad.error).toBe('string')
  })
})

describe('motor: worktree linkada', () => {
  it('detecta .git arquivo e toplevel do repo', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'v\n', 'base')
    const info = await call<{ linked: boolean; toplevel: string }>('treeline:getWorktreeInfo', repo)
    expect(info.linked).toBe(false)
    expect(info.toplevel).toBe(repo)

    const wt = join(repo, '..', `tl-wt-${Date.now()}`)
    repos.push(wt)
    await simpleGit(repo).raw(['worktree', 'add', wt, '-b', 'wt'])
    const wtInfo = await call<{ linked: boolean; toplevel: string }>('treeline:getWorktreeInfo', wt)
    expect(wtInfo.linked).toBe(true)
    expect(wtInfo.toplevel).toBe(wt)
    await simpleGit(repo).raw(['worktree', 'remove', wt, '--force']).catch(() => undefined)
  })
})

describe('motor: submódulo e LFS', () => {
  it('getSubmodules lista e updateSubmodules init', async () => {
    const outer = keep(await mkRepo())
    const inner = keep(await mkRepo())
    await commitFile(inner, 'lib.txt', 'conteudo\n', 'inner base')

    const git = simpleGit(outer)
    // Politica do git atual bloqueia transporte file: para clonar submódulo
    // de caminho local — a mesma proteção que o app mantém via assertCloneUrl.
    await git.addConfig('protocol.file.allow', 'always')
    await git.raw(['submodule', 'add', inner, 'sub'])
    await git.commit('add submodule')
    const subs = await call<{ path: string; state: string }[]>('treeline:getSubmodules', outer)
    expect(subs.map((s) => s.path)).toContain('sub')

    await call('treeline:updateSubmodules', outer)
    expect(await call('treeline:getTrackedFiles', outer)).toContain('sub')
  })

  it('LFS sem binário: detecta ausência e falha com erro amigável', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'v\n', 'base')
    const info = await call<{ installed: boolean; tracked: boolean }>('treeline:getLfsInfo', repo)
    expect(info.installed).toBe(false)
    expect(info.tracked).toBe(false)
    await expect(call('treeline:lfsTrack', repo, '*.bin')).rejects.toThrow()
    await expect(call('treeline:lfsUntrack', repo, '*.bin')).rejects.toThrow()
    await expect(call('treeline:lfsPull', repo)).rejects.toThrow()
    await expect(call('treeline:lfsPush', repo)).rejects.toThrow()
  })
})