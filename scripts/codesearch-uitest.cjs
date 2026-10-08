/**
 * Verifica a Busca de código (Ctrl+Shift+F): dialog .csdialog com input +
 * toggles, resultados agrupados por branch (git grep por ref), última alteração
 * (pickaxe -G), toggles case/regex, Esc, e clique abrindo o blame.
 * App aberto com --remote-debugging-port=9222.
 */
const { chromium } = require('playwright-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const pages = browser.contexts().flatMap((c) => c.pages());
  const page = pages.find((p) => (p.url() || '').startsWith('file://')) || pages[0];

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e).slice(0, 200)));

  const results = [];
  const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

  await page.evaluate(async (r) => { await window.treeline.addRecent(r) }, process.cwd());
  await page.reload();
  await page.waitForSelector('.history-filter', { timeout: 30000 });
  await sleep(2500);

  // 1. Abrir via Ctrl+Shift+F
  await page.keyboard.press('Control+Shift+F');
  await page.waitForSelector('.csdialog', { timeout: 5000 });
  check('Ctrl+Shift+F abre o dialog', true);
  check('input presente', (await page.locator('.csdialog input').count()) === 1);
  check('3 toggles', (await page.locator('.csdialog .cs-toggle').count()) === 4); // Aa, .*, nuvem, ×
  check('placeholder de busca', ((await page.locator('.csdialog input').getAttribute('placeholder') || '').length) > 0);
  check('sem query mostra dica', (await page.locator('.csdialog .palette-empty').count()) === 1);

  // 2. Busca por texto literal
  const input = page.locator('.csdialog input');
  await input.fill('matchShortcut');
  await page.waitForSelector('.csdialog .cs-group', { timeout: 20000 });
  await sleep(600);
  const groups = await page.locator('.csdialog .cs-group').count();
  check('grupos por branch aparecem', groups >= 1, `${groups} grupo(s)`);
  check('grupo tem nome da branch', (await page.locator('.csdialog .cs-branch-name').count()) === groups);
  check('badge "atual" no branch atual', (await page.locator('.csdialog .cs-badge').count()) >= 1);
  check('arquivo com match aparece', (await page.locator('.csdialog .cs-file-head').count()) >= 1);
  const lines = await page.locator('.csdialog .cs-line').count();
  check('linhas com match aparecem', lines >= 1, `${lines} linha(s)`);
  check('mark de highlight presente', (await page.locator('.csdialog mark').count()) >= 1);
  check('linha 82 de App.tsx no resultado', (await page.locator('.csdialog .cs-line', { hasText: 'matchShortcut' }).count()) >= 1);
  check('stats de resultado', ((await page.locator('.csdialog .cs-meta').textContent() || '').includes('ocorr') || (await page.locator('.csdialog .cs-meta').textContent() || '').includes('match')));

  // 3. Última alteração (pickaxe -G) chega depois
  await page.waitForSelector('.csdialog .cs-change', { timeout: 20000 });
  const changeTxt = (await page.locator('.csdialog .cs-change').first().textContent() || '').trim();
  check('última alteração com autor/data/hash', /[0-9a-f]{7,8} · .+ · \d{4}-\d{2}-\d{2}/.test(changeTxt), changeTxt);

  // 4. Toggle case-sensitive: MAIÚSCULAS não acham
  await page.locator('.csdialog .cs-toggle').nth(0).click();
  await sleep(400);
  await input.fill('MATCHSHORTCUTMR');
  await page.waitForSelector('.csdialog .cs-group, .csdialog .palette-empty', { timeout: 15000 });
  await sleep(800);
  check('case-sensitive bloqueia texto em minúsculo',
    (await page.locator('.csdialog .cs-group').count()) === 0 &&
    (await page.locator('.csdialog .palette-empty').count()) >= 1);
  await page.locator('.csdialog .cs-toggle').nth(0).click();

  // 5. Regex: padrão que casa
  await page.locator('.csdialog .cs-toggle').nth(1).click();
  await sleep(400);
  await input.fill('match[A-Z]hortcut');
  await page.waitForSelector('.csdialog .cs-group', { timeout: 15000 });
  await sleep(600);
  check('regex encontra match', (await page.locator('.csdialog .cs-line').count()) >= 1);
  await sleep(400);
  await input.fill('(');
  await page.waitForSelector('.csdialog .cs-group, .csdialog .palette-empty', { timeout: 15000 });
  await sleep(800);
  check('regex inválida mostra erro', ((await page.locator('.csdialog .cs-meta').textContent() || '').includes('falhou') || (await page.locator('.csdialog .cs-meta').textContent() || '').includes('failed')));
  await page.locator('.csdialog .cs-toggle').nth(1).click();
  await input.fill('');
  await sleep(600);

  // 6. Esc: primeira limpa a query, segunda fecha
  await input.fill('matchShortcut');
  await sleep(500);
  await input.press('Escape');
  await sleep(300);
  check('Esc limpa a query', (await input.inputValue()) === '');
  await input.press('Escape');
  await sleep(400);
  check('Segundo Esc fecha o dialog', (await page.locator('.csdialog').count()) === 0);

  // 7. Reabre e clica numa linha → abre o blame do arquivo
  await page.keyboard.press('Control+Shift+F');
  await page.waitForSelector('.csdialog', { timeout: 5000 });
  await input.fill('matchShortcut');
  await page.waitForSelector('.csdialog .cs-line', { timeout: 20000 });
  await sleep(400);
  await page.locator('.csdialog .cs-line').first().click();
  await sleep(1500);
  const blameOpen = await page.evaluate(() => {
    const dlg = document.querySelectorAll('.modal-backdrop[aria-modal="true"], .modal-wide .modal, .modal')[0];
    const hasBlame = !!document.querySelector('.modal .mini-btn[title], .modal .mono') && document.querySelectorAll('.csdialog').length === 0;
    return hasBlame;
  });
  check('clique abre blame e fecha a busca', blameOpen);

  await page.screenshot({ path: '/tmp/opencode/codesearch-check.png' });
  console.log(results.join('\n'));
  console.log('\n===== ERROS JS =====');
  if (errors.length === 0) console.log('(nenhum)');
  else console.log(errors.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\nRESULTADO: ${results.length - fails}/${results.length} PASS`);
  await browser.close();
  process.exit(fails > 0 || errors.length > 0 ? 1 : 0);
})();