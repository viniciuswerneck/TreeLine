import { contextBridge, ipcRenderer } from 'electron'
import type { TreeLineAPI } from '../shared/types'

// Bridge mínima e tipada. Renderer nunca acessa Node/Electron direto.
const api: TreeLineAPI = {
  listRepos: () => ipcRenderer.invoke('treeline:listRepos'),
  openRepo: () => ipcRenderer.invoke('treeline:openRepo'),
  addRecent: (path: string) => ipcRenderer.invoke('treeline:addRecent', path),
  getStatus: (repo: string) => ipcRenderer.invoke('treeline:getStatus', repo),
  getLog: (repo: string, limit?: number, skip?: number, ref?: string | string[]) => ipcRenderer.invoke('treeline:getLog', repo, limit, skip, ref),
  getBranches: (repo: string) => ipcRenderer.invoke('treeline:getBranches', repo),
  getDiff: (repo: string, file: string, staged: boolean, lang?: string) =>
    ipcRenderer.invoke('treeline:getDiff', repo, file, staged, lang),
  getHunks: (repo: string, file: string, staged: boolean) =>
    ipcRenderer.invoke('treeline:getHunks', repo, file, staged),
  stageHunk: (repo: string, file: string, staged: boolean, hunkIndex: number, lang?: string) =>
    ipcRenderer.invoke('treeline:stageHunk', repo, file, staged, hunkIndex, lang),
  discardHunk: (repo: string, file: string, staged: boolean, hunkIndex: number, lang?: string) =>
    ipcRenderer.invoke('treeline:discardHunk', repo, file, staged, hunkIndex, lang),
  stageLines: (repo: string, file: string, staged: boolean, hunkIndex: number, lineIndexes: number[], lang?: string) =>
    ipcRenderer.invoke('treeline:stageLines', repo, file, staged, hunkIndex, lineIndexes, lang),
  revertCommit: (repo: string, hash: string, lang?: string) =>
    ipcRenderer.invoke('treeline:revertCommit', repo, hash, lang),
  resetTo: (repo: string, ref: string, mode: string, lang?: string) =>
    ipcRenderer.invoke('treeline:resetTo', repo, ref, mode, lang),
  resolveOurs: (repo: string, file: string, lang?: string) =>
    ipcRenderer.invoke('treeline:resolveOurs', repo, file, lang),
  resolveTheirs: (repo: string, file: string, lang?: string) =>
    ipcRenderer.invoke('treeline:resolveTheirs', repo, file, lang),
  getConflictFiles: (repo: string) => ipcRenderer.invoke('treeline:getConflictFiles', repo),
  getConflictStages: (repo: string, file: string) => ipcRenderer.invoke('treeline:getConflictStages', repo, file),
  getConflictOp: (repo: string) => ipcRenderer.invoke('treeline:getConflictOp', repo),
  resolveConflictSide: (repo: string, file: string, side: string, lang?: string) =>
    ipcRenderer.invoke('treeline:resolveConflictSide', repo, file, side, lang),
  applyConflictResult: (repo: string, file: string, content: string, del: boolean) =>
    ipcRenderer.invoke('treeline:applyConflictResult', repo, file, content, del),
  setRerere: (repo: string, on: boolean) => ipcRenderer.invoke('treeline:setRerere', repo, on),
  getRerere: (repo: string) => ipcRenderer.invoke('treeline:getRerere', repo),
  pushForce: (repo: string, forceLease: boolean, lang?: string) =>
    ipcRenderer.invoke('treeline:pushForce', repo, forceLease, lang),
  pushPublish: (repo: string, lang?: string) =>
    ipcRenderer.invoke('treeline:pushPublish', repo, lang),
  cancelSync: (repo: string, op: string) => ipcRenderer.invoke('treeline:cancelSync', repo, op),
  getBranchesDetailed: (repo: string) => ipcRenderer.invoke('treeline:getBranchesDetailed', repo),
  getRemoteBranches: (repo: string) => ipcRenderer.invoke('treeline:getRemoteBranches', repo),
  setUpstream: (repo: string, branch: string, upstream: string, lang?: string) =>
    ipcRenderer.invoke('treeline:setUpstream', repo, branch, upstream, lang),
  editRemote: (repo: string, name: string, url: string, lang?: string) =>
    ipcRenderer.invoke('treeline:editRemote', repo, name, url, lang),
  getBlame: (repo: string, file: string, rev?: string) =>
    ipcRenderer.invoke('treeline:getBlame', repo, file, rev),
  getFileHistory: (repo: string, file: string, limit?: number) =>
    ipcRenderer.invoke('treeline:getFileHistory', repo, file, limit),
  getRebasePlan: (repo: string, base: string) => ipcRenderer.invoke('treeline:getRebasePlan', repo, base),
  rebaseInteractive: (repo: string, base: string, plan: unknown, lang?: string, autostash?: boolean) =>
    ipcRenderer.invoke('treeline:rebaseInteractive', repo, base, plan, lang, autostash),
  compareCommits: (repo: string, a: string, b: string) =>
    ipcRenderer.invoke('treeline:compareCommits', repo, a, b),
  compareDiff: (repo: string, a: string, b: string, file: string) =>
    ipcRenderer.invoke('treeline:compareDiff', repo, a, b, file),
  openPR: (repo: string, lang?: string) => ipcRenderer.invoke('treeline:openPR', repo, lang),
  stage: (repo: string, file: string) => ipcRenderer.invoke('treeline:stage', repo, file),
  unstage: (repo: string, file: string) => ipcRenderer.invoke('treeline:unstage', repo, file),
  getTrackedFiles: (repo: string) => ipcRenderer.invoke('treeline:getTrackedFiles', repo),
  commit: (repo: string, message: string, amend?: boolean, lang?: string) =>
    ipcRenderer.invoke('treeline:commit', repo, message, amend, lang),
  push: (repo: string, lang?: string) => ipcRenderer.invoke('treeline:push', repo, lang),
  pull: (repo: string, lang?: string) => ipcRenderer.invoke('treeline:pull', repo, lang),
  fetch: (repo: string, lang?: string) => ipcRenderer.invoke('treeline:fetch', repo, lang),
  getCustomActions: () => ipcRenderer.invoke('treeline:getCustomActions'),
  saveCustomAction: (a: unknown) => ipcRenderer.invoke('treeline:saveCustomAction', a),
  deleteCustomAction: (id: string) => ipcRenderer.invoke('treeline:deleteCustomAction', id),
  runCustomAction: (repo: string, id: string, ctx?: unknown, lang?: string) =>
    ipcRenderer.invoke('treeline:runCustomAction', repo, id, ctx, lang),
  getIdentity: () => ipcRenderer.invoke('treeline:getIdentity'),
  setIdentity: (id: { name: string; email: string }, lang?: string) =>
    ipcRenderer.invoke('treeline:setIdentity', id, lang),
  setLang: (lang: string) => ipcRenderer.invoke('treeline:setLang', lang),
  getEffectiveIdentity: (repo: string) => ipcRenderer.invoke('treeline:getEffectiveIdentity', repo),
  setRepoIdentity: (repo: string, id: { name: string; email: string }, lang?: string) =>
    ipcRenderer.invoke('treeline:setRepoIdentity', repo, id, lang),
  getVersion: () => ipcRenderer.invoke('treeline:getVersion'),
  checkUpdates: () => ipcRenderer.invoke('treeline:checkUpdates'),
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
  checkoutRemote: (repo: string, remoteBranch: string, lang?: string) =>
    ipcRenderer.invoke('treeline:checkoutRemote', repo, remoteBranch, lang),
  checkoutTag: (repo: string, tag: string, lang?: string) =>
    ipcRenderer.invoke('treeline:checkoutTag', repo, tag, lang),
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
  abortStash: (repo: string) => ipcRenderer.invoke('treeline:abortStash', repo),
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
  rebaseOnto: (repo: string, ref: string, lang?: string, autostash?: boolean) =>
    ipcRenderer.invoke('treeline:rebaseOnto', repo, ref, lang, autostash),
  getRevertState: (repo: string) => ipcRenderer.invoke('treeline:getRevertState', repo),
  abortRevert: (repo: string) => ipcRenderer.invoke('treeline:abortRevert', repo),
  revertContinue: (repo: string, lang?: string) => ipcRenderer.invoke('treeline:revertContinue', repo, lang),
  getWorktreeInfo: (repo: string) => ipcRenderer.invoke('treeline:getWorktreeInfo', repo),
  getLfsInfo: (repo: string) => ipcRenderer.invoke('treeline:getLfsInfo', repo),
  getSubmodules: (repo: string) => ipcRenderer.invoke('treeline:getSubmodules', repo),
  updateSubmodules: (repo: string, lang?: string) => ipcRenderer.invoke('treeline:updateSubmodules', repo, lang),
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
  listBackups: (repo: string) => ipcRenderer.invoke('treeline:listBackups', repo),
  restoreBackup: (repo: string, file: string, lang?: string) =>
    ipcRenderer.invoke('treeline:restoreBackup', repo, file, lang),
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
termAlive: (repo: string) => ipcRenderer.invoke('treeline:termAlive', repo),
  watchRepo: (repo: string) => ipcRenderer.invoke('treeline:watchRepo', repo),
  unwatchRepo: (repo: string) => ipcRenderer.invoke('treeline:unwatchRepo', repo),
  onRepoChanged: (cb: (repo: string) => void): () => void => {
    const fn = (_e: unknown, repo: string): void => cb(repo)
    ipcRenderer.on('treeline:changed', fn)
    return () => ipcRenderer.removeListener('treeline:changed', fn)
  },
  onTermData: (cb: (repo: string, data: string) => void): () => void => {
    const fn = (_e: unknown, repo: string, data: string): void => cb(repo, data)
    ipcRenderer.on('treeline:termData', fn)
    return () => ipcRenderer.removeListener('treeline:termData', fn)
  },
  onTermExit: (cb: (repo: string) => void): () => void => {
    const fn = (_e: unknown, repo: string): void => cb(repo)
    ipcRenderer.on('treeline:termExit', fn)
    return () => ipcRenderer.removeListener('treeline:termExit', fn)
  },
  lfsPull: (repo: string, lang?: string) => ipcRenderer.invoke('treeline:lfsPull', repo, lang),
  lfsPush: (repo: string, lang?: string) => ipcRenderer.invoke('treeline:lfsPush', repo, lang),
  lfsTrack: (repo: string, pattern: string, lang?: string) => ipcRenderer.invoke('treeline:lfsTrack', repo, pattern, lang),
  lfsUntrack: (repo: string, pattern: string, lang?: string) => ipcRenderer.invoke('treeline:lfsUntrack', repo, pattern, lang),
}

contextBridge.exposeInMainWorld('treeline', api)
