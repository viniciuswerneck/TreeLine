import { X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useStore } from '../store'

/** Abas de repositórios (multi-repo): troca rápida, fecha sem desmarcar, arrastar para reordenar. */
export default function TabBar() {
  const openTabs = useStore((s) => s.openTabs)
  const current = useStore((s) => s.current)
  const selectRepo = useStore((s) => s.selectRepo)
  const closeTab = useStore((s) => s.closeTab)
  const moveTab = useStore((s) => s.moveTab)
  const tr = useStore((s) => s.tr)

  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  // Ref síncrono: o drop pode chegar antes do commit do state.
  const dragRef = useRef<string | null>(null)

  // Tabs navegáveis por teclado (padrão WAI-ARIA): roving tabindex + setas.
  const tabKeyDown = (e: React.KeyboardEvent, t: string): void => {
    const i = openTabs.indexOf(t)
    let j = -1
    if (e.key === 'ArrowRight') j = (i + 1) % openTabs.length
    else if (e.key === 'ArrowLeft') j = (i - 1 + openTabs.length) % openTabs.length
    else if (e.key === 'Home') j = 0
    else if (e.key === 'End') j = openTabs.length - 1
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (t !== current) void selectRepo(t)
      return
    } else return
    e.preventDefault()
    const next = openTabs[j]
    if (next === undefined) return
    // Ativação automática (como VS Code) + foca a aba depois do render.
    void selectRepo(next)
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`.tab[data-repo="${CSS.escape(next)}"]`)?.focus()
    })
  }

  if (openTabs.length === 0) return null
  return (
    <div className="tabbar" role="tablist" aria-label="Repositories">
      {openTabs.map((t) => {
        const active = t === current
        return (
          <div
            key={t}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            data-repo={t}
            draggable
            className={`tab${active ? ' active' : ''}${drag === t ? ' dragging' : ''}${over === t && drag !== t ? ' drop-target' : ''}`}
            title={t}
            onClick={() => {
              if (!active) void selectRepo(t)
            }}
            onKeyDown={(e) => tabKeyDown(e, t)}
            onDragStart={(e) => {
              dragRef.current = t
              setDrag(t)
              e.dataTransfer.effectAllowed = 'move'
              // Firefox exige dado para iniciar o drag.
              e.dataTransfer.setData('text/plain', t)
            }}
            onDragOver={(e) => {
              const from = dragRef.current
              if (!from || from === t) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setOver(t)
            }}
            onDragLeave={() => setOver((o) => (o === t ? null : o))}
            onDrop={(e) => {
              e.preventDefault()
              const from = dragRef.current
              if (from && from !== t) moveTab(from, t)
              dragRef.current = null
              setDrag(null)
              setOver(null)
            }}
            onDragEnd={() => {
              dragRef.current = null
              setDrag(null)
              setOver(null)
            }}
          >
            <span className="tab-name">{t.split('/').pop() ?? t}</span>
            <button
              className="tab-x"
              title={tr('tabs.close')}
              onClick={(e) => {
                e.stopPropagation()
                void closeTab(t)
              }}
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}