// Stage/unstage/commit, reset direto e descarte de arquivo. Lotes usam 1
// processo git (stageAll/unstageAll/stageFiles), nunca 1 IPC por arquivo.

import { join } from 'node:path'
import { ipcMain, shell } from 'electron'
import { simpleGit } from 'simple-git'
import { mx, asLang } from '../messages'
import { enqueue } from './runner'
import { assertSafeRef, relPathSafe } from './validate'
import { backupBundle } from './backup'

ipcMain.handle('treeline:stage', (_event, repo: string, file: string) =>
  // `--` obrigatório: sem ele um arquivo chamado `-p`/`--all` na worktree
  // vira opção do git (option injection).
  enqueue(repo, () => simpleGit(repo).raw(['add', '--', file]).then(() => undefined))
)

ipcMain.handle('treeline:unstage', (_event, repo: string, file: string) =>
  enqueue(repo, async () => {
    // HEAD pode não existir (branch unborn): o reset com tree-ish falha, mas
    // sem ele esvazia o index sem tocar na worktree (mesmo da unstageAll).
    try {
      await simpleGit(repo).raw(['reset', '-q', 'HEAD', '--', file])
    } catch {
      await simpleGit(repo).raw(['reset', '-q', '--', file])
    }
  })
)

// Lote: 1 processo git para toda a worktree. O `stageAll`/`unstageAll` do
// renderer antes disparava 1 IPC + 1 git POR ARQUIVO (travava em repo grande).
ipcMain.handle('treeline:stageAll', (_event, repo: string) =>
  enqueue(repo, () => simpleGit(repo).raw(['add', '-A']).then(() => undefined))
)

ipcMain.handle('treeline:unstageAll', (_event, repo: string) =>
  enqueue(repo, async () => {
    // HEAD não existe em branch unborn: cai para o reset sem tree-ish, que
    // esvazia o index sem tocar na worktree.
    try {
      await simpleGit(repo).raw(['reset', '-q', 'HEAD'])
    } catch {
      await simpleGit(repo).raw(['reset', '-q'])
    }
  })
)

// Lote por lista de arquivos (seleção múltipla): 1 processo git com N pathspecs.
// `--` impede option injection; paths absolutos e `..` são descartados.
function safeRelPaths(files: unknown): string[] {
  if (!Array.isArray(files)) return []
  return files
    .filter((f): f is string => typeof f === 'string')
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => f.length > 0 && !f.startsWith('/') && !f.split('/').includes('..'))
}

ipcMain.handle('treeline:stageFiles', (_event, repo: string, files: unknown) =>
  enqueue(repo, () => {
    const safe = safeRelPaths(files)
    if (safe.length === 0) return Promise.resolve()
    return simpleGit(repo).raw(['add', '--', ...safe]).then(() => undefined)
  })
)

ipcMain.handle('treeline:unstageFiles', (_event, repo: string, files: unknown) =>
  enqueue(repo, async () => {
    const safe = safeRelPaths(files)
    if (safe.length === 0) return
    await simpleGit(repo).raw(['reset', '-q', 'HEAD', '--', ...safe])
  })
)

ipcMain.handle('treeline:commit', (_event, repo: string, message: string, amend?: boolean, lang?: unknown) =>
  enqueue(repo, async () => {
    const l = asLang(lang)
    if (!message.trim()) throw new Error(mx(l, 'commitEmpty'))
    // simple-git não rejeita commit sem nada em stage (vira no-op silencioso).
    const st = await simpleGit(repo).status()
    const stagedCount = st.files.filter((f) => f.index !== ' ' && f.index !== '?').length
    if (stagedCount === 0 && !amend) throw new Error(mx(l, 'nothingStaged'))
    await simpleGit(repo).commit(message, undefined, amend ? { '--amend': null } : undefined)
  })
)

ipcMain.handle('treeline:resetTo', (_event, repo: string, ref: string, mode: import('../../shared/types').ResetMode, lang?: unknown) =>
  enqueue(repo, async (): Promise<import('../../shared/types').SyncResult> => {
    const l = asLang(lang)
    assertSafeRef(ref, l)
    const m = mode === 'soft' || mode === 'hard' ? mode : 'mixed'
    const target = ref.trim() || 'HEAD'
    await backupBundle(repo)
    await simpleGit(repo).raw(['reset', `--${m}`, target])
    return { summary: mx(l, 'resetDone', { m, r: target }) }
  })
)

ipcMain.handle('treeline:discard', async (_event, repo: string, file: string, tracked: boolean, lang?: unknown) => {
  const rel = relPathSafe(repo, file, asLang(lang))
  if (!rel) return
  await enqueue(repo, async () => {
    if (tracked) {
      await backupBundle(repo)
      await simpleGit(repo).raw(['checkout', '--', rel])
    } else {
      await shell.trashItem(join(repo, rel))
    }
  })
})