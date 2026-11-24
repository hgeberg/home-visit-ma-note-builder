'use strict';
// One-tap shortcuts must not silently discard an entered answer.
// Synthetic visits in isolated browser contexts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, launchOptions} = require('./browser.cjs');
const {acknowledgeCopyWarning} = require('./form-fixtures.cjs');
const tests = [];
const test = (name, run) => tests.push({name, run});
const appUrl = 'https://shortcut-replace.invalid/';
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const patient = (page, n = 0) => page.locator('#patients .patient').nth(n);
const field = (page, id, n = 0) => patient(page, n).locator('[data-local-id="' + id + '"]');
const chip = (page, fieldId, value, n = 0) => patient(page, n).locator('.chip[data-for="' + fieldId + '"]').filter({hasText:new RegExp('^' + value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')});
const dialog = page => page.locator('dialog[open]');
const button = (page, name) => dialog(page).getByRole('button', {name, exact:true});
// The preview starts with an invisible character that protects pasting on iOS.
const output = async (page, n = 0) => (await field(page, 'output', n).inputValue()).replace(/^​/, '');
const noDialog = async page => assert.equal(await dialog(page).count(), 0, 'No prompt is expected');

test('NKDA asks before replacing typed allergies; keeping leaves the answer and the message unchanged', async page => {
  await field(page, 'f_name').fill('SYNTHETIC SHORTCUT');
  await field(page, 'f_allergies').fill('Penicillin (hives), Sulfa');
  await chip(page, 'allergies', 'NKDA').click();
  await dialog(page).waitFor();
  assert.match(await dialog(page).innerText(), /Replace what is entered\?/);
  assert.match(await dialog(page).innerText(), /Medication allergies has this entered:/);
  assert.match(await dialog(page).innerText(), /Penicillin \(hives\), Sulfa/);
  assert.equal(await field(page, 'f_allergies').inputValue(), 'Penicillin (hives), Sulfa', 'Nothing changes until the choice is made');
  await button(page, 'Keep what is entered').click();
  await noDialog(page);
  assert.equal(await field(page, 'f_allergies').inputValue(), 'Penicillin (hives), Sulfa');
  assert.match(await output(page), /^Medication allergies: Penicillin \(hives\), Sulfa$/m);
  assert.equal(await chip(page, 'allergies', 'NKDA').getAttribute('aria-pressed'), 'false');
  assert.equal(await chip(page, 'allergies', 'NKDA').evaluate(el => el === document.activeElement), true, 'Focus returns to the shortcut');
});

test('Confirming the replacement enters the shortcut, and Escape or a tap outside keeps the answer', async page => {
  await field(page, 'f_allergies').fill('Amoxicillin');
  await chip(page, 'allergies', 'NKDA').click();
  await dialog(page).waitFor();
  await page.keyboard.press('Escape');
  await noDialog(page);
  assert.equal(await field(page, 'f_allergies').inputValue(), 'Amoxicillin');
  await chip(page, 'allergies', 'NKDA').click();
  await dialog(page).waitFor();
  await dialog(page).click({position:{x:5, y:5}});
  await noDialog(page);
  assert.equal(await field(page, 'f_allergies').inputValue(), 'Amoxicillin');
  await chip(page, 'allergies', 'NKDA').click();
  await button(page, 'Replace with NKDA').click();
  await noDialog(page);
  assert.equal(await field(page, 'f_allergies').inputValue(), 'NKDA');
  assert.match(await output(page), /^Medication allergies: NKDA$/m);
  assert.equal(await chip(page, 'allergies', 'NKDA').getAttribute('aria-pressed'), 'true');
});

test('Empty fields, a shortcut’s own value and other one-tap values change without a prompt', async page => {
  await chip(page, 'allergies', 'NKDA').click();
  await noDialog(page);
  assert.equal(await field(page, 'f_allergies').inputValue(), 'NKDA');
  await chip(page, 'allergies', 'NKDA').click();
  await noDialog(page);
  assert.equal(await field(page, 'f_allergies').inputValue(), '', 'Tapping the selected shortcut clears it');
  await field(page, 'f_allergies').fill('  nkda ');
  await chip(page, 'allergies', 'NKDA').click();
  await noDialog(page);
  assert.equal(await field(page, 'f_allergies').inputValue(), '', 'A typed copy of the shortcut is the shortcut');
  await chip(page, 'duration', '2 days').click();
  await chip(page, 'duration', '3 days').click();
  await noDialog(page);
  assert.equal(await field(page, 'f_duration').inputValue(), '3 days');
  await chip(page, 'pharmacy', 'Madison').click();
  await chip(page, 'pharmacy', 'Westgate').click();
  await noDialog(page);
  assert.equal(await field(page, 'f_pharmacy').inputValue(), 'Westgate');
  await field(page, 'f_duration').fill('since Monday');
  await chip(page, 'duration', '1 week').click();
  await dialog(page).waitFor();
  assert.match(await dialog(page).innerText(), /Duration has this entered:\s+since Monday/);
  await button(page, 'Replace with 1 week').click();
  assert.equal(await field(page, 'f_duration').inputValue(), '1 week');
});

test('None asks before clearing chosen labs; adding shortcuts never asks and still drops None', async page => {
  await chip(page, 'overnights', '4plex').click();
  await chip(page, 'overnights', 'Strep throat PCR').click();
  await noDialog(page);
  assert.equal(await field(page, 'f_overnights').inputValue(), '4plex, Strep throat PCR');
  await chip(page, 'overnights', 'None').click();
  await dialog(page).waitFor();
  assert.match(await dialog(page).innerText(), /Labs collected\/sent has this entered:\s+4plex, Strep throat PCR/);
  await button(page, 'Keep what is entered').click();
  assert.equal(await field(page, 'f_overnights').inputValue(), '4plex, Strep throat PCR');
  assert.match(await output(page), /^Labs collected\/sent: 4plex, Strep throat PCR$/m);
  await chip(page, 'overnights', 'None').click();
  await button(page, 'Replace with None').click();
  assert.equal(await field(page, 'f_overnights').inputValue(), 'None');
  await chip(page, 'overnights', 'RPP').click();
  await noDialog(page);
  assert.equal(await field(page, 'f_overnights').inputValue(), 'RPP', 'Adding a lab replaces None without a prompt');
  await field(page, 'f_overnights').fill('CBC, CMP');
  await chip(page, 'overnights', 'Blood').click();
  await noDialog(page);
  assert.equal(await field(page, 'f_overnights').inputValue(), 'CBC, CMP, Blood', 'Adding keeps typed labs');
});

test('Typed history, medications, notes and policy-holder DOB are protected, and long answers are shortened in the prompt', async page => {
  for(const [id, shortcut, typed, label] of [
    ['history', 'None', 'Asthma, type 1 diabetes', 'Medical history'],
    ['meds', 'None', 'Albuterol, insulin', 'Daily medications'],
    ['polholder', 'N/A', '01/02/1980', 'Policy holder DOB']
  ]){
    await field(page, 'f_' + id).fill(typed);
    await chip(page, id, shortcut).click();
    await dialog(page).waitFor();
    assert.ok((await dialog(page).innerText()).includes(label + ' has this entered:'), label);
    await button(page, 'Keep what is entered').click();
    assert.equal(await field(page, 'f_' + id).inputValue(), typed);
  }
  const long = 'SYNTHETIC NOTE '.repeat(30).trim();
  await field(page, 'f_notes').fill(long);
  await chip(page, 'notes', 'None').click();
  await dialog(page).waitFor();
  const shown = await dialog(page).locator('.overnight-tests').innerText();
  assert.equal(shown.length, 241);
  assert.ok(shown.endsWith('…') && long.startsWith(shown.slice(0, -1)));
  await button(page, 'Keep what is entered').click();
  assert.equal(await field(page, 'f_notes').inputValue(), long);
});

test('Replacing an answer on a copied visit still asks about the same patient, and undoing restores the typed answer', async page => {
  await field(page, 'f_name').fill('SYNTHETIC COPIED');
  await field(page, 'f_dob').fill('01/02/2000');
  await field(page, 'f_inspic').check();
  await field(page, 'f_allergies').fill('Latex, Penicillin');
  await field(page, 'copyBtn').click();
  await acknowledgeCopyWarning(page);
  await field(page, 'sentBanner').waitFor();
  await chip(page, 'allergies', 'NKDA').click();
  await button(page, 'Replace with NKDA').click();
  await dialog(page).getByRole('heading', {name:'You already copied this visit'}).waitFor();
  assert.equal(await field(page, 'f_allergies').inputValue(), 'NKDA');
  await button(page, 'No, undo this edit and add a patient').click();
  await noDialog(page);
  assert.equal(await page.locator('#patients .patient').count(), 2);
  assert.equal(await field(page, 'f_allergies', 0).inputValue(), 'Latex, Penicillin');
  assert.match(await output(page, 0), /^Medication allergies: Latex, Penicillin$/m);
  assert.equal(await field(page, 'f_allergies', 1).inputValue(), '');
});

(async () => {
  const browser = await chromium.launch(launchOptions);
  let failures = 0;
  try {
    for(const {name, run} of tests){
      const context = await browser.newContext({serviceWorkers:'block', viewport:{width:810, height:1080}, hasTouch:true});
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
  console.log((tests.length - failures) + '/' + tests.length + ' shortcut replacement checks passed.');
  if(failures) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
