import { execFileSync as run } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { parseNumstatZ } from '../src/main/git/parsers'

const repos: string[] = []
afterAll(() => {
  for (const r of repos) rmSync(r, { recursive: true, force: true })
})

describe('parseNumstatZ', () => {
  it('arquivos normais: added/deleted/path por registro NUL', () => {
    const raw = ['2\t1\ta.txt', '10\t-\tb.ts', '0\t4\tc d.txt'].join('\0')
    expect(parseNumstatZ(raw)).toEqual([
      { path: 'a.txt', added: 2, deleted: 1 },
      { path: 'b.ts', added: 10, deleted: 0 },
      { path: 'c d.txt', added: 0, deleted: 4 }
    ])
  })

  it('rename (-z separa added/del do path dos DOIS lados)', () => {
    // Formato medido: R100 → `0\t0\t\0r1.txt\0r2.txt\0`.
    const raw = ['0\t0\t', 'r1.txt', 'r2.txt'].join('\0')
    expect(parseNumstatZ(raw)).toEqual([{ path: 'r2.txt', added: 0, deleted: 0 }])
  })

  it('rename com mudança de conteúdo segura as colunas do fragmento', () => {
    const raw = ['3\t2\t', 'r1.txt', 'r2.txt'].join('\0')
    expect(parseNumstatZ(raw)).toEqual([{ path: 'r2.txt', added: 3, deleted: 2 }])
  })

  it('entrada vazia/trailing NUL não quebra', () => {
    expect(parseNumstatZ('')).toEqual([])
    expect(parseNumstatZ(['1\t1\ta.txt', ''].join('\0'))).toEqual([{ path: 'a.txt', added: 1, deleted: 1 }])
  })
})

describe('fix do getCommitDetail (git real)', () => {
  it('`show --name-only --format=` lista UMA linha por arquivo (split \\n) e numstat -z resolve rename', () => {
    const repo = mkdtempSync(join(tmpdir(), 'tl-commitdetail-'))
    repos.push(repo)
    const sh = (args: string[]): string => run('git', args, { cwd: repo, encoding: 'utf8' })
    sh(['init', '-q', '-b', 'main'])
    sh(['config', 'user.email', 't@t'])
    sh(['config', 'user.name', 'T'])
    writeFileSync(join(repo, 'a.txt'), 'A')
    writeFileSync(join(repo, 'sub b.txt'), 'B')
    sh(['add', '-A'])
    sh(['commit', '-q', '-m', 'two files'])
    const head = sh(['rev-parse', 'HEAD']).trim()
    const names = sh(['show', '--name-only', '--format=', head])
    expect(names.split('\n').map((f) => f.trim()).filter(Boolean)).toEqual(['a.txt', 'sub b.txt'])
    const ns = sh(['show', '--numstat', '-z', '--format=', head])
    expect(parseNumstatZ(ns)).toEqual([
      { path: 'a.txt', added: 1, deleted: 0 },
      { path: 'sub b.txt', added: 1, deleted: 0 }
    ])
  })
})