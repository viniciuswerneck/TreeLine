// 12 temas próprios do TreeLine (6 light + 6 dark) + modo System.
// Tokens em `styles.css` via `:root[data-theme="id"]`.
export interface ThemeOption {
  id: string
  name: string
  mode: 'light' | 'dark' | 'system'
}

export const THEMES: ThemeOption[] = [
  { id: 'system', name: 'System', mode: 'system' },
  { id: 'treeline-light', name: 'TreeLine Light', mode: 'light' },
  { id: 'paper', name: 'Paper', mode: 'light' },
  { id: 'sandstone', name: 'Sandstone', mode: 'light' },
  { id: 'mint', name: 'Mint', mode: 'light' },
  { id: 'sky', name: 'Sky', mode: 'light' },
  { id: 'hc-light', name: 'High Contrast Light', mode: 'light' },
  { id: 'treeline-dark', name: 'TreeLine Dark', mode: 'dark' },
  { id: 'midnight', name: 'Midnight', mode: 'dark' },
  { id: 'forest', name: 'Forest', mode: 'dark' },
  { id: 'graphite', name: 'Graphite', mode: 'dark' },
  { id: 'plum', name: 'Plum', mode: 'dark' },
  { id: 'hc-dark', name: 'High Contrast Dark', mode: 'dark' }
]

const STORAGE_KEY = 'treeline-theme'
const LEGACY_KEY = 'gitnest-theme'
const LEGACY_IDS: Record<string, string> = {
  'gitnest-light': 'treeline-light',
  'gitnest-dark': 'treeline-dark'
}

export function loadTheme(): string {
  for (const key of [STORAGE_KEY, LEGACY_KEY]) {
    try {
      const saved = localStorage.getItem(key)
      if (!saved) continue
      if (THEMES.some((t) => t.id === saved)) return saved
      if (LEGACY_IDS[saved]) return LEGACY_IDS[saved] as string
    } catch {
      /* storage indisponível: tenta a próxima chave */
    }
  }
  return 'system'
}

export function applyTheme(id: string): void {
  if (id === 'system') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', id)
  }
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignora */
  }
}
