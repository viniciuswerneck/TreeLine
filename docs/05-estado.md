# TreeLine — Estado atual e próximos passos

> Atualizar ao fim de cada sessão. Este é o arquivo que a próxima IA deve ler junto com `00-referencia-assistente.md`.

## Última atualização: 2026-10-03 (Fase 0 + boa parte da Fase 1 prontas; docs sincronizados)

## Onde estamos

- [x] Pasta `/home/vinicius/gitnest/` + `/home/vinicius/gitnest/docs/` criadas.
- [x] Docs base e de referência sincronizados com o código: `00`, `01-visao.md`, `02-roadmap.md`, `03-arquitetura.md`, `04-decisoes.md` (ADR-001..010), `05-estado.md`, `../AGENTS.md`, `06-design-system.md`.
- [x] Scaffold Fase 0 (0.1.0): Electron 44 + Vite 7 + React 19 + TS + simple-git 3.30, `npm run dev/build/dist/typecheck` OK.
- [x] UI 4 regiões (toolbar/sidebar/history/details/statusbar) com dados reais: status, log com grafo SVG, branches, diff, stage/unstage (+all), commit (+amend, com guarda e botão desabilitado sem stage).
- [x] Push/Pull (`--ff-only`)/Fetch (`--all --prune`) reais com toast, timeout 120s, erros amigáveis; auth via credential helper do sistema.
- [x] 10 temas + System (`ThemeMenu`), Settings com identidade do autor, busca/filtro de commits, linha Working Copy, datas relativas.
- [x] `dist/treeline_0.1.0_amd64.deb` + AppImage gerados, `.desktop` validado (Exec, WMClass). App roda de `dist/linux-unpacked` com `--no-sandbox`.
- [ ] Ícone próprio (usa padrão Electron — criar asset original).
- [ ] Fase 1 restante: dialogs Branch/Merge, remote manager (clone/init), stage por hunk/linha.
- [ ] Testes automatizados (Vitest p/ lane engine + parsers; Playwright p/ fluxo) — Fase 1/2.

## Ambiente verificado

- Ubuntu 26.04.1 LTS, Node v22.22.1, npm 9.2.0, git 2.53.0. Sem Rust (motivo extra para Electron).

## Próximo passo imediato

1. Dialogs Branch (create/checkout/rename/delete) e remote manager (clone por URL, init) — resto da Fase 1.
2. Stage por hunk/linha no diff.
3. Ícone próprio + `.deb` final da 0.5.0.
4. Vitest (lane engine, parsers) + Playwright (open → stage → commit → push em fixture).

## Riscos/pendências

- Token `ghp_` do usuário salvo em `~/.git-credentials` (helper `store`, texto plano) — orientar revogação quando possível; futuro: GNOME Keyring via `libsecret` (Fase 4).
- Nenhum teste automatizado ainda; verificação hoje foi manual + scripts node ad-hoc.
- Nome "git nexts" digitado pelo usuário em 2026-10-03 foi interpretado como **TreeLine** (singular). Confirmado implicitamente — se mudar, renomear pasta/pacote.

## Log de sessões

- 2026-10-03: ideias -> SourceTree-para-Linux -> nome TreeLine -> pastas -> docs 01-03 -> docs de referência 00/04/05 + AGENTS.md.
- 2026-10-03: AGENTS.md reescrito (papel arquiteto + Design System Fluent adaptado) + `docs/06-design-system.md` (tokens + sidebar Mica).
- 2026-10-03: scaffold Fase 0 pronto. Bugs reais encontrados e corrigidos: (1) separador de log `\0\0` colidia com `%P` vazio — trocado por `\x1e`; (2) `simple-git.commit` não rejeita stage vazio — guarda no main. Versões pinadas às reais do registry (electron-vite 5 + vite 7 + plugin-react 5).
- 2026-10-03: paridade visual SourceTree (só fluxo, arte própria Lucide): toolbar completa Commit|Push|Pull|Fetch|Branch|Merge|Rebase|Cherry-Pick|Stash|Tag|Flow|Terminal|Settings (só Commit+Fetch ativos), sidebar com seções Workspace/Branches/Remotes/Tags/Stashes + filtro current-branch-only, history com filter bar + linha Working Copy + seleção + badges por tipo de ref, details sem abas (Unstaged|Staged + Stage All/Unstage All + commit box fixo), statusbar com staged/unstaged. `typecheck` + `build` + `electron-builder --linux dir` OK, app reiniciado de `dist/linux-unpacked`.
- 2026-10-03: Push/Pull/Fetch reais (`main/index.ts` + `preload` + `store` + toast `SyncToast.tsx`): spinner durante a op, resumo no sucesso, erro com dismiss manual; timeout 120s + `GIT_TERMINAL_PROMPT=0` + `friendlySyncError` (remote HTTPS sem credencial vira orientação `gh auth login`/SSH). Pull usa `--ff-only`. Testado contra bare repo local.
- 2026-10-03: 10 temas próprios (`themes.ts` + `ThemeMenu.tsx`, System/Light×5/Dark×5, persistido em localStorage) + histórico estilo Git Graph (`HistoryGraph.tsx` SVG com lanes coloridas/curvas de merge, datas relativas pt-BR, colunas Graph|Message|Date|Author|Hash, `HEAD -> x` separado em 2 badges). Lane engine estendida (`through`/`forks`, sem vazamento) e validada com cenário de merge.
- 2026-10-03: bug staircase no grafo diagnosticado e corrigido. Causa raiz: `HistoryGraph` fazia layout só sobre a lista visível — qualquer filtro (busca, current-branch) remove elos da cadeia e cada commit órfão de reserva alocava lane nova (provado: c6,c4,c2 → lanes 0,1,2). Fix: `layoutGraph(commits)` full + `.filter(visible)` depois (→ lane 0 para todos). Endurecido o contrato de entrada com `git log --topo-order` (ordem por data pura com múltiplas tips + clock skew pode listar pai antes do filho). Contratos documentados em `lib/graph.ts`.
- 2026-10-03 (continuação): CAUSA RAIZ REAL do staircase em todo repo — o git emite `\n` entre registros mesmo com separador `%x1e` próprio, então todo hash após o primeiro chegava como `"\n<hash>"` e nunca casava com o pai reservado (`row1.hash === row0.parent? false` → lanes 0,1,2,3,4 no `umminutocomdeus`). Fix no parser de `getLog` (`main/index.ts`): `hash.trim()` + split de pais por `/\s+/`. Verificado de ponta a ponta: 5× lane 0. App reiniciado com o fix.
- 2026-10-03: Fetch/Push/Pull com auth quebrada diagnosticada: `simpleGit().env()` SUBSTITUI o env inteiro do processo filho (só chaves custom), apagando `HOME` → git não achava `~/.gitconfig`/`~/.git-credentials` ("could not read Username" só no app, CLI ok). Fix: `GIT_TERMINAL_PROMPT=0` via `process.env` no main (herdado por todo spawn) + removido `.env()`. Credencial salva via `credential.helper store` (token do usuário) — abrir a pasta e Fetch/Push/Pull funcionam sem terminal.
- 2026-10-03: botão Commit desabilitado sem stage/mensagem (evita "Nothing staged"), dialog Settings (`SettingsDialog.tsx`) com Nome/Email do autor via IPC `getIdentity`/`setIdentity` (validação, Esc fecha). Botão Settings da toolbar ativado.
- 2026-10-03: docs sincronizados com tudo da sessão — `AGENTS.md` (comandos reais), `00` (retomada + armadilhas), `02-roadmap.md` (Fase 1 parcial ☑ + paridade atualizada), `03-arquitetura.md` (estrutura real + §3.1 sync/toast + §3.2 temas/settings), `04-decisoes.md` (ADR-006..010), `05` (este arquivo), `06-design-system.md` (tabela dos 10 temas + componentes).
- 2026-10-03: rename GitNest -> TreeLine (ADR-011): productName/binário/janela/docs + API interna (`window.treeline`, canais `treeline:*`); pasta mantida; bookmarks migrados de `~/.config/GitNest`; temas antigos mapeados. App roda de `dist/linux-unpacked/treeline`.
- 2026-10-03: 4 melhorias de UI pós-print: (1) grafo compacto (coluna dimensionada pelas lanes + symrefs `origin/HEAD` ocultas); (2) clique no commit abre vista de detalhe (meta + arquivos + diff via `getCommitDetail`/`getCommitDiff`, botão voltar); (3) Push vira primário com contador quando ahead>0; (4) busca mudou da toolbar para a barra do histórico. Também corrigido bug de comentário com `*/HEAD` que quebrava o parse do TS.
- 2026-10-03: ícone original (`build/icon.png`, motivo branch nas cores do grafo), splash screen (`main/splash.ts`, HTML inline + versão), README com SEO ("alternativa ao SourceTree para Linux"), crédito "Desenvolvido por Werneck Lab" na statusbar. Push inicial + este commit no GitHub (repo privado).
- 2026-10-03: splash refeito em estilo clássico claro (logo + TreeLine + tagline + barra fina, arte própria) com 3s de exibição (`SPLASH_MIN_MS`).
- 2026-10-03: diff colorido estilo VS Code (`DiffViewer.tsx`): adicionadas em verde, removidas em vermelho, hunk em azul, gutters old/new; usado no File Status e no detalhe do commit. Push no GitHub.
