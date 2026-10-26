'use strict';
// Shift review and patient search use disposable browser contexts and synthetic data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium, launchOptions} = require('./browser.cjs');

const root = path.resolve(__dirname, '..');
const tests = [], test = (name, run) => tests.push({name, run});
const patient = (page, n = 0) => page.locator('#patients .patient').nth(n);
const local = (page, id, n = 0) => patient(page, n).locator('[data-local-id="' + id + '"]');
const historyButtons = page => page.locator('#patientJumps button:visible');
const historyEntry = (page, name) => historyButtons(page).filter({hasText:name});
const reviewEntry = (page, name) => page.locator('#shiftReviewList button').filter({hasText:name});

async function seed(page, name, n = 0, dob = '01012000') {
  await local(page, 'f_name', n).fill(name);
  await local(page, 'f_dob', n).fill(dob);
  await local(page, 'f_inspic', n).check();
}
async function history(page) {
  if (!await page.locator('#patientNavigator').evaluate(el => el.open)) await page.locator('#patientNavSummary').click();
}
async function copy(page, n = 0) {
  await local(page, 'copyBtn', n).click();
  await local(page, 'sentBanner', n).waitFor({state:'visible'});
}
async function changeCopied(page, value, n = 0) {
  await local(page, 'f_symptoms', n).fill(value);
  await page.getByRole('button', {name:'Same patient, keep editing', exact:true}).click();
}
async function review(page) {
  await page.locator('#clearShiftBtn').click();
  await page.locator('#clearShiftDialog').waitFor({state:'visible'});
}

test('Patient search matches names and DOB with punctuation, retains focus and reports no matches', async page => {
  await seed(page, "SYNTHETIC O'NEIL", 0, '01022001');
  await page.locator('#newHouseBtn').click();
  await seed(page, 'SYNTHETIC BETA', 1, '03042002');
  await history(page);
  await page.locator('#patientSearch').fill("o'neil");
  assert.equal(await historyButtons(page).count(), 1);
  assert.match(await historyButtons(page).innerText(), /SYNTHETIC O'NEIL/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'patientSearch');
  for (const query of ['01/02/2001', '01022001']) {
    await page.locator('#patientSearch').fill(query);
    assert.equal(await historyButtons(page).count(), 1);
    assert.match(await historyButtons(page).innerText(), /O'NEIL/);
  }
  await page.locator('#patientSearch').fill('no synthetic match');
  assert.equal(await historyButtons(page).count(), 0);
  assert.match(await page.locator('#patientSearchStatus').innerText(), /no|0/i);
  await page.locator('#patientSearch').fill('');
  assert.equal(await historyButtons(page).count(), 2);
});

test('Patient status changes after copying and editing without requiring a name change', async page => {
  await seed(page, 'SYNTHETIC STATUS');
  await history(page);
  assert.match(await historyEntry(page, 'SYNTHETIC STATUS').innerText(), /Not copied/);
  await copy(page);
  await history(page);
  assert.match(await historyEntry(page, 'SYNTHETIC STATUS').innerText(), /Copied/);
  assert.doesNotMatch(await historyEntry(page, 'SYNTHETIC STATUS').innerText(), /Changes not copied|Not copied/);
  await changeCopied(page, 'SYNTHETIC UPDATED SYMPTOMS');
  await history(page);
  assert.match(await historyEntry(page, 'SYNTHETIC STATUS').innerText(), /Changes not copied/);
  await copy(page);
  await history(page);
  assert.doesNotMatch(await historyEntry(page, 'SYNTHETIC STATUS').innerText(), /Changes not copied/);
});

test('Shift review lists uncopied and changed visits and omits unchanged copied and blank visits', async page => {
  await seed(page, 'SYNTHETIC COPIED'); await copy(page);
  await page.locator('#appendPatient').click(); await seed(page, 'SYNTHETIC UNCOPIED', 1);
  await page.locator('#appendPatient').click(); await seed(page, 'SYNTHETIC CHANGED', 2); await copy(page, 2);
  await changeCopied(page, 'SYNTHETIC CHANGED AFTER COPY', 2);
  await page.locator('#appendPatient').click();
  await review(page);
  assert.equal(await reviewEntry(page, 'SYNTHETIC COPIED').count(), 0);
  assert.match(await reviewEntry(page, 'SYNTHETIC UNCOPIED').innerText(), /Not copied/i);
  assert.match(await reviewEntry(page, 'SYNTHETIC CHANGED').innerText(), /Changes not copied/i);
  assert.equal(await page.locator('#shiftReviewList button').count(), 2);
  assert.doesNotMatch(await page.locator('#shiftReviewSummary').innerText(), /checklist|\d\s*\/\s*\d/i);
});

test('Opening a review item switches houses, expands the target and selects Visit with heading focus', async page => {
  await seed(page, 'SYNTHETIC EARLIER HOUSE');
  await local(page, 'tab-check').click();
  await local(page, 'f_k_pa').check();
  await local(page, 'collapseBtn').click();
  await page.locator('#newHouseBtn').click(); await seed(page, 'SYNTHETIC LATER HOUSE', 1);
  await review(page);
  await reviewEntry(page, 'SYNTHETIC EARLIER HOUSE').click();
  assert.equal(await page.locator('#clearShiftDialog').isVisible(), false);
  assert.equal(await page.locator('#houseHeading').innerText(), 'House 1');
  assert.equal(await local(page, 'panel-visit').isVisible(), true);
  assert.equal(await local(page, 'collapseBtn').getAttribute('aria-expanded'), 'true');
  assert.equal(await local(page, 'f_k_pa').isChecked(), true);
  assert.equal(await patient(page, 1).isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), await local(page, 'patientTitle').getAttribute('id'));
});

test('Checklist-only activity never produces patient progress counts or unfinished review warnings', async page => {
  await local(page, 'tab-check').click();
  await local(page, 'f_k_confirm').check(); await local(page, 'f_k_pa').check();
  await history(page);
  const entry = await historyButtons(page).innerText();
  assert.match(entry, /Blank visit/i);
  assert.doesNotMatch(entry, /checklist|\d\s*\/\s*\d|Not copied/i);
  await review(page);
  assert.equal(await page.locator('#shiftReviewList button').count(), 0);
  assert.doesNotMatch(await page.locator('#shiftReviewSummary').innerText(), /checklist|\d\s*\/\s*\d|not copied/i);
});

test('Pending Office saves are visible in search and review and disappear after a successful retry', async page => {
  await seed(page, 'SYNTHETIC PENDING OFFICE');
  await local(page, 'f_overnights').fill('RPP');
  await page.evaluate(() => {
    window.__originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'hvnb_current_office') throw new DOMException('Synthetic save failure', 'QuotaExceededError');
      return window.__originalSetItem.call(this, key, value);
    };
  });
  await copy(page);
  await history(page);
  assert.match(await historyEntry(page, 'SYNTHETIC PENDING OFFICE').innerText(), /Office save pending/i);
  await review(page);
  assert.match(await reviewEntry(page, 'SYNTHETIC PENDING OFFICE').innerText(), /Office save pending/i);
  await page.locator('#cancelClearShift').click();
  await page.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem; });
  await page.locator('#retryOfficeSave').click();
  await page.locator('#officeSaveWarning').waitFor({state:'hidden'});
  await history(page);
  assert.doesNotMatch(await historyEntry(page, 'SYNTHETIC PENDING OFFICE').innerText(), /Office save pending/i);
  await review(page);
  assert.equal(await reviewEntry(page, 'SYNTHETIC PENDING OFFICE').count(), 0);
});

test('One patient Office failure does not mark earlier successful copies as pending', async page => {
  await seed(page, 'SYNTHETIC COPIED WITHOUT OVERNIGHTS'); await copy(page);
  await page.locator('#appendPatient').click();
  await seed(page, 'SYNTHETIC SAVED OVERNIGHTS', 1);
  await local(page, 'f_overnights', 1).fill('Urine culture'); await copy(page, 1);
  await page.locator('#appendPatient').click();
  await seed(page, 'SYNTHETIC FAILED LATER SAVE', 2);
  await local(page, 'f_overnights', 2).fill('RPP');
  await page.evaluate(() => {
    window.__originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'hvnb_current_office') throw new DOMException('Synthetic later save failure', 'QuotaExceededError');
      return window.__originalSetItem.call(this, key, value);
    };
  });
  await copy(page, 2); await history(page);
  for (const name of ['SYNTHETIC COPIED WITHOUT OVERNIGHTS', 'SYNTHETIC SAVED OVERNIGHTS']) {
    const text = await historyEntry(page, name).innerText();
    assert.match(text, /Copied/); assert.doesNotMatch(text, /Office save pending/i);
  }
  assert.match(await historyEntry(page, 'SYNTHETIC FAILED LATER SAVE').innerText(), /Office save pending/i);
  await review(page);
  assert.equal(await reviewEntry(page, 'SYNTHETIC COPIED WITHOUT OVERNIGHTS').count(), 0);
  assert.equal(await reviewEntry(page, 'SYNTHETIC SAVED OVERNIGHTS').count(), 0);
  assert.match(await reviewEntry(page, 'SYNTHETIC FAILED LATER SAVE').innerText(), /Office save pending/i);
});

test('A cleared copied form retains its failed Office save under the original name and opens Office', async page => {
  await seed(page, 'SYNTHETIC CLEARED PENDING COPY');
  await local(page, 'f_overnights').fill('RPP');
  await page.evaluate(() => {
    window.__originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'hvnb_current_office') throw new DOMException('Synthetic copied save failure', 'QuotaExceededError');
      return window.__originalSetItem.call(this, key, value);
    };
  });
  await copy(page);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('hvnb_current_office') || '[]')), []);
  await local(page, 'newBtn').click();
  const confirmation = page.locator('#dialogHosts [role="dialog"]');
  if (await confirmation.isVisible()) await confirmation.getByRole('button', {name:'Clear this patient', exact:true}).click();
  assert.equal(await local(page, 'f_name').inputValue(), '');
  await review(page);
  const entry = reviewEntry(page, 'SYNTHETIC CLEARED PENDING COPY');
  assert.equal(await entry.count(), 1);
  assert.match(await entry.innerText(), /Office save pending/i);
  await entry.click();
  assert.equal(await page.locator('#clearShiftDialog').isVisible(), false);
  assert.equal(await page.locator('#officeSection').isVisible(), true);
  assert.match(await page.locator('#officeContent').innerText(), /SYNTHETIC CLEARED PENDING COPY/);
  assert.equal(await local(page, 'f_name').inputValue(), '');
});

test('Cancel and Escape keep patient work; confirming clear resets search and all patient work', async page => {
  await seed(page, 'SYNTHETIC KEEP UNTIL CLEAR');
  await history(page); await page.locator('#patientSearch').fill('KEEP');
  await review(page); await page.keyboard.press('Escape');
  assert.equal(await local(page, 'f_name').inputValue(), 'SYNTHETIC KEEP UNTIL CLEAR');
  await review(page); await page.locator('#cancelClearShift').click();
  assert.equal(await local(page, 'f_name').inputValue(), 'SYNTHETIC KEEP UNTIL CLEAR');
  await review(page); await page.locator('#confirmClearShift').click();
  assert.equal(await page.locator('#clearShiftDialog').isVisible(), false);
  assert.equal(await page.locator('#patients .patient').count(), 1);
  assert.equal(await local(page, 'f_name').inputValue(), '');
  assert.equal(await page.locator('#patientSearch').inputValue(), '');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('hvnb_current_draft')), null);
  await history(page); assert.equal(await historyButtons(page).count(), 1);
});

test('Recovered drafts retain derived copy statuses and search navigates by keyboard', async page => {
  await seed(page, 'SYNTHETIC RECOVERED COPIED'); await copy(page);
  await page.locator('#newHouseBtn').click(); await seed(page, 'SYNTHETIC RECOVERED UNCOPIED', 1);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await page.getByRole('button', {name:/^Restore (this visit|all)/}).click();
  await history(page);
  assert.match(await historyEntry(page, 'SYNTHETIC RECOVERED COPIED').innerText(), /Copied/);
  assert.match(await historyEntry(page, 'SYNTHETIC RECOVERED UNCOPIED').innerText(), /Not copied/);
  await page.locator('#patientSearch').fill('RECOVERED COPIED');
  await historyEntry(page, 'SYNTHETIC RECOVERED COPIED').focus();
  await historyEntry(page, 'SYNTHETIC RECOVERED COPIED').press('Enter');
  assert.equal(await page.locator('#houseHeading').innerText(), 'House 1');
  assert.equal(await local(page, 'panel-visit').isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), await local(page, 'patientTitle').getAttribute('id'));
});

test('Patient search, long names and review controls fit a 320px phone', async page => {
  await page.setViewportSize({width:320, height:780});
  await seed(page, 'SYNTHETIC VERY LONG PATIENT NAME FOR SMALL PHONE');
  await history(page);
  await page.locator('#patientSearch').fill('SYNTHETIC');
  let sizes = await page.evaluate(() => ({view:innerWidth, width:document.documentElement.scrollWidth}));
  assert.ok(sizes.width <= sizes.view, 'Patient search has no page overflow');
  await review(page);
  const bounds = await page.locator('#clearShiftDialog').boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320, 'Shift review fits the phone');
  assert.equal(await page.locator('#cancelClearShift').isVisible(), true);
  assert.equal(await page.locator('#confirmClearShift').isVisible(), true);
  sizes = await page.evaluate(() => ({view:innerWidth, width:document.documentElement.scrollWidth}));
  assert.ok(sizes.width <= sizes.view, 'Shift review has no page overflow');
});

(async () => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, {'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store'});
    response.end(fs.readFileSync(path.join(root, 'index.html')));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port + '/';
  let browser, failed = 0;
  const selected = tests.filter(t => !process.env.TEST_FILTER || t.name.includes(process.env.TEST_FILTER));
  try {
    browser = await chromium.launch(launchOptions);
    for (const entry of selected) {
      const context = await browser.newContext();
      await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:() => Promise.resolve()}}));
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(origin); await patient(page).waitFor();
        await entry.run(page);
        assert.deepEqual(errors, [], 'No browser JavaScript errors');
        console.log('PASS ' + entry.name);
      } catch (error) {
        failed++; console.error('FAIL ' + entry.name + '\n' + (error.stack || error));
        if (errors.length) console.error('Browser errors: ' + errors.join('; '));
      } finally { await context.close(); }
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log((selected.length - failed) + '/' + selected.length + ' shift-review browser checks passed.');
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
