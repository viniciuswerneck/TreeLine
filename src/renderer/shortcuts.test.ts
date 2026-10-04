import { describe, expect, it } from 'vitest'
import type { ShortcutAction } from './shortcuts'
import { SHORTCUT_DEFAULTS, findShortcutConflicts, formatShortcut, isCustomShortcut } from './shortcuts'

describe('formatShortcut', () => {
  it('formata modificadores e teclas', () => {
    expect(formatShortcut('ctrl+shift+enter')).toBe('Ctrl+Shift+Enter')
    expect(formatShortcut('ctrl+`')).toBe('Ctrl+`')
    expect(formatShortcut('alt+f4')).toBe('Alt+F4')
  })
})

describe('findShortcutConflicts', () => {
  it('não reporta conflito nos padrões', () => {
    const c = findShortcutConflicts(SHORTCUT_DEFAULTS)
    expect(Object.values(c).every((v) => v.length === 0)).toBe(true)
  })

  it('aponta os pares que disputam o mesmo atalho', () => {
    const c = findShortcutConflicts({ ...SHORTCUT_DEFAULTS, search: 'ctrl+k' })
    expect(c.palette).toEqual(['search'])
    expect(c.search).toEqual(['palette'])
    expect(c.refresh).toEqual([])
  })

  it('normaliza caixa e espaços antes de comparar', () => {
    const c = findShortcutConflicts({ ...SHORTCUT_DEFAULTS, search: ' CTRL+K ' })
    expect(c.palette).toEqual(['search'])
  })

  it('ignora atalhos vazios', () => {
    const c = findShortcutConflicts({ ...SHORTCUT_DEFAULTS, search: '' })
    expect(c.search).toEqual([])
  })
})

describe('isCustomShortcut', () => {
  it('marca somente os divergentes', () => {
    const map = { ...SHORTCUT_DEFAULTS, terminal: 'ctrl+shift+t' }
    expect(isCustomShortcut('terminal' as ShortcutAction, map)).toBe(true)
    expect(isCustomShortcut('palette' as ShortcutAction, map)).toBe(false)
  })
})