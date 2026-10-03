import { useMemo } from 'react'

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

/**
 * Diff colorido estilo VS Code: adicionadas em verde, removidas em vermelho,
 * hunk em destaque, com gutters de número old/new.
 */
export default function DiffViewer({ text }: { text: string }) {
  const lines = useMemo(() => parseDiff(text), [text])
  return (
    <div className="diff-view" role="document" aria-label="Diff">
      {lines.map((l, i) => (
        <div key={i} className={`diff-line ${l.kind}`}>
          <span className="diff-gutter">{num(l.oldNo)}</span>
          <span className="diff-gutter">{num(l.newNo)}</span>
          <span className="diff-sign">
            {l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ''}
          </span>
          <code>{l.text.slice(l.kind === 'add' || l.kind === 'del' ? 1 : 0) || ' '}</code>
        </div>
      ))}
    </div>
  )
}
