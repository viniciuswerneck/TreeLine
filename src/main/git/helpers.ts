// Helpers compartilhados do motor Git (pré-10.4: viviam no main/index.ts).
// São puros de domínio: sem registro de IPC; usados pelos módulos `git/*`.
// Incluídos aqui para que um domínio evite depender de outro (ex.: os
// "continue" de merge/rebase/pick/revert importam `runContinue` de conflict).

import { promises as fs } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { simpleGit } from './git'
import { mx, type UILang } from '../messages'
import { parseLsFilesU } from '../conflict-stages'

/** Erro do git vira orientação acionável (remote sem credencial etc.). */
export function friendlySyncError(op: string, e: unknown, lang: UILang): Error {
  const msg = e instanceof Error ? e.message : String(e)
  if (/could not read Username|terminal prompts disabled|authentication failed|invalid username|credential/i.test(msg)) {
    return new Error(mx(lang, 'authFail', { op, d: msg.split('\n')[0] as string }))
  }
  // Divergência de branches: Pull com --ff-only falha — orientar merge/rebase.
  if (/diverg|non-fast-forward|cannot fast-forward|fast-forward.*failed/i.test(msg)) {
    return new Error(mx(lang, 'pullDivergent', { op, d: msg.split('\n')[0] as string }))
  }
  return e instanceof Error ? e : new Error(msg)
}

export async function exists(path: string): Promise<boolean> {
  try {
    await fs.stat(path)
    return true
  } catch {
    return false
  }
}

/** gitdir real do repo. Em worktree linkada/submódulo, `.git` é ARQUIVO
 * (`gitdir: ...`) — `join(repo,'.git',X)` não existe e o estado da operação
 * (merge/rebase/pick) dava falso-negativo. Ver ADR-013. */
export async function gitDirOf(repo: string): Promise<string> {
  try {
    const raw = (await simpleGit(repo).revparse(['--git-dir'])).trim()
    return isAbsolute(raw) ? raw : join(repo, raw)
  } catch {
    return join(repo, '.git')
  }
}

/** Erro do git vira orientação de conflito (merge/rebase/pick) quando for o caso. */
export function conflictErr(key: string, e: unknown, lang: UILang): Error {
  const msg = e instanceof Error ? e.message : String(e)
  if (/CONFLICT|conflict|needs merge|failed to merge/i.test(msg)) {
    return new Error(mx(lang, key, { d: msg.split('\n')[0] as string }))
  }
  return e instanceof Error ? e : new Error(msg)
}

/** Erro padrão em operações git - mensagens amigáveis em Português/Inglês.
 *  Converte erros brutos do git em orientação acionável para o usuário.
 */
export function gitOpError(op: string, e: unknown, lang: UILang): Error {
  const msg = e instanceof Error ? e.message : String(e)
  // Autenticação/credenciais
  if (/could not read Username|terminal prompts disabled|authentication failed|invalid username|credential/i.test(msg)) {
    return new Error(mx(lang, 'authFail', { op, d: msg.split('\n')[0] as string }))
  }
  // Branches divergentes
  if (/diverg|non-fast-forward|cannot fast-forward|fast-forward.*failed/i.test(msg)) {
    return new Error(mx(lang, 'pullDivergent', { op, d: msg.split('\n')[0] as string }))
  }
  // Conflitos de merge/rebase
  if (/CONFLICT|conflict|needs merge|failed to merge/i.test(msg)) {
    return new Error(mx(lang, 'gitConflict', { op, d: msg.split('\n')[0] as string }))
  }
  // Comando não encontrado ou repo inválido
  if (/not a git repository|not found|no such file|ENOENT/i.test(msg)) {
    return new Error(mx(lang, 'gitNotARepo', { op }))
  }
  // Tempo esgotado
  if (/timed out|timeout|deadline exceeded/i.test(msg)) {
    return new Error(mx(lang, 'gitTimeout', { op }))
  }
  // Erro genérico - retorna o original
  return e instanceof Error ? e : new Error(msg)
}

/** Arquivos ainda unmerged (`git ls-files -u`). Continuar a operação com um
 * destes no index cria um commit que carrega os marcadores de conflito —
 * por isso abortamos antes, com o nome do arquivo na mensagem. */
export async function unmergedPaths(repo: string): Promise<string[]> {
  // Sem `.catch(() => '')`: se o `ls-files -u` falhar (3.9), o erro PROPAGA
  // em vez de virar "nenhum conflito" — a UI mostra o erro real em vez de
  // fingir que a operação conflitante acabou.
  const raw = await simpleGit(repo).raw(['ls-files', '-u', '-z'])
  return parseLsFilesU(raw)
    .map((e) => e.path)
    .filter((p, i, a) => a.indexOf(p) === i)
}