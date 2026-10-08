import { useEffect, useMemo, useRef, useState } from 'react'
import type { HunkInfo } from '../../shared/types'
import { useStore } from '../store'

type DiffKind = 'hunk' | 'file' | 'add' | 'del' | 'ctx' | 'note'

interface DiffLine {
  kind: DiffKind
  text: string
  oldNo: number | null
  newNo: number | null
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/** Quebra o unified diff em linhas tipadas com números old/new (estilo VS Code). */
function parseDiff(text: string): DiffLine[] {
  const out: DiffLine[] = []
  let oldNo = 0
  let newNo = 0
  const raws = text.split('\n')
  // split de texto terminado em \n gera '' final fantasma: ignora.
  if (raws.length > 0 && raws[raws.length - 1] === '') raws.pop()
  for (const raw of raws) {
    if (raw.startsWith('@@')) {
      const m = HUNK_RE.exec(raw)
      if (m) {
        oldNo = Number(m[1])
        newNo = Number(m[2])
      }
      out.push({ kind: 'hunk', text: raw, oldNo: null, newNo: null })
    } else if (raw.startsWith('+++') || raw.startsWith('---') || raw.startsWith('diff --git')) {
      out.push({ kind: 'file', text: raw, oldNo: null, newNo: null })
    } else if (raw.startsWith('\\')) {
      out.push({ kind: 'note', text: raw, oldNo: null, newNo: null })
    } else if (raw.startsWith('+')) {
      out.push({ kind: 'add', text: raw, oldNo: null, newNo: newNo++ })
    } else if (raw.startsWith('-')) {
      out.push({ kind: 'del', text: raw, oldNo: oldNo++, newNo: null })
    } else {
      // contexto (mantém o espaço inicial, como no VS Code)
      out.push({ kind: 'ctx', text: raw, oldNo: oldNo++, newNo: newNo++ })
    }
  }
  return out
}

const num = (n: number | null): string => (n === null || n === 0 ? '' : String(n))

function ReadOnlyLine({ l }: { l: DiffLine }) {
  return (
    <div className={`diff-line ${l.kind}`}>
      <span className="diff-gutter">{num(l.oldNo)}</span>
      <span className="diff-gutter">{num(l.newNo)}</span>
      <span className="diff-sign">
        {l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ''}
      </span>
      <code>{l.text.slice(l.kind === 'add' || l.kind === 'del' ? 1 : 0) || ' '}</code>
    </div>
  )
}

function isChange(line: string): boolean {
  return (line.startsWith('+') && !line.startsWith('+++')) || (line.startsWith('-') && !line.startsWith('---'))
}

export type DiffMode = 'unified' | 'split'

const MODE_KEY = 'treeline-diffmode'

export function loadDiffMode(): DiffMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'split' ? 'split' : 'unified'
  } catch {
    return 'unified'
  }
}

export function saveDiffMode(m: DiffMode): void {
  try {
    localStorage.setItem(MODE_KEY, m)
  } catch {
    /* ignora */
  }
}

/** Linha alinhada lado a lado: velho à esquerda, novo à direita. */
interface SplitRow {
  oldNo: number | null
  newNo: number | null
  oldText: string | null
  newText: string | null
  /** índices em hunk.lines das linhas +/- (stage por linha); vazio = contexto. */
  lineIdx: number[]
  /** id do bloco de mudança (setas); -1 p/ contexto. */
  group: number
}

/** Alinha um hunk: contexto emparelha; bloco de - seguido de + emparelha linha a linha. */
function alignHunk(hunk: HunkInfo): SplitRow[] {
  const rows: SplitRow[] = []
  let oldNo = hunk.oldStart
  let newNo = hunk.newStart
  let group = 0
  const lines = hunk.lines.filter((ln, i) => !(ln === '' && i === hunk.lines.length - 1))
  let i = 0
  while (i < lines.length) {
    const ln = lines[i] as string
    if (ln.startsWith('\\')) {
      rows.push({ oldNo: null, newNo: null, oldText: null, newText: ln, lineIdx: [], group: -1 })
      i++
      continue
    }
    if (!isChange(ln)) {
      const text = ln.startsWith(' ') ? ln.slice(1) : ln
      rows.push({ oldNo: oldNo++, newNo: newNo++, oldText: text, newText: text, lineIdx: [], group: -1 })
      i++
      continue
    }
    // bloco de mudança: dels e adds consecutivos. O único elemento filtrado
    // é o '' fantasma do fim, então o índice j vale para hunk.lines.
    const dels: Array<{ t: string; idx: number }> = []
    const adds: Array<{ t: string; idx: number }> = []
    let j = i
    while (j < lines.length) {
      const l2 = lines[j] as string
      if (l2.startsWith('-') && !l2.startsWith('---')) { dels.push({ t: l2.slice(1), idx: j }); j++ }
      else break
    }
    while (j < lines.length) {
      const l2 = lines[j] as string
      if (l2.startsWith('+') && !l2.startsWith('+++')) { adds.push({ t: l2.slice(1), idx: j }); j++ }
      else break
    }
    const n = Math.max(dels.length, adds.length)
    for (let k = 0; k < n; k++) {
      const d = dels[k]
      const a = adds[k]
      const idx: number[] = []
      if (d) idx.push(d.idx)
      if (a) idx.push(a.idx)
      rows.push({
        oldNo: d ? oldNo++ : null,
        newNo: a ? newNo++ : null,
        oldText: d ? d.t : null,
        newText: a ? a.t : null,
        lineIdx: idx,
        group
      })
    }
    group++
    i = j
  }
  return rows
}

/** Hunk interativo: botões Stage/Discard no header + clique seleciona linhas. */
function InteractiveHunk({ hunk, staged }: { hunk: HunkInfo; staged: boolean }) {
  const tr = useStore((s) => s.tr)
  const stageHunk = useStore((s) => s.stageHunk)
  const discardHunk = useStore((s) => s.discardHunk)
  const stageLines = useStore((s) => s.stageLines)
  const [sel, setSel] = useState<Set<number>>(new Set())

  const toggle = (i: number): void => {
    setSel((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  let oldNo = hunk.oldStart
  let newNo = hunk.newStart
  return (
    <div className="diff-hunk">
      <div className="diff-line hunk hunk-head">
        <span className="diff-gutter" />
        <span className="diff-gutter" />
        <span className="diff-sign" />
        <code>{hunk.header}</code>
        <span className="hunk-actions">
          <button className="mini-btn" title={tr('hunk.selLines')} onClick={() => void stageHunk(hunk.index)}>
            {staged ? tr('hunk.unstage') : tr('hunk.stage')}
          </button>
          <button className="mini-btn danger" title={tr('hunk.discard')} onClick={() => void discardHunk(hunk.index)}>
            {tr('hunk.discard')}
          </button>
          {sel.size > 0 && (
            <button className="mini-btn primary" onClick={() => { void stageLines(hunk.index, [...sel]); setSel(new Set()) }}>
              {tr('hunk.stageSel')} ({sel.size})
            </button>
          )}
        </span>
      </div>
      {hunk.lines.map((raw, i) => {
        if (raw === '' && i === hunk.lines.length - 1) return null
        let kind: DiffKind = 'ctx'
        let o: number | null = null
        let n: number | null = null
        if (raw.startsWith('\\')) kind = 'note'
        else if (raw.startsWith('+') && !raw.startsWith('+++')) { kind = 'add'; n = newNo++ }
        else if (raw.startsWith('-') && !raw.startsWith('---')) { kind = 'del'; o = oldNo++ }
        else if (raw.startsWith('+++') || raw.startsWith('---')) kind = 'file'
        else { o = oldNo++; n = newNo++ }
        const selectable = isChange(raw)
        const on = sel.has(i)
        return (
          <div
            key={i}
            className={`diff-line ${kind}${selectable ? ' selectable' : ''}${on ? ' selected' : ''}`}
            title={selectable ? tr('hunk.selLines') : undefined}
            onClick={selectable ? () => toggle(i) : undefined}
          >
            <span className="diff-gutter">{num(o)}</span>
            <span className="diff-gutter">{num(n)}</span>
            <span className="diff-sign">{kind === 'add' ? '+' : kind === 'del' ? '−' : ''}</span>
            <code>{raw.slice(kind === 'add' || kind === 'del' ? 1 : 0) || ' '}</code>
          </div>
        )
      })}
    </div>
  )
}

/** Hunk lado a lado: duas colunas (velho|novo) com seta por bloco de mudança. */
function SplitHunk({ hunk, staged }: { hunk: HunkInfo; staged: boolean }) {
  const tr = useStore((s) => s.tr)
  const stageLines = useStore((s) => s.stageLines)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const rows = useMemo(() => alignHunk(hunk), [hunk])

  const toggle = (idxs: number[]): void => {
    setSel((prev) => {
      const next = new Set(prev)
      const on = idxs.every((i) => next.has(i))
      for (const i of idxs) {
        if (on) next.delete(i)
        else next.add(i)
      }
      return next
    })
  }

  const groupLines = (g: number): number[] => rows.filter((r) => r.group === g).flatMap((r) => r.lineIdx)
  const seen = new Set<number>()
  return (
    <div className="diff-hunk">
      <div className="split-head">
        <code>{hunk.header}</code>
        {sel.size > 0 && (
          <button className="mini-btn primary" onClick={() => { void stageLines(hunk.index, [...sel]); setSel(new Set()) }}>
            {tr('hunk.stageSel')} ({sel.size})
          </button>
        )}
      </div>
      <div className="split-grid" role="table" aria-label="Split diff">
        {rows.map((r, i) => {
          const changed = r.lineIdx.length > 0
          const on = r.lineIdx.length > 0 && r.lineIdx.every((x) => sel.has(x))
          const firstOfGroup = changed && !seen.has(r.group)
          if (changed) seen.add(r.group)
          return (
            <div
              key={i}
              className={`split-row${changed ? ' changed' : ''}${on ? ' selected' : ''}`}
              role="row"
              title={changed ? tr('hunk.selLines') : undefined}
              onClick={changed ? () => toggle(r.lineIdx) : undefined}
            >
              <span className="diff-gutter">{num(r.oldNo)}</span>
              <code className={`split-cell old${r.oldText !== null && r.newText === null ? ' del' : r.oldText !== null && changed ? ' chg' : ''}`}>
                {r.oldText ?? ''}
              </code>
              <span className="split-arrow">
                {firstOfGroup && (
                  <button
                    className="arrow-btn"
                    title={staged ? tr('diff.unstageBlock') : tr('diff.stageBlock')}
                    onClick={(e) => {
                      e.stopPropagation()
                      void stageLines(hunk.index, groupLines(r.group))
                    }}
                  >
                    {staged ? '←' : '→'}
                  </button>
                )}
              </span>
              <span className="diff-gutter">{num(r.newNo)}</span>
              <code className={`split-cell new${r.newText !== null && r.oldText === null ? ' add' : r.newText !== null && changed ? ' chg' : ''}`}>
                {r.newText ?? ''}
              </code>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface DiffViewerProps {
  text: string
  /** Quando setado (+ hunks + interactive), o diff vira stage por hunk/linha. */
  file?: string
  staged?: boolean
  hunks?: HunkInfo[]
  interactive?: boolean
  /** split exige hunks (só Working Copy); sem hunks cai p/ unified. */
  mode?: DiffMode
}

/**
 * Diff colorido estilo VS Code: adicionadas em verde, removidas em vermelho,
 * hunk em destaque, com gutters de número old/new. No File Status vira
 * interativo: Stage/Discard por hunk e stage parcial por linha (clique),
 * em unified ou split (duas colunas com setas por bloco).
 */
export default function DiffViewer({ text, staged = false, hunks, interactive = false, mode = 'unified' }: DiffViewerProps) {
  const lines = useMemo(() => parseDiff(text), [text])
  const useHunks = interactive && hunks && hunks.length > 0
  const useSplit = useHunks && mode === 'split'
  const diffRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = diffRef.current
    if (!el) return
    const onKey = (e: KeyboardEvent): void => {
      const active = document.activeElement as HTMLElement | null
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
      const step = 20
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        el.scrollTop += step
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        el.scrollTop -= step
      } else if (e.key === 'd') {
        e.preventDefault()
        el.scrollTop += el.clientHeight / 2
      } else if (e.key === 'u') {
        e.preventDefault()
        el.scrollTop -= el.clientHeight / 2
      } else if (e.key === 'g') {
        e.preventDefault()
        el.scrollTop = 0
      } else if (e.key === 'G') {
        e.preventDefault()
        el.scrollTop = el.scrollHeight
      }
    }
    el.addEventListener('keydown', onKey)
    el.tabIndex = 0
    return () => el.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div ref={diffRef} className="diff-view" role="document" aria-label="Diff">
      {useSplit
        ? (hunks as HunkInfo[]).map((h) => <SplitHunk key={h.index} hunk={h} staged={staged} />)
        : useHunks
          ? (hunks as HunkInfo[]).map((h) => <InteractiveHunk key={h.index} hunk={h} staged={staged} />)
          : lines.map((l, i) => <ReadOnlyLine key={i} l={l} />)}
    </div>
  )
}
