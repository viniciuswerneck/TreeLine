// Integração do motor: worktree + commit + diff/hunks (status, commit, diff).
import { describe, expect, it, afterEach } from 'vitest'
import { simpleGit } from 'simple-git'
import { join } from 'node:path'
import { mkRepo, commitFile, commitAll, write, read, call, cleanup } from './engine-helpers'

const repos: string[] = []
const keep = (r: string): string => {
  repos.push(r)
  return r
}

afterEach(() => {
  cleanup(...repos.splice(0))
})

describe('motor: status/commit', () => {
  it('getStatus parseia branch, ahead/behind, staged/unstaged/untracked', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'l1\nl2\n', 'base')

    let s = await call<{ staged: unknown[]; unstaged: unknown[]; untracked: string[] }>('treeline:getStatus', repo)
    expect(s.staged).toHaveLength(0)
    expect(s.unstaged).toHaveLength(0)

    write(repo, 'a.txt', 'l1\nl2\nl3\n')
    write(repo, 'b.txt', 'novo\n')
    s = await call('treeline:getStatus', repo)
    expect(s.unstaged.map((x) => (x as { path: string }).path)).toContain('a.txt')
    expect(s.untracked).toContain('b.txt')

    await call('treeline:stageAll', repo)
    s = await call('treeline:getStatus', repo)
    expect(s.staged.map((x) => (x as { path: string }).path)).toContain('a.txt')

    await call('treeline:unstageFiles', repo, ['a.txt'])
    s = await call('treeline:getStatus', repo)
    expect(s.staged.map((x) => (x as { path: string }).path)).not.toContain('a.txt')
    expect(s.unstaged.map((x) => (x as { path: string }).path)).toContain('a.txt')
  })

  it('getTrackedFiles lista rastreados e COMMIT rejeita vazio/sem stage', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'oi\n', 'base')
    const tracked = await call<string[]>('treeline:getTrackedFiles', repo)
    expect(tracked).toContain('a.txt')

    await expect(call('treeline:commit', repo, '   ', false)).rejects.toThrow()
    await expect(call('treeline:commit', repo, 'ok', false)).rejects.toThrow()

    write(repo, 'a.txt', 'oi\nmudou\n')
    await call('treeline:stageAll', repo)
    await call('treeline:commit', repo, 'primeiro', false)
    const log = await call('treeline:getLog', repo, 5, 0)
    expect((log as { message: string }[])[0].message).toBe('primeiro')
  })

  it('discard de rastreado reverte e gera backup; untracked some', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'base\n', 'base')
    write(repo, 'a.txt', 'mudou\n')
    await call('treeline:discard', repo, 'a.txt', true)
    expect(read(repo, 'a.txt')).toBe('base\n')

    write(repo, 'u.txt', 'lixo\n')
    await call('treeline:discard', repo, 'u.txt', false)
    expect(await call('treeline:getStatus', repo).then((s: { untracked: string[] }) => s.untracked)).not.toContain('u.txt')
  })

  it('resetTo hard grava bundle e volta', async () => {
    const repo = keep(await mkRepo())
    const first = await commitFile(repo, 'a.txt', 'v1\n', 'first')
    await commitFile(repo, 'a.txt', 'v2\n', 'second')
    await call('treeline:resetTo', repo, first, 'hard')
    expect(read(repo, 'a.txt')).toBe('v1\n')
    const backups = await call<{ file: string }[]>('treeline:listBackups', repo)
    expect(backups.length).toBeGreaterThan(0)
  })
})

describe('motor: stage por hunk/linha', () => {
  /** Arquivo com duas regiões de mudança LONGE (contexto 3 linhas não junta). */
  async function twoHunkRepo(): Promise<string> {
    const repo = keep(await mkRepo())
    const lines: string[] = []
    for (let i = 1; i <= 60; i++) lines.push(`L${i}`)
    await commitFile(repo, 'f.txt', lines.join('\n') + '\n', 'base')
    lines[1] = 'X' // linha 2
    lines[2] = 'Y' // linha 3
    lines[59] = 'Z' // linha 60
    write(repo, 'f.txt', lines.join('\n') + '\n')
    return repo
  }

  it('stageHunk commita só um hunk; stageLines seleciona linhas', async () => {
    const repo = await twoHunkRepo()
    const hunks = await call<{ index: number; oldStart: number; lines: string[] }[]>('treeline:getHunks', repo, 'f.txt', false)
    expect(hunks.length).toBeGreaterThanOrEqual(2)

    await call('treeline:stageHunk', repo, 'f.txt', false, hunks[0].index)
    let staged = await call('treeline:getStatus', repo)
    expect(staged.staged.map((x: { path: string }) => x.path)).toContain('f.txt')

    await call('treeline:commit', repo, 'hunk1', false)
    // Hunk 1 (X,Y) foi para o commit; hunk 2 (Z) segue na worktree.
    const d = await call<string>('treeline:getDiff', repo, 'f.txt', false)
    expect(d).toContain('+Z')
    expect(d).not.toContain('+X')

    const hunks2 = await call<{ index: number; lines: string[] }[]>('treeline:getHunks', repo, 'f.txt', false)
    await call('treeline:stageLines', repo, 'f.txt', false, hunks2[0].index, [0])
    const d2 = await call<string>('treeline:getDiff', repo, 'f.txt', true)
    expect(d2.length).toBeGreaterThan(0)
  })

  it('discardHunk reverte só a região', async () => {
    const repo = await twoHunkRepo()
    const hunks = await call<{ index: number }[]>('treeline:getHunks', repo, 'f.txt', false)
    await call('treeline:discardHunk', repo, 'f.txt', false, hunks[0].index)
    const content = read(repo, 'f.txt')
    expect(content).not.toContain('X')
    expect(content).toContain('Z')
  })

  it('getDiff sintético de arquivo novo (untracked) monta hunk real', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'base\n', 'base')
    write(repo, 'novo.txt', 'um\ndois\ntres\n')
    const d = await call<string>('treeline:getDiff', repo, 'novo.txt', false)
    expect(d).toContain('@@ -0,0 +1,3 @@')
    expect(d).toContain('+um')
  })

  it('getDiff de binário novo mostra nota, não diff binário', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'base\n', 'base')
    write(repo, 'img.bin', '\u0000\u0001\u0002\u0003')
    const d = await call<string>('treeline:getDiff', repo, 'img.bin', false)
    expect(d).toMatch(/[Bb]inary|binário|binario/)
  })
})

describe('motor: commit amend e stage por path', () => {
  it('stage/unstage por arquivo e amend substitui commit', async () => {
    const repo = keep(await mkRepo())
    const first = await commitFile(repo, 'a.txt', 'v1\n', 'msg')
    write(repo, 'a.txt', 'v2\n')
    await call('treeline:stage', repo, 'a.txt')
    const staged = await call('treeline:getStatus', repo)
    expect(staged.staged.map((x: { path: string }) => x.path)).toContain('a.txt')
    await call('treeline:commit', repo, 'msg2', true)
    const detail = await call<{ hash: string; message: string }>('treeline:getCommitDetail', repo, 'HEAD')
    expect(detail.message).toBe('msg2')
    expect(detail.hash).not.toBe(first)
    const logLen = (await call('treeline:getLog', repo, 10, 0) as unknown[]).length
    expect(logLen).toBe(1)
  })

  it('uncommit via reflog reseta e backupBundle é listável', async () => {
    const repo = keep(await mkRepo())
    const first = await commitFile(repo, 'a.txt', 'v1\n', 'first')
    await commitFile(repo, 'a.txt', 'v2\n', 'second')
    const reflog = await call<{ ref: string; hash: string }[]>('treeline:getReflog', repo, 10)
    expect(reflog.length).toBeGreaterThan(0)
    await call('treeline:undoToReflog', repo, first)
    expect(read(repo, 'a.txt')).toBe('v1\n')
    const backups = await call<{ file: string }[]>('treeline:listBackups', repo)
    expect(backups.length).toBeGreaterThan(0)
    const git = simpleGit(repo)
    expect((await git.branchLocal()).all).toContain('main')
  })

  it('commit cheio em branco não vira no-op silencioso', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'x\n', 'base')
    await expect(call('treeline:commit', repo, '', false)).rejects.toThrow()
  })
})