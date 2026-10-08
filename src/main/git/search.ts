// Busca de código em todas as branches: `git grep` por ref (branch atual =
// working tree, com `--untracked`) + pickaxe `git log -G` para o último
// commit que alterou o texto em cada arquivo. Limites defensivos porque o
// renderer não pode travar: early-stop por hits, deadline global, timeout por
// processo e cancelamento por token (kill dos processos filhos).

import { spawn, type ChildProcess } from 'node:child_process'
import { ipcMain } from 'electron'
import type {
  CodeSearchChange,
  CodeSearchFile,
  CodeSearchGroup,
  CodeSearchOptions,
  CodeSearchProgress,
  CodeSearchStats
} from '../../shared/types'

const MAX_LOCALS = 40
const MAX_REMOTES = 20
const MAX_HITS = 1000
const MAX_HISTORY_PATHS = 25
const GREP_TIMEOUT_MS = 5000
const LOG_TIMEOUT_MS = 5000
const REFS_TIMEOUT_MS = 3000
const DEADLINE_MS = 15000
const HISTORY_EXTRA_MS = 8000
const MAX_QUERY = 512

export interface GrepHit {
  path: string
  line: number
  text: string
}

interface SearchCtx {
  token: number
  cancelled: boolean
  procs: Set<ChildProcess>
  started: number
}

interface RunResult {
  code: number
  stdout: string
  stderr: string
  timedOut: boolean
}

const active = new Map<number, SearchCtx>()

function cancelCtx(ctx: SearchCtx): void {
  ctx.cancelled = true
  for (const p of ctx.procs) {
    try {
      p.kill('SIGTERM')
    } catch {
      /* já morreu */
    }
  }
}

function run(ctx: SearchCtx, repo: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    if (ctx.cancelled) {
      resolve({ code: -1, stdout: '', stderr: '', timedOut: false })
      return
    }
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    const proc = spawn('git', args, {
      cwd: repo,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' }
    })
    ctx.procs.add(proc)
    const timer = setTimeout(() => {
      timedOut = true
      try {
        proc.kill('SIGTERM')
      } catch {
        /* já morreu */
      }
    }, timeoutMs)
    const finish = (code: number): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      ctx.procs.delete(proc)
      resolve({ code, stdout, stderr, timedOut })
    }
    proc.stdout.on('data', (d: Buffer) => {
      stdout += String(d)
    })
    proc.stderr.on('data', (d: Buffer) => {
      stderr += String(d)
    })
    proc.on('close', (code) => finish(code ?? -1))
    proc.on('error', () => finish(-1))
  })
}

/** Escapa metacaracteres de ERE para o `git log -G` de uma busca literal. */
export function escapeERE(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Parser da saída de `git grep --null -n`:
 *   sem ref: `path\0line\0texto`
 *   com ref: `ref:path\0line\0texto` (prefixo `ref:` removido aqui — refs do
 *   Git não podem conter `:`, então o strip é seguro).
 * Aceita também o formato legado `path\0line:texto`.
 */
export function parseGrep(stdout: string, ref?: string): GrepHit[] {
  const prefix = ref ? `${ref}:` : ''
  const hits: GrepHit[] = []
  for (const raw of stdout.split('\n')) {
    if (!raw) continue
    let line0 = raw
    if (prefix) {
      if (!line0.startsWith(prefix)) continue
      line0 = line0.slice(prefix.length)
    }
    const parts = line0.split('\0')
    let path = ''
    let lineStr = ''
    let text = ''
    if (parts.length >= 3) {
      path = parts[0] ?? ''
      lineStr = parts[1] ?? ''
      text = parts.slice(2).join('\0')
    } else if (parts.length === 2) {
      path = parts[0] ?? ''
      const colon = (parts[1] ?? '').indexOf(':')
      if (colon === -1) continue
      lineStr = (parts[1] ?? '').slice(0, colon)
      text = (parts[1] ?? '').slice(colon + 1)
    } else {
      continue
    }
    if (!path) continue
    const line = Number.parseInt(lineStr, 10)
    if (!Number.isInteger(line) || line < 1) continue
    hits.push({ path, line, text: text.replace(/\r$/, '') })
  }
  return hits
}

/** Faixa do highlight do match na linha (regex quando `regex`, case conforme opção). */
export function matchRange(
  text: string,
  query: string,
  opts: Pick<CodeSearchOptions, 'caseSensitive' | 'regex'>
): { start: number; end: number } {
  if (opts.regex) {
    try {
      const m = new RegExp(query, opts.caseSensitive ? '' : 'i').exec(text)
      if (m) return { start: m.index, end: m.index + m[0].length }
    } catch {
      /* regex inválida: erro já reportado pelo grep */
    }
    return { start: -1, end: -1 }
  }
  const hay = opts.caseSensitive ? text : text.toLowerCase()
  const needle = opts.caseSensitive ? query : query.toLowerCase()
  const i = hay.indexOf(needle)
  return i < 0 ? { start: -1, end: -1 } : { start: i, end: i + needle.length }
}

function buildGroup(
  label: string,
  current: boolean,
  remote: boolean,
  hits: GrepHit[],
  query: string,
  opts: CodeSearchOptions
): CodeSearchGroup {
  const byPath = new Map<string, CodeSearchFile>()
  for (const h of hits) {
    let file = byPath.get(h.path)
    if (!file) {
      file = { path: h.path, total: 0, lines: [] }
      byPath.set(h.path, file)
    }
    const r = matchRange(h.text, query, opts)
    file.total++
    file.lines.push({ path: h.path, line: h.line, text: h.text, start: r.start, end: r.end })
  }
  const files = [...byPath.values()]
  return { ref: label, current, remote, hits: files.reduce((n, f) => n + f.total, 0), files }
}

async function listRefs(ctx: SearchCtx, repo: string, pattern: 'refs/heads' | 'refs/remotes'): Promise<string[]> {
  const r = await run(ctx, repo, ['for-each-ref', '--format=%(refname:short)', pattern], REFS_TIMEOUT_MS)
  if (ctx.cancelled || r.code !== 0) return []
  return r.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Ref que contém o commit. Prefere branches (heads/remotes); sem match nessas
 * refs cai para o name-rev completo (tags, ex.: release que só existe em tag).
 * Strip do prefixo `remotes/`. */
async function refForCommit(ctx: SearchCtx, repo: string, hash: string): Promise<string | null> {
  if (!/^[0-9a-f]{7,40}$/.test(hash)) return null
  const r = await run(
    ctx,
    repo,
    ['name-rev', '--name-only', '--no-undefined', '--refs=refs/heads/*', '--refs=refs/remotes/*', hash],
    REFS_TIMEOUT_MS
  )
  let name = r.code === 0 ? (r.stdout.split('\n')[0] ?? '').trim() : ''
  if (!name || name === 'undefined') {
    const r2 = await run(ctx, repo, ['name-rev', '--name-only', '--no-undefined', hash], REFS_TIMEOUT_MS)
    name = r2.code === 0 ? (r2.stdout.split('\n')[0] ?? '').trim() : ''
  }
  if (!name || name === 'undefined') return null
  return name.replace(/^remotes\//, '')
}

interface Send {
  (p: CodeSearchProgress): void
}

async function doSearch(
  send: Send,
  repo: string,
  query: string,
  opts: CodeSearchOptions,
  token: number
): Promise<CodeSearchStats> {
  const ctx: SearchCtx = { token, cancelled: false, procs: new Set(), started: Date.now() }
  active.set(token, ctx)
  const stats: CodeSearchStats = {
    totalHits: 0,
    branches: 0,
    truncated: false,
    durationMs: 0,
    cancelled: false,
    error: null
  }
  const seenPaths = new Set<string>()
  try {
    const [cur, locals, remotesAll] = await Promise.all([
      run(ctx, repo, ['branch', '--show-current'], REFS_TIMEOUT_MS),
      listRefs(ctx, repo, 'refs/heads'),
      opts.remotes ? listRefs(ctx, repo, 'refs/remotes') : Promise.resolve<string[]>([])
    ])
    if (ctx.cancelled) {
      stats.cancelled = true
      return stats
    }
    const current = cur.stdout.trim()
    const remotes = remotesAll.filter((r) => !r.endsWith('/HEAD'))
    const localsCapped = locals.slice(0, MAX_LOCALS)
    const remotesCapped = remotes.slice(0, MAX_REMOTES)
    if (locals.length > MAX_LOCALS || remotes.length > MAX_REMOTES) stats.truncated = true

    // Ordem: working tree do branch atual (inclui edições não commitadas),
    // depois o conteúdo commitado de cada branch local e remota.
    const targets: Array<{ ref: string | null; label: string; current: boolean; remote: boolean }> = [
      { ref: null, label: current || 'HEAD', current: true, remote: false },
      ...localsCapped
        .filter((b) => b !== current)
        .map((b) => ({ ref: b, label: b, current: false, remote: false })),
      ...remotesCapped.map((b) => ({ ref: b, label: b, current: false, remote: true }))
    ]

    let firstError: string | null = null
    for (const t of targets) {
      if (ctx.cancelled) {
        stats.cancelled = true
        break
      }
      if (Date.now() - ctx.started > DEADLINE_MS || stats.totalHits >= MAX_HITS) {
        stats.truncated = true
        break
      }
      const args = ['grep', '-n', '--null', '-I']
      if (t.current) args.push('--untracked')
      if (!opts.caseSensitive) args.push('-i')
      args.push(opts.regex ? '-E' : '-F')
      args.push('-e', query)
      if (t.ref) args.push(t.ref)
      const r = await run(ctx, repo, args, GREP_TIMEOUT_MS)
      if (ctx.cancelled) {
        stats.cancelled = true
        break
      }
      if (r.timedOut) {
        stats.truncated = true
        continue
      }
      if (r.code > 1) {
        // Ex.: regex inválida — pega a última linha do stderr como mensagem.
        const last = r.stderr.trim().split('\n').filter(Boolean).pop()
        firstError = firstError ?? last ?? `git grep: exit ${r.code}`
        continue
      }
      if (r.code !== 0) continue // 1 = sem match nesta ref
      const hits = parseGrep(r.stdout, t.ref ?? undefined)
      if (hits.length === 0) continue
      const kept = hits.slice(0, Math.max(0, MAX_HITS - stats.totalHits))
      if (kept.length < hits.length) stats.truncated = true
      const group = buildGroup(t.label, t.current, t.remote, kept, query, opts)
      stats.totalHits += group.hits
      stats.branches++
      for (const f of group.files) {
        if (seenPaths.size >= MAX_HISTORY_PATHS) break
        seenPaths.add(f.path)
      }
      send({ token, kind: 'group', group })
    }

    // Último commit que alterou o texto em cada arquivo com hit. `-G` sempre
    // é regex (ERE); em busca literal escapamos os metacaracteres. `--all`
    // porque o texto pode existir só em branches fora do HEAD atual.
    const budget = DEADLINE_MS + HISTORY_EXTRA_MS
    if (
      !ctx.cancelled &&
      stats.branches > 0 &&
      seenPaths.size > 0 &&
      Date.now() - ctx.started < budget
    ) {
      const pattern = opts.regex ? query : escapeERE(query)
      for (const path of seenPaths) {
        if (ctx.cancelled) {
          stats.cancelled = true
          break
        }
        if (Date.now() - ctx.started > budget) {
          stats.truncated = true
          break
        }
        const args = ['log', '-1', '--all', '--date=iso-strict']
        if (!opts.caseSensitive) args.push('-i')
        args.push(`-G${pattern}`, '--format=%H%x00%an%x00%ad%x00%s', '--', path)
        const r = await run(ctx, repo, args, LOG_TIMEOUT_MS)
        if (ctx.cancelled) {
          stats.cancelled = true
          break
        }
        let change: CodeSearchChange | null = null
        if (r.code === 0 && r.stdout.trim()) {
          const [hash, author, date, subject] = r.stdout.trim().split('\0')
          const ref = (await refForCommit(ctx, repo, (hash ?? '').trim())) ?? null
          change = {
            hash: (hash ?? '').trim().slice(0, 8),
            author: (author ?? '').trim(),
            date: (date ?? '').trim(),
            subject: (subject ?? '').trim(),
            ref
          }
        }
        send({ token, kind: 'change', path, change })
      }
    }

    if (stats.branches === 0 && firstError && !ctx.cancelled) stats.error = firstError
    return stats
  } finally {
    stats.durationMs = Date.now() - ctx.started
    active.delete(token)
  }
}

// Registro dos handlers. O guard existe para permitir importar este módulo em
// testes Vitest (no Node `require('electron')` resolve o binário, sem `ipcMain`).
function registerSearchIpc(): void {
  if (!ipcMain || typeof ipcMain.handle !== 'function') return

  ipcMain.handle(
    'treeline:searchCode',
    async (
      event,
      repo: string,
      query: string,
      opts: Partial<CodeSearchOptions> | undefined,
      token: number
    ): Promise<CodeSearchStats> => {
      const sender = event.sender
      const send = (p: CodeSearchProgress): void => {
        try {
          if (!sender.isDestroyed()) sender.send('treeline:searchProgress', p)
        } catch {
          /* janela fechou no meio da busca */
        }
      }
      const base: CodeSearchStats = {
        totalHits: 0,
        branches: 0,
        truncated: false,
        durationMs: 0,
        cancelled: false,
        error: null
      }
      const q = (query ?? '').trim().slice(0, MAX_QUERY)
      if (typeof repo !== 'string' || !repo || !q) {
        send({ token, kind: 'done', stats: base })
        return base
      }
      const prev = active.get(token)
      if (prev) cancelCtx(prev)
      const options: CodeSearchOptions = {
        caseSensitive: !!opts?.caseSensitive,
        regex: !!opts?.regex,
        remotes: !!opts?.remotes
      }
      const stats = await doSearch(send, repo, q, options, token)
      send({ token, kind: 'done', stats })
      return stats
    }
  )

  ipcMain.handle('treeline:cancelSearch', (_event, token: number) => {
    const ctx = active.get(token)
    if (ctx) cancelCtx(ctx)
  })
}

registerSearchIpc()
