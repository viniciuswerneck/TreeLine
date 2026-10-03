import { Cloud, GitBranch, RefreshCw, Search, Tag } from 'lucide-react'
import { useMemo } from 'react'
import { DATE_LOCALE } from '../i18n'
import { layoutGraph, type LaneCommit } from '../lib/graph'
import { useStore } from '../store'

/** Largura por lane e altura da linha — espelham o CSS (.history-row height). */
const LANE_W = 16
const ROW_H = 30

/** Paleta por lane, no espírito do Git Graph (azul, rosa, verde, roxo…). */
const LANE_COLORS = [
  '#1f9cff',
  '#ec4899',
  '#22c55e',
  '#a855f7',
  '#f59e0b',
  '#06b6d4',
  '#84cc16',
  '#f97316'
]

const laneColor = (lane: number): string => LANE_COLORS[lane % LANE_COLORS.length] as string
const cx = (lane: number): number => lane * LANE_W + LANE_W / 2

function shortHash(h: string): string {
  return h.slice(0, 7)
}

/** Data absoluta estilo Git Graph ("3 Oct 2026 13:02"). Cai para ISO se inválida. */
function absDate(lang: string, iso: string): string {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return iso.slice(0, 16).replace('T', ' ')
  const date = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(t)
  const time = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', hour12: false }).format(t)
  return `${date} ${time}`
}

/** Cor estável por branch (hash do nome → paleta), como no Git Graph. */
export function branchColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return LANE_COLORS[h % LANE_COLORS.length] as string
}

/** Pílulas de ref (HEAD, branch, remoto, tag). Symrefs como origin/HEAD são ruído: fora. */
export function visibleRefs(refs: string[]): string[] {
  return refs.filter((r) => !r.endsWith('/HEAD'))
}

/** Badge de ref estilo Git Graph: pílula por tipo (HEAD, branch, remoto, tag), com ícone. */
export function RefBadge({ name }: { name: string }) {
  const isHead = name === 'HEAD'
  const isTag = name.startsWith('tag: ')
  const isRemote = !isHead && !isTag && name.includes('/')
  const kind = isHead ? 'head' : isTag ? 'tag' : isRemote ? 'remote' : 'branch'
  const label = isTag ? name.slice('tag: '.length) : name
  const Icon = isHead ? null : isTag ? Tag : isRemote ? Cloud : GitBranch
  const style = kind === 'branch' ? { background: branchColor(label), color: '#fff', borderColor: 'transparent' } : undefined
  return (
    <span className={`ref-badge ${kind}`} title={name} style={style}>
      {Icon && <Icon size={10} />}
      {label}
    </span>
  )
}

/** Grafo estilo Git Graph: linhas curvas coloridas por lane + dot do commit. */
function GraphCell({ commit, maxLane, isFirst }: { commit: LaneCommit; maxLane: number; isFirst: boolean }) {
  const cy = ROW_H / 2
  const color = laneColor(commit.lane)
  const continuesDown =
    commit.parents.length > 0 && !commit.forks.some((f) => f.from === commit.lane && f.to !== commit.lane)

  return (
    <svg className="graph-svg" width={(maxLane + 1) * LANE_W} height={ROW_H} aria-hidden="true">
      {commit.through.map((l) => (
        <line
          key={`t${l}`}
          x1={cx(l)}
          y1={0}
          x2={cx(l)}
          y2={ROW_H}
          stroke={laneColor(l)}
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.8}
        />
      ))}
      {!isFirst && (
        <line x1={cx(commit.lane)} y1={0} x2={cx(commit.lane)} y2={cy} stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0.85} />
      )}
      {continuesDown && (
        <line x1={cx(commit.lane)} y1={cy} x2={cx(commit.lane)} y2={ROW_H} stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0.85} />
      )}
      {commit.forks.map((f, i) => (
        <path
          key={`f${i}`}
          d={`M ${cx(f.from)},${cy} C ${cx(f.from)},${cy + 9} ${cx(f.to)},${ROW_H - 9} ${cx(f.to)},${ROW_H}`}
          stroke={laneColor(f.from)}
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
          opacity={0.85}
        />
      ))}
      <circle
        cx={cx(commit.lane)}
        cy={cy}
        r={commit.parents.length > 1 ? 5.5 : 4.5}
        fill="var(--bg-panel)"
        stroke={color}
        strokeWidth={2}
      />
    </svg>
  )
}

export default function HistoryGraph() {
  const commits = useStore((s) => s.commits)
  const status = useStore((s) => s.status)
  const filter = useStore((s) => s.filter)
  const setFilter = useStore((s) => s.setFilter)
  const branchFilter = useStore((s) => s.branchFilter)
  const selectedCommit = useStore((s) => s.selectedCommit)
  const selectCommit = useStore((s) => s.selectCommit)
  const copyText = useStore((s) => s.copyText)
  const openMenu = useStore((s) => s.openMenu)
  const refresh = useStore((s) => s.refresh)
  const loading = useStore((s) => s.loading)
  const tr = useStore((s) => s.tr)
  const lang = useStore((s) => s.lang)
  const currentBranch = status?.branch ?? ''

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return (c: LaneCommit): boolean => {
      if (branchFilter === 'current' && currentBranch && !c.refs.includes(currentBranch)) {
        // sem info de branch por commit no IPC atual: mantém os que citam o branch ou sem refs
        if (c.refs.length > 0) return false
      }
      if (!q) return true
      return (
        c.message.toLowerCase().includes(q) ||
        c.author.toLowerCase().includes(q) ||
        c.hash.toLowerCase().startsWith(q) ||
        c.refs.some((r) => r.toLowerCase().includes(q))
      )
    }
  }, [filter, branchFilter, currentBranch])

  // Layout SEMPRE sobre a lista completa: filtrar antes quebra a adjacência
  // pai-filho e o alocador abre uma lane nova por linha (staircase).
  // Filtrar depois preserva a coluna original de cada commit.
  const rows = useMemo(() => layoutGraph(commits).filter(visible), [commits, visible])
  const maxLane = useMemo(() => rows.reduce((m, r) => Math.max(m, r.lane, ...r.through, ...r.forks.map((f) => f.to)), 0), [rows])
  // Coluna do grafo encolhe para as lanes usadas (não mais 120–220px fixos).
  const graphCol = `${(maxLane + 1) * LANE_W + 24}px`
  const gridCols = `${graphCol} 1fr 140px 130px 80px`
  const dirtyCount =
    (status?.unstaged.length ?? 0) + (status?.staged.length ?? 0) + (status?.untracked.length ?? 0)

  if (rows.length === 0 && dirtyCount === 0) {
    return (
      <div className="history">
        <div className="welcome">
          <h1>{tr('hist.empty')}</h1>
          <p className="muted">{tr('hist.emptyHint')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="history">
      <div className="history-filter">
        <span className="history-count" title="Commits listed">
          {tr('hist.commits', { n: rows.length })}
        </span>
        {branchFilter === 'current' && currentBranch && (
          <span className="history-count">{tr('hist.onBranch', { n: currentBranch })}</span>
        )}
        <span className="history-search">
          <Search size={14} />
          <input placeholder={tr('hist.filterPh')} value={filter} onChange={(e) => setFilter(e.target.value)} />
        </span>
        <button className="mini-btn" title={`${tr('common.refresh')} (F5)`} onClick={() => void refresh()}>
          <RefreshCw size={13} className={loading ? 'spin' : undefined} /> {tr('common.refresh')}
        </button>
      </div>
      <div className="history-head" style={{ gridTemplateColumns: gridCols }}>
        <span>{tr('hist.graph')}</span>
        <span>{tr('hist.message')}</span>
        <span>{tr('hist.date')}</span>
        <span>{tr('hist.author')}</span>
        <span>{tr('hist.hash')}</span>
      </div>
      {dirtyCount > 0 && (
        <div className="history-row working-copy" style={{ gridTemplateColumns: gridCols }} title={tr('hist.wcTitle')}>
          <span className="graph-cell">
            <span className="graph-wc-dot" />
          </span>
          <span className="msg">
            <strong>{tr('hist.wc')}</strong>
            <span className="muted">
              {' '}
              — {tr('hist.wcChanges', { n: dirtyCount })}
            </span>
          </span>
          <span className="muted">—</span>
          <span className="muted">—</span>
          <span className="mono muted">—</span>
        </div>
      )}
      {rows.map((c, i) => (
        <div
          key={c.hash}
          className="history-row"
          style={{ gridTemplateColumns: gridCols }}
          aria-selected={selectedCommit === c.hash}
          title={`${c.message}\n${c.hash}`}
          onClick={() => void selectCommit(selectedCommit === c.hash ? null : c.hash)}
          onContextMenu={(e) => {
            e.preventDefault()
            void selectCommit(c.hash)
            openMenu(e.clientX, e.clientY, [
              { label: tr('menu.copyHash'), onClick: () => void copyText(c.hash) },
              { label: tr('menu.copyMsg'), onClick: () => void copyText(c.message) },
              { label: tr('menu.copyAuthor'), onClick: () => void copyText(c.author) }
            ])
          }}
        >
          <span className="graph-cell">
            <GraphCell commit={c} maxLane={maxLane} isFirst={i === 0} />
          </span>
          <span className="msg">
            {visibleRefs(c.refs).map((r) => (
              <RefBadge key={r} name={r} />
            ))}
            {c.message}
          </span>
          <span className="muted" title={c.date.slice(0, 16).replace('T', ' ')}>
            {absDate(DATE_LOCALE[lang], c.date)}
          </span>
          <span className="muted">{c.author}</span>
          <span className="mono muted">{shortHash(c.hash)}</span>
        </div>
      ))}
    </div>
  )
}
