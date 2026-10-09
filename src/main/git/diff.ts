// Diff de arquivo (worktree/index/conflito/add) + hunks (stage/discard por
// hunk e por linha via `git apply`). Teto de 1 MB no diff bruto para não
// travar o renderer; conflito vira diff unificado real (`:1:f :2:f`).

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import { simpleGit } from 'simple-git'
import { mx, asLang } from '../messages'
import { enqueue, readOp } from './runner'
import { relPathSafe } from './validate'
import { backupDiscard } from './backup'
import { looksBinary } from '../conflict-stages'
import { conflictLabels } from './conflict'

ipcMain.handle('treeline:getDiff', (_event, repo: string, file: string, staged: boolean, lang?: unknown) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async () => {
    const args = staged ? ['diff', '--cached', '--unified=3', '--', file] : ['diff', '--unified=3', '--', file]
    // Teto de 1 MB: um "diff" enorme (merge de minúsculas, arquivo de texto
    // gigante) trava o renderer; corta em limite de linha e marca a nota
    // (`\ …` vira linha "note" no parse do DiffViewer).
    const MAX_DIFF = 1024 * 1024
    let out = await simpleGit(repo).raw(args)
    if (out.length > MAX_DIFF) {
      const cut = out.lastIndexOf('\n', MAX_DIFF)
      out = out.slice(0, cut > 0 ? cut : MAX_DIFF) + '\n\\ ' + mx(asLang(lang), 'diffTruncated') + '\n'
    }
    if (out.trim()) return out
    // Arquivo novo (untracked): `git diff` sai vazio porque ele nunca entrou
    // no index. Para revisar o código antes do commit, emite um diff sintético
    // com o arquivo inteiro como adicionado; sem hunks reais o DiffViewer
    // renderiza em modo somente leitura (stage continua na linha do arquivo).
    if (!staged) {
      try {
        const tracked = (await simpleGit(repo).raw(['ls-files', '--', file])).trim()
        if (!tracked) {
          const l = asLang(lang)
          const rel = relPathSafe(repo, file, l)
          if (!rel) return ''
          const buf = await fs.readFile(join(repo, rel))
          const head = `--- /dev/null\n+++ b/${rel}\n`
          if (looksBinary(buf)) return head + mx(l, 'newBinary') + '\n'
          const MAX = 1024 * 1024
          const trunc = buf.length > MAX
          const lines = (trunc ? buf.subarray(0, MAX) : buf).toString('utf8').split('\n')
          if (lines[lines.length - 1] === '') lines.pop()
          if (lines.length > 0) {
            // Nota antes do `@@`: sem hunk ainda, os contadores estão em 0 e
            // os gutters saem vazios (num(0) === '').
            const note = trunc ? mx(l, 'newTruncated') + '\n' : ''
            return `${head}${note}@@ -0,0 +1,${lines.length} @@\n${lines.map((x) => `+${x}`).join('\n')}\n`
          }
        }
      } catch {
        // Sem fonte legível (sumiu, sem permissão): cai no placeholder.
      }
    }
    // Arquivo em conflito: `git diff` sai vazio porque o index tem 3 estágios
    // e não existe blob "único" para comparar. O BUG anterior devolvia um
    // pseudo-diff (`@@ ours @@` sem contagem de linhas), que o DiffViewer não
    // consegue parsear — a aba ficava em branco. Agora emitimos diff unificado
    // de verdade: o git aceita specs de blob no lugar de um commit, então
    // `git diff :1:f :2:f` funciona mesmo com o index unmerged.
    try {
      const l = asLang(lang)
      const unmerged = (await simpleGit(repo).raw(['ls-files', '-u', '--', file])).trim()
      if (!unmerged) return out
      const exists = async (spec: string): Promise<string> =>
        simpleGit(repo)
          .raw(['cat-file', '-e', spec])
          .then(() => spec)
          .catch(() => '')
      const s1 = await exists(`:1:${file}`)
      const s2 = await exists(`:2:${file}`)
      const s3 = await exists(`:3:${file}`)
      if (!s2 && !s3) return out

      /**
       * Um lado como diff unificado. Descarta o cabeçalho `diff --git`/`index`
       * do git e emite `---`/`+++` próprios com o rótulo do lado, que é o que
       * o usuário precisa ler; o DiffViewer só exige o `@@`.
       */
      const side = async (from: string, to: string, label: string): Promise<string> => {
        const d = await simpleGit(repo).raw(['diff', '--unified=3', from, to])
        const at = d.indexOf('@@')
        if (at < 0) return ''
        return `--- a/${label}\n+++ b/${label}\n${d.slice(at)}`
      }

      // Rótulos de verdade (branch de cada lado): o cabeçalho do diff é a
      // única pista de qual linha veio de qual branch durante a resolução.
      const { ours: oursRef, theirs: theirsRef } = await conflictLabels(repo)
      const oursLabel = `${file} — ${mx(l, 'conflictOursLabel', { r: oursRef })}`
      const theirsLabel = `${file} — ${mx(l, 'conflictTheirsLabel', { r: theirsRef })}`
      const parts: string[] = []
      if (s1 && s2) parts.push(await side(s1, s2, oursLabel))
      if (s1 && s3) parts.push(await side(s1, s3, theirsLabel))
      // add/add não tem base: a única comparação útil é um lado contra o outro.
      if (!s1 && s2 && s3) parts.push(await side(s2, s3, `${oursLabel} -> ${theirsLabel}`))
      const body = parts.filter(Boolean).join('')
      return body || out
    } catch {
      return out
    }
  })
)

const HUNK_HEAD_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

interface SplitDiff {
  header: string[]
  hunks: import('../../shared/types').HunkInfo[]
}

/** Quebra um unified diff de 1 arquivo em cabeçalho + hunks numerados. */
function splitDiffHunks(raw: string): SplitDiff {
  const header: string[] = []
  const hunks: import('../../shared/types').HunkInfo[] = []
  let cur: string[] | null = null
  let curHeader = ''
  let curOld = '0'
  let curNew = '0'
  for (const line of raw.split('\n')) {
    const m = HUNK_HEAD_RE.exec(line)
    if (m) {
      if (cur) {
        hunks.push({
          index: hunks.length,
          header: curHeader,
          oldStart: Number(curOld),
          newStart: Number(curNew),
          lines: cur
        })
      }
      curHeader = line
      curOld = m[1] as string
      curNew = m[3] as string
      cur = []
    } else if (cur) {
      cur.push(line)
    } else {
      header.push(line)
    }
  }
  if (cur) {
    hunks.push({ index: hunks.length, header: curHeader, oldStart: Number(curOld), newStart: Number(curNew), lines: cur })
  }
  // Linha '' fantasma do split final: fica no último hunk, inofensiva ao apply.
  return { header, hunks }
}

async function diffForHunks(repo: string, file: string, staged: boolean): Promise<SplitDiff> {
  const args = staged
    ? ['diff', '--cached', '--unified=3', '--', file]
    : ['diff', '--unified=3', '--', file]
  return splitDiffHunks(await simpleGit(repo).raw(args))
}

/** Aplica um patch via arquivo temporário (simple-git não faz stdin). */
async function applyPatch(repo: string, patch: string, args: string[]): Promise<void> {
  const { tmpdir } = await import('node:os')
  const { randomBytes } = await import('node:crypto')
  const tmp = join(tmpdir(), `treeline-${randomBytes(6).toString('hex')}.patch`)
  try {
    await fs.writeFile(tmp, patch)
    await simpleGit(repo).raw([...args, tmp])
  } finally {
    await fs.rm(tmp, { force: true })
  }
}

/** Monta patch parcial com só as linhas selecionadas (+/- viram contexto ou somem). */
function buildPartialPatch(header: string[], hunk: import('../../shared/types').HunkInfo, sel: Set<number>): string | null {
  const body: string[] = []
  let ctx = 0
  let add = 0
  let del = 0
  hunk.lines.forEach((ln, i) => {
    // '' fantasma do split final: fora da contagem e do patch.
    if (ln === '' && i === hunk.lines.length - 1) return
    if (ln.startsWith('+') && !ln.startsWith('+++')) {
      if (sel.has(i)) { body.push(ln); add++ } // fora: some do patch
    } else if (ln.startsWith('-') && !ln.startsWith('---')) {
      if (sel.has(i)) { body.push(ln); del++ }
      else { body.push(' ' + ln.slice(1)); ctx++ } // fora: vira contexto
    } else if (ln.startsWith('\\')) {
      body.push(ln) // "\ No newline" acompanha a linha anterior
    } else {
      body.push(ln); ctx++
    }
  })
  if (add === 0 && del === 0) return null
  const oldCount = ctx + del
  const newCount = ctx + add
  const head = `@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@`
  return [...header, head, ...body].join('\n') + '\n'
}

ipcMain.handle('treeline:getHunks', (_event, repo: string, file: string, staged: boolean) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../../shared/types').HunkInfo[]> => (await diffForHunks(repo, file, staged)).hunks)
)

ipcMain.handle('treeline:stageHunk', (_event, repo: string, file: string, staged: boolean, hunkIndex: number, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    const { header, hunks } = await diffForHunks(repo, file, staged)
    const h = hunks.find((x) => x.index === hunkIndex)
    if (!h) throw new Error(mx(l, 'noHunk', { n: hunkIndex + 1 }))
    const patch = [...header, h.header, ...h.lines].join('\n') + '\n'
    // Unstaged → index (--cached); staged → volta p/ worktree (--cached -R).
    await applyPatch(repo, patch, staged ? ['apply', '--cached', '-R'] : ['apply', '--cached'])
  })
)

ipcMain.handle('treeline:discardHunk', (_event, repo: string, file: string, staged: boolean, hunkIndex: number, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    // Descartar hunk apaga mudança sem undo. backupBundle(--all) por hunk
    // seria caro demais; salva só o patch do arquivo (barato e suficiente).
    await backupDiscard(repo, file, staged)
    const { header, hunks } = await diffForHunks(repo, file, staged)
    const h = hunks.find((x) => x.index === hunkIndex)
    if (!h) throw new Error(mx(l, 'noHunk', { n: hunkIndex + 1 }))
    const patch = [...header, h.header, ...h.lines].join('\n') + '\n'
    // Unstaged → reverte no worktree (-R); staged → tira do index (--cached -R).
    await applyPatch(repo, patch, staged ? ['apply', '--cached', '-R'] : ['apply', '-R'])
  })
)

ipcMain.handle('treeline:stageLines', (_event, repo: string, file: string, staged: boolean, hunkIndex: number, lineIndexes: number[], lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    const { header, hunks } = await diffForHunks(repo, file, staged)
    const h = hunks.find((x) => x.index === hunkIndex)
    if (!h) throw new Error(mx(l, 'noHunk', { n: hunkIndex + 1 }))
    const patch = buildPartialPatch(header, h, new Set(lineIndexes))
    if (!patch) throw new Error(mx(l, 'noLines'))
    await applyPatch(repo, patch, staged ? ['apply', '--cached', '-R'] : ['apply', '--cached'])
    // Nota: unstage por linha usa o mesmo patch parcial em reverso no index.
    // Stage por linha no index (arquivo staged) segue o fluxo de unstage.
  })
)