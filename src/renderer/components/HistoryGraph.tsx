import { Cloud, GitBranch, RefreshCw, Search, Tag } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DATE_LOCALE } from '../i18n'
import { layoutGraph, topTouches, bottomTouches, type LaneCommit } from '../lib/graph'
import { formatShortcut } from '../shortcuts'
import { dialogOps, useStore } from '../store'

/** Largura por lane e altura da linha — espelham o CSS (.history-row height). */
const LANE_W = 16
const ROW_H = 30
// Linhas extras renderizadas fora do viewport (evita linhas em branco).
const OVERSCAN = 10

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

// Intl.DateTimeFormat é caro de construir: cacheia por locale e memoriza
// o texto final por commit (a lista virtualizada re-renderiza as mesmas
// linhas o tempo todo durante o scroll).
const fmtCache = new Map<string, { date: Intl.DateTimeFormat; time: Intl.DateTimeFormat }>()
const dateTextCache = new Map<string, string>()
const DATE_CACHE_MAX = 4000

function formatters(lang: string): { date: Intl.DateTimeFormat; time: Intl.DateTimeFormat } {
  const hit = fmtCache.get(lang)
  if (hit) return hit
  const made = {
    date: new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }),
    time: new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  fmtCache.set(lang, made)
  return made
}

/** Data absoluta estilo Git Graph ("3 Oct 2026 13:02"). Cai para ISO se inválida. */
function absDate(lang: string, iso: string): string {
  const key = `${lang}|${iso}`
  const cached = dateTextCache.get(key)
  if (cached !== undefined) return cached
  const t = new Date(iso)
  let out: string
  if (Number.isNaN(t.getTime())) {
    out = iso.slice(0, 16).replace('T', ' ')
  } else {
    const f = formatters(lang)
    out = `${f.date.format(t)} ${f.time.format(t)}`
  }
  if (dateTextCache.size >= DATE_CACHE_MAX) dateTextCache.clear()
  dateTextCache.set(key, out)
  return out
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

/** Avatar de iniciais com cor estável (sem rede, sem gravatar). */
export function Avatar({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span className="avatar" title={name} style={{ background: branchColor(name) }}>
      {initials || '?'}
    </span>
  )
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

/**
 * Grafo estilo Git Graph: linhas curvas coloridas por lane + dot do commit.
 *
 * Regra de continuidade (acaba com "pontinha pendurada"): cada segmento/curva
 * só é desenhado se a lane toca a borda da linha vizinha visível —
 * `above`/`below` vêm das linhas ao redor (`topTouches`/`bottomTouches`).
 * Lane que nasce aqui (sem trilho acima) começa no dot; lane que morre aqui
 * termina no dot. Trilhos retos de passagem (through) sempre desenham.
 */
function GraphCell({ commit, maxLane, above, below }: { commit: LaneCommit; maxLane: number; above: number[]; below: number[] }) {
  const cy = ROW_H / 2
  const color = laneColor(commit.lane)
  const continuesDown = commit.parents.length > 0

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
      {above.includes(commit.lane) && (
        <line x1={cx(commit.lane)} y1={0} x2={cx(commit.lane)} y2={cy} stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0.85} />
      )}
      {continuesDown && below.includes(commit.lane) && (
        <line x1={cx(commit.lane)} y1={cy} x2={cx(commit.lane)} y2={ROW_H} stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0.85} />
      )}
      {commit.forks.map((f, i) =>
        f.kind === 'split' ? (
          // split: curva sai do dot p/ baixo — só se a lane chega na linha de baixo
          !below.includes(f.to) ? null : (
            <path
              key={`f${i}`}
              d={`M ${cx(f.from)},${cy} C ${cx(f.from)},${cy + 9} ${cx(f.to)},${ROW_H - 9} ${cx(f.to)},${ROW_H}`}
              stroke={laneColor(f.to)}
              strokeWidth={2}
              strokeLinecap="round"
              fill="none"
              opacity={0.85}
            />
          )
        ) : // join: curva entra no dot vindo de cima — só se a lane vem da linha de cima
        !above.includes(f.from) ? null : (
          <path
            key={`f${i}`}
            d={`M ${cx(f.from)},0 C ${cx(f.from)},${cy - 9} ${cx(f.to)},${cy - 9} ${cx(f.to)},${cy}`}
            stroke={laneColor(f.from)}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
            opacity={0.85}
          />
        )
      )}
      <circle
        cx={cx(commit.lane)}
        cy={cy}
        r={commit.parents.length > 1 ? 5.5 : 4.5}
        fill={color}
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
  const compareA = useStore((s) => s.compareA)
  const compareB = useStore((s) => s.compareB)
  const setCompareEnd = useStore((s) => s.setCompareEnd)
  const clearCompare = useStore((s) => s.clearCompare)
  const doRevert = useStore((s) => s.doRevert)
  const openDlg = useStore((s) => s.openDlg)
  const setRefPreset = useStore((s) => s.setRefPreset)
  const headPing = useStore((s) => s.headPing)
  const hasMoreCommits = useStore((s) => s.hasMoreCommits)
  const loadingMore = useStore((s) => s.loadingMore)
  const loadMoreCommits = useStore((s) => s.loadMoreCommits)
  const shortcuts = useStore((s) => s.shortcuts)
  const [headFlash, setHeadFlash] = useState(0)
  const spacerRef = useRef<HTMLDivElement>(null)
  // Geometria do container em cache: evita getBoundingClientRect por scroll
  // (força layout síncrono) e mede só quando a lista muda.
  const contRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef(0)
  const pendingScroll = useRef<number | null>(null)
  const rafRef = useRef(0)
  const [win, setWin] = useState<[number, number]>([0, 40])
  const searchRef = useRef<HTMLInputElement>(null)

  // Após checkout: rola até o novo HEAD e pisca a linha 1.5s.
  useEffect(() => {
    if (headPing === 0) return
    const el = document.querySelector('.history-row .ref-badge.head')?.closest('.history-row')
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setHeadFlash(headPing)
    const t = setTimeout(() => setHeadFlash(0), 1500)
    return () => clearTimeout(t)
  }, [headPing])

  // Atalho de busca (remapeável; não rouba digitação em campos).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (useStore.getState().matchShortcut('search', e)) {
        const ae = document.activeElement as HTMLElement | null
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return (c: LaneCommit): boolean => {
      // Modo current: o servidor já mandou só ancestry do branch; aqui só texto.
      if (!q) return true
      return (
        c.message.toLowerCase().includes(q) ||
        c.author.toLowerCase().includes(q) ||
        c.hash.toLowerCase().includes(q) ||
        c.date.includes(filter.trim()) ||
        c.refs.some((r) => r.toLowerCase().includes(q))
      )
    }
  }, [filter])

  const commitMenu = (e: React.MouseEvent, hash: string, message: string, author: string): void => {
    e.preventDefault()
    void selectCommit(hash)
    openMenu(e.clientX, e.clientY, [
      { label: tr('menu.cherryPickHere'), onClick: () => void dialogOps.cherryPick(hash) },
      { label: tr('menu.revertHere'), onClick: () => void doRevert(hash) },
      { label: tr('menu.resetHere'), onClick: () => openDlg('reset') },
      {
        label: tr('menu.createBranchHere'),
        onClick: () => {
          setRefPreset(hash)
          openDlg('branch')
        }
      },
      {
        label: tr('menu.tagHere'),
        onClick: () => {
          setRefPreset(hash)
          openDlg('tag')
        }
      },
      {
        label: tr('menu.mergeHere'),
        onClick: () => void dialogOps.mergeBranch(hash, false)
      },
      {
        label: tr('menu.rebaseHere'),
        onClick: () => {
          setRefPreset(hash)
          openDlg('rebase')
        }
      },
      {
        label: compareA && compareA !== hash ? tr('cmp.title') : tr('menu.compareWith'),
        onClick: () => {
          void setCompareEnd(hash).then(() => {
            const st = useStore.getState()
            if (st.compareA && st.compareB) openDlg('compare')
          })
        }
      },
      { label: tr('menu.copyHash'), onClick: () => void copyText(hash) },
      { label: tr('menu.copyMsg'), onClick: () => void copyText(message) },
      { label: tr('menu.copyAuthor'), onClick: () => void copyText(author) }
    ])
  }

  // Layout SEMPRE sobre a lista completa: filtrar antes quebra a adjacência
  // pai-filho e o alocador abre uma lane nova por linha (staircase).
  // Filtrar depois preserva a coluna original de cada commit.
  const rows = useMemo(() => layoutGraph(commits).filter(visible), [commits, visible])
  const maxLane = useMemo(() => rows.reduce((m, r) => Math.max(m, r.lane, ...r.through, ...r.forks.map((f) => f.to)), 0), [rows])
  const dirtyCount =
    (status?.unstaged.length ?? 0) + (status?.staged.length ?? 0) + (status?.untracked.length ?? 0)

  // Ao mudar a lista (repo, filtro, página), volta para o topo da janela.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setWin([0, 40]), [rows.length, branchFilter])
  // Recalcula o offset do spacer uma vez por mudança de lista.
  useEffect(() => {
    const cont = contRef.current
    const anchor = spacerRef.current
    offsetRef.current =
      cont && anchor
        ? anchor.getBoundingClientRect().top - cont.getBoundingClientRect().top + cont.scrollTop
        : 0
  }, [rows.length, dirtyCount, branchFilter])
  // Coluna do grafo encolhe para as lanes usadas (não mais 120–220px fixos).
  const graphCol = `${(maxLane + 1) * LANE_W + 24}px`
  const gridCols = `${graphCol} 1fr 140px 130px 80px`
  // Só a fatia visível é renderizada; o resto vira altura de spacer.
  const visibleRows = useMemo(() => rows.slice(win[0], win[1]), [rows, win])

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
    <div
      ref={contRef}
      className="history"
      onScroll={(e) => {
        const cont = e.currentTarget as HTMLElement
        if (cont.scrollHeight - cont.scrollTop - cont.clientHeight < 400) void loadMoreCommits()
        // Coalesce: um update de janela por frame, no máximo.
        pendingScroll.current = cont.scrollTop
        if (rafRef.current) return
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0
          const top0 = pendingScroll.current
          if (top0 === null) return
          const el = contRef.current
          if (!el) return
          const top = Math.max(0, top0 - offsetRef.current)
          const start = Math.max(0, Math.floor(top / ROW_H) - OVERSCAN)
          const end = Math.min(rows.length, Math.ceil((top + el.clientHeight) / ROW_H) + OVERSCAN)
          setWin((prev) => (prev[0] === start && prev[1] === end ? prev : [start, end]))
        })
      }}
    >
      <div className="history-filter">
        <span className="history-count" title="Commits listed">
          {tr('hist.commits', { n: rows.length })}
        </span>
        {branchFilter === 'current' && currentBranch && (
          <span className="history-count">{tr('hist.onBranch', { n: currentBranch })}</span>
        )}
        <span className="history-search">
          <Search size={14} />
          <input
            ref={searchRef}
            placeholder={`${tr('hist.filterPh')} (${formatShortcut(shortcuts.search)})`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </span>
        {(compareA || compareB) && (
          <button
            className="mini-btn"
            title={tr('cmp.clear')}
            onClick={() => clearCompare()}
          >
            {tr('cmp.title')}: {compareA?.slice(0, 7) ?? '…'}…{compareB?.slice(0, 7) ?? '?'} ✕
          </button>
        )}
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
      <div ref={spacerRef} style={{ height: 0 }} />
      {win[0] > 0 && <div style={{ height: win[0] * ROW_H }} />}
      {visibleRows.map((c, k) => {
        const i = win[0] + k
        return (
        <div
          key={c.hash}
          className={`history-row${c.hash === compareA || c.hash === compareB ? ' comparing' : ''}${headFlash > 0 && visibleRefs(c.refs).includes('HEAD') ? ' head-flash' : ''}`}
          style={{ gridTemplateColumns: gridCols }}
          aria-selected={selectedCommit === c.hash}
          title={`${c.message}\n${c.hash}\n${tr('cmp.pickHint')}`}
          onClick={(e) => {
            if (e.ctrlKey || e.metaKey) {
              void setCompareEnd(c.hash).then(() => {
                const st = useStore.getState()
                if (st.compareA && st.compareB) openDlg('compare')
              })
            } else void selectCommit(selectedCommit === c.hash ? null : c.hash)
          }}
          onContextMenu={(e) => commitMenu(e, c.hash, c.message, c.author)}
        >
          <span className="graph-cell">
            <GraphCell
              commit={c}
              maxLane={maxLane}
              above={i === 0 ? [] : bottomTouches(rows[i - 1] as LaneCommit)}
              below={i === rows.length - 1 ? [] : topTouches(rows[i + 1] as LaneCommit)}
            />
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
          <span className="muted author-cell" title={c.author}>
            <Avatar name={c.author} />
            <span className="author-name">{c.author}</span>
          </span>
          <span className="mono muted">{shortHash(c.hash)}</span>
        </div>
        )
      })}
      {win[1] < rows.length && <div style={{ height: (rows.length - win[1]) * ROW_H }} />}
      {hasMoreCommits && (
        <div className="history-more">
          <button className="mini-btn" disabled={loadingMore} onClick={() => void loadMoreCommits()}>
            {loadingMore ? tr('dlg.working') : tr('hist.loadMore')}
          </button>
        </div>
      )}
    </div>
  )
}
