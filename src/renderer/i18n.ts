import { en, type DictKey } from './i18n/en'
import { pt } from './i18n/pt'
import { es } from './i18n/es'

// i18n do TreeLine: en/pt/es, sem dependências. `t(lang, key)` com fallback en.
// Idioma inicial: navigator.language; troca no Settings; persiste em localStorage.
export type Lang = 'en' | 'pt' | 'es'

export const LANGS: Array<{ id: Lang; name: string }> = [
  { id: 'en', name: 'English' },
  { id: 'pt', name: 'Português' },
  { id: 'es', name: 'Español' }
]

const STORAGE_KEY = 'treeline-lang'

export function loadLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'pt' || saved === 'es') return saved
  } catch {
    /* segue para detecção */
  }
  try {
    const nav = navigator.language.toLowerCase()
    if (nav.startsWith('pt')) return 'pt'
    if (nav.startsWith('es')) return 'es'
  } catch {
    /* segue para o padrão */
  }
  return 'en'
}

export function applyLang(lang: Lang): void {
  document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* ignora */
  }
}

export type { DictKey }

const DICTS: Record<Lang, Record<DictKey, string>> = { en, pt, es }

/** Tradução com fallback en + interpolação {var}. */
export function t(lang: Lang, key: DictKey, vars?: Record<string, string | number>): string {
  let s: string = DICTS[lang][key] ?? en[key]
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  }
  return s
}

