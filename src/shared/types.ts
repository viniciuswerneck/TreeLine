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
}
