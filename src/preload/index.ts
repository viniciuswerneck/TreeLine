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
  commit: (repo: string, message: string, amend?: boolean) =>
    ipcRenderer.invoke('treeline:commit', repo, message, amend),
  push: (repo: string) => ipcRenderer.invoke('treeline:push', repo),
  pull: (repo: string) => ipcRenderer.invoke('treeline:pull', repo),
  fetch: (repo: string) => ipcRenderer.invoke('treeline:fetch', repo),
  getIdentity: () => ipcRenderer.invoke('treeline:getIdentity'),
  setIdentity: (id: { name: string; email: string }) => ipcRenderer.invoke('treeline:setIdentity', id),
  getCommitDetail: (repo: string, hash: string) => ipcRenderer.invoke('treeline:getCommitDetail', repo, hash),
  getCommitDiff: (repo: string, hash: string, file: string) =>
    ipcRenderer.invoke('treeline:getCommitDiff', repo, hash, file),
  reveal: (path: string) => ipcRenderer.invoke('treeline:reveal', path),
  removeRecent: (path: string) => ipcRenderer.invoke('treeline:removeRecent', path),
  discard: (repo: string, file: string, tracked: boolean) =>
    ipcRenderer.invoke('treeline:discard', repo, file, tracked),
  copyText: (text: string) => ipcRenderer.invoke('treeline:copyText', text)
}

contextBridge.exposeInMainWorld('treeline', api)
