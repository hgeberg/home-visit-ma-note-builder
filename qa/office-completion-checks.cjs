'use strict';
// Office completion uses disposable browser contexts and synthetic visits only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium, launchOptions} = require('./browser.cjs');
const {acknowledgeCopyWarning} = require('./form-fixtures.cjs');

const root = path.resolve(__dirname, '..');
const tests = [];
const test = (name, run) => tests.push({name, run});
const field = (page, id, n = 0) => page.locator('#patients .patient').nth(n).locator('[data-local-id="' + id + '"]');
const records = page => page.evaluate(() => JSON.parse(localStorage.getItem('hvnb_current_office') || '[]'));
const group = (page, status) => page.locator('[data-office-status="' + status + '"]');
const card = (page, name) => page.locator('#officeContent .office-patient').filter({hasText:name});
const checkbox = (page, name) => card(page, name).getByRole('checkbox', {name:'Completed', exact:true});
const showOffice = page => page.locator('#view-office').click();
const withoutCompletion = entry => {
  const {completed, ...savedInformation} = entry;
  return savedInformation;
};
async function seed(page, name = 'SYNTHETIC OFFICE ALPHA', n = 0) {
  await field(page, 'f_name', n).fill(name);
  await field(page, 'f_dob', n).fill('01022000');
  await field(page, 'f_inspic', n).check();
  await field(page, 'f_symptoms', n).fill('SYNTHETIC cough and sore throat');
  await field(page, 'f_temp', n).fill('99.4');
  await field(page, 'f_height_ft', n).fill('5');
  await field(page, 'f_height_in', n).fill('10.5');
  await field(page, 'f_overnights', n).fill('Blood: CBC, CMP; RPP');
  await field(page, 'f_bloodreason', n).fill('SYNTHETIC provider requested blood work');
  await field(page, 'f_notes', n).fill('SYNTHETIC full saved visit\nSecond line retained');
  await field(page, 'tab-check', n).click();
  await field(page, 'f_k_confirm', n).check();
  await field(page, 'tab-visit', n).click();
  await copy(page, n);
}
async function copy(page, n = 0) {
  await field(page, 'copyBtn', n).click();
  await acknowledgeCopyWarning(page);
  await field(page, 'sentBanner', n).waitFor({state:'visible'});
}
async function restore(page) {
  const button = page.getByRole('button', {name:/^Restore (this visit|all)/});
  if(await button.count()) await button.click();
}
async function editCopied(page, id, value, n = 0) {
  await field(page, id, n).fill(value);
  const keepEditing = page.getByRole('button', {name:'Same patient, keep editing', exact:true});
  if(await keepEditing.count()) await keepEditing.click();
}

test('Completed moves only the selected patient between two visible lists and preserves every saved detail', async page => {
  await seed(page);
  await page.locator('#appendPatient').click();
  await seed(page, 'SYNTHETIC OFFICE BETA', 1);
  const before = await records(page);
  assert.equal(before.length, 2);
  assert.ok(before[0].visit.vals.k_confirm, 'The saved visit includes its checked checklist');
  await showOffice(page);
  assert.equal(await group(page, 'incomplete').isVisible(), true);
  assert.equal(await group(page, 'completed').isVisible(), true);
  assert.equal(await group(page, 'incomplete').locator('.office-patient').count(), 2);
  assert.equal(await group(page, 'completed').locator('.office-patient').count(), 0);
  assert.equal(await checkbox(page, 'SYNTHETIC OFFICE ALPHA').isChecked(), false);
  await checkbox(page, 'SYNTHETIC OFFICE ALPHA').check();
  assert.equal(await group(page, 'incomplete').locator('.office-patient').count(), 1);
  assert.equal(await group(page, 'completed').locator('.office-patient').count(), 1);
  assert.match(await group(page, 'completed').innerText(), /SYNTHETIC OFFICE ALPHA/);
  assert.match(await group(page, 'incomplete').innerText(), /SYNTHETIC OFFICE BETA/);
  assert.equal(await checkbox(page, 'SYNTHETIC OFFICE ALPHA').isChecked(), true);
  assert.equal(await checkbox(page, 'SYNTHETIC OFFICE BETA').isChecked(), false);
  const completed = await records(page);
  assert.deepEqual(completed.map(withoutCompletion), before.map(withoutCompletion));
  assert.equal(completed[0].completed, true);
  assert.notEqual(completed[1].completed, true);
  assert.match(await card(page, 'SYNTHETIC OFFICE ALPHA').innerText(), /Blood: CBC, CMP; RPP/);
  await checkbox(page, 'SYNTHETIC OFFICE ALPHA').uncheck();
  assert.equal(await group(page, 'incomplete').locator('.office-patient').count(), 2);
  assert.equal(await group(page, 'completed').locator('.office-patient').count(), 0);
  const reopened = await records(page);
  assert.deepEqual(reopened.map(withoutCompletion), before.map(withoutCompletion));
  assert.equal(reopened[0].completed, false);
});

test('Completion survives reload and completed patients still reopen their full saved visit after clearing the form', async page => {
  await seed(page);
  const before = (await records(page))[0];
  await showOffice(page);
  await checkbox(page, 'SYNTHETIC OFFICE ALPHA').check();
  await page.locator('#view-patients').click();
  await field(page, 'newBtn').click();
  const clear = page.getByRole('button', {name:'Clear this patient', exact:true});
  if(await clear.count()) await clear.click();
  assert.equal(await field(page, 'f_name').inputValue(), '');
  await page.reload();
  await restore(page);
  await showOffice(page);
  assert.equal(await group(page, 'completed').locator('.office-patient').count(), 1);
  assert.equal(await checkbox(page, 'SYNTHETIC OFFICE ALPHA').isChecked(), true);
  assert.deepEqual(withoutCompletion((await records(page))[0]), withoutCompletion(before));
  await card(page, 'SYNTHETIC OFFICE ALPHA').getByRole('button', {name:'Edit saved entry', exact:true}).click();
  await page.getByRole('button', {name:'Open visit page', exact:true}).click();
  const visit = page.locator('#patients .patient').filter({has:page.locator('[data-local-id="patientTitle"]').filter({hasText:'SYNTHETIC OFFICE ALPHA'})});
  assert.equal(await visit.locator('[data-local-id="f_notes"]').inputValue(), before.visit.vals.notes);
  assert.equal(await visit.locator('[data-local-id="f_height_in"]').inputValue(), '10.5');
  await visit.locator('[data-local-id="tab-check"]').click();
  assert.equal(await visit.locator('[data-local-id="f_k_confirm"]').isChecked(), true);
  assert.equal((await records(page))[0].completed, true);
});

test('Older Office entries without a completion field appear incomplete and retain their unknown saved data', async page => {
  const legacy = [
    {id:'synthetic-older-tests', name:'SYNTHETIC OLDER TESTS', dob:'01/02/2000', t:1000, overnights:'Urine culture', bloodreason:'', steps:[], customSavedInfo:{retain:'all old fields'}},
    {id:'synthetic-older-reference', name:'SYNTHETIC OLDER REFERENCE', dob:'01/03/2000', t:1001, steps:[{id:'o_match', label:'Saved identity check', done:true}]},
    {id:'synthetic-finished', name:'SYNTHETIC FINISHED', dob:'01/04/2000', t:1002, overnights:'RPP', bloodreason:'', completed:true, steps:[]}
  ];
  await page.evaluate(value => localStorage.setItem('hvnb_current_office', JSON.stringify(value)), legacy);
  await page.reload();
  await showOffice(page);
  assert.equal(await group(page, 'incomplete').locator('.office-patient').count(), 2);
  assert.equal(await group(page, 'completed').locator('.office-patient').count(), 1);
  assert.equal(await checkbox(page, 'SYNTHETIC OLDER TESTS').isChecked(), false);
  assert.equal(await checkbox(page, 'SYNTHETIC OLDER REFERENCE').isChecked(), false);
  assert.equal(await checkbox(page, 'SYNTHETIC FINISHED').isChecked(), true);
  await checkbox(page, 'SYNTHETIC OLDER REFERENCE').check();
  const after = await records(page);
  assert.deepEqual(after.map(withoutCompletion), legacy.map(withoutCompletion));
  assert.equal(after.find(entry => entry.id === 'synthetic-older-reference').completed, true);
});

test('Office edits and copying the linked visit again preserve the manually chosen completion state', async page => {
  await seed(page);
  const id = (await records(page))[0].id;
  await showOffice(page);
  await checkbox(page, 'SYNTHETIC OFFICE ALPHA').check();
  await card(page, 'SYNTHETIC OFFICE ALPHA').getByRole('button', {name:'Edit saved entry', exact:true}).click();
  await page.getByRole('dialog').getByLabel('Labs collected/sent', {exact:true}).fill('SYNTHETIC edited Office order');
  await page.getByRole('button', {name:'Save changes', exact:true}).click();
  assert.equal((await records(page))[0].completed, true);
  assert.match(await group(page, 'completed').innerText(), /SYNTHETIC edited Office order/);
  await page.locator('#view-patients').click();
  await editCopied(page, 'f_overnights', 'Blood: CBC, CMP; Strep culture');
  await copy(page);
  const after = await records(page);
  assert.equal(after.length, 1);
  assert.equal(after[0].id, id);
  assert.equal(after[0].completed, true);
  assert.equal(after[0].overnights, 'Blood: CBC, CMP; Strep culture');
  await showOffice(page);
  assert.equal(await group(page, 'completed').locator('.office-patient').count(), 1);
  assert.equal(await checkbox(page, 'SYNTHETIC OFFICE ALPHA').isChecked(), true);
});

test('Completion synchronizes across open tabs without changing the saved visit', async (page, context, url) => {
  await seed(page);
  const before = (await records(page))[0];
  await showOffice(page);
  const second = await context.newPage();
  await second.goto(url);
  await restore(second);
  await showOffice(second);
  await checkbox(page, 'SYNTHETIC OFFICE ALPHA').check();
  await second.waitForFunction(() => document.querySelector('[data-office-status="completed"] .office-patient input[type="checkbox"]')?.checked === true);
  assert.equal(await checkbox(second, 'SYNTHETIC OFFICE ALPHA').isChecked(), true);
  await checkbox(second, 'SYNTHETIC OFFICE ALPHA').uncheck();
  await page.waitForFunction(() => document.querySelector('[data-office-status="incomplete"] .office-patient input[type="checkbox"]')?.checked === false);
  assert.equal(await checkbox(page, 'SYNTHETIC OFFICE ALPHA').isChecked(), false);
  assert.deepEqual(withoutCompletion((await records(page))[0]), withoutCompletion(before));
});

test('A failed completion save remains visible for retry and retains the complete saved record', async page => {
  await seed(page);
  const before = (await records(page))[0];
  await showOffice(page);
  await page.evaluate(() => {
    window.syntheticOfficeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if(this === localStorage && key === 'hvnb_current_office') throw new Error('Synthetic Office write failure');
      return window.syntheticOfficeSetItem.call(this, key, value);
    };
  });
  await checkbox(page, 'SYNTHETIC OFFICE ALPHA').check();
  assert.equal(await checkbox(page, 'SYNTHETIC OFFICE ALPHA').isChecked(), true);
  assert.equal(await group(page, 'completed').locator('.office-patient').count(), 1);
  assert.equal(await page.locator('#officeSaveWarning').isVisible(), true);
  assert.deepEqual((await records(page))[0], before, 'The failed write does not delete or replace the durable record');
  await page.evaluate(() => {Storage.prototype.setItem = window.syntheticOfficeSetItem;});
  await page.locator('#retryOfficeSave').click();
  assert.equal(await page.locator('#officeSaveWarning').isVisible(), false);
  const after = (await records(page))[0];
  assert.equal(after.completed, true);
  assert.deepEqual(withoutCompletion(after), withoutCompletion(before));
});

test('Phone lists fit the screen, keyboard toggles retain visible focus, and list shortcuts reach their headings', async page => {
  const name = 'SYNTHETIC PHONE PATIENT WITH A LONG SAVED NAME';
  await seed(page, name);
  await editCopied(page, 'f_overnights', 'SYNTHETIC long saved test details '.repeat(45) + 'RPP');
  await copy(page);
  await showOffice(page);
  for(const width of [320, 390]) {
    await page.setViewportSize({width, height:780});
    assert.equal(await group(page, 'incomplete').isVisible(), true);
    assert.equal(await group(page, 'completed').isVisible(), true);
    const overflow = await page.evaluate(() => ({viewport:innerWidth, document:document.documentElement.scrollWidth}));
    assert.ok(overflow.document <= overflow.viewport, 'Office fits the ' + width + 'px screen: ' + JSON.stringify(overflow));
    await checkbox(page, name).scrollIntoViewIfNeeded();
    await checkbox(page, name).focus();
    await page.keyboard.press('Space');
    assert.equal(await checkbox(page, name).isChecked(), true);
    assert.equal(await checkbox(page, name).evaluate(el => document.activeElement === el), true, 'Focus follows the checkbox into Completed at ' + width);
    const visibleFocus = await checkbox(page, name).evaluate(el => {
      const box = el.getBoundingClientRect();
      const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight && target === el;
    });
    assert.equal(visibleFocus, true, 'The moved checkbox remains visible and unobstructed at ' + width);
    const navigation = page.getByRole('navigation', {name:'Office patient lists', exact:true});
    for(const [status, title] of [['incomplete', 'Incomplete (0)'], ['completed', 'Completed (1)']]) {
      await navigation.getByRole('button', {name:title, exact:true}).click();
      const heading = group(page, status).getByRole('heading', {name:title, exact:true});
      assert.equal(await heading.evaluate(el => document.activeElement === el), true, title + ' shortcut focuses the correct heading at ' + width);
      const position = await heading.evaluate(el => {
        const box = el.getBoundingClientRect(), bar = document.querySelector('.workspace-tools').getBoundingClientRect();
        return {top:box.top, bottom:box.bottom, navigationBottom:bar.bottom, height:innerHeight};
      });
      assert.ok(position.top >= position.navigationBottom - 1 && position.bottom <= position.height, title + ' heading is visible below navigation at ' + width + ': ' + JSON.stringify(position));
    }
    await checkbox(page, name).scrollIntoViewIfNeeded();
    await checkbox(page, name).focus();
    await page.keyboard.press('Space');
    assert.equal(await checkbox(page, name).isChecked(), false);
    assert.equal(await checkbox(page, name).evaluate(el => document.activeElement === el), true, 'Focus follows the checkbox back into Incomplete at ' + width);
  }
});

(async () => {
  const server = http.createServer((request, response) => {
    if(new URL(request.url, 'http://local').pathname !== '/app/') {response.writeHead(404);response.end();return;}
    response.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    response.end(fs.readFileSync(path.join(root, 'index.html')));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/app/';
  let browser, failed = 0;
  try {
    browser = await chromium.launch(launchOptions);
    for(const entry of tests) {
      const context = await browser.newContext({serviceWorkers:'block', viewport:{width:810, height:1080}});
      context.setDefaultTimeout(10000);
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:() => Promise.resolve()}});
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {await page.goto(url);await entry.run(page, context, url);assert.deepEqual(errors, []);console.log('PASS ' + entry.name);}
      catch(error) {failed++;console.error('FAIL ' + entry.name + '\n' + (error.stack || error));}
      finally {await context.close();}
    }
  } finally {if(browser) await browser.close();await new Promise(resolve => server.close(resolve));}
  console.log((tests.length - failed) + '/' + tests.length + ' Office completion browser checks passed.');
  if(failed) process.exitCode = 1;
})().catch(error => {console.error(error);process.exitCode = 1;});
