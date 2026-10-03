# TreeLine — Referência do Assistente (ler primeiro em toda sessão futura)

> Arquivo mestre de memória. Se você é uma IA assumindo este projeto, leia este arquivo + `01-visao.md` + `05-estado.md` antes de qualquer ação.

## 1. Resumo em 30 segundos

- **O quê:** Git GUI para Linux com experiência familiar para quem vem do SourceTree (Atlassian). Nome: **TreeLine**.
- **Por quê:** Não existe SourceTree oficial para Linux. Usuário quer paridade de uso intuitiva.
- **Onde:** `/home/vinicius/gitnest/` | docs em `/home/vinicius/gitnest/docs/`
- **Idioma do usuário:** português brasileiro. Responder em pt-BR, curto e direto, sem emoji. Termos de Git/UI em inglês (Commit, Push, Branch) como no SourceTree.
- **Status 2026-10-03:** Fase 0 + extras prontos e rodando: scaffold Electron, UI 4 regiões, Push/Pull/Fetch reais com toast, grafo SVG estilo Git Graph, 10 temas, Settings (identidade), Stage All/Unstage All. Detalhe em `05-estado.md`. Próximo: dialogs Branch/Merge (Fase 1 restante).

## 2. Decisões travadas (não reabrir sem motivo)

1. **Nome = TreeLine** (singular, comando `treeline`). Descartados: Sourcetree (marca), Grove/Canopy/GitPilot/GitDock/GitDeck/GitVista/GitArbor/GitStage (colisão comprovada via websearch), Lingit (empresa NO), ipe (editor Ubuntu).
2. **Stack = Electron + Vite + React + TypeScript + simple-git via git CLI.** Motivo: usuário tem Node 22 no Ubuntu 26.04, sem Rust. UI web replica layout SourceTree mais rápido. Escritas sempre via CLI (hooks/LFS/flow ok). Ver ADR-001/002 em `04-decisoes.md`.
3. **Alvo primeiro = Ubuntu/Debian** (`.deb` + AppImage via electron-builder). Flatpak depois.
4. **Git-only** (sem Mercurial). LFS/flow suportados via CLI do sistema.
5. **Layout = 4 regiões familiares SourceTree** (toolbar, sidebar bookmarks/branches/remotes/tags/stash, history graph, file-status+diff, statusbar). Ver `01-visao.md §4`. **Inspirado, não clonado.**

## 3. Restrições legais/UX (obrigatórias)

- NUNCA copiar: nome SourceTree, logo, ícones, ilustrações, textos da Atlassian. Recriar tudo com Lucide + texto original.
- Manter terminologia e ordem de ações do SourceTree (Commit|Push|Pull|Fetch|Branch|Merge|Stash...) para migração intuitiva, mas com arte própria.
- Push padrão com `--force-with-lease`, nunca `--force` puro sem confirmação explícita. Reset hard/rebase exigem backup `git bundle` + confirmação (Fase 3).
- Sem telemetria por padrão. Token/ssh nunca em log ou config em claro. Reaproveitar credential.helper / ssh-agent.

## 4. Mapa dos docs

- `01-visao.md` — produto, layout alvo, fluxos, fora de escopo.
- `02-roadmap.md` — Fases 0-4 + tabela de paridade (atualizar status por release).
- `03-arquitetura.md` — main/preload/renderer, IPC, parsers, empacotamento.
- `04-decisoes.md` — ADRs (porquês).
- `05-estado.md` — onde paramos, o que falta, próximo comando.
- `../AGENTS.md` — instruções curtas para agentes.

## 5. Como retomar uma sessão

1. Ler este arquivo + `05-estado.md`.
2. `ls /home/vinicius/gitnest` para confirmar estrutura.
3. Não scaffolding sem confirmação se `05-estado.md` disser "aguardando usuário".
4. Ao terminar mudança: `npm run typecheck`, `npm run build`, reempacotar (`npx electron-builder --linux dir`), reiniciar o app (`pkill -x treeline` + `setsid nohup ./dist/linux-unpacked/treeline --no-sandbox --disable-setuid-sandbox --disable-gpu --ozone-platform-hint=auto > /tmp/opencode/treeline.log 2>&1 < /dev/null &`) e atualizar `05-estado.md` + `02-roadmap.md`.
5. Responder em pt-BR, objetivo, com caminho:linha quando citar código.

## 6. Comandos-chave (quando houver código)

- `npm run dev` — Vite + Electron hot reload (nesta máquina Wayland sem GPU, exportar `ELECTRON_DISABLE_SANDBOX=1` não basta: passar `--no-sandbox --disable-setuid-sandbox --disable-gpu --ozone-platform-hint=auto` ao binário; sem `--disable-gpu` o processo GPU trava em 100% CPU e nenhuma janela aparece)
- `npm run dist` — `.deb` + AppImage (ou `npx electron-builder --linux dir` para só atualizar `dist/linux-unpacked`)
- Pré-req runtime: `git >= 2.40` (sistema). Opcional: `git-lfs`, `git-flow`.
- Armadilhas reais já mordidas (detalhe em `04-decisoes.md` ADR-006/007/008): simple-git `.env()` apaga o env do filho; `git log` precisa `--topo-order`; parser precisa `trim()` no hash (`\n` entre registros).
- Última atualização deste arquivo: 2026-10-03.
