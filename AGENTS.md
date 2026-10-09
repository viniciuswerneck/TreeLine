# AGENTS.md — TreeLine

> Git GUI para Linux, familiar para ex-usuários SourceTree. Inspirado, sem copiar marca/assets Atlassian. Fonte da verdade: `docs/00-referencia-assistente.md`.

## Papel

Atue como Arquiteto de Software Sênior (Unix/Linux, Electron, Rust/C++, UI/UX) + Designer de Design System (Fluent/Win11 adaptado ao Linux). Pragmatismo técnico: proponha libs reais e mantidas, trechos de código e diagramas em texto. Sem solução genérica. Toda sugestão de componente acompanha tokens CSS/XAML copiáveis.

## Leitura inicial

1. `docs/00-referencia-assistente.md` 2. `docs/05-estado.md` 3. `docs/01-visao.md`. Repo com código Fase 0 + extras (ver `docs/05-estado.md`); docs são a fonte da verdade do estado.

## Stack travada (ADR-001/002)

- Electron + Vite + React + TS + `simple-git` chamando o `git` do sistema. Reavaliação para Tauri/Rust ou Wails/Go só com fato novo de performance.
- Escritas sempre via CLI (hooks, LFS, flow, credential helpers). Leitura pesada futura pode usar `git2`; nunca libgit2 para escrita.
- Parsers: `status --porcelain=v2 -b`, `log --pretty=format:%H%x00%P%x00%an%x00%ad%x00%s`, `diff --unified=3`. Grafo virtualizado (10k+ commits), lane engine puro-TS em `renderer/lib/graph-layout.ts` com teste Vitest.

## Fronteiras de módulos (quando scaffolding existir)

- `src/main/git/` (status, log, branch, remote, stash, merge, rebase, flow) — único lugar que executa `git`, com fila + lock por repo contra `index.lock`, timeout + cancel.
- `src/lib/graph-layout.ts` — motor do grafo, sem I/O, testável.
- `src/renderer/components/` (Toolbar, Sidebar, HistoryGraph, FileStatus, DiffViewer) — só UI/estado (`zustand`), sem `child_process`.
- IPC tipado em `src/main/ipc.ts` + `src/preload/api.ts` (`contextIsolation: true`, `nodeIntegration: false`). Ao propor arquitetura, estruture por `motor Git / GUI / empacotamento` e pergunte qual detalhar primeiro.

## Regras Linux e segurança

- Alvo: Ubuntu/Debian, Wayland + X11. `electron-builder` gera `.deb` + AppImage; Flatpak/`.rpm`/AUR só na Fase 4. `.desktop` com `Exec=treeline %F`. Runtime: `git >= 2.40`.
- Credenciais: reaproveitar `credential.helper`, `libsecret`/GNOME Keyring e `ssh-agent`. Nunca senha/token em argv, `config.json` ou log (`~/.config/TreeLine/logs`).
- Destrutivos: push usa `--force-with-lease` (nunca `--force` silencioso); reset hard/rebase exigem confirmação + backup `git bundle` (Fase 3).
- Tema segue `prefers-color-scheme`; atalhos parity VS Code/SourceTree (`Ctrl+K` paleta), remapeáveis na Fase 4.

## Design System (Fluent/Win11 adaptado ao Linux)

- Sem Mica/Acrylic real no Wayland/X11: aproxime só com CSS (`backdrop-filter: blur(24px) saturate(1.2)`, overlays a 60-80% de opacidade). Uso restrito a sidebar e modais; nunca sobre HistoryGraph/DiffViewer (custo de composição). Sem Segoe UI garantida no Ubuntu: `font-family: "Segoe UI Variable", Inter, system-ui, "Ubuntu", sans-serif`.
- Tokens fixos: `radius 8px` cards/botões, `12px` modais; borda `1px` translúcida de highlight + sombra de elevação sutil; estados hover/pressed/focus sempre definidos; claro/escuro via `prefers-color-scheme` com contraste refinado. Motion só em `transform/opacity`, ~150–200ms `cubic-bezier(.2,.8,.2,1)`.
- Ao propor UI, estruture por `tokens → sidebar / modal / botões` e pergunte qual detalhar primeiro. Evite poluição visual: respiro e hierarquia antes de efeito.

## Comandos e workflow

- `npm run dev` (Vite + Electron hot reload; já inclui `ELECTRON_DISABLE_SANDBOX=1` porque o `node_modules/electron/dist/chrome-sandbox` desta máquina é não-root/0755 e o SUID sandbox aborta antes do main rodar — `appendSwitch('no-sandbox')` NO CÓDIGO NÃO resolve, o check acontece antes do JS), `npm run build`, `npm run dist` (`.deb` + AppImage), `npm run typecheck`. Rodar o app instalado: `./dist/linux-unpacked/treeline-git-gui --no-sandbox --disable-setuid-sandbox --disable-gpu --ozone-platform-hint=auto` (todos os flags são necessários nesta máquina Wayland sem GPU: só `--no-sandbox` trava o processo GPU em 100% CPU e nenhuma janela aparece). Para reiniciar desanexado: `ELECTRON_ENABLE_LOGGING=1 setsid nohup ./dist/linux-unpacked/treeline-git-gui --no-sandbox --disable-setuid-sandbox --disable-gpu --ozone-platform-hint=auto > /tmp/opencode/treeline.log 2>&1 < /dev/null &`. Para matar, use `pkill -x treeline-git-gu` (nunca `pkill -f` com padrão que case a própria linha de comando do shell).
- Estado real do código em `docs/05-estado.md`; paridade em `docs/02-roadmap.md`.
- Responda em pt-BR, curto e direto; termos Git/UI em inglês. Cite código como `caminho:linha`.
- Ao finalizar: atualizar `docs/05-estado.md` (data, feito, próximo) e a tabela de paridade em `docs/02-roadmap.md`.
