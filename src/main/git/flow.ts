// Git-flow: usa `git flow` se instalado, senão a convenção de branches
// (`feature/x` a partir de develop/main). Só opera em fila do repo.

import { ipcMain } from 'electron'
import { simpleGit } from './git'
import { mx, asLang, type UILang } from '../messages'
import { enqueue, readOp } from './runner'
import { assertRefName, assertSafeRef } from './validate'
import { conflictErr } from './helpers'

// O tipo vem por IPC como string: fecha o conjunto para `git flow <tipo>` não
// virar flag do git (o TS marca a union, mas o renderer não é confiável).
const FLOW_TYPES = new Set<import('../../shared/types').FlowType>(['feature', 'release', 'hotfix'])

// O nome do item vira argv (`git flow <tipo> start <n>` e `merge feature/<n>`):
// sem isso, `-f`/`--no-ff` seriam opções do git e não nome de branch.
function assertFlowItem(n: string, l: UILang): string {
  assertSafeRef(n, l, 'nameInvalid')
  return n
}

ipcMain.handle('treeline:detectFlow', (_event, repo: string) =>
  // READ: fora da fila de escrita (refresh não trava em sync longa).
  readOp(async () => {
    try {
      await simpleGit(repo).raw(['flow', 'version'])
      return { installed: true }
    } catch {
      return { installed: false }
    }
  })
)

async function flowBase(repo: string, type: import('../../shared/types').FlowType): Promise<string> {
  const want = type === 'hotfix' ? ['main', 'master'] : ['develop', 'main', 'master']
  const b = await simpleGit(repo).branchLocal()
  for (const name of want) {
    if (b.all.includes(name)) return name
  }
  throw new Error('no-base')
}

ipcMain.handle('treeline:flowStart', (_event, repo: string, type: import('../../shared/types').FlowType, name: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    if (!FLOW_TYPES.has(type)) throw new Error(mx(l, 'nameInvalid', { x: type }))
    const n = assertFlowItem(name.trim().replace(/^\w+\//, ''), l)
    const full = `${type}/${n}`
    assertRefName(full, l)
    // Colisão de namespace: `feature` existente trava `feature/qa` (e vice-versa).
    const existing = (await simpleGit(repo).branchLocal()).all
    const clash = existing.find((b) => b === full || b.startsWith(full + '/') || full.startsWith(b + '/'))
    if (clash) throw new Error(mx(l, 'flowTaken', { x: full, y: clash }))
    const flow = await simpleGit(repo).raw(['flow', 'version']).then(() => true).catch(() => false)
    if (flow) {
      await simpleGit(repo).raw(['flow', type, 'start', n])
    } else {
      const base = await flowBase(repo, type).catch((): never => {
        throw new Error(mx(l, 'flowNoBase', { t: type, n }))
      })
      await simpleGit(repo).checkoutBranch(full, base)
    }
    return full
  })
)

ipcMain.handle('treeline:flowFinish', (_event, repo: string, type: import('../../shared/types').FlowType, name: string, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    if (!FLOW_TYPES.has(type)) throw new Error(mx(l, 'nameInvalid', { x: type }))
    const item = assertFlowItem(name.trim(), l)
    const flow = await simpleGit(repo).raw(['flow', 'version']).then(() => true).catch(() => false)
    if (flow) {
      try {
        await simpleGit(repo).raw(['flow', type, 'finish', '-m', `Finish ${type}/${name}`, item])
      } catch (e) {
        throw conflictErr('mergeConflicts', e, l)
      }
      return
    }
    const branch = `${type}/${item}`
    const exists = (await simpleGit(repo).branchLocal()).all.includes(branch)
    if (!exists) throw new Error(mx(l, 'flowMissing', { x: branch }))
    const base = await flowBase(repo, type).catch((): never => {
      throw new Error(mx(l, 'flowNoBase', { t: type, n: name }))
    })
    const git = simpleGit(repo)
    await git.checkout(base)
    try {
      await git.merge([branch, '--no-ff'])
    } catch (e) {
      throw conflictErr('mergeConflicts', e, l)
    }
    await git.branch(['-d', branch])
  })
)