import { useEffect, useMemo, useRef, useState } from 'react'
import { CaseSensitive, Cloud, FileCode, GitBranch, LoaderCircle, Regex, Search, X } from 'lucide-react'
import { useStore } from '../store'
import { useFocusTrap } from '../lib/a11y'
import type { CodeSearchLine, CodeSearchProgress } from '../../shared/types'

interface FlatHit {
  path: string
  line: number
  ref: string
  current: boolean
}

const MAX_LINES_PER_FILE = 50

function hitKey(h: FlatHit): string {
  return `${h.ref}\n${h.path}\n${h.line}`
}

/** Renderiza a linha com `<mark>` na faixa do match (quando houve). */
function LineText({ line }: { line: CodeSearchLine }) {
  if (line.start < 0 || line.end <= line.start || line.end > line.text.length) {
    return <code className="cs-code">{line.text}</code>
  }
  return (
    <code className="cs-code">
      {line.text.slice(0, line.start)}
      <mark>{line.text.slice(line.start, line.end)}</mark>
      {line.text.slice(line.end)}
    </code>
  )
}

/** Ctrl+Shift+F: busca texto em todos os arquivos por branch (git grep por ref). */
export default function CodeSearchDialog() {
  const current = useStore((s) => s.current)
  const query = useStore((s) => s.csQuery)
  const setQuery = useStore((s) => s.setCsQuery)
  const opts = useStore((s) => s.csOpts)
  const setOpt = useStore((s) => s.setCsOpt)
  const groups = useStore((s) => s.csGroups)
  const changes = useStore((s) => s.csChanges)
  const loading = useStore((s) => s.csLoading)
  const stats = useStore((s) => s.csStats)
  const runCodeSearch = useStore((s) => s.runCodeSearch)
  const applyCsProgress = useStore((s) => s.applyCsProgress)
  const cancelCodeSearch = useStore((s) => s.cancelCodeSearch)
  const closeCodeSearch = useStore((s) => s.closeCodeSearch)
  const openCodeResult = useStore((s) => s.openCodeResult)
  const resetCodeSearch = useStore((s) => s.resetCodeSearch)
  const tr = useStore((s) => s.tr)
  const [index, setIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useFocusTrap(rootRef, true)

  // Progresso incremental do main: grupos/últimas alterações chegam aos poucos.
  useEffect(() => window.treeline.onSearchProgress((p: CodeSearchProgress) => applyCsProgress(p)), [applyCsProgress])

  // Dispara a busca com debounce; query vazia só cancela a atual.
  useEffect(() => {
    if (!current || !query.trim()) {
      void cancelCodeSearch()
      return
    }
    const t = setTimeout(() => void runCodeSearch(), 300)
    return () => clearTimeout(t)
  }, [query, opts, current, runCodeSearch, cancelCodeSearch])

  // Trocou de repo: resultados antigos não servem mais.
  const lastRepo = useRef(current)
  useEffect(() => {
    if (lastRepo.current === current) return
    lastRepo.current = current
    resetCodeSearch()
  }, [current, resetCodeSearch])

  const flat = useMemo<FlatHit[]>(
    () =>
      groups.flatMap((g) => g.files.flatMap((f) => f.lines.map((l) => ({ path: l.path, line: l.line, ref: g.ref, current: g.current })))),
    [groups]
  )
  useEffect(() => setIndex(0), [groups])

  const active = flat.length > 0 ? flat[Math.min(index, flat.length - 1)] : undefined

  useEffect(() => {
    listRef.current?.querySelector('.cs-line.active')?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const execOpen = (h: FlatHit | undefined): void => {
    if (!h) return
    void openCodeResult(h.path, h.ref, h.current)
  }

  return (
    <div className="palette-backdrop" onClick={() => closeCodeSearch()}>
      <div
        ref={rootRef}
        className="palette csdialog"
        role="dialog"
        aria-modal="true"
        aria-label="code-search"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cs-input">
          <Search size={14} className="cs-search-icon" aria-hidden />
          <input
            autoFocus
            value={query}
            placeholder={tr('cs.placeholder')}
            aria-label={tr('cs.placeholder')}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                if (flat.length > 0) setIndex((i) => Math.min(i + 1, flat.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                if (flat.length > 0) setIndex((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                execOpen(active)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                if (query) setQuery('')
                else closeCodeSearch()
              }
            }}
          />
          <button
            type="button"
            className={opts.caseSensitive ? 'cs-toggle on' : 'cs-toggle'}
            aria-pressed={opts.caseSensitive}
            title={tr('cs.case')}
            onClick={() => setOpt('caseSensitive', !opts.caseSensitive)}
          >
            <CaseSensitive size={15} />
          </button>
          <button
            type="button"
            className={opts.regex ? 'cs-toggle on' : 'cs-toggle'}
            aria-pressed={opts.regex}
            title={tr('cs.regex')}
            onClick={() => setOpt('regex', !opts.regex)}
          >
            <Regex size={14} />
          </button>
          <button
            type="button"
            className={opts.remotes ? 'cs-toggle on' : 'cs-toggle'}
            aria-pressed={opts.remotes}
            title={tr('cs.remotes')}
            onClick={() => setOpt('remotes', !opts.remotes)}
          >
            <Cloud size={14} />
          </button>
          <button type="button" className="cs-toggle" title={tr('cs.close')} aria-label={tr('cs.close')} onClick={() => closeCodeSearch()}>
            <X size={15} />
          </button>
        </div>

        <div className="cs-meta">
          {loading ? (
            <span className="cs-loading">
              <LoaderCircle size={12} className="spin" aria-hidden /> {tr('cs.searching')}
            </span>
          ) : stats?.error ? (
            <span className="cs-error" role="alert">
              {tr('cs.error', { msg: stats.error })}
            </span>
          ) : stats ? (
            <span>{tr('cs.results', { n: stats.totalHits, b: stats.branches })}</span>
          ) : null}
          {!loading && stats?.truncated && <span className="cs-warn">{tr('cs.truncated')}</span>}
        </div>

        <div className="cs-list" ref={listRef}>
          {!query.trim() ? (
            <p className="palette-empty">{tr('cs.noQuery')}</p>
          ) : groups.length === 0 && !loading ? (
            <p className="palette-empty">{tr('cs.noResults')}</p>
          ) : (
            groups.map((g) => (
              <div key={g.ref} className="cs-group">
                <div className="cs-branch">
                  <GitBranch size={13} aria-hidden />
                  <span className="cs-branch-name">{g.ref}</span>
                  {g.current && <span className="cs-badge">{tr('cs.current')}</span>}
                  {g.remote && <span className="cs-badge remote">{tr('cs.remote')}</span>}
                  <span className="grow" />
                  <span className="cs-count">{g.hits}</span>
                </div>
                {g.files.map((f) => {
                  const ch = changes[f.path]
                  return (
                    <div key={f.path} className="cs-file">
                      <button type="button" className="cs-file-head" onClick={() => void openCodeResult(f.path, g.ref, g.current)}>
                        <FileCode size={13} aria-hidden />
                        <span className="cs-path">{f.path}</span>
                        <span className="cs-count">{f.total}</span>
                      </button>
                      {ch && (
                        <span className="cs-change" title={ch.subject}>
                          {ch.hash} · {ch.author} · {ch.date.slice(0, 10)}
                          {ch.ref ? ` · ${ch.ref}` : ''}
                        </span>
                      )}
                      {f.lines.slice(0, MAX_LINES_PER_FILE).map((l) => {
                        const h: FlatHit = { path: l.path, line: l.line, ref: g.ref, current: g.current }
                        return (
                          <div
                            key={`${f.path}:${l.line}`}
                            className={active && hitKey(active) === hitKey(h) ? 'cs-line active' : 'cs-line'}
                            onClick={() => execOpen(h)}
                            onMouseEnter={() => {
                              const i = flat.findIndex((x) => hitKey(x) === hitKey(h))
                              if (i >= 0) setIndex(i)
                            }}
                          >
                            <span className="cs-ln">{l.line}</span>
                            <LineText line={l} />
                          </div>
                        )
                      })}
                      {f.lines.length > MAX_LINES_PER_FILE && (
                        <div className="cs-more">{tr('cs.more', { n: f.lines.length - MAX_LINES_PER_FILE })}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="cs-hint">{tr('cs.hint')}</div>
      </div>
    </div>
  )
}
