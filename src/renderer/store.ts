import { create } from 'zustand'
import type { BranchInfo, CommitDetail, CommitInfo, GitIdentity, RepoStatus, SyncOp } from '../shared/types'
import { applyTheme, loadTheme } from './themes'
import { applyLang, loadLang, t, type DictKey, type Lang } from './i18n'
import type { MenuItem } from './components/ContextMenu'

export interface ContextMenuState {
  x: number
  y: number
  items: MenuItem[]
}

export interface SelectedFile {
  path: string
  staged: boolean
}

export type SyncPhase = 'running' | 'success' | 'error'

export interface SyncState {
  op: SyncOp | null
  phase: SyncPhase | null
  message: string
}

interface TreeLineState {
  repos: string[]
  current: string | null
  status: RepoStatus | null
  commits: CommitInfo[]
  branches: BranchInfo[]
  selectedFile: SelectedFile | null
  diff: string
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
  doPull: () => Promise<void>
  doFetch: () => Promise<void>
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
  selectedFile: null,
  diff: '',
  message: '',
  amend: false,
  loading: false,
  error: null,
  filter: '',
  branchFilter: 'all',
  sync: { op: null, phase: null, message: '' },
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
    set({ current: path, status: null, commits: [], branches: [], selectedFile: null, diff: '', error: null, selectedCommit: null, commitDetail: null, commitDiff: '' })
    await window.treeline.addRecent(path)
    await get().refresh()
  },

  refresh: async () => {
    const { current } = get()
    if (!current) return
    set({ loading: true, error: null })
    const [status, commits, branches] = await Promise.all([
      fail(window.treeline.getStatus(current), (e) => set({ error: e })),
      fail(window.treeline.getLog(current, 300), (e) => set({ error: e })),
      fail(window.treeline.getBranches(current), (e) => set({ error: e }))
    ])
    set({
      status: status ?? get().status,
      commits: commits ?? get().commits,
      branches: branches ?? get().branches,
      loading: false
    })
    const sel = get().selectedFile
    if (sel) await get().selectFile(sel)
  },

  selectFile: async (f) => {
    set({ selectedFile: f, diff: '', selectedCommit: null, commitDetail: null, commitDiff: '' })
    const { current } = get()
    if (!current || !f) return
    const diff = await fail(window.treeline.getDiff(current, f.path, f.staged), (e) => set({ error: e }))
    set({ diff: diff ?? '' })
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
    set({ sync: { op: 'push', phase: 'running', message: t(lang, 'sync.running', { op: 'Push' }) }, error: null })
    const res = await fail(window.treeline.push(current, lang), (e) =>
      set({ sync: { op: 'push', phase: 'error', message: t(get().lang, 'sync.failed', { op: 'Push', e: cleanErr(e) }) } })
    )
    if (res !== null) {
      set({ sync: { op: 'push', phase: 'success', message: res.summary } })
      await get().refresh()
    }
  },

  doPull: async () => {
    const { current, lang } = get()
    if (!current || get().sync.phase === 'running') return
    set({ sync: { op: 'pull', phase: 'running', message: t(lang, 'sync.running', { op: 'Pull' }) }, error: null })
    const res = await fail(window.treeline.pull(current, lang), (e) =>
      set({ sync: { op: 'pull', phase: 'error', message: t(get().lang, 'sync.failed', { op: 'Pull', e: cleanErr(e) }) } })
    )
    if (res !== null) {
      set({ sync: { op: 'pull', phase: 'success', message: res.summary } })
      await get().refresh()
    }
  },

  doFetch: async () => {
    const { current, lang } = get()
    if (!current || get().sync.phase === 'running') return
    set({ sync: { op: 'fetch', phase: 'running', message: t(lang, 'sync.running', { op: 'Fetch' }) }, error: null })
    const res = await fail(window.treeline.fetch(current, lang), (e) =>
      set({ sync: { op: 'fetch', phase: 'error', message: t(get().lang, 'sync.failed', { op: 'Fetch', e: cleanErr(e) }) } })
    )
    if (res !== null) {
      set({ sync: { op: 'fetch', phase: 'success', message: res.summary } })
      await get().refresh()
    }
  },

  clearSync: () => set({ sync: { op: null, phase: null, message: '' } }),

  setTheme: (themeName) => {
    applyTheme(themeName)
    set({ theme: themeName })
  },

  setLang: (l) => {
    applyLang(l)
    set({ lang: l })
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
  }
}))
