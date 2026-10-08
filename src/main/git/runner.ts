import { ChildProcess, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { SimpleGit } from 'simple-git'
import { mx, type UILang } from '../messages'

export type GitOp<T = unknown> = () => Promise<T>

export interface SyncController {
  proc?: ChildProcess
  done: boolean
  cancelled: boolean
  onCancel?: () => void
}

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

export const gitQueue = new GitQueue()
export const indexQueue = new GitQueue()
export const syncControllers = new Map<string, SyncController>()

export function enqueue<T>(repo: string, fn: GitOp<T>): Promise<T> {
  return gitQueue.enqueue(fn)
}

export function enqueueGlobal<T>(fn: GitOp<T>): Promise<T> {
  return gitQueue.enqueue(fn)
}

export function readOp<T>(fn: GitOp<T>): Promise<T> {
  return indexQueue.enqueue(fn)
}

export async function readIndexOp<T>(repo: string, fn: GitOp<T>): Promise<T> {
  return indexQueue.enqueue(async () => {
    await gitQueue.enqueue(async () => {
      /* espera operações em fila do repo */
    })
    return fn()
  })
}

export function runGitCancellable(repo: string, op: string, args: string[], lang: UILang): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, {
      cwd: repo,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' }
    })
    let out = '', err = ''
    proc.stdout.on('data', (d) => (out += String(d)))
    proc.stderr.on('data', (d) => (err += String(d)))
    const key = `__${op.toLowerCase()}:${repo}`
    syncControllers.set(key, { proc, done: false, cancelled: false })
    proc.on('close', (code) => {
      syncControllers.delete(key)
      resolve({ code: code ?? -1, stdout: out, stderr: err })
    })
    proc.on('error', (e) => {
      syncControllers.delete(key)
      reject(e)
    })
  })
}
