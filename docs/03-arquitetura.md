# TreeLine — Arquitetura

## 1. Decisão de stack

**Electron + Vite + React + TypeScript + `simple-git` (git CLI do sistema).**

- Você já tem Node 22 no Ubuntu 26.04, sem Rust. Electron roda hoje.
- UI web permite reproduzir o layout familiar do SourceTree (grafo virtualizado, diff split) mais rápido que Qt/GTK.
- Backend chama o `git` real, não libgit2. Garante paridade: rebase, hooks, LFS, flow, credential helpers funcionam igual ao terminal.
- Distribuição: `electron-builder` gera `.deb` + AppImage. Flatpak depois.

> Híbrido futuro opcional: leituras pesadas (`log`, `status`) podem migrar para `git2` nativo. Escritas sempre via CLI para compatibilidade total.

## 2. Estrutura proposta

```
treeline/
  docs/
  src/
    main/          # Node Electron: git, fs, IPC
      index.ts     # git (status/log/branch/diff/stage/unstage/commit/push/pull/fetch/identity), bookmarks JSON, fila por repo
    preload/       # bridge segura (contextIsolation on)
      index.ts     # expõe window.treeline.* tipado
    renderer/      # React
      App.tsx
      store.ts     # zustand: repo, branches, commits, selection, workingCopy, filter, sync, theme, settings
      themes.ts    # 10 temas + System, load/apply via data-theme + localStorage
      lib/
        graph.ts   # lane engine puro-TS (lane/through/forks), testável
      components/
        Toolbar/ Sidebar/ HistoryGraph(SVG)/ DetailsPanel/ StatusBar/
        SyncToast/ ThemeMenu/ SettingsDialog/
    shared/        # tipos IPC + constantes
      types.ts
  electron-builder.yml
```

## 3. Main vs Renderer

- Main (Node): único lugar que executa `git`. Uma fila por repo com lock para evitar `index.lock` em push+fetch paralelos. Timeout + cancel via AbortController. Nunca injeta senha em arg — usa `askpass` + keyring do sistema.
- Preload: expõe API mínima `invoke('git:status', {repo})`. `nodeIntegration: false`, `contextIsolation: true`, CSP restrita.
- Renderer: só UI + estado. Sem `child_process`, sem acesso a fs direto.

Canais IPC implementados (2026-10-03):
`treeline:listRepos`, `treeline:openRepo`, `treeline:addRecent`, `treeline:getStatus`, `treeline:getLog`, `treeline:getBranches`, `treeline:getDiff`, `treeline:stage`, `treeline:unstage`, `treeline:commit` (recusa stage vazio sem amend), `treeline:push`, `treeline:pull` (`--ff-only`), `treeline:fetch` (`--all --prune`), `treeline:getIdentity`, `treeline:setIdentity` (valida email).

## 3.1 Sincronização remota e feedback (Fase 1 parcial)

- Push/Pull/Fetch rodam na fila por repo com timeout de 120s (`withTimeout`) e erro traduzido (`friendlySyncError`: falha de auth HTTPS vira orientação `gh auth login`/SSH).
- Renderer mostra `SyncToast`: spinner durante a op, resumo no sucesso (ex: `main → origin/main`, `3 files, +41 −12`), erro com dismiss manual; sucesso some em 5s.
- Credenciais: reaproveita `credential.helper` do sistema. NUNCA via `.env()` do simple-git — ele substitui o env inteiro do filho e apaga `HOME` (ver ADR-006). Flag `GIT_TERMINAL_PROMPT=0` vai no `process.env` do main.

## 3.2 Temas e Settings

- `themes.ts`: ids `system` + 5 light (`treeline-light, paper, sandstone, mint, sky`) + 5 dark (`treeline-dark, midnight, forest, graphite, plum`); tokens em `styles.css` via `:root[data-theme]`; `ThemeMenu` na toolbar; persistido em `localStorage`.
- `SettingsDialog`: edita `user.name`/`user.email` global com validação; aberto pela engrenagem da toolbar e pelo welcome.

## 4. Modelo de dados Git

- Status: `git status --porcelain=v2 -b --untracked-files=all` -> { branch, ahead/behind, unstaged[], staged[], untracked[] }.
- Log: `git log --all --topo-order --date=iso --pretty=format:%H%x00%P%x00%an%x00%ad%x00%D%x00%s%x1e`. Parser faz `hash.trim()` (git emite `\n` entre registros) e split de pais por `/\s+/`; `HEAD -> x` vira 2 refs. Lane engine calcula `lane/through/forks` no renderer com SVG colorido por lane, datas relativas pt-BR. **Layout sempre sobre a lista completa, filtro depois** (filtrar antes quebra elos e staircasa — ver ADR-007).
- Diff: `git diff --unified=3` e `git diff --cached` + `diff --numstat`. Stage de hunk por `git apply --cached`, stage de linha montando patch parcial.
- Watcher: `chokidar` em `.git/index`, `HEAD`, `refs/` com debounce 300ms -> re-fetch status/log.
- Credenciais: reaproveita `credential.helper`, `ssh-agent`, GitHub CLI se presente. Token nunca em `config.json` em claro.

## 5. UI técnica

- Graph: canvas ou divs virtualizadas, teste unitário do lane engine (Vitest).
- Diff: `highlight.js` ou Shiki offline, toggle unified/split, gutter clicável para stage de linha.
- Estado: store central `currentRepo, branches, commits[], selection, workingCopy`.
- Atalhos: `Ctrl+K` paleta, `Ctrl+Shift+C` commit, `F5` refresh, remapeáveis na Fase 4.

## 6. Empacotamento Ubuntu

`electron-builder.yml`: target `deb` (x64) + `AppImage`. Categoria `Development`, ícone PNG/SVG próprio, arquivo `.desktop` `treeline.desktop` com `Exec=treeline %F` para abrir pelo Nautilus.

Comandos:
`npm run dev` (Vite + Electron hot reload), `npm run dist` (gera dist/*.deb).

Dependência runtime: só `git >= 2.40`. Opcional: `git-lfs`, `git-flow`.

## 7. Qualidade

- Vitest para lane engine e parsers `porcelain v2`.
- Playwright para fluxo: open -> stage -> commit -> push em repo fixture.
- Logs em `~/.config/TreeLine/logs`, nunca com token.
- Erros de git exibidos com comando executado + stderr colapsável (transparência estilo SourceTree).
