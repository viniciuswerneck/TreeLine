// Submódulos: listar (recursivo) com estado e atualizar (init + update).

import { ipcMain } from 'electron'
import { simpleGit } from 'simple-git'
import { mx, asLang } from '../messages'
import { enqueue, readOp } from './runner'

ipcMain.handle('treeline:getSubmodules', (_event, repo: string) =>
  // READ: fora da fila de escrita.
  readOp(async (): Promise<import('../../shared/types').SubmoduleInfo[]> => {
    let raw = ''
    try {
      // --recursive: sub-submódulos (inner/deep) também aparecem na lista.
      raw = await simpleGit(repo).raw(['submodule', 'status', '--recursive'])
    } catch {
      return []
    }
    return raw.split('\n').flatMap((line) => {
      const m = /^([ +-U]?)([0-9a-f]{40}) (\S+)( \((.*)\))?$/.exec(line)
      if (!m?.[2] || !m?.[3]) return []
      return [{
        hash: m[2] as string,
        path: m[3] as string,
        state: (m[1] || ' ').trim() === '' ? ' ' : (m[1] as string),
        label: (m[5] ?? '').trim()
      }]
    })
  })
)

ipcMain.handle('treeline:updateSubmodules', (_event, repo: string, lang?: unknown) =>
  enqueue(repo, async () => {
    try {
      await simpleGit(repo).raw(['submodule', 'update', '--init', '--recursive'])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(mx(asLang(lang), 'submoduleFail', { d: msg.split('\n')[0] as string }))
    }
  })
)