/**
 * Gera screenshots do TreeLine para o AppStream/Flathub.
 * Uso:
 *   1. Build: npm run build && npx electron-vite preview --outDir dist/linux-unpacked
 *      (ou use o .deb instalado: dist/linux-unpacked/treeline)
 *   2. ./dist/linux-unpacked/treeline --no-sandbox --disable-setuid-sandbox \
 *        --disable-gpu --ozone-platform-hint=auto --remote-debugging-port=9222
 *   3. node scripts/shots.cjs [repoPath]
 * Saída: build/flatpak/meta/screenshots/0{1,2,3}-*.png
 */
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const OUT = path.join(__dirname, '..', 'build', 'flatpak', 'meta', 'screenshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const pages = browser.contexts().flatMap((c) => c.pages());
  const page = pages.find((p) => (p.url() || '').startsWith('file://')) || pages[0];
  console.log('PAGE:', page.url());

  const repo = process.argv[2];
  if (repo && fs.existsSync(repo)) {
    // addRecent + reload: o app abre o primeiro repo salvo ao iniciar.
    await page
      .evaluate(async (r) => {
        await window.treeline.addRecent(r)
      }, repo)
      .catch((e) => console.log('addRecent falhou:', String(e).slice(0, 120)))
    await page.reload()
    await sleep(4000)
  }

  await sleep(2000);
  await page.screenshot({ path: path.join(OUT, '01-history.png') });
  console.log('01-history.png');

  // Sidebar: garante histórico carregado e clica em um commit para o diff abrir.
  const row = page.locator('.history-row').nth(2)
  if (await row.count()) {
    await row.click()
    await sleep(1200)
  }
  await page.screenshot({ path: path.join(OUT, '02-sidebar.png') });
  console.log('02-sidebar.png');

  // Settings: abre pela engrenagem do toolbar (último icon-only) e rola até
  // a seção de atalhos, que é a parte mais informativa do screenshot.
  const gear = page
    .locator('.toolbar .tool-btn[title*="Settings" i], .toolbar .tool-btn[title*="Configura" i]')
    .first();
  if (await gear.count()) {
    await gear.click();
    await sleep(1200);
    // Settings é 2 colunas: garante topo e as 4 seções visíveis no screenshot.
    const modal = page.locator('.modal.two-col').first();
    const check2col = await page.evaluate(() => {
      const m = document.querySelector('.modal.two-col')
      const body = document.querySelector('.two-col-body')
      if (!m || !body) return null
      body.scrollTop = 0
      return {
        cols: getComputedStyle(body).gridTemplateColumns.split(' ').length,
        secoes: [...document.querySelectorAll('.two-col-col .dlg-section')].map((s) => s.textContent),
        scrollTop: body.scrollTop,
       rola: body.scrollHeight > body.clientHeight + 2
      }
    });
    console.log('settings:', JSON.stringify(check2col));
    await sleep(400);
    if (!(await modal.count())) console.log('AVISO: Settings sem .two-col (layout 1 coluna?)');
    await page.screenshot({ path: path.join(OUT, '03-settings.png') });
    console.log('03-settings.png');
    await page.keyboard.press('Escape');
    await sleep(400);
  } else {
    console.log('AVISO: botão de Settings não encontrado; 03-settings.png ignorado');
  }

  await browser.close().catch(() => undefined)
  console.log('OK ->', OUT)
  process.exit(0)
})().catch((e) => {
  console.error('FALHOU:', e && e.message ? e.message : e)
  process.exit(1)
})