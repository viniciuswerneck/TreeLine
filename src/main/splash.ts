// Splash screen do TreeLine: arte do usuário (`build/splash.jpg`, 1376x768)
// em tela cheia + barrinha de carregamento, slogan e versão sobrepostos.
// A imagem vai em extraResources (fora do asar) e cai para o caminho do
// repo em `npm run dev`. Fica 3s na tela (SPLASH_MIN_MS).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

export const SPLASH_MIN_MS = 3000

export const SPLASH_W = 880
export const SPLASH_H = 492

export type SplashLang = 'en' | 'pt' | 'es'

const TAGLINE: Record<SplashLang, string> = {
  en: 'Where the Git maze becomes a straight path - WerneckLab',
  pt: 'Onde o labirinto do Git vira um caminho reto - WerneckLab',
  es: 'Donde el laberinto de Git se vuelve un camino recto - WerneckLab'
}

/** Idioma salvo pelo renderer (`treeline:setLang`) ou locale do sistema. */
export function splashLang(): SplashLang {
  try {
    const saved = readFileSync(join(app.getPath('userData'), 'lang'), 'utf-8').trim()
    if (saved === 'pt' || saved === 'es' || saved === 'en') return saved
  } catch {
    /* segue para detecção */
  }
  const env = `${process.env['LANGUAGE'] ?? ''} ${process.env['LANG'] ?? ''}`.toLowerCase()
  if (env.includes('pt')) return 'pt'
  if (env.includes('es')) return 'es'
  return 'en'
}

/** Caminho da arte: prod (extraResources) ou repo (dev). */
export function splashImagePath(): string {
  try {
    const prod = join(process.resourcesPath, 'splash.jpg')
    if (existsSync(prod)) return prod
  } catch {
    /* segue para o fallback */
  }
  return join(app.getAppPath(), 'build', 'splash.jpg')
}

export function splashHtml(imgSrc: string, version: string, lang: SplashLang): string {
  const tag = TAGLINE[lang] ?? TAGLINE.en
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  * { margin: 0; box-sizing: border-box; }
  html, body { height: 100%; background: transparent; }
  body {
    font-family: "Segoe UI Variable", Inter, system-ui, "Ubuntu", sans-serif;
    background: url("${imgSrc}") center / cover no-repeat, #141d33;
    border-radius: 14px; overflow: hidden;
    display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
    -webkit-app-region: drag; user-select: none;
  }
  .tag { color: rgba(255,255,255,.82); font-size: 12.5px; letter-spacing: .02em; margin-bottom: 10px; text-shadow: 0 1px 8px rgba(0,0,0,.8); }
  .tag b { color: #fff; }
  .bar { width: 300px; height: 4px; border-radius: 999px; background: rgba(255,255,255,.16); overflow: hidden; margin-bottom: 8px; box-shadow: 0 1px 8px rgba(0,0,0,.6); }
  .bar i { display: block; height: 100%; width: 40%; border-radius: 999px; background: linear-gradient(90deg, #1f9cff, #a855f7);
    animation: slide 1.1s ease-in-out infinite; }
  @keyframes slide { 0% { transform: translateX(-110%);} 100% { transform: translateX(280%);} }
  .ver { color: rgba(255,255,255,.55); font-size: 11px; margin-bottom: 22px; text-shadow: 0 1px 6px rgba(0,0,0,.8); }
</style></head>
<body>
  <div class="tag">${tag}</div>
  <div class="bar"><i></i></div>
  <div class="ver">v${version}</div>
</body></html>`
}
