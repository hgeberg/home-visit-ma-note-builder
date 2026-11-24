'use strict';
// A shift saved on an earlier day offers the review that ends it.
// Synthetic visits, a controlled clock and isolated browser contexts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, launchOptions} = require('./browser.cjs');
const {acknowledgeCopyWarning} = require('./form-fixtures.cjs');
const tests = [];
const test = (name, run) => tests.push({name, run});
const appUrl = 'https://shift-age.invalid/';
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const MINUTE = 60000, HOUR = 60 * MINUTE;
// The contexts run in New York time, where these are Monday evening and the days after it.
const at = text => new Date(text + '-05:00').getTime();
const monday9pm = at('2026-11-23T21:00:00'), tuesday8am = at('2026-11-24T08:00:00'), wednesday8am = at('2026-11-25T08:00:00');
const patient = (page, n = 0) => page.locator('#patients .patient').nth(n);
const field = (page, id, n = 0) => patient(page, n).locator('[data-local-id="' + id + '"]');
const sheets = page => page.locator('#dialogHosts dialog[open]');
const sheetButtons = page => sheets(page).getByRole('button').allInnerTexts();
const sheetButton = (page, name) => sheets(page).getByRole('button', {name, exact:true});
const review = page => page.locator('#clearShiftDialog');
const savedShift = page => page.evaluate(() => JSON.parse(localStorage.getItem('hvnb_current_app_draft') || 'null'));
const office = page => page.evaluate(() => JSON.parse(localStorage.getItem('hvnb_current_office') || '[]'));
const setTime = (page, time) => page.clock.setFixedTime(new Date(time));
const leave = page => page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
// The page was in the background and is in front again.
const comeBack = page => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
// A prompt queued behind another dialog opens just after that dialog closes, so give it the chance.
const noSheet = async (page, message) => {
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 80)));
  assert.equal(await sheets(page).count(), 0, message || 'No prompt is expected');
};

async function open(page, time){
  await setTime(page, time);
  await page.goto(appUrl);
  await patient(page).waitFor();
}
async function reopen(page, time){
  await setTime(page, time);
  await page.reload();
  await patient(page).waitFor();
}
async function seed(page, name, n = 0){
  await field(page, 'f_name', n).fill(name);
  await field(page, 'f_dob', n).fill('01022000');
  await field(page, 'f_inspic', n).check();
}
async function copy(page, n = 0){
  await field(page, 'copyBtn', n).click();
  await acknowledgeCopyWarning(page);
  await field(page, 'sentBanner', n).waitFor({state:'visible'});
}
async function seenNames(page){
  await page.locator('#view-seen').click();
  const names = await page.locator('#seenList .seen-visit h3').allInnerTexts();
  await page.locator('#view-patients').click();
  return names;
}

test('A saved shift from an earlier day offers the review first; reviewing restores it and clears nothing until confirmed', async page => {
  await open(page, monday9pm);
  await seed(page, 'SYNTHETIC LABS MONDAY');
  await field(page, 'f_overnights').fill('RPP');
  await copy(page);
  await page.locator('#appendPatient').click();
  await seed(page, 'SYNTHETIC UNCOPIED MONDAY', 1);
  await leave(page);
  await reopen(page, tuesday8am);
  await sheets(page).waitFor();
  const text = await sheets(page).innerText();
  assert.match(text, /Saved shift from Monday, Nov 23/);
  assert.match(text, /Saved on this device Nov 23, 2026, 9:00\sPM\. If that shift is finished, review it and clear it to start a new one\./);
  assert.match(text, /Starting fresh opens blank forms and keeps all entered visits in Patients Seen/);
  assert.deepEqual(await sheetButtons(page), ['Review and clear shift', 'Restore all 2 patients', 'Start fresh']);
  await page.keyboard.press('Escape');
  assert.equal(await sheets(page).count(), 1, 'The choice cannot be dismissed by accident');
  await sheetButton(page, 'Review and clear shift').click();
  await review(page).waitFor({state:'visible'});
  await noSheet(page);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'cancelClearShift');
  const reviewText = await page.locator('#shiftReviewList').innerText();
  assert.match(reviewText, /SYNTHETIC UNCOPIED MONDAY[\s\S]*Not copied/);
  assert.match(reviewText, /Office: 1 patient still Incomplete[\s\S]*SYNTHETIC LABS MONDAY/);
  assert.equal(await page.locator('#clearShiftError').innerText(), '');
  assert.equal(await page.locator('#patients .patient').count(), 2, 'The shift is restored behind the review');
  await page.locator('#cancelClearShift').click();
  assert.equal(await field(page, 'f_name', 0).inputValue(), 'SYNTHETIC LABS MONDAY');
  assert.equal(await field(page, 'f_name', 1).inputValue(), 'SYNTHETIC UNCOPIED MONDAY');
  assert.equal((await office(page)).length, 1);
  await comeBack(page);
  await noSheet(page, 'The offer was already made today');
  await page.locator('#clearShiftBtn').click();
  await page.locator('#confirmClearShift').click();
  assert.equal(await page.locator('#patients .patient').count(), 1);
  assert.equal(await field(page, 'f_name').inputValue(), '');
  assert.deepEqual(await office(page), []);
  assert.equal(await savedShift(page), null);
  await reopen(page, tuesday8am + 5 * MINUTE);
  await noSheet(page, 'A cleared shift leaves nothing to ask about');
});

test('Restore and Start fresh still work on an earlier-day shift', async page => {
  await open(page, monday9pm);
  await seed(page, 'SYNTHETIC KEPT MONDAY');
  await leave(page);
  await reopen(page, tuesday8am);
  await sheetButton(page, 'Restore this visit').click();
  await noSheet(page);
  assert.equal(await field(page, 'f_name').inputValue(), 'SYNTHETIC KEPT MONDAY');
  assert.equal(await review(page).isVisible(), false);
  await comeBack(page);
  await noSheet(page, 'Restoring answered today’s offer');
  await leave(page);
  await reopen(page, tuesday8am + 10 * MINUTE);
  assert.deepEqual(await sheetButtons(page), ['Review and clear shift', 'Restore this visit', 'Start fresh'], 'Restoring changes nothing, so the shift is still from Monday');
  await sheetButton(page, 'Start fresh').click();
  await noSheet(page);
  assert.equal(await field(page, 'f_name').inputValue(), '');
  assert.deepEqual(await seenNames(page), ['SYNTHETIC KEPT MONDAY']);
  await leave(page);
  await reopen(page, tuesday8am + 20 * MINUTE);
  await noSheet(page, 'Starting fresh saved the shift today');
  assert.deepEqual(await seenNames(page), ['SYNTHETIC KEPT MONDAY']);
});

test('A shift that runs past midnight or was saved earlier the same day keeps the usual Restore prompt', async page => {
  await open(page, at('2026-11-23T23:30:00'));
  await seed(page, 'SYNTHETIC PAST MIDNIGHT');
  await leave(page);
  await reopen(page, at('2026-11-24T00:40:00'));
  assert.match(await sheets(page).innerText(), /Saved patient on this device/);
  assert.deepEqual(await sheetButtons(page), ['Restore this visit', 'Start fresh']);
  await sheetButton(page, 'Restore this visit').click();
  const saved = (await savedShift(page)).t;
  await setTime(page, saved + 4 * HOUR - MINUTE);
  await comeBack(page);
  await noSheet(page, 'Less than four hours since the last save');
  await setTime(page, saved + 4 * HOUR + MINUTE);
  await comeBack(page);
  await sheets(page).waitFor();
  assert.match(await sheets(page).innerText(), /This shift is from an earlier day[\s\S]*It was last saved Nov 23, 2026, 11:30\sPM\./);
  await sheetButton(page, 'Keep this shift').click();
  // The same calendar day, many hours later.
  await field(page, 'f_symptoms').fill('SYNTHETIC early morning');
  await leave(page);
  await reopen(page, at('2026-11-24T23:50:00'));
  assert.deepEqual(await sheetButtons(page), ['Restore this visit', 'Start fresh']);
});

test('A blank form with earlier-day Patients Seen opens with the offer, and keeping the shift does not ask again that day', async page => {
  await open(page, monday9pm);
  await seed(page, 'SYNTHETIC SEEN MONDAY');
  await copy(page);
  await field(page, 'newBtn').click();
  const confirm = sheetButton(page, 'Clear this patient');
  if(await confirm.count()) await confirm.click();
  assert.equal(await field(page, 'f_name').inputValue(), '');
  await leave(page);
  await reopen(page, tuesday8am);
  await sheets(page).waitFor();
  const text = await sheets(page).innerText();
  assert.match(text, /This shift is from an earlier day/);
  assert.match(text, /It was last saved Nov 23, 2026, 9:00\sPM\./);
  assert.match(text, /Keeping it leaves its patients, Patients Seen visits and Office entries as they are\./);
  assert.deepEqual(await sheetButtons(page), ['Review and clear shift', 'Keep this shift']);
  await sheetButton(page, 'Keep this shift').click();
  await noSheet(page);
  assert.deepEqual(await seenNames(page), ['SYNTHETIC SEEN MONDAY']);
  await comeBack(page);
  await noSheet(page);
  await leave(page);
  await reopen(page, tuesday8am + 30 * MINUTE);
  await noSheet(page, 'Opening the app today is not asked about twice');
  assert.deepEqual(await seenNames(page), ['SYNTHETIC SEEN MONDAY']);
  await leave(page);
  await reopen(page, wednesday8am);
  await sheets(page).waitFor();
  assert.match(await sheets(page).innerText(), /This shift is from an earlier day[\s\S]*It was last saved Nov 24, 2026, 8:30\sAM\./, 'Opening the app on Tuesday is the last save');
  await sheetButton(page, 'Review and clear shift').click();
  await review(page).waitFor({state:'visible'});
  assert.match(await page.locator('#shiftReviewSummary').innerText(), /^No uncopied messages/);
  await page.locator('#confirmClearShift').click();
  assert.deepEqual(await seenNames(page), []);
});

test('An open page offers a new shift when it is used again on a later day: once a day, and never over another dialog', async page => {
  await open(page, monday9pm);
  await seed(page, 'SYNTHETIC LEFT OPEN');
  await leave(page);
  await comeBack(page);
  await noSheet(page, 'The same evening');
  await setTime(page, tuesday8am);
  await page.locator('#clearShiftBtn').click();
  await comeBack(page);
  await page.locator('#cancelClearShift').click();
  await noSheet(page, 'Nothing was queued behind the open review');
  await comeBack(page);
  await sheets(page).waitFor();
  assert.match(await sheets(page).innerText(), /This shift is from an earlier day[\s\S]*It was last saved Nov 23, 2026, 9:00\sPM\./);
  assert.deepEqual(await sheetButtons(page), ['Review and clear shift', 'Keep this shift']);
  await comeBack(page);
  assert.equal(await sheets(page).count(), 1);
  await page.keyboard.press('Escape');
  await noSheet(page);
  assert.equal(await field(page, 'f_name').inputValue(), 'SYNTHETIC LEFT OPEN');
  for(const event of ['focus', 'pageshow']) await page.evaluate(type => window.dispatchEvent(new Event(type)), event);
  await comeBack(page);
  await noSheet(page, 'Once a day');
  await field(page, 'f_symptoms').fill('SYNTHETIC entered on Tuesday');
  await leave(page);
  await setTime(page, tuesday8am + 6 * HOUR);
  await comeBack(page);
  await noSheet(page, 'Work entered today keeps the shift current');
  await setTime(page, wednesday8am);
  await comeBack(page);
  await sheets(page).waitFor();
  assert.match(await sheets(page).innerText(), /It was last saved Nov 24, 2026, 8:00\sAM\./);
  await sheetButton(page, 'Review and clear shift').click();
  await review(page).waitFor({state:'visible'});
  assert.match(await page.locator('#shiftReviewList').innerText(), /SYNTHETIC LEFT OPEN[\s\S]*Not copied/);
  await page.locator('#cancelClearShift').click();
  assert.equal(await field(page, 'f_name').inputValue(), 'SYNTHETIC LEFT OPEN');
});

test('No offer for an empty app, while a Restore choice is waiting, or for a shift another window has changed', async (page, context) => {
  await open(page, monday9pm);
  await setTime(page, tuesday8am);
  await comeBack(page);
  await noSheet(page, 'Nothing is saved');
  await setTime(page, monday9pm);
  await seed(page, 'SYNTHETIC WAITING');
  await leave(page);
  await reopen(page, monday9pm + 5 * MINUTE);
  assert.match(await sheets(page).innerText(), /Saved patient on this device/);
  await setTime(page, tuesday8am);
  await comeBack(page);
  assert.equal(await sheets(page).count(), 1, 'The Restore choice is the only question');
  await sheetButton(page, 'Restore this visit').click();
  await noSheet(page);
  // Another window continues the shift, so this window's copy is no longer the saved one.
  const other = await context.newPage();
  await other.goto(appUrl);
  await other.locator('#dialogHosts dialog[open]').getByRole('button', {name:'Restore this visit', exact:true}).click();
  await other.locator('#patients .patient [data-local-id="f_symptoms"]').fill('SYNTHETIC other window');
  await other.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await other.close();
  await comeBack(page);
  await noSheet(page, 'This window no longer holds the saved shift');
  assert.equal(await page.locator('#draftWarning').isVisible(), true);
});

(async () => {
  const browser = await chromium.launch(launchOptions);
  let failures = 0;
  try {
    for(const {name, run} of tests){
      const context = await browser.newContext({serviceWorkers:'block', viewport:{width:810, height:1080}, hasTouch:true, locale:'en-US', timezoneId:'America/New_York'});
      try {
        await context.route('**/*', route => route.request().url() === appUrl
          ? route.fulfill({contentType:'text/html; charset=utf-8', body:html})
          : route.abort());
        await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
          configurable:true, value:{writeText:async () => {}}
        }));
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await run(page, context);
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
  console.log((tests.length - failures) + '/' + tests.length + ' shift age checks passed.');
  if(failures) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
