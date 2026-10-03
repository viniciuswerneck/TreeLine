import { Check, Palette } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '../store'
import { THEMES } from '../themes'

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <div className="theme-group-title">{title}</div>
      {children}
    </>
  )
}

/** Botão de tema na toolbar com menu de 10 temas + System. */
export default function ThemeMenu() {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const tr = useStore((s) => s.tr)
  const [open, setOpen] = useState(false)

  const pick = (id: string): void => {
    setTheme(id)
    setOpen(false)
  }

  const row = (id: string, name: string): React.ReactNode => (
    <button
      key={id}
      className="theme-row"
      aria-selected={theme === id}
      onClick={() => pick(id)}
    >
      <span className={`theme-swatch theme-swatch-${id}`} aria-hidden="true" />
      <span className="grow">{name}</span>
      {theme === id && <Check size={14} />}
    </button>
  )

  return (
    <div className="theme-menu-wrap">
      <button
        className="tool-btn"
        title={tr('toolbar.colorTheme')}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Palette size={15} /> {tr('toolbar.theme')}
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="theme-menu" role="menu">
            <Group title={tr('theme.system')}>{row('system', tr('theme.system'))}</Group>
            <Group title={tr('theme.light')}>
              {THEMES.filter((t) => t.mode === 'light').map((t) => row(t.id, t.name))}
            </Group>
            <Group title={tr('theme.dark')}>
              {THEMES.filter((t) => t.mode === 'dark').map((t) => row(t.id, t.name))}
            </Group>
          </div>
        </>
      )}
    </div>
  )
}
