// Status da worktree (porcelain interno do simple-git) + lista de arquivos
// rastreados em HEAD.

import { ipcMain } from 'electron'
import { simpleGit } from 'simple-git'
import { readIndexOp, readOp } from './runner'

ipcMain.handle('treeline:getStatus', (_event, repo: string) =>
  // READ: lê fora da fila de escrita, MAS `git status` faz refresh de stat no
  // índice — espera escritas enfileiradas do repo para não brigar com o
  // `index.lock` de um commit/stage em andamento (3.7).
  readIndexOp(repo, async (): Promise<import('../../shared/types').RepoStatus> => {
    const s = await simpleGit(repo).status()
    const staged = s.files.filter((f) => f.index !== ' ' && f.index !== '?').map((f) => ({ path: f.path, code: `${f.index}${f.working_dir}` }))
    // Untracked (??) sai em lista própria: se ficar aqui, conta e renderiza em dobro.
    const unstaged = s.files.filter((f) => f.working_dir !== ' ' && f.index !== '?').map((f) => ({ path: f.path, code: `${f.index}${f.working_dir}` }))
    const untracked = s.files.filter((f) => f.index === '?' && f.working_dir === '?').map((f) => f.path)
    // HEAD destacado em tag exata: mostra qual (ex: "v1.0.0").
    let detachedTag: string | null = null
    if (s.detached) {
      try {
        detachedTag = (await simpleGit(repo).raw(['describe', '--exact-match', '--tags', 'HEAD'])).trim() || null
      } catch {
        detachedTag = null
      }
    }
    return {
      branch: s.current ?? '(detached)',
      ahead: s.ahead ?? 0,
      behind: s.behind ?? 0,
      staged,
      unstaged,
      untracked,
      conflicted: s.conflicted ?? [],
      detachedTag
    }
  })
)

ipcMain.handle('treeline:getTrackedFiles', (_event, repo: string) =>
  readOp(async (): Promise<string[]> => {
    try {
      const out = await simpleGit(repo).raw(['ls-tree', '-r', '-z', '--name-only', 'HEAD'])
      return out.split('\0').map((x) => x.trim()).filter(Boolean)
    } catch {
      return []
    }
  })
)