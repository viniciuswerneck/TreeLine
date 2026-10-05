# TreeLine — Alternativa ao SourceTree para Linux (Git GUI)

[English](README.md) | **Português** | [Español](README.es.md)

**TreeLine é uma alternativa ao SourceTree para Linux**: um cliente Git visual (Git GUI) para Ubuntu/Debian com o fluxo familiar de quem usava SourceTree no Windows ou Mac. Se você procurava *SourceTree para Linux*, *SourceTree no Ubuntu* ou um *Git client para Linux* — é isso aqui.

![Linux](https://img.shields.io/badge/platform-Ubuntu%2FDebian-blue) ![Electron](https://img.shields.io/badge/Electron-44-47848F) ![Status](https://img.shields.io/badge/status-0.6.2-green)

> Implementação 100% original — sem afiliação com a Atlassian. Inspirado no fluxo do SourceTree, sem copiar marca, ícones ou textos.

## Procurando o SourceTree para Linux?

Não existe SourceTree oficial para Linux. O TreeLine preenche essa lacuna:

| Quem usa SourceTree | No TreeLine |
|---|---|
| Toolbar Commit, Push, Pull, Fetch, Branch, Merge, Stash, Tag | Mesma ordem, mesmos nomes, ícones próprios |
| Sidebar com bookmarks, branches, remotes, stashes | Igual, com badges ahead/behind |
| Grafo de commits + file status + diff | Grafo colorido estilo Git Graph, stage por arquivo/hunk/linha, diff unified/lado a lado |
| Credenciais e SSH | Reaproveita credential helper e ssh-agent do sistema |

Outras alternativas que as pessoas comparam: GitKraken, GitHub Desktop (sem versão Linux oficial), Sublime Merge, Gitg, Git Cola. O TreeLine foca em **paridade de uso com o SourceTree** e em ser leve de instalar (`.deb`/AppImage).

## Recursos

- **4 regiões**: toolbar, sidebar (Bookmarks, Workspace, Branches, Remotes, Tags, Stashes), histórico com grafo e painel File Status + diff
- **Grafo estilo Git Graph**: lanes coloridas, curvas de merge, badges por tipo de ref, datas absolutas, avatares, comparar 2 commits (Ctrl+click)
- **Fluxo completo**: Stage/Unstage (por arquivo, hunk e linha + Stage All), diff lado a lado com setas por bloco, Commit com Amend (Ctrl+Enter), **Push (`--force-with-lease` sob demanda) / Pull (`--ff-only`) / Fetch** com toast de progresso
- **Busca de commits**, filtro por branch atual, clique no commit mostra arquivos + diff, Blame e histórico de arquivo
- **Branch/Merge/Stash/Tag/Rebase (simples + interativo)/Cherry-Pick/Revert/Reset/Git-flow/Reflog+Undo** com backup bundle antes de destrutivos, resolvedor de conflito (Ours/Theirs)
- **Botão direito** com menus em tudo, paleta de comandos `Ctrl+K`, sidebar colapsável (`Ctrl+B`), terminal integrado, statusbar clicável
- **10 temas** (5 claros + 5 escuros + System) e **Settings** com identidade do autor (nome/email)
- **3 idiomas**: English, Português e Español (detecta o sistema, troca no Settings)
- Sempre via **git do sistema** (hooks, LFS, flow e credential helpers funcionam igual ao terminal)

## Instalar no Ubuntu/Debian (SourceTree Linux download alternativo)

Baixe o `.deb` ou o `.AppImage` na página de **Releases** e instale:

```bash
sudo apt install ./treeline_0.6.2_amd64.deb
```

Requisito: `git >= 2.40`. Opcional: `git-lfs`, `git-flow`.

## Desenvolver

```bash
npm install
npm run dev        # Vite + Electron com hot reload
npm run typecheck  # tsc (node + web)
npm run build      # só compila
npm run dist       # .deb + AppImage em dist/
npm test           # Vitest (motor do grafo)
npm run test:ui    # harness Playwright via CDP (app precisa rodar com --remote-debugging-port=9222)
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
  renderer/   # React + zustand: Toolbar/Sidebar/HistoryGraph/DetailsPanel/StatusBar/SyncToast/SettingsDialog
  shared/     # tipos do IPC
docs/         # visão, roadmap, arquitetura, ADRs, estado, design system
```

Documentação de produto e decisões em [`docs/`](docs/).

## Roadmap (resumo)

- **0.5.0** — dialogs Branch/Merge, remote manager (clone/init), stage por hunk/linha, diff split
- **0.9.0** — stash, cherry-pick, revert, tags, resolvedor de conflitos, force-with-lease
- **1.0.0** — rebase interativo com undo, git-flow, reflog + backup bundle
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

MIT — ver [`LICENSE`](LICENSE). Open source: pode usar, modificar e distribuir,
desde que mantidos os créditos (aviso de copyright da Werneck Lab).

## Contribuindo

Pull requests são bem-vindos. Ao contribuir, mantenha o aviso de copyright
MIT em `LICENSE` e não inclua assets de terceiros com licença incompatível
(nada da Atlassian/SourceTree: ícones e textos devem ser originais).

---
*Desenvolvido por **Werneck Lab** — TreeLine: onde o labirinto do Git vira um caminho reto.*
