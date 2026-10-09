// Histórico: log (grafo), detalhe de commit, diff de commit por arquivo,
// blame, file-history e compare entre commits.

import { ipcMain } from 'electron'
import { simpleGit } from 'simple-git'
import { mx, asLang } from '../messages'
import { readOp } from './runner'
import { assertSafeRef, relPathSafe } from './validate'
import { parseNumstatZ } from './parsers'

function parseLogBlock(block: string): import('../../shared/types').CommitInfo | null {
  const parts = block.split('\0')
  if (parts.length < 6) return null
  // O git emite \n entre registros mesmo com separador %x1e próprio:
  // todo hash após o primeiro chega como "\n<hash>". Sem trim, a chave
  // nunca casa com o pai reservado e cada commit abre lane nova (staircase).
  const [hashRaw, parentStr, author, date, refStr, message] = parts as [string, string, string, string, string, string]
  const hash = hashRaw.trim()
  if (!hash) return null
  // %D vem como "HEAD -> main, origin/main, tag: v1": expande HEAD em badge próprio.
  const refs = (refStr ? refStr.split(', ') : []).flatMap((r) => {
    if (r.startsWith('HEAD -> ')) return ['HEAD', r.slice('HEAD -> '.length)]
    if (r === 'HEAD') return ['HEAD']
    return [r]
  })
  return {
    hash,
    parents: parentStr ? parentStr.split(/\s+/).map((p) => p.trim()).filter((p) => p.length > 0) : [],
    author,
    date,
    message,
    refs
  }
}

ipcMain.handle('treeline:getLog', (_event, repo: string, limit?: number, skip?: number, ref?: string | string[]) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../../shared/types').CommitInfo[]> => {
    const n = Math.min(Math.max(limit ?? 300, 1), 2000)
    const s = Math.min(Math.max(skip ?? 0, 0), 100000)
    // `ref` aceita um ref (modo "branch atual") ou a seleção do combo de
    // branches do history. Vem qualificado (refs/heads/…, refs/remotes/…),
    // então nunca briga com path/tag de nome igual.
    const onlyRefs = (Array.isArray(ref) ? ref : ref?.trim() ? [ref] : [])
      .map((r) => r.trim())
      .filter(Boolean)
    // %x1e (record separator) delimita commits; %x00 delimita campos.
    // Não usar \0\0 como separador: %P vazio (root commit) gera NUL duplo.
    // --topo-order é contrato do lane allocator single-pass: garante que
    // nenhum pai apareça antes de todos os seus filhos (ordem por data pura
    // embaralha a cadeia quando há múltiplas tips com clock skew, e cada
    // commit órfão de reserva vira uma lane nova = staircase).
    // --skip pagina: mesma ordem estável enquanto o repo não muda.
    // refs explícitos (branch atual ou seleção múltipla): ancestry real em
    // vez de heurística de refs; sem seleção, `--all`.
    const raw = await simpleGit(repo).raw([
      'log', ...(onlyRefs.length ? onlyRefs : ['--all']), '--topo-order', `--max-count=${n}`, `--skip=${s}`, '--date=iso',
      '--pretty=format:%H%x00%P%x00%an%x00%ad%x00%D%x00%s%x1e'
    ])
    if (!raw.trim()) return []
    return raw.split('\x1e').flatMap((block) => {
      const c = parseLogBlock(block)
      return c ? [c] : []
    })
  })
)

ipcMain.handle('treeline:getCommitDetail', (_event, repo: string, hash: string, lang?: unknown) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../../shared/types').CommitDetail> => {
    const l = asLang(lang)
    const out = await simpleGit(repo).raw([
      'show', '--name-only', '--date=iso',
      '--pretty=format:%H%x00%P%x00%an%x00%cn%x00%ad%x00%D%x00%s%x1e', hash
    ])
    const [head] = out.split('\x1e')
    const parts = (head ?? '').split('\0')
    if (parts.length < 7) throw new Error(mx(l, 'commitNotFound'))
    const [hashRaw, parentStr, author, committer, date, refStr, message] = parts as [string, string, string, string, string, string, string]
    const h = hashRaw.trim()
    if (!h) throw new Error(mx(l, 'commitNotFound'))
    const parents = parentStr ? parentStr.split(/\s+/).map((p) => p.trim()).filter((p) => p.length > 0) : []
    // Merge não tem diff próprio: `show --name-only` sai vazio (daí o famoso
    // "Arquivos (0)"). Arquivos e stats de um merge = mudança contra o
    // primeiro pai — o que ele trouxe para o branch.
    const isMerge = parents.length > 1
    const refs = (refStr ? refStr.split(', ') : []).flatMap((r) => {
      if (r.startsWith('HEAD -> ')) return ['HEAD', r.slice('HEAD -> '.length)]
      if (r === 'HEAD') return ['HEAD']
      return [r]
    })
    const files = isMerge
      ? (await simpleGit(repo).raw(['diff', '--name-only', '-z', `${h}^1`, h]))
          .split('\0')
          .map((f) => f.trim())
          .filter((f) => f.length > 0)
      : (await simpleGit(repo).raw(['show', '--name-only', '--format=', h]))
          .split('\n')
          .map((f) => f.trim())
          .filter((f) => f.length > 0)
    // +/- por arquivo (merge sem diff próprio pode vir vazio: sem stats).
    let stats: import('../../shared/types').FileStat[] = []
    try {
      const ns = await simpleGit(repo).raw(
        isMerge ? ['diff', '--numstat', '-z', `${h}^1`, h] : ['show', '--numstat', '-z', '--format=', h]
      )
      stats = parseNumstatZ(ns)
    } catch {
      /* sem stats */
    }
    return {
      hash: h,
      parents,
      author,
      committer,
      date,
      message: message ?? '',
      refs,
      files,
      stats
    }
  })
)

ipcMain.handle('treeline:getCommitDiff', (_event, repo: string, hash: string, file: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async () => {
    // Merge: `show -- <file>` sai vazio (diff combinado limpo não mostra
    // nada). Compara com o primeiro pai, igual aos arquivos/stats.
    const parents = (await simpleGit(repo).raw(['show', '-s', '--pretty=%P', hash])).trim().split(/\s+/).filter(Boolean)
    if (parents.length > 1) return simpleGit(repo).raw(['diff', `${hash}^1`, hash, '--unified=3', '--', file])
    return simpleGit(repo).raw(['show', hash, '--unified=3', '--', file])
  })
)

ipcMain.handle('treeline:getBlame', (_event, repo: string, file: string, rev?: string, lang?: unknown) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../../shared/types').BlameLine[]> => {
    const rel = relPathSafe(repo, file, asLang(lang))
    if (!rel) return []
    const args = ['blame', '--line-porcelain']
    if (rev?.trim()) {
      assertSafeRef(rev, 'en')
      args.push(rev.trim())
    }
    args.push('--', rel)
    const raw = await simpleGit(repo).raw(args)
    const out: import('../../shared/types').BlameLine[] = []
    let hash = ''
    let author = ''
    let date = ''
    let n = 0
    for (const line of raw.split('\n')) {
      const hm = /^[0-9a-f]{40} \d+ \d+ \d+$/.exec(line)
      if (hm) { hash = line.slice(0, 8); continue }
      if (line.startsWith('author ')) { author = line.slice(7); continue }
      if (line.startsWith('author-time ')) {
        const t = new Date(Number.parseInt(line.slice(12), 10) * 1000)
        date = Number.isNaN(t.getTime()) ? '' : t.toISOString().slice(0, 10)
        continue
      }
      if (line.startsWith('\t')) { n++; out.push({ line: n, hash, author, date, content: line.slice(1) }) }
    }
    return out
  })
)

ipcMain.handle('treeline:getFileHistory', (_event, repo: string, file: string, limit?: number) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../../shared/types').FileHistoryEntry[]> => {
    const n = Math.min(Math.max(limit ?? 100, 1), 500)
    const raw = await simpleGit(repo).raw([
      'log', '--follow', `--max-count=${n}`, '--date=iso-strict',
      '--pretty=format:%H%x00%an%x00%ad%x00%s%x00%D%x1e', '--', file
    ])
    if (!raw.trim()) return []
    return raw.split('\x1e').flatMap((block) => {
      const parts = block.split('\0')
      if (parts.length < 5) return []
      const [h, author, date, message, dec] = parts as [string, string, string, string, string]
      const hash = (h ?? '').trim()
      if (!hash) return []
      return [{ hash, author: author ?? '', date: date ?? '', message: message?.trim() ?? '', refs: (dec ?? '').trim() }]
    })
  })
)

ipcMain.handle('treeline:compareCommits', (_event, repo: string, a: string, b: string, lang?: unknown) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async (): Promise<import('../../shared/types').CompareSummary> => {
    assertSafeRef(a, asLang(lang))
    assertSafeRef(b, asLang(lang))
    const [names, ns] = await Promise.all([
      simpleGit(repo).raw(['diff', '--name-only', '-z', a.trim(), b.trim()]),
      simpleGit(repo).raw(['diff', '--numstat', '-z', a.trim(), b.trim()])
    ])
    const files = names.split('\0').map((f) => f.trim()).filter(Boolean)
    const stats: import('../../shared/types').FileStat[] = parseNumstatZ(ns)
    return { files, stats }
  })
)

ipcMain.handle('treeline:compareDiff', (_event, repo: string, a: string, b: string, file: string, lang?: unknown) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async () => {
    assertSafeRef(a, asLang(lang))
    assertSafeRef(b, asLang(lang))
    const rel = relPathSafe(repo, file, asLang(lang))
    return simpleGit(repo).raw(['diff', '--unified=3', a.trim(), b.trim(), '--', rel ?? ''])
  })
)