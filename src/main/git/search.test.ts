import { describe, expect, it } from 'vitest'
import { escapeERE, matchRange, parseGrep } from './search'

describe('parseGrep', () => {
  it('parseia o formato working tree (path\\0line\\0texto)', () => {
    const hits = parseGrep('a.txt\x0012\x00hello world\nsub/b.txt\x003\x00nested hello\n')
    expect(hits).toEqual([
      { path: 'a.txt', line: 12, text: 'hello world' },
      { path: 'sub/b.txt', line: 3, text: 'nested hello' }
    ])
  })

  it('remove o prefixo ref: quando os hits vêm de uma branch', () => {
    const hits = parseGrep('feat/x:a.txt\x001\x00changed hello\n', 'feat/x')
    expect(hits).toEqual([{ path: 'a.txt', line: 1, text: 'changed hello' }])
  })

  it('aceita o formato legado path\\0line:texto', () => {
    const hits = parseGrep('a.txt\x001:literal:colon:text\n', 'ref/a') // prefixo não casa → descarta
    expect(hits).toEqual([])
    const win = parseGrep('a.txt\x001:literal:colon:text\n')
    expect(win).toEqual([{ path: 'a.txt', line: 1, text: 'literal:colon:text' }])
  })

  it('descarta lixo e linhas sem NUL', () => {
    expect(parseGrep('spam\n')).toEqual([])
    expect(parseGrep('')).toEqual([])
  })

  it('remove o \r final (arquivos CRLF)', () => {
    const hits = parseGrep('a.txt\x002\x00line\r\n')
    expect(hits).toEqual([{ path: 'a.txt', line: 2, text: 'line' }])
  })
})

describe('escapeERE', () => {
  it('escapa metacaracteres para busca literal no git log -G', () => {
    expect(escapeERE('a.b*c')).toBe('a\\.b\\*c')
    expect(escapeERE('foo(bar)')).toBe('foo\\(bar\\)')
    expect(escapeERE('sem-metacaracteres')).toBe('sem-metacaracteres')
  })
})

describe('matchRange', () => {
  const opts = (caseSensitive: boolean, regex: boolean) => ({ caseSensitive, regex })

  it('acha o primeiro match literal', () => {
    expect(matchRange('hello world', 'llo', opts(false, false))).toEqual({ start: 2, end: 5 })
  })

  it('respecta case-sensitive', () => {
    expect(matchRange('Hello HELLO', 'hello', opts(false, false))).toEqual({ start: 0, end: 5 })
    expect(matchRange('HELLO', 'hello', opts(true, false))).toEqual({ start: -1, end: -1 })
  })

  it('usar regex faz a faixa do match real', () => {
    expect(matchRange('id: 42a', '\\d+', opts(false, true))).toEqual({ start: 4, end: 6 })
  })

  it('regex inválida não explode', () => {
    expect(matchRange('x', '(', opts(false, true))).toEqual({ start: -1, end: -1 })
  })
})