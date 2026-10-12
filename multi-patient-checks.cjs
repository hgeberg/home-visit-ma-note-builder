/* Browser regression checks use synthetic patients and an isolated browser profile. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const playwrightPath = process.env.PLAYWRIGHT_MODULE ||
  'C:/Users/Hillel/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(playwrightPath);
const htmlPath = path.join(__dirname, 'index.html');
const browserCandidates = [
  process.env.PLAYWRIGHT_CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);
const executablePath = browserCandidates.find(candidate => fs.existsSync(candidate));
const tests = [];
const test = (name, run) => tests.push({ name, run });
const local = (root, id) => root.locator(`[data-local-id="${id}"]`);
const patients = page => page.locator('.patient');
const patient = (page, index) => patients(page).nth(index);
const output = root => local(root, 'output').inputValue();
const draft = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('hvnb_draft')));
const office = page => page.evaluate(() => JSON.parse(localStorage.getItem('hvnb_office') || '[]'));
const dialog = root => root.page().locator('#dialogHosts [role="dialog"]');

async function fillPatient(root, name, symptoms = '') {
  await local(root, 'f_name').fill(name);
  await local(root, 'f_dob').fill('01012000');
  await local(root, 'f_inspic').check();
  if (symptoms) await local(root, 'f_symptoms').fill(symptoms);
}

async function addAfter(page, index) {
  const count = await patients(page).count();
  await patient(page, index).getByRole('button', { name: /add another patient/i }).click();
  await page.waitForFunction(expected => document.querySelectorAll('.patient').length === expected, count + 1);
}

async function markTest(root, id, result, subtype) {
  await local(root, `t_tests_${id}`).check();
  const row = root.locator(`.testrow[data-item="${id}"]`);
  if (result) await row.locator(`[data-r="${result}"]`).click();
  if (subtype) await row.locator(`[data-s="${subtype}"]`).click();
}

async function flushDraft(page, names) {
  await page.waitForFunction(expected => {
    const saved = JSON.parse(sessionStorage.getItem('hvnb_draft') || 'null');
    return saved && saved.version === 2 && Array.isArray(saved.patients) &&
      JSON.stringify(saved.patients.map(p => p.vals.name || '')) === JSON.stringify(expected);
  }, names);
  return draft(page);
}

async function restore(page) {
  await page.getByRole('button', { name: /^Restore/i }).first().click();
}

test('independent patient values, test results, conditional fields, and checklist mirrors', async ({ page }) => {
  const first = patient(page, 0);
  await fillPatient(first, 'TEST ALPHA', 'unfinished alpha symptoms');
  await markTest(first, 'flu', 'Positive', 'A');
  await first.locator('[data-choice="aware"][data-v="Unaware"]').click();
  await addAfter(page, 0);
  const second = patient(page, 1);
  await fillPatient(second, 'TEST BETA', 'beta concern');
  await markTest(second, 'strep', 'Negative');
  await local(second, 'f_inspic').uncheck();
  assert.match(await output(first), /TEST ALPHA/);
  assert.match(await output(first), /POSITIVE/);
  assert.match(await output(first), /UN[A-Z]*WARE/);
  assert.doesNotMatch(await output(first), /TEST BETA|beta concern|NEGATIVE/);
  assert.match(await output(second), /TEST BETA/);
  assert.match(await output(second), /NEGATIVE/);
  assert.doesNotMatch(await output(second), /TEST ALPHA|alpha symptoms|POSITIVE|UN[A-Z]*WARE/);
  assert.equal(await first.locator('[data-field="aware"]').isVisible(), true);
  assert.equal(await second.locator('[data-field="aware"]').isVisible(), false);
  await local(first, 'tab-check').click();
  await local(first, 'f_k_confirm').check();
  assert.equal(await local(first, 'm_k_inspic').isChecked(), true);
  await local(second, 'tab-check').click();
  assert.equal(await local(second, 'f_k_confirm').isChecked(), false);
  assert.equal(await local(second, 'm_k_inspic').isChecked(), false);
  await local(second, 'm_k_inspic').check();
  await local(second, 'tab-visit').click();
  assert.equal(await local(second, 'f_inspic').isChecked(), true);
  await local(first, 'tab-visit').click();
  await local(first, 'f_symptoms').fill('alpha completed later');
  assert.match(await output(first), /alpha completed later/);
  assert.match(await output(second), /beta concern/);
  const qaDirectory = path.join(__dirname, 'qa');
  fs.mkdirSync(qaDirectory, { recursive: true });
  for (const viewport of [{ name: 'desktop', width: 1280, height: 1000 }, { name: 'mobile', width: 375, height: 1000 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await local(first, 'output').evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 150));
    await page.screenshot({ path: path.join(qaDirectory, `multi-patient-${viewport.name}.png`) });
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    assert.equal(dimensions.document <= dimensions.viewport, true, `${viewport.name} has no horizontal overflow: ${JSON.stringify(dimensions)}`);
    console.log(`QA ${viewport.name}: ${dimensions.viewport}px viewport, ${dimensions.document}px document, screenshot saved`);
  }
});

test('add in the middle and at the end, with thirteen independent forms and no duplicate IDs', async ({ page }) => {
  await fillPatient(patient(page, 0), 'TEST FIRST');
  await addAfter(page, 0);
  await fillPatient(patient(page, 1), 'TEST LAST');
  await addAfter(page, 0);
  await fillPatient(patient(page, 1), 'TEST MIDDLE');
  assert.equal(await local(patient(page, 2), 'f_name').inputValue(), 'TEST LAST');
  for (let index = 3; index < 13; index++) {
    await addAfter(page, index - 1);
    await fillPatient(patient(page, index), `TEST PATIENT ${index + 1}`);
  }
  assert.equal(await patients(page).count(), 13);
  assert.equal(await local(patient(page, 0), 'f_name').inputValue(), 'TEST FIRST');
  assert.equal(await local(patient(page, 1), 'f_name').inputValue(), 'TEST MIDDLE');
  assert.equal(await local(patient(page, 2), 'f_name').inputValue(), 'TEST LAST');
  const issues = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
    const duplicateIds = ids.filter((id, i) => ids.indexOf(id) !== i);
    const badLabels = [...document.querySelectorAll('label[for]')].filter(el => !document.getElementById(el.htmlFor)).map(el => el.htmlFor);
    const badReferences = [...document.querySelectorAll('[aria-labelledby],[aria-controls]')].flatMap(el =>
      ['aria-labelledby', 'aria-controls'].flatMap(attr => (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean).filter(id => !document.getElementById(id))));
    return { duplicateIds, badLabels, badReferences };
  });
  assert.deepEqual(issues, { duplicateIds: [], badLabels: [], badReferences: [] });
  const saved = await draft(page);
  assert.equal(saved.patients.length, 13);
});

test('copy buttons copy their own output and create separate shared office records', async ({ page }) => {
  await fillPatient(patient(page, 0), 'TEST COPY ALPHA', 'alpha only');
  await markTest(patient(page, 0), 'ears');
  await local(patient(page, 0), 'f_overnights').fill('4plex');
  await addAfter(page, 0);
  await fillPatient(patient(page, 1), 'TEST COPY BETA', 'beta only');
  await markTest(patient(page, 1), 'urine');
  await local(patient(page, 1), 'f_overnights').fill('Urine culture');
  const alphaOutput = await output(patient(page, 0));
  const betaOutput = await output(patient(page, 1));
  await local(patient(page, 0), 'copyBtn').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('hvnb_office') || '[]').length === 1);
  await local(patient(page, 1), 'copyBtn').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('hvnb_office') || '[]').length === 2);
  assert.deepEqual(await page.evaluate(() => window.__copies), [alphaOutput, betaOutput]);
  const records = await office(page);
  assert.deepEqual(records.map(record => record.name), ['TEST COPY ALPHA', 'TEST COPY BETA']);
  assert.notEqual(records[0].id, records[1].id);
  const saved = await flushDraft(page, ['TEST COPY ALPHA', 'TEST COPY BETA']);
  assert.notEqual(saved.patients[0].meta.officeId, saved.patients[1].meta.officeId);
  assert.match(saved.patients[0].meta.sentText, /alpha only/);
  assert.doesNotMatch(saved.patients[0].meta.sentText, /beta only/);
  for (let index = 0; index < 2; index++) {
    await page.locator('#view-patients').click();
    await local(patient(page, index), 'tab-office').click();
    assert.match(await page.locator('#officeContent').innerText(), /TEST COPY ALPHA/);
    assert.match(await page.locator('#officeContent').innerText(), /TEST COPY BETA/);
  }
});

test('pending clipboard completion retains the original patient and value snapshot', async ({ page }) => {
  await fillPatient(patient(page, 0), 'TEST ASYNC ALPHA', 'before copying');
  await markTest(patient(page, 0), 'ears');
  await local(patient(page, 0), 'f_overnights').fill('Strep throat PCR');
  await addAfter(page, 0);
  await fillPatient(patient(page, 1), 'TEST ASYNC BETA', 'beta original');
  await page.evaluate(() => { window.__deferCopy = true; });
  const copiedOutput = await output(patient(page, 0));
  await local(patient(page, 0), 'copyBtn').click();
  await page.waitForFunction(() => typeof window.__resolveCopy === 'function');
  await local(patient(page, 0), 'f_symptoms').fill('changed while clipboard was pending');
  await local(patient(page, 1), 'f_symptoms').fill('beta still separate');
  await page.evaluate(() => { window.__resolveCopy(); });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('hvnb_office') || '[]').length === 1);
  assert.deepEqual(await page.evaluate(() => window.__copies), [copiedOutput]);
  const saved = await flushDraft(page, ['TEST ASYNC ALPHA', 'TEST ASYNC BETA']);
  assert.equal(saved.patients[0].meta.sentVals.symptoms, 'before copying');
  assert.equal(saved.patients[0].vals.symptoms, 'changed while clipboard was pending');
  assert.equal(saved.patients[1].meta.sentAt, null);
  assert.equal((await office(page))[0].name, 'TEST ASYNC ALPHA');
});

test('the copied-patient guard can undo the edit and append a blank patient', async ({ page }) => {
  const first = patient(page, 0);
  await fillPatient(first, 'TEST UNDO ORIGINAL', 'copied original symptoms');
  const originalOutput = await output(first);
  await local(first, 'copyBtn').click();
  await local(first, 'sentBanner').waitFor({ state: 'visible' });
  await local(first, 'f_symptoms').fill('accidental next patient symptoms');
  const guard = dialog(first);
  assert.match(await guard.innerText(), /You already copied this visit/);
  await guard.getByRole('button', { name: /^No, undo this edit and add a patient$/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.patient').length === 2);
  assert.equal(await local(first, 'f_symptoms').inputValue(), 'copied original symptoms');
  assert.equal(await output(first), originalOutput);
  assert.equal(await local(patient(page, 1), 'f_name').inputValue(), '');
  assert.equal(await local(patient(page, 1), 'f_symptoms').inputValue(), '');
  assert.equal(await output(patient(page, 1)), '');
  const saved = await flushDraft(page, ['TEST UNDO ORIGINAL', '']);
  assert.equal(saved.patients[0].vals.symptoms, 'copied original symptoms');
  assert.equal(saved.patients[1].meta.sentAt, null);
});

test('clearing warns about uncopied changes and never saves an uncopied patient to Office', async ({ page }) => {
  const first = patient(page, 0);
  await fillPatient(first, 'TEST CLEAR WARNING', 'already copied symptoms');
  await local(first, 'copyBtn').click();
  await local(first, 'sentBanner').waitFor({ state: 'visible' });
  assert.deepEqual(await office(page), []);
  await markTest(first, 'ears');
  await dialog(first).getByRole('button', { name: 'Same patient, keep editing', exact: true }).click();
  await local(first, 'newBtn').click();
  const warning = dialog(first);
  assert.match(await warning.innerText(), /Those changes haven.t been copied/);
  assert.equal(await warning.getByRole('button', { name: 'Copy it again first', exact: true }).isVisible(), true);
  assert.doesNotMatch(await warning.innerText(), /These office steps aren.t on your office list yet/);
  await warning.getByRole('button', { name: 'Clear this patient', exact: true }).click();
  assert.equal(await dialog(first).count(), 0);
  assert.equal(await local(first, 'f_name').inputValue(), '');
  assert.equal(await local(first, 't_tests_ears').isChecked(), false);
  assert.deepEqual(await office(page), []);
});

test('session-storage quota failure warns visibly and preserves both patients in memory', async ({ page }) => {
  await fillPatient(patient(page, 0), 'TEST QUOTA ALPHA', 'alpha before quota');
  await addAfter(page, 0);
  await fillPatient(patient(page, 1), 'TEST QUOTA BETA', 'beta before quota');
  await flushDraft(page, ['TEST QUOTA ALPHA', 'TEST QUOTA BETA']);
  await page.evaluate(() => {
    window.__originalStorageSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === sessionStorage && key === 'hvnb_draft') throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return window.__originalStorageSetItem.call(this, key, value);
    };
  });
  await local(patient(page, 0), 'f_symptoms').fill('alpha kept despite quota');
  await local(patient(page, 1), 'f_symptoms').fill('beta kept despite quota');
  await page.locator('#draftWarning').waitFor({ state: 'visible' });
  assert.match(await page.locator('#draftWarning').innerText(), /Drafts could not be saved/);
  assert.equal(await patients(page).count(), 2);
  assert.equal(await local(patient(page, 0), 'f_symptoms').inputValue(), 'alpha kept despite quota');
  assert.equal(await local(patient(page, 1), 'f_symptoms').inputValue(), 'beta kept despite quota');
  assert.match(await output(patient(page, 0)), /alpha kept despite quota/);
  assert.match(await output(patient(page, 1)), /beta kept despite quota/);
  await page.evaluate(() => { Storage.prototype.setItem = window.__originalStorageSetItem; });
  await local(patient(page, 0), 'f_notes').fill('storage recovered');
  await page.locator('#draftWarning').waitFor({ state: 'hidden' });
  const saved = await draft(page);
  assert.equal(saved.patients[0].vals.symptoms, 'alpha kept despite quota');
  assert.equal(saved.patients[1].vals.symptoms, 'beta kept despite quota');
});

test('reload restores all unfinished patients, a blank appended patient, and checklist state', async ({ page }) => {
  await fillPatient(patient(page, 0), 'TEST RESTORE ALPHA', 'incomplete first patient');
  await local(patient(page, 0), 'tab-check').click();
  await local(patient(page, 0), 'f_k_confirm').check();
  await local(patient(page, 0), 'tab-visit').click();
  await addAfter(page, 0);
  await fillPatient(patient(page, 1), 'TEST RESTORE BETA', 'incomplete second patient');
  await addAfter(page, 1);
  await flushDraft(page, ['TEST RESTORE ALPHA', 'TEST RESTORE BETA', '']);
  await page.reload();
  await restore(page);
  await page.waitForFunction(() => document.querySelectorAll('.patient').length === 3);
  assert.equal(await local(patient(page, 0), 'f_symptoms').inputValue(), 'incomplete first patient');
  assert.equal(await local(patient(page, 1), 'f_symptoms').inputValue(), 'incomplete second patient');
  assert.equal(await local(patient(page, 2), 'f_name').inputValue(), '');
  await local(patient(page, 0), 'tab-check').click();
  assert.equal(await local(patient(page, 0), 'f_k_confirm').isChecked(), true);
  await local(patient(page, 1), 'tab-check').click();
  assert.equal(await local(patient(page, 1), 'f_k_confirm').isChecked(), false);
});

test('clearing one patient preserves the other patient and the aggregate draft', async ({ page }) => {
  await fillPatient(patient(page, 0), 'TEST CLEAR ALPHA', 'clear only this');
  await addAfter(page, 0);
  await fillPatient(patient(page, 1), 'TEST KEEP BETA', 'keep this unfinished');
  await local(patient(page, 0), 'newBtn').click();
  const confirm = dialog(patient(page, 0)).getByRole('button', { name: /^Clear (?:and start|this patient|patient)/i });
  await confirm.click();
  assert.equal(await patients(page).count(), 2);
  assert.equal(await local(patient(page, 0), 'f_name').inputValue(), '');
  assert.equal(await local(patient(page, 1), 'f_name').inputValue(), 'TEST KEEP BETA');
  assert.match(await output(patient(page, 1)), /keep this unfinished/);
  await flushDraft(page, ['', 'TEST KEEP BETA']);
});

test('shared layout edits update all forms without changing either patient value', async ({ page }) => {
  await fillPatient(patient(page, 0), 'TEST LAYOUT ALPHA', 'alpha layout value');
  await addAfter(page, 0);
  await fillPatient(patient(page, 1), 'TEST LAYOUT BETA', 'beta layout value');
  await local(patient(page, 0), 'editBtn').click();
  await local(patient(page, 0), 'e_label_symptoms').fill('Current concerns');
  await local(patient(page, 0), 'e_label_symptoms').blur();
  await page.waitForFunction(() => [...document.querySelectorAll('.patient')].every(root =>
    root.querySelector('[data-local-id="output"]').value.includes('Current concerns:')));
  assert.equal(await local(patient(page, 0), 'f_symptoms').inputValue(), 'alpha layout value');
  assert.equal(await local(patient(page, 1), 'f_symptoms').inputValue(), 'beta layout value');
  assert.match(await output(patient(page, 0)), /Current concerns: alpha layout value/);
  assert.match(await output(patient(page, 1)), /Current concerns: beta layout value/);
});

test('the original single-patient draft restores and migrates to the aggregate format', async ({ page, origin }) => {
  await page.evaluate(() => {
    sessionStorage.setItem('hvnb_draft', JSON.stringify({
      t: Date.now(), vals: { name: 'TEST LEGACY', dob: '01/01/2000', symptoms: 'legacy unfinished', k_confirm: true },
      meta: { sentAt: null, sentText: '', sentVals: null, sentAck: false, officeId: null, officeSkipped: false },
    }));
  });
  // A fresh tab sharing a copied legacy draft avoids pagehide replacing our test seed.
  const legacy = await page.context().newPage();
  await legacy.addInitScript(() => {
    sessionStorage.setItem('hvnb_draft', JSON.stringify({
      t: Date.now(), vals: { name: 'TEST LEGACY', dob: '01/01/2000', symptoms: 'legacy unfinished', k_confirm: true },
      meta: { sentAt: null, sentText: '', sentVals: null, sentAck: false, officeId: null, officeSkipped: false },
    }));
  });
  await legacy.goto(origin);
  await restore(legacy);
  assert.equal(await patients(legacy).count(), 1);
  assert.equal(await local(patient(legacy, 0), 'f_name').inputValue(), 'TEST LEGACY');
  assert.match(await output(patient(legacy, 0)), /legacy unfinished/);
  await local(patient(legacy, 0), 'tab-check').click();
  assert.equal(await local(patient(legacy, 0), 'f_k_confirm').isChecked(), true);
  const saved = await flushDraft(legacy, ['TEST LEGACY']);
  assert.equal(saved.version, 2);
});

(async () => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(fs.readFileSync(htmlPath));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}/`;
  let browser;
  let failed = 0;
  try {
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    for (const entry of tests) {
      const context = await browser.newContext();
      const errors = [];
      await context.addInitScript(() => {
        window.__copies = [];
        window.__deferCopy = false;
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
          writeText(text) {
            window.__copies.push(text);
            if (window.__deferCopy) return new Promise(resolve => { window.__resolveCopy = resolve; });
            return Promise.resolve();
          },
        } });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(origin);
        await patients(page).first().waitFor();
        await entry.run({ page, origin });
        assert.deepEqual(errors, [], 'No browser JavaScript errors');
        console.log(`PASS ${entry.name}`);
      } catch (error) {
        failed++;
        console.error(`FAIL ${entry.name}\n${error.stack || error}`);
        if (errors.length) console.error(`Browser errors: ${errors.join('; ')}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log(`\n${tests.length - failed}/${tests.length} multi-patient browser checks passed.`);
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
