# TreeLine — Roadmap até paridade SourceTree

Objetivo: paridade de uso diário com SourceTree (Git-only) em 4 fases. Cada fase é instalável como `.deb`.

## Fase 0 — Scaffold (0.1.0) ☑ pronta em 2026-10-03

- [x] Electron + Vite + React + TS rodando no Ubuntu 26.04
- [x] `simple-git` chamando git do sistema
- [x] Abrir repo local, trocar de repo, lista Bookmarks persistida
- [x] Tela nas 4 regiões de `01-visao.md` (toolbar, sidebar, history, details) com dados reais
- [x] `electron-builder`: `.deb` + AppImage

Aceite: `npm run dev` abre repo, `npm run dist` gera `.deb` instalável.

## Fase 1 — MVP uso diário (0.5.0) ☑ pronta em 2026-10-04

Paridade do loop básico do SourceTree.

- [x] History: `log --all --topo-order` com grafo SVG colorido, colunas Message/Date/Author/Hash, filtro branch atual/all + busca (Ctrl+F) com highlight de seleção, avatares de iniciais
- [x] Working Copy: status, Unstaged/Staged lado a lado, Stage/Unstage por arquivo/hunk/linha + Stage All/Unstage All, Discard por hunk, linha Working Copy no topo do histórico
- [x] Diff unified, Commit (incl. Amend, com guarda anti-commit-vazio e botão desabilitado sem stage, Ctrl+Enter, hint convencional)
- [x] Push/Pull (`--ff-only`)/Fetch (`--all --prune`) com toast de progresso/resultado/erro + timeout 120s; Push `--force-with-lease` explícito com confirmação (toolbar botão direito, Remotes)
- [x] Branch: create/checkout/rename/delete a partir de toolbar, sidebar (duplo-clique + menu + ahead/behind/upstream por branch, busca, drop-merge) e dialog próprio (com force-retry se unmerged, preset de ref via menu do grafo)
- [x] Remote manager: add/list/remove/edit-URL, clone por URL, init local, abrir PR no browser (toolbar + sidebar)
- [x] Search local de commits (barra do histórico filtra a lista)
- [x] Extras além do plano: 10 temas (5 light + 5 dark + System), Settings com identidade do autor (user.name/email), statusbar clicável com staged/unstaged, i18n en/pt/es, menus de botão direito, diff colorido, splash + ícone próprio, paleta `Ctrl+K`, sidebar colapsável (`Ctrl+B`), Blame + File history, Compare entre 2 commits (Ctrl+click)

Aceite: usuário faz clone -> branch -> stage hunk -> commit -> push sem terminal.

Mapeamento Git executado:
`status` (simple-git), `log`, `diff`, `add`, `commit`, `push` (+`--force-with-lease`), `pull --ff-only`, `fetch`, `checkout/switch`, `branch` (+`-vv/-r`), `revert`, `reset`, `blame`, `rebase -i`, `bundle`

## Fase 2 — Operações SourceTree padrão (0.9.0)

- [x] Merge (plain / --no-ff) com preview (commits + arquivos) e abort/continue em conflito
- [x] Resolvedor de conflito básico: lista conflicted no dialog, Continue (commit --no-edit) / Abort
- [x] Stash: create (msg + -u)/apply/pop/drop com confirmação, lista na sidebar + dialog
- [x] Cherry-pick (hash ou commit selecionado), continue/abort; Revert com confirmação (menu do commit)
- [x] Reset via Reflog + Undo (hard-reset com confirmação + backup `git bundle` em `.git/treeline-backups`); Reset direto soft/mixed/hard com confirmação + bundle (ResetDialog, menu do commit)
- [x] Tag create (annotated/lightweight)/push/delete (+ remota opcional), lista na sidebar + dialog (preset de commit via menu do grafo)
- [x] Ahead/behind por branch + upstream (`branch -vv`, set-upstream na sidebar); fetch automático com intervalo por repo + toggle `autoFetchBg` (busca mesmo em segundo plano)
- [x] Stage por linha, Discard por hunk, Blame e History de arquivo (dialogs próprios)
- [x] Submodules: lista recursiva na sidebar + update/init (`submodule update --init --recursive`), validado com sub-submódulo via `git daemon`

Aceite: checklist de 15 ações do SourceTree executadas só na UI sem erro.

## Fase 3 — Avançado (1.0.0 paridade)

O que diferencia o SourceTree para experts.

- [x] Reflog browser + Undo de reset/rebase (via Reflog dialog; backup bundle automático)
- [x] Terminal: abre emulador na pasta do repo (gnome-terminal/kgx/konsole/xfce4/xterm)
- [x] Interactive rebase (base + plano pick/reword/edit/squash/fixup/drop, reorder ↑↓, backup bundle; continue/abort no Rebase dialog)
- [x] Git-flow: Start/Finish Feature, Release, Hotfix (usa `git flow` se instalado, senão convenção `feature/*`)
- [x] LFS: detecta instalado/tracking/padrões, badge e seção na sidebar, dialog com pull/push/track/untrack (operações reais validadas em máquina com `git-lfs`)
- [x] Custom Actions (comandos externos configuráveis, com argumentos, tokens de contexto e saída ANSI colorida, como no SourceTree)
- [x] Terminal integrado abrindo na pasta do repo (drawer xterm + node-pty, expansível, pop-out externo)
- [x] Multi-repo tabs com drag-and-drop e ordem manual persistida

Aceite: teste roteirizado SourceTree -> TreeLine com mesmo repo resulta no mesmo `git log --graph`.

## Fase 4 — Polimento Linux (1.1.0+)

- [~] Flatpak: manifesto + AppStream + screenshots prontos; falta submissão no Flathub (e trocar `--filesystem=host` por FilePortal). `.rpm`/AUR seguessem na Fase 4
- [~] Integração GNOME/KDE: tema claro/escuro e `ssh-agent` existentes; keyring via `libsecret` ainda pendente (hoje herda o `credential.helper` do sistema)
- [~] Auto-update via GitHub Releases (link no About) + crash report opt-in e telemetria off por padrão; instalador de update ainda pendente
- [x] Atalhos (`Ctrl+K` paleta, `Ctrl+B` sidebar, `Ctrl+F` busca, `Ctrl+Enter` commit, `F5` refresh) **remapeáveis** no Settings, com filtro, detecção de conflito e reset por linha
- [x] Integração remota fase 1: abrir PR no browser (GitHub/GitLab/Bitbucket por domínio do remote)

Fora de 1.x: Jira nativo, Hg, AI commit.

## Tabela de paridade (resumo vivo)

| Recurso SourceTree | TreeLine Fase | Status |
|---|---|---|
| Bookmarks/Open/Clone/Init | 0-1 | ☑ (open/list/clone/init + remote manager) |
| Graph + History + Search | 1 | ☑ (paridade GitGraph: dots cheios, split/join, spine-first + steal, datas absolutas, badges por branch, avatares, compare 2 commits, blame/file-history; virtualização validada com 10.000 commits a 58fps) |
| Stage arquivo/hunk/linha | 1-2 | ☑ (arquivo + all + hunk + linha via `git apply`, discard por hunk) |
| Commit/Amend/Push/Pull/Fetch | 1 | ☑ (com toast, timeout, ff-only no pull, `--force-with-lease` explícito com confirmação) |
| Branch/Merge/Tag | 1-2 | ☑ (dialogs + sidebar detalhada; revert e reset direto ok; checkout de branch/remota/tag com HEAD marcado) |
| Stash/Cherry-pick/Revert | 2 | ☑ (stash + cherry-pick + revert com confirmação) |
| Conflito Ours/Theirs | 2 | ☑ (ours/theirs por arquivo na conflict-bar + menu; continue/abort) |
| Rebase interativo + Undo | 3 | ☑ (simples + interativo pick/reword/edit/squash/fixup/drop/reorder + undo via reflog com bundle) |
| Git-flow | 3 | ☑ (start/finish feature/release/hotfix, com e sem `git flow`) |
| LFS/Submodules | 2-3 | ☑ (LFS com dialog pull/push/track/untrack + badge; submodules recursivos com update/init) |
| Remote manager | 1 | ☑ (add/list/remove/edit-URL, clone/init, push lease, abrir PR) |
| Custom Actions/Terminal | 3 | ☑ (terminal integrado com node-pty; custom actions com args, tokens de contexto e saída ANSI) |
| Temas claro/escuro | extra | ☑ (10 temas + System) |
| Settings identidade autor | extra | ☑ |
| Paleta de comandos | extra | ☑ (`Ctrl+K`: sync, dialogs, PR, terminal, sidebar, custom actions) |
| Atalhos remapeáveis | 4 | ☑ (editor no Settings com filtro, conflito e reset por linha) |
| Multi-repo em abas | 3 | ☑ (ordem manual + drag-and-drop persistido) |
| Fetch automático | 2 | ☑ (intervalo por repo + toggle de segundo plano) |
| Flatpak/AppStream | 4 | ◑ (manifesto, metainfo e screenshots prontos; submissão no Flathub pendente) |
| CI de release | 4 | ☑ (typecheck + Vitest + build + `.deb`/AppImage + GitHub Release em tag `v*`) |

Legenda: ☐TODO / ◐parcial / ☑pronto / ◑em andamento. Atualizar por release.
