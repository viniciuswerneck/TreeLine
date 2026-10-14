/**
 * Captura os screenshots do TreeLine para o site e o manual, usando os repos
 * de demonstração (dados fictícios) em TEMA ESCURO e interface em pt-BR.
 *
 * Pré-requisitos:
 *   1. Repos de demo: DEMO_DIR=/tmp/opencode/treeline-demo node scripts/make-demo-repo.js
 *   2. App rodando com um HOME limpo (sem bookmarks/abas pessoais) e a porta
 *      de debug aberta. Ver scripts/shots-run.sh.
 *
 * Uso:
 *   node scripts/manual-shots.cjs [--only=01,05,17] [--site]
 *
 * Saída:
 *   manual/prints/01..17-*.png        (manual pt-BR)
 *   /tmp/opencode/site-shots/*.png    (originais p/ copiar ao site)
 *   --site também copia as 6 imagens do site para $SITE_DIR.
 */
const path = require('node:path')
const fs = require('node:fs')
const { chromium } = require('playwright-core')

const REPO = path.join(__dirname, '..')
const MANUAL = path.join(REPO, 'manual', 'prints')
const SITE_SHOTS = '/tmp/opencode/site-shots'
const SITE_DIR = process.env.SITE_DIR || path.join(REPO, '..', 'dev', 'www', 'treeline-site', 'assets')
const DEMO = process.env.DEMO_DIR || '/tmp/opencode/treeline-demo'
const AURORA = path.join(DEMO, 'aurora')
const CONFLITO = path.join(DEMO, 'aurora-conflito')

const VIEW = { width: 1321, height: 699 }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const args = process.argv.slice(2)
const onlyArg = args.find((a) => a.startsWith('--only='))
const ONLY = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').map((s) => s.trim())) : null
const want = (id) => !ONLY || ONLY.has(id)
const alsoSite = args.includes('--site')

// Mapa print -> cópia no site.
const SITE_MAP = {
  '01-janela-principal': 'shot-overview',
  '03-historico-detalhe': 'shot-history',
  '05-arquivos-stage': 'shot-stage',
  '06-diff-lado-a-lado': 'shot-diff',
  '13-paleta': 'shot-palette',
  '17-resolvedor-conflitos': 'shot-conflict'
};

(async () => {
  fs.mkdirSync(MANUAL, { recursive: true })
  fs.mkdirSync(SITE_SHOTS, { recursive: true })

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  // A janela principal é .../out/renderer/index.html; ignora a splash
  // (file:///tmp/treeline-splash-*.html) e espera ela aparecer.
  let page = null
  for (let i = 0; i < 60 && !page; i++) {
    const pages = browser.contexts().flatMap((c) => c.pages())
    page = pages.find((p) => /out\/renderer\/index\.html/.test(p.url() || ''))
    if (!page) await sleep(500)
  }
  if (!page) {
    const pages = browser.contexts().flatMap((c) => c.pages())
    page = pages.find((p) => (p.url() || '').startsWith('file://') && !/splash/.test(p.url())) || pages[0]
  }
  console.log('PAGE:', page.url())

  // Esconde a barra de abas e a seção Bookmarks (sem dados pessoais nos prints).
  const hideChrome = async () => {
    await page
      .evaluate(() => {
        if (!document.getElementById('tl-shots-hide')) {
          const s = document.createElement('style')
          s.id = 'tl-shots-hide'
          s.textContent = '.tabbar{display:none!important}'
          document.head.appendChild(s)
        }
        // Bookmarks é a 1ª seção da sidebar: esconde o título e as linhas seguintes.
        const first = document.querySelector('.sidebar-section-title')
        if (first) {
          first.style.display = 'none'
          let n = first.nextElementSibling
          while (n && !n.classList.contains('sidebar-section-title')) {
            n.style.display = 'none'
            n = n.nextElementSibling
          }
        }
      })
      .catch(() => undefined)
  }

  const probes = {}
  const probe = async () => {
    try {
      return await page.evaluate(() => {
        const vis = (el) => {
          if (!el) return false
          const s = getComputedStyle(el)
          if (s.display === 'none' || s.visibility === 'hidden') return false
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.height > 0
        }
        const str = (el, n = 80) => ((el && el.textContent) || '').replace(/\s+/g, ' ').trim().slice(0, n)
        const modal = document.querySelector('.modal')
        return {
          modal: vis(modal) ? { cls: modal.className, title: str(modal.querySelector('.dlg-title, h2, .modal-title')) } : null,
          crOverlay: vis(document.querySelector('.cr-overlay')),
          palette: vis(document.querySelector('.palette')),
          terminal: vis(document.querySelector('.terminal-drawer')),
          branchComboOpen: vis(document.querySelector('.branch-combo-panel')),
          commitDetail: !!document.querySelector('.commit-title'),
          diffMode: [...document.querySelectorAll('.diff-mode button')].map((b) => b.className).join(','),
          commitMsg: (document.querySelector('.commit-bar textarea') || {}).value || '',
          historySel: str(document.querySelector('.commit-title, .detail-title, .commit-detail-title'), 70),
          visibleSections: [...document.querySelectorAll('.sidebar-section-title')]
            .filter((t) => getComputedStyle(t).display !== 'none')
            .map((t) => t.textContent.replace(/\s+/g, ' ').trim()),
          status: str(document.querySelector('.statusbar'), 120)
        }
      })
    } catch (e) {
      return { err: String(e).slice(0, 120) }
    }
  }
  const shot = async (name) => {
    await hideChrome()
    await sleep(250)
    probes[name] = await probe()
    const out = path.join(MANUAL, `${name}.png`)
    await page.screenshot({ path: out })
    const base = path.join(SITE_SHOTS, `${name}.png`)
    fs.copyFileSync(out, base)
    console.log('shot:', name)
  }

  // Tema escuro + pt-BR + sem abas pessoais; depois recarrega.
  await page.evaluate(() => {
    localStorage.setItem('treeline-theme', 'treeline-dark')
    localStorage.setItem('treeline-lang', 'pt')
    localStorage.setItem('treeline-tabs', '[]')
    localStorage.setItem('treeline-diffmode', 'unified')
    localStorage.setItem('treeline-side-sections', JSON.stringify({ bookmarks: false }))
  })
  await page.evaluate(async (r) => { await window.treeline.addRecent(r).catch(() => undefined) }, AURORA).catch(() => undefined)
  await page.reload()
  await page.waitForSelector('.toolbar', { timeout: 30000 })
  await page.waitForSelector('.history-row', { timeout: 30000 })
  await sleep(2500)

  // Viewport fixo (consistente com os prints antigos).
  try {
    await page.setViewportSize(VIEW)
    await sleep(500)
  } catch (e) {
    console.log('setViewportSize falhou (segue com o tamanho da janela):', String(e).slice(0, 80))
  }

  // Diff unificado por padrão nas cenas iniciais (evita herdar o modo salvo).
  const uni0 = page.locator('.diff-mode button').first()
  if (await uni0.count()) { await uni0.click().catch(() => undefined); await sleep(400) }

  const clickToolbar = async (titlePart) => {
    const btn = page.locator(`.toolbar .tool-btn[title*="${titlePart}"]`).first()
    await btn.click({ timeout: 4000 })
    await sleep(900)
  }
  const esc = async () => {
    await page.keyboard.press('Escape')
    await sleep(600)
  }
  const toWorkingCopy = async () => {
    const back = page.locator('.commit-title .mini-btn').first()
    if (await back.count()) {
      await back.click().catch(() => undefined)
      await sleep(700)
    }
  }

  // ---- 01 janela principal ------------------------------------------------
  if (want('01')) await shot('01-janela-principal')

  // ---- 02 sidebar (rola até branches/tags/stashes) ------------------------
  if (want('02')) {
    await page.evaluate(() => {
      const sb = document.querySelector('.sidebar')
      if (sb) sb.scrollTop = sb.scrollHeight
    })
    await sleep(400)
    await shot('02-sidebar')
    await page.evaluate(() => { const sb = document.querySelector('.sidebar'); if (sb) sb.scrollTop = 0 })
  }

  // ---- 03 histórico/detalhe (commit com tag) ------------------------------
  if (want('03')) {
    const tagged = page.locator('.history-row:has(.ref-badge.tag)').first()
    const row = (await tagged.count()) ? tagged : page.locator('.history-row').nth(1)
    await row.click().catch(() => undefined)
    await sleep(1400)
    await shot('03-historico-detalhe')
    await toWorkingCopy()
  }

  // ---- 04 combo de branches ----------------------------------------------
  if (want('04')) {
    await page.locator('.branch-combo-btn').first().click().catch(() => undefined)
    await sleep(900)
    await shot('04-combo-branches')
    await page.keyboard.press('Escape')
    await sleep(500)
  }

  // ---- 05 arquivos/stage (file status + diff unificado) -------------------
  if (want('05')) {
    await toWorkingCopy()
    const uni = page.locator('.diff-mode button').first()
    if (await uni.count()) { await uni.click().catch(() => undefined); await sleep(500) }
    const file = page.locator('.file-col .file-row', { hasText: 'painel.js' }).first()
    if (await file.count()) { await file.click(); await sleep(1200) }
    await shot('05-arquivos-stage')
  }

  // ---- 06 diff lado a lado ------------------------------------------------
  if (want('06')) {
    const split = page.locator('.diff-mode button').nth(1)
    if (await split.count()) { await split.click(); await sleep(900) }
    await shot('06-diff-lado-a-lado')
  }

  // ---- 07 mensagem de commit ---------------------------------------------
  if (want('07')) {
    const ta = page.locator('.commit-bar textarea').first()
    await ta.click().catch(() => undefined)
    await ta.fill('feat: adiciona filtro por vendedor no painel').catch(() => undefined)
    await sleep(800)
    await shot('07-commit-mensagem')
    await ta.fill('').catch(() => undefined)
    await sleep(300)
  }

  // ---- 08..11 diálogos da toolbar ----------------------------------------
  const dlg = [
    ['08-branch', 'Branch'],
    ['09-merge', 'Merge'],
    ['10-stash', 'Stash'],
    ['11-reflog', 'Reflog']
  ]
  for (const [name, title] of dlg) {
    if (!want(name.slice(0, 2))) continue
    await clickToolbar(title)
    await shot(name)
    await esc()
  }

  // ---- 12 remotes (ícone só, 2º icon-only) -------------------------------
  if (want('12')) {
    await toWorkingCopy()
    await page.locator('.toolbar .tool-btn.icon-only').nth(1).click().catch(() => undefined)
    await sleep(1000)
    await shot('12-remotes')
    await esc()
  }

  // ---- 13 paleta ----------------------------------------------------------
  if (want('13')) {
    await page.keyboard.press('Control+k')
    await sleep(900)
    await shot('13-paleta')
    await page.keyboard.press('Escape')
    await sleep(500)
  }

  // ---- 14 terminal --------------------------------------------------------
  if (want('14')) {
    await clickToolbar('Terminal')
    await page.locator('.terminal-body').first().click().catch(() => undefined)
    await sleep(1200)
    await page.keyboard.type('git log --oneline -6').catch(() => undefined)
    await page.keyboard.press('Enter')
    await sleep(1200)
    await shot('14-terminal')
    // fecha o drawer
    const close = page.locator('.terminal-head .pane-expand').last()
    await close.click().catch(() => undefined)
    await sleep(600)
  }

  // ---- 15 settings --------------------------------------------------------
  if (want('15')) {
    await clickToolbar('Settings')
    await page.waitForSelector('.modal.two-col', { timeout: 5000 }).catch(() => undefined)
    await sleep(600)
    await shot('15-settings')

    // ---- 16 atalhos (rola até a coluna de atalhos) ------------------------
    if (want('16')) {
      await page.evaluate(() => { const b = document.querySelector('.two-col-body'); if (b) b.scrollTop = b.scrollHeight })
      await sleep(700)
      await shot('16-atalhos')
    }
    await esc()
  }

  // ---- 17 resolvedor de conflitos ----------------------------------------
  if (want('17')) {
    await page.evaluate(async (r) => { await window.treeline.addRecent(r).catch(() => undefined) }, CONFLITO).catch(() => undefined)
    await page.reload()
    await page.waitForSelector('.toolbar', { timeout: 30000 })
    await sleep(3000)
    // Abre o resolvedor pelo item de conflito na statusbar (mais confiável
    // que a linha de arquivo, cuja classe pode variar).
    const warn = page.locator('.statusbar .status-link.warn').first()
    if (await warn.count()) {
      await warn.click().catch(() => undefined)
    } else {
      const row = page.locator('.file-row.conflict-row, .file-row').first()
      if (await row.count()) await row.click().catch(() => undefined)
    }
    await page.waitForSelector('.cr-overlay', { timeout: 8000 }).catch(() => undefined)
    await sleep(1200)
    await shot('17-resolvedor-conflitos')
  }

  // ---- copia para o site --------------------------------------------------
  if (alsoSite) {
    fs.mkdirSync(SITE_DIR, { recursive: true })
    for (const [src, dst] of Object.entries(SITE_MAP)) {
      const from = path.join(SITE_SHOTS, `${src}.png`)
      if (fs.existsSync(from)) {
        fs.copyFileSync(from, path.join(SITE_DIR, `${dst}.png`))
        console.log('site:', dst)
      }
    }
  }

  await browser.close().catch(() => undefined)
  fs.writeFileSync(path.join(SITE_SHOTS, 'probe.json'), JSON.stringify(probes, null, 2))
  console.log('probe:', path.join(SITE_SHOTS, 'probe.json'))
  console.log('OK')
  process.exit(0)
})().catch((e) => {
  console.error('FALHOU:', e && e.message ? e.message : e)
  process.exit(1)
})
