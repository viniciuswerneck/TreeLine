# Changelog

Todas as mudanças relevantes do TreeLine. Formato baseado em
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

A fonte única da versão é o `version` do `package.json`; o runtime expõe esse
valor via `app.getVersion()`. O workflow `release.yml` recusa tag `vX.Y.Z` que
não case com o `package.json`.

## [Unreleased]

## [0.6.11] - 2026-10-13

### Fixed

- **opencode abre na pasta do projeto**: a TUI do `opencode` lançada pelo
  ícone/paleta do TreeLine agora recebe o diretório do repositório como
  argumento posicional (`opencode [project]`), em vez de depender apenas do
  `cwd` do pty. Evita abrir na home/raiz quando o shell altera o diretório
  durante a inicialização.

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

[Unreleased]: https://github.com/viniciuswerneck/TreeLine/compare/v0.6.11...HEAD
[0.6.11]: https://github.com/viniciuswerneck/TreeLine/releases/tag/v0.6.11
[0.6.10]: https://github.com/viniciuswerneck/TreeLine/releases/tag/v0.6.10
