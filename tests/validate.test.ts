import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { assertCloneUrl, assertRefName, assertSafeRef, relPathSafe } from '../src/main/git/validate'

const repos: string[] = []
afterAll(() => {
  for (const r of repos) rmSync(r, { recursive: true, force: true })
})

const lang = 'en'

describe('assertSafeRef', () => {
  const ok = (n: string): string => { const v = assertSafeRef(n, lang); return v }
  it('aceita nomes normais', () => {
    expect(ok('feature/x-1')).toBeUndefined()
    expect(ok('fix(ui)')).toBeUndefined()
  })
  it('rejeita option injection e navigation', () => {
    expect(() => assertSafeRef('-c', lang)).toThrow()
    expect(() => assertSafeRef('--force', lang)).toThrow()
    expect(() => assertSafeRef('head~2', lang)).toThrow()
    expect(() => assertSafeRef('a..b', lang)).toThrow()
    expect(() => assertSafeRef('a:b', lang)).toThrow()
    expect(() => assertSafeRef('', lang)).toThrow()
    expect(() => assertSafeRef('/abs', lang)).toThrow()
    expect(() => assertSafeRef('trail/', lang)).toThrow()
  })
})

describe('assertCloneUrl', () => {
  it('rejeita url insegura e quebra de linha (injeção de argv/config)', () => {
    expect(() => assertCloneUrl('https://github.com/x/y', lang)).not.toThrow()
    expect(() => assertCloneUrl('file:///etc/passwd', lang)).toThrow()
    expect(() => assertCloneUrl('localhost:x', lang)).toThrow()
    expect(() => assertCloneUrl('127.0.0.1:repo', lang)).toThrow()
    expect(() => assertCloneUrl('ext::sh -c x', lang)).toThrow()
    expect(() => assertCloneUrl('https://x/y\n--exec', lang)).toThrow()
    expect(() => assertCloneUrl('-l', lang)).toThrow()
    expect(() => assertCloneUrl('', lang)).toThrow()
  })
})

describe('relPathSafe', () => {
  it('descarta `..` que saem do repo e symlink apontando para fora', () => {
    const repo = mkdtempSync(join(tmpdir(), 'tl-relpath-'))
    repos.push(repo)
    mkdirSync(join(repo, 'sub'))
    writeFileSync(join(repo, 'a.txt'), 'x')
    writeFileSync(join(repo, 'sub', 'b.txt'), 'y')
    expect(relPathSafe(repo, 'a.txt', lang)).toBe('a.txt')
    expect(relPathSafe(repo, 'sub/b.txt', lang)).toBe('sub/b.txt')
    expect(relPathSafe(repo, './a.txt', lang)).toBe('./a.txt')
    expect(() => relPathSafe(repo, '../etc/passwd', lang)).toThrow()
    const outside = mkdtempSync(join(tmpdir(), 'tl-relpath-out-'))
    repos.push(outside)
    try {
      symlinkSync(outside, join(repo, 'link'))
    } catch {
      symlinkSync(outside, join(repo, 'link'), 'dir')
    }
    expect(() => relPathSafe(repo, 'link/file.txt', lang)).toThrow()
  })
})

describe('assertRefName', () => {
  it('usa a mensagem dedicada de nome de ref', () => {
    expect(() => assertRefName('', lang)).toThrow()
    expect(() => assertRefName('-x', lang)).toThrow()
  })
})