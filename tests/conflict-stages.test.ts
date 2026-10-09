import { execFileSync as run } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { conflictKindOf, isGitlink, parseLsFilesU, parseUnmergedXY, shortRef, stagesByPath } from '../src/main/conflict-stages'

/**
 * O mapeamento XY -> tipo de conflito é o lugar onde o Git mente se a gente
 * escuta o XY em vez do index. Estes testes montam repos de verdade com cada
 * tipo de conflito e comparam com o que o git realmente põe no index, para a
 * tabela não voltar a trocar DU/UD.
 */

const dirs: string[] = []

function sh(cwd: string, ...args: string[]): string {
  return run('git', args, { cwd, encoding: 'utf-8', env: { ...process.env, LC_ALL: 'C' } })
}

/** `git merge` com conflito sai != 0 de propósito — não é falha do teste. */
function mergeWithConflict(repo: string): void {
  try {
    sh(repo, 'merge', 'side')
    throw new Error('o merge deveria ter conflitado e não conflitou')
  } catch (e) {
    if (e instanceof Error && e.message.includes('deveria ter conflitado')) throw e
  }
}

/** repo com os 4 tipos de conflito simultâneos; devolve o caminho. */
function conflictedRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'treeline-conflict-'))
  dirs.push(repo)
  sh(repo, 'init', '-q', '-b', 'main', '.')
  sh(repo, 'config', 'user.email', 't@t')
  sh(repo, 'config', 'user.name', 't')
  writeFileSync(join(repo, 'mod.txt'), 'a\nb\nc\n')
  // added.txt de propósito NÃO existe aqui: só os dois lados o criam, para
  // sair add/add de verdade (sem stage 1) em vez de modify/modify.
  writeFileSync(join(repo, 'del.txt'), 'keep\nbase\n')
  writeFileSync(join(repo, 'bin.dat'), 'PNG\u0000\u0001\u0002data\u0000')
  sh(repo, 'add', '-A')
  sh(repo, 'commit', '-qm', 'base')

  sh(repo, 'checkout', '-qb', 'side')
  writeFileSync(join(repo, 'mod.txt'), 'a\nTHEIRS\nc\n')
  writeFileSync(join(repo, 'added.txt'), 'x\nSIDE\n')
  writeFileSync(join(repo, 'bin.dat'), 'PNG\u0000\u0001\u0002SIDE\u0000')
  run('rm', [join(repo, 'del.txt')])
  sh(repo, 'add', '-A')
  sh(repo, 'commit', '-qm', 'side')

  sh(repo, 'checkout', '-q', 'main')
  writeFileSync(join(repo, 'mod.txt'), 'a\nOURS\nc\n')
  writeFileSync(join(repo, 'added.txt'), 'x\nMAIN\n')
  writeFileSync(join(repo, 'del.txt'), 'keep\nours\n')
  writeFileSync(join(repo, 'bin.dat'), 'PNG\u0000\u0001\u0002OURS\u0000')
  sh(repo, 'add', '-A')
  sh(repo, 'commit', '-qm', 'main')
  mergeWithConflict(repo)
  return repo
}

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

describe('parseLsFilesU', () => {
  it('lê mode sha stage<TAB>path, inclusive nome com espaço e acentos', () => {
    const repo = mkdtempSync(join(tmpdir(), 'treeline-ls-'))
    dirs.push(repo)
    sh(repo, 'init', '-q', '-b', 'main', '.')
    sh(repo, 'config', 'user.email', 't@t')
    sh(repo, 'config', 'user.name', 't')
    const path = 'src/arquivo com espaço e ç.txt'
    mkdirSync(join(repo, 'src'))
    writeFileSync(join(repo, path), 'a\n')
    sh(repo, 'add', '-A')
    sh(repo, 'commit', '-qm', 'base')
    sh(repo, 'checkout', '-qb', 'side')
    writeFileSync(join(repo, path), 'a\nSIDE\n')
    sh(repo, 'commit', '-qam', 'side')
    sh(repo, 'checkout', '-q', 'main')
    writeFileSync(join(repo, path), 'a\nMAIN\n')
    sh(repo, 'commit', '-qam', 'main')
    mergeWithConflict(repo)

    const entries = parseLsFilesU(sh(repo, 'ls-files', '-u', '-z'))
    expect(entries).toHaveLength(3)
    expect(new Set(entries.map((e) => e.path))).toEqual(new Set([path]))
    expect(entries.map((e) => e.stage).sort()).toEqual([1, 2, 3])
    for (const e of entries) expect(e.sha).toMatch(/^[0-9a-f]{40}$/)
  })

  it('o separador de registro é NUL (-z) e o de path é TAB', () => {
    // Regressão: splittar por \n colava os 3 estágios num path só.
    const raw = ['100644 abc123 1\tf.txt', '100644 def456 2\tf.txt', '100644 ghi789 3\tf.txt'].join('\0')
    expect(parseLsFilesU(raw)).toEqual([
      { mode: '100644', sha: 'abc123', stage: 1, path: 'f.txt' },
      { mode: '100644', sha: 'def456', stage: 2, path: 'f.txt' },
      { mode: '100644', sha: 'ghi789', stage: 3, path: 'f.txt' }
    ])
    // path com espaço não invade o campo de stage
    expect(parseLsFilesU('100644 abc123 2\tmeu arquivo.txt')).toEqual([
      { mode: '100644', sha: 'abc123', stage: 2, path: 'meu arquivo.txt' }
    ])
  })

  it('expõe o mode (gitlink = 160000) para detectar submódulo', () => {
    expect(isGitlink('160000')).toBe(true)
    expect(isGitlink('100644')).toBe(false)
  })
})

describe('stagesByPath', () => {
  it('agrupa os estágios por path', () => {
    const m = stagesByPath([
      { mode: '100644', sha: 'a', stage: 3, path: 'x' },
      { mode: '100644', sha: 'b', stage: 1, path: 'x' },
      { mode: '100644', sha: 'c', stage: 2, path: 'x' },
      { mode: '100644', sha: 'd', stage: 2, path: 'y' }
    ])
    expect(m.get('x')).toEqual([1, 2, 3])
    expect(m.get('y')).toEqual([2])
  })
})

describe('parseUnmergedXY', () => {
  it('formato real -z: 7 campos de metadado e o path é o resto do registro', () => {
    // Saída medida de `git status --porcelain=v2 -z` num repo com conflito.
    // O NUL fecha o registro; o path fica depois dos 7 metadados, com espaço.
    const rec = (xy: string, path: string): string =>
      `u ${xy} N... 100644 100644 100644 100644 aaa bbb ccc ${path}`
    expect(parseUnmergedXY(`${rec('UU', 'zzz.txt')}\u0000`)).toEqual([{ xy: 'UU', path: 'zzz.txt' }])
    expect(parseUnmergedXY(`${rec('UD', 'd.txt')}\u0000${rec('AA', 'a.txt')}\u0000`)).toEqual([
      { xy: 'UD', path: 'd.txt' },
      { xy: 'AA', path: 'a.txt' }
    ])
  })

  it('path com espaço é preservado inteiro (não é separado como campo)', () => {
    const rec = 'u UU N... 100644 100644 100644 100644 aaa bbb ccc meu arquivo com espaco.txt'
    expect(parseUnmergedXY(`${rec}\u0000`)).toEqual([{ xy: 'UU', path: 'meu arquivo com espaco.txt' }])
  })

  it('path com acento não vem escapado nem entre aspas no -z', () => {
    const path = 'src/arquivo com espaço e ç.txt'
    const rec = `u UU N... 100644 100644 100644 100644 aaa bbb ccc ${path}`
    expect(parseUnmergedXY(`${rec}\u0000`)[0]?.path).toBe(path)
  })

  it('ignora registros que não são unmerged (1/2/?) e vazios', () => {
    const raw = [
      '1 M. N... 100644 100644 100644 100644 aaa bbb R100 normal.txt',
      'u UU N... 100644 100644 100644 100644 aaa bbb ccc bad.txt',
      '? novo.txt',
      ''
    ].join('\0')
    expect(parseUnmergedXY(raw)).toEqual([{ xy: 'UU', path: 'bad.txt' }])
  })

  it('descarta registro u truncado (sem path)', () => {
    expect(parseUnmergedXY('u UU N... 100644 100644 100644 100644 aaa bbb ccc\u0000')).toEqual([])
  })
})

describe('shortRef', () => {
  it('encurta os prefixos de ref', () => {
    expect(shortRef('refs/heads/main')).toBe('main')
    expect(shortRef('refs/remotes/origin/develop')).toBe('origin/develop')
    expect(shortRef('refs/tags/v1')).toBe('v1')
    expect(shortRef('main')).toBe('main')
  })
})

describe('conflictKindOf bate com o index real do git', () => {
  it('classifica os 4 tipos de conflito que o git realmente produziu', () => {
    const repo = conflictedRepo()
    const xy = new Map(parseUnmergedXY(sh(repo, 'status', '--porcelain=v2', '-z')).map((r) => [r.path, r.xy]))
    const stages = stagesByPath(parseLsFilesU(sh(repo, 'ls-files', '-u', '-z')))

    // modificado dos dois lados
    expect(xy.get('mod.txt')).toBe('UU')
    expect(conflictKindOf('UU', stages.get('mod.txt')!)).toBe('both-modified')
    // add/add: sem stage 1, porque o arquivo não existia na base
    expect(xy.get('added.txt')).toBe('AA')
    expect(stages.get('added.txt')).toEqual([2, 3])
    expect(conflictKindOf('AA', stages.get('added.txt')!)).toBe('both-added')
    // deles apagaram, nós alteramos: XY = UD, e o stage 3 é que falta
    expect(xy.get('del.txt')).toBe('UD')
    expect(stages.get('del.txt')).toEqual([1, 2])
    expect(conflictKindOf('UD', stages.get('del.txt')!)).toBe('deleted-by-them')
    // binário também entra como UU (o git não tem XY próprio)
    expect(xy.get('bin.dat')).toBe('UU')
    expect(conflictKindOf('UU', stages.get('bin.dat')!)).toBe('both-modified')
  })

  it('"deleted by us" e "deleted by them" não são trocados pelo XY', () => {
    // Regressão real: DU/UD já foram invertidos uma vez. A tabela abaixo é a
    // do git-status (DD/AU/UD/UA/DU/AA/UU) cruzada com o estágio ausente.
    const cases: Array<[string, number[], string]> = [
      ['UU', [1, 2, 3], 'both-modified'],
      ['AA', [2, 3], 'both-added'],
      ['UD', [1, 2], 'deleted-by-them'],
      ['DU', [1, 3], 'deleted-by-us'],
      ['DD', [1], 'both-deleted']
    ]
    for (const [xy, st, want] of cases) {
      expect(conflictKindOf(xy, st), `XY=${xy} stages=${st}`).toBe(want)
    }
  })

  it('o index manda mesmo quando o XY não bate (XY mentiroso cai no estágio)', () => {
    // Defense in depth: se o porcelain mudar de formato, o estágio ausente
    // ainda dá a resposta certa.
    expect(conflictKindOf('UU', [1, 2])).toBe('deleted-by-them')
    expect(conflictKindOf('UU', [1, 3])).toBe('deleted-by-us')
    expect(conflictKindOf('ZZ', [2, 3])).toBe('both-added')
  })
})
