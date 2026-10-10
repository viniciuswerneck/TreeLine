// Helpers compartilhados dos testes de integração do motor git.
// Importar este módulo registra todos os handlers (efeito colateral); os
// testes invocam o handler direto via `handler(channel)`.
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { simpleGit, type SimpleGit } from 'simple-git'

// Registro dos handlers do motor (efeito colateral).
import '../src/main/git/branch'
import '../src/main/git/merge'
import '../src/main/git/stash'
import '../src/main/git/tag'
import '../src/main/git/rebase'
import '../src/main/git/pick'
import '../src/main/git/revert'
import '../src/main/git/flow'
import '../src/main/git/reflog'
import '../src/main/git/backup'
import '../src/main/git/remote'
import '../src/main/git/sync'
import '../src/main/git/status'
import '../src/main/git/history'
import '../src/main/git/commit'
import '../src/main/git/diff'
import '../src/main/git/conflict'
import '../src/main/git/lfs'
import '../src/main/git/submodule'
import '../src/main/git/worktree'
import '../src/main/git/search'
import '../src/main/git/pr'

export type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>

export function handler(channel: string): Handler {
  const h = (globalThis as { __treelineHandlers?: Map<string, Handler> }).__treelineHandlers?.get(channel)
  if (!h) throw new Error(`handler ${channel} não registrado`)
  return h
}

/** Invoca o handler ignorando o `event` (primeiro arg). */
export function call<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  return handler(channel)(undefined, ...args) as Promise<T>
}

/** Cria repo com git init -b main + user local. */
export async function mkRepo(): Promise<string> {
  const repo = mkdtempSync(join(tmpdir(), 'tl-it-'))
  await setupGit(repo)
  return repo
}

/** Repo bare para servir de `origin` local. */
export async function mkBare(name = 'tl-bare'): Promise<string> {
  const bare = join(tmpdir(), `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`)
  mkdirSync(bare, { recursive: true })
  await simpleGit(bare).init(['--bare'])
  return bare
}

async function setupGit(repo: string): Promise<void> {
  const git = simpleGit(repo)
  await git.init(['-b', 'main'])
  await git.addConfig('user.name', 'Test User')
  await git.addConfig('user.email', 'test@example.com')
}

export async function commitFile(repo: string, rel: string, content: string, msg: string): Promise<string> {
  const git = simpleGit(repo)
  writeFileSync(join(repo, rel), content)
  await git.add(rel)
  await git.commit(msg)
  return (await git.revparse(['HEAD'])).trim()
}

export async function commitAll(repo: string, msg: string): Promise<string> {
  const git = simpleGit(repo)
  await git.add('-A' as never)
  await git.commit(msg)
  return (await git.revparse(['HEAD'])).trim()
}

export function write(repo: string, rel: string, content: string): void {
  writeFileSync(join(repo, rel), content)
}

export function read(repo: string, rel: string): string {
  return readFileSync(join(repo, rel), 'utf-8')
}

export function branchOf(repo: string): Promise<string> {
  return simpleGit(repo).revparse(['--abbrev-ref', 'HEAD']).then((r) => r.trim())
}

export function exportable(git: SimpleGit): SimpleGit {
  return git
}

export function cleanup(...paths: string[]): void {
  for (const p of paths) {
    try {
      rmSync(p, { recursive: true, force: true })
    } catch {
      /* já removido */
    }
  }
}