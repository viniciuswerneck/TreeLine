// Atalhos remapeáveis do TreeLine (persistidos em localStorage).
// Formato: "ctrl+k", "ctrl+shift+enter", "f5". Modificadores: ctrl/meta (+shift+alt).

export type ShortcutAction = 'palette' | 'sidebar' | 'search' | 'refresh' | 'commit' | 'terminal' | 'gotoFile' | 'codeSearch'

export const SHORTCUT_DEFAULTS: Record<ShortcutAction, string> = {
  palette: 'ctrl+k',
  gotoFile: 'ctrl+p',
  codeSearch: 'ctrl+shift+f',
  sidebar: 'ctrl+b',
  search: 'ctrl+f',
  refresh: 'f5',
  commit: 'ctrl+enter',
  terminal: 'ctrl+`'
}

const STORAGE_KEY = 'treeline-shortcuts'

export function loadShortcuts(): Record<ShortcutAction, string> {
  const base = { ...SHORTCUT_DEFAULTS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const saved = JSON.parse(raw) as Record<string, unknown>
    for (const k of Object.keys(SHORTCUT_DEFAULTS) as ShortcutAction[]) {
      if (typeof saved[k] === 'string' && (saved[k] as string).trim()) base[k] = (saved[k] as string).trim().toLowerCase()
    }
  } catch {
    /* padrão */
  }
  return base
}

export function saveShortcuts(map: Record<ShortcutAction, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignora */
  }
}

/** "ctrl+k" a partir do KeyboardEvent (meta conta como ctrl). */
export function eventShortcut(e: KeyboardEvent | React.KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  const k = e.key.toLowerCase()
  // Shift sozinho em letra já vem maiúsculo: normaliza.
  parts.push(k === ' ' ? 'space' : k)
  return parts.join('+')
}

/** Rótulo bonito: "ctrl+shift+enter" -> "Ctrl+Shift+Enter". */
export function formatShortcut(s: string): string {
  const named: Record<string, string> = {
    ctrl: 'Ctrl',
    shift: 'Shift',
    alt: 'Alt',
    meta: 'Meta',
    space: 'Space',
    enter: 'Enter',
    escape: 'Esc',
    esc: 'Esc',
    tab: 'Tab',
    backspace: 'Backspace',
    delete: 'Del',
    up: '↑',
    down: '↓',
    left: '←',
    right: '→',
    home: 'Home',
    end: 'End',
    pageup: 'PgUp',
    pagedown: 'PgDn',
    insert: 'Ins'
  }
  return s
    .split('+')
    .map((p) => {
      const k = p.toLowerCase()
      if (named[k]) return named[k]
      // Mantém o acento grave (ctrl+`) e capitaliza letras e teclas com número (f4).
      if (k.length === 1) return p === ' ' ? 'Space' : p.toUpperCase()
      return /^f\d{1,2}$/.test(k) ? `F${k.slice(1)}` : p
    })
    .join('+')
}

/** Ações que disputam o mesmo atalho (normalizado, sem caixa). */
export function findShortcutConflicts(
  map: Record<ShortcutAction, string>
): Record<ShortcutAction, ShortcutAction[]> {
  const byKey = new Map<string, ShortcutAction[]>()
  for (const a of Object.keys(map) as ShortcutAction[]) {
    const key = map[a].trim().toLowerCase()
    if (!key) continue
    byKey.set(key, [...(byKey.get(key) ?? []), a])
  }
  const out = {} as Record<ShortcutAction, ShortcutAction[]>
  for (const a of Object.keys(map) as ShortcutAction[]) out[a] = []
  for (const group of byKey.values()) {
    if (group.length < 2) continue
    for (const a of group) out[a] = group.filter((x) => x !== a)
  }
  return out
}

/** true quando o atalho da ação difere do padrão. */
export function isCustomShortcut(action: ShortcutAction, map: Record<ShortcutAction, string>): boolean {
  return map[action].trim().toLowerCase() !== SHORTCUT_DEFAULTS[action]
}
