// Splash screen do TreeLine: HTML inline (sem arquivos externos, funciona
// igual em `npm run dev` e no app empacotado). Layout clássico de splash
// (logo centralizado + nome + tagline + barra de progresso), arte própria:
// mesmo motivo de branch do ícone, feito em SVG. Fica 3s na tela.
export const SPLASH_MIN_MS = 3000

export const SPLASH_HTML = `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  * { margin: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    font-family: "Segoe UI Variable", Inter, system-ui, "Ubuntu", sans-serif;
    background: #f3f3f3; color: #1b1b1b;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 10px; overflow: hidden;
    -webkit-app-region: drag; user-select: none;
    border: 1px solid rgba(0,0,0,.08); border-radius: 12px;
  }
  h1 { font-size: 30px; font-weight: 700; letter-spacing: .01em; }
  h1 span { color: #4f6bed; }
  p { font-size: 12.5px; color: #616161; }
  .bar { width: 240px; height: 3px; border-radius: 999px; background: rgba(79,107,237,.18); overflow: hidden; margin-top: 8px; }
  .bar i { display: block; height: 100%; width: 40%; border-radius: 999px; background: #4f6bed;
    animation: slide 1.1s ease-in-out infinite; }
  @keyframes slide { 0% { transform: translateX(-100%);} 100% { transform: translateX(320%);} }
  .ver { font-size: 11px; color: #9a9a9a; margin-top: 2px; }
</style></head>
<body>
  <svg width="132" height="132" viewBox="0 0 512 512" aria-hidden="true">
    <rect x="8" y="8" width="496" height="496" rx="116" fill="#141d33"/>
    <line x1="196" y1="92" x2="196" y2="420" stroke="#1f9cff" stroke-width="30"/>
    <polyline points="196,268 268,268 268,150" fill="none" stroke="#22c55e" stroke-width="30" stroke-linejoin="round"/>
    <polyline points="330,300 258,300 258,372 196,372" fill="none" stroke="#f59e0b" stroke-width="30" stroke-linejoin="round"/>
    <circle cx="196" cy="132" r="30" fill="#fff"/>
    <circle cx="268" cy="150" r="30" fill="#fff"/>
    <circle cx="196" cy="372" r="30" fill="#fff"/>
    <circle cx="330" cy="300" r="30" fill="#fff"/>
  </svg>
  <h1>Tree<span>Line</span></h1>
  <p>A familiar home for your repositories on Linux</p>
  <div class="bar"><i></i></div>
  <div class="ver">__VERSION__</div>
</body></html>`
