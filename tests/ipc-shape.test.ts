import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Trava contra o bug "handler retorna função": todo IPC assíncrono passa
 * por `enqueue` (escrita serializada) ou `readOp` (leitura imediata).
 * Um `(async ...)` solto como retorno do handle devolve a FUNÇÃO ao
 * Electron ("An object could not be cloned") em vez da Promise —
 * bug real que quebrou getDiff/getHunks e esvaziou o app.
 *
 * Desde a Parte 10 (10.4/10.5) os handlers vivem em `src/main/{git,app}/*.ts`,
 * não mais no index.ts. O src abaixo concatena TODAS as fontes do main em
 * ordem alfabética — os `bodyOf` abaixo continuam encontrando o registro do
 * canal no arquivo do domínio correspondente.
 */
function mainSources(): string {
  const base = join(__dirname, '..', 'src', 'main')
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.ts')) files.push(p)
    }
  }
  walk(base)
  return files.sort().map((f) => readFileSync(f, 'utf-8')).join('\n\n')
}

describe('ipc handlers invocados', () => {
  const src = mainSources()

  it('nenhum async solto fora de enqueue/readOp', () => {
    const lines = src.split('\n')
    const bad: string[] = []
    lines.forEach((l, i) => {
      // opener de IIFE: "(async" com ou sem espaço, exceto callbacks
      // legítimos (.then(async, new Promise(async) etc. — esses têm prefixo
      // diferente de início de expressão).
      if (/^  \( ?async[ (]/.test(l)) {
        bad.push(`${i + 1}: ${l.trim().slice(0, 60)}`)
      }
    })
    expect(bad).toEqual([])
  })

  it('readOp existe e invoca', () => {
    const srcIndex = src
    const srcRunner = readFileSync(join(__dirname, '..', 'src', 'main', 'git', 'runner.ts'), 'utf-8')
    const has = srcIndex.includes('function readOp<T>') || srcRunner.includes('export function readOp<T>') || srcIndex.includes('export { readOp }') || srcRunner.includes('function readOp<T>')
    expect(has).toBe(true)
  })

  /**
   * Um handler que SÓ valida e nunca chama o git resolve sem erro e não faz
   * nada — o pior tipo de bug: a UI "funciona", o toast passa, e a operação
   * continua parada. Aconteceu de verdade com os quatro `*Continue` ao
   * inserir a guarda de unmerged: o `git commit --no-edit` foi substituído em
   * vez de precedido. Este teste exige que cada Continue realmente invoque o
   * comando git da operação.
   */
  it('todo handler *Continue roda o git e SEMPRE verifica o pós-condição', () => {
    // 1. o helper precisa realmente executar `git <args>`...
    const helper = src.slice(src.indexOf('async function runContinue'), src.indexOf("ipcMain.handle('treeline:mergeContinue'"))
    expect(helper).toContain('simpleGit(repo).raw(args)')
    // ...e precisa conferir se a operação ainda está viva: `simple-git`
    // só rejeita quando o git escreve no STDERR, então "nada a commitar"
    // (STDOUT + exit 1) resolve em silêncio e a UI mentiria sucesso.
    expect(helper, 'runContinue perdeu a pós-condição de operação viva').toContain('conflictLabels(repo)).op === null')
    expect(helper, 'runContinue perdeu a detecção de commit vazio').toContain("mx(l, 'continueEmpty'")

    const continues: Array<[string, string]> = [
      ['treeline:mergeContinue', "['commit', '--no-edit']"],
      ['treeline:rebaseContinue', "['rebase', '--continue']"],
      ['treeline:cherryPickContinue', "['cherry-pick', '--continue']"],
      ['treeline:revertContinue', "['revert', '--continue']"]
    ]
    for (const [channel, args] of continues) {
      const at = src.indexOf(`ipcMain.handle('${channel}'`)
      expect(at, `handler ${channel} não encontrado`).toBeGreaterThan(-1)
      const body = src.slice(at, src.indexOf('ipcMain.handle(', at + 10))
      expect(body, `${channel} não roda ${args}`).toContain(`runContinue(repo, ${args}`)
      // e a guarda de unmerged, senão commita com marcador dentro
      expect(body, `${channel} perdido a guarda de unmerged`).toContain('unmergedPaths(repo)')
    }
  })

  it('resolver por lado grava bundle antes (resolveOurs/Theirs/resolveConflictSide)', () => {
    // Os três delegam para o helper `resolveSideRaw`; é lá que o bundle sai.
    const helper = src.slice(src.indexOf('async function resolveSideRaw'), src.indexOf('treeline:resolveConflictSide'))
    expect(helper).toContain('backupBundle(repo)')
    // e o bundle é a PRIMEIRA coisa, antes de qualquer escrita no index
    expect(helper.indexOf('backupBundle(repo)')).toBeLessThan(helper.indexOf('`--${side}`'))
    expect(helper.indexOf('backupBundle(repo)')).toBeLessThan(helper.indexOf("raw(['rm', '-f'"))
    const at = src.indexOf("ipcMain.handle('treeline:resolveConflictSide'")
    expect(src.slice(at, src.indexOf('ipcMain.handle(', at + 10))).toContain('resolveSideRaw(repo, file, side')
  })

  /**
   * `git stash apply/pop` conflitante NÃO deixa MERGE_HEAD, então
   * `conflictLabels` devolve `null`: sem detector, o Continue ficaria
   * desabilitado (op === null) ou — pior — chamaria um `merge --continue`
   * inexistente, e `merge --abort` falharia com "no MERGE_HEAD".
   */
  it('stash conflitante: detectado, concluído sem comando git e abortado com reset --merge', () => {
    const bodyOf = (channel: string): string => {
      const at = src.indexOf(`ipcMain.handle('${channel}'`)
      expect(at, `handler ${channel} não encontrado`).toBeGreaterThan(-1)
      return src.slice(at, src.indexOf('ipcMain.handle(', at + 10))
    }

    const getOp = bodyOf('treeline:getConflictOp')
    expect(getOp, 'getConflictOp não distingue stash de "sem operação"').toContain(
      "unmergedPaths(repo)).length > 0 ? 'stash'"
    )

    const abort = bodyOf('treeline:abortStash')
    expect(abort, 'abortStash não devolve index/worktree ao HEAD').toContain("['reset', '--merge']")
    expect(abort, 'abortStash destrutivo sem bundle').toContain('backupBundle(repo)')
    expect(abort, 'abortStash fora da fila serializada').toMatch(/enqueue\(repo/)

    // No renderer: `stash` não tem `--continue`, então o Continue fecha o
    // overlay sem passar por nenhum `*Continue` do main.
    const store = readFileSync(join(__dirname, '..', 'src', 'renderer', 'store.ts'), 'utf-8')
    const cont = store.slice(store.indexOf('continueCurrentOp: async'), store.indexOf('abortCurrentOp: async'))
    expect(cont, 'Continue de stash rodaria merge --continue').toContain("op === 'stash'")
    expect(cont, 'Continue de stash não fecha o overlay').toContain('resolverOpen: false')
    const ab = store.slice(store.indexOf('abortCurrentOp: async'), store.indexOf('stageHunk: async'))
    expect(ab, 'Abort de stash chamaria merge --abort').toContain('window.treeline.abortStash(repo)')
  })

  /**
   * Stage/unstage em lote: 1 processo git para a worktree inteira ou para N
   * pathspecs. Antes o renderer disparava 1 IPC + 1 git POR ARQUIVO (travava
   * em repo grande). Este teste evita a regressão para o loop.
   */
  it('stage/unstage em lote: 1 comando git, não loop por arquivo', () => {
    const bodyOf = (channel: string): string => {
      const at = src.indexOf(`ipcMain.handle('${channel}'`)
      expect(at, `handler ${channel} não encontrado`).toBeGreaterThan(-1)
      return src.slice(at, src.indexOf('ipcMain.handle(', at + 10))
    }
    expect(bodyOf('treeline:stageAll'), 'stageAll não usa git add -A').toContain("['add', '-A']")
    expect(bodyOf('treeline:stageFiles'), 'stageFiles não batching pathspecs').toContain("['add', '--', ...safe]")
    expect(bodyOf('treeline:unstageAll'), 'unstageAll não usa reset HEAD').toContain("['reset', '-q', 'HEAD']")
    expect(bodyOf('treeline:unstageFiles'), 'unstageFiles não batching pathspecs').toContain(
      "['reset', '-q', 'HEAD', '--', ...safe]"
    )

    // O renderer usa os IPCs de lote (não mais o loop file-a-file).
    const store = readFileSync(join(__dirname, '..', 'src', 'renderer', 'store.ts'), 'utf-8')
    const all = store.slice(store.indexOf('stageAll: async'), store.indexOf('stageSelected: async'))
    expect(all, 'stageAll voltou a iterar arquivos').not.toContain('for (const file of files)')
    expect(all, 'stageAll não chama o IPC de lote').toContain('window.treeline.stageAll(current)')
    expect(all, 'unstageAll não chama o IPC de lote').toContain('window.treeline.unstageAll(current)')
  })

  /**
   * credential.helper: o main só aceita a allowlist (libsecret/cache/vazio) —
   * nunca deixa o renderer gravar `store` (texto puro) nem um valor arbitrário.
   */
  it('credential.helper restrito a allowlist', () => {
    const body = src.slice(src.indexOf("ipcMain.handle('treeline:setCredentialHelper'"))
    expect(body, 'aceita helper fora da allowlist').toContain("h !== 'libsecret' && h !== 'cache'")
  })

  it('confirm nativo removido (renderer usa ConfirmDialog interno)', () => {
    expect(src.includes("treeline:confirm'")).toBe(false)
  })
})
