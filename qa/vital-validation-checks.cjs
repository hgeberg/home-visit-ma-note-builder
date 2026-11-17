'use strict';
// Use synthetic visits in isolated browser contexts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, launchOptions} = require('./browser.cjs');
const tests = [];
const test = (name, run) => tests.push({name, run});
const appUrl = 'https://vital-validation.invalid/';
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const field = (page, id) => page.locator('#patients [data-local-id="' + id + '"]');
const dialog = page => page.locator('dialog[open]');
const row = (page, id) => dialog(page).locator('[data-vital-review="' + id + '"]');
const vitalValue = (page, id) => row(page, id).locator('[data-vital-value="' + id + '"]');
const option = (page, id, name) => row(page, id).getByRole('radio', {name, exact:true});
const button = (page, name) => dialog(page).getByRole('button', {name, exact:true});
const output = page => field(page, 'output').inputValue();
const copied = page => page.evaluate(() => window.syntheticCopied);

async function enterPatient(page){
  await field(page, 'f_name').fill('SYNTHETIC VITAL VALIDATION');
  await field(page, 'f_dob').fill('02/29/2000');
  await field(page, 'f_inspic').check();
  await field(page, 'f_temp').fill('98.6');
  await field(page, 'f_weight').fill('145.5');
  await field(page, 'f_height_ft').fill('5');
  await field(page, 'f_height_in').fill('10');
}

async function openReview(page){
  await field(page, 'copyBtn').click();
  await dialog(page).waitFor();
}

async function copyAfterReview(page, name){
  await button(page, name).click();
  await field(page, 'sentBanner').waitFor();
  assert.equal(await dialog(page).count(), 0);
  return copied(page);
}

test('Visit accepts decimals and explicit units and preserves them through reopening', async page => {
  await enterPatient(page);
  assert.match(await output(page), /^Weight: 145\.5 lb$/m);
  await field(page, 'f_weight').fill('.75');
  assert.match(await output(page), /^Weight: \.75 lb$/m);
  await field(page, 'f_temp').fill('37 °C');
  await field(page, 'f_weight').fill('72.5 kg');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await page.getByRole('button', {name:'Restore this visit', exact:true}).click();
  await field(page, 'copyBtn').click();
  await field(page, 'sentBanner').waitFor();
  assert.match(await copied(page), /^Temp: 37 °C$/m);
  assert.match(await copied(page), /^Weight: 72\.5 kg$/m);
});

test('Malformed measurements are reviewed and omitted on Copy anyways without losing the entries', async page => {
  await enterPatient(page);
  await field(page, 'f_temp').fill('98.6 bananas');
  await field(page, 'f_weight').fill('0 lb');
  assert.doesNotMatch(await output(page), /^(?:Temp|Weight):/m);
  await openReview(page);
  assert.equal(await row(page, 'temp').isVisible(), true);
  assert.equal(await row(page, 'weight').isVisible(), true);
  assert.equal(await row(page, 'height').count(), 0);
  await option(page, 'temp', 'Enter measurement').click();
  assert.equal(await vitalValue(page, 'temp').inputValue(), '98.6 bananas');
  await vitalValue(page, 'temp').fill('36.8 C');
  await button(page, 'Go back').click();
  assert.equal(await field(page, 'f_temp').inputValue(), '98.6 bananas');
  await openReview(page);
  assert.doesNotMatch(await copyAfterReview(page, 'Copy anyways'), /^(?:Temp|Weight):|not obtained/m);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const visit = await page.evaluate(() => JSON.parse(localStorage.getItem('hvnb_current_app_draft')).patients[0].vals);
  assert.equal(visit.temp, '98.6 bananas');
  assert.equal(visit.weight, '0 lb');
});

test('The copy dialog applies the same measurement validation and copies a reason without the invalid entry', async page => {
  await enterPatient(page);
  await field(page, 'f_temp').fill('SYNTHETIC unrecorded');
  await field(page, 'f_weight').fill('-3 lb');
  await openReview(page);
  await option(page, 'temp', 'Enter measurement').click();
  await option(page, 'weight', 'Enter measurement').click();
  await button(page, 'Copy message').click();
  assert.match(await dialog(page).getByRole('alert').innerText(), /Temperature: enter a measurement/);
  await vitalValue(page, 'temp').fill('98.7 °F');
  await button(page, 'Copy anyways').click();
  assert.match(await dialog(page).getByRole('alert').innerText(), /Weight: enter a measurement/);
  assert.equal(await copied(page), undefined);
  await vitalValue(page, 'weight').fill('7 lb 5.5 oz');
  await option(page, 'weight', 'Pt refused').click();
  const text = await copyAfterReview(page, 'Copy message');
  assert.match(text, /^Temp: 98\.7 °F$/m);
  assert.match(text, /^Weight not obtained: Pt refused$/m);
  assert.doesNotMatch(text, /^Weight:|Temperature not obtained/m);
  assert.equal(await field(page, 'f_weight').inputValue(), '-3 lb');
  await openReview(page);
  await option(page, 'weight', 'Enter measurement').click();
  await vitalValue(page, 'weight').fill('7 lb 5.5 oz');
  const corrected = await copyAfterReview(page, 'Copy message');
  assert.match(corrected, /^Weight: 7 lb 5\.5 oz$/m);
  assert.doesNotMatch(corrected, /not obtained/);
});

test('An invalid entry on its own still opens review and cannot copy an empty note', async page => {
  await field(page, 'f_temp').fill('not measured');
  await openReview(page);
  assert.equal(await row(page, 'temp').isVisible(), true);
  await button(page, 'Copy anyways').click();
  await dialog(page).waitFor({state:'hidden'});
  assert.equal(await copied(page), undefined);
  assert.equal(await field(page, 'f_temp').inputValue(), 'not measured');
});

test('Patient DOB must be a real date no later than today and policy holder DOB may be N/A', async page => {
  await enterPatient(page);
  const date = await page.evaluate(() => {
    const today = new Date();
    const format = value => [
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
      String(value.getFullYear())
    ].join('/');
    const current = format(today);
    today.setDate(today.getDate() + 1);
    return {current, tomorrow:format(today)};
  });
  assert.match(await output(page), /^DOB: 02\/29\/2000$/m);
  await field(page, 'f_dob').fill(date.current);
  assert.ok((await output(page)).includes('DOB: ' + date.current));
  await field(page, 'f_polholder').fill('N/A');
  for(const invalid of ['N/A', '02/29/2001', date.tomorrow]){
    await field(page, 'f_dob').fill(invalid);
    assert.doesNotMatch(await output(page), /^DOB:/m);
    await openReview(page);
    assert.match(await dialog(page).innerText(), /DOB: enter a valid date/);
    if(invalid !== date.tomorrow) await button(page, 'Go back').click();
  }
  const text = await copyAfterReview(page, 'Copy anyway');
  assert.doesNotMatch(text, /^DOB:/m);
  assert.match(text, /^Policy holder DOB: N\/A$/m);
  assert.equal(await field(page, 'f_dob').inputValue(), date.tomorrow);
});

test('Editing Office allows unrelated changes to older entries and rejects newly entered invalid DOBs', async page => {
  await page.evaluate(() => localStorage.setItem('hvnb_current_office', JSON.stringify([
    {id:'synthetic-older', name:'SYNTHETIC OLDER ENTRY', dob:'N/A', t:Date.now(), overnights:'UA', steps:[]}
  ])));
  await page.reload();
  await page.getByRole('tab', {name:'Office', exact:true}).click();
  const edit = () => page.getByRole('button', {name:'Edit saved entry', exact:true}).click();
  await edit();
  await dialog(page).getByLabel('Labs collected/sent', {exact:true}).fill('Urine culture');
  await button(page, 'Save changes').click();
  await dialog(page).waitFor({state:'hidden'});
  await edit();
  const dob = dialog(page).getByLabel('DOB', {exact:true});
  assert.equal(await dob.inputValue(), 'N/A');
  assert.equal(await dialog(page).getByLabel('Labs collected/sent', {exact:true}).inputValue(), 'Urine culture');
  await dob.fill('01/01/2200');
  await button(page, 'Save changes').click();
  assert.match(await dialog(page).getByRole('alert').innerText(), /DOB: enter a valid date/);
  await dob.fill('02/29/2000');
  await button(page, 'Save changes').click();
  await dialog(page).waitFor({state:'hidden'});
});

(async () => {
  const browser = await chromium.launch(launchOptions);
  let failures = 0;
  try {
    for(const {name, run} of tests){
      const context = await browser.newContext({serviceWorkers:'block', viewport:{width:810,height:1080}});
      try {
        await context.route('**/*', route => route.request().url() === appUrl
          ? route.fulfill({contentType:'text/html; charset=utf-8', body:html})
          : route.abort());
        await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
          configurable:true, value:{writeText:async text => { window.syntheticCopied = text; }}
        }));
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(appUrl);
        await run(page);
        assert.deepEqual(errors, []);
        console.log('PASS ' + name);
      } catch(error) {
        failures++;
        console.error('FAIL ' + name + '\n' + error.stack);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log((tests.length - failures) + '/' + tests.length + ' vital and DOB validation checks passed.');
  if(failures) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
