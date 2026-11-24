'use strict';
// Office entries name a shared form layout instead of each carrying a copy.
// Synthetic visits in isolated browser contexts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, launchOptions} = require('./browser.cjs');
const {acknowledgeCopyWarning} = require('./form-fixtures.cjs');
const tests = [];
const test = (name, run) => tests.push({name, run});
const appUrl = 'https://office-layouts.invalid/';
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const officeKey = 'hvnb_current_office', layoutsKey = 'hvnb_current_office_layouts', draftKey = 'hvnb_current_app_draft';
const patient = (page, n = 0) => page.locator('#patients .patient').nth(n);
const field = (page, id, n = 0) => patient(page, n).locator('[data-local-id="' + id + '"]');
const stored = (page, key) => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), key);
const office = async page => await stored(page, officeKey) || [];
const sheets = page => page.locator('#dialogHosts dialog[open]');
const card = (page, name) => page.locator('#officeContent .office-patient').filter({hasText:name});
const restore = page => page.getByRole('button', {name:/^Restore (this visit|all)/}).click();
const leave = page => page.evaluate(() => window.dispatchEvent(new Event('pagehide')));

async function open(context, officeOnly = false){
  const page = await context.newPage();
  // Without a saved shift, the Office entry is the only copy of the visit.
  if(officeOnly) await page.addInitScript(key => { localStorage.removeItem(key); sessionStorage.removeItem('hvnb_current_draft'); }, draftKey);
  await page.goto(appUrl);
  await patient(page).waitFor();
  return page;
}
async function seed(page, name, n = 0){
  await field(page, 'f_name', n).fill(name);
  await field(page, 'f_dob', n).fill('01022000');
  await field(page, 'f_inspic', n).check();
  await field(page, 'f_temp', n).fill('99.4');
  await field(page, 'f_notes', n).fill('SYNTHETIC notes for ' + name);
  await field(page, 'f_overnights', n).fill('RPP');
}
async function copy(page, n = 0){
  await field(page, 'copyBtn', n).click();
  await acknowledgeCopyWarning(page);
  await field(page, 'sentBanner', n).waitFor({state:'visible'});
}
// Opens the complete saved visit from its Office entry and returns that patient form.
async function openSavedVisit(page, name){
  await page.locator('#view-office').click();
  await card(page, name).getByRole('button', {name:'Edit saved entry', exact:true}).click();
  const button = sheets(page).getByRole('button', {name:'Open visit page', exact:true});
  assert.equal(await button.isEnabled(), true, 'The complete saved visit can be opened');
  await button.click();
  return page.locator('#patients .patient').filter({has:page.locator('[data-local-id="patientTitle"]').filter({hasText:name})});
}
async function clearPatient(page, n = 0){
  await field(page, 'newBtn', n).click();
  const confirm = sheets(page).getByRole('button', {name:'Clear this patient', exact:true});
  if(await confirm.count()) await confirm.click();
}
async function clearShift(page){
  await page.locator('#clearShiftBtn').click();
  await page.locator('#confirmClearShift').click();
  await page.locator('#clearShiftDialog').waitFor({state:'hidden'});
}
const failWrites = (page, key) => page.evaluate(key => {
  window.syntheticOriginalSetItem = window.syntheticOriginalSetItem || Storage.prototype.setItem;
  Storage.prototype.setItem = function(name, value){
    if(this === localStorage && name === key) throw new DOMException('Synthetic save failure', 'QuotaExceededError');
    return window.syntheticOriginalSetItem.call(this, name, value);
  };
}, key);
const allowWrites = page => page.evaluate(() => { Storage.prototype.setItem = window.syntheticOriginalSetItem; });

test('Copied visits share one stored layout, stay complete after the form is cleared, and Clear shift removes the layout', async (page) => {
  await seed(page, 'SYNTHETIC SHARED ALPHA');
  await copy(page);
  const copiedMessage = await field(page, 'output').inputValue();
  await page.locator('#appendPatient').click();
  await seed(page, 'SYNTHETIC SHARED BETA', 1);
  await copy(page, 1);
  const entries = await office(page), layouts = await stored(page, layoutsKey);
  assert.equal(entries.length, 2);
  for(const entry of entries){
    assert.equal(entry.visit.layout, undefined, 'No entry carries its own layout');
    assert.equal(entry.visit.layoutId, entries[0].visit.layoutId, 'Both entries name the same layout');
    assert.equal(entry.visit.meta.officeId, entry.id);
    assert.ok(entry.visit.vals.notes.startsWith('SYNTHETIC notes for '), 'The complete visit answers stay in the entry');
  }
  assert.deepEqual(Object.keys(layouts), [entries[0].visit.layoutId]);
  await leave(page);
  assert.deepEqual(layouts[entries[0].visit.layoutId], (await stored(page, draftKey)).layout, 'The stored layout is the form the visits were copied with');
  assert.ok(JSON.stringify(entries).length < JSON.stringify(layouts).length, 'Two entries together are smaller than one layout');
  await clearPatient(page, 0);
  assert.equal(await field(page, 'f_name', 0).inputValue(), '');
  const linked = await openSavedVisit(page, 'SYNTHETIC SHARED ALPHA');
  assert.equal(await linked.locator('[data-local-id="f_temp"]').inputValue(), '99.4');
  assert.equal(await linked.locator('[data-local-id="output"]').inputValue(), copiedMessage);
  await clearShift(page);
  assert.equal(await stored(page, officeKey), null);
  assert.equal(await stored(page, layoutsKey), null, 'Clearing the shift leaves no layout copy behind');
});

test('An entry saved by an earlier version opens with its own layout, and copying it again moves it to the shared one', async (page, context) => {
  await seed(page, 'SYNTHETIC EARLIER VERSION');
  await copy(page);
  const copiedMessage = await field(page, 'output').inputValue();
  await leave(page);
  // Rewrite storage into the earlier format: the layout inside the entry and no shared table.
  await page.evaluate(({officeKey, layoutsKey}) => {
    const entries = JSON.parse(localStorage.getItem(officeKey)), layouts = JSON.parse(localStorage.getItem(layoutsKey));
    for(const entry of entries){ entry.visit.layout = layouts[entry.visit.layoutId]; delete entry.visit.layoutId; }
    localStorage.setItem(officeKey, JSON.stringify(entries));
    localStorage.removeItem(layoutsKey);
  }, {officeKey, layoutsKey});
  await page.close();
  const reopened = await open(context, true);
  assert.equal(await sheets(reopened).count(), 0);
  assert.equal(await stored(reopened, layoutsKey), null, 'Opening the app rewrites nothing');
  assert.ok((await office(reopened))[0].visit.layout.sections.length > 0);
  const linked = await openSavedVisit(reopened, 'SYNTHETIC EARLIER VERSION');
  assert.equal(await linked.locator('[data-local-id="f_notes"]').inputValue(), 'SYNTHETIC notes for SYNTHETIC EARLIER VERSION');
  assert.equal(await linked.locator('[data-local-id="output"]').inputValue(), copiedMessage);
  await linked.locator('[data-local-id="copyBtn"]').click();
  await acknowledgeCopyWarning(reopened);
  await reopened.waitForFunction(key => !!localStorage.getItem(key), layoutsKey);
  const entries = await office(reopened);
  assert.equal(entries.length, 1, 'Copying again updates the same entry');
  assert.equal(entries[0].visit.layout, undefined);
  assert.deepEqual(Object.keys(await stored(reopened, layoutsKey)), [entries[0].visit.layoutId]);
});

test('A second window opens a visit another window copied, and a lost layout copy does not hide the visit', async (page, context) => {
  const second = await open(context);
  await seed(page, 'SYNTHETIC OTHER WINDOW');
  await copy(page);
  await second.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '[]').length === 1, officeKey);
  const linked = await openSavedVisit(second, 'SYNTHETIC OTHER WINDOW');
  assert.equal(await linked.locator('[data-local-id="f_notes"]').inputValue(), 'SYNTHETIC notes for SYNTHETIC OTHER WINDOW');
  await second.close();
  // The entry names a layout that is no longer stored.
  await leave(page);
  await page.evaluate(key => localStorage.removeItem(key), layoutsKey);
  await page.close();
  const reopened = await open(context, true);
  await reopened.locator('#view-seen').click();
  assert.deepEqual(await reopened.locator('#seenList .seen-visit h3').allInnerTexts(), ['SYNTHETIC OTHER WINDOW'], 'The visit is still listed in Patients Seen');
  const recovered = await openSavedVisit(reopened, 'SYNTHETIC OTHER WINDOW');
  assert.equal(await recovered.locator('[data-local-id="f_notes"]').inputValue(), 'SYNTHETIC notes for SYNTHETIC OTHER WINDOW');
  assert.equal(await recovered.locator('[data-local-id="f_temp"]').inputValue(), '99.4');
});

test('A layout that cannot be stored fails the Office save as a whole, survives reopening in the recovery copy, and saves on retry', async (page, context) => {
  await failWrites(page, layoutsKey);
  await seed(page, 'SYNTHETIC LAYOUT WRITE FAILS');
  await copy(page);
  assert.deepEqual(await office(page), [], 'No entry is stored without its layout');
  assert.equal(await page.locator('#officeSaveWarning').isVisible(), true);
  await leave(page);
  const recovery = (await stored(page, draftKey)).officeRecovery;
  const named = recovery.values[0].visit.layoutId;
  assert.equal(recovery.values[0].visit.layout, undefined);
  assert.ok(recovery.layouts[named].sections.length > 0, 'The recovery copy carries the layout its entry names');
  await page.close();
  const reopened = await open(context);
  await restore(reopened);
  assert.equal(await reopened.locator('#officeSaveWarning').isVisible(), true);
  assert.deepEqual(await office(reopened), []);
  await reopened.locator('#retryOfficeSave').click();
  await reopened.locator('#officeSaveWarning').waitFor({state:'hidden'});
  const entries = await office(reopened);
  assert.equal(entries.length, 1);
  assert.deepEqual(Object.keys(await stored(reopened, layoutsKey)), [entries[0].visit.layoutId]);
  await clearPatient(reopened);
  const linked = await openSavedVisit(reopened, 'SYNTHETIC LAYOUT WRITE FAILS');
  assert.equal(await linked.locator('[data-local-id="f_temp"]').inputValue(), '99.4');
});

test('A failed Office list write keeps the entry pending and stores it with its layout on retry', async page => {
  await failWrites(page, officeKey);
  await seed(page, 'SYNTHETIC LIST WRITE FAILS');
  await copy(page);
  assert.deepEqual(await office(page), []);
  assert.equal(await page.locator('#officeSaveWarning').isVisible(), true);
  await allowWrites(page);
  await page.locator('#retryOfficeSave').click();
  await page.locator('#officeSaveWarning').waitFor({state:'hidden'});
  const entries = await office(page);
  assert.equal(entries.length, 1);
  assert.deepEqual(Object.keys(await stored(page, layoutsKey)), [entries[0].visit.layoutId]);
});

test('Removing an entry and undoing it keeps the complete visit available', async page => {
  await seed(page, 'SYNTHETIC REMOVED AND RESTORED');
  await copy(page);
  await clearPatient(page);
  await page.locator('#view-office').click();
  await card(page, 'SYNTHETIC REMOVED AND RESTORED').getByRole('button', {name:'Remove', exact:true}).click();
  await sheets(page).getByRole('button', {name:'Remove', exact:true}).click();
  assert.deepEqual(await office(page), []);
  await page.locator('#undoAction').click();
  assert.equal((await office(page)).length, 1);
  const linked = await openSavedVisit(page, 'SYNTHETIC REMOVED AND RESTORED');
  assert.equal(await linked.locator('[data-local-id="f_temp"]').inputValue(), '99.4');
});

test('After a shift is cleared, the next shift keeps its own layout and unused layouts are removed when the app opens', async (page, context) => {
  await seed(page, 'SYNTHETIC FIRST SHIFT');
  await copy(page);
  const second = await open(context);
  await restore(second);
  await clearShift(second);
  assert.equal(await stored(second, layoutsKey), null);
  await page.waitForFunction(() => document.querySelector('#patients [data-local-id="f_name"]').value === '');
  await seed(second, 'SYNTHETIC SECOND SHIFT');
  await copy(second);
  const entries = await office(second);
  assert.equal(entries.length, 1);
  // The first window was reset by the clear and now reads the second shift's entry and layout.
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '[]').length === 1, officeKey);
  const linked = await openSavedVisit(page, 'SYNTHETIC SECOND SHIFT');
  assert.equal(await linked.locator('[data-local-id="f_notes"]').inputValue(), 'SYNTHETIC notes for SYNTHETIC SECOND SHIFT');
  await leave(page); await leave(second);
  await second.evaluate(key => {
    const layouts = JSON.parse(localStorage.getItem(key));
    layouts['layout-synthetic-unused'] = {v:4, sections:[]};
    localStorage.setItem(key, JSON.stringify(layouts));
  }, layoutsKey);
  await page.close(); await second.close();
  const reopened = await open(context);
  assert.deepEqual(Object.keys(await stored(reopened, layoutsKey)), [entries[0].visit.layoutId], 'Only the layout a stored entry names is kept');
  assert.equal((await office(reopened)).length, 1);
});

(async () => {
  const browser = await chromium.launch(launchOptions);
  let failures = 0;
  try {
    for(const {name, run} of tests){
      const context = await browser.newContext({serviceWorkers:'block', viewport:{width:810, height:1080}, hasTouch:true});
      const errors = [];
      try {
        context.setDefaultTimeout(10000);
        await context.route('**/*', route => route.request().url() === appUrl
          ? route.fulfill({contentType:'text/html; charset=utf-8', body:html})
          : route.abort());
        await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
          configurable:true, value:{writeText:async () => {}}
        }));
        context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
        const page = await open(context);
        await run(page, context);
        assert.deepEqual(errors, []);
        console.log('PASS ' + name);
      } catch(error) {
        failures++;
        console.error('FAIL ' + name + '\n' + error.stack);
        if(errors.length) console.error('Browser errors: ' + errors.join('; '));
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log((tests.length - failures) + '/' + tests.length + ' Office layout checks passed.');
  if(failures) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
