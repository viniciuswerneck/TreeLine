import { X } from 'lucide-react'
import { useStore } from '../store'

/** Abas de repositórios (multi-repo): troca rápida + fecha sem desmarcar. */
export default function TabBar() {
  const openTabs = useStore((s) => s.openTabs)
  const current = useStore((s) => s.current)
  const selectRepo = useStore((s) => s.selectRepo)
  const closeTab = useStore((s) => s.closeTab)
  const tr = useStore((s) => s.tr)

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
            className={`tab${active ? ' active' : ''}`}
            title={t}
            onClick={() => {
              if (!active) void selectRepo(t)
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
