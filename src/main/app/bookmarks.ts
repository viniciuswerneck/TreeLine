// Bookmarks (repos recentes): armazenados em bookmarks.json no userData.
// `listRepos` filtra diretórios que sumiram (4.1): um repo morto nunca vira
// "repositório atual" com erro de statusbar nem estado vazio fantasma.

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app, dialog, BrowserWindow, ipcMain } from 'electron'
import { simpleGit } from 'simple-git'

function bookmarksFile(): string {
  return join(app.getPath('userData'), 'bookmarks.json')
}

function asStringList(raw: string): string[] {
  try {
    const list = JSON.parse(raw) as unknown
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export async function readBookmarks(): Promise<string[]> {
  try {
    const list = asStringList(await fs.readFile(bookmarksFile(), 'utf-8'))
    if (list.length > 0) return list
  } catch {
    /* segue para a migração legada */
  }
  // Migração do nome antigo (GitNest -> TreeLine): o userData mudou de
  // ~/.config/GitNest para ~/.config/TreeLine; reaproveita uma vez.
  try {
    const legacy = join(app.getPath('userData'), '..', 'GitNest', 'bookmarks.json')
    const list = asStringList(await fs.readFile(legacy, 'utf-8'))
    if (list.length > 0) {
      await writeBookmarks(list)
      return list
    }
  } catch {
    /* sem legado: lista vazia */
  }
  return []
}

export async function writeBookmarks(list: string[]): Promise<string[]> {
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(bookmarksFile(), JSON.stringify(list.slice(0, 30), null, 2))
  return list.slice(0, 30)
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const st = await fs.stat(path)
    return st.isDirectory()
  } catch {
    return false
  }
}

/** Bookmarks cujos diretórios ainda existem; o que sumiu é removido. */
async function liveBookmarks(): Promise<string[]> {
  const list = await readBookmarks()
  const alive: string[] = []
  for (const p of list) {
    if (await dirExists(p)) alive.push(p)
  }
  if (alive.length !== list.length) await writeBookmarks(alive)
  return alive
}

ipcMain.handle('treeline:listRepos', async () => liveBookmarks())

ipcMain.handle('treeline:openRepo', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const opts = {
    properties: ['openDirectory' as const],
    title: 'Open repository'
  }
  const res = win
    ? await dialog.showOpenDialog(win, opts)
    : await dialog.showOpenDialog(opts)
  if (res.canceled || res.filePaths.length === 0) return null
  const path = res.filePaths[0] as string
  // Valida que é um repo git antes de aceitar.
  await simpleGit(path).revparse(['--git-dir'])
  const list = [path, ...(await readBookmarks()).filter((p) => p !== path)]
  await writeBookmarks(list)
  return path
})

ipcMain.handle('treeline:addRecent', async (_event, path: string) => {
  const list = [path, ...(await readBookmarks()).filter((p) => p !== path)]
  return writeBookmarks(list)
})

ipcMain.handle('treeline:removeRecent', async (_event, path: string) => {
  const list = (await readBookmarks()).filter((p) => p !== path)
  return writeBookmarks(list)
})