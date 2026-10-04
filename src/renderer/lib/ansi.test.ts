import { describe, expect, it } from 'vitest'
import { ansiToHtml, escapeHtml } from './ansi'

const ESC = '\u001b'
const BEL = '\u0007'

describe('escapeHtml', () => {
  it('escapa caracteres perigosos', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
    )
    expect(escapeHtml('a & b')).toBe('a &amp; b')
  })
})

describe('ansiToHtml', () => {
  it('devolve texto puro sem escape quando não há ANSI', () => {
    expect(ansiToHtml('npm run lint')).toBe('npm run lint')
  })

  it('aplica cores básicas em span', () => {
    const html = ansiToHtml(`${ESC}[31merror${ESC}[0m ok`)
    expect(html).toContain('<span style="color:#ff7b72">error</span>')
    expect(html).toContain(' ok')
  })

  it('suporta bold, 256 cores e truecolor', () => {
    expect(ansiToHtml(`${ESC}[1mbold${ESC}[0m`)).toContain('font-weight:600')
    expect(ansiToHtml(`${ESC}[38;5;196mred${ESC}[0m`)).toContain('rgb(255,0,0)')
    expect(ansiToHtml(`${ESC}[38;2;10;20;30mrgb${ESC}[0m`)).toContain('rgb(10,20,30)')
  })

  it('mantém estilo até o reset', () => {
    const html = ansiToHtml(`${ESC}[32mgreen`)
    expect(html).toContain('color:#3fb950')
    expect(html).toContain('green')
  })

  it('escapa HTML dentro de segmentos coloridos', () => {
    const html = ansiToHtml(`${ESC}[31m<script>alert(1)</script>${ESC}[0m`)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('descarta sequências não-SGR e OSC de hyperlink', () => {
    expect(ansiToHtml(`${ESC}]8;;http://x${BEL}link${ESC}]8;;${BEL}${ESC}\\`)).toBe('link')
    expect(ansiToHtml(`${ESC}[2Kclean`)).toBe('clean')
  })

  it('trata códigos vazios como reset', () => {
    expect(ansiToHtml(`${ESC}[31mred${ESC}[mplain`)).toContain('<span style="color:#ff7b72">red</span>plain')
  })
})