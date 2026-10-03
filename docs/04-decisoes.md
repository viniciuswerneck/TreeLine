# TreeLine — Registro de Decisões (ADR)

Formato curto: Contexto -> Decisão -> Consequência. Não reabrir sem fato novo.

## ADR-001 — Electron em vez de Tauri/Qt/GTK (2026-10-03)

- Contexto: Usuário iniciante, Ubuntu 26.04, Node 22 instalado, sem Rust/cargo. Precisa replicar layout SourceTree (grafo, diff split) e gerar `.deb`.
- Decisão: Electron + Vite + React + TS.
- Consequência: App maior (~100MB), mas scaffold imediato, UI web fiel, electron-builder gera `.deb`/AppImage. Migração para Tauri possível depois se precisar leveza. Rejeitados: Tauri (exige Rust + WebKitGTK), Qt/GTK (grafo/diff dariam muito mais trabalho).

## ADR-002 — Git via CLI, não libgit2 (2026-10-03)

- Contexto: Paridade com SourceTree exige rebase interativo, hooks, LFS, flow, credential helpers.
- Decisão: `simple-git` chamando `git` do sistema. Leituras podem otimizar com nativo no futuro; escritas sempre via CLI, com lock por repo.
- Consequência: Depende de `git >= 2.40` instalado, mas comportamento idêntico ao terminal. Parse via `status --porcelain=v2`, `log --pretty=format`, `diff --unified`.

## ADR-003 — Nome TreeLine (2026-10-03)

- Contexto: Evitar marca SourceTree/Atlassian. Usuário pediu nome intuitivo (que diga "Git").
- Decisão: **TreeLine** (ninho de repos). Comando `treeline`.
- Rejeitados com prova websearch: Grove (4+ ferramentas Git), Canopy (git-canopy.com + apps), GitPilot (cliente Tauri existente), GitDock (gitdock.dev), GitDeck (3 projetos), GitVista (gitvista.io), GitArbor (cliente Electron), Stage/GitStage (cliente GTK4 + TUI), GitDesktop (cliente Tauri), Lingit (empresa norueguesa), ipe (editor do Ubuntu), TuxGit (serviço existente).
- Consequência: Marca global curta, intuitiva, sem colisão relevante como GUI desktop.

## ADR-004 — Ubuntu/Debian primeiro (2026-10-03)

- Contexto: Usuário no Ubuntu 26.04.1 LTS.
- Decisão: `.deb` + AppImage via electron-builder primeiro. Flatpak/Flathub, `.rpm`, AUR depois.
- Consequência: Foco em `apt`, `.desktop`, keyring GNOME. Não testar outras distros na Fase 0-1.

## ADR-005 — Paridade de UX sem clonar arte (2026-10-03)

- Contexto: Usuário pediu "aparência muito parecida com SourceTree para uso intuitivo".
- Decisão: Copiar comportamento e estrutura (4 regiões, ordem da toolbar, terminologia, fluxos) com ícones/textos/logo 100% originais (Lucide). Nomes de ações em inglês como no SourceTree.
- Consequência: Curva zero para ex-usuário, sem violação de marca/direito autoral. Escopo Git-only (sem Hg). Jira/Bitbucket profundo fica para pós-1.0 (só abrir URL do remote).

## ADR-006 — Nunca `simpleGit().env()`, flag no `process.env` (2026-10-03)

- Contexto: Push/Pull/Fetch falhavam no app com "could not read Username" enquanto o mesmo comando passava no terminal. Reproduzido em Node puro.
- Decisão: `simple-git` `.env()` passa `env: this.env` (só chaves custom) ao spawn — substitui o ambiente inteiro e apaga `HOME`, então o git não acha `~/.gitconfig`/`~/.git-credentials`. `GIT_TERMINAL_PROMPT=0` vai no `process.env` do main (herdado por todo filho), nunca via `.env()`.
- Consequência: Auth do sistema (credential helpers) funciona igual ao CLI. Regra permanente: checar como o filho recebe env antes de "proteger" com `.env()`.

## ADR-007 — Contratos do lane allocator (2026-10-03)

- Contexto: Grafo renderizava staircase (uma lane por commit) em histórico linear íntegro.
- Decisão: (1) `git log` sempre com `--topo-order` — ordem por data com múltiplas tips + clock skew pode listar pai antes do filho, e hash sem reserva ativa abre lane fantasma. (2) Layout sempre sobre a lista completa; busca/filtro de branch aplicados depois — filtrar antes remove elos e cada commit órfão vira lane nova (provado: c6,c4,c2 → lanes 0,1,2; depois do fix → 0,0,0).
- Consequência: Contratos documentados no cabeçalho de `lib/graph.ts`. Alocador single-pass continua O(n).

## ADR-008 — Parser do log faz `trim()` no hash (2026-10-03)

- Contexto: Staircase em TODO repo linear: todo hash após o primeiro chegava como `"\n<hash>"` porque o git emite `\n` entre registros mesmo com separador `%x1e` próprio (`row1.hash === row0.parent? false`).
- Decisão: `hash.trim()` + split de pais por `/\s+/` com filtro de vazios no parser de `getLog`.
- Consequência: Elos voltam a casar (5 commits → 5× lane 0). Lição: `slice(0,7)` em log escondeu o `\n` como "linha em branco" — inspecionar com `JSON.stringify` em parser de protocolo.

## ADR-009 — Credencial via credential helper + identidade em Settings (2026-10-03)

- Contexto: Usuário exigiu "abrir a pasta e funcionar", sem terminal. Remote HTTPS privado sem credencial salva.
- Decisão: Reaproveitar `credential.helper store` do sistema (token com escopo `repo`); identidade do autor (`user.name/email`) editável no dialog Settings com validação, em vez de só documentar `git config`.
- Consequência: Token fica em texto plano em `~/.git-credentials` (comportamento padrão do helper; orientar revogação). Botão Commit desabilitado sem stage/mensagem para erro impossível.

## ADR-010 — 10 temas próprios + System (2026-10-03)

- Contexto: Usuário pediu 5 temas claros e 5 escuros.
- Decisão: Tokens em `styles.css` via `:root[data-theme]` (System = sem atributo, segue `prefers-color-scheme`); `themes.ts` + seletor no Settings; persistência em `localStorage`. Nomes e paletas originais (TreeLine Light/Dark, Paper, Sandstone, Mint, Sky, Midnight, Forest, Graphite, Plum).
- Consequência: Troca instantânea sem reload; grafo usa paleta própria fixa legível nos 11 modos.

## ADR-011 — Rename GitNest -> TreeLine (2026-10-03)

- Contexto: Usuário pediu o novo nome.
- Decisão: Renomear tudo visível (productName, binário `treeline`, `.deb`, janela, welcome, statusbar, temas, docs) + API interna (`window.treeline`, canais `treeline:*`). Pasta do projeto mantida em `/home/vinicius/gitnest` (evita quebrar paths e processos). Migrações: bookmarks copiados de `~/.config/GitNest` uma vez; tema antigo mapeado (`gitnest-light/dark` -> novos ids).
- Consequência: userData novo em `~/.config/TreeLine`; legado fica órfão e pode ser apagado.
