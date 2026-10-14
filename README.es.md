# TreeLine — Git GUI para Linux

[English](README.md) | [Português](README.pt-BR.md) | **Español**

**TreeLine es un cliente Git visual (Git GUI) para Linux**: una app para Ubuntu/Debian con el flujo familiar de las GUIs Git clásicas de escritorio (Windows/Mac). Si buscabas una *Git GUI para Linux* o un *Git client para Linux* — es esto.

![Linux](https://img.shields.io/badge/platform-Ubuntu%2FDebian-blue) ![Electron](https://img.shields.io/badge/Electron-44-47848F) ![Status](https://img.shields.io/badge/status-0.6.16-green)

> Implementación 100% original — proyecto independiente. Sigue el flujo de las GUIs Git clásicas de escritorio, sin copiar marca, iconos o textos.

## Una Git GUI clásica para Linux

Las GUIs Git clásicas de escritorio no tienen versión oficial para Linux. TreeLine llena ese vacío:

| Usuario de GUI Git clásica | En TreeLine |
|---|---|
| Toolbar Commit, Push, Pull, Fetch, Branch, Merge, Stash, Tag | Mismo orden, mismos nombres, iconos propios |
| Sidebar con bookmarks, branches, remotos, stashes | Igual, con badges ahead/behind |
| Grafo de commits + file status + diff | Grafo colorido, stage por archivo/hunk/línea, diff unified/lado a lado |
| Credenciales y SSH | Reutiliza credential helper y ssh-agent del sistema |

Otras alternativas que la gente compara: GitKraken, GitHub Desktop (sin versión oficial para Linux), Sublime Merge, Gitg, Git Cola. TreeLine se enfoca en **el mismo flujo de uso de las GUIs Git clásicas** y en ser liviano de instalar (`.deb`/AppImage).

## Funcionalidades

- **4 regiones**: toolbar, sidebar (Bookmarks, Workspace, Branches, Remotes, Tags, Stashes), historial con grafo y panel File Status + diff (Unstaged y Staged se expanden juntos, lado a lado)
- **Grafo de commits colorido**: lanes coloridos, curvas de merge, badges por tipo de ref, fechas absolutas, avatares, combo de ramas con búsqueda y remotos opcionales, comparar 2 commits (Ctrl+click)
- **Flujo completo**: Stage/Unstage (por archivo, hunk y línea + Stage All), diff lado a lado con flechas por bloque, Commit con Amend (Ctrl+Enter), **Push (`--force-with-lease` a demanda) / Pull (`--ff-only`) / Fetch** con toast de progreso
- **Búsqueda de commits**, filtro por branch actual, clic en un commit muestra archivos + diff, Blame e historial de archivo
- **Branch/Merge/Stash/Tag/Rebase (simple + interactivo)/Cherry-Pick/Revert/Reset/Git-flow/Reflog+Undo** con backup bundle antes de destructivos
- **Resolvedor de conflictos 3 vías**: columnas A | Resultado | B a pantalla completa (estilo WinMerge) con editores CodeMirror, elección de región en 1 clic (A/B/ambos/ninguno), **rerere** opcional y Continue/Abort para merge, rebase, cherry-pick, revert y stash
- **Botón derecho** con menús en todo, paleta de comandos `Ctrl+K`, sidebar colapsable (`Ctrl+B`), terminal integrado, statusbar clicable
- **10 temas** (5 claros + 5 oscuros + System) y **Ajustes** con identidad del autor (nombre/email)
- **3 idiomas**: English, Português y Español (detecta el sistema, se cambia en Ajustes)
- Siempre vía **git del sistema** (hooks, LFS, flow y credential helpers funcionan igual que en la terminal)

## Instalar en Ubuntu/Debian

Descarga el `.deb` o el `.AppImage` en la página de **Releases** e instala:

```bash
sudo apt install ./treeline-git-gui_0.6.16_amd64.deb
```

Requisito: `git >= 2.40`. Opcional: `git-lfs`, `git-flow`.

## Desarrollar

```bash
npm install
npm run dev        # Vite + Electron con hot reload
npm run typecheck  # tsc (node + web)
npm run build      # solo compila
npm run dist       # .deb + AppImage en dist/
npm test           # Vitest (motor del grafo + parsers)
npm run test:ui    # harness Playwright vía CDP (la app debe correr con --remote-debugging-port=9222)
npm run test:ui:new # harness CDP extra (LFS, pestañas, atajos, flujos E2E)
```

Para correr el binario local sin instalar:

```bash
./dist/linux-unpacked/treeline-git-gui --no-sandbox
```

## Estructura

```
src/
  main/       # Electron/Node: git vía CLI, IPC, bookmarks, splash
  preload/    # bridge segura (contextIsolation on)
  renderer/   # React + zustand: Toolbar/Sidebar/HistoryGraph/DetailsPanel/StatusBar/SyncToast/SettingsDialog
  shared/     # tipos del IPC
docs/         # visión, roadmap, arquitectura, ADRs, estado, design system
manual/       # manual de usuario en pt-BR con capturas (Git para principiantes)
```

Documentación de producto y decisiones en [`docs/`](docs/).
Manual de usuario (pt-BR, Git desde cero) en [`manual/`](manual/).

## Estado / Roadmap (resumen)

- **0.5.0** — stage por hunk/línea, diff split, revert/reset, `--force-with-lease`, blame/compare, paleta de comandos
- **0.6.0 – 0.6.2** — watcher + fetch automático, LFS, submódulos recursivos, custom actions, pestañas con drag, atajos reasignables, Flatpak/CI, virtualización con 10k commits, Ajustes en 2 columnas
- **0.6.3** — paquete y binario renombrados a `treeline-git-gui` (sin choque con el paquete `treeline` de Ubuntu)
- **0.6.10** — resolvedor de conflictos 3 vías con rerere, Unstaged/Staged expandiéndose juntos, combo de ramas con búsqueda + remotas en el historial
- **0.6.11** — la TUI de opencode abre en la carpeta del proyecto (repo pasado como argumento posicional)
- **Siguiente** — envío a Flathub, `libsecret`/GNOME Keyring, auto-update, `--rpm`/AUR

Detalle y notas de paridad en [`docs/02-roadmap.md`](docs/02-roadmap.md).

## Preguntas frecuentes

**¿TreeLine sustituye a una GUI Git clásica?**
Sí — es una app independiente con flujo parecido. Las GUIs Git clásicas (Windows/Mac) no tienen versión oficial para Linux.

**¿En qué distro funciona?**
Ubuntu/Debian primero (`.deb` + AppImage). Flatpak y otras distros entran en el roadmap.

**¿Mis datos salen de la máquina?**
No. Sin telemetría por defecto; las credenciales quedan en el credential helper de tu sistema.

## Licencia

MIT — ver [`LICENSE`](LICENSE). Open source: puedes usar, modificar y distribuir,
siempre que mantengas los créditos (aviso de copyright de Werneck Lab).

## Contribuir

Los pull requests son bienvenidos. Al contribuir, mantén el aviso de copyright
MIT en `LICENSE` y no incluyas assets de terceros con licencia incompatible
(nada copiado de otros productos de Git GUI: iconos y textos deben ser originales).

---
*Desarrollado por **Werneck Lab** — TreeLine: donde el laberinto de Git se vuelve un camino recto.*
