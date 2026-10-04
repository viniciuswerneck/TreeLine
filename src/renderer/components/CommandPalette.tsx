import { useEffect, useMemo, useState } from 'react'
import { dialogOps, useStore } from '../store'

interface PalCmd {
  label: string
  hint: string
  run: () => void | Promise<unknown>
}

/** Paleta de comandos (Ctrl+K): sync, dialogs, PR, terminal, settings, refresh. */
export default function CommandPalette() {
  const paletteOpen = useStore((s) => s.paletteOpen)
  const setPalette = useStore((s) => s.setPalette)
  const openDlg = useStore((s) => s.openDlg)
  const doPush = useStore((s) => s.doPush)
  const doPull = useStore((s) => s.doPull)
  const doFetch = useStore((s) => s.doFetch)
  const doPushForce = useStore((s) => s.doPushForce)
  const stageAll = useStore((s) => s.stageAll)
  const unstageAll = useStore((s) => s.unstageAll)
  const refresh = useStore((s) => s.refresh)
  const openSettings = useStore((s) => s.openSettings)
  const toggleTerminal = useStore((s) => s.toggleTerminal)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const tr = useStore((s) => s.tr)
  const lang = useStore((s) => s.lang)

  const [filter, setFilter] = useState('')
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (paletteOpen) {
      setFilter('')
      setIndex(0)
    }
  }, [paletteOpen])

  const commands: PalCmd[] = useMemo(
    () => [
      { label: 'Push', hint: 'sync', run: doPush },
      { label: 'Pull', hint: 'sync', run: doPull },
      { label: 'Fetch', hint: 'sync', run: doFetch },
      { label: tr('menu.pushLease'), hint: 'sync', run: doPushForce },
      { label: tr('det.stageAll'), hint: 'stage', run: stageAll },
      { label: tr('det.unstageAll'), hint: 'stage', run: unstageAll },
      { label: 'Branch…', hint: 'dialog', run: () => openDlg('branch') },
      { label: 'Merge…', hint: 'dialog', run: () => openDlg('merge') },
      { label: 'Stash…', hint: 'dialog', run: () => openDlg('stash') },
      { label: 'Tag…', hint: 'dialog', run: () => openDlg('tag') },
      { label: 'Rebase…', hint: 'dialog', run: () => openDlg('rebase') },
      { label: 'Cherry-pick…', hint: 'dialog', run: () => openDlg('pick') },
      { label: 'Flow…', hint: 'dialog', run: () => openDlg('flow') },
      { label: 'Reflog…', hint: 'dialog', run: () => openDlg('reflog') },
      { label: 'Remotes…', hint: 'dialog', run: () => openDlg('remotes') },
      { label: 'Reset…', hint: 'dialog', run: () => openDlg('reset') },
      { label: 'Rebase interactive…', hint: 'dialog', run: () => openDlg('rebaseInteractive') },
      { label: 'Open PR', hint: 'remote', run: dialogOps.openPR },
      { label: 'Terminal', hint: 'view', run: toggleTerminal },
      { label: 'Toggle sidebar', hint: 'view', run: toggleSidebar },
      { label: 'Settings', hint: 'view', run: openSettings },
      { label: 'Refresh', hint: 'view', run: refresh },
    ],
    [doFetch, doPull, doPush, doPushForce, lang, openDlg, openSettings, refresh, stageAll, toggleSidebar, toggleTerminal, tr, unstageAll]
  )

  const filtered = useMemo(() => {
    const q = filter.toLowerCase()
    return commands.filter((c) => c.label.toLowerCase().includes(q))
  }, [commands, filter])

  const exec = (cmd: PalCmd | undefined): void => {
    if (!cmd) return
    setPalette(false)
    void cmd.run()
  }

  if (!paletteOpen) return null

  return (
    <div className="palette-backdrop" onClick={() => setPalette(false)}>
      <div className="palette" role="dialog" aria-label="palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder={tr('pal.ph')}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value)
            setIndex(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIndex((i) => (filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length))
            } else if (e.key === 'Enter') {
              exec(filtered[index])
            } else if (e.key === 'Escape') {
              setPalette(false)
            }
          }}
        />
        {filtered.length === 0 ? (
          <p className="muted">{tr('pal.empty')}</p>
        ) : (
          <div className="palette-list">
            {filtered.map((cmd, i) => (
              <button
                key={cmd.label}
                className={i === index ? 'palette-item active' : 'palette-item'}
                onClick={() => exec(cmd)}
                onMouseEnter={() => setIndex(i)}
              >
                <span>{cmd.label}</span>
                <span className="muted">{cmd.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
