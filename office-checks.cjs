/* Office regression checks use synthetic patients and an isolated browser profile. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const {chromium, launchOptions} = require('./qa/browser.cjs');
const tests = [];
const test = (name, run) => tests.push({ name, run });
const local = (root, id) => root.locator(`[data-local-id="${id}"]`);
const patients = page => page.locator('.patient');
const patient = (page, index = 0) => patients(page).nth(index);
const cards = page => page.locator('#officeContent .office-patient');
const records = page => page.evaluate(() => JSON.parse(localStorage.getItem('hvnb_current_office') || '[]'));
const draft = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('hvnb_current_draft') || 'null'));
const dialog = root => root.page().locator('#dialogHosts [role="dialog"]');
const showOffice = page => page.locator('#view-office').click();
const showPatients = page => page.locator('#view-patients').click();

async function fillPatient(root, name, overnights = '') {
  await local(root, 'f_name').fill(name);
  await local(root, 'f_dob').fill('01012000');
  await local(root, 'f_inspic').check();
  if (overnights) await local(root, 'f_overnights').fill(overnights);
}

async function addAfter(page, index) {
  const count = await patients(page).count();
  await patient(page, index).getByRole('button', { name: /add another patient/i }).click();
  await page.waitForFunction(expected => document.querySelectorAll('.patient').length === expected, count + 1);
}

async function copyPatient(page, root, expectedCount) {
  await local(root, 'copyBtn').click();
  await local(root, 'sentBanner').waitFor({ state: 'visible' });
  if (expectedCount !== undefined) {
    await page.waitForFunction(count => JSON.parse(localStorage.getItem('hvnb_current_office') || '[]').length === count, expectedCount);
  }
}

async function allowSamePatient(root) {
  const guard = dialog(root);
  if (await guard.isVisible()) {
    await guard.getByRole('button', { name: 'Same patient, keep editing', exact: true }).click();
  }
}

async function changeCopied(root, field, value) {
  await local(root, field).fill(value);
  await allowSamePatient(root);
}

async function clearPatient(root) {
  await local(root, 'newBtn').click();
  const confirmation = dialog(root);
  if (await confirmation.isVisible()) await confirmation.getByRole('button', { name: 'Clear this patient', exact: true }).click();
  assert.equal(await local(root, 'f_name').inputValue(), '');
}

test('Office is its own view with one reference checklist beneath the saved patient list', async ({ page }) => {
  assert.equal(await page.locator('#officeSection').isVisible(), false);
  assert.equal(await page.locator('#patients').isVisible(), true);
  assert.equal(await page.locator('[data-office-reference]').count(), 1);
  await addAfter(page, 0);
  await addAfter(page, 0);
  await addAfter(page, 2);
  assert.equal(await page.locator('[data-office-reference]').count(), 1);
  assert.equal(await page.locator('.patient .office-patient').count(), 0);
  assert.equal(await page.locator('.patient [data-office-reference]').count(), 0);
  assert.equal(await page.evaluate(() => {
    const reference = document.querySelector('[data-office-reference]');
    return !!(document.querySelector('#officeContent').compareDocumentPosition(reference) & Node.DOCUMENT_POSITION_FOLLOWING);
  }), true, 'The shared reference appears below the saved Office patients');
  const first = patient(page);
  await local(first, 'tab-office').click();
  assert.equal(await page.locator('#officeSection').isVisible(), true);
  assert.equal(await page.locator('#patients').isVisible(), false);
  assert.equal(await local(first, 'tab-visit').getAttribute('aria-selected'), 'true');
  await showPatients(page);
  assert.equal(await local(first, 'panel-visit').isVisible(), true);
  await local(first, 'tab-check').click();
  await local(first, 'tab-office').click();
  assert.equal(await local(first, 'tab-check').getAttribute('aria-selected'), 'true');
  await showPatients(page);
  assert.equal(await local(first, 'panel-check').isVisible(), true);
  assert.equal(await page.getByRole('button', { name: /^Save to Office$/i }).count(), 0);
});

test('only Copy saves, with separate exact overnight orders and blood reason for each patient', async ({ page }) => {
  const first = patient(page);
  const alphaTests = 'RPP, Blood: CBC + CMP; send-out custom panel <alpha>';
  const bloodReason = 'Persistent symptoms; provider requested CBC/CMP';
  await fillPatient(first, 'TEST OFFICE ALPHA', `  ${alphaTests}  `);
  await local(first, 'f_bloodreason').fill(`  ${bloodReason}  `);
  await addAfter(page, 0);
  const second = patient(page, 1);
  const betaTests = 'Urine culture; custom assay 123 / NOT RPP';
  await fillPatient(second, 'TEST OFFICE BETA', betaTests);
  assert.deepEqual(await records(page), [], 'Entering patient details alone does not save to Office');
  assert.equal(await cards(page).count(), 0);
  const alphaOutput = await local(first, 'output').inputValue();
  const betaOutput = await local(second, 'output').inputValue();
  await copyPatient(page, first, 1);
  await copyPatient(page, second, 2);
  const saved = await records(page);
  assert.deepEqual(saved.map(item => item.name), ['TEST OFFICE ALPHA', 'TEST OFFICE BETA']);
  assert.equal(saved[0].overnights, alphaTests);
  assert.equal(saved[0].bloodreason, bloodReason);
  assert.equal(saved[1].overnights, betaTests);
  assert.notEqual(saved[0].id, saved[1].id);
  assert.deepEqual(await page.evaluate(() => window.__copies), [alphaOutput, betaOutput]);
  assert.equal(await cards(page).count(), 2);
  const firstCard = cards(page).filter({ hasText: 'TEST OFFICE ALPHA' });
  const secondCard = cards(page).filter({ hasText: 'TEST OFFICE BETA' });
  assert.equal(await firstCard.getAttribute('data-office-id'), saved[0].id);
  assert.equal(await secondCard.getAttribute('data-office-id'), saved[1].id);
  assert.ok((await firstCard.innerText()).includes(alphaTests));
  assert.ok((await firstCard.innerText()).includes(bloodReason));
  assert.ok(!(await firstCard.innerText()).includes(betaTests));
  assert.ok((await secondCard.innerText()).includes(betaTests));
  assert.ok(!(await secondCard.innerText()).includes(bloodReason));
  assert.equal(await cards(page).locator('input[type="checkbox"]').count(), 0, 'Saved patient cards have no task checklists');
});

test('rapid-only visits and empty or negative overnight placeholders never add Office cards', async ({ page }) => {
  const root = patient(page);
  await fillPatient(root, 'TEST RAPID ONLY');
  await local(root, 't_tests_strep').check();
  await root.locator('.testrow[data-item="strep"] [data-r="Negative"]').click();
  await copyPatient(page, root, 0);
  for (const value of ['None', 'No', 'N/A', 'Nothing', '-', '  none  ', '']) {
    await changeCopied(root, 'f_overnights', value);
    await copyPatient(page, root, 0);
    assert.equal(await cards(page).count(), 0, `No Office card for ${JSON.stringify(value)}`);
  }
});

test('edits remain unsaved until recopy, which updates the same record and removes None orders', async ({ page }) => {
  const root = patient(page);
  await fillPatient(root, 'TEST RECOPY', '4plex');
  await copyPatient(page, root, 1);
  const original = (await records(page))[0];
  await changeCopied(root, 'f_overnights', 'Strep throat PCR, urine culture');
  assert.equal((await records(page))[0].overnights, '4plex');
  assert.match(await cards(page).innerText(), /4plex/);
  await copyPatient(page, root, 1);
  const updated = (await records(page))[0];
  assert.equal(updated.id, original.id);
  assert.equal(updated.overnights, 'Strep throat PCR, urine culture');
  await copyPatient(page, root, 1);
  assert.equal((await records(page))[0].id, original.id, 'Repeated copy does not create duplicates');
  await changeCopied(root, 'f_overnights', 'None');
  assert.equal((await records(page))[0].overnights, 'Strep throat PCR, urine culture');
  await copyPatient(page, root, 0);
  assert.equal(await cards(page).count(), 0);
});

test('clearing a patient retains the saved Copy snapshot and never saves uncopied orders', async ({ page }) => {
  const root = patient(page);
  await fillPatient(root, 'TEST CLEAR SAVED', '4plex');
  await copyPatient(page, root, 1);
  const original = await records(page);
  await changeCopied(root, 'f_overnights', 'RPP, urine culture');
  await clearPatient(root);
  assert.deepEqual(await records(page), original, 'Clear must not synchronize unsaved order edits');
  await fillPatient(root, 'TEST CLEAR NEVER COPIED', 'Custom overnight');
  await clearPatient(root);
  assert.deepEqual(await records(page), original, 'Clear must not add a new Office record');
  assert.equal(await page.getByRole('button', { name: /Add it, then clear|Add to office list/i }).count(), 0);
});

test('pending clipboard completion stores the exact patient snapshot taken at Copy', async ({ page }) => {
  const root = patient(page);
  await fillPatient(root, 'TEST ASYNC OFFICE', 'Blood: CBC, CMP');
  await local(root, 'f_bloodreason').fill('Original blood reason');
  await page.evaluate(() => { window.__deferCopy = true; });
  await local(root, 'copyBtn').click();
  await page.waitForFunction(() => typeof window.__resolveCopy === 'function');
  await local(root, 'f_overnights').fill('Blood: changed panel');
  await local(root, 'f_bloodreason').fill('Changed while clipboard pending');
  assert.deepEqual(await records(page), []);
  await page.evaluate(() => { window.__resolveCopy(); });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('hvnb_current_office') || '[]').length === 1);
  const saved = (await records(page))[0];
  assert.equal(saved.overnights, 'Blood: CBC, CMP');
  assert.equal(saved.bloodreason, 'Original blood reason');
  assert.equal(await local(root, 'f_overnights').inputValue(), 'Blood: changed panel');
});

test('Office persists across reload and new tabs while unfinished multi-patient drafts restore', async ({ page, origin }) => {
  await fillPatient(patient(page), 'TEST PERSIST ALPHA', '4plex');
  await copyPatient(page, patient(page), 1);
  await addAfter(page, 0);
  await fillPatient(patient(page, 1), 'TEST PERSIST BETA', 'RPP');
  await copyPatient(page, patient(page, 1), 2);
  await addAfter(page, 1);
  await fillPatient(patient(page, 2), 'TEST UNFINISHED', 'Blood');
  await local(patient(page, 2), 'f_bloodreason').fill('Not copied yet');
  const before = await records(page);
  await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('hvnb_current_draft') || '{}').patients?.length === 3);
  await page.reload();
  assert.deepEqual(await records(page), before);
  assert.equal(await cards(page).count(), 2);
  await page.getByRole('button', { name: /^Restore/i }).first().click();
  assert.equal(await patients(page).count(), 3);
  assert.equal(await local(patient(page, 2), 'f_name').inputValue(), 'TEST UNFINISHED');
  assert.equal(await local(patient(page, 2), 'f_bloodreason').inputValue(), 'Not copied yet');
  const savedDraft = await draft(page);
  assert.equal(savedDraft.patients[0].meta.officeId, before[0].id);
  assert.equal(savedDraft.patients[1].meta.officeId, before[1].id);
  const secondTab = await page.context().newPage();
  await secondTab.goto(origin);
  assert.equal(await cards(secondTab).count(), 2);
  assert.deepEqual(await records(secondTab), before);
  assert.equal(await page.locator('[data-office-reference]').count(), 1);
  assert.equal(await secondTab.locator('[data-office-reference]').count(), 1);
});

test('legacy Office entries retain identity and steps, disclose missing orders, and allow details to be filled', async ({ page }) => {
  const legacy = {
    id: 'test-legacy-office', name: 'TEST LEGACY OFFICE', dob: '01/01/2000', t: 1700000000000,
    steps: [{ id: 'o_4plex', label: 'Req: overnight viral / flu / COVID PCR has 4plex checked, unless the provider ordered RPP', done: false }],
  };
  await page.evaluate(value => localStorage.setItem('hvnb_current_office', JSON.stringify([value])), legacy);
  await page.reload();
  await showOffice(page);
  assert.equal(await cards(page).count(), 1);
  const card = cards(page);
  assert.match(await card.innerText(), /missing|not (?:saved|recorded)|unavailable/i);
  assert.equal(await card.locator('input[type="checkbox"]').count(), 0);
  assert.doesNotMatch(await card.innerText(), /Overnights sent:\s*4plex/i, 'Legacy checklist steps cannot infer the actual ordered tests');
  assert.deepEqual((await records(page))[0].steps, legacy.steps);
  await card.getByRole('button', { name: /Edit saved entry/i }).click();
  const dialog = page.locator('[role="dialog"]:visible');
  await dialog.getByLabel('Overnight tests', { exact: true }).fill('Blood: CBC; custom legacy assay');
  await dialog.getByLabel('Reason for blood work', { exact: true }).fill('Verified from copied note');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  const updated = (await records(page))[0];
  assert.equal(updated.id, legacy.id);
  assert.equal(updated.t, legacy.t);
  assert.deepEqual(updated.steps, legacy.steps);
  assert.equal(updated.overnights, 'Blood: CBC; custom legacy assay');
  assert.equal(updated.bloodreason, 'Verified from copied note');
  assert.match(await cards(page).innerText(), /Blood: CBC; custom legacy assay/);
});

test('failed Office storage warns visibly, keeps copied records in memory, and retries without losing either patient', async ({ page }) => {
  await fillPatient(patient(page), 'TEST QUOTA OFFICE ALPHA', '4plex');
  await copyPatient(page, patient(page), 1);
  await addAfter(page, 0);
  await fillPatient(patient(page, 1), 'TEST QUOTA OFFICE BETA', 'RPP');
  await page.evaluate(() => {
    window.__originalStorageSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'hvnb_current_office') throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return window.__originalStorageSetItem.call(this, key, value);
    };
  });
  await copyPatient(page, patient(page, 1));
  await showOffice(page);
  await page.locator('#officeSaveWarning').waitFor({ state: 'visible' });
  assert.match(await page.locator('#officeSaveWarning').innerText(), /not|couldn.t|unable/i);
  assert.equal(await cards(page).count(), 2, 'Both records remain visible despite a write failure');
  assert.equal((await records(page)).length, 1, 'Failed storage did not silently overwrite persisted data');
  await showPatients(page);
  await local(patient(page), 'tab-office').click();
  assert.equal(await cards(page).count(), 2, 'Navigating to Office does not reload stale persisted data over unsaved records');
  await page.evaluate(() => { Storage.prototype.setItem = window.__originalStorageSetItem; });
  await page.locator('#retryOfficeSave').click();
  await page.locator('#officeSaveWarning').waitFor({ state: 'hidden' });
  assert.deepEqual((await records(page)).map(item => item.name), ['TEST QUOTA OFFICE ALPHA', 'TEST QUOTA OFFICE BETA']);
  await page.reload();
  assert.equal(await cards(page).count(), 2);
});

test('another open tab receives Office changes without altering its unfinished patient', async ({ page, origin }) => {
  const secondTab = await page.context().newPage();
  await secondTab.goto(origin);
  await fillPatient(patient(secondTab), 'TEST SEPARATE TAB DRAFT', 'Uncopied custom test');
  await fillPatient(patient(page), 'TEST CROSS TAB COPIED', '4plex');
  await copyPatient(page, patient(page), 1);
  await secondTab.waitForFunction(() => document.querySelectorAll('#officeContent .office-patient').length === 1);
  assert.match(await cards(secondTab).innerText(), /TEST CROSS TAB COPIED/);
  assert.equal(await local(patient(secondTab), 'f_name').inputValue(), 'TEST SEPARATE TAB DRAFT');
  assert.equal(await local(patient(secondTab), 'f_overnights').inputValue(), 'Uncopied custom test');
});

test('retrying a failed Copy save merges another tab\'s newly saved patient', async ({ page, origin }) => {
  const secondTab = await page.context().newPage();
  await secondTab.goto(origin);
  await fillPatient(patient(page), 'TEST RETRY TAB ALPHA', '4plex');
  await fillPatient(patient(secondTab), 'TEST RETRY TAB BETA', 'RPP');
  await page.evaluate(() => {
    window.__originalStorageSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'hvnb_current_office') throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return window.__originalStorageSetItem.call(this, key, value);
    };
  });
  await copyPatient(page, patient(page));
  await showOffice(page);
  await page.locator('#officeSaveWarning').waitFor({ state: 'visible' });
  assert.deepEqual(await records(page), []);
  assert.match(await cards(page).innerText(), /TEST RETRY TAB ALPHA/);
  await copyPatient(secondTab, patient(secondTab), 1);
  assert.deepEqual((await records(page)).map(item => item.name), ['TEST RETRY TAB BETA']);
  assert.match(await cards(page).innerText(), /TEST RETRY TAB ALPHA/, 'The failed copy remains available in memory');
  await page.evaluate(() => { Storage.prototype.setItem = window.__originalStorageSetItem; });
  await page.locator('#retryOfficeSave').click();
  await page.locator('#officeSaveWarning').waitFor({ state: 'hidden' });
  const merged = await records(page);
  assert.deepEqual(merged.map(item => item.name).sort(), ['TEST RETRY TAB ALPHA', 'TEST RETRY TAB BETA']);
  assert.equal(merged.find(item => item.name === 'TEST RETRY TAB ALPHA').overnights, '4plex');
  assert.equal(merged.find(item => item.name === 'TEST RETRY TAB BETA').overnights, 'RPP');
  assert.equal(await cards(page).count(), 2);
  assert.equal(await local(patient(page), 'badge-office').innerText(), '2');
  await secondTab.waitForFunction(() => document.querySelectorAll('#officeContent .office-patient').length === 2);
  await page.reload();
  assert.deepEqual(await records(page), merged);
  assert.equal(await cards(page).count(), 2);
});

test('retrying a failed removal keeps the deletion and another tab\'s newly saved patient', async ({ page, origin }) => {
  await fillPatient(patient(page), 'TEST REMOVE TAB ALPHA', '4plex');
  await copyPatient(page, patient(page), 1);
  const removedId = (await records(page))[0].id;
  const secondTab = await page.context().newPage();
  await secondTab.goto(origin);
  await fillPatient(patient(secondTab), 'TEST KEEP TAB BETA', 'Urine culture');
  await page.evaluate(() => {
    window.__originalStorageSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'hvnb_current_office') throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return window.__originalStorageSetItem.call(this, key, value);
    };
  });
  await showOffice(page);
  await cards(page).getByRole('button', { name: 'Remove', exact: true }).click();
  await page.locator('[role="dialog"]:visible').getByRole('button', { name: 'Remove', exact: true }).click();
  await page.locator('#officeSaveWarning').waitFor({ state: 'visible' });
  assert.equal(await cards(page).count(), 0);
  assert.equal((await records(page))[0].id, removedId, 'The failed removal is still pending in storage');
  await copyPatient(secondTab, patient(secondTab), 2);
  assert.equal((await records(page)).length, 2);
  await page.evaluate(() => { Storage.prototype.setItem = window.__originalStorageSetItem; });
  await page.locator('#retryOfficeSave').click();
  await page.locator('#officeSaveWarning').waitFor({ state: 'hidden' });
  const merged = await records(page);
  assert.deepEqual(merged.map(item => item.name), ['TEST KEEP TAB BETA']);
  assert.equal(merged[0].overnights, 'Urine culture');
  assert.ok(!merged.some(item => item.id === removedId), 'Recovery must not resurrect the removed patient');
  assert.equal(await cards(page).count(), 1);
  assert.equal(await local(patient(page), 'badge-office').innerText(), '1');
  await secondTab.waitForFunction(() => document.querySelectorAll('#officeContent .office-patient').length === 1);
  assert.match(await cards(secondTab).innerText(), /TEST KEEP TAB BETA/);
  await page.reload();
  assert.deepEqual(await records(page), merged);
  assert.equal(await cards(page).count(), 1);
});

test('Office cards and the bottom reference fit desktop and 375px screens', async ({ page }) => {
  await fillPatient(patient(page), 'TEST RESPONSIVE ALPHA', 'Blood: CBC + CMP; RPP; custom assay with an exceptionally long reference ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
  await local(patient(page), 'f_bloodreason').fill('Provider ordered blood work for persistent symptoms; synthetic QA entry');
  await copyPatient(page, patient(page), 1);
  await addAfter(page, 0);
  await fillPatient(patient(page, 1), 'TEST RESPONSIVE BETA', 'Strep throat PCR, urine culture');
  await copyPatient(page, patient(page, 1), 2);
  const qaDirectory = path.join(__dirname, 'qa');
  fs.mkdirSync(qaDirectory, { recursive: true });
  await showOffice(page);
  for (const viewport of [{ name: 'desktop', width: 1280, height: 1100 }, { name: 'mobile', width: 375, height: 1100 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.locator('#officeSection').evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 12));
    await page.screenshot({ path: path.join(qaDirectory, `office-${viewport.name}.png`) });
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(dimensions.document <= dimensions.viewport, `${viewport.name} has no horizontal overflow: ${JSON.stringify(dimensions)}`);
    console.log(`QA ${viewport.name}: ${dimensions.viewport}px viewport, ${dimensions.document}px document, screenshot saved`);
  }
});

(async () => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}/`;
  let browser;
  let failed = 0;
  try {
    browser = await chromium.launch(launchOptions);
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
  console.log(`\n${tests.length - failed}/${tests.length} Office browser checks passed.`);
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });



