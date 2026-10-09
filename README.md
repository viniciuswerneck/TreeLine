# TreeLine — SourceTree Alternative for Linux (Git GUI)

**English** | [Português](README.pt-BR.md) | [Español](README.es.md)

**TreeLine is a SourceTree alternative for Linux**: a visual Git client (Git GUI) for Ubuntu/Debian with the familiar workflow of SourceTree on Windows/Mac. If you were looking for *SourceTree for Linux*, *SourceTree on Ubuntu* or a *Git client for Linux* — this is it.

![Linux](https://img.shields.io/badge/platform-Ubuntu%2FDebian-blue) ![Electron](https://img.shields.io/badge/Electron-44-47848F) ![Status](https://img.shields.io/badge/status-0.6.10-green)

> 100% original implementation — not affiliated with Atlassian. Inspired by the SourceTree workflow, without copying brand, icons or texts.

## Looking for SourceTree on Linux?

There is no official SourceTree for Linux. TreeLine fills that gap:

| SourceTree user | In TreeLine |
|---|---|
| Toolbar Commit, Push, Pull, Fetch, Branch, Merge, Stash, Tag | Same order, same names, original icons |
| Sidebar with bookmarks, branches, remotes, stashes | Same, with ahead/behind badges |
| Commit graph + file status + diff | Git Graph-style colored graph, stage per file/hunk/line, unified/split diff |
| Credentials and SSH | Reuses the system credential helper and ssh-agent |

Other alternatives people compare: GitKraken, GitHub Desktop (no official Linux build), Sublime Merge, Gitg, Git Cola. TreeLine focuses on **usage parity with SourceTree** and easy install (`.deb`/AppImage).

## Features

- **4 regions**: toolbar, sidebar (Bookmarks, Workspace, Branches, Remotes, Tags, Stashes), history with graph and File Status + diff panel (Unstaged/Staged expand together, side by side)
- **Git Graph-style graph**: colored lanes, merge curves, badges per ref type, absolute dates, avatars, branch combo with type-to-filter selection and optional remotes, compare between 2 commits (Ctrl+click)
- **Full flow**: Stage/Unstage (per file, hunk and line + Stage All), side-by-side diff with arrows per block, Commit with Amend (Ctrl+Enter), **Push (`--force-with-lease` on demand) / Pull (`--ff-only`) / Fetch** with progress toast
- **Commit search**, current-branch filter, click a commit to see files + diff, Blame and file history
- **Branch/Merge/Stash/Tag/Rebase (simple + interactive)/Cherry-Pick/Revert/Reset/Git-flow/Reflog+Undo** with bundle backup before destructive ops
- **3-way conflict resolver**: full-screen A | Result | B columns (WinMerge style) with CodeMirror editors, one-click region choices (A/B/both/none), optional **rerere**, and Continue/Abort for merge, rebase, cherry-pick, revert and stash
- **Right-click** menus everywhere, `Ctrl+K` command palette, collapsible sidebar (`Ctrl+B`), integrated terminal, clickable status bar
- **10 themes** (5 light + 5 dark + System) and **Settings** with author identity (name/email)
- **3 languages**: English, Português and Español (detects the system, switch in Settings)
- Always via **system git** (hooks, LFS, flow and credential helpers work like in the terminal)

## Install on Ubuntu/Debian (SourceTree Linux download alternative)

Download the `.deb` or `.AppImage` from the **Releases** page and install:

```bash
sudo apt install ./treeline-git-gui_0.6.10_amd64.deb
```

Requirement: `git >= 2.40`. Optional: `git-lfs`, `git-flow`.

## Develop

```bash
npm install
npm run dev        # Vite + Electron with hot reload
npm run typecheck  # tsc (node + web)
npm run build      # compile only
npm run dist       # .deb + AppImage in dist/
npm test           # Vitest (graph engine + parsers)
npm run test:ui    # Playwright CDP harness (app must run with --remote-debugging-port=9222)
npm run test:ui:new # second CDP harness (LFS, tabs, shortcuts, E2E flows)
```

To run the local binary without installing:

```bash
./dist/linux-unpacked/treeline-git-gui --no-sandbox
```

## Structure

```
src/
  main/       # Electron/Node: git via CLI, IPC, bookmarks, splash
  preload/    # secure bridge (contextIsolation on)
  renderer/   # React + zustand: Toolbar/Sidebar/HistoryGraph/DetailsPanel/StatusBar/SyncToast/SettingsDialog
  shared/     # IPC types
docs/         # vision, roadmap, architecture, ADRs, status, design system
manual/       # user manual in pt-BR with screenshots (Git for beginners)
```

Product documentation and decisions in [`docs/`](docs/).
User manual (pt-BR, Git explained from scratch) in [`manual/`](manual/).

## Status / Roadmap (summary)

- **0.5.0** — stage per hunk/line, split diff, revert/reset, `--force-with-lease`, blame/compare, command palette
- **0.6.0 – 0.6.2** — watcher + auto-fetch, LFS, recursive submodules, custom actions, tabs with drag, remappable shortcuts, Flatpak/CI, 10k-commit virtualization, two-column Settings
- **0.6.3** — package and binary renamed to `treeline-git-gui` (no clash with the Ubuntu `treeline` package)
- **0.6.10** — 3-way conflict resolver with rerere, Unstaged/Staged panels expanding together, branch combo with search + remotes in the history
- **Next** — Flathub submission, `libsecret`/GNOME Keyring, auto-update, `--rpm`/AUR

Detail and SourceTree parity in [`docs/02-roadmap.md`](docs/02-roadmap.md).

## FAQ

**Is TreeLine the SourceTree for Linux?**
No — it is an independent *alternative* with a similar flow. SourceTree (Atlassian) has no Linux version.

**Which distros does it run on?**
Ubuntu/Debian first (`.deb` + AppImage). Flatpak and other distros are on the roadmap.

**Does my data leave the machine?**
No. No telemetry by default; credentials stay in your system credential helper.

## License

MIT — see [`LICENSE`](LICENSE). Open source: you may use, modify and distribute,
as long as credits are kept (Werneck Lab copyright notice).

## Contributing

Pull requests are welcome. When contributing, keep the MIT copyright
notice in `LICENSE` and don't include third-party assets with incompatible
licenses (nothing from Atlassian/SourceTree: icons and texts must be original).

---
*Developed by **Werneck Lab** — TreeLine: where the Git maze becomes a straight path.*
