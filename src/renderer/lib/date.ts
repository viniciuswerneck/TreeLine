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

/**
 * Data/hora local no formato do idioma da UI (ex.: `01/01/2026 08:23` em
 * pt/es, `01/01/2026 08:23 AM` em en). O `Intl` decide ordem (dia/mês vs
 * mês/dia) e relógio (24h vs 12h) a partir do locale. Cai para o pedaço ISO
 * se a data for inválida.
 */
export function formatDateTime(iso: string, lang: Lang): string {
  const key = `${lang}\u0000${iso}`
  const cached = textCache.get(key)
  if (cached !== undefined) return cached
  const t = new Date(iso)
  let out: string
  if (Number.isNaN(t.getTime())) {
    out = iso.slice(0, 16).replace('T', ' ')
  } else {
    const f = fmt(lang)
    // Junta data e hora com espaço (o Intl colocaria ", " entre as duas).
    out = `${f.date.format(t)} ${f.time.format(t)}`
  }
  if (textCache.size >= CACHE_MAX) textCache.clear()
  textCache.set(key, out)
  return out
}
