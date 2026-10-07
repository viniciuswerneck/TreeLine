import { FileText } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'

/** Ctrl+P: busca rápida de arquivos (rastreados + working tree) e abre histórico. */
export default function GoToFile() {
  const open = useStore((s) => s.gotoFileOpen)
  const setOpen = useStore((s) => s.setGoToFileOpen)
  const list = useStore((s) => s.gotoFileList)
  const loadFileHistory = useStore((s) => s.loadFileHistory)
  const openDlg = useStore((s) => s.openDlg)
  const tr = useStore((s) => s.tr)
  const [filter, setFilter] = useState('')
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (open) {
      setFilter('')
      setIndex(0)
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = filter.toLowerCase()
    if (!q) return list.slice(0, 50)
    return list.filter((p) => p.toLowerCase().includes(q)).slice(0, 40)
  }, [list, filter])

  const exec = (p: string | undefined): void => {
    if (!p) return
    setOpen(false)
    void loadFileHistory(p).then(() => openDlg('fileHistory'))
  }

  if (!open) return null

  return (
    <div className="palette-backdrop" onClick={() => setOpen(false)}>
      <div className="palette" role="dialog" aria-label="goto-file" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder={tr('pal.gotoFile')}
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
              setOpen(false)
            }
          }}
        />
        {filtered.length === 0 ? (
          <p className="muted">{tr('goto.empty')}</p>
        ) : (
          <div className="palette-list">
            {filtered.map((p: string, i: number) => (
              <button
                key={p}
                className={i === index ? 'palette-item active' : 'palette-item'}
                onClick={() => exec(p)}
                onMouseEnter={() => setIndex(i)}
              >
                <FileText size={14} />
                <span className="grow">{p}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
