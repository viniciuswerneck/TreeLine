// Backups `git bundle` (1 bundle por operação destrutiva) + patches de hunk.
// Namespace isolado `treeline-backups/` dentro do gitdir. É a base do
// "undo universal" (Parte 9.1) e da Camada 1/P2 da estratégia.

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import { simpleGit } from 'simple-git'
import { mx, asLang } from '../messages'
import { enqueue, readOp } from './runner'
import { gitDirOf } from './helpers'

/** Backup `git bundle --all` antes de operação destrutiva; retorna o path. */
export async function backupBundle(repo: string): Promise<string> {
  const dir = join(await gitDirOf(repo), 'treeline-backups')
  await fs.mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = join(dir, `${stamp}.bundle`)
  await simpleGit(repo).raw(['bundle', 'create', file, '--all'])
  return file
}

/**
 * Backup proporcional ao descarte de hunk/linha: guarda o patch atual do
 * arquivo (worktree ou index) em `treeline-backups`, sem `bundle --all`
 * (que num repo grande custaria segundos por clique). Best-effort.
 */
export async function backupDiscard(repo: string, file: string, staged: boolean): Promise<void> {
  try {
    const dir = join(await gitDirOf(repo), 'treeline-backups')
    await fs.mkdir(dir, { recursive: true })
    const patch = await simpleGit(repo)
      .raw(['diff', ...(staged ? ['--cached'] : []), '--', file])
      .catch(() => '')
    if (!patch.trim()) return
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safe = file.replace(/[/\\]/g, '_')
    await fs.writeFile(join(dir, `${stamp}-${safe}.patch`), patch)
  } catch {
    /* backup é best-effort: nunca impede o descarte */
  }
}

ipcMain.handle('treeline:listBackups', (_event, repo: string) =>
  readOp(async (): Promise<import('../../shared/types').BackupInfo[]> => {
    const dir = join(await gitDirOf(repo), 'treeline-backups')
    let files: string[] = []
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith('.bundle'))
    } catch {
      return []
    }
    const out: import('../../shared/types').BackupInfo[] = []
    for (const f of files) {
      try {
        const st = await fs.stat(join(dir, f))
        out.push({ file: f, date: st.mtime.toISOString(), size: st.size })
      } catch {
        /* some */
      }
    }
    return out.sort((a, b) => (a.date < b.date ? 1 : -1))
  })
)

ipcMain.handle('treeline:restoreBackup', (_event, repo: string, file: string, lang?: unknown) =>
  enqueue(repo, async (): Promise<import('../../shared/types').SyncResult> => {
    const l = asLang(lang)
    // Sem path traversal: só basename *.bundle do nosso dir.
    const base = file.split('/').pop()?.split('\\').pop() ?? ''
    if (!base.endsWith('.bundle') || base !== file) throw new Error(mx(l, 'nameInvalid', { x: file }))
    const stamp = base.replace(/\.bundle$/, '').replace(/[^0-9A-Za-z-]/g, '')
    const ns = `treeline-restore-${stamp || 'x'}`
    await simpleGit(repo).raw(['fetch', join(await gitDirOf(repo), 'treeline-backups', base), `+refs/heads/*:refs/heads/${ns}/*`])
    const raw = await simpleGit(repo).raw(['for-each-ref', '--format=%(refname:short)', `refs/heads/${ns}`])
    const n = raw.split('\n').map((s) => s.trim()).filter(Boolean).length
    return { summary: mx(l, 'backupRestored', { n, x: ns }) }
  })
)