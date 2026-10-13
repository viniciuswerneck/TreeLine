import { describe, expect, it } from 'vitest'
import { asArray, normalizeMessage, normalizePart, normalizePermission, shortError } from './ai'

describe('shared/ai (normalização do protocolo opencode)', () => {
  it('asArray devolve [] para não-arrays', () => {
    expect(asArray<number>(undefined)).toEqual([])
    expect(asArray<number>(null)).toEqual([])
    expect(asArray<number>('x')).toEqual([])
    expect(asArray<number>([1, 2])).toEqual([1, 2])
  })

  it('shortError extrai message de data/message/name', () => {
    expect(shortError('boom')).toBe('boom')
    expect(shortError({ data: { message: 'inner' } })).toBe('inner')
    expect(shortError({ message: 'top' })).toBe('top')
    expect(shortError({ name: 'Named' })).toBe('Named')
    expect(shortError(null)).toBe('')
    expect(shortError({})).toBe('erro')
  })

  it('normalizePart mapeia text, reasoning e tool', () => {
    expect(normalizePart({ type: 'text', id: '1', text: 'hi', synthetic: true })).toEqual({
      kind: 'text',
      id: '1',
      text: 'hi',
      synthetic: true
    })
    expect(normalizePart({ type: 'reasoning', id: '2', text: 'think' })).toEqual({
      kind: 'reasoning',
      id: '2',
      text: 'think'
    })
    const tool = normalizePart({
      type: 'tool',
      id: '3',
      tool: 'bash',
      state: { status: 'completed', title: 'run', output: 'ok' }
    })
    expect(tool).toMatchObject({ kind: 'tool', tool: 'bash', status: 'completed', title: 'run', detail: 'ok' })
  })

  it('normalizePart trata status desconhecido como pending', () => {
    const tool = normalizePart({ type: 'tool', tool: 'x', state: { status: 'weird' } })
    expect(tool).toMatchObject({ status: 'pending', tool: 'x' })
  })

  it('normalizeMessage filtra partes de controle e normaliza role', () => {
    const msg = normalizeMessage({
      info: { id: 'm1', role: 'user', time: { created: 42 }, agent: 'plan' },
      parts: [
        { type: 'step-start' },
        { type: 'text', id: 't', text: 'hello' },
        { type: 'snapshot' }
      ]
    })
    expect(msg.id).toBe('m1')
    expect(msg.role).toBe('user')
    expect(msg.created).toBe(42)
    expect(msg.agent).toBe('plan')
    expect(msg.parts).toHaveLength(1)
    expect(msg.parts[0]).toMatchObject({ kind: 'text', text: 'hello' })
  })

  it('normalizeMessage assume assistant sem role explícito', () => {
    expect(normalizeMessage({}).role).toBe('assistant')
    expect(normalizeMessage({}).error).toBeUndefined()
  })

  it('normalizePermission monta o título com patterns', () => {
    const req = normalizePermission({
      type: 'permission.asked',
      properties: { id: 'p1', sessionID: 's1', permission: 'bash', patterns: ['ls', 'pwd'] }
    })
    expect(req).toMatchObject({ id: 'p1', sessionID: 's1', kind: 'bash', scheme: 'classic' })
    expect(req?.title).toBe('bash: ls, pwd')
  })

  it('normalizePermission usa scheme v2 e cai para action', () => {
    const req = normalizePermission({
      type: 'permission.v2.asked',
      properties: { id: 'p2', sessionID: 's2', action: 'write', resources: ['a.txt'] }
    })
    expect(req).toMatchObject({ kind: 'write', scheme: 'v2' })
    expect(req?.title).toBe('write: a.txt')
  })

  it('normalizePermission retorna null sem id/sessionID', () => {
    expect(normalizePermission({ type: 'permission.asked', properties: {} })).toBeNull()
    expect(normalizePermission({})).toBeNull()
  })
})
