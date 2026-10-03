# TreeLine — Roadmap até paridade SourceTree

Objetivo: paridade de uso diário com SourceTree (Git-only) em 4 fases. Cada fase é instalável como `.deb`.

## Fase 0 — Scaffold (0.1.0) ☑ pronta em 2026-10-03

- [x] Electron + Vite + React + TS rodando no Ubuntu 26.04
- [x] `simple-git` chamando git do sistema
- [x] Abrir repo local, trocar de repo, lista Bookmarks persistida
- [x] Tela nas 4 regiões de `01-visao.md` (toolbar, sidebar, history, details) com dados reais
- [x] `electron-builder`: `.deb` + AppImage

Aceite: `npm run dev` abre repo, `npm run dist` gera `.deb` instalável.

## Fase 1 — MVP uso diário (0.5.0)

Paridade do loop básico do SourceTree.

- [x] History: `log --all --topo-order` com grafo SVG colorido, colunas Message/Date/Author/Hash, filtro branch atual/all + busca com highlight de seleção
- [x] Working Copy: status, Unstaged/Staged lado a lado, Stage/Unstage por arquivo + Stage All/Unstage All, linha Working Copy no topo do histórico
- [x] Diff unified, Commit (incl. Amend, com guarda anti-commit-vazio e botão desabilitado sem stage)
- [x] Push/Pull (`--ff-only`)/Fetch (`--all --prune`) com toast de progresso/resultado/erro + timeout 120s
- [x] Branch: create/checkout/rename/delete a partir de toolbar, sidebar (duplo-clique + menu) e dialog próprio (com force-retry se unmerged)
- [x] Remote manager: add/list/remove, clone por URL, init local (toolbar + sidebar)
- [x] Search local de commits (toolbar filtra a lista)
- [x] Extras além do plano: 10 temas (5 light + 5 dark + System), Settings com identidade do autor (user.name/email), statusbar com staged/unstaged, i18n en/pt/es, menus de botão direito, diff colorido, splash + ícone próprio

Aceite: usuário faz clone -> branch -> stage hunk -> commit -> push sem terminal.

Mapeamento Git executado:
`status --porcelain=v2 -b`, `log`, `diff`, `add`, `commit`, `push`, `pull --ff-only`, `fetch`, `checkout/switch`, `branch`

## Fase 2 — Operações SourceTree padrão (0.9.0)

- [x] Merge (plain / --no-ff) com preview (commits + arquivos) e abort/continue em conflito
- [x] Resolvedor de conflito básico: lista conflicted no dialog, Continue (commit --no-edit) / Abort
- [x] Stash: create (msg + -u)/apply/pop/drop com confirmação, lista na sidebar + dialog
- [x] Cherry-pick (hash ou commit selecionado), continue/abort; Revert continua pendente
- [x] Reset via Reflog + Undo (hard-reset com confirmação + backup `git bundle` em `.git/treeline-backups`); Reset soft/mixed/hard direto pendente
- [x] Tag create (annotated/lightweight)/push/delete (+ remota opcional), lista na sidebar + dialog
- [ ] Ahead/behind por branch, fetch auto com intervalo por repo
- [ ] Stage por linha, Discard por hunk/linha, Blame e History de arquivo
- [ ] Submodules: lista + update/init (sem UI completa ainda)

Aceite: checklist de 15 ações do SourceTree executadas só na UI sem erro.

## Fase 3 — Avançado (1.0.0 paridade)

O que diferencia o SourceTree para experts.

- [x] Reflog browser + Undo de reset/rebase (via Reflog dialog; backup bundle automático)
- [x] Terminal: abre emulador na pasta do repo (gnome-terminal/kgx/konsole/xfce4/xterm)
- [ ] Interactive rebase (reorder/squash/drop/reword) — hoje só rebase simples onto + continue/abort
- [x] Git-flow: Start/Finish Feature, Release, Hotfix (usa `git flow` se instalado, senão convenção `feature/*`)
- [ ] LFS: detecta, mostra badge, pull/push transparente
- [ ] Reflog browser + Undo de reset/rebase
- [ ] Custom Actions (comandos externos configuráveis, como no SourceTree)
- [ ] Terminal integrado abrindo na pasta do repo
- [ ] Multi-repo tabs

Aceite: teste roteirizado SourceTree -> TreeLine com mesmo repo resulta no mesmo `git log --graph`.

## Fase 4 — Polimento Linux (1.1.0+)

- [ ] Flatpak Flathub, `.rpm`, AUR
- [ ] Integração GNOME/KDE: tema claro/escuro, keyring via `libsecret` para HTTPS, ssh-agent existente
- [ ] Auto-update, crash report opt-in, telemetria off por padrão
- [ ] Atalhos remapeáveis, paleta de comando `Ctrl+K`
- [ ] Integração remota fase 1: abrir PR/issue no browser (GitHub/GitLab/Bitbucket por domínio do remote)

Fora de 1.x: Jira nativo, Hg, AI commit.

## Tabela de paridade (resumo vivo)

| Recurso SourceTree | TreeLine Fase | Status |
|---|---|---|
| Bookmarks/Open/Clone/Init | 0-1 | ☑ (open/list/clone/init + remote manager) |
| Graph + History + Search | 1 | ☑ (paridade GitGraph: dots cheios, split/join, spine-first + steal, datas absolutas, badges por branch; virtualização 10k+ pendente) |
| Stage arquivo/hunk/linha | 1-2 | ◐ (arquivo + all ok; hunk/linha pendentes) |
| Commit/Amend/Push/Pull/Fetch | 1 | ☑ (com toast, timeout, ff-only no pull) |
| Branch/Merge/Tag | 1-2 | ☑ (dialogs + sidebar; revert e reset direto pendentes) |
| Stash/Cherry-pick/Revert | 2 | ◐ (stash + cherry-pick ok; revert pendente) |
| Conflito Ours/Theirs | 2 | ◐ (continue/abort + lista conflicted; ours/theirs por arquivo pendente) |
| Rebase interativo + Undo | 3 | ◐ (rebase simples + undo via reflog com bundle; interativo pendente) |
| Git-flow | 3 | ☑ (start/finish feature/release/hotfix, com e sem `git flow`) |
| LFS/Submodules | 2-3 | ☐ |
| Remote manager | 1 | ☑ |
| Custom Actions/Terminal | 3 | ◐ (terminal ok; custom actions pendente) |
| Temas claro/escuro | extra | ☑ (10 temas + System) |
| Settings identidade autor | extra | ☑ |

Legenda: ☐TODO / ◐parcial / ☑pronto. Atualizar por release.
