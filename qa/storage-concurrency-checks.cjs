'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, launchOptions} = require('./browser.cjs');
const {acknowledgeCopyWarning} = require('./form-fixtures.cjs');

const origin = 'https://visit-concurrency.test/';
const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const tests = [];
const test = (name, run) => tests.push({name, run});
const field = (page, id, patient = 0) => page.locator(`#patients .patient:nth-child(${patient + 1}) [data-local-id="${id}"]`);
const draft = page => page.evaluate(() => JSON.parse(localStorage.getItem('hvnb_current_app_draft')));
const office = page => page.evaluate(() => JSON.parse(localStorage.getItem('hvnb_current_office') || '[]'));
const flush = page => page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
const restore = page => page.getByRole('button', {name:/^Restore (this visit|all)/}).click();
async function open(context){
  const page = await context.newPage();
  await page.goto(origin);
  return page;
}
async function seed(page){
  // Match the order an MA might enter these fields rather than their layout order.
  await field(page, 'f_dob').fill('01/02/2000');
  await field(page, 'f_name').fill('SYNTHETIC ORIGINAL VISIT');
  await field(page, 'f_inspic').check();
  await field(page, 'f_overnights').fill('RPP');
  await flush(page);
}
async function clickCopy(page){
  await field(page, 'copyBtn').click();
  await acknowledgeCopyWarning(page);
}
async function openClear(page){
  await page.locator('#clearShiftBtn').click();
  await page.locator('#clearShiftDialog').waitFor({state:'visible'});
}

test('Restoring a shift without editing preserves the revision and the first tab can save', async context => {
  const first = await open(context);
  await seed(first);
  const before = await draft(first);
  const second = await open(context);
  await restore(second);
  await flush(second);
  assert.deepEqual(await draft(second), before);
  await field(first, 'f_notes').fill('SYNTHETIC EDIT IN FIRST TAB');
  await flush(first);
  assert.equal((await draft(second)).patients[0].vals.notes, 'SYNTHETIC EDIT IN FIRST TAB');
  assert.equal(await first.locator('#draftWarning').isVisible(), false);
});

test('Clear confirmation refuses a stale review and the current tab can clear safely', async context => {
  const first = await open(context);
  await seed(first);
  const second = await open(context);
  await restore(second);
  await openClear(first);
  await second.locator('#appendPatient').click();
  await field(second, 'f_name', 1).fill('SYNTHETIC UNREVIEWED VISIT');
  await flush(second);
  const newer = await draft(second);
  assert.doesNotMatch(await first.locator('#shiftReviewList').innerText(), /UNREVIEWED/);
  await first.locator('#confirmClearShift').click();
  assert.match(await first.locator('#clearShiftError').innerText(), /Nothing was cleared/);
  assert.deepEqual(await draft(first), newer);
  await openClear(second);
  assert.match(await second.locator('#shiftReviewList').innerText(), /UNREVIEWED/);
  await second.locator('#confirmClearShift').click();
  await first.waitForFunction(() => document.querySelector('[data-local-id="f_name"]').value === '');
  assert.equal(await draft(first), null);
  await field(first, 'f_name').fill('SYNTHETIC NEW SHIFT');
  await flush(first);
  assert.equal((await draft(second)).patients[0].vals.name, 'SYNTHETIC NEW SHIFT');
});

test('Stale clipboard completion and a fresh stale Copy leave newer completed Office labs intact', async context => {
  const first = await open(context);
  await seed(first);
  await first.evaluate(() => { window.deferCopy = true; });
  await clickCopy(first);
  await first.waitForFunction(() => typeof window.resolveCopy === 'function');
  const second = await open(context);
  await restore(second);
  await field(second, 'f_overnights').fill('4plex');
  await flush(second);
  await clickCopy(second);
  await field(second, 'sentBanner').waitFor({state:'visible'});
  await second.locator('#view-office').click();
  await second.locator('[data-office-completed]').check();
  const newer = await office(second);
  assert.equal(newer[0].overnights, '4plex');
  assert.equal(newer[0].completed, true);
  await first.evaluate(() => window.resolveCopy());
  await first.waitForFunction(() => !document.querySelector('[data-local-id="copyBtn"]').disabled);
  assert.equal(await field(first, 'sentBanner').isVisible(), false);
  assert.deepEqual(await office(second), newer);
  await field(first, 'copyBtn').click();
  assert.equal(await first.evaluate(() => window.clipboardWrites), 1);
  assert.match(await field(first, 'status').innerText(), /can’t save a copy/);
  // Explicit Office edits can still merge independently of the stale Visit form.
  await first.locator('#view-office').click();
  await first.getByRole('button', {name:'Edit saved entry', exact:true}).click();
  await first.locator('[data-local-id="sheet_name"]').fill('SYNTHETIC OFFICE CORRECTION');
  await first.getByRole('button', {name:'Save changes', exact:true}).click();
  const updated = (await office(second))[0];
  assert.equal(updated.name, 'SYNTHETIC OFFICE CORRECTION');
  assert.equal(updated.overnights, '4plex');
  assert.equal(updated.completed, true);
  assert.equal((await draft(second)).patients[0].vals.overnights, '4plex');
});

test('Retrying a failed copied-visit save in a stale tab cannot overwrite its replacement', async context => {
  const first = await open(context);
  await seed(first);
  await first.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value){
      if(key === 'hvnb_current_office' && window.failOfficeWrite) throw Error('Synthetic Office storage failure');
      return set.call(this, key, value);
    };
    window.failOfficeWrite = true;
  });
  await clickCopy(first);
  await field(first, 'sentBanner').waitFor({state:'visible'});
  assert.deepEqual(await office(first), []);
  assert.equal((await draft(first)).officeRecovery.visitChanges, true);
  const second = await open(context);
  await restore(second);
  await field(second, 'f_overnights').fill('4plex');
  await second.getByRole('button', {name:'Same patient, keep editing', exact:true}).click();
  await clickCopy(second);
  assert.equal((await office(second))[0].overnights, '4plex');
  const newer = await office(second);
  await first.evaluate(() => { window.failOfficeWrite = false; });
  await first.locator('#view-office').click();
  await first.locator('#retryOfficeSave').click();
  assert.deepEqual(await office(second), newer);
  assert.equal(await first.locator('#officeSaveWarning').isVisible(), true);
});

test('Clear and retry remove both migrated legacy patient keys without deleting layout', async context => {
  await context.addInitScript(() => {
    localStorage.setItem('hvnb_office', JSON.stringify([{id:'synthetic-migrated',name:'SYNTHETIC LEGACY OFFICE'}]));
    sessionStorage.setItem('hvnb_draft', JSON.stringify({t:Date.now(),patients:[{vals:{name:'SYNTHETIC LEGACY DRAFT'}}]}));
  });
  const page = await open(context);
  await restore(page);
  await page.evaluate(() => {
    localStorage.setItem('hvnb_layout', 'SYNTHETIC LAYOUT PREFERENCE');
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function(key){
      if(key === 'hvnb_draft' && window.failLegacyRemoval) throw Error('Synthetic legacy storage failure');
      return remove.call(this, key);
    };
    window.failLegacyRemoval = true;
  });
  await openClear(page);
  await page.locator('#confirmClearShift').click();
  assert.equal(await page.locator('#shiftClearWarning').isVisible(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('hvnb_office')), null);
  assert.notEqual(await page.evaluate(() => sessionStorage.getItem('hvnb_draft')), null);
  await page.evaluate(() => { window.failLegacyRemoval = false; });
  await page.locator('#retryShiftClear').click();
  assert.equal(await page.locator('#shiftClearWarning').isVisible(), false);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('hvnb_draft')), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('hvnb_layout')), 'SYNTHETIC LAYOUT PREFERENCE');
  assert.equal(await draft(page), null);
  assert.deepEqual(await office(page), []);
});

(async () => {
  const browser = await chromium.launch(launchOptions);
  let passed = 0;
  try{
    for(const {name, run} of tests){
      const context = await browser.newContext({serviceWorkers:'block'});
      context.setDefaultTimeout(10000);
      try{
        await context.route(origin + '**', route => route.request().isNavigationRequest()
          ? route.fulfill({contentType:'text/html; charset=utf-8', body:html})
          : route.fulfill({status:404}));
        await context.addInitScript(() => {
          window.clipboardWrites = 0;
          Object.defineProperty(navigator, 'clipboard', {value:{writeText(){
            window.clipboardWrites++;
            return window.deferCopy ? new Promise(resolve => { window.resolveCopy = resolve; }) : Promise.resolve();
          }}});
        });
        await run(context);
        passed++;
        console.log('PASS ' + name);
      }catch(error){
        console.error('FAIL ' + name + '\n' + error.stack);
        process.exitCode = 1;
      }finally{ await context.close(); }
    }
  }finally{ await browser.close(); }
  console.log(`${passed}/${tests.length} storage concurrency checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
