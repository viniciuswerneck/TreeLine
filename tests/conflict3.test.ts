import { execFileSync as run } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { ConflictChoice } from '../src/renderer/lib/conflict3'
import {
  applyChoices,
  applyChoiceToAll,
  conflictRegions,
  hasMarkers,
  missingSideRegion,
  parseRegions,
  setChoice,
  stepConflict,
  endsWithNewline,
  toLines,
  toText
} from '../src/renderer/lib/conflict3'

/**
 * ORÁCULO REAL, sem código compartilhado com o motor.
 *
 * O git sabe resolver um merge de 3 vias sem marcadores:
 * `git merge-file --object-id --ours|--theirs|--union` devolve o conteúdo já
 * resolvido, byte a byte. Nosso motor, alimentado do MESMO texto com
 * marcadores (`merge-file --zdiff3`), tem que produzir exatamente a mesma
 * saída quando o usuário escolhe those same sides em toda região.
 *
 * Se nosso parse errar a fronteira de uma região, ou errar o conteúdo de um
 * lado, o texto diverge e o teste quebra. Nenhuma asserção sobre estrutura
 * interna: só sobre o texto final, que é o que o usuário vai stagear.
 */
const repos: string[] = []

function sh(cwd: string, ...args: string[]): string {
  return run('git', args, {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'T',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 'T',
      GIT_COMMITTER_EMAIL: 't@t'
    }
  })
}

interface Fixture {
  repo: string
  /** sha do stage 1/2/3, ou null se o arquivo não ficou unmerged. */
  base: string | null
  ours: string | null
  theirs: string | null
  /** Conteúdo que o merge realmente deixou no worktree. */
  worktree: string
}

/** Repo de verdade com dois ramos que colidem em `file`. */
function fixture(file: string, base: string, ours: string, theirs: string): Fixture {
  const repo = mkdtempSync(join(tmpdir(), 'treeline-conflict-'))
  repos.push(repo)
  sh(repo, 'init', '-q', '.')
  writeFileSync(join(repo, file), base)
  sh(repo, 'add', '.')
  sh(repo, 'commit', '-qm', 'base')
  const cur = sh(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim()
  sh(repo, 'checkout', '-qb', 'side')
  writeFileSync(join(repo, file), theirs)
  // `theirs` pode ser igual à base (caso "só um lado muda"): commit vazio
  // sai com código != 0 e não é erro para o fixture.
  try {
    sh(repo, 'commit', '-qam', 'theirs')
  } catch {
    /* sem mudança: o branch side aponta para a base */
  }
  sh(repo, 'checkout', '-q', cur)
  writeFileSync(join(repo, file), ours)
  try {
    sh(repo, 'commit', '-qam', 'ours')
  } catch {
    /* idem */
  }
  try {
    sh(repo, 'merge', 'side')
  } catch {
    /* esperado quando conflita */
  }
  const entries = sh(repo, 'ls-files', '-u')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [meta, p] = l.split('\t')
      const [, sha, stage] = (meta as string).split(' ')
      return { sha: sha as string, stage: Number(stage) }
    })
  const pick = (stage: number): string | null => entries.find((x) => x.stage === stage)?.sha ?? null
  let worktree = ''
  try {
    worktree = run('cat', [join(repo, file)], { encoding: 'utf-8' })
  } catch {
    worktree = ''
  }
  return { repo, base: pick(1), ours: pick(2), theirs: pick(3), worktree }
}

/** `merge-file -p --zdiff3`: o texto com marcadores que o main entrega ao renderer. */
function mergeFileMarked(f: Fixture): string {
  if (!f.ours || !f.theirs || !f.base) throw new Error('fixture sem conflito')
  try {
    return run('git', ['merge-file', '-p', '--object-id', '--zdiff3', '-L', 'ours', '-L', 'base', '-L', 'theirs', f.ours, f.base, f.theirs], {
      cwd: f.repo,
      encoding: 'utf-8'
    })
  } catch (e) {
    // rc do merge-file = número de conflitos (0 limpo, 1 um, N vários).
    const err = e as { status?: number; stdout?: string }
    if (typeof err.status === 'number' && err.status >= 1 && typeof err.stdout === 'string') return err.stdout
    throw e
  }
}

/** `merge-file -p --<side>`: saída do git JÁ resolvida. O oráculo. */
function mergeFileResolved(f: Fixture, side: 'ours' | 'theirs' | 'union'): string {
  if (!f.ours || !f.theirs || !f.base) throw new Error('fixture sem conflito')
  return run('git', ['merge-file', '-p', '--object-id', `--${side}`, f.ours, f.base, f.theirs], {
    cwd: f.repo,
    encoding: 'utf-8'
  })
}

afterAll(() => {
  for (const r of repos) rmSync(r, { recursive: true, force: true })
})

/**
 * choice do motor ↔ flag do git.
 *
 * `--ours`/`--theirs` são oráculo válido para qualquer número de regiões.
 * `--union` NÃO é: em casos com 2+ regiões o `git merge-file --union` devolve
 * contexto duplicado (`1 A 3 4 5 C B 3 4 5 D 7 8`), porque resolve num
 * granularidade mais grossa que a região. Com 1 região ele bate. Por isso
 * `singleRegionOnly`.
 */
const ORACLE: Array<{ choice: ConflictChoice; flag: 'ours' | 'theirs' | 'union'; singleRegionOnly?: boolean }> = [
  { choice: 'ours', flag: 'ours' },
  { choice: 'theirs', flag: 'theirs' },
  { choice: 'both', flag: 'union', singleRegionOnly: true }
]

describe('oráculo: nosso motor resolve igual o git', () => {
  const cases: Array<{ name: string; base: string; ours: string; theirs: string }> = [
    { name: 'mesma linha, lados diferentes', base: 'a\nb\nc\n', ours: 'a\nB-ours\nc\n', theirs: 'a\nB-theirs\nc\n' },
    { name: 'mudanças adjacentes', base: 'a\nb\nc\nd\n', ours: 'a\nb\nX\nd\n', theirs: 'a\nb\nc\nY\nd\n' },
    { name: 'append de cada lado', base: 'a\nb\nc\n', ours: 'a\nb\nc\nours\n', theirs: 'a\nb\nc\ntheirs\n' },
    { name: 'remoção sobreposta a edição', base: 'a\nb\nc\nd\ne\n', ours: 'a\nd\ne\n', theirs: 'a\nb\nC\nd\ne\n' },
    { name: 'conflito no topo', base: 'b\nc\n', ours: 'X\nb\nc\n', theirs: 'Y\nb\nc\n' },
    { name: 'conflito no fim', base: 'b\nc\n', ours: 'b\nc\nX\n', theirs: 'b\nc\nY\n' },
    { name: 'arquivo inteiro', base: 'a\nb\nc\n', ours: 'x\ny\nz\n', theirs: 'p\nq\nr\n' },
    { name: 'várias regiões', base: '1\n2\n3\n4\n5\n6\n7\n8\n', ours: '1\nA\n3\n4\n5\nC\n7\n8\n', theirs: '1\nB\n3\n4\n5\nD\n7\n8\n' },
    { name: 'remoção no meio dos dois lados', base: 'a\nb\nc\nd\ne\n', ours: 'a\nc\ne\n', theirs: 'a\nb\nd\n' },
    { name: 'linhas repetidas', base: 'x\nx\nx\nx\n', ours: 'x\nA\nx\nx\n', theirs: 'x\nB\nx\nx\n' },
    { name: 'conflitos em três pontos', base: '1\n2\n3\n4\n5\n6\n7\n8\n9\n', ours: 'A\n2\n3\n4\n5\n6\nC\n8\n9\n', theirs: 'B\n2\n3\n4\n5\n6\nD\n8\n9\n' },
    { name: 'base vazia de um lado', base: '\n', ours: 'a\n', theirs: 'b\n' }
  ]

  for (const c of cases) {
    it(`resolve igual ao git: ${c.name}`, () => {
      const f = fixture('f.txt', c.base, c.ours, c.theirs)
      expect(f.base).not.toBeNull()
      const marked = mergeFileMarked(f)
      const single = conflictRegions(parseRegions(marked)).length === 1
      for (const o of ORACLE) {
        if (o.singleRegionOnly && !single) continue
        const oursText = applyChoices(applyChoiceToAll(marked, o.choice), endsWithNewline(marked)).text
        expect(oursText, `--${o.flag}`).toBe(mergeFileResolved(f, o.flag))
      }
    })
  }

  it('escolha por região bate com o git quando a região isolada confere', () => {
    // ours/theirs/base na única região; e custom no meio.
    const f = fixture('f.txt', 'a\nb\nc\nd\ne\n', 'a\nX\nc\nd\ne\n', 'a\nY\nc\nd\ne\n')
    const marked = mergeFileMarked(f)
    const regions = parseRegions(marked)
    expect(conflictRegions(regions)).toHaveLength(1)
    const only = (choice: ConflictChoice): string =>
      applyChoices(regions.map((r) => (r.kind === 'conflict' ? setChoice(r, choice) : r)), endsWithNewline(marked)).text
    for (const o of ORACLE) {
      expect(only(o.choice)).toBe(mergeFileResolved(f, o.flag))
    }
    // `base` reproduz a base que o git usou como ancestral.
    expect(only('base')).toBe('a\nb\nc\nd\ne\n')
    // `both-reversed` inverte a ordem dos lados só dentro da região: o
    // contexto antes/depois fica igual, então não pode ser o union invertido.
    expect(only('both-reversed')).not.toBe(only('both'))
  })

  it('nos casos sem sobreposição o texto marcado já sai limpo', () => {
    // Só um lado mexeu: o git auto-mergeia, então nem entra em conflito.
    const f = fixture('f.txt', 'a\nb\nc\nd\ne\n', 'a\nb\nc\nd\nOURS\n', 'a\nb\nc\nd\ne\n')
    expect(f.base).toBeNull()
    expect(conflictRegions(parseRegions(f.worktree))).toHaveLength(0)
    expect(hasMarkers(f.worktree)).toBe(false)
  })

  it('mudança idêntica dos dois lados não conflita', () => {
    const f = fixture('f.txt', 'a\nb\nc\n', 'a\nSAME\nc\n', 'a\nSAME\nc\n')
    expect(f.base).toBeNull()
    expect(conflictRegions(parseRegions(f.worktree))).toHaveLength(0)
  })
})

describe('parseRegions: conteúdo dos lados', () => {
  it('base/ours/theirs exatos numa região simples', () => {
    const f = fixture('f.txt', 'a\nb\nc\n', 'a\nB-ours\nc\n', 'a\nB-theirs\nc\n')
    const r = conflictRegions(parseRegions(mergeFileMarked(f)))[0]!
    expect(r.ours).toEqual(['B-ours'])
    expect(r.theirs).toEqual(['B-theirs'])
    expect(r.base).toEqual(['b'])
  })

  it('clean antes e depois da região sobrevive ao round-trip', () => {
    const f = fixture('f.txt', '1\n2\n3\n4\n5\n', '1\n2\nX\n4\n5\n', '1\n2\nY\n4\n5\n')
    const regions = parseRegions(mergeFileMarked(f))
    expect(regions[0]).toMatchObject({ kind: 'clean', lines: ['1', '2'] })
    expect(regions[regions.length - 1]).toMatchObject({ kind: 'clean', lines: ['4', '5'] })
  })

  it('toda região nasce indecisa (contrato 3)', () => {
    const f = fixture('f.txt', '1\n2\n3\n4\n', '1\nX\n3\n4\n', '1\nY\n3\n4\n')
    for (const r of conflictRegions(parseRegions(mergeFileMarked(f)))) {
      expect(r.choice).toBeNull()
    }
  })
})

describe('applyChoices', () => {
  const region = (patch: Partial<ReturnType<typeof missingSideRegion>> = {}): ReturnType<typeof missingSideRegion> => ({
    kind: 'conflict',
    lines: [],
    base: ['b'],
    ours: ['o'],
    theirs: ['t'],
    choice: null,
    ...patch
  })

  it('ours/theirs/base/both', () => {
    expect(applyChoices([region({ choice: 'ours' })], false).text).toBe('o')
    expect(applyChoices([region({ choice: 'theirs' })], false).text).toBe('t')
    expect(applyChoices([region({ choice: 'base' })], false).text).toBe('b')
    expect(applyChoices([region({ choice: 'both' })], false).text).toBe('o\nt')
    expect(applyChoices([region({ choice: 'both-reversed' })], false).text).toBe('t\no')
  })

  it('custom usa o texto editado', () => {
    expect(applyChoices([region({ choice: 'custom', custom: 'ma\nminha' })], false).text).toBe('ma\nminha')
  })

  it('conta unresolved enquanto choice é null', () => {
    expect(applyChoices([region({ choice: null })])).toMatchObject({ unresolved: 1, conflicts: 1, resolved: false })
    expect(applyChoices([region({ choice: 'ours' })])).toMatchObject({ unresolved: 0, conflicts: 1, resolved: true })
    expect(applyChoices([region({ choice: 'ours' }), region({ choice: null })])).toMatchObject({ unresolved: 1, resolved: false })
  })

  it('clean nunca conta como conflito e não trava o save', () => {
    const r = applyChoices([{ kind: 'clean', lines: ['a'], base: [], ours: [], theirs: [], choice: null }], false)
    expect(r).toMatchObject({ conflicts: 0, unresolved: 0, resolved: true, text: 'a' })
  })

  it('default preview de região indecisa é o lado nosso', () => {
    expect(applyChoices([region({ choice: null })], false).text).toBe('o')
  })

  it('delete/modify: escolher o lado ausente apaga o arquivo', () => {
    // deleted-by-them: stage 3 ausente, o conteúdo que sobrou é o stage 2.
    const del = missingSideRegion(['conteudo'], true, { theirsMissing: true })
    expect(del.ours).toEqual(['conteudo'])
    expect(del.theirs).toEqual([])
    const resolved = applyChoices([setChoice(del, 'theirs')])
    expect(resolved.deletes).toBe(true)
    expect(resolved.text).toBe('')
    expect(applyChoices([setChoice(del, 'ours')]).deletes).toBe(false)
  })

  it('delete/modify espelhado (deleted-by-us)', () => {
    const del = missingSideRegion(['conteudo'], false, { oursMissing: true })
    expect(del.theirs).toEqual(['conteudo'])
    expect(del.ours).toEqual([])
    expect(applyChoices([setChoice(del, 'ours')]).deletes).toBe(true)
    expect(applyChoices([setChoice(del, 'theirs')], false).text).toBe('conteudo')
  })
})

describe('parseRegions: robustez', () => {
  it('marcador falso no conteúdo vira texto normal (contrato 1)', () => {
    const r = conflictRegions(
      parseRegions(['<<<<<<< ours', '<<<<<<< nao sou eu', '======= tampouco', '>>>>>>> nada', '=======', 'theirs real', '>>>>>>> theirs'].join('\n'))
    )[0]!
    expect(r.ours).toEqual(['<<<<<<< nao sou eu', '======= tampouco', '>>>>>>> nada'])
    expect(r.theirs).toEqual(['theirs real'])
  })

  it('base vazia é permitida', () => {
    const r = conflictRegions(parseRegions(['<<<<<<< ours', 'o1', '||||||| base', '=======', 't1', '>>>>>>> theirs'].join('\n')))[0]!
    expect(r.base).toEqual([])
    expect(r.ours).toEqual(['o1'])
  })

  it('seção base ausente cai direto para theirs', () => {
    const r = conflictRegions(parseRegions(['<<<<<<< ours', 'o1', '=======', 't1', '>>>>>>> theirs'].join('\n')))[0]!
    expect(r.base).toEqual([])
    expect(r.theirs).toEqual(['t1'])
  })

  it('texto sem conflito devolve só clean', () => {
    expect(parseRegions('a\nb\nc\n')).toEqual([{ kind: 'clean', lines: ['a', 'b', 'c'], base: [], ours: [], theirs: [], choice: null }])
  })

  it('texto vazio não quebra', () => {
    expect(parseRegions('')).toEqual([])
    expect(applyChoices([], false)).toEqual({ text: '', unresolved: 0, conflicts: 0, deletes: false, resolved: true })
  })

  it('conflito no primeiro e no último, sem clean em volta', () => {
    const regions = parseRegions(['<<<<<<< ours', 'o', '||||||| base', 'b', '=======', 't', '>>>>>>> theirs'].join('\n'))
    expect(regions).toHaveLength(1)
    expect(conflictRegions(regions)).toHaveLength(1)
  })

  it('várias regiões se intercalam com clean', () => {
    const txt = [
      '<<<<<<< ours', 'O1', '=======', 'T1', '>>>>>>> theirs',
      'mid',
      '<<<<<<< ours', 'O2', '||||||| base', 'B', '=======', 'T2', '>>>>>>> theirs'
    ].join('\n')
    const regions = parseRegions(txt)
    expect(regions.map((r) => r.kind)).toEqual(['conflict', 'clean', 'conflict'])
    expect(applyChoices(applyChoiceToAll(txt, 'theirs'), false).text).toBe('T1\nmid\nT2')
  })
})

describe('navegação entre regiões', () => {
  const txt = ['<<<<<<< ours', 'O1', '=======', 'T1', '>>>>>>> theirs', 'mid', '<<<<<<< ours', 'O2', '=======', 'T2', '>>>>>>> theirs'].join('\n')

  it('stepConflict percorre com wrap', () => {
    const regions = conflictRegions(parseRegions(txt))
    expect(regions).toHaveLength(2)
    expect(stepConflict(regions, 0, 1)).toBe(1)
    expect(stepConflict(regions, 1, 1)).toBe(0)
    expect(stepConflict(regions, 0, -1)).toBe(1)
  })

  it('stepConflict devolve -1 sem conflitos', () => {
    expect(stepConflict([], 0, 1)).toBe(-1)
  })
})

describe('hasMarkers', () => {
  it('detecta marcador nosso e genérico', () => {
    expect(hasMarkers('<<<<<<< ours\no\n=======\nt\n>>>>>>> theirs')).toBe(true)
    expect(hasMarkers('<<<<<<<\no\n=======\nt\n>>>>>>>')).toBe(true)
  })

  it('não dá falso positivo em texto normal', () => {
    expect(hasMarkers('a < b && c > d\nconst x = "===="\n')).toBe(false)
    expect(hasMarkers('')).toBe(false)
  })

  it('saída resolvida não tem marcador', () => {
    const regions = applyChoiceToAll(['<<<<<<< ours', 'o', '=======', 't', '>>>>>>> theirs'].join('\n'), 'ours')
    expect(hasMarkers(applyChoices(regions, false).text)).toBe(false)
  })
})

describe('toLines / toText', () => {
  it('toLines não deixa o "" fantasma do split', () => {
    expect(toLines('a\n')).toEqual(['a'])
    expect(toLines('')).toEqual([])
    expect(toLines('a\nb')).toEqual(['a', 'b'])
  })

  it('toLines+toText preservam o conteúdo sem o \n final', () => {
    for (const s of ['a', 'a\nb', '']) {
      expect(toText(toLines(s))).toBe(s)
    }
  })

  it('o \n final é flag separada (contrato 5), não responsabilidade de toText', () => {
    expect(endsWithNewline('a\n')).toBe(true)
    expect(endsWithNewline('a')).toBe(false)
    expect(endsWithNewline('')).toBe(false)
    // toText perde o newline final; applyChoices e quem o repõe.
    expect(toText(toLines('a\n'))).toBe('a')
    expect(applyChoices([{ kind: 'clean', lines: ['a'], base: [], ours: [], theirs: [], choice: null }]).text).toBe('a\n')
    expect(applyChoices([{ kind: 'clean', lines: ['a'], base: [], ours: [], theirs: [], choice: null }], false).text).toBe('a')
  })
})
