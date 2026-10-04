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
  /** Tag exata no HEAD destacado, ou null. */
  detachedTag: string | null
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

/** Branch com upstream e ahead/behind próprios (sidebar). */
export interface BranchDetail extends BranchInfo {
  /** ex: "origin/main" ou null */
  upstream: string | null
  ahead: number
  behind: number
}

/** Branch remoto (origin/main). */
export interface RemoteBranchInfo {
  name: string
  /** ex: "origin" */
  remote: string
}

/** Um hunk de `git diff --unified=3` (para stage/discard por hunk/linha). */
export interface HunkInfo {
  index: number
  header: string
  oldStart: number
  newStart: number
  lines: string[]
}

/** Linha de `git blame --line-porcelain` (resumo por linha). */
export interface BlameLine {
  line: number
  hash: string
  author: string
  date: string
  content: string
}

/** Entrada de histórico de arquivo (`git log --follow -- <file>`). */
export interface FileHistoryEntry {
  hash: string
  author: string
  date: string
  message: string
}

/** Linha do plano de rebase interativo. */
export interface RebasePlanEntry {
  hash: string
  message: string
  action: 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop'
}

/** Comparação entre dois commits (arquivos + diff por arquivo). */
export interface CompareSummary {
  files: string[]
  stats: FileStat[]
}

/** Modo de reset direto. */
export type ResetMode = 'soft' | 'mixed' | 'hard'

/** Info de worktree/submódulo (gitdir externo). */
export interface WorktreeInfo {
  /** true quando `.git` é arquivo (worktree linkada ou submódulo). */
  linked: boolean
  toplevel: string
}

/** Identidade do autor usada nos commits (git user.name/user.email global). */
export interface GitIdentity {
  name: string
  email: string
}

/** Detalhe de um commit para o painel inferior (meta + arquivos tocados). */
export interface CommitDetail extends CommitInfo {
  files: string[]
  committer: string
  stats: FileStat[]
}

/** Linhas de `--numstat`: adições/remoções por arquivo. */
export interface FileStat {
  path: string
  added: number
  deleted: number
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
  /** true quando o HEAD está exatamente nesta tag (checkout destacado). */
  checkedOut: boolean
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

/** Backup bundle em `.git/treeline-backups`. */
export interface BackupInfo {
  file: string
  date: string
  size: number
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
  getLog(repo: string, limit?: number, skip?: number, ref?: string): Promise<CommitInfo[]>
  getBranches(repo: string): Promise<BranchInfo[]>
  getDiff(repo: string, file: string, staged: boolean): Promise<string>
  getHunks(repo: string, file: string, staged: boolean): Promise<HunkInfo[]>
  stageHunk(repo: string, file: string, staged: boolean, hunkIndex: number, lang?: string): Promise<void>
  discardHunk(repo: string, file: string, staged: boolean, hunkIndex: number, lang?: string): Promise<void>
  stageLines(repo: string, file: string, staged: boolean, hunkIndex: number, lineIndexes: number[], lang?: string): Promise<void>
  stage(repo: string, file: string): Promise<void>
  unstage(repo: string, file: string): Promise<void>
  revertCommit(repo: string, hash: string, lang?: string): Promise<void>
  resetTo(repo: string, ref: string, mode: ResetMode, lang?: string): Promise<void>
  resolveOurs(repo: string, file: string, lang?: string): Promise<void>
  resolveTheirs(repo: string, file: string, lang?: string): Promise<void>
  pushForce(repo: string, forceLease: boolean, lang?: string): Promise<SyncResult>
  cancelSync(repo: string, op: string): Promise<void>
  getBranchesDetailed(repo: string): Promise<BranchDetail[]>
  getRemoteBranches(repo: string): Promise<RemoteBranchInfo[]>
  setUpstream(repo: string, branch: string, upstream: string, lang?: string): Promise<void>
  editRemote(repo: string, name: string, url: string, lang?: string): Promise<void>
  getBlame(repo: string, file: string, rev?: string): Promise<BlameLine[]>
  getFileHistory(repo: string, file: string, limit?: number): Promise<FileHistoryEntry[]>
  getRebasePlan(repo: string, base: string): Promise<RebasePlanEntry[]>
  rebaseInteractive(repo: string, base: string, plan: RebasePlanEntry[], lang?: string, autostash?: boolean): Promise<void>
  compareCommits(repo: string, a: string, b: string): Promise<CompareSummary>
  compareDiff(repo: string, a: string, b: string, file: string): Promise<string>
  openPR(repo: string, lang?: string): Promise<void>
  commit(repo: string, message: string, amend?: boolean, lang?: string): Promise<void>
  push(repo: string, lang?: string): Promise<SyncResult>
  pull(repo: string, lang?: string): Promise<SyncResult>
  fetch(repo: string, lang?: string): Promise<SyncResult>
  getIdentity(): Promise<GitIdentity>
  setIdentity(id: GitIdentity, lang?: string): Promise<void>
  setLang(lang: string): Promise<void>
  getVersion(): Promise<string>
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
  checkoutRemote(repo: string, remoteBranch: string, lang?: string): Promise<void>
  checkoutTag(repo: string, tag: string, lang?: string): Promise<void>
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
  rebaseOnto(repo: string, ref: string, lang?: string, autostash?: boolean): Promise<void>
  rebaseContinue(repo: string, lang?: string): Promise<void>
  abortRebase(repo: string): Promise<void>
  // Revert
  getRevertState(repo: string): Promise<OpState>
  abortRevert(repo: string): Promise<void>
  // Worktree
  getWorktreeInfo(repo: string): Promise<WorktreeInfo>
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
  listBackups(repo: string): Promise<BackupInfo[]>
  restoreBackup(repo: string, file: string, lang?: string): Promise<SyncResult>
  // Remotes
  getRemotes(repo: string): Promise<RemoteInfo[]>
  addRemote(repo: string, name: string, url: string, lang?: string): Promise<void>
  removeRemote(repo: string, name: string, lang?: string): Promise<void>
  cloneRepo(url: string, lang?: string): Promise<string | null>
  initRepo(lang?: string): Promise<string | null>
  // Terminal integrado (pty por repo; eventos chegam via onTermData/onTermExit)
  termStart(repo: string, cols: number, rows: number): Promise<void>
  termWrite(repo: string, data: string): Promise<void>
  termResize(repo: string, cols: number, rows: number): Promise<void>
  termStop(repo: string): Promise<void>
  termAlive(repo: string): Promise<boolean>
  onTermData(cb: (repo: string, data: string) => void): () => void
  onTermExit(cb: (repo: string) => void): () => void
}
