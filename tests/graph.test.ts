import { describe, expect, it } from 'vitest'
import type { CommitInfo } from '../src/renderer/lib/graph'
import { layoutGraph } from '../src/renderer/lib/graph'

function c(hash: string, parents: string[] = [], refs: string[] = []): CommitInfo {
  return { hash, parents, author: 'T', date: '2026-01-01', message: hash, refs }
}

describe('layoutGraph', () => {
  it('linear usa lane 0 em tudo (anti-staircase)', () => {
    const rows = layoutGraph([c('c5', ['c4']), c('c4', ['c3']), c('c3', ['c2']), c('c2', ['c1']), c('c1')])
    expect(rows.map((r) => r.lane)).toEqual([0, 0, 0, 0, 0])
  })

  it('fork puro abre lane nova e join fecha', () => {
    // c3 tem 2 filhos? não — fork: b sai de c1, merge de volta em c4
    const rows = layoutGraph([
      c('c4', ['c3', 'b2'], ['main']),
      c('b2', ['b1']),
      c('b1', ['c1']),
      c('c3', ['c1']),
      c('c1')
    ])
    const lanes = new Set(rows.map((r) => r.lane))
    expect(lanes.size).toBeGreaterThan(1)
    expect(lanes.size).toBeLessThanOrEqual(3)
    // último commit volta para lane baixa (sem vazamento)
    expect(rows[rows.length - 1]?.lane).toBe(0)
  })

  it('merge commit tem dot maior (2 pais)', () => {
    const rows = layoutGraph([c('m', ['a', 'b']), c('a'), c('b')])
    expect(rows[0]?.parents.length).toBe(2)
  })

  it('lista vazia não quebra', () => {
    expect(layoutGraph([])).toEqual([])
  })

  it('root sem pais não abre lane fantasma', () => {
    const rows = layoutGraph([c('solo')])
    expect(rows[0]?.lane).toBe(0)
    expect(rows[0]?.through).toEqual([])
    expect(rows[0]?.forks).toEqual([])
  })

  it('through/forks são arrays válidos', () => {
    const rows = layoutGraph([c('c4', ['c3', 'b1']), c('b1', ['c1']), c('c3', ['c1']), c('c1')])
    for (const r of rows) {
      expect(Array.isArray(r.through)).toBe(true)
      expect(Array.isArray(r.forks)).toBe(true)
      for (const f of r.forks) {
        expect(['split', 'join']).toContain(f.kind)
      }
    }
  })

  it('join entra por cima (steal fecha trilho lateral)', () => {
    const rows = layoutGraph([
      c('c4', ['c3', 'b1'], ['HEAD', 'main']),
      c('b1', ['c1']),
      c('c3', ['c1']),
      c('c1')
    ])
    const joins = rows.flatMap((r) => r.forks.filter((f) => f.kind === 'join'))
    expect(joins.length).toBeGreaterThan(0)
  })
})
