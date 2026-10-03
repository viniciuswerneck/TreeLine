import { contextBridge, ipcRenderer } from 'electron'
import type { TreeLineAPI } from '../shared/types'

// Bridge mínima e tipada. Renderer nunca acessa Node/Electron direto.
const api: TreeLineAPI = {
  listRepos: () => ipcRenderer.invoke('treeline:listRepos'),
  openRepo: () => ipcRenderer.invoke('treeline:openRepo'),
  addRecent: (path: string) => ipcRenderer.invoke('treeline:addRecent', path),
  getStatus: (repo: string) => ipcRenderer.invoke('treeline:getStatus', repo),
  getLog: (repo: string, limit?: number) => ipcRenderer.invoke('treeline:getLog', repo, limit),
  getBranches: (repo: string) => ipcRenderer.invoke('treeline:getBranches', repo),
  getDiff: (repo: string, file: string, staged: boolean) =>
    ipcRenderer.invoke('treeline:getDiff', repo, file, staged),
  stage: (repo: string, file: string) => ipcRenderer.invoke('treeline:stage', repo, file),
  unstage: (repo: string, file: string) => ipcRenderer.invoke('treeline:unstage', repo, file),
  commit: (repo: string, message: string, amend?: boolean, lang?: string) =>
    ipcRenderer.invoke('treeline:commit', repo, message, amend, lang),
  push: (repo: string, lang?: string) => ipcRenderer.invoke('treeline:push', repo, lang),
  pull: (repo: string, lang?: string) => ipcRenderer.invoke('treeline:pull', repo, lang),
  fetch: (repo: string, lang?: string) => ipcRenderer.invoke('treeline:fetch', repo, lang),
  getIdentity: () => ipcRenderer.invoke('treeline:getIdentity'),
  setIdentity: (id: { name: string; email: string }, lang?: string) =>
    ipcRenderer.invoke('treeline:setIdentity', id, lang),
  getCommitDetail: (repo: string, hash: string) => ipcRenderer.invoke('treeline:getCommitDetail', repo, hash),
  getCommitDiff: (repo: string, hash: string, file: string) =>
    ipcRenderer.invoke('treeline:getCommitDiff', repo, hash, file),
  reveal: (path: string) => ipcRenderer.invoke('treeline:reveal', path),
  removeRecent: (path: string) => ipcRenderer.invoke('treeline:removeRecent', path),
  discard: (repo: string, file: string, tracked: boolean, lang?: string) =>
    ipcRenderer.invoke('treeline:discard', repo, file, tracked, lang),
  copyText: (text: string) => ipcRenderer.invoke('treeline:copyText', text)
}

contextBridge.exposeInMainWorld('treeline', api)
