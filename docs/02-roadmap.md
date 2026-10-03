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
- [ ] Branch: create/checkout/rename/delete a partir de sidebar e de commit
- [ ] Remote manager: add/list, clone por URL, init local
- [x] Search local de commits (toolbar filtra a lista)
- [x] Extras além do plano: 10 temas (5 light + 5 dark + System), Settings com identidade do autor (user.name/email), statusbar com staged/unstaged, i18n en/pt/es, menus de botão direito, diff colorido, splash + ícone próprio

Aceite: usuário faz clone -> branch -> stage hunk -> commit -> push sem terminal.

Mapeamento Git executado:
`status --porcelain=v2 -b`, `log`, `diff`, `add`, `commit`, `push`, `pull --ff-only`, `fetch`, `checkout/switch`, `branch`

## Fase 2 — Operações SourceTree padrão (0.9.0)

- [ ] Merge (plain / --no-ff) com preview e abort
- [ ] Resolvedor de conflito: Use Ours / Use Theirs / abrir no editor + Mark resolved + Continue/Abort
- [ ] Stash: create/apply/pop/drop, com lista na sidebar
- [ ] Cherry-pick, Revert, Reset (soft/mixed/hard com confirmação), Tag create/push/delete
- [ ] Ahead/behind por branch, fetch auto com intervalo por repo
- [ ] Stage por linha, Discard por hunk/linha, Blame e History de arquivo
- [ ] Submodules: lista + update/init (sem UI completa ainda)

Aceite: checklist de 15 ações do SourceTree executadas só na UI sem erro.

## Fase 3 — Avançado (1.0.0 paridade)

O que diferencia o SourceTree para experts.

- [ ] Interactive rebase (reorder/squash/drop/reword) com backup automático `git bundle` + Undo via reflog
- [ ] Git-flow: Start/Finish Feature, Release, Hotfix (usa `git flow` se instalado, senão convenção `feature/*`)
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
| Bookmarks/Open/Clone/Init | 0-1 | ◐ (open/list ok; clone/init e remote manager pendentes) |
| Graph + History + Search | 1 | ☑ (SVG colorido, datas relativas, filtro; virtualização 10k+ pendente) |
| Stage arquivo/hunk/linha | 1-2 | ◐ (arquivo + all ok; hunk/linha pendentes) |
| Commit/Amend/Push/Pull/Fetch | 1 | ☑ (com toast, timeout, ff-only no pull) |
| Branch/Merge/Tag | 1-2 | ☐ |
| Stash/Cherry-pick/Revert | 2 | ☐ |
| Conflito Ours/Theirs | 2 | ☐ |
| Rebase interativo + Undo | 3 | ☐ |
| Git-flow | 3 | ☐ |
| LFS/Submodules | 2-3 | ☐ |
| Remote manager | 1 | ☐ |
| Custom Actions/Terminal | 3 | ☐ |
| Temas claro/escuro | extra | ☑ (10 temas + System) |
| Settings identidade autor | extra | ☑ |

Legenda: ☐TODO / ◐parcial / ☑pronto. Atualizar por release.
