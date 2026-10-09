import { useEffect, useMemo, useRef, useState } from 'react'
import type { CustomAction } from '../../shared/types'
import { dialogOps, useStore } from '../store'
import { useFocusTrap } from '../lib/a11y'

interface PalCmd {
  /** id estável quando o label pode repetir (custom actions). */
  id?: string
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
  const [custom, setCustom] = useState<CustomAction[]>([])
  const palRef = useRef<HTMLDivElement>(null)
  useFocusTrap(palRef, paletteOpen)

  useEffect(() => {
    if (paletteOpen) {
      setFilter('')
      setIndex(0)
      window.treeline.getCustomActions().then(setCustom).catch(() => setCustom([]))
    }
  }, [paletteOpen])

  const runCustom = (id: string): void => {
    const st = useStore.getState()
    if (!st.current) return
    // Mesmo contexto do dialog: tokens {{repo}}, {{branch}}, {{file}}, {{commit}}.
    void window.treeline
      .runCustomAction(st.current, id, {
        repo: st.current,
        branch: st.status?.branch || undefined,
        file: st.selectedFile?.path || undefined,
        commit: st.selectedCommit || undefined
      })
      .catch(() => undefined)
  }

  const commands: PalCmd[] = useMemo(
    () => [
      { label: tr('pal.push'), hint: 'sync', run: doPush },
      { label: tr('pal.pull'), hint: 'sync', run: doPull },
      { label: tr('pal.fetch'), hint: 'sync', run: doFetch },
      { label: tr('menu.pushLease'), hint: 'sync', run: doPushForce },
      { label: tr('det.stageAll'), hint: 'stage', run: stageAll },
      { label: tr('det.unstageAll'), hint: 'stage', run: unstageAll },
      { label: tr('pal.branch'), hint: 'dialog', run: () => openDlg('branch') },
      { label: tr('pal.merge'), hint: 'dialog', run: () => openDlg('merge') },
      { label: tr('pal.stash'), hint: 'dialog', run: () => openDlg('stash') },
      { label: tr('pal.tag'), hint: 'dialog', run: () => openDlg('tag') },
      { label: tr('pal.rebase'), hint: 'dialog', run: () => openDlg('rebase') },
      { label: tr('pal.cherryPick'), hint: 'dialog', run: () => openDlg('pick') },
      { label: tr('pal.flow'), hint: 'dialog', run: () => openDlg('flow') },
      { label: tr('pal.reflog'), hint: 'dialog', run: () => openDlg('reflog') },
      { label: tr('pal.remotes'), hint: 'dialog', run: () => openDlg('remotes') },
      { label: tr('pal.reset'), hint: 'dialog', run: () => openDlg('reset') },
      { label: tr('pal.rebaseInteractive'), hint: 'dialog', run: () => openDlg('rebaseInteractive') },
      { label: tr('pal.codeSearch'), hint: 'dialog', run: () => openDlg('codeSearch') },
      { label: tr('pal.openPR'), hint: 'remote', run: dialogOps.openPR },
      { label: tr('pal.terminal'), hint: 'view', run: toggleTerminal },
      { label: tr('pal.about'), hint: 'view', run: () => openDlg('about') },
      { label: tr('pal.toggleSidebar'), hint: 'view', run: toggleSidebar },
      { label: tr('pal.customActions'), hint: 'view', run: () => openDlg('custom') },
      // id no key: dois custom actions podem ter o mesmo nome.
      ...custom.map((a) => ({ id: `custom:${a.id}`, label: `▶ ${a.name}`, hint: 'custom', run: () => runCustom(a.id) })),
      { label: tr('pal.settings'), hint: 'view', run: openSettings },
      { label: tr('common.refresh'), hint: 'view', run: refresh },
    ],
    [custom, doFetch, doPull, doPush, doPushForce, lang, openDlg, openSettings, refresh, stageAll, toggleSidebar, toggleTerminal, tr, unstageAll]
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
      <div
        ref={palRef}
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="palette"
        onClick={(e) => e.stopPropagation()}
      >
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
              if (filter) {
                e.preventDefault()
                setFilter('')
                setIndex(0)
              } else {
                setPalette(false)
              }
            }
          }}
        />
        {filtered.length === 0 ? (
          <p className="muted">{tr('pal.empty')}</p>
        ) : (
          <div className="palette-list">
            {filtered.map((cmd, i) => (
              <button
                key={cmd.id ?? cmd.label}
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
