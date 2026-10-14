# Changelog

Todas as mudanças relevantes do TreeLine. Formato baseado em
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

A fonte única da versão é o `version` do `package.json`; o runtime expõe esse
valor via `app.getVersion()`. O workflow `release.yml` recusa tag `vX.Y.Z` que
não case com o `package.json`.

## [Unreleased]

## [0.6.16] - 2026-10-13

### Changed

- **Datas no idioma inglês passam a usar o formato ISO** (`2026-10-13 17:38`):
  `formatDateTime`/`formatDate` deixam de usar o `Intl` `en-US` (mês/dia + 12h,
  ex. `03/04/2026 08:23 AM`) e emitem ano-mês-dia com relógio de 24h. `pt`/`es`
  seguem em `dd/MM/yyyy HH:mm` (`04/03/2026 08:23`). Vale para o grafo, detalhe
  do commit, file-history, tag, reflog, tooltip da sidebar e busca de código.

## [0.6.15] - 2026-10-13

### Fixed

- **Data do blame/busca de código deixou de aparecer em ISO** (`2026-10-13`):
  `CodeSearchDialog` agora usa `formatDate(iso, lang)` (`13/10/2026` em pt/es,
  `10/13/2026` em en). Novo helper `formatDate` em `src/renderer/lib/date.ts`.

## [0.6.14] - 2026-10-13

### Changed

- **Datas de commit seguem o idioma da UI**: `formatDateTime(iso, lang)` usa o
  `Intl` do locale (en → mês/dia + relógio de 12h, ex. `03/04/2026 08:23 AM`;
  pt/es → dia/mês + 24h, ex. `04/03/2026 08:23`). Antes o formato era fixo em
  `dd/MM/yyyy HH:mm` em todas as línguas. Vale para o grafo, detalhe do commit,
  file-history, tag, reflog e tooltip da sidebar.

## [0.6.13] - 2026-10-13

### Changed

- **Datas de commit em `dd/MM/yyyy HH:mm`**: o grafo, o detalhe do commit, o
  histórico de arquivo, o dialog de tag, os backups do reflog e o tooltip da
  sidebar agora exibem a data absoluta no formato `01/01/2026 08:23` (helper
  `src/renderer/lib/date.ts::formatDateTime`), no lugar do formato por extenso.

### Fixed

- **Segurança no motor Git**: `assertSafeRef` em todos os refs/hashes lidos
  (`history.ts`), validação de nomes/refs em `branch.ts`, `stripCredential()` +
  validação de URL/nome e guarda do destino do clone em `remote.ts`, allowlist
  de tipos de flow em `flow.ts` e validação do lado em `conflict.ts`.
- **Push ciente do upstream**: `push`/`--force-with-lease` usam o remoto do
  branch (não `origin` fixo) e `pushPublish`/tags usam `defaultRemote()`;
  cancelar um clone aborta todos os clones em voo.
- **Processos órfãos**: `killTree` (spawn `detached` + `process.kill(-pid)`)
  em `runner.ts`/`search.ts`; `ensureServer` zera o estado e mata o filho se o
  health-check falhar; `will-quit` fecha watchers e PTYs.
- **Renderer**: `advanceAfterResolve` (índice/stages consistentes),
  `selectFile` compara `path` **e** `staged`, cancelamento de busca de código
  invalida o token, `selectSession` com guarda de corrida, guardas `alive`
  nos efeitos de merge/reflog e `busyRef` no `useDialogRunner` (duplo clique);
  `UpstreamDialog` substitui o `window.prompt` (inexistente no Electron).
- **i18n**: rótulos do resolvedor de conflito, `ai.reasoning` e `Base` do
  rebase-interativo traduzidos (en/pt/es).

### Tooling

- `tsconfig.test.json` incluído no `typecheck` (os testes de `tests/` agora
  são verificados; 7 erros de tipo corrigidos), harnesses CDP com exit code
  correto, deps só-de-renderer movidas para `devDependencies` (pacote menor),
  Actions dos workflows pinadas por commit SHA e `tests/e2e-conflict.mjs`
  (órfão) removido.

## [0.6.12] - 2026-10-13

Release de manutenção — sem mudanças de código. Reemissão do pipeline de
release (tag `v0.6.12`) para gerar `.deb`/AppImage e publicar o GitHub Release
com os artefatos e o `SHA256SUMS`. Nenhuma alteração de funcionalidade em
relação à 0.6.11.

## [0.6.11] - 2026-10-13

### Fixed

- **opencode abre na pasta do projeto**: a TUI do `opencode` lançada pelo
  ícone/paleta do TreeLine agora recebe o diretório do repositório como
  argumento posicional (`opencode [project]`), em vez de depender apenas do
  `cwd` do pty. Evita abrir na home/raiz quando o shell altera o diretório
  durante a inicialização.
- **merge com conflito não vira erro fantasma**: `treeline:mergeBranch` só
  relança o erro do `simple-git` quando não há `MERGE_HEAD` (ou seja, não era
  um merge parado em conflito). O resolvedor segue abrindo via `getConflictOp`
  em todas as versões de git (antes, dependendo da versão, o usuário via o
  toast "Merge stopped on conflicts" além do resolvedor).
- **CI no ubuntu-latest**: o teste de LFS passava no CI porque lá o `git-lfs`
  já vem instalado (`expected true to be false`); agora o teste se adapta ao
  ambiente (repository virgem sem tracking em qualquer caso; fluxo "sem
  binário" só quando o binário não existe).

## [0.6.10] - 2026-10-12

Endurecimento de confiabilidade e cadeia de suprimentos (sem mudança de
funcionalidade visível).

### Added

- Gate de **cobertura** no Vitest: piso por métrica sobre `src/main/git/**`
  (`lines/statements/functions` ≥ 70, `branches` ≥ 50). Script `npm run coverage`.
- **ESLint** (flat config, `typescript-eslint` + `react-hooks`) e script
  `npm run lint`, executado no CI.
- **`npm run check:structure`**: `madge --circular` (zero ciclos) + teto de 800
  linhas por arquivo, com os dois monólitos legados congelados em ratchet
  (`renderer/store.ts`, `renderer/i18n.ts`).
- **Dependabot** (npm semanal + GitHub Actions) e auditoria de dependências de
  runtime no CI (`npm audit --omit=dev --audit-level=high`).
- **`CHANGELOG.md`** e checksums de release (`SHA256SUMS`).
- Testes unitários que existiam mas não rodavam (`src/**/*.test.ts`) passaram a
  ser executados: `search.test.ts`, `ansi.test.ts`, `shortcuts.test.ts`.
- Wrapper central `src/main/git/git.ts` para o `simple-git`.

### Changed

- **simple-git v3 → v4** (correção de vulnerabilidade crítica no
  `@simple-git/argv-parser`). Todo o `src/main` importa o wrapper, que reinjeta
  `allowEnvironment` para preservar `GIT_TERMINAL_PROMPT`/`GIT_EDITOR`/
  `GIT_SEQUENCE_EDITOR` nos processos filhos.
- `StatusBar` mostra a versão via `getVersion()` em vez de string hardcoded.

### Fixed

- Suíte de testes de integração do motor: 6 falhas de harness corrigidas
  (`GIT_EDITOR`/`GIT_SEQUENCE_EDITOR` no setup, `protocol.file.allow` via `-c`,
  evento de `cloneRepo`/`initRepo`, alvo de clone isolado, seleção de linha em
  `stageLines`, fixture do `skipRebase`). 140/140 verdes.
- Dependência circular `renderer/store.ts` ↔ `renderer/components/ContextMenu.tsx`
  removida extraindo o tipo `MenuItem` para `renderer/menu-types.ts`.
- Código morto removido (`dirtyCount`, `totalToCommit`, `openDlg`, `useMemo`
  ocioso, imports não usados) e `useSide` renomeado para `applySide` (evitava a
  heurística de hooks).

### Security

- Bump do `simple-git` elimina o aviso **crítico**
  [GHSA-v5rq-49vh-5v5c](https://github.com/advisories/GHSA-v5rq-49vh-5v5c).
  Dependências de runtime sem vulnerabilidades conhecidas no `npm audit`.

[Unreleased]: https://github.com/viniciuswerneck/TreeLine/compare/v0.6.16...HEAD
[0.6.16]: https://github.com/viniciuswerneck/TreeLine/releases/tag/v0.6.16
[0.6.15]: https://github.com/viniciuswerneck/TreeLine/releases/tag/v0.6.15
[0.6.14]: https://github.com/viniciuswerneck/TreeLine/releases/tag/v0.6.14
[0.6.13]: https://github.com/viniciuswerneck/TreeLine/releases/tag/v0.6.13
[0.6.12]: https://github.com/viniciuswerneck/TreeLine/releases/tag/v0.6.12
[0.6.11]: https://github.com/viniciuswerneck/TreeLine/releases/tag/v0.6.11
[0.6.10]: https://github.com/viniciuswerneck/TreeLine/releases/tag/v0.6.10
