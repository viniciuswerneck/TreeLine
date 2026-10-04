// Atalhos remapeáveis do TreeLine (persistidos em localStorage).
// Formato: "ctrl+k", "ctrl+shift+enter", "f5". Modificadores: ctrl/meta (+shift+alt).

export type ShortcutAction = 'palette' | 'sidebar' | 'search' | 'refresh' | 'commit' | 'terminal'

export const SHORTCUT_DEFAULTS: Record<ShortcutAction, string> = {
  palette: 'ctrl+k',
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
  return s
    .split('+')
    .map((p) => (p === 'ctrl' ? 'Ctrl' : p === 'shift' ? 'Shift' : p === 'alt' ? 'Alt' : p === ' ' ? 'Space' : p.length === 1 ? p.toUpperCase() : p))
    .join('+')
}
