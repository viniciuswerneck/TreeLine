// Ajustes do app: idioma persistido no userData e versão do pacote.

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'

ipcMain.handle('treeline:setLang', async (_event, lang: string) => {
  const l = lang === 'pt' || lang === 'es' || lang === 'en' ? lang : 'en'
  try {
    await fs.writeFile(join(app.getPath('userData'), 'lang'), l)
  } catch {
    /* segue sem persistir */
  }
})

ipcMain.handle('treeline:getVersion', () => app.getVersion())