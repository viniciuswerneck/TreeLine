import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { simpleGit } from 'simple-git'
import { enqueue, readOp } from './runner'
import { asLang, mx } from '../messages'
import { assertCloneUrl } from './validate'
import type { SyncResult } from '../../shared/types'

async function bookmarksFile(): Promise<string> {
  const { app } = await import('electron')
  return join(app.getPath('userData'), 'bookmarks.json')
}

async function readBookmarks(): Promise<string[]> {
  try {
    const bf = await bookmarksFile()
    const raw = await fs.readFile(bf, 'utf-8')
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list.filter((x: any): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

async function writeBookmarks(list: string[]): Promise<void> {
  try {
    const bf = await bookmarksFile()
    await fs.writeFile(bf, JSON.stringify(list.slice(0, 100), null, 2), 'utf-8')
  } catch {
    /* ignore */
  }
}

ipcMain.handle('treeline:openRepo', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const opts = {
    properties: ['openDirectory' as const],
    title: 'Open repository'
  }
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (res.canceled || res.filePaths.length === 0) return null
  const path = res.filePaths[0] as string
  await simpleGit(path).revparse(['--git-dir'])
  const list = [path, ...(await readBookmarks()).filter((p) => p !== path)]
  await writeBookmarks(list)
  return path
})
