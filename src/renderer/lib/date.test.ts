import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime } from './date'

describe('formatDateTime', () => {
  // Data local (sem `Z`): parse e formatação usam o mesmo fuso, então o
  // resultado não depende do TZ da máquina de CI.
  const iso = '2026-03-04T08:23:00'

  it('pt/es usam dia/mês e relógio de 24h', () => {
    expect(formatDateTime(iso, 'pt')).toBe('04/03/2026 08:23')
    expect(formatDateTime(iso, 'es')).toBe('04/03/2026 08:23')
  })

  it('en usa mês/dia e relógio de 12h', () => {
    expect(formatDateTime(iso, 'en')).toBe('03/04/2026 08:23 AM')
  })

  it('cai para o pedaço ISO quando a data é inválida', () => {
    expect(formatDateTime('nao-e-data', 'pt')).toBe('nao-e-data')
  })
})

describe('formatDate', () => {
  it('mostra só a data no formato do idioma', () => {
    expect(formatDate('2026-03-04T08:23:00', 'pt')).toBe('04/03/2026')
    expect(formatDate('2026-03-04T08:23:00', 'en')).toBe('03/04/2026')
  })

  it('data pura (YYYY-MM-DD) não pula de dia por causa do fuso', () => {
    expect(formatDate('2026-03-04', 'pt')).toBe('04/03/2026')
    expect(formatDate('2026-03-04', 'en')).toBe('03/04/2026')
  })
})
