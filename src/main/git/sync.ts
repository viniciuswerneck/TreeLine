// Sincronização com remoto: push/pull/fetch, publicação de branch (push -u),
// force-push com lease e cancelamento de operação de rede em andamento.

import { ipcMain } from 'electron'
import { simpleGit } from './git'
import { mx, asLang } from '../messages'
import { enqueue, runGitCancellable, syncControllers, syncKey } from './runner'
import { assertSafeRef } from './validate'
import { friendlySyncError } from './helpers'

/** Nome simbólico do upstream (ex: "origin/main") ou '' sem tracking. */
async function upstreamName(repo: string): Promise<string> {
  try {
    return (await simpleGit(repo).revparse(['--abbrev-ref', '--symbolic-full-name', '@{u}'])).trim()
  } catch {
    return ''
  }
}

async function refHash(repo: string, ref: string): Promise<string> {
  try {
    return (await simpleGit(repo).revparse([ref])).trim()
  } catch {
    return ''
  }
}

/** Remoto do upstream (`origin/main` → `origin`; sem slash, `origin`). */
function remoteOfUpstream(up: string): string {
  const slash = up.indexOf('/')
  return slash > 0 ? up.slice(0, slash) : 'origin'
}

/** Remoto default para publicar: `origin` se existir, senão o primeiro. */
export async function defaultRemote(repo: string, l: ReturnType<typeof asLang>): Promise<string> {
  const raw = await simpleGit(repo).raw(['remote'])
  const remotes = raw.split('\n').map((r) => r.trim()).filter(Boolean)
  if (remotes.includes('origin')) return 'origin'
  const first = remotes[0]
  if (!first) throw new Error(mx(l, 'noUpstream', { b: 'HEAD' }))
  return first
}

ipcMain.handle('treeline:cancelSync', (_event, repo: string, op: string) => {
  // Chave exata `${repo}:${op}` (mesma gravada em runGitCancellable); o
  // fallback por `op` cobre o clone, que roda no diretório PAI — o renderer
  // não conhece o destino e manda repo=''. Clone é o único com chave colidível
  // (dois destinos no MESMO pai): nesse caso cancela todos os clones.
  const exact = syncControllers.get(syncKey(repo, op))
  const targets =
    op === 'Clone'
      ? [...syncControllers.values()].filter((c) => c.op === op)
      : exact
        ? [exact]
        : [...syncControllers.values()].filter((c) => c.op === op)
  for (const c of targets) {
    // Marca o cancel ANTES do term(): o 'close' decide a mensagem por flag,
    // e sem cancelled=true o kill vira "falhou (exit -1)" genérico.
    c.cancelled = true
    c.term()
  }
})

ipcMain.handle('treeline:push', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, async (): Promise<import('../../shared/types').SyncResult> => {
    const l = asLang(lang)
    const up = await upstreamName(repo)
    if (!up) {
      let cur = 'HEAD'
      try {
        cur = (await simpleGit(repo).revparse(['--abbrev-ref', 'HEAD'])).trim()
      } catch {
        /* segue */
      }
      throw new Error(mx(l, 'noUpstream', { b: cur }))
    }
    const upBranch = up.slice(up.indexOf('/') + 1)
    if (!upBranch || upBranch.startsWith('-')) throw new Error(mx(l, 'noUpstream', { b: up }))
    const cur = (await simpleGit(repo).revparse(['--abbrev-ref', 'HEAD'])).trim()
    if (!cur || cur === 'HEAD') throw new Error(mx(l, 'nameInvalid', { x: cur }))
    assertSafeRef(cur, l)
    const before = await refHash(repo, '@{u}')
    // Push com refspec explícito `local:upstream`: nunca "empurra tudo" nem
    // entrega hash no lugar de branch (protege detached HEAD). Empurra para o
    // REMOTO do upstream (pode ser `fork/main`), não `origin` fixo.
    try {
      const remote = remoteOfUpstream(up)
      await runGitCancellable(repo, 'Push', ['push', remote, `${cur}:${upBranch}`], l)
    } catch (e) {
      throw friendlySyncError('Push', e, l)
    }
    const after = await refHash(repo, '@{u}')
    if (before && after && before !== after) {
      return { summary: mx(l, 'pushDone', { x: `${cur} → ${up}` }) }
    }
    return { summary: mx(l, 'pushUpToDate') }
  })
)

ipcMain.handle('treeline:pull', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, async (): Promise<import('../../shared/types').SyncResult> => {
    const l = asLang(lang)
    const before = await refHash(repo, 'HEAD')
    try {
      // ff-only por segurança: divergência vira erro legível em vez de merge surpresa.
      await runGitCancellable(repo, 'Pull', ['pull', '--ff-only'], l)
    } catch (e) {
      throw friendlySyncError('Pull', e, l)
    }
    const after = await refHash(repo, 'HEAD')
    if (!before || !after || before === after) return { summary: mx(l, 'pullUpToDate') }
    let n = 0
    let i = 0
    let d = 0
    try {
      const st = await simpleGit(repo).raw(['diff', '--shortstat', before, after])
      n = Number(/(\d+) files? changed/.exec(st)?.[1] ?? 0)
      i = Number(/(\d+) insertions?/.exec(st)?.[1] ?? 0)
      d = Number(/(\d+) deletions?/.exec(st)?.[1] ?? 0)
    } catch {
      /* resumo sem números */
    }
    return { summary: mx(l, 'pullDone', { n, i, d }) }
  })
)

ipcMain.handle('treeline:fetch', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, async (): Promise<import('../../shared/types').SyncResult> => {
    const l = asLang(lang)
    const snap = async (): Promise<Map<string, string>> => {
      const m = new Map<string, string>()
      try {
        const raw = await simpleGit(repo).raw(['for-each-ref', '--format=%(objectname)%09%(refname)', 'refs/remotes'])
        for (const line of raw.split('\n')) {
          const [h, ref] = line.split('\t')
          if (h?.trim() && ref?.trim()) m.set(ref.trim(), h.trim())
        }
      } catch {
        /* sem remotos */
      }
      return m
    }
    const before = await snap()
    try {
      await runGitCancellable(repo, 'Fetch', ['fetch', '--all', '--prune'], l)
    } catch (e) {
      throw friendlySyncError('Fetch', e, l)
    }
    const after = await snap()
    let updated = 0
    for (const [ref, h] of after) {
      if (before.get(ref) !== h) updated++
    }
    for (const ref of before.keys()) {
      if (!after.has(ref)) updated++
    }
    const extra = updated > 0 ? mx(l, 'fetchUpdated', { n: updated }) : ''
    return { summary: `${mx(l, 'fetchDone')}${extra}` }
  })
)

/** Publica o branch atual: `push -u origin <branch>` (primeiro push). */
ipcMain.handle('treeline:pushPublish', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, async (): Promise<import('../../shared/types').SyncResult> => {
    const l = asLang(lang)
    const cur = (await simpleGit(repo).revparse(['--abbrev-ref', 'HEAD'])).trim()
    if (!cur || cur === 'HEAD') throw new Error(mx(l, 'nameInvalid', { x: cur }))
    // Sem upstream: publica no `origin` (ou primeiro remoto), não no fixo.
    const remote = await defaultRemote(repo, l)
    try {
      await runGitCancellable(repo, 'Push', ['push', '-u', remote, cur], l)
    } catch (e) {
      throw friendlySyncError('Push', e, l)
    }
    return { summary: mx(l, 'pushDone', { x: `${cur} → ${remote}/${cur}` }) }
  })
)

ipcMain.handle('treeline:pushForce', (_event, repo: string, forceLease: boolean, lang?: unknown) =>
  enqueue(repo, async (): Promise<import('../../shared/types').SyncResult> => {
    const l = asLang(lang)
    const up = await upstreamName(repo)
    if (!up) throw new Error(mx(l, 'noUpstream', { b: 'HEAD' }))
    const upBranch = up.slice(up.indexOf('/') + 1)
    if (!upBranch || upBranch.startsWith('-')) throw new Error(mx(l, 'noUpstream', { b: up }))
    const cur = (await simpleGit(repo).revparse(['--abbrev-ref', 'HEAD'])).trim()
    if (!cur || cur === 'HEAD') throw new Error(mx(l, 'nameInvalid', { x: cur }))
    assertSafeRef(cur, l)
    // Refpec explícito + `--force-with-lease` (nunca `--force` sem proteção):
    // só reescreve o branch atual no upstream atual.
    const remote = remoteOfUpstream(up)
    const args = forceLease
      ? ['push', '--force-with-lease', remote, `${cur}:${upBranch}`]
      : ['push', remote, `${cur}:${upBranch}`]
    try {
      await runGitCancellable(repo, 'Push', args, l)
    } catch (e) {
      throw friendlySyncError('Push', e, l)
    }
    return { summary: mx(l, 'pushLeaseDone', { x: forceLease ? `${cur} → ${up} (lease)` : cur }) }
  })
)