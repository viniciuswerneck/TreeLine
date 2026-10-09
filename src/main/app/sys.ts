// Utilidades de SO: revelar arquivo no gerenciador e copiar texto.

import { ipcMain, shell, clipboard } from 'electron'

ipcMain.handle('treeline:reveal', (_event, path: string) => {
  shell.showItemInFolder(path)
})

ipcMain.handle('treeline:copyText', (_event, text: string) => {
  clipboard.writeText(text)
})