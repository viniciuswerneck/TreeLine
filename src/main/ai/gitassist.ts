// Ações git-aware do assistente (Fase 3) — propose-only: leem o repositório e
// devolvem sugestões de texto; NUNCA escrevem no Git nem em arquivos. Quem
// aplica a sugestão é o usuário, na UI.

import { ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { simpleGit } from '../git/git'
import { readOp } from '../git/runner'
import { getClient } from './server'
import { commitMessagePrompt, conflictPrompt, reviewPrompt } from './prompt'

/** Teto do diff enviado ao modelo (custo/contexto); o resto é truncado. */
const MAX_DIFF = 14_000

function truncate(s: string): string {
  return s.length > MAX_DIFF ? `${s.slice(0, MAX_DIFF)}\n… (truncated)` : s
}

/** Cria uma sessão efêmera, pergunta e apaga — a conversa não polui o chat. */
async function ask(repo: string, title: string, prompt: string): Promise<string> {
  const client = await getClient()
  const session = await client.createSession(repo, { agent: 'plan', title })
  try {
    const text = await client.prompt(session.id, repo, prompt)
    if (!text) throw new Error('o assistente não retornou texto')
    return text
  } finally {
    void client.deleteSession(session.id).catch(() => undefined)
  }
}

// Gera a mensagem de commit a partir de `git diff --cached` (staged).
ipcMain.handle('treeline:aiCommitMessage', (_e, repo: string, lang?: string) =>
  readOp(async () => {
    const g = simpleGit(repo)
    const [stat, diff] = await Promise.all([
      g.raw(['diff', '--cached', '--stat']),
      g.raw(['diff', '--cached', '--no-color'])
    ])
    if (!stat.trim() && !diff.trim()) throw new Error('nada em stage para descrever')
    return ask(repo, 'TreeLine — commit message', commitMessagePrompt(stat, truncate(diff), lang))
  })
)

// Revisa as mudanças staged antes do commit.
ipcMain.handle('treeline:aiReviewStaged', (_e, repo: string, lang?: string) =>
  readOp(async () => {
    const g = simpleGit(repo)
    const diff = await g.raw(['diff', '--cached', '--no-color'])
    if (!diff.trim()) throw new Error('nada em stage para revisar')
    return ask(repo, 'TreeLine — review', reviewPrompt(truncate(diff), lang))
  })
)

/** Lê o arquivo em conflito (working tree, com marcadores) sem sair do repo. */
async function readConflictFile(repo: string, file: string): Promise<string> {
  const abs = resolve(repo, file)
  const rel = relative(repo, abs)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('caminho inválido')
  try {
    return truncate(await readFile(abs, 'utf8'))
  } catch {
    return ''
  }
}

// Explica o conflito de um arquivo específico (ou do conjunto) sem tocar no Git.
ipcMain.handle('treeline:aiExplainConflict', (_e, repo: string, file: string, lang?: string) =>
  readOp(async () => {
    const g = simpleGit(repo)
    const conflicted = (await g.raw(['diff', '--name-only', '--diff-filter=U']))
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    const files = conflicted.length ? conflicted : file ? [file] : []
    if (!files.length) throw new Error('nenhum conflito ativo')
    const content = file ? await readConflictFile(repo, file) : ''
    return ask(repo, 'TreeLine — conflict', conflictPrompt(files, lang, content))
  })
)
