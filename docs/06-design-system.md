# TreeLine — Design System (Fluent/Win11 adaptado ao Linux)

> Tokens + componentes. Sem Mica real no Wayland/X11: tudo é aproximação CSS. Fonte: `AGENTS.md § Design System`. Implementação real em `src/renderer/styles.css` (os blocos abaixo resumem; os 10 temas vivem no CSS, não só aqui).

## 1. Tokens e temas (implementado 2026-10-03)

11 modos: `system` (sem `data-theme`, segue `prefers-color-scheme`) + 5 light + 5 dark via `:root[data-theme="id"]`, com `color-scheme` correspondente. Troca no Settings (antes `ThemeMenu` na toolbar, removido), persistida em `localStorage` (`themes.ts`).

| Tema | bg-app | bg-panel | text-1 | accent |
|---|---|---|---|---|
| TreeLine Light | `#f3f3f3` | `#ffffff` | `#1b1b1b` | `#4f6bed` |
| Paper | `#efe9dc` | `#faf7ef` | `#2b2417` | `#9a6a1b` |
| Sandstone | `#e8e2d6` | `#f4f0e6` | `#241d12` | `#b3541e` |
| Mint | `#e6f0ea` | `#f5faf7` | `#16281f` | `#0e7a4c` |
| Sky | `#e3edf7` | `#f3f8fd` | `#14242f` | `#0369c7` |
| TreeLine Dark | `#202020` | `#2b2b2b` | `#ffffff` | `#7b8cff` |
| Midnight | `#0d1321` | `#141d33` | `#e8eefc` | `#5b9dff` |
| Forest | `#121c16` | `#1a271f` | `#e6f2e9` | `#3ecf7a` |
| Graphite | `#171717` | `#212121` | `#f0f0f0` | `#e0a100` |
| Plum | `#1d1420` | `#281d30` | `#f4e9f7` | `#c86be8` |

Base (radius/fonte/motion/sombra) como no bloco original abaixo; cada tema redefine bg/sidebar/panel/hover/selected/borders/text/accent/shadow.

```css
:root {
  --radius-sm: 8px;   /* cards, botões, rows */
  --radius-lg: 12px;  /* modais, painéis flutuantes */
  --font-stack: "Segoe UI Variable", Inter, system-ui, "Ubuntu", sans-serif;
  --motion-fast: 150ms cubic-bezier(.2,.8,.2,1);
  --motion-med: 200ms cubic-bezier(.2,.8,.2,1);

  /* Light */
  --bg-app: #f3f3f3;
  --bg-sidebar: rgba(249, 249, 249, 0.72); /* Mica aprox. + backdrop-filter */
  --bg-card: #ffffff;
  --border-hl: rgba(255, 255, 255, 0.7);  /* borda de luz, 1px */
  --border-line: rgba(0, 0, 0, 0.08);
  --text-1: #1b1b1b;
  --text-2: #616161;
  --accent: #4f6bed;
  --shadow-1: 0 1px 2px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.08);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-app: #202020;
    --bg-sidebar: rgba(44, 44, 44, 0.72);
    --bg-card: #2b2b2b;
    --border-hl: rgba(255, 255, 255, 0.09);
    --border-line: rgba(0, 0, 0, 0.4);
    --text-1: #ffffff;
    --text-2: #a7a7a7;
    --accent: #7b8cff;
    --shadow-1: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.4);
  }
}
```

Regras: motion só em `transform`/`opacity`; `backdrop-filter` só na sidebar e em modais (nunca no grafo/diff); todo interativo tem `:hover`, `:active`, `:focus-visible`.

## 2. Componente 1 — Sidebar estilo Mica

Estrutura (espelha `01-visao.md §4.1`): Bookmarks → Workspace → Branches → Remotes → Tags → Stashes.

```css
.sidebar {
  width: 248px;
  background: var(--bg-sidebar);
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
  border-right: 1px solid var(--border-line);
  font-family: var(--font-stack);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
}
.sidebar-section-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--text-2);
  padding: 12px 8px 4px;
}
.sidebar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  color: var(--text-1);
  cursor: pointer;
  transition: background var(--motion-fast), border-color var(--motion-fast),
              transform var(--motion-fast);
}
.sidebar-row:hover { background: rgba(127, 127, 127, 0.14); }
.sidebar-row:active { transform: scale(0.99); }
.sidebar-row:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.sidebar-row[aria-selected="true"] {
  background: rgba(127, 127, 127, 0.2);
  border-color: var(--border-hl);
}
.sidebar-badge { /* ahead/behind, contadores */
  margin-left: auto;
  font-size: 11px;
  color: var(--text-2);
  background: rgba(127, 127, 127, 0.16);
  border-radius: 999px;
  padding: 1px 8px;
}
```

Comportamento (paridade SourceTree): duplo-clique = checkout; botão direito = menu completo (Checkout, Merge, Rebase, Rename, Delete); seção colapsável com chevron animado (`transform: rotate` em 150ms).

## 3. Componentes implementados (2026-10-03)

1. ~~Sidebar~~ ☑ → 2. Toolbar completa ☑ → 3. Modal Settings ☑ → 4. SyncToast ☑ → 5. ~~ThemeMenu~~ (movido p/ Settings) ☑ → 6. Grafo SVG ☑.
- **Grafo estilo Git Graph**: SVG por linha (lane 16px, altura 30px), paleta fixa de 8 cores por lane (`LANE_COLORS` em `HistoryGraph.tsx`), curvas Bézier nos merges/forks, dots com borda do bg, badges de ref por tipo (HEAD/branch/remoto/tag), datas relativas pt-BR com tooltip ISO.
- **SyncToast**: canto inferior direito, borda lateral por fase (accent/verde/vermelho), spinner CSS, auto-dismiss do sucesso em 5s.
- **Modal Settings**: seguem radius/shadow/tokens; `backdrop-filter` só na sidebar e modais, nunca no grafo/diff.

## 4. Próximo

Stage por hunk no diff, dialogs Branch/Merge, menu de contexto na sidebar, virtualização do histórico (10k+ commits).
