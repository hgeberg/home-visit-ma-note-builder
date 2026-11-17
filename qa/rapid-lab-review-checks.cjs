'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, launchOptions} = require('./browser.cjs');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const url = 'https://rapid-lab-audit.test/app/';
const cases = [];
const test = (name, run) => cases.push({name, run});
const patient = (page, index = 0) => page.locator('#patients .patient').nth(index);
const field = (page, id, index = 0) => patient(page, index).locator('[data-local-id="' + id + '"]');
const rapid = (page, id) => patient(page).locator('.testrow[data-item="' + id + '"]');
const warning = (page, id) => rapid(page, id).locator('[data-rapid-lab-warning]');
const result = (page, id, name) => rapid(page, id).getByRole('radio', {name, exact:true});
const selectedTest = (page, id) => rapid(page, id).getByRole('checkbox');
const awareness = (page, id, name) => result(page, id, name);
const dialog = page => page.locator('dialog[open]');
const preview = page => field(page, 'output').inputValue();
const copy = page => field(page, 'copyBtn').click();
const goBack = page => dialog(page).getByRole('button', {name:'Go back', exact:true}).click();

async function seed(page){
  for(const [id, value] of Object.entries({
    name:'SYNTHETIC RAPID LAB VISIT', dob:'01022000', temp:'98.6', weight:'125', height_ft:'5', height_in:'7'
  })) await field(page, 'f_' + id).fill(value);
  await field(page, 'f_inspic').check();
}

async function checkpoint(page){
  return page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
    return JSON.parse(localStorage.getItem('hvnb_current_app_draft'));
  });
}

test('An unmarked or negative rapid strep warns until its matching lab is entered', async page => {
  await selectedTest(page, 'strep').check();
  assert.match(await warning(page, 'strep').innerText(), /no matching overnight lab.*strep PCR or culture/i);
  await field(page, 'f_overnights').fill('4plex, UA');
  await result(page, 'strep', 'Negative').click();
  assert.equal(await warning(page, 'strep').isVisible(), true);
  await copy(page);
  assert.match(await dialog(page).innerText(), /rapid strep: no matching overnight lab/i);
  await dialog(page).getByRole('button', {name:'Copy anyway', exact:true}).click();
  await field(page, 'sentBanner').waitFor({state:'visible'});
  assert.match(await preview(page), /Rapid strep: NEGATIVE/);
  assert.equal(await field(page, 'f_overnights').inputValue(), '4plex, UA');
  await field(page, 'f_overnights').fill('4plex, UA, Strep culture');
  await dialog(page).getByRole('button', {name:'Same patient, keep editing', exact:true}).click();
  assert.equal(await warning(page, 'strep').isVisible(), false);
});

test('Respiratory PCRs match their own rapid, shared panels match both, and running is excluded', async page => {
  for(const id of ['flu', 'covid']) await selectedTest(page, id).check();
  await result(page, 'covid', 'Negative').click();
  await field(page, 'f_overnights').fill('Influenza PCR, Urine culture');
  assert.equal(await warning(page, 'flu').isVisible(), false);
  assert.equal(await warning(page, 'covid').isVisible(), true);
  await field(page, 'f_overnights').fill('COVID-19 PCR');
  assert.equal(await warning(page, 'flu').isVisible(), true);
  assert.equal(await warning(page, 'covid').isVisible(), false);
  for(const label of ['RPP', '4-plex']){
    await field(page, 'f_overnights').fill(label);
    for(const id of ['flu', 'covid']) assert.equal(await warning(page, id).isVisible(), false);
  }
  for(const id of ['flu', 'covid']) await result(page, id, 'running').click();
  await field(page, 'f_overnights').fill('Stool culture');
  for(const id of ['flu', 'covid']) assert.equal(await warning(page, id).isVisible(), false);
  await copy(page);
  await field(page, 'sentBanner').waitFor({state:'visible'});
  assert.match(await preview(page), /Rapid flu: running\nRapid COVID: running/);
});

test('An exception remains with its lab selection and expires on removal, replacement, or rapid change', async page => {
  const lab = field(page, 'f_overnights');
  const request = field(page, 'f_strep_lab_requested');
  const note = patient(page).locator('[data-field="strep_lab_note"]');
  await selectedTest(page, 'strep').check();
  await result(page, 'strep', 'Positive').click();
  await awareness(page, 'strep', 'Aware').click();
  await lab.fill('Strep throat PCR, UA');
  assert.equal(await note.isVisible(), true);
  await copy(page);
  assert.match(await dialog(page).innerText(), /specifically requested by the clinician/i);
  await goBack(page);
  await request.check();
  assert.equal(await note.isVisible(), false);
  await lab.fill('UA, Strep throat PCR');
  assert.equal(await request.isChecked(), true);
  await lab.fill('UA, Strep culture');
  assert.equal(await request.isChecked(), false);
  assert.equal(await note.isVisible(), true);
  await request.check();
  await lab.fill('UA');
  await lab.fill('UA, Strep culture');
  assert.equal(await request.isChecked(), false);
  await request.check();
  await result(page, 'strep', 'running').click();
  await result(page, 'strep', 'Positive').click();
  assert.equal(await request.isChecked(), false);
  assert.equal(await lab.inputValue(), 'UA, Strep culture');
});

test('A typed PCR cautions for its positive rapid only', async page => {
  const lab = field(page, 'f_overnights');
  const request = field(page, 'f_viral_lab_requested');
  await selectedTest(page, 'flu').check();
  await result(page, 'flu', 'Positive').click();
  await result(page, 'flu', 'A').click();
  await awareness(page, 'flu', 'Aware').click();
  await lab.fill('COVID PCR');
  assert.equal(await request.isVisible(), false);
  await lab.fill('Influenza PCR');
  assert.equal(await request.isVisible(), true);
  await request.check();
  await lab.fill('4plex');
  assert.equal(await request.isChecked(), false);
  await lab.fill('Viral PCR');
  assert.equal(await request.isVisible(), true);
  await copy(page);
  assert.match(await dialog(page).innerText(), /positive rapid flu \/ COVID.*specifically requested/i);
});

test('Awareness is recorded separately and clears when the result or flu type changes', async page => {
  await selectedTest(page, 'strep').check();
  await result(page, 'strep', 'Positive').click();
  await awareness(page, 'strep', 'Aware').click();
  await selectedTest(page, 'flu').check();
  await result(page, 'flu', 'Positive').click();
  await result(page, 'flu', 'A').click();
  assert.equal(await awareness(page, 'flu', 'Aware').getAttribute('aria-checked'), 'false');
  assert.doesNotMatch(await preview(page), /Rapid flu: POSITIVE \(A\)\nPATIENT/);
  await awareness(page, 'flu', 'Unaware').click();
  assert.match(await preview(page), /Rapid strep: POSITIVE\nPATIENT AWARE\nRapid flu: POSITIVE \(A\)\nPATIENT UNAWARE/);
  await result(page, 'flu', 'B').click();
  assert.equal(await awareness(page, 'flu', 'Unaware').getAttribute('aria-checked'), 'false');
  await selectedTest(page, 'strep').uncheck();
  await selectedTest(page, 'strep').check();
  await result(page, 'strep', 'Positive').click();
  assert.equal(await awareness(page, 'strep', 'Aware').getAttribute('aria-checked'), 'false');
  await selectedTest(page, 'covid').check();
  await result(page, 'covid', 'Positive').click();
  assert.equal(await awareness(page, 'covid', 'Aware').getAttribute('aria-checked'), 'false');
  await copy(page);
  const review = await dialog(page).innerText();
  assert.match(review, /patient aware of positive.*not marked for Rapid strep/i);
  assert.match(review, /patient aware of positive.*not marked for Rapid flu/i);
  assert.match(review, /patient aware of positive.*not marked for Rapid COVID/i);
});

test('New scoped answers survive reopening, while legacy answers remain available for review', async (page, context) => {
  await selectedTest(page, 'strep').check();
  await result(page, 'strep', 'Positive').click();
  await awareness(page, 'strep', 'Aware').click();
  await field(page, 'f_overnights').fill('Strep throat PCR');
  await field(page, 'f_strep_lab_requested').check();
  await checkpoint(page);
  await page.reload();
  await page.getByRole('button', {name:'Restore this visit', exact:true}).click();
  assert.equal(await awareness(page, 'strep', 'Aware').getAttribute('aria-checked'), 'true');
  assert.equal(await field(page, 'f_strep_lab_requested').isChecked(), true);

  const old = await checkpoint(page);
  old.patients[0].vals.aware = 'Unaware';
  delete old.patients[0].vals.tests.strep.aware;
  old.patients[0].vals.strep_lab_requested = true;
  await page.close();
  const restored = await context.newPage();
  await restored.addInitScript(value => {
    localStorage.setItem('hvnb_current_app_draft', JSON.stringify(value));
    sessionStorage.removeItem('hvnb_current_draft');
  }, old);
  await restored.goto(url);
  await restored.getByRole('button', {name:'Restore this visit', exact:true}).click();
  assert.equal(await awareness(restored, 'strep', 'Unaware').getAttribute('aria-checked'), 'false');
  assert.equal(await field(restored, 'f_strep_lab_requested').isChecked(), false);
  await restored.getByText('Preserved answers (2)', {exact:true}).click();
  assert.match(await patient(restored).locator('.preserved-answers').innerText(), /previous answer, scope unknown.*Unaware/i);
  assert.match(await patient(restored).locator('.preserved-answers').innerText(), /previous answer, scope unknown.*Checked/i);
});

test('A non-blood lab name containing blood does not enable bloodwork prompts', async page => {
  const labs = field(page, 'f_overnights'), reason = field(page, 'f_bloodreason');
  await labs.fill('Fecal occult blood test');
  assert.equal(await reason.isVisible(), false);
  for(const name of ['Blood', 'Urine culture, Blood work', 'Blood: CBC']) {
    await labs.fill(name);
    assert.equal(await reason.isVisible(), true);
  }
});

(async () => {
  let failed = 0;
  const browser = await chromium.launch(launchOptions);
  try {
    for(const entry of cases){
      const context = await browser.newContext({serviceWorkers:'block', viewport:{width:390, height:840}});
      context.setDefaultTimeout(10000);
      await context.route('**/*', route => route.request().url() === url
        ? route.fulfill({body:html, contentType:'text/html; charset=utf-8'})
        : route.abort());
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', {value:{writeText:() => Promise.resolve()}});
      });
      const errors = [];
      context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
      const page = await context.newPage();
      try {
        await page.goto(url);
        await seed(page);
        await entry.run(page, context);
        assert.deepEqual(errors, []);
        console.log('PASS ' + entry.name);
      } catch(error) {
        failed++;
        console.error('FAIL ' + entry.name + '\n' + (error.stack || error));
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log((cases.length - failed) + '/' + cases.length + ' rapid lab review browser checks passed.');
  if(failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
