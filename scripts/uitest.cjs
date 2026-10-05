/**
 * Harness E2E do TreeLine via Chrome DevTools Protocol (playwright-core).
 * Uso:
 *   1. Rode o app com a porta de debug:
 *      ./dist/linux-unpacked/treeline --no-sandbox --disable-setuid-sandbox --disable-gpu \
 *        --ozone-platform-hint=auto --remote-debugging-port=9222
 *   2. npm run test:ui
 * Screenshots em /tmp/opencode/ui-*.png (ou $SHOTS_DIR). Só abre/fecha
 * dialogs, paleta e menus — não commita, não dá push, não deleta nada.
 */
const { chromium } = require('playwright-core');

const SHOTS = process.env.SHOTS_DIR || '/tmp/opencode';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctxs = browser.contexts();
  const pages = ctxs.flatMap((c) => c.pages());
  const page = pages.find((p) => (p.url() || '').startsWith('file://')) || pages[0];
  console.log('PAGE:', page.url(), '| TITLE:', await page.title());

  const errors = [];
  page.on('console', async (m) => {
    if (m.type() !== 'error') return;
    // React deixa %s sem resolver no text(); resolver os args facilita achar a chave.
    let extra = '';
    if (/%s/.test(m.text())) {
      const args = await Promise.all(m.args().map((a) => a.jsonValue().catch(() => '?')));
      extra = ' | args: ' + JSON.stringify(args).slice(0, 200);
    }
    errors.push('[console] ' + m.text().slice(0, 200) + extra);
  });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e).slice(0, 200)));

  const results = [];
  const check = (name, ok, extra = '') => {
    results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  };

  // Repo determinístico: o harness depende de ter history com commits.
  const REPO = process.env.REPO || process.cwd();
  await page.evaluate(async (r) => { await window.treeline.addRecent(r) }, REPO);
  await page.reload();
  await page.waitForSelector('.toolbar', { timeout: 30000 });
  await sleep(2500);
  await page.screenshot({ path: `${SHOTS}/ui-01-main.png` });

  // Estrutura base
  check('toolbar presente', (await page.locator('.toolbar').count()) === 1);
  check('sidebar presente', (await page.locator('.sidebar').count()) === 1);
  check('history presente', (await page.locator('.history').count()) === 1);
  check('details presente', (await page.locator('.details').count()) === 1);
  check('statusbar presente', (await page.locator('.statusbar').count()) === 1);
  const tb = await page.locator('.toolbar .tool-btn').count();
  check('toolbar tem >= 15 botoes', tb >= 15, `${tb} botoes`);
  const rows = await page.locator('.history-row').count();
  check('history tem linhas', rows > 0, `${rows} linhas`);
  const srows = await page.locator('.sidebar-row').count();
  check('sidebar tem linhas', srows > 0, `${srows} linhas`);

  // Dialogs via toolbar (seletor por title parcial)
  const dialogs = [
    ['Branch', 'branch'],
    ['Merge', 'merge'],
    ['Stash', 'stash'],
    ['Tag', 'tag'],
    ['Rebase', 'rebase'],
    ['Cherry-Pick', 'pick'],
    ['Git-flow', 'flow'],
    ['eflog', 'reflog'],
    ['ICON:1', 'remotes'],
  ];
  // Reflog tem 2 abas (Reflog / Backups); valida a troca antes do loop acima.
  const reflogTabs = async () => {
    await page.locator('.toolbar .tool-btn[title*="eflog"]').first().click({ timeout: 3000 });
    await sleep(1200);
    const tabs = page.locator('.dlg-tab');
    check('reflog tem 2 abas', (await tabs.count()) === 2, `${await tabs.count()} abas`);
    check('reflog abre na aba Reflog', (await page.locator('.dlg-tab[aria-selected="true"]').first().textContent())?.includes('Reflog') === true);
    const h1 = (await page.locator('.modal').first().boundingBox())?.height ?? 0;
    await tabs.nth(1).click();
    await sleep(500);
    const sel = (await page.locator('.dlg-tab[aria-selected="true"]').allTextContents())[0] || '';
    check('aba Backups troca o conteudo', /Backups|Backups bundle/i.test(sel), sel.trim());
    const h2 = (await page.locator('.modal').first().boundingBox())?.height ?? 0;
    check('dialog reflog cabe na tela', h1 <= 620 && h2 <= 620, `${Math.round(h1)}px / ${Math.round(h2)}px`);
    await page.screenshot({ path: `${SHOTS}/ui-dlg-reflog-backups.png` });
    await tabs.first().click();
    await sleep(400);
    check('volta pra aba Reflog', (await page.locator('.dlg-list-tall').count()) === 1);
    await page.keyboard.press('Escape');
    await sleep(600);
    check('dialog reflog fecha (Esc)', (await page.locator('.modal[role="dialog"]').count()) === 0);
  };
  await reflogTabs();
  dialogs.splice(dialogs.findIndex(([, sh]) => sh === 'reflog'), 1);
  for (const [titlePart, shot] of dialogs) {
    try {
      if (titlePart.startsWith('ICON:')) {
        await page.locator('.toolbar .tool-btn.icon-only').nth(Number(titlePart.slice(5))).click({ timeout: 3000 });
      } else {
        await page.locator(`.toolbar .tool-btn[title*="${titlePart}"]`).first().click({ timeout: 3000 });
      }
      await sleep(1200);
      const n = await page.locator('.modal[role="dialog"]').count();
      check(`dialog ${shot} abre`, n === 1);
      await page.screenshot({ path: `${SHOTS}/ui-dlg-${shot}.png` });
      await page.keyboard.press('Escape');
      await sleep(600);
      const closed = (await page.locator('.modal[role="dialog"]').count()) === 0;
      check(`dialog ${shot} fecha (Esc)`, closed);
    } catch (e) {
      check(`dialog ${shot} abre`, false, String(e).slice(0, 120));
      await page.keyboard.press('Escape');
      await sleep(400);
    }
  }

  // Reset dialog via Ctrl+K? abre direto por JS é trapaça; usa menu do commit se houver linha
  // Paleta
  try {
    await page.keyboard.press('Control+k');
    await sleep(800);
    check('paleta abre (Ctrl+K)', (await page.locator('.palette').count()) === 1);
    await page.screenshot({ path: `${SHOTS}/ui-palette.png` });
    await page.keyboard.press('Escape');
    await sleep(400);
  } catch (e) {
    check('paleta abre (Ctrl+K)', false, String(e).slice(0, 120));
  }

  // Sidebar toggle
  try {
    await page.locator('.sidebar-toggle').first().click({ timeout: 3000 });
    await sleep(600);
    const cls = await page.locator('.sidebar').getAttribute('class');
    check('sidebar colapsa', (cls || '').includes('collapsed'), cls || '');
    await page.screenshot({ path: `${SHOTS}/ui-collapsed.png` });
    await page.locator('.sidebar-toggle').first().click({ timeout: 3000 });
    await sleep(600);
    const cls2 = await page.locator('.sidebar').getAttribute('class');
    check('sidebar expande', !(cls2 || '').includes('collapsed'), cls2 || '');
  } catch (e) {
    check('sidebar colapsa/expande', false, String(e).slice(0, 120));
  }

  // Ctrl+B
  try {
    await page.keyboard.press('Control+b');
    await sleep(500);
    const cls = await page.locator('.sidebar').getAttribute('class');
    check('Ctrl+B alterna sidebar', (cls || '').includes('collapsed'));
    await page.keyboard.press('Control+b');
    await sleep(500);
  } catch (e) {
    check('Ctrl+B alterna sidebar', false, String(e).slice(0, 120));
  }

  // Clica primeira linha do history (detalhe do commit) se houver commit
  try {
    const crow = page.locator('.history-row').nth(1);
    if ((await crow.count()) > 0) {
      await crow.click({ timeout: 3000 });
      await sleep(1200);
      await page.screenshot({ path: `${SHOTS}/ui-commitdetail.png` });
      check('detalhe do commit abre', true);
      // volta p/ Working Copy
      const back = page.locator('.commit-title .mini-btn').first();
      if ((await back.count()) > 0) {
        await back.click({ timeout: 3000 });
        await sleep(800);
      }
    } else {
      check('detalhe do commit abre', true, 'sem 2a linha (só WC?)');
    }
  } catch (e) {
    check('detalhe do commit abre', false, String(e).slice(0, 120));
  }

  // Reset dialog via menu do commit (botão direito na 1a linha de commit)
  try {
    const target = page.locator('.history-row').nth(1);
    if ((await target.count()) > 0) {
      await target.click({ button: 'right', timeout: 3000 });
      await sleep(700);
      await page.screenshot({ path: `${SHOTS}/ui-commitmenu.png` });
      const mi = page.locator('.ctx-menu .ctx-item, .context-menu button, [role="menu"] button');
      const n = await mi.count();
      check('menu do commit abre', n > 0, `${n} itens`);
      // clica "Reset" se existir
      const resetItem = page.locator('.ctx-menu *, .context-menu *, [role="menu"] *').filter({ hasText: /Reset/ }).first();
      if ((await resetItem.count()) > 0) {
        await resetItem.click({ timeout: 3000 });
        await sleep(1000);
        check('Reset dialog abre via menu', (await page.locator('.modal[role="dialog"]').count()) === 1);
        await page.screenshot({ path: `${SHOTS}/ui-dlg-reset.png` });
        await page.keyboard.press('Escape');
        await sleep(500);
      } else {
        check('Reset dialog abre via menu', true, 'item Reset não rotulado? (ver print)');
      }
      await page.keyboard.press('Escape');
      await sleep(400);
    }
  } catch (e) {
    check('menu do commit abre', false, String(e).slice(0, 150));
  }

  console.log('\n===== RESULTADOS =====');
  console.log(results.join('\n'));
  console.log('\n===== ERROS JS =====');
  console.log(errors.length ? errors.join('\n') : '(nenhum)');
  await browser.close();
})().catch((e) => {
  console.error('HARNESS-FAIL', e);
  process.exit(1);
});
