// Tipos compartilhados entre main e renderer (via IPC serializável).

export interface FileEntry {
  path: string
  /** Código de 2 letras do porcelain (ex: " M", "M ", "??"). */
  code: string
}

export interface RepoStatus {
  branch: string
  ahead: number
  behind: number
  staged: FileEntry[]
  unstaged: FileEntry[]
  untracked: string[]
  /** Arquivos em conflito (unmerged). */
  conflicted: string[]
}

export interface CommitInfo {
  hash: string
  parents: string[]
  author: string
  date: string
  message: string
  refs: string[]
}

export interface BranchInfo {
  name: string
  current: boolean
}

/** Identidade do autor usada nos commits (git user.name/user.email global). */
export interface GitIdentity {
  name: string
  email: string
}

/** Detalhe de um commit para o painel inferior (meta + arquivos tocados). */
export interface CommitDetail extends CommitInfo {
  files: string[]
}

/** Resultado resumido de Push/Pull/Fetch para exibir no toast. */
export interface SyncResult {
  summary: string
}

/** Entrada do `git stash list`. */
export interface StashInfo {
  /** ex: "stash@{0}" */
  ref: string
  hash: string
  message: string
}

/** Tag local com data de criação. */
export interface TagInfo {
  name: string
  date: string
}

/** Remoto (linha fetch do `git remote -v`). */
export interface RemoteInfo {
  name: string
  url: string
}

/** Entrada do reflog (HEAD). */
export interface ReflogEntry {
  hash: string
  ref: string
  author: string
  date: string
  message: string
}

/** Estado de operação interrompida (merge/rebase/cherry-pick em conflito). */
export interface OpState {
  inProgress: boolean
  /** ref alvo (branch do merge/rebase), quando conhecido */
  target?: string
}

/** Arquivos que um merge traria (preview `HEAD...ref`). */
export interface MergePreview {
  files: string[]
  commits: number
}

/** Tipos de branch do Git-flow. */
export type FlowType = 'feature' | 'release' | 'hotfix'

/** Operação de sincronização com remoto (para o toast de progresso). */
export type SyncOp = 'push' | 'pull' | 'fetch'

/** Contrato exposto no renderer como `window.treeline`. */
export interface TreeLineAPI {
  listRepos(): Promise<string[]>
  openRepo(): Promise<string | null>
  addRecent(path: string): Promise<string[]>
  getStatus(repo: string): Promise<RepoStatus>
  getLog(repo: string, limit?: number): Promise<CommitInfo[]>
  getBranches(repo: string): Promise<BranchInfo[]>
  getDiff(repo: string, file: string, staged: boolean): Promise<string>
  stage(repo: string, file: string): Promise<void>
  unstage(repo: string, file: string): Promise<void>
  commit(repo: string, message: string, amend?: boolean, lang?: string): Promise<void>
  push(repo: string, lang?: string): Promise<SyncResult>
  pull(repo: string, lang?: string): Promise<SyncResult>
  fetch(repo: string, lang?: string): Promise<SyncResult>
  getIdentity(): Promise<GitIdentity>
  setIdentity(id: GitIdentity, lang?: string): Promise<void>
  getCommitDetail(repo: string, hash: string, lang?: string): Promise<CommitDetail>
  getCommitDiff(repo: string, hash: string, file: string): Promise<string>
  reveal(path: string): Promise<void>
  removeRecent(path: string): Promise<string[]>
  discard(repo: string, file: string, tracked: boolean, lang?: string): Promise<void>
  copyText(text: string): Promise<void>
  confirm(title: string, message: string, detail: string, ok: string, cancel: string): Promise<boolean>
  // Branch
  createBranch(repo: string, name: string, from: string, checkout: boolean, lang?: string): Promise<void>
  checkoutBranch(repo: string, name: string, lang?: string): Promise<void>
  renameBranch(repo: string, oldName: string, newName: string, lang?: string): Promise<void>
  deleteBranch(repo: string, name: string, force: boolean, lang?: string): Promise<void>
  // Merge
  getMergeState(repo: string): Promise<OpState>
  mergePreview(repo: string, ref: string): Promise<MergePreview>
  mergeBranch(repo: string, ref: string, noFf: boolean, lang?: string): Promise<void>
  mergeContinue(repo: string, lang?: string): Promise<void>
  abortMerge(repo: string): Promise<void>
  // Stash
  getStashes(repo: string): Promise<StashInfo[]>
  createStash(repo: string, message: string, includeUntracked: boolean, lang?: string): Promise<void>
  applyStash(repo: string, ref: string, lang?: string): Promise<void>
  popStash(repo: string, ref: string, lang?: string): Promise<void>
  dropStash(repo: string, ref: string, lang?: string): Promise<void>
  // Tag
  getTags(repo: string): Promise<TagInfo[]>
  createTag(repo: string, name: string, message: string, commit: string, lang?: string): Promise<void>
  pushTag(repo: string, name: string, lang?: string): Promise<SyncResult>
  deleteTag(repo: string, name: string, remoteToo: boolean, lang?: string): Promise<void>
  // Rebase
  getRebaseState(repo: string): Promise<OpState>
  rebaseOnto(repo: string, ref: string, lang?: string): Promise<void>
  rebaseContinue(repo: string, lang?: string): Promise<void>
  abortRebase(repo: string): Promise<void>
  // Cherry-pick
  getCherryPickState(repo: string): Promise<OpState>
  cherryPick(repo: string, hash: string, lang?: string): Promise<void>
  cherryPickContinue(repo: string, lang?: string): Promise<void>
  abortCherryPick(repo: string): Promise<void>
  // Git-flow
  detectFlow(repo: string): Promise<{ installed: boolean }>
  flowStart(repo: string, type: FlowType, name: string, lang?: string): Promise<string>
  flowFinish(repo: string, type: FlowType, name: string, lang?: string): Promise<void>
  // Terminal
  openTerminal(repo: string, lang?: string): Promise<void>
  // Reflog + Undo
  getReflog(repo: string, limit?: number): Promise<ReflogEntry[]>
  undoToReflog(repo: string, ref: string, lang?: string): Promise<void>
  // Remotes
  getRemotes(repo: string): Promise<RemoteInfo[]>
  addRemote(repo: string, name: string, url: string, lang?: string): Promise<void>
  removeRemote(repo: string, name: string, lang?: string): Promise<void>
  cloneRepo(url: string, lang?: string): Promise<string | null>
  initRepo(lang?: string): Promise<string | null>
}
