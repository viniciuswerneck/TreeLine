import { useEffect, type RefObject } from 'react'

/**
 * Acessibilidade (Parte 5 do plano de ação).
 *
 * - `useFocusTrap`: Tab circula só dentro do overlay e o foco volta para o
 *   elemento que abriu quando ele fecha.
 * - Memória do "elemento de origem": clicar em uma `div` (linha do histórico,
 *   row da sidebar) não move o foco, então o último foco FORA de um overlay é
 *   registrado no `focusin` e usado como fallback no fechamento.
 */

const FOCUSABLE_SEL =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

/** Overlays cujo foco não deve sobrescrever o elemento de origem. */
const OVERLAY_SEL = '.modal-backdrop, .cr-overlay, .palette-backdrop, .ctx-menu'

let lastOutside: HTMLElement | null = null
let tracking = false

function startTracking(): void {
  if (tracking || typeof document === 'undefined') return
  tracking = true
  document.addEventListener('focusin', (e) => {
    const el = e.target as HTMLElement | null
    if (!el || el === document.body || el.closest(OVERLAY_SEL)) return
    lastOutside = el
  })
}

/** Elementos focáveis e visíveis, em ordem de tabulação. */
export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SEL)).filter(
    (el) => el.getClientRects().length > 0
  )
}

/**
 * Prende o Tab dentro de `ref.current` e devolve o foco ao abrir/fechar.
 * `active` liga/desliga sem desmontar o componente (paletas e resolvedor
 * ficam montados e só renderizam o overlay quando abertos).
 *
 * O foco inicial vai para `[data-autofocus]` — ou para o próprio container
 * (Tab daí cai no primeiro controle). Se o foco JÁ está dentro (autoFocus do
 * React), não mexe: nesse caso o elemento de origem vem da memória.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    if (!active) return
    startTracking()
    const node = ref.current
    if (!node) return

    const ae = document.activeElement as HTMLElement | null
    const inside = !!ae && ae !== document.body && node.contains(ae)
    const opener = !inside && ae && ae !== document.body ? ae : lastOutside

    if (!inside) {
      const preferred = node.querySelector<HTMLElement>('[data-autofocus]')
      const target = preferred ?? node
      if (target === node && !node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1')
      target.focus()
    }

    const onKey = (e: KeyboardEvent): void => {
      // `defaultPrevented`: CodeMirror (indentWithTab) e afins já trataram.
      if (e.key !== 'Tab' || e.defaultPrevented) return
      const items = focusables(node)
      if (items.length === 0) {
        e.preventDefault()
        node.focus()
        return
      }
      const first = items[0] as HTMLElement
      const last = items[items.length - 1] as HTMLElement
      const cur = document.activeElement as HTMLElement | null
      const inTrap = !!cur && node.contains(cur)
      if (e.shiftKey) {
        if (!inTrap || cur === node || cur === first) {
          e.preventDefault()
          last.focus()
        }
      } else if (!inTrap || cur === last) {
        e.preventDefault()
        first.focus()
      }
    }
    node.addEventListener('keydown', onKey)

    return () => {
      node.removeEventListener('keydown', onKey)
      const back =
        opener && opener.isConnected && opener !== document.body
          ? opener
          : lastOutside && lastOutside.isConnected
            ? lastOutside
            : null
      back?.focus()
    }
  }, [ref, active])
}
