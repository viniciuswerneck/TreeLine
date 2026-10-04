/**
 * E2E dos recursos novos da v0.6.1: LFS, Custom Actions (args + ANSI),
 * reorder de abas por drag-and-drop e editor de atalhos com conflitos.
 *
 * Uso:
 *   1. node scripts/make-fixture-repos.js   (cria /tmp/opencode/lfs-test)
 *   2. app rodando com --remote-debugging-port=9222
 *   3. node scripts/uitest-new.cjs
 * Não commita, não dá push e não deleta nada fora do userData do app.
 */
const { chromium } = require('playwright-core');

const LFS_REPO = process.env.LFS_REPO || '/tmp/opencode/lfs-test';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const pages = browser.contexts().flatMap((c) => c.pages());
  const page = pages.find((p) => (p.url() || '').startsWith('file://')) || pages[0];
  const results = [];
  const check = (name, ok, extra = '') => {
    const line = `${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`;
    results.push(line);
    console.log(line);
  };
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 160));
  });

  // --- LFS: abre o repo com .gitattributes de LFS ------------------------
  await page.evaluate(async (r) => {
    await window.treeline.addRecent(r)
  }, LFS_REPO);
  await page.reload();
  await page.waitForSelector('.sidebar-row', { timeout: 30000 });
  await sleep(1500);

  // Ancorado no titulo da secao: o nome do repo pode conter "lfs".
  const lfsRow = page.locator(
    "xpath=//div[contains(@class,'sidebar-section-title') and normalize-space(text())='Git LFS']/following-sibling::div[contains(@class,'sidebar-row')][1]"
  );
  check('sidebar mostra secao LFS', (await lfsRow.count()) > 0);
  if (await lfsRow.count()) {
    await lfsRow.click();
    await sleep(800);
    const dlg = page.locator('.modal, .dlg').first();
    const body = (await dlg.textContent()) || '';
    check('dialog LFS abre', /Git LFS/.test(body));
    check('dialog LFS lista *.bin', body.includes('*.bin'));
    check('dialog LFS lista *.psd', body.includes('*.psd'));
    check('avisa git-lfs ausente', /not found|não encontrado|no se encontró/i.test(body));
    const pullDisabled = await page.locator('.modal-actions .tool-btn', { hasText: /^Pull LFS$/ }).first().isDisabled().catch(() => true);
    check('pull desabilitado sem git-lfs', pullDisabled === true);
    await page.keyboard.press('Escape');
    await sleep(400);
    check('dialog LFS fecha (Esc)', (await page.locator('.modal').count()) === 0);
  }

  // --- Custom Actions: args + saida ANSI colorida ------------------------
  await page.keyboard.press('Control+k');
  await sleep(600);
  const paletteInput = page.locator('.palette input').first();
  await paletteInput.fill('Custom Actions');
  await sleep(500);
  await page.locator('.palette-item').filter({ hasText: 'Custom Actions' }).first().click();
  await sleep(900);
  check('dialog Custom Actions abre', /Custom Actions/i.test((await page.locator('.modal').first().textContent()) || ''));

  const nameInput = page.locator('.modal input').first();
  const cmdInput = page.locator('.modal input').nth(1);
  const argsInput = page.locator('.modal input').nth(2);
  check('campo de argumentos existe', (await argsInput.count()) > 0);
  await nameInput.fill('E2E ANSI');
  await cmdInput.fill('printf "\\033[31mERRO\\033[0m e \\033[32mOK\\033[0m"');
  await argsInput.fill('{{repo}}');
  const addBtn = page.locator('.modal-actions .tool-btn').filter({ hasText: /^(Add|Adicionar|Añadir|Add action)$/ }).first();
  await addBtn.click();
  await sleep(1200);

  const runBtn = page.locator('.mini-btn').filter({ hasText: /^Run$|^Executar$|^Ejecutar$/ }).first();
  check('acao aparece na lista', (await page.locator('.dlg-row', { hasText: 'E2E ANSI' }).count()) > 0);
  await runBtn.click();
  await sleep(1800);
  const spans = await page.locator('.modal pre span[style*="color"]').all();
  const colors = await page.locator('.modal pre span[style*="color"]').evaluateAll((els) => els.map((e) => e.getAttribute('style')));
  check('saida ANSI virou HTML colorido', spans.length >= 2, `${spans.length} spans: ${colors.join(' | ').slice(0, 120)}`);
  check('token {{repo}} nao aparece na saida', !/{{/.test((await page.locator('.modal pre').first().textContent()) || ''));
  await page.keyboard.press('Escape');
  await sleep(400);

// --- Atalhos: cria conflito, detecta e reseta ---------------------------
  await page.locator('.toolbar .tool-btn[title]').last().click().catch(() => undefined);
  await sleep(900);
  check('Settings abre', (await page.locator('.modal').count()) > 0);

  // Clica no atalho de "Busca" e aperta Ctrl+K (mesmo do palette) -> conflito.
  const shortcutRows = page.locator('.dlg-row').filter({ has: page.locator('.mini-btn.mono') });
  const rowCount = await shortcutRows.count();
  const searchRow = shortcutRows.nth(rowCount - 2); // penultima = search (terminal e a ultima)
  await searchRow.locator('.mini-btn').first().click();
  await sleep(300);
  await page.keyboard.press('Control+k');
  await sleep(700);
  const conflictWarn = page.locator('.warning');
  check(
    'editor detecta atalho em conflito',
    (await conflictWarn.count()) > 0,
    ((await conflictWarn.first().textContent().catch(() => '')) || '').trim()
  );
  check('linhas em conflito ficam marcadas', (await page.locator('.dlg-row.row-conflict').count()) >= 2);

  // Reset por linha devolve ao padrao e o aviso some.
  await searchRow.locator('.mini-btn').nth(1).click();
  await sleep(600);
  check('reset por linha remove o conflito', (await page.locator('.warning').count()) === 0);
  const filterBox = page.locator('.modal input[placeholder]').last();
  await filterBox.fill('zzz-sem-correspondencia').catch(() => undefined);
  await sleep(400);
  check(
    'filtro sem resultado mostra aviso',
    /No action matches|Nenhuma ação|Ninguna acción/i.test((await page.locator('.modal').textContent()) || '')
  );
  await page.keyboard.press('Escape');
  await sleep(400);

  // --- Abas: drag-and-drop reordena --------------------------------------
  await page.evaluate(async (r) => {
    await window.treeline.addRecent(r)
  }, '/tmp/opencode/stress-10k');
  await page.reload();
  await page.waitForSelector('.tab', { timeout: 30000 });
  await sleep(1200);
  const before = await page.locator('.tab .tab-name').allTextContents();
  if (before.length >= 2) {
    // dispatch com awaits: o drop precisa chegar depois do dragstart (React commit).
    await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('.tab')]
      window.__dt = new DataTransfer()
    })
    await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('.tab')]
      tabs[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: window.__dt }))
    })
    await sleep(250)
    await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('.tab')]
      tabs[1].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: window.__dt }))
    })
    await sleep(250)
    await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('.tab')]
      tabs[1].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: window.__dt }))
      tabs[0].dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: window.__dt }))
    })
    await sleep(600)
    const after = await page.locator('.tab .tab-name').allTextContents()
    check(
      'drag-and-drop reordena abas',
      JSON.stringify(before) !== JSON.stringify(after),
      `${before.join(',')} -> ${after.join(',')}`
    )
    // Persistência: a ordem deve voltar igual após reload.
    await page.reload()
    await page.waitForSelector('.tab', { timeout: 30000 })
    await sleep(1000)
    const persisted = await page.locator('.tab .tab-name').allTextContents()
    check('ordem das abas persiste', JSON.stringify(persisted) === JSON.stringify(after), persisted.join(','))
  } else {
    check('drag-and-drop reordena abas', false, 'menos de 2 abas')
  }

  console.log('--- E2E v0.6.1 ---')
  for (const r of results) console.log(r)
  const failed = results.filter((r) => r.startsWith('FAIL')).length
  console.log(`\n${results.length - failed}/${results.length} PASS`)
  if (errors.length) {
    console.log('\n--- ERROS JS ---')
    for (const e of errors.slice(0, 6)) console.log(e)
  }
  await browser.close().catch(() => undefined)
  process.exit(failed ? 1 : 0)
})().catch((e) => {
  console.error('FALHOU:', e && e.message ? e.message : e)
  process.exit(1)
})