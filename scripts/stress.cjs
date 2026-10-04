/**
 * Stress test da virtualização do HistoryGraph com 10k+ commits.
 * Uso:
 *   1. node scripts/make-stress-repo.js 10000
 *   2. ./dist/linux-unpacked/treeline --no-sandbox --disable-setuid-sandbox \
 *        --disable-gpu --ozone-platform-hint=auto --remote-debugging-port=9222
 *   3. node scripts/stress.cjs /tmp/opencode/stress-10k
 * Reporta: total de commits carregados, linhas no DOM, FPS durante scroll
 * e tempo de abertura. Não altera nada no repo.
 */
const { chromium } = require('playwright-core');

const REPO = process.argv[2] || '/tmp/opencode/stress-10k';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const pages = browser.contexts().flatMap((c) => c.pages());
  const page = pages.find((p) => (p.url() || '').startsWith('file://')) || pages[0];

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

  const t0 = Date.now();
  await page.evaluate(async (r) => {
    await window.treeline.addRecent(r)
  }, REPO);
  await page.reload();
  await page.waitForSelector('.history-row', { timeout: 60000 });
  const firstPaint = Date.now() - t0;

  const count = async () => {
    const el = page.locator('.history-count').first();
    const txt = (await el.textContent()) || '';
    const m = /([\d.]+)\s*(k|m)?/i.exec(txt.replace(/[^\d.,]/g, ' '));
    return txt.trim();
  };

  // Carrega todas as páginas: scroll até o fim até a contagem estabilizar.
  let prev = '';
  let stable = 0;
  for (let i = 0; i < 60 && stable < 3; i++) {
    await page.evaluate(() => {
      const h = document.querySelector('.history');
      if (h) h.scrollTop = h.scrollHeight
    });
    await sleep(500);
    const now = await count();
    stable = now === prev ? stable + 1 : 0;
    prev = now;
  }
  const total = prev;
  const rowsLoaded = await page.locator('.history-row').count();
  const allTime = Date.now() - t0;

  // FPS: rola para cima em passos e mede frames por segundo.
  const fps = await page.evaluate(async () => {
    const h = document.querySelector('.history');
    if (!h) return 0;
    h.scrollTop = h.scrollHeight;
    let frames = 0;
    let running = true;
    const tick = () => {
      if (!running) return;
      frames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const start = performance.now();
    for (let i = 0; i < 60; i++) {
      h.scrollTop = Math.max(0, h.scrollTop - 400);
      await new Promise((r) => requestAnimationFrame(r));
    }
    const elapsed = performance.now() - start;
    running = false;
    return Math.round((frames / elapsed) * 1000);
  });
  const domRows = await page.locator('.history-row').count();
  const height = await page.evaluate(() => {
    const h = document.querySelector('.history');
    return h ? Math.round(h.scrollHeight) : 0;
  });

  console.log('--- STRESS 10k ---');
  console.log('primeiras linhas:', `${(firstPaint / 1000).toFixed(1)}s`);
  console.log('total carregado:', total);
  console.log('tempo total:', `${(allTime / 1000).toFixed(1)}s`);
  console.log('scrollHeight:', `${height}px`);
  console.log('linhas no DOM (fim):', domRows, `(antes: ${rowsLoaded})`);
  console.log('FPS scroll:', fps);
  if (errors.length) console.log('erros:', errors.slice(0, 3));
  console.log(domRows > 0 && domRows < 400 && fps >= 45 ? 'RESULTADO: OK' : 'RESULTADO: ATENÇÃO');

  await browser.close().catch(() => undefined);
  process.exit(0);
})().catch((e) => {
  console.error('FALHOU:', e && e.message ? e.message : e);
  process.exit(1);
});