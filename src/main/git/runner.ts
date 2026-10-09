import { ChildProcess, spawn } from 'node:child_process'
import { mx, type UILang } from '../messages'

export type GitOp<T = unknown> = () => Promise<T>

export interface SyncController {
  proc: ChildProcess
  op: string
  cancelled: boolean
  timedOut: boolean
  /** SIGTERM + SIGKILL em 5s se o filho não morrer. Idempotente. */
  term: () => void
}

// Rede pode pendurar (DNS, auth lenta): após o prazo o filho morre e a
// operação vira erro legível em vez de travar o app.
export const SYNC_TIMEOUT_MS = 120_000
const SIGKILL_GRACE_MS = 5_000

export class GitQueue {
  q: Array<() => void> = []
  running = false
  enqueue<T>(fn: GitOp<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = async (): Promise<void> => {
        this.running = true
        try {
          resolve(await fn())
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
        } finally {
          this.running = false
          const next = this.q.shift()
          if (next) next()
        }
      }
      if (this.running) this.q.push(run)
      else run()
    })
  }
}

// ---------------------------------------------------------------------------
// Fila POR REPO: um push de 120s no repo A não bloqueia stage/commit do repo B
// (o `repo` do enqueue() antes era descartado e existia só 1 fila global).
// ---------------------------------------------------------------------------
const repoQueues = new Map<string, GitQueue>()

function repoQueue(key: string): GitQueue {
  let q = repoQueues.get(key)
  if (!q) {
    q = new GitQueue()
    repoQueues.set(key, q)
  }
  return q
}

/** Leituras não precisam esperar sync longa; só entre si são serializadas. */
export const indexQueue = new GitQueue()

/**
 * Mutex do `GIT_SEQUENCE_EDITOR` (env do processo, não por repo): rebase
 * interativo de 2 repos simultâneos não pode sobrepor o `cp <plano>` um do
 * outro. Fila DEDICADA (não a de escrita) — aninhar `enqueueGlobal(enqueue())`
 * na mesma fila travava o gitQueue para sempre (P0 resolvido).
 */
export const envQueue = new GitQueue()

/** Syncs em andamento, chaveadas por `syncKey(repo, op)`. */
export const syncControllers = new Map<string, SyncController>()

export function enqueue<T>(repo: string, fn: GitOp<T>): Promise<T> {
  return repoQueue(repo).enqueue(fn)
}

export function enqueueGlobal<T>(fn: GitOp<T>): Promise<T> {
  return envQueue.enqueue(fn)
}

export function readOp<T>(fn: GitOp<T>): Promise<T> {
  return indexQueue.enqueue(fn)
}

/**
 * Leitura que mexe no índice (`git status` faz refresh de stat): espera
 * qualquer escrita já enfileirada DAQUELE repo terminar antes de rodar.
 */
export async function readIndexOp<T>(repo: string, fn: GitOp<T>): Promise<T> {
  return indexQueue.enqueue(async () => {
    await repoQueue(repo).enqueue(async () => {
      /* espera operações em fila do repo */
    })
    return fn()
  })
}

/** Chave única de uma sync em andamento — a MESMA usada por `treeline:cancelSync`. */
export function syncKey(repo: string, op: string): string {
  return `${repo}:${op}`
}

/**
 * Spawn de `git` com cancel real e timeout:
 * - **exit code != 0 vira exceção** (antes push rejeitado/pull falho reportavam
 *   sucesso — os 9 call sites descartavam o código);
 * - cancel (`treeline:cancelSync`) e timeout matam com SIGTERM → SIGKILL em 5s;
 * - o filho é registrado em `syncControllers` sob a chave `${repo}:${op}`.
 */
export function runGitCancellable(
  repo: string,
  op: string,
  args: string[],
  lang: UILang,
  timeoutMs: number = SYNC_TIMEOUT_MS,
  extraEnv: Record<string, string> = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, {
      cwd: repo,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C', ...extraEnv }
    })
    let out = ''
    let err = ''
    proc.stdout.on('data', (d) => (out += String(d)))
    proc.stderr.on('data', (d) => (err += String(d)))

    let killTimer: NodeJS.Timeout | null = null
    const term = (): void => {
      try {
        proc.kill('SIGTERM')
      } catch {
        /* já morreu */
      }
      if (!killTimer) {
        killTimer = setTimeout(() => {
          try {
            proc.kill('SIGKILL')
          } catch {
            /* já morreu */
          }
        }, SIGKILL_GRACE_MS)
        killTimer.unref?.()
      }
    }

    const ctl: SyncController = { proc, op, cancelled: false, timedOut: false, term }
    const key = syncKey(repo, op)
    syncControllers.set(key, ctl)

    const timeoutTimer = setTimeout(() => {
      ctl.timedOut = true
      term()
    }, timeoutMs)
    timeoutTimer.unref?.()

    let settled = false
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      if (killTimer) clearTimeout(killTimer)
      syncControllers.delete(key)
      fn()
    }

    proc.on('close', (code) => {
      finish(() => {
        if (ctl.cancelled) return reject(new Error(mx(lang, 'opCancelled', { op })))
        if (ctl.timedOut) return reject(new Error(mx(lang, 'opTimeout', { op })))
        if (code !== 0) {
          const detail = (err || out).trim().split('\n').filter(Boolean).slice(0, 8).join('\n')
          return reject(new Error(detail || mx(lang, 'opFailed', { op, c: code ?? -1 })))
        }
        resolve({ code: 0, stdout: out, stderr: err })
      })
    })
    proc.on('error', (e) => {
      finish(() => reject(e))
    })
  })
}
