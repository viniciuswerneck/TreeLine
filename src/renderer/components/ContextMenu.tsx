import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

export interface MenuItem {
  label: string
  danger?: boolean
  disabled?: boolean
  onClick?: () => void
  sepBefore?: boolean
}

/**
 * Menu de botão direito próprio (temas via CSS): posiciona no cursor,
 * vira para dentro da janela perto das bordas, fecha em clique fora/Esc.
 */
export default function ContextMenu() {
  const menu = useStore((s) => s.menu)
  const closeMenu = useStore((s) => s.closeMenu)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeMenu()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeMenu])

  useEffect(() => {
    if (!menu || !ref.current) return
    const opener = document.activeElement as HTMLElement | null
    const first = ref.current.querySelector<HTMLElement>('.ctx-row:not([disabled])')
    first?.focus()
    return () => {
      if (opener && opener.isConnected && opener !== document.body) opener.focus()
    }
  }, [menu])

  useEffect(() => {
    if (menu && ref.current) {
      const r = ref.current.getBoundingClientRect()
      setPos({
        x: Math.min(menu.x, window.innerWidth - r.width - 8),
        y: Math.min(menu.y, window.innerHeight - r.height - 8)
      })
    }
  }, [menu])

  const menuKeyDown = (e: React.KeyboardEvent): void => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    const rows = Array.from(ref.current?.querySelectorAll<HTMLElement>('.ctx-row:not([disabled])') ?? [])
    if (rows.length === 0) return
    const i = rows.indexOf(document.activeElement as HTMLElement)
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? rows.length - 1
          : e.key === 'ArrowDown'
            ? (i + 1) % rows.length
            : (i - 1 + rows.length) % rows.length
    rows[next]?.focus()
  }

  if (!menu) return null

  return (
    <>
      <div className="menu-backdrop" onClick={closeMenu} onContextMenu={(e) => e.preventDefault()} />
      <div
        ref={ref}
        className="ctx-menu"
        role="menu"
        style={{ left: `${Math.max(8, pos.x)}px`, top: `${Math.max(8, pos.y)}px` }}
        onKeyDown={menuKeyDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        {menu.items.map((item, i) => (
          <div key={i}>
            {item.sepBefore && <div className="ctx-sep" />}
            <button
              className={`ctx-row${item.danger ? ' danger' : ''}`}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                closeMenu()
                item.onClick?.()
              }}
            >
              {item.label}
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
