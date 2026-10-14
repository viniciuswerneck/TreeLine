import type { Lang } from '../i18n'

/** Locale do Intl por idioma da UI. */
const LOCALE: Record<Lang, string> = { en: 'en-US', pt: 'pt-BR', es: 'es-ES' }

interface Formatters {
  date: Intl.DateTimeFormat
  time: Intl.DateTimeFormat
}

const fmtCache = new Map<Lang, Formatters>()

/** Formatadores por idioma (criar `Intl` é caro; a lista virtualizada re-renderiza muito). */
function fmt(lang: Lang): Formatters {
  let f = fmtCache.get(lang)
  if (!f) {
    const locale = LOCALE[lang]
    f = {
      date: new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' }),
      time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })
    }
    fmtCache.set(lang, f)
  }
  return f
}

const textCache = new Map<string, string>()
const CACHE_MAX = 4000

/** `YYYY-MM-DD` puro seria lido como UTC meia-noite (pode pular um dia no fuso). */
function parseIso(iso: string): Date | null {
  const s = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso
  const t = new Date(s)
  return Number.isNaN(t.getTime()) ? null : t
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function render(iso: string, lang: Lang, withTime: boolean): string {
  const key = `${withTime ? 'dt' : 'd'}\u0000${lang}\u0000${iso}`
  const cached = textCache.get(key)
  if (cached !== undefined) return cached
  const t = parseIso(iso)
  let out: string
  if (!t) {
    out = withTime ? iso.slice(0, 16).replace('T', ' ') : iso.slice(0, 10)
  } else if (lang === 'en') {
    const date = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`
    out = withTime ? `${date} ${pad2(t.getHours())}:${pad2(t.getMinutes())}` : date
  } else {
    const f = fmt(lang)
    out = withTime ? `${f.date.format(t)} ${f.time.format(t)}` : f.date.format(t)
  }
  if (textCache.size >= CACHE_MAX) textCache.clear()
  textCache.set(key, out)
  return out
}

/**
 * Data/hora local no formato do idioma da UI. `pt`/`es` usam `Intl`
 * (dia/mês, relógio de 24h → `01/01/2026 08:23`); `en` usa o formato ISO
 * (ano-mês-dia, 24h → `2026-01-01 08:23`). Cai para o pedaço ISO se a data
 * for inválida.
 */
export function formatDateTime(iso: string, lang: Lang): string {
  return render(iso, lang, true)
}

/** Só a data, no formato do idioma da UI (`01/01/2026` em pt/es, `2026-01-01` em en). */
export function formatDate(iso: string, lang: Lang): string {
  return render(iso, lang, false)
}
