/* Requisition printing gate: disposable browsers; test PIN supplied at runtime. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium, launchOptions} = require('./browser.cjs');
const root = path.resolve(__dirname, '..');
const accessPin = process.env.PRINTING_TEST_PIN;
if (!accessPin) throw Error('Set PRINTING_TEST_PIN to run the printing gate checks.');
const incorrectPin = accessPin === '0'.repeat(accessPin.length) ? '1'.repeat(accessPin.length) : '0'.repeat(accessPin.length);
const tests = [];
const test = (name, run) => tests.push({name, run});
const instructions = page => page.locator('#officePrintingInstructions');
const pin = page => page.locator('#officePrintingPin');
const storage = page => page.evaluate(() => JSON.stringify([localStorage, sessionStorage].map(store =>
  Object.keys(store).sort().map(key => [key, store.getItem(key)]))));
const locked = async page => {
  assert.ok(await instructions(page).isHidden(), 'Instructions are hidden while locked');
  assert.ok(await instructions(page).evaluate(el => !el.textContent.trim() && !el.children.length), 'Locked instructions contain no decrypted content');
};
const unlock = async page => {
  await pin(page).fill(accessPin);
  await pin(page).press('Enter');
  await instructions(page).waitFor({state:'visible', timeout:20000});
};
const focusIs = (page, id) => page.evaluate(expected => document.activeElement?.id === expected, id);

test('Office starts locked and empty or incorrect PINs reveal no instructions', async page => {
  await locked(page);
  await pin(page).fill('');
  await pin(page).press('Enter');
  await locked(page);
  await pin(page).fill(incorrectPin);
  await pin(page).press('Enter');
  await page.locator('#officePrintingError').waitFor({state:'visible'});
  await locked(page);
  assert.ok(await focusIs(page, 'officePrintingPin'), 'Incorrect PIN returns focus to the PIN field');
});

test('Correct PIN reveals the complete instructions without persisting them', async page => {
  const before = await storage(page);
  await unlock(page);
  const complete = await instructions(page).evaluate(el => {
    const lists = [...el.querySelectorAll('ol')];
    const text = el.textContent;
    return lists.length === 2 && lists[0].querySelectorAll(':scope > li').length === 4 &&
      lists[1].querySelectorAll(':scope > li').length === 2 &&
      /Lakewood account/i.test(text) && /Microsoft Teams/i.test(text) &&
      /file that needs to be printed/i.test(text) && /PIN no longer works|PIN.*timed out/i.test(text) &&
      /Other User/i.test(text) && /Username/i.test(text) && /Password/i.test(text) &&
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text) &&
      el.querySelectorAll('code').length >= 3 && /contact Yaakov Bryks/i.test(text);
  });
  assert.ok(complete, 'Unlocked content includes printing, fallback sign-in, and contact instructions');
  assert.ok(await storage(page) === before, 'Unlocking leaves browser storage unchanged');
  assert.ok(await pin(page).inputValue() === '', 'The entered PIN is cleared after unlocking');
});

test('Lock clears decrypted content and restores PIN focus, and reload stays locked', async page => {
  const before = await storage(page);
  await unlock(page);
  await page.locator('#officePrintingLock').click();
  await locked(page);
  assert.ok(await focusIs(page, 'officePrintingPin'), 'Lock returns focus to the PIN field');
  assert.ok(await pin(page).inputValue() === '', 'Lock clears the PIN field');
  assert.ok(await storage(page) === before, 'Lock leaves browser storage unchanged');
  await unlock(page);
  await page.reload();
  await page.locator('#view-office').click();
  await locked(page);
  assert.ok(await pin(page).inputValue() === '', 'Reload does not restore the PIN');
});

test('Unlocked printing instructions fit desktop and 320px phone widths', async page => {
  await unlock(page);
  for (const width of [1280, 320]) {
    await page.setViewportSize({width, height:900});
    const fits = await page.evaluate(() => {
      const card = document.querySelector('.office-printing').getBoundingClientRect();
      return document.documentElement.scrollWidth <= innerWidth && card.left >= 0 && card.right <= innerWidth;
    });
    assert.ok(fits, 'Printing instructions fit the viewport at width ' + width);
    assert.ok(await page.locator('#officePrintingLock').isVisible(), 'Lock remains available at width ' + width);
  }
});

(async () => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, {'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store'});
    response.end(fs.readFileSync(path.join(root, 'index.html')));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port + '/';
  let browser, failed = 0;
  try {
    browser = await chromium.launch(launchOptions);
    for (const entry of tests) {
      const context = await browser.newContext(), errors = [];
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', () => errors.push(true));
      try {
        await page.goto(origin);
        await page.locator('.patient').first().waitFor();
        await page.locator('#view-office').click();
        await entry.run(page);
        assert.ok(errors.length === 0, 'Printing interactions have no browser JavaScript errors');
        console.log('PASS ' + entry.name);
      } catch {
        failed++;
        // Playwright diagnostics may contain the entered PIN or unlocked DOM.
        console.error('FAIL ' + entry.name + ' (sensitive browser diagnostics omitted)');
      } finally { await context.close(); }
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log((tests.length - failed) + '/' + tests.length + ' printing browser checks passed.');
  if (failed) process.exitCode = 1;
})().catch(() => { console.error('Printing browser checks could not run; verify browser setup.'); process.exitCode = 1; });
