# TreeLine — Alternativa ao SourceTree para Linux (Git GUI)

**TreeLine é uma alternativa ao SourceTree para Linux**: um cliente Git visual (Git GUI) para Ubuntu/Debian com o fluxo familiar de quem usava SourceTree no Windows ou Mac. Se você procurava *SourceTree para Linux*, *SourceTree no Ubuntu* ou um *Git client para Linux* — é isso aqui.

*Looking for a **SourceTree alternative for Linux**? TreeLine is a Sourcetree-like Git GUI client for Linux (Ubuntu/Debian), with commit graph, staging, push/pull and dark/light themes.*

![Linux](https://img.shields.io/badge/platform-Ubuntu%2FDebian-blue) ![Electron](https://img.shields.io/badge/Electron-44-47848F) ![Status](https://img.shields.io/badge/status-0.1.0-yellow)

> Implementação 100% original — sem afiliação com a Atlassian. Inspirado no fluxo do SourceTree, sem copiar marca, ícones ou textos.

## Procurando o SourceTree para Linux?

Não existe SourceTree oficial para Linux. O TreeLine preenche essa lacuna:

| Quem usa SourceTree | No TreeLine |
|---|---|
| Toolbar Commit, Push, Pull, Fetch, Branch, Merge, Stash, Tag | Mesma ordem, mesmos nomes, ícones próprios |
| Sidebar com bookmarks, branches, remotes, stashes | Igual, com badges ahead/behind |
| Grafo de commits + file status + diff | Grafo colorido estilo Git Graph, stage por arquivo, diff unified |
| Credenciais e SSH | Reaproveita credential helper e ssh-agent do sistema |

Outras alternativas que as pessoas comparam: GitKraken, GitHub Desktop (sem versão Linux oficial), Sublime Merge, Gitg, Git Cola. O TreeLine foca em **paridade de uso com o SourceTree** e em ser leve de instalar (`.deb`/AppImage).

## Recursos

- **4 regiões**: toolbar, sidebar (Bookmarks, Workspace, Branches, Remotes, Tags, Stashes), histórico com grafo e painel File Status + diff
- **Grafo estilo Git Graph**: lanes coloridas, curvas de merge, badges por tipo de ref, datas relativas
- **Fluxo completo**: Stage/Unstage (por arquivo + Stage All), Commit com Amend, **Push / Pull (`--ff-only`) / Fetch** com toast de progresso e resumo
- **Busca de commits**, filtro por branch atual, clique no commit mostra arquivos + diff
- **Diff colorido estilo VS Code** (verde/vermelho, hunk em azul, números old/new)
- **Botão direito** com menus: copiar hash/mensagem, stage/discard com confirmação, bookmarks
- **10 temas** (5 claros + 5 escuros + System) e **Settings** com identidade do autor (nome/email)
- **3 idiomas**: English, Português e Español (detecta o sistema, troca no Settings)
- Sempre via **git do sistema** (hooks, LFS, flow e credential helpers funcionam igual ao terminal)

## Instalar no Ubuntu/Debian (SourceTree Linux download alternativo)

Baixe o `.deb` ou o `.AppImage` na página de **Releases** e instale:

```bash
sudo apt install ./treeline_0.1.0_amd64.deb
```

Requisito: `git >= 2.40`. Opcional: `git-lfs`, `git-flow`.

## Desenvolver

```bash
npm install
npm run dev        # Vite + Electron com hot reload
npm run typecheck  # tsc (node + web)
npm run build      # só compila
npm run dist       # .deb + AppImage em dist/
```

Para rodar o binário local sem instalar:

```bash
./dist/linux-unpacked/treeline --no-sandbox
```

## Estrutura

```
src/
  main/       # Electron/Node: git via CLI, IPC, bookmarks, splash
  preload/    # bridge segura (contextIsolation on)
  renderer/   # React + zustand: Toolbar/Sidebar/HistoryGraph/DetailsPanel/StatusBar/SyncToast/ThemeMenu/SettingsDialog
  shared/     # tipos do IPC
docs/         # visão, roadmap, arquitetura, ADRs, estado, design system
```

Documentação de produto e decisões em [`docs/`](docs/).

## Roadmap (resumo)

- **0.5.0** — dialogs Branch/Merge, remote manager (clone/init), stage por hunk/linha
- **0.9.0** — stash, cherry-pick, revert, tags, resolvedor de conflitos
- **1.0.0** — rebase interativo com undo, git-flow, LFS, reflog
- **1.1.0+** — Flatpak, keyring, auto-update, atalhos remapeáveis

Detalhe e paridade com o SourceTree em [`docs/02-roadmap.md`](docs/02-roadmap.md).

## Perguntas frequentes

**O TreeLine é o SourceTree para Linux?**
Não — é uma *alternativa* independente com fluxo parecido. O SourceTree (Atlassian) não tem versão para Linux.

**Funciona em qual distro?**
Ubuntu/Debian primeiro (`.deb` + AppImage). Flatpak e outras distros entram no roadmap.

**Meus dados saem da máquina?**
Não. Sem telemetria por padrão; credenciais ficam no credential helper do seu sistema.

## Licença

A definir.

---
*Desenvolvido por **Werneck Lab**.*
