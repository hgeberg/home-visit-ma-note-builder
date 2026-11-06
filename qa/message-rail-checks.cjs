/* Message preview: disposable browsers, synthetic patients and clipboard stub. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium, launchOptions} = require('./browser.cjs');
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
    return { main:rect(el.querySelector('.visit-main')), rail:rect(el.querySelector('.message-rail')), output:rect(el.querySelector('[data-local-id="output"]')), actions:rect(el.querySelector('.message-rail .actions')), newHouse:rect(el.querySelector('[data-local-id="messageNewHouseBtn"]')), viewport:{ top:visualViewport.offsetTop, height:visualViewport.height }, pageWidth:document.documentElement.scrollWidth, width:innerWidth };
  });
}
function visibleRail(g, label) {
  assert.ok(g.rail.top >= g.viewport.top - 1, label + ': rail top ' + JSON.stringify(g));
  assert.ok(g.rail.bottom <= g.viewport.top + g.viewport.height + 1, label + ': rail bottom ' + JSON.stringify(g));
  assert.ok(g.output.height >= 40, label + ': readable preview');
  assert.ok(g.actions.top >= g.rail.top && g.actions.bottom <= g.rail.bottom + 1, label + ': copy controls fit');
  assert.ok(g.output.bottom <= g.actions.top + 1, label + ': message does not overlap the actions');
  assert.ok(g.newHouse.height >= 40 && g.newHouse.top >= g.output.bottom && g.newHouse.bottom <= g.rail.bottom + 1, label + ': New house fits below the message');
}
async function reachable(button, label, viewport) {
  const box = await button.boundingBox();
  assert.ok(box && box.height >= 40, label + ': usable button');
  assert.ok(box.y >= viewport.top - 1 && box.y + box.height <= viewport.top + viewport.height + 1, label + ': button stays in the visible viewport');
  assert.equal(await button.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); }), true, label + ': button is unobstructed');
}
async function reachableRail(page, label) {
  const g = await geometry(page);
  visibleRail(g, label);
  const boxes = [];
  for(const id of ['newBtn', 'selectBtn', 'copyBtn', 'messageNewHouseBtn']) {
    await reachable(local(page, id), label + ' ' + id, g.viewport);
    boxes.push(await local(page, id).boundingBox());
  }
  for(let i=0; i<boxes.length; i++) for(let j=i+1; j<boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    assert.ok(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x) <= 1 || Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y) <= 1, label + ': action buttons do not overlap');
  }
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
  const warning = page.getByRole('button', { name:/^Copy anyways?$/ });
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

test('Message New house remains reachable through the last page position and preserves earlier patients', async page => {
  await seed(page, 'SYNTHETIC FIRST HOUSE');
  await local(page, 'tab-check').click();await local(page, 'f_k_confirm').check();await local(page, 'tab-visit').click();
  await page.locator('#appendPatient').click();await seed(page, 'SYNTHETIC SAME HOUSE', 1);
  for(const width of [768, 810, 1280]) {
    await page.setViewportSize({ width, height:700 });
    for(const position of ['middle', 'bottom']) {
      if(position === 'middle') await local(page, 'f_symptoms', 1).evaluate(el => el.scrollIntoView({ block:'center' }));
      else await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      await nextFrame(page);
      const g = await geometry(page, 1);
      await reachable(local(page, 'messageNewHouseBtn', 1), width + ' at ' + position, g.viewport);
      assert.ok(g.newHouse.top >= g.output.bottom, 'New house follows the Teams message');
    }
  }
  await local(page, 'messageNewHouseBtn', 1).click();
  assert.equal(await page.locator('#houseHeading').innerText(), 'House 2');
  assert.equal(await page.locator('.patient:visible').count(), 1);
  assert.equal(await local(page, 'f_name', 2).inputValue(), '');
  assert.equal(await local(page, 'output', 2).inputValue(), '');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'houseHeading');
  await page.locator('#patientNavSummary').click();
  await page.locator('#patientJumps').getByRole('button', { name:'1. SYNTHETIC FIRST HOUSE', exact:true }).click();
  assert.equal(await page.locator('.patient:visible').count(), 2);
  assert.equal(await local(page, 'f_symptoms', 1).inputValue(), 'SYNTHETIC SAME HOUSE symptoms');
  await local(page, 'tab-check').click();assert.equal(await local(page, 'f_k_confirm').isChecked(), true);
});

test('Phone New house stays fixed while scrolling, clears the footer and follows workspace navigation', async page => {
  await seed(page, 'SYNTHETIC PHONE HOUSE');
  const button = page.locator('#phoneNewHouseBtn');
  for(const width of [320, 390]) {
    await page.setViewportSize({ width, height:844 });
    assert.equal(await page.locator('#phoneHouseAction').evaluate(el => getComputedStyle(el).position), 'fixed');
    assert.equal(await local(page, 'messageNewHouseBtn').isVisible(), false);
    for(const position of [0, 0.5, 1]) {
      await page.evaluate(position => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * position), position);
      await nextFrame(page);
      await reachable(button, width + ' at ' + position, {top:0, height:844});
    }
    const footer = await page.locator('#phoneHouseAction').boundingBox();
    const caption = await patient(page).locator('.patient-caption').boundingBox();
    assert.ok(caption.y + caption.height <= footer.y + 1, width + ': last content scrolls above the fixed action');
    for(const view of ['seen', 'office']) {
      await page.locator('#view-' + view).click();assert.equal(await button.isVisible(), false);
    }
    await page.locator('#view-patients').click();assert.equal(await button.isVisible(), true);
  }
  await button.click();
  assert.equal(await page.locator('#houseHeading').innerText(), 'House 2');
  assert.equal(await local(page, 'f_name', 1).inputValue(), '');
  assert.equal(await local(page, 'f_name').inputValue(), 'SYNTHETIC PHONE HOUSE');
});

test('Phone New house follows the visible viewport above the open keyboard', async page => {
  await page.setViewportSize({width:390, height:844});
  await local(page, 'f_notes').focus();
  await page.evaluate(() => { Object.assign(window.__viewport, {width:390, height:350, offsetTop:180}); window.__viewport.dispatchEvent(new Event('resize')); });
  await nextFrame(page);
  await reachable(page.locator('#phoneNewHouseBtn'), 'phone keyboard', {top:180, height:350});
  await page.evaluate(() => { window.__viewport.offsetTop = 250; window.__viewport.dispatchEvent(new Event('scroll')); });
  await nextFrame(page);
  await reachable(page.locator('#phoneNewHouseBtn'), 'panned phone keyboard', {top:250, height:350});
}, {keyboard:true});

test('Phone New house and Undo remain reachable together after clearing a patient', async page => {
  await seed(page, 'SYNTHETIC PHONE UNDO');
  await local(page, 'tab-check').click();await local(page, 'f_k_confirm').check();await local(page, 'tab-visit').click();
  for(const width of [320, 390]) {
    await page.setViewportSize({width, height:844});
    await local(page, 'newBtn').click();
    await page.getByRole('dialog').getByRole('button', {name:'Clear this patient', exact:true}).click();
    await page.locator('#undoNotice').waitFor({state:'visible'});
    const undo = await page.locator('#undoNotice').boundingBox();
    const dock = await page.locator('#phoneHouseAction').boundingBox();
    assert.ok(undo.y + undo.height <= dock.y, width + ': Undo sits above the phone action');
    await reachable(page.locator('#undoAction'), width + ' Undo', {top:0, height:844});
    await reachable(page.locator('#phoneNewHouseBtn'), width + ' New house with Undo', {top:0, height:844});
    await page.locator('#undoAction').click();
    assert.equal(await local(page, 'f_name').inputValue(), 'SYNTHETIC PHONE UNDO');
    assert.equal(await local(page, 'f_symptoms').inputValue(), 'SYNTHETIC PHONE UNDO symptoms');
    await local(page, 'tab-check').click();assert.equal(await local(page, 'f_k_confirm').isChecked(), true);await local(page, 'tab-visit').click();
  }
  await page.locator('#phoneNewHouseBtn').click();
  assert.equal(await page.locator('#houseHeading').innerText(), 'House 2');
  assert.equal(await local(page, 'f_name', 1).inputValue(), '');
});

test('Phone New house cannot bypass an unread saved draft and becomes usable after recovery', async page => {
  await page.setViewportSize({width:390, height:844});
  await seed(page, 'SYNTHETIC UNREAD PHONE DRAFT');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.addInitScript(() => {
    window.syntheticFailDraftRead = true;
    const original = Storage.prototype.getItem;
    window.syntheticReadDraft = () => original.call(localStorage, 'hvnb_current_app_draft');
    window.syntheticSavedDraft = window.syntheticReadDraft();
    Storage.prototype.getItem = function(key) {
      if(this === localStorage && key === 'hvnb_current_app_draft' && window.syntheticFailDraftRead) throw Error('Synthetic saved-draft read failure');
      return original.call(this, key);
    };
  });
  await page.reload();await page.locator('#draftReadWarning').waitFor({state:'visible'});
  const button = page.locator('#phoneNewHouseBtn'), box = await button.boundingBox();
  await button.evaluate(el => el.focus());
  assert.equal(await button.evaluate(el => el === document.activeElement), false, 'The unread-draft block prevents keyboard focus');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  assert.equal(await page.locator('.patient').count(), 0, 'The blocked dock cannot start a house');
  assert.equal(await page.evaluate(() => window.syntheticReadDraft() === window.syntheticSavedDraft), true, 'Unread saved answers remain unchanged');
  await page.evaluate(() => window.syntheticFailDraftRead = false);
  await page.locator('#retryDraftRead').click();
  await page.getByRole('button', {name:'Restore this visit', exact:true}).click();
  assert.equal(await local(page, 'f_name').inputValue(), 'SYNTHETIC UNREAD PHONE DRAFT');
  await button.click();assert.equal(await page.locator('#houseHeading').innerText(), 'House 2');
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
  await reachableRail(page, 'open keyboard');
  await page.evaluate(() => { window.__viewport.offsetTop = 250; window.__viewport.dispatchEvent(new Event('scroll')); });
  await nextFrame(page);
  await reachableRail(page, 'panned keyboard');
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
  await reachableRail(page, 'last notes with panned keyboard');
  await page.evaluate(() => { document.body.style.paddingBottom = ''; Object.assign(window.__viewport, { height:1080, offsetTop:0 }); window.__viewport.dispatchEvent(new Event('resize')); window.__viewport.dispatchEvent(new Event('scroll')); });
  await nextFrame(page);
  await reachableRail(page, 'closed keyboard');
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
  const browser = await chromium.launch(launchOptions);
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
