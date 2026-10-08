import { create } from 'zustand'
import { SHORTCUT_DEFAULTS, eventShortcut, loadShortcuts, saveShortcuts, type ShortcutAction } from './shortcuts'
import type { BlameLine, BranchDetail, BranchInfo, CodeSearchChange, CodeSearchGroup, CodeSearchOptions, CodeSearchProgress, CodeSearchStats, CompareSummary, CommitDetail, CommitInfo, ConflictFile, ConflictOp, ConflictSide, FileHistoryEntry, FlowType, GitIdentity, HunkInfo, LfsInfo, OpState, RebasePlanEntry, ReflogEntry, RemoteBranchInfo, RemoteInfo, RepoStatus, ResetMode, StashInfo, SubmoduleInfo, SyncOp, TagInfo, WorktreeInfo } from '../shared/types'
import { applyTheme, loadTheme } from './themes'
import { applyLang, loadLang, t, type DictKey, type Lang } from './i18n'
import type { MenuItem } from './components/ContextMenu'

export type DialogKind =
  | 'branch' | 'merge' | 'stash' | 'tag' | 'rebase'
  | 'pick' | 'flow' | 'reflog' | 'remotes'
  | 'reset' | 'rebaseInteractive' | 'blame' | 'fileHistory' | 'compare'
  | 'about' | 'custom' | 'lfs' | 'codeSearch'

export interface ContextMenuState {
  x: number
  y: number
  items: MenuItem[]
}

export interface ConfirmState {
  title: string
  message: string
  detail: string
  ok: string
}

// Fila de confirmações: se duas chegam juntas (ex.: reset + discard), a
// primeira não "some" — o dialog mostra a seguinte ao resolver a atual.
interface PendingConfirm extends ConfirmState {
  resolve: (v: boolean) => void
}

let confirmQueue: PendingConfirm[] = []

/** Cancela confirmações pendentes (ex.: troca de repo) sem travar o caller. */
function dismissConfirmations() {
  const pending = confirmQueue
  confirmQueue = []
  for (const c of pending) c.resolve(false)
}

export interface SelectedFile {
  path: string
  staged: boolean
}

/**
 * Refs do `git log`: seleção do combo de branches do history > modo "só
 * branch atual" > `--all` (undefined). Sempre qualificado (refs/heads/…,
 * refs/remotes/…) para o git nunca confundir com path ou tag de nome igual.
 */
function logRefs(s: {
  branchSel: string[]
  branchFilter: 'all' | 'current'
  branches: BranchInfo[]
  remoteBranches: RemoteBranchInfo[]
  status: RepoStatus | null
}): string[] | undefined {
  if (s.branchSel.length) {
    const remotes = new Set(s.remoteBranches.map((r) => r.name))
    return s.branchSel.map((n) => (remotes.has(n) ? `refs/remotes/${n}` : `refs/heads/${n}`))
  }
  if (s.branchFilter === 'current') {
    const cur = s.branches.find((b) => b.current)?.name
    if (cur) return [`refs/heads/${cur}`]
    // Fallback `status.branch`: pode ser hash em detached HEAD — manda cru.
    const st = s.status?.branch
    if (st && st !== '(detached)') return [st]
  }
  return undefined
}

export type SyncPhase = 'running' | 'success' | 'error'

export interface SyncState {
  op: SyncOp | null
  phase: SyncPhase | null
  message: string
  /** Push rejeitado por non-fast-forward: oferece retry com lease. */
  retryLease: boolean
  /** Push sem upstream: oferece publicar (push -u origin). */
  retryPublish: boolean
}

export const SYNC_OP_LABEL: Record<SyncOp, string> = { push: 'Push', pull: 'Pull', fetch: 'Fetch', clone: 'Clone' }

// Sincronização cancelada pelo usuário (4.8): o toast NÃO é zerado na hora do
// cancel — fica "Cancelando…" até a operação de fato encerrar. Se o git não
// morrer (abort falho), o usuário vê que ainda está rodando, em vez de um
// "cancelado" mentiroso.
let pendingCancel: SyncOp | null = null

function cancelledSyncToast(op: SyncOp, lang: Lang): SyncState | null {
  if (pendingCancel !== op) return null
  pendingCancel = null
  return { op, phase: 'success', message: t(lang, 'sync.cancelled', { op: SYNC_OP_LABEL[op] }), retryLease: false, retryPublish: false }
}

interface TreeLineState {
  repos: string[]
  current: string | null
  openTabs: string[]
  closeTab: (path: string) => Promise<void>
  moveTab: (from: string, to: string) => void
  status: RepoStatus | null
  commits: CommitInfo[]
  branches: BranchInfo[]
  branchesDetailed: BranchDetail[]
  remoteBranches: RemoteBranchInfo[]
  selectedFile: SelectedFile | null
  diff: string
  hunks: HunkInfo[]
  message: string
  amend: boolean
  loading: boolean
  error: string | null
  filter: string
  branchFilter: 'all' | 'current'
  /** Seleção do combo de branches do history (vazio = todos os branches). */
  branchSel: string[]
  logPage: number
  hasMoreCommits: boolean
  loadingMore: boolean
  loadMoreCommits: () => Promise<void>
  sync: SyncState
  syncRepo: string | null
  theme: string
  lang: Lang
  loadRepos: () => Promise<void>
  openDialog: () => Promise<void>
  selectRepo: (path: string) => Promise<void>
  refresh: () => Promise<void>
  selectFile: (f: SelectedFile | null) => Promise<void>
  setMessage: (m: string) => void
  setAmend: (a: boolean) => void
  setFilter: (f: string) => void
  setBranchFilter: (f: 'all' | 'current') => Promise<void>
  setBranchSel: (sel: string[]) => Promise<void>
  stageSelected: () => Promise<void>
  unstageSelected: () => Promise<void>
  stageAll: () => Promise<void>
  unstageAll: () => Promise<void>
  doCommit: () => Promise<void>
  doPush: () => Promise<void>
  doPushForce: () => Promise<void>
  doPushPublish: () => Promise<void>
  doPull: () => Promise<void>
  doFetch: () => Promise<void>
  doRevert: (hash: string) => Promise<void>
  doReset: (ref: string, mode: ResetMode) => Promise<boolean>
  resolveOurs: (path: string) => Promise<void>
  resolveTheirs: (path: string) => Promise<void>
  // Resolvedor de conflito de 3 vias (overlay em tela cheia)
  conflictFiles: ConflictFile[]
  conflictOp: ConflictOp
  conflictIndex: number
  resolverOpen: boolean
  conflictLoading: boolean
  /**
   * Sobe sempre que o overlay reabre ou o `continue` avança para um conflito
   * novo (rebase multi-commit). O componente usa para invalidar o cache de
   * "arquivo já carregado": sem isso ele mostraria os marcadores antigos do
   * mesmo caminho recém-reconflitado.
   */
  conflictEpoch: number
  rerere: boolean
  openResolver: () => Promise<void>
  closeResolver: () => void
  gotoConflictFile: (index: number) => Promise<void>
  /** Resolve o arquivo por um lado e avança para o próximo. */
  resolveConflictBySide: (path: string, side: ConflictSide) => Promise<void>
  /** Salva o resultado editado no editor 3-vias e avança. */
  saveConflictResult: (path: string, content: string, del: boolean) => Promise<void>
  /** Aplica uma escolha a todos os arquivos restantes. */
  resolveAllRemaining: (side: ConflictSide) => Promise<void>
  advanceAfterResolve: (path: string) => Promise<void>
  toggleRerere: (on: boolean) => Promise<void>
  abortCurrentOp: () => Promise<void>
  continueCurrentOp: () => Promise<void>
  skipCurrentOp: () => Promise<void>
  stageHunk: (hunkIndex: number) => Promise<void>
  discardHunk: (hunkIndex: number) => Promise<void>
  stageLines: (hunkIndex: number, lines: number[]) => Promise<void>
  clearSync: () => void
  cancelSync: () => Promise<void>
  setTheme: (t: string) => void
  setLang: (l: Lang) => void
  tr: (key: DictKey, vars?: Record<string, string | number>) => string
  settingsOpen: boolean
  identity: GitIdentity
  identityScope: 'global' | 'local'
  identityEffectiveScope: 'global' | 'local' | 'none'
  identitySaving: boolean
  identityError: string | null
  identitySaved: boolean
  openSettings: () => Promise<void>
  closeSettings: () => void
  setIdentityScope: (s: 'global' | 'local') => void
  saveIdentity: (id: GitIdentity) => Promise<void>
  selectedCommit: string | null
  commitDetail: CommitDetail | null
  commitDiff: string
  selectCommit: (hash: string | null) => Promise<void>
  selectCommitFile: (path: string) => Promise<void>
  menu: ContextMenuState | null
  openMenu: (x: number, y: number, items: MenuItem[]) => void
  closeMenu: () => void
  copyText: (text: string) => Promise<void>
  revealRepoFile: (path: string) => Promise<void>
  revealFullPath: (path: string) => Promise<void>
  removeBookmark: (path: string) => Promise<void>
  discardFile: (path: string, tracked: boolean) => Promise<void>
  dialog: DialogKind | null
  openDlg: (kind: DialogKind) => void
  closeDlg: () => void
  /** Preset de ref (branch/hash) que o próximo dialog consome e limpa. */
  refPreset: string | null
  setRefPreset: (p: string | null) => void
  stashes: StashInfo[]
  tags: TagInfo[]
  remotes: RemoteInfo[]
  reflog: ReflogEntry[]
  mergeState: OpState
  rebaseState: OpState
  pickState: OpState
  revertState: OpState
  worktree: WorktreeInfo | null
  lfs: LfsInfo | null
  submodules: SubmoduleInfo[]
  flowInstalled: boolean
  confirmAction: (title: string, message: string, detail: string, ok: string) => Promise<boolean>
  confirmState: ConfirmState | null
  resolveConfirm: (v: boolean) => void
  runOp: (op: (repo: string, lang: Lang) => Promise<unknown>, repo?: string) => Promise<boolean>
  busy: boolean
  cloneRepo: (url: string) => Promise<boolean>
  initRepo: () => Promise<boolean>
  terminalOpen: boolean
  toggleTerminal: () => void
  openTerminalDrawer: () => void
  closeTerminalDrawer: () => void
  // Blame / file-history / compare / paleta
  blame: BlameLine[]
  blameFile: string | null
  blameLoading: boolean
  loadBlame: (path: string, rev?: string) => Promise<void>
  closeBlame: () => void
  fileHistory: FileHistoryEntry[]
  fileHistoryPath: string | null
  fhistLoading: boolean
  loadFileHistory: (path: string) => Promise<void>
  closeFileHistory: () => void
  loadCommitDiffFile: (hash: string, path: string) => Promise<string>
  compareA: string | null
  compareB: string | null
  compare: CompareSummary | null
  compareFile: string | null
  compareDiffText: string
  setCompareEnd: (hash: string) => Promise<void>
  clearCompare: () => void
  selectCompareFile: (path: string) => Promise<void>
  paletteOpen: boolean
  setPalette: (open: boolean) => void
  gotoFileOpen: boolean
  gotoFileList: string[]
  setGoToFileOpen: (open: boolean) => void
  refreshFileIndex: () => Promise<void>
  // Busca de código em todas as branches (Ctrl+Shift+F)
  csQuery: string
  setCsQuery: (q: string) => void
  csOpts: CodeSearchOptions
  setCsOpt: (k: keyof CodeSearchOptions, v: boolean) => void
  csGroups: CodeSearchGroup[]
  csChanges: Record<string, CodeSearchChange | null>
  csLoading: boolean
  csStats: CodeSearchStats | null
  csToken: number
  runCodeSearch: () => Promise<void>
  applyCsProgress: (p: CodeSearchProgress) => void
  cancelCodeSearch: () => Promise<void>
  openCodeResult: (path: string, ref: string, current: boolean) => Promise<void>
  closeCodeSearch: () => void
  resetCodeSearch: () => void
  autoFetchMin: number
  setAutoFetchMin: (min: number) => void
  autoFetchBg: boolean
  setAutoFetchBg: (v: boolean) => void
  shortcuts: Record<ShortcutAction, string>
  setShortcut: (action: ShortcutAction, key: string) => void
  resetShortcuts: () => void
  matchShortcut: (action: ShortcutAction, e: KeyboardEvent | React.KeyboardEvent) => boolean
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  /** Incrementado a cada checkout bem-sucedido: HistoryGraph rola até o HEAD. */
  headPing: number
  checkoutBranch: (name: string) => Promise<boolean>
  checkoutRemote: (remoteBranch: string) => Promise<boolean>
  checkoutTag: (tag: string) => Promise<boolean>
}

async function fail<T>(p: Promise<T>, set: (e: string | null) => void): Promise<T | null> {
  try {
    return await p
  } catch (e) {
    set(e instanceof Error ? e.message : String(e))
    return null
  }
}

/** "Error invoking remote method 'x': Error: DETALHE" → "DETALHE" (1 linha). */
function cleanErr(e: unknown, lang?: Lang): string {
  const m = e instanceof Error ? e.message : String(e)
  const idx = m.lastIndexOf('Error: ')
  const detail = (idx >= 0 ? m.slice(idx + 'Error: '.length) : m)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' — ')
    .slice(0, 500)
  // 4.6: git hook (pre-commit/pre-push/commit-msg) falhou com exit != 0 — o
  // diagnóstico nativo só diz "exited with code 1"; mostrar que é o hook e a
  // saída dele, em vez de um erro cru.
  if (/hook exited with code|pre-commit|pre-push|commit-msg|\.pre-commit-config|rejected by the hook/i.test(m)) {
    const hint = t(lang ?? useStore.getState().lang, 'err.hook')
    return detail ? `${hint} — ${detail}` : hint
  }
  return detail
}

export const useStore = create<TreeLineState>()((set, get) => ({
  repos: [],
  current: null,
  openTabs: (() => {
    try {
      const raw = localStorage.getItem('treeline-tabs')
      const list = raw ? (JSON.parse(raw) as unknown) : []
      return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, 20) : []
    } catch {
      return []
    }
  })(),
  closeTab: async (path) => {
    const tabs = get().openTabs.filter((t) => t !== path)
    try {
      localStorage.setItem('treeline-tabs', JSON.stringify(tabs))
    } catch {
      /* ignora */
    }
    set({ openTabs: tabs })
    if (get().current === path) {
      if (tabs.length > 0) await get().selectRepo(tabs[0] as string)
      else set({ current: null, status: null, commits: [], branches: [] })
    }
  },
moveTab: (from, to) => {
    const tabs = get().openTabs
    const a = tabs.indexOf(from)
    const b = tabs.indexOf(to)
    if (a === -1 || b === -1 || a === b) return
    const next = [...tabs]
    next.splice(a, 1)
    next.splice(b, 0, from)
    try {
      localStorage.setItem('treeline-tabs', JSON.stringify(next))
    } catch {
      /* ignora */
    }
    set({ openTabs: next })
  },
  status: null,
  commits: [],
  branches: [],
  branchesDetailed: [],
  remoteBranches: [],
  selectedFile: null,
  diff: '',
  hunks: [],
  message: '',
  amend: false,
  loading: false,
  error: null,
  filter: '',
  branchFilter: 'all',
  branchSel: [],
  logPage: 0,
  hasMoreCommits: false,
  loadingMore: false,
  loadMoreCommits: async () => {
    const repo = get().current
    if (!repo || !get().hasMoreCommits || get().loadingMore) return
    set({ loadingMore: true })
    const PAGE = 300
    const ref = logRefs(get())
    const next = await fail(window.treeline.getLog(repo, PAGE, get().commits.length, ref), (e) => set({ error: e }))
    if (next !== null && get().current === repo) {
      // 3.2: dedupe/base pela lista ATUAL (não uma cópia capturada): um
      // refresh pode ter recarregado a página 0 no meio do load. Sem isso,
      // a cópia velha era reanexada e commits duplicados/deletados sumiam.
      const base = get().commits
      const seen = new Set(base.map((c) => c.hash))
      const fresh = next.filter((c) => !seen.has(c.hash))
      set({
        commits: [...base, ...fresh],
        logPage: get().logPage + 1,
        hasMoreCommits: next.length >= PAGE
      })
    }
    // Se trocou de repo, a lista nova suplantou esta — não mexe em nada.
    set({ loadingMore: false })
  },
sync: { op: null, phase: null, message: '', retryLease: false, retryPublish: false },
  syncRepo: null,
  busy: false,
  theme: loadTheme(),
  lang: loadLang(),

  loadRepos: async () => {
    const repos = await window.treeline.listRepos()
    set({ repos })
    if (!get().current && repos.length > 0) {
      await get().selectRepo(repos[0] as string)
    }
  },

  openDialog: async () => {
    const path = await window.treeline.openRepo()
    if (path) {
      set({ repos: [path, ...get().repos.filter((r) => r !== path)] })
      await get().selectRepo(path)
    }
  },

  selectRepo: async (path: string) => {
    // 3.6: confirmações pendentes do repo anterior são canceladas (não "vazam").
    dismissConfirmations()
    // Preserva a ordem manual das abas: só anexa se ainda não estiver aberta.
    const open = get().openTabs
    const tabs = open.includes(path) ? [...open] : [...open, path].slice(-20)
    try {
      localStorage.setItem('treeline-tabs', JSON.stringify(tabs))
    } catch {
      /* ignora */
    }
    set({ current: path, openTabs: tabs, status: null, commits: [], branches: [], branchSel: [], branchesDetailed: [], remoteBranches: [], stashes: [], tags: [], remotes: [], reflog: [], mergeState: { inProgress: false }, rebaseState: { inProgress: false }, pickState: { inProgress: false }, revertState: { inProgress: false }, worktree: null, lfs: null, submodules: [], selectedFile: null, diff: '', hunks: [], error: null, selectedCommit: null, commitDetail: null, commitDiff: '', blame: [], blameFile: null, blameLoading: false, fileHistory: [], fileHistoryPath: null, fhistLoading: false, compareA: null, compareB: null, compare: null, dialog: null, confirmState: null, filter: '', branchFilter: 'all', resolverOpen: false, conflictFiles: [], conflictIndex: 0, conflictLoading: false, conflictOp: null, sync: { op: null, phase: null, message: '', retryLease: false, retryPublish: false }, syncRepo: null, busy: false })
    await window.treeline.addRecent(path)
    await get().refresh()
  },

  refresh: async () => {
    const repo = get().current
    if (!repo) return
    set({ loading: true, error: null })
    // Fase 1: branch atual (para o log com ancestry real no modo current).
    const [status, branches] = await Promise.all([
      fail(window.treeline.getStatus(repo), (e) => set({ error: e })),
      fail(window.treeline.getBranches(repo), (e) => set({ error: e }))
    ])
    // 3.1: se trocou de repo durante a leitura, descarta — nunca mistura
    // dados do repo A numa tela que já mostra o repo B.
    if (get().current !== repo) return
    const ref = logRefs({ ...get(), branches: branches ?? [], status })
    const [commits, branchesDetailed, remoteBranches, stashes, tags, remotes, reflog, mergeState, rebaseState, pickState, revertState, worktree, lfs, submodules, flow] = await Promise.all([
      fail(window.treeline.getLog(repo, 300, 0, ref), (e) => set({ error: e })),
      fail(window.treeline.getBranchesDetailed(repo), (e) => set({ error: e })),
      fail(window.treeline.getRemoteBranches(repo), (e) => set({ error: e })),
      fail(window.treeline.getStashes(repo), (e) => set({ error: e })),
      fail(window.treeline.getTags(repo), (e) => set({ error: e })),
      fail(window.treeline.getRemotes(repo), (e) => set({ error: e })),
      fail(window.treeline.getReflog(repo, 50), (e) => set({ error: e })),
      fail(window.treeline.getMergeState(repo), (e) => set({ error: e })),
      fail(window.treeline.getRebaseState(repo), (e) => set({ error: e })),
      fail(window.treeline.getCherryPickState(repo), (e) => set({ error: e })),
      fail(window.treeline.getRevertState(repo), (e) => set({ error: e })),
      fail(window.treeline.getWorktreeInfo(repo), (e) => set({ error: e })),
      fail(window.treeline.getLfsInfo(repo), (e) => set({ error: e })),
      fail(window.treeline.getSubmodules(repo), (e) => set({ error: e })),
      fail(window.treeline.detectFlow(repo), (e) => set({ error: e }))
    ])
    // Conflitos: quando existe operação interrompida, e também enquanto o
    // overlay está aberto. `git stash pop` conflitante não deixa state file
    // (nem MERGE_HEAD), então sem este ramo o refresh disparado ao resolver o
    // último arquivo zerava a lista e apagava o `op` — o Continue do stash
    // ficava mudo para sempre, com "Nenhum arquivo em conflito".
    const resolverOpen = get().resolverOpen
    const wantConflicts =
      !!mergeState?.inProgress ||
      !!rebaseState?.inProgress ||
      !!pickState?.inProgress ||
      !!revertState?.inProgress ||
      resolverOpen
    const [conflictFiles, conflictOp, rerere] = wantConflicts
      ? await Promise.all([
          fail(window.treeline.getConflictFiles(repo), (e) => set({ error: e })),
          fail(window.treeline.getConflictOp(repo), (e) => set({ error: e })),
          fail(window.treeline.getRerere(repo), (e) => set({ error: e }))
        ])
      : [null, null, null]
    // 3.1: resposta atrasada do repo antigo não invade a tela do novo.
    if (get().current !== repo) return
    set({
      conflictFiles: conflictFiles ?? (wantConflicts ? get().conflictFiles : []),
      // `getConflictOp` só devolve 'stash' enquanto há unmerged no index: no
      // momento em que o último arquivo é staged ele vira null e some. Com o
      // overlay aberto o op é STICKY — ele só termina pelo Continue/Abort.
      conflictOp: conflictOp ?? (resolverOpen ? get().conflictOp : null),
      rerere: rerere ?? get().rerere,
      status: status ?? get().status,
      commits: commits ?? get().commits,
      logPage: 0,
      hasMoreCommits: (commits?.length ?? 0) >= 300,
      branches: branches ?? get().branches,
      branchesDetailed: branchesDetailed ?? get().branchesDetailed,
      remoteBranches: remoteBranches ?? get().remoteBranches,
      stashes: stashes ?? get().stashes,
      tags: tags ?? get().tags,
      remotes: remotes ?? get().remotes,
      reflog: reflog ?? get().reflog,
      mergeState: mergeState ?? get().mergeState,
      rebaseState: rebaseState ?? get().rebaseState,
      pickState: pickState ?? get().pickState,
      revertState: revertState ?? get().revertState,
      worktree: worktree ?? get().worktree,
      lfs: lfs ?? get().lfs,
      submodules: submodules ?? get().submodules,
      flowInstalled: flow?.installed ?? get().flowInstalled,
      loading: false
    })
    const sel = get().selectedFile
    if (sel) await get().selectFile(sel)
  },

  selectFile: async (f) => {
    set({ selectedFile: f, diff: '', hunks: [], selectedCommit: null, commitDetail: null, commitDiff: '' })
    const repo = get().current
    if (!repo || !f) return
    const [diff, hunks] = await Promise.all([
      fail(window.treeline.getDiff(repo, f.path, f.staged, get().lang), (e) => set({ error: e })),
      fail(window.treeline.getHunks(repo, f.path, f.staged), (e) => set({ error: e }))
    ])
    // 3.1: diff demorado não pinta na tela se trocou de repo/arquivo no meio.
    if (get().current !== repo || get().selectedFile?.path !== f.path) return
    set({ diff: diff ?? '', hunks: hunks ?? [] })
  },

  setMessage: (m) => set({ message: m }),
  setAmend: (a) => set({ amend: a }),
  setFilter: (f) => set({ filter: f }),
  setBranchFilter: async (f) => {
    // Modos mutuamente exclusivos: "só branch atual" zera a seleção do combo.
    set({ branchFilter: f, ...(f === 'current' ? { branchSel: [] } : {}) })
    // O log vem com ancestry real do servidor: trocar o filtro recarrega.
    await get().refresh()
  },

  setBranchSel: async (sel) => {
    // Seleção explícita no combo desliga o modo "só branch atual".
    set({ branchSel: sel, ...(sel.length ? { branchFilter: 'all' as const } : {}) })
    await get().refresh()
  },

  stageAll: async () => {
    const { current, status } = get()
    if (!current || !status) return
    set({ error: null, busy: true })
    try {
      const files = [...status.unstaged.map((f) => f.path), ...status.untracked]
      for (const file of files) {
        const ok = await fail(window.treeline.stage(current, file), (e) => set({ error: e }))
        if (ok === null) return
      }
      await get().refresh()
    } finally {
      set({ busy: false })
    }
  },

  unstageAll: async () => {
    const { current, status } = get()
    if (!current || !status) return
    set({ error: null, busy: true })
    try {
      for (const f of status.staged) {
        const ok = await fail(window.treeline.unstage(current, f.path), (e) => set({ error: e }))
        if (ok === null) return
      }
      await get().refresh()
    } finally {
      set({ busy: false })
    }
  },

  stageSelected: async () => {
    const { current, selectedFile } = get()
    if (!current || !selectedFile) return
    set({ error: null, busy: true })
    try {
      const ok = await fail(window.treeline.stage(current, selectedFile.path), (e) => set({ error: e }))
      if (ok !== null) {
        await get().refresh()
        await get().selectFile({ path: selectedFile.path, staged: true })
      }
    } finally {
      set({ busy: false })
    }
  },

  unstageSelected: async () => {
    const { current, selectedFile } = get()
    if (!current || !selectedFile) return
    set({ error: null, busy: true })
    try {
      const ok = await fail(window.treeline.unstage(current, selectedFile.path), (e) => set({ error: e }))
      if (ok !== null) {
        await get().refresh()
        await get().selectFile({ path: selectedFile.path, staged: false })
      }
    } finally {
      set({ busy: false })
    }
  },

  doCommit: async () => {
    const { current, message, amend, lang } = get()
    if (!current) return
    set({ error: null, busy: true })
    try {
      const ok = await fail(window.treeline.commit(current, message, amend, lang), (e) => set({ error: e }))
      if (ok !== null) {
        set({ message: '', selectedFile: null, diff: '' })
        await get().refresh()
      }
    } finally {
      set({ busy: false })
    }
  },

  doPush: async () => {
    const repo = get().current
    if (!repo || get().sync.phase === 'running') return
    set({ syncRepo: repo, sync: { op: 'push', phase: 'running', message: t(get().lang, 'sync.running', { op: 'Push' }), retryLease: false, retryPublish: false }, error: null })
    const res = await fail(window.treeline.push(repo, get().lang), (e) => {
      // 3.5: toast de sync é por repo — se o usuário trocou de aba, não pinta.
      if (get().current !== repo) return
      const cx = cancelledSyncToast('push', get().lang)
      if (cx) return set({ sync: cx })
      const detail = cleanErr(e)
      const lease = /non-fast-forward|fetch first|rejected/i.test(detail)
      const publish = /sem upstream|no upstream|no tracking|has no upstream/i.test(detail)
      return set({ sync: { op: 'push', phase: 'error', message: t(get().lang, 'sync.failed', { op: 'Push', e: detail }), retryLease: lease && !publish, retryPublish: publish } })
    })
    if (res !== null) {
      pendingCancel = null
      if (get().current === repo) set({ sync: { op: 'push', phase: 'success', message: res.summary, retryLease: false, retryPublish: false } })
      await get().refresh()
    }
  },

  doPull: async () => {
    const repo = get().current
    if (!repo || get().sync.phase === 'running') return
    set({ syncRepo: repo, sync: { op: 'pull', phase: 'running', message: t(get().lang, 'sync.running', { op: 'Pull' }), retryLease: false, retryPublish: false }, error: null })
    const res = await fail(window.treeline.pull(repo, get().lang), (e) => {
      if (get().current !== repo) return
      const cx = cancelledSyncToast('pull', get().lang)
      if (cx) return set({ sync: cx })
      return set({ sync: { op: 'pull', phase: 'error', message: t(get().lang, 'sync.failed', { op: 'Pull', e: cleanErr(e) }), retryLease: false, retryPublish: false } })
    })
    if (res !== null) {
      pendingCancel = null
      if (get().current === repo) set({ sync: { op: 'pull', phase: 'success', message: res.summary, retryLease: false, retryPublish: false } })
      await get().refresh()
    }
  },

  doFetch: async () => {
    const repo = get().current
    if (!repo || get().sync.phase === 'running') return
    set({ syncRepo: repo, sync: { op: 'fetch', phase: 'running', message: t(get().lang, 'sync.running', { op: 'Fetch' }), retryLease: false, retryPublish: false }, error: null })
    const res = await fail(window.treeline.fetch(repo, get().lang), (e) => {
      if (get().current !== repo) return
      const cx = cancelledSyncToast('fetch', get().lang)
      if (cx) return set({ sync: cx })
      return set({ sync: { op: 'fetch', phase: 'error', message: t(get().lang, 'sync.failed', { op: 'Fetch', e: cleanErr(e) }), retryLease: false, retryPublish: false } })
    })
    if (res !== null) {
      pendingCancel = null
      if (get().current === repo) set({ sync: { op: 'fetch', phase: 'success', message: res.summary, retryLease: false, retryPublish: false } })
      await get().refresh()
    }
  },

  clearSync: () => set({ sync: { op: null, phase: null, message: '', retryLease: false, retryPublish: false }, syncRepo: null }),

  cancelSync: async () => {
    const repo = get().current
    const { sync } = get()
    if (!sync.op || sync.phase !== 'running') return
    // Clone pode rodar sem repo aberto (welcome): não exige `current`.
    if (sync.op !== 'clone') {
      if (!repo) return
      // 3.5: cancela só a sync do repo da vez (backup do que rodava antes).
      if (get().syncRepo && get().syncRepo !== repo) return
    }
    const key = SYNC_OP_LABEL[sync.op]
    pendingCancel = sync.op
    set({ sync: { ...sync, message: t(get().lang, 'sync.cancelling') } })
    try {
      await window.treeline.cancelSync(repo ?? '', key)
    } catch {
      /* o timeout mata sozinho */
    }
    // 4.8: NÃO zera o toast aqui — o resultado chega pelo resolve/reject da
    // operação (cancelledSyncToast). Se o abort falhar, o usuário vê que segue.
  },

  doPushForce: async () => {
    // 3.4: repo capturado ANTES da confirmação — force-push nunca cai em
    // outro repo se o usuário trocou de aba enquanto respondia o modal.
    const repo = get().current
    const lang = get().lang
    if (!repo || get().sync.phase === 'running') return
    const ok = await get().confirmAction(
      t(lang, 'pushLease.title'),
      t(lang, 'pushLease.msg'),
      t(lang, 'pushLease.detail'),
      t(lang, 'dlg.push')
    )
    if (!ok) return
    set({ syncRepo: repo, sync: { op: 'push', phase: 'running', message: t(lang, 'sync.running', { op: 'Push' }), retryLease: false, retryPublish: false }, error: null })
    const res = await fail(window.treeline.pushForce(repo, true, lang), (e) => {
      if (get().current !== repo) return
      const cx = cancelledSyncToast('push', get().lang)
      if (cx) return set({ sync: cx })
      return set({ sync: { op: 'push', phase: 'error', message: t(get().lang, 'sync.failed', { op: 'Push', e: cleanErr(e) }), retryLease: false, retryPublish: false } })
    })
    if (res !== null) {
      pendingCancel = null
      if (get().current === repo) set({ sync: { op: 'push', phase: 'success', message: res.summary, retryLease: false, retryPublish: false } })
      await get().refresh()
    }
  },

  doPushPublish: async () => {
    // 3.4: repo e branch capturados antes da confirmação.
    const repo = get().current
    const lang = get().lang
    const branch = get().status?.branch ?? ''
    if (!repo || get().sync.phase === 'running') return
    const ok = await get().confirmAction(
      t(lang, 'pushPublish.title'),
      t(lang, 'pushPublish.msg', { b: branch }),
      t(lang, 'pushPublish.detail'),
      t(lang, 'dlg.push')
    )
    if (!ok) return
    set({ syncRepo: repo, sync: { op: 'push', phase: 'running', message: t(lang, 'sync.running', { op: 'Push' }), retryLease: false, retryPublish: false }, error: null })
    const res = await fail(window.treeline.pushPublish(repo, lang), (e) => {
      if (get().current !== repo) return
      const cx = cancelledSyncToast('push', get().lang)
      if (cx) return set({ sync: cx })
      return set({ sync: { op: 'push', phase: 'error', message: t(get().lang, 'sync.failed', { op: 'Push', e: cleanErr(e) }), retryLease: false, retryPublish: false } })
    })
    if (res !== null) {
      pendingCancel = null
      if (get().current === repo) set({ sync: { op: 'push', phase: 'success', message: res.summary, retryLease: false, retryPublish: false } })
      await get().refresh()
    }
  },

  doRevert: async (hash: string) => {
    // 3.4: reverte exatamente o repo que o usuário via ao confirmar.
    const repo = get().current
    const lang = get().lang
    if (!repo) return
    const ok = await get().confirmAction(
      t(lang, 'revert.title'), t(lang, 'revert.msg', { h: hash.slice(0, 7) }), t(lang, 'revert.detail'), t(lang, 'dlg.pick')
    )
    if (!ok) return
    if (await get().runOp((r, l) => window.treeline.revertCommit(r, hash, l), repo)) {
      set({ selectedCommit: null, commitDetail: null, commitDiff: '' })
    }
  },

  doReset: async (ref: string, mode: ResetMode) => {
    // 3.4: repo capturado antes da confirmação — reset não atinge outro repo.
    const repo = get().current
    const lang = get().lang
    if (!repo) return false
    const ok = await get().confirmAction(
      t(lang, 'reset.title'),
      t(lang, 'reset.msg', { m: mode, r: ref }),
      t(lang, 'reset.detail'),
      t(lang, 'dlg.undo')
    )
    if (!ok) return false
    return get().runOp((r, l) => window.treeline.resetTo(r, ref, mode, l), repo)
  },

  resolveOurs: async (path: string) => {
    await get().runOp((repo, l) => window.treeline.resolveOurs(repo, path, l))
  },

  resolveTheirs: async (path: string) => {
    await get().runOp((repo, l) => window.treeline.resolveTheirs(repo, path, l))
  },

  openResolver: async () => {
    const { current } = get()
    if (!current) return
    set({ conflictLoading: true, resolverOpen: true, conflictIndex: 0, conflictEpoch: get().conflictEpoch + 1 })
    const [files, op] = await Promise.all([
      fail(window.treeline.getConflictFiles(current), (e) => set({ error: e })),
      fail(window.treeline.getConflictOp(current), (e) => set({ error: e }))
    ])
    set({ conflictFiles: files ?? [], conflictOp: op ?? null, conflictLoading: false })
  },

  closeResolver: () => set({ resolverOpen: false, conflictIndex: 0, conflictFiles: [], conflictOp: null }),

  gotoConflictFile: async (index: number) => {
    const files = get().conflictFiles
    if (index < 0 || index >= files.length) return
    set({ conflictIndex: index, conflictLoading: true })
    const cur = get().current
    if (cur) await fail(window.treeline.getConflictStages(cur, files[index].path), (e) => set({ error: e }))
    set({ conflictLoading: false })
  },

  resolveConflictBySide: async (path: string, side: ConflictSide) => {
    const ok = await get().runOp((repo, l) => window.treeline.resolveConflictSide(repo, path, side, l))
    if (!ok) return
    set({ message: get().tr('cr.applied', { f: path }) })
    await get().advanceAfterResolve(path)
  },

  saveConflictResult: async (path: string, content: string, del: boolean) => {
    const ok = await get().runOp((repo, lang) => window.treeline.applyConflictResult(repo, path, content, del, lang))
    if (!ok) return
    set({ message: del ? get().tr('cr.deleteApplied', { f: path }) : get().tr('cr.applied', { f: path }) })
    await get().advanceAfterResolve(path)
  },

  /**
   * Sai do arquivo resolvido e segue para o próximo em conflito; se era o
   * último, FICA no overlay mostrando "sem conflitos" — é ali que mora o
   * Continue da operação (no Revert é a única saída, não existe diálogo).
   * A lista é recarregada porque o `git add` remove o arquivo de
   * `conflictFiles` e pode destravar a operação.
   */
  advanceAfterResolve: async (path: string) => {
    const { current, conflictFiles, conflictIndex } = get()
    if (!current) return
    const remaining = await fail(window.treeline.getConflictFiles(current), (e) => set({ error: e }))
    if (!remaining) return
    if (remaining.length === 0) {
      // NÃO fecha: o rodapé vira "0 conflitos" com Continue habilitado.
      set({ conflictFiles: [], conflictIndex: 0 })
      await get().refresh()
      return
    }
    // Mantém o cursor na posição atual: a lista só encolhe à frente dele.
    const next = Math.min(conflictIndex, remaining.length - 1)
    set({ conflictFiles: remaining, conflictIndex: path && remaining[next]?.path === path ? next : Math.min(next + 1, remaining.length - 1) })
    if (remaining[next]) await fail(window.treeline.getConflictStages(current, remaining[next].path), (e) => set({ error: e }))
    await get().refresh()
  },

  resolveAllRemaining: async (side: ConflictSide) => {
    const { current, conflictFiles } = get()
    if (!current) return
    const files = conflictFiles.map((f) => f.path)
    for (const p of files) {
      // Sequencial: um único lock por repo na fila do main, e o usuário vê
      // o progresso arquivo a arquivo em vez de tudo sumir de uma vez.
      await get().runOp((repo, l) => window.treeline.resolveConflictSide(repo, p, side, l))
    }
    set({ conflictFiles: [], conflictIndex: 0, message: get().tr('cr.applied', { f: `${files.length} file(s)` }) })
    // Igual a advanceAfterResolve: fica no overlay para o Continue da operação.
    await get().refresh()
  },

  toggleRerere: async (on: boolean) => {
    const ok = await get().runOp((repo) => window.treeline.setRerere(repo, on))
    if (ok) set({ rerere: on })
  },

  /**
   * Fecha a operação: `git <op> --continue` do jeito que o Git espera.
   * Fica no overlay porque é onde o usuário termina de resolver.
   */
  continueCurrentOp: async () => {
    const { current, conflictOp } = get()
    if (!current) return
    const op = conflictOp ?? 'merge'
    // `stash apply` não tem `--continue`: o resolve por lado/já feito deixou
    // tudo staged. Concluir é só sair do overlay; a entrada do stash continua
    // existindo e o drop (ou commit do resultado) é decisão do usuário.
    if (op === 'stash') {
      set({
        resolverOpen: false,
        conflictFiles: [],
        conflictIndex: 0,
        message: get().tr('cr.stashDone')
      })
      await get().refresh()
      return
    }
    const ok = await get().runOp((repo, lang) => {
      if (op === 'rebase') return window.treeline.rebaseContinue(repo, lang)
      if (op === 'cherry-pick') return window.treeline.cherryPickContinue(repo, lang)
      if (op === 'revert') return window.treeline.revertContinue(repo, lang)
      return window.treeline.mergeContinue(repo, lang)
    })
    if (!ok) {
      // `runOp` já mostrou o erro (pode ser "commit vazio" ou "avancei e
      // parou em OUTRO conflito"). Se sobraram conflitos, a lista velha está
      // obsoleta: recarrega e mantém o overlay aberto mostrando os novos —
      // sem isso o usuário ficaria olhando marcadores que o rebase já jogou
      // fora. O bump de epoch faz o componente releer o mesmo caminho.
      const rest = await window.treeline.getConflictFiles(current).catch(() => null)
      if (rest && rest.length > 0) {
        set({ conflictFiles: rest, conflictIndex: 0, conflictEpoch: get().conflictEpoch + 1 })
        const first = rest[0]
        if (first) await fail(window.treeline.getConflictStages(current, first.path), (e) => set({ error: e }))
      }
      return
    }
    set({ resolverOpen: false, conflictFiles: [], conflictIndex: 0 })
    await get().refresh()
  },

  abortCurrentOp: async () => {
    const { current, conflictOp } = get()
    if (!current) return
    const op = conflictOp ?? 'merge'
    await get().runOp((repo) => {
      if (op === 'rebase') return window.treeline.abortRebase(repo)
      if (op === 'cherry-pick') return window.treeline.abortCherryPick(repo)
      if (op === 'revert') return window.treeline.abortRevert(repo)
      if (op === 'stash') return window.treeline.abortStash(repo)
      return window.treeline.abortMerge(repo)
    })
    set({ resolverOpen: false, conflictFiles: [], conflictIndex: 0 })
    await get().refresh()
  },

  skipCurrentOp: async () => {
    // 3.10: `--skip` (rebase/cherry-pick/revert): pula o commit que travou.
    const { current, conflictOp } = get()
    if (!current) return
    const op = conflictOp ?? 'merge'
    // Merge/stash não têm `--skip`: abort (desfaz tudo) ou continuar.
    if (op === 'merge' || op === 'stash') return
    const ok = await get().runOp((repo, lang) => {
      if (op === 'rebase') return window.treeline.skipRebase(repo, lang)
      if (op === 'cherry-pick') return window.treeline.skipCherryPick(repo, lang)
      return window.treeline.skipRevert(repo, lang)
    })
    if (ok) set({ resolverOpen: false, conflictFiles: [], conflictIndex: 0 })
    await get().refresh()
  },

  stageHunk: async (hunkIndex: number) => {
    const { current, selectedFile, lang } = get()
    if (!current || !selectedFile) return
    set({ error: null, busy: true })
    try {
      const ok = await fail(
        window.treeline.stageHunk(current, selectedFile.path, selectedFile.staged, hunkIndex, lang),
        (e) => set({ error: cleanErr(e) })
      )
      if (ok !== null) await get().refresh()
    } finally {
      set({ busy: false })
    }
  },

  discardHunk: async (hunkIndex: number) => {
    const { current, selectedFile, lang } = get()
    if (!current || !selectedFile) return
    const ok = await get().confirmAction(
      t(lang, 'hunk.discardT'), t(lang, 'hunk.discardM', { f: selectedFile.path }), t(lang, 'hunk.discardD'), t(lang, 'dlg.drop')
    )
    if (!ok) return
    set({ error: null, busy: true })
    try {
      const done = await fail(
        window.treeline.discardHunk(current, selectedFile.path, selectedFile.staged, hunkIndex, lang),
        (e) => set({ error: cleanErr(e) })
      )
      if (done !== null) await get().refresh()
    } finally {
      set({ busy: false })
    }
  },

  stageLines: async (hunkIndex: number, lines: number[]) => {
    const { current, selectedFile, lang } = get()
    if (!current || !selectedFile) return
    set({ error: null, busy: true })
    try {
      const ok = await fail(
        window.treeline.stageLines(current, selectedFile.path, selectedFile.staged, hunkIndex, lines, lang),
        (e) => set({ error: cleanErr(e) })
      )
      if (ok !== null) await get().refresh()
    } finally {
      set({ busy: false })
    }
  },

  setTheme: (themeName) => {
    applyTheme(themeName)
    set({ theme: themeName })
  },

  setLang: (l) => {
    applyLang(l)
    document.title = t(l, 'app.title')
    // Persiste p/ o main (splash + título da janela na próxima abertura).
    void window.treeline.setLang(l).catch(() => undefined)
    // Troca a identidade do `tr` de propósito: componentes assinam `s.tr`,
    // e só re-renderizam quando a referência muda. Sem isso o texto não atualiza.
    set({ lang: l, tr: (key, vars) => t(l, key, vars) })
  },

  tr: (key, vars) => t(get().lang, key, vars),

  settingsOpen: false,
  identity: { name: '', email: '' },
  identityScope: 'global' as 'global' | 'local',
  identityEffectiveScope: 'global' as 'global' | 'local' | 'none',
  identitySaving: false,
  identityError: null,
  identitySaved: false,

  openSettings: async () => {
    set({ settingsOpen: true, identityError: null, identitySaved: false })
    const { current } = get()
    if (current) {
      // `rerere.enabled` é config LOCAL do repo: lê aqui para o Settings não
      // herdar o valor deixado por outra operação/repo (fora de conflito o
      // refresh nem consulta).
      const [eff, rerere] = await Promise.all([
        fail(window.treeline.getEffectiveIdentity(current), (e) => set({ identityError: e })),
        fail(window.treeline.getRerere(current), (e) => set({ error: e }))
      ])
      if (rerere !== null) set({ rerere })
      if (eff !== null) {
        set({
          identity: { name: eff.name, email: eff.email },
          identityScope: eff.scope === 'local' ? 'local' : 'global',
          identityEffectiveScope: eff.scope
        })
        return
      }
    }
    const id = await fail(window.treeline.getIdentity(), (e) => set({ identityError: e }))
    if (id !== null) set({ identity: id, identityScope: 'global', identityEffectiveScope: 'global' })
  },

  closeSettings: () => set({ settingsOpen: false, identityError: null, identitySaved: false }),

  setIdentityScope: (s) => set({ identityScope: s }),

  saveIdentity: async (id) => {
    const lang = get().lang
    if (!id.name.trim()) {
      set({ identityError: t(lang, 'settings.nameEmpty') })
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id.email.trim())) {
      set({ identityError: t(lang, 'settings.emailInvalid') })
      return
    }
    set({ identitySaving: true, identityError: null, identitySaved: false })
    const scope = get().identityScope
    const { current } = get()
    const ok =
      scope === 'local' && current
        ? await fail(window.treeline.setRepoIdentity(current, id, get().lang), (e) => set({ identityError: e }))
        : await fail(window.treeline.setIdentity(id, get().lang), (e) => set({ identityError: e }))
    set({ identitySaving: false, identitySaved: ok !== null })
    if (ok !== null) {
      set({ identity: { name: id.name.trim(), email: id.email.trim() }, identityEffectiveScope: scope })
    }
  },

  selectedCommit: null,
  commitDetail: null,
  commitDiff: '',

  selectCommit: async (hash) => {
    set({ selectedCommit: hash, commitDetail: null, commitDiff: '', selectedFile: null, diff: '' })
    const { current } = get()
    if (!current || !hash) return
    const detail = await fail(window.treeline.getCommitDetail(current, hash), (e) => set({ error: e }))
    if (detail !== null) {
      set({ commitDetail: detail })
      if (detail.files.length === 1) await get().selectCommitFile(detail.files[0] as string)
    }
  },

  selectCommitFile: async (path) => {
    set({ commitDiff: '' })
    const { current, selectedCommit } = get()
    if (!current || !selectedCommit) return
    const diff = await fail(window.treeline.getCommitDiff(current, selectedCommit, path), (e) =>
      set({ error: e })
    )
    set({ commitDiff: diff ?? '' })
  },

  menu: null,
  openMenu: (x, y, items) => set({ menu: { x, y, items } }),
  closeMenu: () => set({ menu: null }),

  copyText: async (text) => {
    await fail(window.treeline.copyText(text), (e) => set({ error: e }))
  },

  revealRepoFile: async (path) => {
    const { current } = get()
    if (!current) return
    await fail(window.treeline.reveal(`${current}/${path}`), (e) => set({ error: e }))
  },

  revealFullPath: async (path) => {
    await fail(window.treeline.reveal(path), (e) => set({ error: e }))
  },

  removeBookmark: async (path) => {
    const repos = await fail(window.treeline.removeRecent(path), (e) => set({ error: e }))
    // Sessão de terminal órfã não serve para nada: mata o pty.
    await fail(window.treeline.termStop(path), () => undefined)
    if (repos !== null) {
      set({ repos })
      if (get().current === path) {
        if (repos.length > 0) await get().selectRepo(repos[0] as string)
        else set({ current: null, status: null, commits: [], branches: [] })
      }
    }
  },

  discardFile: async (path, tracked) => {
    const { current, lang } = get()
    if (!current) return
    const ok = await get().confirmAction(
      t(lang, 'file.discardT'),
      t(lang, 'file.discardM', { f: path }),
      t(lang, tracked ? 'file.discardTrackedD' : 'file.discardUntrackedD'),
      t(lang, 'dlg.discard')
    )
    if (!ok) return
    await fail(window.treeline.discard(current, path, tracked), (e) => set({ error: e }))
    await get().refresh()
  },

  dialog: null,
  openDlg: (kind) => {
    set({ dialog: kind })
    // Dialogs mostram estado (listas, conflito, reflog): recarrega ao abrir
    // para nunca exibir dado velho. Leituras bypassam a fila (rápido).
    void get().refresh()
  },
  closeDlg: () => set({ dialog: null }),
  refPreset: null,
  setRefPreset: (p) => set({ refPreset: p }),
  blame: [],
  blameFile: null,
  blameLoading: false,
  loadBlame: async (path, rev) => {
    const { current } = get()
    if (!current) return
    set({ blame: [], blameFile: path, blameLoading: true, error: null })
    const rows = await fail(window.treeline.getBlame(current, path, rev), (e) => set({ error: cleanErr(e) }))
    set({ blame: rows ?? [], blameLoading: false })
  },
  closeBlame: () => set({ blame: [], blameFile: null, blameLoading: false, dialog: get().dialog === 'blame' ? null : get().dialog }),
  fileHistory: [],
  fileHistoryPath: null,
  fhistLoading: false,
  loadFileHistory: async (path) => {
    const { current } = get()
    if (!current) return
    set({ fileHistory: [], fileHistoryPath: path, fhistLoading: true, error: null })
    const rows = await fail(window.treeline.getFileHistory(current, path, 100), (e) => set({ error: cleanErr(e) }))
    set({ fileHistory: rows ?? [], fhistLoading: false })
  },
  closeFileHistory: () => set({ fileHistory: [], fileHistoryPath: null, fhistLoading: false, dialog: get().dialog === 'fileHistory' ? null : get().dialog }),
  loadCommitDiffFile: async (hash, path) => {
    const { current } = get()
    if (!current || !hash || !path) return ''
    const diff = await fail(window.treeline.getCommitDiff(current, hash, path), (e) => set({ error: cleanErr(e) }))
    return diff ?? ''
  },
  compareA: null,
  compareB: null,
  compare: null,
  compareFile: null,
  compareDiffText: '',
  setCompareEnd: async (hash) => {
    const { compareA, current } = get()
    if (!compareA) { set({ compareA: hash, compareB: null, compare: null }); return }
    if (compareA === hash) return
    set({ compareB: hash, compare: null, compareFile: null, compareDiffText: '', error: null })
    if (!current) return
    const sum = await fail(window.treeline.compareCommits(current, compareA, hash), (e) => set({ error: cleanErr(e) }))
    if (sum !== null) {
      set({ compare: sum })
      if (sum.files.length === 1) await get().selectCompareFile(sum.files[0] as string)
    }
  },
  clearCompare: () => set({ compareA: null, compareB: null, compare: null, compareFile: null, compareDiffText: '', dialog: get().dialog === 'compare' ? null : get().dialog }),
  selectCompareFile: async (path) => {
    const { current, compareA, compareB } = get()
    if (!current || !compareA || !compareB) return
    set({ compareFile: path, compareDiffText: '' })
    const d = await fail(window.treeline.compareDiff(current, compareA, compareB, path), (e) => set({ error: cleanErr(e) }))
    set({ compareDiffText: d ?? '' })
  },
  paletteOpen: false,
  setPalette: (open) => set({ paletteOpen: open }),
  gotoFileOpen: false,
  gotoFileList: [],
  setGoToFileOpen: (open) => {
    if (open) void get().refreshFileIndex()
    set({ gotoFileOpen: open })
  },
  refreshFileIndex: async () => {
    const { current, status } = get()
    if (!current) return
    try {
      const tracked = await window.treeline.getTrackedFiles(current).catch(() => [] as string[])
      const untracked = status?.untracked ?? []
      const unstaged = (status?.unstaged ?? []).map((f) => f.path)
      const staged = status?.staged ?? []
      const stagedPaths = staged.map((f) => f.path)
      const files = new Set<string>([...tracked, ...untracked, ...unstaged, ...stagedPaths])
      set({ gotoFileList: [...files].sort((a, b) => a.localeCompare(b)) })
    } catch {
      try {
        const s = get().status
        const files = new Set<string>([...(s?.untracked ?? []), ...(s?.unstaged ?? []).map((f) => f.path), ...(s?.staged ?? []).map((f) => f.path)])
        set({ gotoFileList: [...files].sort((a, b) => a.localeCompare(b)) })
      } catch {
        /* ignora */
      }
    }
  },
  csQuery: '',
  setCsQuery: (q) => set({ csQuery: q }),
  csOpts: { caseSensitive: false, regex: false, remotes: false },
  setCsOpt: (k, v) => set({ csOpts: { ...get().csOpts, [k]: v } }),
  csGroups: [],
  csChanges: {},
  csLoading: false,
  csStats: null,
  csToken: 0,
  runCodeSearch: async () => {
    const { current, csQuery, csOpts, csToken } = get()
    const token = csToken + 1
    set({ csToken: token, csGroups: [], csChanges: {}, csLoading: true, csStats: null })
    if (csToken > 0) void window.treeline.cancelSearch(csToken).catch(() => undefined)
    if (!current || !csQuery.trim()) {
      set({ csLoading: false })
      return
    }
    try {
      const stats = await window.treeline.searchCode(current, csQuery, csOpts, token)
      if (get().csToken === token) set({ csLoading: false, csStats: stats })
    } catch (e) {
      if (get().csToken === token) {
        set({
          csLoading: false,
          csStats: { totalHits: 0, branches: 0, truncated: false, durationMs: 0, cancelled: false, error: cleanErr(e) }
        })
      }
    }
  },
  applyCsProgress: (p) => {
    if (p.token !== get().csToken) return
    if (p.kind === 'group' && p.group) set({ csGroups: [...get().csGroups, p.group] })
    else if (p.kind === 'change' && p.path) set({ csChanges: { ...get().csChanges, [p.path]: p.change ?? null } })
    else if (p.kind === 'done' && p.stats) set({ csLoading: false, csStats: p.stats })
  },
  cancelCodeSearch: async () => {
    const { csToken } = get()
    set({ csLoading: false })
    if (csToken > 0) await window.treeline.cancelSearch(csToken).catch(() => undefined)
  },
  openCodeResult: async (path, ref, current) => {
    const st = get()
    st.openDlg('blame')
    // Branch atual: blame do working tree; outras refs: conteúdo naquela branch.
    await st.loadBlame(path, current || !ref ? undefined : ref)
  },
  closeCodeSearch: () => {
    const { csToken } = get()
    if (csToken > 0) void window.treeline.cancelSearch(csToken).catch(() => undefined)
    set({ dialog: get().dialog === 'codeSearch' ? null : get().dialog })
  },
  resetCodeSearch: () => set({ csGroups: [], csChanges: {}, csLoading: false, csStats: null, csQuery: '' }),
  autoFetchMin: (() => {
    try {
      const v = Number(localStorage.getItem('treeline-autofetch'))
      return Number.isFinite(v) && v > 0 ? Math.min(v, 240) : 0
    } catch {
      return 0
    }
  })(),
  setAutoFetchMin: (min) => {
    const v = Math.max(0, Math.min(Math.round(min) || 0, 240))
    try {
      localStorage.setItem('treeline-autofetch', String(v))
    } catch {
      /* ignora */
    }
    set({ autoFetchMin: v })
  },
  autoFetchBg: (() => {
    try {
      const v = localStorage.getItem('treeline-autofetch-bg')
      return v === 'true'
    } catch {
      return false
    }
  })(),
  setAutoFetchBg: (v: boolean) => {
    try {
      localStorage.setItem('treeline-autofetch-bg', String(v))
    } catch {
      /* ignora */
    }
    set({ autoFetchBg: v })
  },
  shortcuts: loadShortcuts(),
  setShortcut: (action, key) => {
    const next = { ...get().shortcuts, [action]: key.trim().toLowerCase() }
    saveShortcuts(next)
    set({ shortcuts: next })
  },
  resetShortcuts: () => {
    const defs = { ...SHORTCUT_DEFAULTS } as Record<ShortcutAction, string>
    saveShortcuts(defs)
    set({ shortcuts: defs })
  },
  matchShortcut: (action, e) => get().shortcuts[action] === eventShortcut(e),
  headPing: 0,
  checkoutBranch: async (name) => {
    const { lang } = get()
    const ok = await get().runOp((repo, l) => window.treeline.checkoutBranch(repo, name, l))
    if (ok) {
      // Volta p/ Working Copy e avisa o grafo p/ rolar até o novo HEAD.
      set({ selectedCommit: null, commitDetail: null, commitDiff: '', headPing: get().headPing + 1 })
      return true
    }
    // Checkout barrado por worktree suja: oferece stash + retry em 1 clique.
    const err = get().error ?? ''
    if (!/bloqueado|blocked|local changes|overwritten/i.test(err)) return false
    const go = await get().confirmAction(
      t(lang, 'checkout.stashT'),
      t(lang, 'checkout.stashM', { n: name }),
      t(lang, 'checkout.stashD'),
      t(lang, 'stash.title')
    )
    if (!go) return false
    const stashed = await get().runOp((repo, l) =>
      window.treeline.createStash(repo, t(l, 'checkout.stashMsg', { n: name }), true, l)
    )
    if (!stashed) return false
    const ok2 = await get().runOp((repo, l) => window.treeline.checkoutBranch(repo, name, l))
    if (ok2) {
      set({ selectedCommit: null, commitDetail: null, commitDiff: '', headPing: get().headPing + 1 })
    }
    return ok2
  },
  checkoutRemote: async (remoteBranch) => {
    const ok = await get().runOp((repo, l) => window.treeline.checkoutRemote(repo, remoteBranch, l))
    if (ok) {
      set({ selectedCommit: null, commitDetail: null, commitDiff: '', headPing: get().headPing + 1 })
    }
    return ok
  },
  checkoutTag: async (tag) => {
    const { lang } = get()
    // HEAD destacado: avisa que commits novos aqui ficam órfãos sem branch.
    const go = await get().confirmAction(
      t(lang, 'tag.checkoutT'),
      t(lang, 'tag.checkoutM', { n: tag }),
      t(lang, 'tag.checkoutD'),
      t(lang, 'dlg.checkout')
    )
    if (!go) return false
    const ok = await get().runOp((repo, l) => window.treeline.checkoutTag(repo, tag, l))
    if (ok) {
      set({ selectedCommit: null, commitDetail: null, commitDiff: '', headPing: get().headPing + 1 })
    }
    return ok
  },
  sidebarCollapsed: (() => {
    try {
      return localStorage.getItem('treeline-sidebar') === 'collapsed'
    } catch {
      return false
    }
  })(),
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed
    try {
      localStorage.setItem('treeline-sidebar', next ? 'collapsed' : 'open')
    } catch {
      /* ignora */
    }
    set({ sidebarCollapsed: next })
  },
  terminalOpen: false,
  toggleTerminal: () => set({ terminalOpen: !get().terminalOpen }),
  openTerminalDrawer: () => set({ terminalOpen: true }),
  closeTerminalDrawer: () => set({ terminalOpen: false }),
  stashes: [],
  tags: [],
  remotes: [],
  reflog: [],
  mergeState: { inProgress: false },
  rebaseState: { inProgress: false },
  pickState: { inProgress: false },
  revertState: { inProgress: false },
  worktree: null,
  lfs: null,
  submodules: [],
  flowInstalled: false,
  conflictFiles: [],
  conflictOp: null,
  conflictIndex: 0,
  resolverOpen: false,
  conflictLoading: false,
  conflictEpoch: 0,
  rerere: false,

  confirmAction: (title, message, detail, ok) =>
    new Promise<boolean>((resolve) => {
      confirmQueue.push({ title, message, detail, ok, resolve })
      if (confirmQueue.length === 1) set({ confirmState: { title, message, detail, ok } })
    }),

  confirmState: null,
  resolveConfirm: (v) => {
    const cur = confirmQueue[0]
    if (cur) {
      cur.resolve(v)
      // shift() antes de montar a próxima: evita reentrada de resolveConfirm.
      confirmQueue.shift()
    }
    const next = confirmQueue[0]
    set({ confirmState: next ? { title: next.title, message: next.message, detail: next.detail, ok: next.ok } : null })
  },

  runOp: async (op, repo?) => {
    // `repo` opcional: chamadas que confirmaram antes (reach/reset/push)
    // passam o repo capturado; o resto usa a aba atual.
    const target = repo ?? get().current
    const lang = get().lang
    if (!target) return false
    set({ error: null, busy: true })
    try {
      await op(target, lang)
    } catch (e) {
      set({ error: cleanErr(e) })
      return false
    } finally {
      set({ busy: false })
    }
    // 3.1: refresh só se ainda estamos olhando o repo alvo da operação.
    if (get().current === target) await get().refresh()
    return true
  },

  cloneRepo: async (url) => {
    const { lang } = get()
    set({ error: null })
    // 4.4: clone aparece no toast de sync (progresso + botão cancelar) mesmo
    // sem repo aberto — o cancel no main aborta o filho por chave global.
    set({ sync: { op: 'clone', phase: 'running', message: t(lang, 'sync.running', { op: SYNC_OP_LABEL.clone }), retryLease: false, retryPublish: false }, syncRepo: null })
    let target: string | null = null
    try {
      target = await window.treeline.cloneRepo(url, lang)
    } catch (e) {
      const cx = cancelledSyncToast('clone', get().lang)
      if (cx) {
        set({ sync: cx })
        return false
      }
      const detail = cleanErr(e)
      set({ error: detail, sync: { op: 'clone', phase: 'error', message: t(get().lang, 'sync.failed', { op: 'Clone', e: detail }), retryLease: false, retryPublish: false } })
      return false
    }
    pendingCancel = null
    if (!target) {
      // Usuário fechou o seletor de pasta: limpa o toast, não é erro.
      set({ sync: { op: null, phase: null, message: '', retryLease: false, retryPublish: false }, syncRepo: null })
      return false
    }
    const name = target.split(/[\\/]/).pop() ?? target
    set({ sync: { op: 'clone', phase: 'success', message: t(get().lang, 'sync.cloned', { name }), retryLease: false, retryPublish: false } })
    await get().selectRepo(target)
    set({ repos: [target, ...get().repos.filter((r) => r !== target)] })
    return true
  },

  initRepo: async () => {
    const { lang } = get()
    set({ error: null })
    let target: string | null = null
    try {
      target = await window.treeline.initRepo(lang)
    } catch (e) {
      set({ error: cleanErr(e) })
      return false
    }
    if (!target) return false
    await get().selectRepo(target)
    set({ repos: [target, ...get().repos.filter((r) => r !== target)] })
    return true
  }
}))

/** Atalhos de operação para os dialogs (retornam true = OK, pode fechar). */
export const dialogOps = {
  createBranch: (name: string, from: string, checkout: boolean) =>
    useStore.getState().runOp((repo, lang) => window.treeline.createBranch(repo, name, from, checkout, lang)),
  checkoutBranch: (name: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.checkoutBranch(repo, name, lang)),
  checkoutRemote: (remoteBranch: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.checkoutRemote(repo, remoteBranch, lang)),
  renameBranch: (oldName: string, newName: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.renameBranch(repo, oldName, newName, lang)),
  deleteBranch: (name: string, force: boolean) =>
    useStore.getState().runOp((repo, lang) => window.treeline.deleteBranch(repo, name, force, lang)),
  mergeBranch: (ref: string, noFf: boolean) =>
    useStore.getState().runOp((repo, lang) => window.treeline.mergeBranch(repo, ref, noFf, lang)),
  mergeContinue: () =>
    useStore.getState().runOp((repo, lang) => window.treeline.mergeContinue(repo, lang)),
  abortMerge: () =>
    useStore.getState().runOp((repo) => window.treeline.abortMerge(repo)),
  createStash: (message: string, includeUntracked: boolean) =>
    useStore.getState().runOp((repo, lang) => window.treeline.createStash(repo, message, includeUntracked, lang)),
  applyStash: (ref: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.applyStash(repo, ref, lang)),
  popStash: (ref: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.popStash(repo, ref, lang)),
  dropStash: (ref: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.dropStash(repo, ref, lang)),
  createTag: (name: string, message: string, commit: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.createTag(repo, name, message, commit, lang)),
  pushTag: (name: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.pushTag(repo, name, lang)),
  deleteTag: (name: string, remoteToo: boolean) =>
    useStore.getState().runOp((repo, lang) => window.treeline.deleteTag(repo, name, remoteToo, lang)),
  rebaseOnto: (ref: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.rebaseOnto(repo, ref, lang)),
  rebaseOntoStash: (ref: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.rebaseOnto(repo, ref, lang, true)),
  rebaseContinue: () =>
    useStore.getState().runOp((repo, lang) => window.treeline.rebaseContinue(repo, lang)),
  skipRebase: () =>
    useStore.getState().runOp((repo, lang) => window.treeline.skipRebase(repo, lang)),
  abortRebase: () =>
    useStore.getState().runOp((repo) => window.treeline.abortRebase(repo)),
  cherryPick: (hash: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.cherryPick(repo, hash, lang)),
  cherryPickContinue: () =>
    useStore.getState().runOp((repo, lang) => window.treeline.cherryPickContinue(repo, lang)),
  skipCherryPick: () =>
    useStore.getState().runOp((repo, lang) => window.treeline.skipCherryPick(repo, lang)),
  abortCherryPick: () =>
    useStore.getState().runOp((repo) => window.treeline.abortCherryPick(repo)),
  flowStart: (type: FlowType, name: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.flowStart(repo, type, name, lang)),
  flowFinish: (type: FlowType, name: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.flowFinish(repo, type, name, lang)),
  openTerminal: () =>
    useStore.getState().runOp((repo, lang) => window.treeline.openTerminal(repo, lang)),
  undoToReflog: (ref: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.undoToReflog(repo, ref, lang)),
  restoreBackup: (file: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.restoreBackup(repo, file, lang)),
  updateSubmodules: () =>
    useStore.getState().runOp((repo, lang) => window.treeline.updateSubmodules(repo, lang)),
  addRemote: (name: string, url: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.addRemote(repo, name, url, lang)),
  removeRemote: (name: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.removeRemote(repo, name, lang)),
  editRemote: (name: string, url: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.editRemote(repo, name, url, lang)),
  setUpstream: (branch: string, upstream: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.setUpstream(repo, branch, upstream, lang)),
  resetTo: (ref: string, mode: ResetMode) =>
    useStore.getState().runOp((repo, lang) => window.treeline.resetTo(repo, ref, mode, lang)),
  revertCommit: (hash: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.revertCommit(repo, hash, lang)),
  rebaseInteractive: (base: string, plan: RebasePlanEntry[]) =>
    useStore.getState().runOp((repo, lang) => window.treeline.rebaseInteractive(repo, base, plan, lang)),
  rebaseInteractiveStash: (base: string, plan: RebasePlanEntry[]) =>
    useStore.getState().runOp((repo, lang) => window.treeline.rebaseInteractive(repo, base, plan, lang, true)),
  skipRevert: () =>
    useStore.getState().runOp((repo, lang) => window.treeline.skipRevert(repo, lang)),
  abortRevert: () =>
    useStore.getState().runOp((repo) => window.treeline.abortRevert(repo)),
  openPR: () =>
    useStore.getState().runOp((repo, lang) => window.treeline.openPR(repo, lang)),
  lfsPull: () =>
    useStore.getState().runOp((repo, lang) => window.treeline.lfsPull(repo, lang)),
  lfsPush: () =>
    useStore.getState().runOp((repo, lang) => window.treeline.lfsPush(repo, lang)),
  lfsTrack: (pattern: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.lfsTrack(repo, pattern, lang)),
  lfsUntrack: (pattern: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.lfsUntrack(repo, pattern, lang)),
}
