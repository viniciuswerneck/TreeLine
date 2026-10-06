import { ChevronDown, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../store'

const SHOW_REMOTES_KEY = 'treeline-show-remote-branches'

/**
 * Combo de branches do history (estilo Git Graph): seleção múltipla com busca
 * incremental enquanto digita, agrupamento local/remoto e checkbox para
 * exibir branches remotos. A seleção vira `branchSel` no store e é enviada
 * ao `git log` como refs qualificados (vazio = todos).
 */
export default function BranchCombo() {
  const tr = useStore((s) => s.tr)
  const branches = useStore((s) => s.branches)
  const remoteBranches = useStore((s) => s.remoteBranches)
  const branchSel = useStore((s) => s.branchSel)
  const setBranchSel = useStore((s) => s.setBranchSel)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [showRemotes, setShowRemotes] = useState(() => {
    try {
      return localStorage.getItem(SHOW_REMOTES_KEY) === '1'
    } catch {
      return false
    }
  })
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Fecha com clique fora e com Esc (o painel fica sobre a lista de commits).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const selected = useMemo(() => new Set(branchSel), [branchSel])
  const q = query.trim().toLowerCase()
  const locals = useMemo(() => {
    const list = branches.filter((b) => !q || b.name.toLowerCase().includes(q))
    // Branch atual primeiro (é o que o usuário quer marcar), resto alfabético.
    return [...list].sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name))
  }, [branches, q])
  const remotes = useMemo(
    () =>
      remoteBranches.filter(
        (r) => (!q || r.name.toLowerCase().includes(q)) && (showRemotes || selected.has(r.name))
      ),
    [remoteBranches, q, showRemotes, selected]
  )

  const toggle = (name: string): void => {
    const next = new Set(selected)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    void setBranchSel([...next])
  }

  const label =
    branchSel.length === 0
      ? tr('hist.allBranches')
      : branchSel.length <= 2
        ? branchSel.join(', ')
        : `${branchSel.slice(0, 2).join(', ')} +${branchSel.length - 2}`

  const row = (name: string, current: boolean, remote: boolean): ReactNode => (
    <label
      key={name}
      className={`bc-item${remote ? ' remote' : ''}`}
      title={remote ? `refs/remotes/${name}` : `refs/heads/${name}`}
    >
      <input type="checkbox" checked={selected.has(name)} onChange={() => toggle(name)} />
      <span className="bc-name">{name}</span>
      {current && <span className="ref-badge head">HEAD</span>}
    </label>
  )

  return (
    <div className="branch-combo" ref={rootRef}>
      <button
        type="button"
        className={`branch-combo-btn${open ? ' open' : ''}`}
        title={tr('hist.branchesTitle')}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o)
          setQuery('')
        }}
      >
        <span className="bc-label">
          {tr('hist.branches')}: {label}
        </span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="branch-combo-panel">
          <span className="bc-search">
            <Search size={13} />
            <input
              ref={searchRef}
              autoFocus
              placeholder={tr('hist.branchesPh')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </span>
          <label className="bc-check">
            <input
              type="checkbox"
              checked={showRemotes}
              onChange={(e) => {
                setShowRemotes(e.target.checked)
                try {
                  localStorage.setItem(SHOW_REMOTES_KEY, e.target.checked ? '1' : '0')
                } catch {
                  /* ignora */
                }
              }}
            />
            <span>{tr('hist.showRemotes')}</span>
          </label>
          <div className="bc-list">
            {locals.length > 0 && <div className="bc-group">{tr('hist.groupLocal')}</div>}
            {locals.map((b) => row(b.name, b.current, false))}
            {remotes.length > 0 && <div className="bc-group">{tr('hist.groupRemote')}</div>}
            {remotes.map((r) => row(r.name, false, true))}
            {locals.length === 0 && remotes.length === 0 && (
              <div className="bc-empty">{tr('hist.branchNone')}</div>
            )}
          </div>
          <div className="bc-foot">
            <span className="bc-count">{tr('hist.selN', { n: branchSel.length })}</span>
            <button
              type="button"
              className="mini-btn primary"
              disabled={branchSel.length === 0}
              onClick={() => void setBranchSel([])}
            >
              {tr('hist.allBranches')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
