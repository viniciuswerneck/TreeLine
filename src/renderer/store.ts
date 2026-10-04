import { create } from 'zustand'
import type { BlameLine, BranchDetail, BranchInfo, CompareSummary, CommitDetail, CommitInfo, FileHistoryEntry, FlowType, GitIdentity, HunkInfo, OpState, RebasePlanEntry, ReflogEntry, RemoteBranchInfo, RemoteInfo, RepoStatus, ResetMode, StashInfo, SyncOp, TagInfo, WorktreeInfo } from '../shared/types'
import { applyTheme, loadTheme } from './themes'
import { applyLang, loadLang, t, type DictKey, type Lang } from './i18n'
import type { MenuItem } from './components/ContextMenu'

export type DialogKind =
  | 'branch' | 'merge' | 'stash' | 'tag' | 'rebase'
  | 'pick' | 'flow' | 'reflog' | 'remotes'
  | 'reset' | 'rebaseInteractive' | 'blame' | 'fileHistory' | 'compare'

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

let confirmResolve: ((v: boolean) => void) | null = null

export interface SelectedFile {
  path: string
  staged: boolean
}

export type SyncPhase = 'running' | 'success' | 'error'

export interface SyncState {
  op: SyncOp | null
  phase: SyncPhase | null
  message: string
  /** Push rejeitado por non-fast-forward: oferece retry com lease. */
  retryLease: boolean
}

interface TreeLineState {
  repos: string[]
  current: string | null
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
  sync: SyncState
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
  setBranchFilter: (f: 'all' | 'current') => void
  stageSelected: () => Promise<void>
  unstageSelected: () => Promise<void>
  stageAll: () => Promise<void>
  unstageAll: () => Promise<void>
  doCommit: () => Promise<void>
  doPush: () => Promise<void>
  doPushForce: () => Promise<void>
  doPull: () => Promise<void>
  doFetch: () => Promise<void>
  doRevert: (hash: string) => Promise<void>
  doReset: (ref: string, mode: ResetMode) => Promise<boolean>
  resolveOurs: (path: string) => Promise<void>
  resolveTheirs: (path: string) => Promise<void>
  stageHunk: (hunkIndex: number) => Promise<void>
  discardHunk: (hunkIndex: number) => Promise<void>
  stageLines: (hunkIndex: number, lines: number[]) => Promise<void>
  clearSync: () => void
  setTheme: (t: string) => void
  setLang: (l: Lang) => void
  tr: (key: DictKey, vars?: Record<string, string | number>) => string
  settingsOpen: boolean
  identity: GitIdentity
  identitySaving: boolean
  identityError: string | null
  identitySaved: boolean
  openSettings: () => Promise<void>
  closeSettings: () => void
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
  flowInstalled: boolean
  confirmAction: (title: string, message: string, detail: string, ok: string) => Promise<boolean>
  confirmState: ConfirmState | null
  resolveConfirm: (v: boolean) => void
  runOp: (op: (repo: string, lang: Lang) => Promise<unknown>) => Promise<boolean>
  cloneRepo: (url: string) => Promise<boolean>
  initRepo: () => Promise<boolean>
  terminalOpen: boolean
  toggleTerminal: () => void
  openTerminalDrawer: () => void
  closeTerminalDrawer: () => void
  // Blame / file-history / compare / paleta
  blame: BlameLine[]
  blameFile: string | null
  loadBlame: (path: string, rev?: string) => Promise<void>
  closeBlame: () => void
  fileHistory: FileHistoryEntry[]
  fileHistoryPath: string | null
  loadFileHistory: (path: string) => Promise<void>
  closeFileHistory: () => void
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
function cleanErr(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  const idx = m.lastIndexOf('Error: ')
  const detail = idx >= 0 ? m.slice(idx + 'Error: '.length) : m
  return detail
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' — ')
    .slice(0, 500)
}

export const useStore = create<TreeLineState>()((set, get) => ({
  repos: [],
  current: null,
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
  sync: { op: null, phase: null, message: '', retryLease: false },
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
    set({ current: path, status: null, commits: [], branches: [], branchesDetailed: [], remoteBranches: [], stashes: [], tags: [], remotes: [], reflog: [], mergeState: { inProgress: false }, rebaseState: { inProgress: false }, pickState: { inProgress: false }, revertState: { inProgress: false }, worktree: null, selectedFile: null, diff: '', hunks: [], error: null, selectedCommit: null, commitDetail: null, commitDiff: '', blame: [], blameFile: null, fileHistory: [], fileHistoryPath: null, compareA: null, compareB: null, compare: null, dialog: null })
    await window.treeline.addRecent(path)
    await get().refresh()
  },

  refresh: async () => {
    const { current } = get()
    if (!current) return
    set({ loading: true, error: null })
    const [status, commits, branches, branchesDetailed, remoteBranches, stashes, tags, remotes, reflog, mergeState, rebaseState, pickState, revertState, worktree, flow] = await Promise.all([
      fail(window.treeline.getStatus(current), (e) => set({ error: e })),
      fail(window.treeline.getLog(current, 300), (e) => set({ error: e })),
      fail(window.treeline.getBranches(current), (e) => set({ error: e })),
      fail(window.treeline.getBranchesDetailed(current), (e) => set({ error: e })),
      fail(window.treeline.getRemoteBranches(current), (e) => set({ error: e })),
      fail(window.treeline.getStashes(current), (e) => set({ error: e })),
      fail(window.treeline.getTags(current), (e) => set({ error: e })),
      fail(window.treeline.getRemotes(current), (e) => set({ error: e })),
      fail(window.treeline.getReflog(current, 50), (e) => set({ error: e })),
      fail(window.treeline.getMergeState(current), (e) => set({ error: e })),
      fail(window.treeline.getRebaseState(current), (e) => set({ error: e })),
      fail(window.treeline.getCherryPickState(current), (e) => set({ error: e })),
      fail(window.treeline.getRevertState(current), (e) => set({ error: e })),
      fail(window.treeline.getWorktreeInfo(current), (e) => set({ error: e })),
      fail(window.treeline.detectFlow(current), (e) => set({ error: e }))
    ])
    set({
      status: status ?? get().status,
      commits: commits ?? get().commits,
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
      flowInstalled: flow?.installed ?? get().flowInstalled,
      loading: false
    })
    const sel = get().selectedFile
    if (sel) await get().selectFile(sel)
  },

  selectFile: async (f) => {
    set({ selectedFile: f, diff: '', hunks: [], selectedCommit: null, commitDetail: null, commitDiff: '' })
    const { current } = get()
    if (!current || !f) return
    const [diff, hunks] = await Promise.all([
      fail(window.treeline.getDiff(current, f.path, f.staged), (e) => set({ error: e })),
      fail(window.treeline.getHunks(current, f.path, f.staged), (e) => set({ error: e }))
    ])
    set({ diff: diff ?? '', hunks: hunks ?? [] })
  },

  setMessage: (m) => set({ message: m }),
  setAmend: (a) => set({ amend: a }),
  setFilter: (f) => set({ filter: f }),
  setBranchFilter: (f) => set({ branchFilter: f }),

  stageAll: async () => {
    const { current, status } = get()
    if (!current || !status) return
    set({ error: null })
    const files = [...status.unstaged.map((f) => f.path), ...status.untracked]
    for (const file of files) {
      const ok = await fail(window.treeline.stage(current, file), (e) => set({ error: e }))
      if (ok === null) return
    }
    await get().refresh()
  },

  unstageAll: async () => {
    const { current, status } = get()
    if (!current || !status) return
    set({ error: null })
    for (const f of status.staged) {
      const ok = await fail(window.treeline.unstage(current, f.path), (e) => set({ error: e }))
      if (ok === null) return
    }
    await get().refresh()
  },
  stageSelected: async () => {
    const { current, selectedFile } = get()
    if (!current || !selectedFile) return
    const ok = await fail(window.treeline.stage(current, selectedFile.path), (e) => set({ error: e }))
    if (ok !== null) {
      await get().refresh()
      await get().selectFile({ path: selectedFile.path, staged: true })
    }
  },

  unstageSelected: async () => {
    const { current, selectedFile } = get()
    if (!current || !selectedFile) return
    const ok = await fail(window.treeline.unstage(current, selectedFile.path), (e) => set({ error: e }))
    if (ok !== null) {
      await get().refresh()
      await get().selectFile({ path: selectedFile.path, staged: false })
    }
  },

  doCommit: async () => {
    const { current, message, amend, lang } = get()
    if (!current) return
    set({ error: null })
    const ok = await fail(window.treeline.commit(current, message, amend, lang), (e) => set({ error: e }))
    if (ok !== null) {
      set({ message: '', selectedFile: null, diff: '' })
      await get().refresh()
    }
  },

  doPush: async () => {
    const { current, lang } = get()
    if (!current || get().sync.phase === 'running') return
    set({ sync: { op: 'push', phase: 'running', message: t(lang, 'sync.running', { op: 'Push' }), retryLease: false }, error: null })
    const res = await fail(window.treeline.push(current, lang), (e) => {
      const detail = cleanErr(e)
      const lease = /non-fast-forward|fetch first|rejected/i.test(detail)
      return set({ sync: { op: 'push', phase: 'error', message: t(get().lang, 'sync.failed', { op: 'Push', e: detail }), retryLease: lease } })
    })
    if (res !== null) {
      set({ sync: { op: 'push', phase: 'success', message: res.summary, retryLease: false } })
      await get().refresh()
    }
  },

  doPull: async () => {
    const { current, lang } = get()
    if (!current || get().sync.phase === 'running') return
    set({ sync: { op: 'pull', phase: 'running', message: t(lang, 'sync.running', { op: 'Pull' }), retryLease: false }, error: null })
    const res = await fail(window.treeline.pull(current, lang), (e) =>
      set({ sync: { op: 'pull', phase: 'error', message: t(get().lang, 'sync.failed', { op: 'Pull', e: cleanErr(e) }), retryLease: false } })
    )
    if (res !== null) {
      set({ sync: { op: 'pull', phase: 'success', message: res.summary, retryLease: false } })
      await get().refresh()
    }
  },

  doFetch: async () => {
    const { current, lang } = get()
    if (!current || get().sync.phase === 'running') return
    set({ sync: { op: 'fetch', phase: 'running', message: t(lang, 'sync.running', { op: 'Fetch' }), retryLease: false }, error: null })
    const res = await fail(window.treeline.fetch(current, lang), (e) =>
      set({ sync: { op: 'fetch', phase: 'error', message: t(get().lang, 'sync.failed', { op: 'Fetch', e: cleanErr(e) }), retryLease: false } })
    )
    if (res !== null) {
      set({ sync: { op: 'fetch', phase: 'success', message: res.summary, retryLease: false } })
      await get().refresh()
    }
  },

  clearSync: () => set({ sync: { op: null, phase: null, message: '', retryLease: false } }),

  doPushForce: async () => {
    const { current, lang } = get()
    if (!current || get().sync.phase === 'running') return
    const ok = await get().confirmAction(
      t(lang, 'pushLease.title'),
      t(lang, 'pushLease.msg'),
      t(lang, 'pushLease.detail'),
      t(lang, 'dlg.push')
    )
    if (!ok) return
    set({ sync: { op: 'push', phase: 'running', message: t(lang, 'sync.running', { op: 'Push' }), retryLease: false }, error: null })
    const res = await fail(window.treeline.pushForce(current, true, lang), (e) =>
      set({ sync: { op: 'push', phase: 'error', message: t(get().lang, 'sync.failed', { op: 'Push', e: cleanErr(e) }), retryLease: false } })
    )
    if (res !== null) {
      set({ sync: { op: 'push', phase: 'success', message: res.summary, retryLease: false } })
      await get().refresh()
    }
  },

  doRevert: async (hash: string) => {
    const { lang } = get()
    const ok = await get().confirmAction(
      t(lang, 'revert.title'), t(lang, 'revert.msg', { h: hash.slice(0, 7) }), t(lang, 'revert.detail'), t(lang, 'dlg.pick')
    )
    if (!ok) return
    if (await get().runOp((repo, l) => window.treeline.revertCommit(repo, hash, l))) {
      set({ selectedCommit: null, commitDetail: null, commitDiff: '' })
    }
  },

  doReset: async (ref: string, mode: ResetMode) => {
    const { lang } = get()
    const ok = await get().confirmAction(
      t(lang, 'reset.title'),
      t(lang, 'reset.msg', { m: mode, r: ref }),
      t(lang, 'reset.detail'),
      t(lang, 'dlg.undo')
    )
    if (!ok) return false
    return get().runOp((repo, l) => window.treeline.resetTo(repo, ref, mode, l))
  },

  resolveOurs: async (path: string) => {
    await get().runOp((repo, l) => window.treeline.resolveOurs(repo, path, l))
  },

  resolveTheirs: async (path: string) => {
    await get().runOp((repo, l) => window.treeline.resolveTheirs(repo, path, l))
  },

  stageHunk: async (hunkIndex: number) => {
    const { current, selectedFile, lang } = get()
    if (!current || !selectedFile) return
    set({ error: null })
    const ok = await fail(
      window.treeline.stageHunk(current, selectedFile.path, selectedFile.staged, hunkIndex, lang),
      (e) => set({ error: cleanErr(e) })
    )
    if (ok !== null) await get().refresh()
  },

  discardHunk: async (hunkIndex: number) => {
    const { current, selectedFile, lang } = get()
    if (!current || !selectedFile) return
    const ok = await get().confirmAction(
      t(lang, 'hunk.discardT'), t(lang, 'hunk.discardM', { f: selectedFile.path }), t(lang, 'hunk.discardD'), t(lang, 'dlg.drop')
    )
    if (!ok) return
    set({ error: null })
    const done = await fail(
      window.treeline.discardHunk(current, selectedFile.path, selectedFile.staged, hunkIndex, lang),
      (e) => set({ error: cleanErr(e) })
    )
    if (done !== null) await get().refresh()
  },

  stageLines: async (hunkIndex: number, lines: number[]) => {
    const { current, selectedFile, lang } = get()
    if (!current || !selectedFile) return
    set({ error: null })
    const ok = await fail(
      window.treeline.stageLines(current, selectedFile.path, selectedFile.staged, hunkIndex, lines, lang),
      (e) => set({ error: cleanErr(e) })
    )
    if (ok !== null) await get().refresh()
  },

  setTheme: (themeName) => {
    applyTheme(themeName)
    set({ theme: themeName })
  },

  setLang: (l) => {
    applyLang(l)
    // Troca a identidade do `tr` de propósito: componentes assinam `s.tr`,
    // e só re-renderizam quando a referência muda. Sem isso o texto não atualiza.
    set({ lang: l, tr: (key, vars) => t(l, key, vars) })
  },

  tr: (key, vars) => t(get().lang, key, vars),

  settingsOpen: false,
  identity: { name: '', email: '' },
  identitySaving: false,
  identityError: null,
  identitySaved: false,

  openSettings: async () => {
    set({ settingsOpen: true, identityError: null, identitySaved: false })
    const id = await fail(window.treeline.getIdentity(), (e) => set({ identityError: e }))
    if (id !== null) set({ identity: id })
  },

  closeSettings: () => set({ settingsOpen: false, identityError: null, identitySaved: false }),

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
    const ok = await fail(window.treeline.setIdentity(id, get().lang), (e) => set({ identityError: e }))
    set({ identitySaving: false, identitySaved: ok !== null })
    if (ok !== null) set({ identity: { name: id.name.trim(), email: id.email.trim() } })
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
    await fail(window.treeline.discard(current, path, tracked, lang), (e) => set({ error: e }))
    await get().refresh()
  },

  dialog: null,
  openDlg: (kind) => set({ dialog: kind }),
  closeDlg: () => set({ dialog: null }),
  refPreset: null,
  setRefPreset: (p) => set({ refPreset: p }),
  blame: [],
  blameFile: null,
  loadBlame: async (path, rev) => {
    const { current } = get()
    if (!current) return
    set({ blame: [], blameFile: path, error: null })
    const rows = await fail(window.treeline.getBlame(current, path, rev), (e) => set({ error: cleanErr(e) }))
    set({ blame: rows ?? [] })
  },
  closeBlame: () => set({ blame: [], blameFile: null, dialog: get().dialog === 'blame' ? null : get().dialog }),
  fileHistory: [],
  fileHistoryPath: null,
  loadFileHistory: async (path) => {
    const { current } = get()
    if (!current) return
    set({ fileHistory: [], fileHistoryPath: path, error: null })
    const rows = await fail(window.treeline.getFileHistory(current, path, 100), (e) => set({ error: cleanErr(e) }))
    set({ fileHistory: rows ?? [] })
  },
  closeFileHistory: () => set({ fileHistory: [], fileHistoryPath: null, dialog: get().dialog === 'fileHistory' ? null : get().dialog }),
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
  flowInstalled: false,

  confirmAction: (title, message, detail, ok) =>
    new Promise<boolean>((resolve) => {
      confirmResolve = resolve
      set({ confirmState: { title, message, detail, ok } })
    }),

  confirmState: null,
  resolveConfirm: (v) => {
    confirmResolve?.(v)
    confirmResolve = null
    set({ confirmState: null })
  },

  runOp: async (op) => {
    const { current, lang } = get()
    if (!current) return false
    set({ error: null })
    try {
      await op(current, lang)
    } catch (e) {
      set({ error: cleanErr(e) })
      return false
    }
    await get().refresh()
    return true
  },

  cloneRepo: async (url) => {
    const { lang } = get()
    set({ error: null })
    let target: string | null = null
    try {
      target = await window.treeline.cloneRepo(url, lang)
    } catch (e) {
      set({ error: cleanErr(e) })
      return false
    }
    if (!target) return false
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
  abortRebase: () =>
    useStore.getState().runOp((repo) => window.treeline.abortRebase(repo)),
  cherryPick: (hash: string) =>
    useStore.getState().runOp((repo, lang) => window.treeline.cherryPick(repo, hash, lang)),
  cherryPickContinue: () =>
    useStore.getState().runOp((repo, lang) => window.treeline.cherryPickContinue(repo, lang)),
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
  abortRevert: () =>
    useStore.getState().runOp((repo) => window.treeline.abortRevert(repo)),
  openPR: () =>
    useStore.getState().runOp((repo, lang) => window.treeline.openPR(repo, lang))
}
