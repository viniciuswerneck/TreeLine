/**
 * Converte sequências ANSI (SGR) em HTML seguro para exibir saída de
 * comandos no Custom Actions. Usado com dangerouslySetInnerHTML, então
 * todo texto é escapado — apenas as tags geradas aqui entram no output.
 */

const ESC = '\u001b'
const BEL = '\u0007'
// eslint-disable-next-line no-control-regex
const SGR_RE = new RegExp(`${ESC}\\[([0-9;]*)m`, 'g')
// OSC (hyperlinks, títulos) é descartado: BEL ou ST finalizam a sequência.
const OTHER_ESC_RE = new RegExp(`${ESC}\\][^${BEL}]*(?:${BEL}(?:${ESC}\\\\)?|${ESC}\\\\)`, 'g')
// ST isolado (terminador de hyperlink sem OSC aberto).
const ST_RE = new RegExp(`${ESC}\\\\`, 'g')
// Qualquer CSI; o replacer mantém só as que terminam em 'm' (SGR).
const CSI_RE = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, 'g')

/** Remove sequências de escape que não são SGR (cursor, limpar tela, OSC). */
function stripNonSgr(s: string): string {
  return s
    .replace(CSI_RE, (m) => (m.endsWith('m') ? m : ''))
    .replace(OTHER_ESC_RE, '')
    .replace(ST_RE, '')
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface Style {
  fg: string | null
  bg: string | null
  bold: boolean
  dim: boolean
  italic: boolean
  underline: boolean
  strike: boolean
}

const BASE: Style = { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false, strike: false }

const FG_BRIGHT = {
  90: '#8b949e', 91: '#ff7b72', 92: '#3fb950', 93: '#d29922', 94: '#58a6ff', 95: '#bc8cff', 96: '#39c5cf', 97: '#f0f6fc'
}
const FG = {
  30: '#484f58', 31: '#ff7b72', 32: '#3fb950', 33: '#d29922', 34: '#58a6ff', 35: '#bc8cff', 36: '#39c5cf', 37: '#b1bac4'
}
const BG = {
  40: '#484f58', 41: '#ff7b72', 42: '#3fb950', 43: '#d29922', 44: '#58a6ff', 45: '#bc8cff', 46: '#39c5cf', 47: '#b1bac4'
}
const BG_BRIGHT = {
  100: '#484f58', 101: '#ff7b72', 102: '#3fb950', 103: '#d29922', 104: '#58a6ff', 105: '#bc8cff', 106: '#39c5cf', 107: '#f0f6fc'
}

function css(style: Style): string {
  const parts: string[] = []
  if (style.fg) parts.push(`color:${style.fg}`)
  if (style.bg) parts.push(`background-color:${style.bg}`)
  if (style.bold) parts.push('font-weight:600')
  if (style.dim) parts.push('opacity:.7')
  if (style.italic) parts.push('font-style:italic')
  const deco: string[] = []
  if (style.underline) deco.push('underline')
  if (style.strike) deco.push('line-through')
  if (deco.length) parts.push(`text-decoration:${deco.join(' ')}`)
  return parts.join(';')
}

function applyCodes(style: Style, codes: number[]): Style {
  const s: Style = { ...style }
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i]
    if (c === 0) Object.assign(s, BASE)
    else if (c === 1) s.bold = true
    else if (c === 2) s.dim = true
    else if (c === 3) s.italic = true
    else if (c === 4) s.underline = true
    else if (c === 9) s.strike = true
    else if (c === 22) { s.bold = false; s.dim = false }
    else if (c === 23) s.italic = false
    else if (c === 24) s.underline = false
    else if (c === 29) s.strike = false
    else if (c === 39) s.fg = null
    else if (c === 49) s.bg = null
    else if (c === 38 || c === 48) {
      // 38;5;n (256 cores) ou 38;2;r;g;b (truecolor)
      const target = c === 38 ? 'fg' : 'bg'
      if (codes[i + 1] === 5) {
        const n = codes[i + 2]
        if (typeof n === 'number') s[target] = xterm256(n)
        i += 2
      } else if (codes[i + 1] === 2) {
        const [r, g, b] = [codes[i + 2], codes[i + 3], codes[i + 4]]
        if (typeof r === 'number' && typeof g === 'number' && typeof b === 'number') {
          s[target] = `rgb(${r},${g},${b})`
        }
        i += 4
      }
    } else {
      const f = FG[c as keyof typeof FG]
      const fb = FG_BRIGHT[c as keyof typeof FG_BRIGHT]
      const b = BG[c as keyof typeof BG]
      const bb = BG_BRIGHT[c as keyof typeof BG_BRIGHT]
      if (f) s.fg = f
      else if (fb) s.fg = fb
      else if (b) s.bg = b
      else if (bb) s.bg = bb
    }
  }
  return s
}

function xterm256(n: number): string {
  if (n < 8) return FG[(30 + n) as 30] ?? '#b1bac4'
  if (n < 16) return FG_BRIGHT[(90 + n - 8) as 90] ?? '#f0f6fc'
  if (n < 232) {
    const i = n - 16
    const steps = [0, 95, 135, 175, 215, 255]
    return `rgb(${steps[Math.floor(i / 36) % 6]},${steps[Math.floor(i / 6) % 6]},${steps[i % 6]})`
  }
  const v = 8 + (n - 232) * 10
  return `rgb(${v},${v},${v})`
}

/** Converte texto com códigos ANSI em HTML escapado com <span> coloridos. */
export function ansiToHtml(input: string): string {
  const text = input.replace(OTHER_ESC_RE, '')
  let out = ''
  let style: Style = { ...BASE }
  let last = 0
  SGR_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = SGR_RE.exec(text)) !== null) {
    const chunk = stripNonSgr(text.slice(last, m.index))
    if (chunk) out += wrap(chunk, style)
    const codes = m[1] === '' ? [0] : m[1].split(';').map((n) => Number(n) || 0)
    style = applyCodes(style, codes)
    last = m.index + m[0].length
  }
  const tail = stripNonSgr(text.slice(last))
  if (tail) out += wrap(tail, style)
  return out
}

function wrap(chunk: string, style: Style): string {
  const safe = escapeHtml(chunk)
  const decl = css(style)
  return decl ? `<span style="${decl}">${safe}</span>` : safe
}