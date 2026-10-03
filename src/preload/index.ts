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
  copyText: (text: string) => ipcRenderer.invoke('treeline:copyText', text),
  confirm: (title: string, message: string, detail: string, ok: string, cancel: string) =>
    ipcRenderer.invoke('treeline:confirm', title, message, detail, ok, cancel),
  createBranch: (repo: string, name: string, from: string, checkout: boolean, lang?: string) =>
    ipcRenderer.invoke('treeline:createBranch', repo, name, from, checkout, lang),
  checkoutBranch: (repo: string, name: string, lang?: string) =>
    ipcRenderer.invoke('treeline:checkoutBranch', repo, name, lang),
  renameBranch: (repo: string, oldName: string, newName: string, lang?: string) =>
    ipcRenderer.invoke('treeline:renameBranch', repo, oldName, newName, lang),
  deleteBranch: (repo: string, name: string, force: boolean, lang?: string) =>
    ipcRenderer.invoke('treeline:deleteBranch', repo, name, force, lang),
  getMergeState: (repo: string) => ipcRenderer.invoke('treeline:getMergeState', repo),
  mergePreview: (repo: string, ref: string) => ipcRenderer.invoke('treeline:mergePreview', repo, ref),
  mergeBranch: (repo: string, ref: string, noFf: boolean, lang?: string) =>
    ipcRenderer.invoke('treeline:mergeBranch', repo, ref, noFf, lang),
  mergeContinue: (repo: string, lang?: string) => ipcRenderer.invoke('treeline:mergeContinue', repo, lang),
  abortMerge: (repo: string) => ipcRenderer.invoke('treeline:abortMerge', repo),
  getStashes: (repo: string) => ipcRenderer.invoke('treeline:getStashes', repo),
  createStash: (repo: string, message: string, includeUntracked: boolean, lang?: string) =>
    ipcRenderer.invoke('treeline:createStash', repo, message, includeUntracked, lang),
  applyStash: (repo: string, ref: string, lang?: string) =>
    ipcRenderer.invoke('treeline:applyStash', repo, ref, lang),
  popStash: (repo: string, ref: string, lang?: string) =>
    ipcRenderer.invoke('treeline:popStash', repo, ref, lang),
  dropStash: (repo: string, ref: string, lang?: string) =>
    ipcRenderer.invoke('treeline:dropStash', repo, ref, lang),
  getTags: (repo: string) => ipcRenderer.invoke('treeline:getTags', repo),
  createTag: (repo: string, name: string, message: string, commit: string, lang?: string) =>
    ipcRenderer.invoke('treeline:createTag', repo, name, message, commit, lang),
  pushTag: (repo: string, name: string, lang?: string) =>
    ipcRenderer.invoke('treeline:pushTag', repo, name, lang),
  deleteTag: (repo: string, name: string, remoteToo: boolean, lang?: string) =>
    ipcRenderer.invoke('treeline:deleteTag', repo, name, remoteToo, lang),
  getRebaseState: (repo: string) => ipcRenderer.invoke('treeline:getRebaseState', repo),
  rebaseOnto: (repo: string, ref: string, lang?: string) =>
    ipcRenderer.invoke('treeline:rebaseOnto', repo, ref, lang),
  rebaseContinue: (repo: string, lang?: string) => ipcRenderer.invoke('treeline:rebaseContinue', repo, lang),
  abortRebase: (repo: string) => ipcRenderer.invoke('treeline:abortRebase', repo),
  getCherryPickState: (repo: string) => ipcRenderer.invoke('treeline:getCherryPickState', repo),
  cherryPick: (repo: string, hash: string, lang?: string) =>
    ipcRenderer.invoke('treeline:cherryPick', repo, hash, lang),
  cherryPickContinue: (repo: string, lang?: string) =>
    ipcRenderer.invoke('treeline:cherryPickContinue', repo, lang),
  abortCherryPick: (repo: string) => ipcRenderer.invoke('treeline:abortCherryPick', repo),
  detectFlow: (repo: string) => ipcRenderer.invoke('treeline:detectFlow', repo),
  flowStart: (repo: string, type: string, name: string, lang?: string) =>
    ipcRenderer.invoke('treeline:flowStart', repo, type, name, lang),
  flowFinish: (repo: string, type: string, name: string, lang?: string) =>
    ipcRenderer.invoke('treeline:flowFinish', repo, type, name, lang),
  openTerminal: (repo: string, lang?: string) => ipcRenderer.invoke('treeline:openTerminal', repo, lang),
  getReflog: (repo: string, limit?: number) => ipcRenderer.invoke('treeline:getReflog', repo, limit),
  undoToReflog: (repo: string, ref: string, lang?: string) =>
    ipcRenderer.invoke('treeline:undoToReflog', repo, ref, lang),
  getRemotes: (repo: string) => ipcRenderer.invoke('treeline:getRemotes', repo),
  addRemote: (repo: string, name: string, url: string, lang?: string) =>
    ipcRenderer.invoke('treeline:addRemote', repo, name, url, lang),
  removeRemote: (repo: string, name: string, lang?: string) =>
    ipcRenderer.invoke('treeline:removeRemote', repo, name, lang),
  cloneRepo: (url: string, lang?: string) => ipcRenderer.invoke('treeline:cloneRepo', url, lang),
  initRepo: (lang?: string) => ipcRenderer.invoke('treeline:initRepo', lang),
  termStart: (repo: string, cols: number, rows: number) =>
    ipcRenderer.invoke('treeline:termStart', repo, cols, rows),
  termWrite: (repo: string, data: string) => ipcRenderer.invoke('treeline:termWrite', repo, data),
  termResize: (repo: string, cols: number, rows: number) =>
    ipcRenderer.invoke('treeline:termResize', repo, cols, rows),
  termStop: (repo: string) => ipcRenderer.invoke('treeline:termStop', repo),
  onTermData: (cb: (repo: string, data: string) => void) => {
    const fn = (_e: unknown, repo: string, data: string): void => cb(repo, data)
    ipcRenderer.on('treeline:termData', fn)
    return () => ipcRenderer.removeListener('treeline:termData', fn)
  },
  onTermExit: (cb: (repo: string) => void) => {
    const fn = (_e: unknown, repo: string): void => cb(repo)
    ipcRenderer.on('treeline:termExit', fn)
    return () => ipcRenderer.removeListener('treeline:termExit', fn)
  }
}

contextBridge.exposeInMainWorld('treeline', api)
