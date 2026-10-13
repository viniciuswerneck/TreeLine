const pad = (n: number): string => String(n).padStart(2, '0')

/**
 * Data/hora local no formato `dd/MM/yyyy HH:mm` (ex.: `01/01/2026 08:23`).
 * Sem Intl para o formato ser estável entre locales (a UI usa o mesmo
 * padrão brasileiro em en/pt/es) e barato o bastante para a lista virtualizada.
 * Cai para o pedaço ISO se a data for inválida.
 */
export function formatDateTime(iso: string): string {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return iso.slice(0, 16).replace('T', ' ')
  return `${pad(t.getDate())}/${pad(t.getMonth() + 1)}/${t.getFullYear()} ${pad(t.getHours())}:${pad(t.getMinutes())}`
}
