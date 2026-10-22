/* Message preview: disposable browsers, synthetic patients and clipboard stub. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Hillel/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const checks = [];
const test = (name, run, options = {}) => checks.push({ name, run, ...options });
const patient = (page, n = 0) => page.locator('.patient').nth(n);
const local = (page, id, n = 0) => patient(page, n).locator('[data-local-id="' + id + '"]');
const rail = (page, n = 0) => patient(page, n).locator('.message-rail');
const nextFrame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function seed(page, name, n = 0) {
  await local(page, 'f_name', n).fill(name);
  await local(page, 'f_dob', n).fill('01/01/2000');
  await local(page, 'f_inspic', n).check();
  await local(page, 'f_symptoms', n).fill(name + ' symptoms');
}
async function geometry(page, n = 0) {
  return patient(page, n).evaluate(el => {
    const rect = node => { const r = node.getBoundingClientRect(); return { top:r.top, bottom:r.bottom, left:r.left, right:r.right, width:r.width, height:r.height }; };
    return { main:rect(el.querySelector('.visit-main')), rail:rect(el.querySelector('.message-rail')), output:rect(el.querySelector('[data-local-id="output"]')), actions:rect(el.querySelector('.message-rail .actions')), viewport:{ top:visualViewport.offsetTop, height:visualViewport.height }, pageWidth:document.documentElement.scrollWidth, width:innerWidth };
  });
}
function visibleRail(g, label) {
  assert.ok(g.rail.top >= g.viewport.top - 1, label + ': rail top ' + JSON.stringify(g));
  assert.ok(g.rail.bottom <= g.viewport.top + g.viewport.height + 1, label + ': rail bottom ' + JSON.stringify(g));
  assert.ok(g.output.height >= 40, label + ': readable preview');
  assert.ok(g.actions.top >= g.rail.top && g.actions.bottom <= g.rail.bottom + 1, label + ': copy controls fit');
}

test('Preview remains beside the form and follows scrolling at tablet and desktop widths', async page => {
  await seed(page, 'SYNTHETIC SIDE RAIL');
  for (const width of [768, 810, 1024, 1280]) {
    await page.setViewportSize({ width, height:1000 });
    await local(page, 'f_symptoms').evaluate(el => el.scrollIntoView({ block:'start' }));
    await nextFrame(page);
    const g = await geometry(page);
    assert.ok(g.rail.left >= g.main.right - 1, width + ': side-by-side ' + JSON.stringify(g));
    const tabs = await patient(page).locator('.tabs').boundingBox();
    assert.ok(tabs.x + tabs.width <= g.rail.left, width + ': sticky tabs cannot cover the preview');
    assert.ok(g.pageWidth <= width, width + ': no horizontal overflow');
    visibleRail(g, String(width));
    await local(page, 'f_notes').evaluate(el => el.scrollIntoView({ block:'center' }));
    await nextFrame(page);
    visibleRail(await geometry(page), width + ' at last notes');
  }
});

test('Live output and copy payload stay exact after moving the preview', async page => {
  await seed(page, 'SYNTHETIC COPY');
  await local(page, 'f_notes').fill('Synthetic note for the side preview.');
  const expected = await local(page, 'output').inputValue();
  assert.match(expected, /Synthetic note for the side preview\./);
  await local(page, 'copyBtn').click();
  const warning = page.getByRole('button', { name:'Copy anyway', exact:true });
  if (await warning.isVisible()) await warning.click();
  await page.waitForFunction(() => window.__copies.length > 0);
  assert.equal(await page.evaluate(() => window.__copies.at(-1)), expected);
  assert.equal(await local(page, 'output').count(), 1);
  await local(page, 'tab-check').click();
  assert.equal(await local(page, 'output').isVisible(), true);
  assert.equal(await local(page, 'output').inputValue(), expected);
  await local(page, 'tab-visit').click();
  assert.equal(await local(page, 'output').inputValue(), expected);
});

test('Patient previews remain separate through adding, collapsing and changing houses', async page => {
  await seed(page, 'SYNTHETIC ALPHA');
  const first = await local(page, 'output').inputValue();
  await page.locator('#appendPatient').click();
  await seed(page, 'SYNTHETIC BETA', 1);
  assert.match(await local(page, 'output', 1).inputValue(), /SYNTHETIC BETA/);
  assert.doesNotMatch(await local(page, 'output', 1).inputValue(), /SYNTHETIC ALPHA/);
  assert.equal(await local(page, 'output').inputValue(), first);
  await local(page, 'collapseBtn', 1).click();
  assert.equal(await rail(page, 1).isVisible(), false);
  await local(page, 'collapseBtn', 1).click();
  await rail(page, 1).waitFor({ state:'visible' });
  assert.equal(await rail(page, 1).isVisible(), true);
  await local(page, 'nextHouseBtn', 1).click();
  assert.equal(await rail(page).isVisible(), false);
  assert.equal(await rail(page, 1).isVisible(), false);
  await rail(page, 2).waitFor({ state:'visible' });
  assert.equal(await rail(page, 2).isVisible(), true);
  assert.equal(await local(page, 'output', 2).inputValue(), '');
});

test('Keyboard resize and visual viewport panning keep the preview and copy controls visible', async page => {
  await seed(page, 'SYNTHETIC KEYBOARD');
  await local(page, 'f_notes').fill(Array.from({ length:35 }, (_, i) => 'Synthetic note line ' + (i + 1)).join('\n'));
  await local(page, 'f_notes').focus();
  await local(page, 'f_symptoms').evaluate(el => el.scrollIntoView({ block:'start' }));
  const layoutHeight = await page.evaluate(() => innerHeight);
  await page.evaluate(() => { Object.assign(window.__viewport, { height:350, offsetTop:180 }); window.__viewport.dispatchEvent(new Event('resize')); });
  await nextFrame(page);
  assert.equal(await page.evaluate(() => innerHeight), layoutHeight, 'Layout viewport remains unchanged as on iOS');
  visibleRail(await geometry(page), 'open keyboard');
  await page.evaluate(() => { window.__viewport.offsetTop = 250; window.__viewport.dispatchEvent(new Event('scroll')); });
  await nextFrame(page);
  visibleRail(await geometry(page), 'panned keyboard');
  assert.ok(await local(page, 'output').evaluate(el => el.scrollHeight > el.clientHeight), 'Long message scrolls inside the box');
  await local(page, 'output').evaluate(el => { el.scrollTop = el.scrollHeight; });
  assert.ok(await local(page, 'output').evaluate(el => el.scrollTop > 0));
  await page.screenshot({ path:path.join(__dirname, 'message-keyboard-810.png') });
  // A mocked VisualViewport does not change Chromium's document scroll range.
  // Supply the extra range a mobile keyboard provides, then reproduce its
  // automatic pan that brings the final textarea into the visible region.
  await page.evaluate(() => { document.body.style.paddingBottom = '730px'; });
  await local(page, 'f_notes').focus();
  await local(page, 'f_notes').evaluate(el => {
    const r = el.getBoundingClientRect();
    scrollBy(0, r.top + r.height / 2 - (visualViewport.offsetTop + visualViewport.height / 2));
  });
  await nextFrame(page);
  const finalField = await geometry(page);
  const notes = await local(page, 'f_notes').boundingBox();
  assert.ok(notes.y >= finalField.viewport.top && notes.y + notes.height <= finalField.viewport.top + finalField.viewport.height, 'Last notes textarea is inside the visible viewport');
  console.log('Last notes with keyboard: ' + JSON.stringify(finalField));
  await page.screenshot({ path:path.join(__dirname, 'message-keyboard-notes-810.png') });
  visibleRail(finalField, 'last notes with panned keyboard');
  await page.evaluate(() => { document.body.style.paddingBottom = ''; Object.assign(window.__viewport, { height:1080, offsetTop:0 }); window.__viewport.dispatchEvent(new Event('resize')); window.__viewport.dispatchEvent(new Event('scroll')); });
  await nextFrame(page);
  visibleRail(await geometry(page), 'closed keyboard');
}, { keyboard:true });

test('Phone layouts stack the preview without horizontal clipping', async page => {
  await seed(page, 'SYNTHETIC PHONE');
  await local(page, 'f_notes').fill('Synthetic long-word check ' + 'abcdefghij'.repeat(30));
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height:844 });
    const g = await geometry(page);
    assert.ok(g.rail.top >= g.main.bottom - 1, width + ': preview follows form');
    assert.ok(g.pageWidth <= width, width + ': no page overflow');
    assert.equal(await rail(page).evaluate(el => getComputedStyle(el).position), 'static');
    await local(page, 'copyBtn').scrollIntoViewIfNeeded();
    assert.equal(await local(page, 'copyBtn').isVisible(), true);
  }
});

(async () => {
  const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store' }); res.end(fs.readFileSync(path.join(root, 'index.html'))); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch({ headless:true, executablePath:process.env.PLAYWRIGHT_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  let failed = 0;
  const selected = checks.filter(t => !process.env.TEST_FILTER || t.name.includes(process.env.TEST_FILTER));
  try {
    for (const t of selected) {
      const context = await browser.newContext({ serviceWorkers:'block', viewport:{ width:t.keyboard ? 810 : 1280, height:t.keyboard ? 1080 : 1000 } });
      await context.route('**/*', route => route.request().url().startsWith(url) ? route.continue() : route.abort());
      await context.addInitScript(() => { window.__copies = []; Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{ writeText:text => { window.__copies.push(text); return Promise.resolve(); } } }); });
      if (t.keyboard) await context.addInitScript(() => { const viewport = new EventTarget(); Object.assign(viewport, { width:innerWidth, height:innerHeight, offsetTop:0, offsetLeft:0, scale:1 }); Object.defineProperty(window, 'visualViewport', { configurable:true, value:viewport }); window.__viewport = viewport; });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(10000);
      try { await page.goto(url); await t.run(page); assert.deepEqual(errors, []); console.log('PASS ' + t.name); }
      catch (error) { failed++; console.error('FAIL ' + t.name + '\n' + error.stack); }
      finally { await context.close(); }
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
  console.log((selected.length - failed) + '/' + selected.length + ' message-rail checks passed.');
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
