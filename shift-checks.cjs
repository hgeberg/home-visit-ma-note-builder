/* Shift lifecycle checks use synthetic patients and an isolated browser profile. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium, launchOptions} = require('./qa/browser.cjs');
const {defaultLayout, installSavedLayout, acknowledgeCopyWarning} = require('./qa/form-fixtures.cjs');
const tests = [];
const test = (name, run) => tests.push({ name, run });
const patients = page => page.locator('#patients .patient');
const patient = (page, index = 0) => patients(page).nth(index);
const local = (root, id) => root.locator(`[data-local-id="${id}"]`);
const cards = page => page.locator('#officeContent .office-patient');
const showOffice = page => page.locator('#view-office').click();
const showPatients = page => page.locator('#view-patients').click();
const records = page => page.evaluate(() => JSON.parse(localStorage.getItem('hvnb_current_office') || '[]'));
const draft = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('hvnb_current_draft') || 'null'));
const sheet = page => page.locator('#dialogHosts [role="dialog"]');

async function fillPatient(page, name, overnights = '4plex', index = 0) {
  const root = patient(page, index);
  await local(root, 'f_name').fill(name);
  await local(root, 'f_dob').fill('01012000');
  await local(root, 'f_inspic').check();
  await local(root, 'f_temp').fill('98.6');
  await local(root, 'f_weight').fill('120');
  await local(root, 'f_height_ft').fill('5');
  await local(root, 'f_height_in').fill('10');
  await local(root, 'f_symptoms').fill(`Unfinished symptoms for ${name}`);
  await local(root, 'f_overnights').fill(overnights);
  const urineReason = root.locator('[data-choice="urine_reason"][data-v="Other"]');
  if(await urineReason.isVisible()) await urineReason.click();
}

async function addPatient(page, index = 0) {
  const count = await patients(page).count();
  await patient(page, index).getByRole('button', { name: /add another patient/i }).click();
  await page.waitForFunction(n => document.querySelectorAll('#patients .patient').length === n, count + 1);
}

async function copyPatient(page, index = 0, count = 1) {
  await local(patient(page, index), 'copyBtn').click();
  await acknowledgeCopyWarning(page);
  await page.waitForFunction(n => JSON.parse(localStorage.getItem('hvnb_current_office') || '[]').length === n, count);
}

async function startClear(page) {
  await page.locator('#clearShiftBtn').click();
  await page.locator('#clearShiftDialog').waitFor({ state: 'visible' });
  return page.locator('#clearShiftDialog');
}

async function clearShift(page) {
  const dialog = await startClear(page);
  await dialog.getByRole('button', { name: 'Clear everything', exact: true }).click();
}

async function assertBlank(page) {
  await page.waitForFunction(() => document.querySelectorAll('#patients .patient').length === 1 &&
    document.querySelector('#patients [data-local-id="f_name"]').value === '');
  assert.equal(await local(patient(page), 'f_dob').inputValue(), '');
  assert.equal(await local(patient(page), 'f_symptoms').inputValue(), '');
  assert.equal(await local(patient(page), 'f_overnights').inputValue(), '');
  assert.equal(await local(patient(page), 'output').inputValue(), '');
  assert.equal(await cards(page).count(), 0);
  assert.equal(await sheet(page).count(), 0);
}

async function assertStoredEmpty(page) {
  assert.equal(await page.evaluate(() => sessionStorage.getItem('hvnb_current_draft')), null);
  assert.deepEqual(await records(page), []);
  assert.ok(await page.evaluate(() => localStorage.getItem('hvnb_current_shift_generation')), 'Clear records the new shift generation');
}

async function fillTwoSaved(page) {
  await fillPatient(page, 'TEST SHIFT ALPHA', 'Blood: CBC + CMP');
  await local(patient(page), 'f_bloodreason').fill('Synthetic blood reason');
  await copyPatient(page);
  await addPatient(page);
  await fillPatient(page, 'TEST SHIFT BETA', 'Urine culture', 1);
  await copyPatient(page, 1, 2);
  await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('hvnb_current_draft') || '{}').patients?.length === 2);
}

test('PDF export includes archived and live visits; canceling the save never clears the shift', async ({page}) => {
  await fillPatient(page, 'SYNTHETIC ARCHIVED', '4plex');
  await local(patient(page), 'newBtn').click();
  await sheet(page).getByRole('button', {name:'Clear this patient', exact:true}).click();
  await fillPatient(page, 'SYNTHETIC LIVE', 'Strep throat PCR');
  await page.locator('#newHouseBtn').click();
  await fillPatient(page, 'SYNTHETIC THIRD', '', 1);
  await local(patient(page,1),'f_notes').fill('Synthetic Unicode note: Café 你好. ' + 'Long note for page wrapping. '.repeat(160));
  await patient(page,1).locator('[data-item="flu"] input[type="checkbox"]').check();
  await patient(page,1).locator('[data-item="flu"] [data-r="running"]').click();
  await page.evaluate(() => {
    window.pdfDraws = []; window.pdfShares = [];
    const draw = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, ...args){
      if(this.canvas.width === 1224) window.pdfDraws.push(text);
      return draw.call(this,text,...args);
    };
    Object.defineProperty(navigator,'canShare',{configurable:true,value:args => args.files[0].type === 'application/pdf'});
    Object.defineProperty(navigator,'share',{configurable:true,value:async args => {
      window.pdfShares.push(args.files[0]);
      if(window.pdfShares.length === 1) throw new DOMException('Canceled','AbortError');
    }});
  });
  await startClear(page);
  await page.locator('#saveShiftPdfBtn').click();
  await page.getByText('Saving was canceled. Nothing was cleared.').waitFor();
  assert.equal(await local(patient(page,1),'f_name').inputValue(),'SYNTHETIC THIRD');
  await page.evaluate(() => { window.pdfDraws = []; });
  await page.locator('#saveShiftPdfBtn').click();
  await page.getByText('PDF shared. Confirm it is saved, then clear the shift when ready.').waitFor();
  const exported = await page.evaluate(async () => {
    const file = pdfShares[1], bytes = new Uint8Array(await file.arrayBuffer()), content = new TextDecoder('windows-1252').decode(bytes);
    const startxref = Number(content.match(/startxref\n(\d+)\n%%EOF/)?.[1]);
    const refs = content.slice(startxref).split('\n');
    const count = Number(refs[1].split(' ')[1]);
    return {name:file.name, type:file.type, header:content.slice(0,8), draws:pdfDraws,
      pages:Number(content.match(/\/Type \/Pages \/Count (\d+)/)?.[1]),
      xref:refs[0] === 'xref' && refs.slice(3,2+count).every((ref,i)=>content.startsWith((i+1)+' 0 obj',Number(ref.slice(0,10))))};
  });
  assert.match(exported.name,/^Patient-summary-\d{4}-\d{2}-\d{2}.*\.pdf$/);
  assert.equal(exported.type,'application/pdf');
  assert.equal(exported.header,'%PDF-1.4');
  assert.equal(exported.xref,true);
  assert.ok(exported.pages >= 2,'Long summaries paginate');
  for(const text of ['SYNTHETIC ARCHIVED','SYNTHETIC LIVE','SYNTHETIC THIRD','Rapid flu: Running','Café 你好','Strep throat PCR']){
    assert.ok(exported.draws.some(line=>line.includes(text)),'Summary includes '+text);
  }
  await page.locator('#cancelClearShift').click();
  await page.locator('#view-seen').click();
  assert.equal(await page.locator('#seenList article').count(),3);
  await clearShift(page);
  await assertBlank(page);
  await page.locator('#view-seen').click();
  assert.equal(await page.locator('#seenList article').count(),0);
});

test('PDF download fallback keeps the shift; an empty shift does not create a file', async ({page}) => {
  await startClear(page);
  await page.locator('#saveShiftPdfBtn').click();
  await page.getByText('There are no patient visits to save for this shift.').waitFor();
  assert.equal(await page.locator('#downloadShiftPdf').isVisible(),false);
  await page.locator('#cancelClearShift').click();
  await fillPatient(page,'SYNTHETIC DOWNLOAD','');
  await page.evaluate(() => Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false}));
  await startClear(page);
  await page.locator('#saveShiftPdfBtn').click();
  await page.locator('#downloadShiftPdf').waitFor({state:'visible'});
  const pdf = await page.locator('#downloadShiftPdf').evaluate(async link => {
    const response = await fetch(link.href);
    return {type:response.headers.get('content-type'),name:link.download,header:await response.text().then(text=>text.slice(0,8))};
  });
  assert.equal(pdf.type,'application/pdf');
  assert.equal(pdf.header,'%PDF-1.4');
  assert.match(pdf.name,/\.pdf$/);
  await page.locator('#cancelClearShift').click();
  assert.equal(await local(patient(page),'f_name').inputValue(),'SYNTHETIC DOWNLOAD');
  await startClear(page);
  assert.equal(await page.locator('#downloadShiftPdf').isVisible(),false);
});

test('Office navigation hides patient forms and preserves patient inputs and checklist state', async ({ page }) => {
  await fillTwoSaved(page);
  await local(patient(page), 'tab-check').click();
  await local(patient(page), 'f_k_confirm').check();
  await showOffice(page);
  assert.equal(await page.locator('#officeSection').isVisible(), true);
  assert.equal(await page.locator('#patients').isVisible(), false);
  assert.equal(await page.locator('#officeHeading').isVisible(), true);
  assert.equal(await cards(page).count(), 2);
  assert.equal(await page.locator('[data-office-reference]').count(), 1);
  assert.equal(await cards(page).getByRole('checkbox', {name:'Completed', exact:true}).count(), 2, 'Each saved patient has one completion checkbox');
  assert.equal(await cards(page).locator('input[type="checkbox"]').count(), 2, 'Saved patient cards have no per-task checklists');
  await showPatients(page);
  assert.equal(await page.locator('#officeSection').isVisible(), false);
  assert.equal(await local(patient(page), 'panel-check').isVisible(), true);
  assert.equal(await local(patient(page), 'f_k_confirm').isChecked(), true);
  await local(patient(page), 'tab-visit').click();
  assert.equal(await local(patient(page), 'f_name').inputValue(), 'TEST SHIFT ALPHA');
  assert.equal(await local(patient(page, 1), 'f_name').inputValue(), 'TEST SHIFT BETA');
  assert.equal(await local(patient(page), 'f_bloodreason').inputValue(), 'Synthetic blood reason');
});

test('Office edit and removal dialogs work while patient inputs are hidden', async ({ page }) => {
  await fillPatient(page, 'TEST OFFICE DIALOG', '4plex');
  await copyPatient(page);
  await showOffice(page);
  await cards(page).getByRole('button', { name: 'Edit saved entry', exact: true }).click();
  assert.equal(await sheet(page).isVisible(), true);
  assert.equal(await page.locator('#patients').isVisible(), false);
  await sheet(page).getByLabel('Labs collected/sent', { exact: true }).fill('RPP, urine culture');
  await sheet(page).getByRole('button', { name: 'Save changes', exact: true }).click();
  assert.equal((await records(page))[0].overnights, 'RPP, urine culture');
  await cards(page).getByRole('button', { name: 'Remove', exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await cards(page).count(), 1);
  await cards(page).getByRole('button', { name: 'Remove', exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Remove', exact: true }).click();
  assert.equal(await cards(page).count(), 0);
  await showPatients(page);
  assert.equal(await local(patient(page), 'f_name').inputValue(), 'TEST OFFICE DIALOG');
});

test('canceling or escaping the shift confirmation preserves every patient and Office entry', async ({ page }) => {
  await fillTwoSaved(page);
  const before = await records(page);
  const generation = await page.evaluate(() => localStorage.getItem('hvnb_current_shift_generation'));
  const dialog = await startClear(page);
  assert.match(await dialog.innerText(), /patient|draft/i);
  assert.match(await dialog.innerText(), /office/i);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await patients(page).count(), 2);
  assert.equal(await local(patient(page), 'f_name').inputValue(), 'TEST SHIFT ALPHA');
  await showOffice(page);
  await startClear(page);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#clearShiftDialog').isVisible(), false);
  assert.equal(await page.locator('#officeSection').isVisible(), true);
  assert.deepEqual(await records(page), before);
  assert.equal((await draft(page)).patients.length, 2);
  assert.equal(await page.evaluate(() => localStorage.getItem('hvnb_current_shift_generation')), generation);
});

test('confirmed shift clearing empties all patients and Office on reload while preserving the custom layout', async ({ page }) => {
  const savedForm = defaultLayout();
  savedForm.sections.flatMap(s => s.fields).find(f => f.id === 'symptoms').label = 'Current concerns';
  await installSavedLayout(page, savedForm);
  await fillPatient(page, 'TEST SHIFT ALPHA', '4plex');
  await copyPatient(page);
  await addPatient(page);
  await fillPatient(page, 'TEST SHIFT BETA', 'RPP', 1);
  await copyPatient(page, 1, 2);
  await addPatient(page, 1);
  await fillPatient(page, 'TEST SHIFT UNCOPIED', 'Urine culture', 2);
  const layout = await page.evaluate(() => localStorage.getItem('hvnb_current_layout'));
  await showOffice(page);
  await clearShift(page);
  await assertBlank(page);
  await assertStoredEmpty(page);
  assert.equal(await page.evaluate(() => localStorage.getItem('hvnb_current_layout')), layout);
  await page.reload();
  await assertBlank(page);
  await assertStoredEmpty(page);
  assert.equal(await page.getByRole('button', { name: /^Restore/i }).count(), 0);
  await showPatients(page);
  await local(patient(page), 'f_symptoms').fill('New shift concern');
  assert.match(await local(patient(page), 'output').inputValue(), /Current concerns: New shift concern/);
});

test('a pending clipboard operation cannot repopulate patient drafts or Office after clearing', async ({ page }) => {
  await fillPatient(page, 'TEST PENDING CLEAR', '4plex');
  await page.evaluate(() => { window.__deferCopy = true; });
  await local(patient(page), 'copyBtn').click();
  await acknowledgeCopyWarning(page);
  await page.waitForFunction(() => typeof window.__resolveCopy === 'function');
  await clearShift(page);
  await page.evaluate(() => { window.__resolveCopy(); });
  await page.waitForFunction(() => document.querySelectorAll('#patients .patient').length === 1);
  await assertBlank(page);
  await assertStoredEmpty(page);
  await page.reload();
  await assertBlank(page);
  await assertStoredEmpty(page);
});

test('clearing resets other tabs including pending copies and unfinished patient drafts', async ({ page, origin }) => {
  await fillTwoSaved(page);
  await page.evaluate(() => { window.__deferCopy = true; });
  await local(patient(page), 'copyBtn').click();
  await acknowledgeCopyWarning(page);
  await page.waitForFunction(() => typeof window.__resolveCopy === 'function');
  const second = await page.context().newPage();
  await second.goto(origin);
  await second.getByRole('button', {name:'Start fresh', exact:true}).click();
  await fillPatient(second, 'TEST OTHER TAB PENDING', 'RPP');
  await addPatient(second);
  await fillPatient(second, 'TEST OTHER TAB UNFINISHED', 'Urine culture', 1);
  await clearShift(second);
  await assertBlank(page);
  await page.evaluate(() => { window.__resolveCopy(); });
  await assertStoredEmpty(second);
  await assertBlank(page);
  await second.reload();
  await assertBlank(second);
  assert.equal(await second.getByRole('button', { name: /^Restore/i }).count(), 0);
});

test('a stale pre-clear draft is never offered for restore in a newly loaded tab', async ({ page, origin }) => {
  await fillTwoSaved(page);
  const stale = await draft(page);
  await clearShift(page);
  const second = await page.context().newPage();
  await second.addInitScript(saved => sessionStorage.setItem('hvnb_current_draft', JSON.stringify(saved)), stale);
  await second.goto(origin);
  await assertBlank(second);
  assert.equal(await second.getByRole('button', { name: /^Restore/i }).count(), 0);
  await assertStoredEmpty(second);
});

test('a restore dialog open in another tab closes on clear and cannot restore the old shift', async ({ page, origin }) => {
  await fillTwoSaved(page);
  const stale = await draft(page);
  const second = await page.context().newPage();
  await second.addInitScript(saved => sessionStorage.setItem('hvnb_current_draft', JSON.stringify(saved)), stale);
  await second.goto(origin);
  await second.getByRole('button', { name: /^Restore/i }).first().waitFor();
  await clearShift(page);
  await assertBlank(second);
  await assertStoredEmpty(second);
  assert.equal(await second.getByRole('button', { name: /^Restore/i }).count(), 0);
});

test('failure to persist the shift marker leaves patient data intact and reports the failure', async ({ page }) => {
  await fillTwoSaved(page);
  const before = await records(page);
  await page.evaluate(() => {
    window.__storageSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (this === localStorage && key === 'hvnb_current_shift_generation') throw new DOMException('Synthetic marker failure', 'QuotaExceededError');
      return window.__storageSet.call(this, key, value);
    };
  });
  await clearShift(page);
  assert.equal(await patients(page).count(), 2);
  assert.equal(await local(patient(page), 'f_name').inputValue(), 'TEST SHIFT ALPHA');
  assert.deepEqual(await records(page), before);
  assert.match(await page.locator('body').innerText(), /couldn.t|could not|unable|not cleared|failed/i);
  await page.evaluate(() => { Storage.prototype.setItem = window.__storageSet; });
});

for (const storageName of ['localStorage', 'sessionStorage']) {
  test(`${storageName} deletion failure remains visible until retry really removes saved data`, async ({ page }) => {
    await fillTwoSaved(page);
    await page.evaluate(kind => {
      window.__storageRemove = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function(key) {
        const target = kind === 'localStorage' ? localStorage : sessionStorage;
        if (this === target && (key === 'hvnb_current_office' || key === 'hvnb_current_draft')) throw new DOMException('Synthetic deletion failure', 'SecurityError');
        return window.__storageRemove.call(this, key);
      };
    }, storageName);
    await clearShift(page);
    await assertBlank(page);
    await page.locator('#shiftClearWarning').waitFor({ state: 'visible' });
    assert.match(await page.locator('#shiftClearWarning').innerText(), /couldn.t|could not|unable|not|failed/i);
    await showOffice(page);
    assert.equal(await page.locator('#shiftClearWarning').isVisible(), true, 'Failed deletion remains visible in Office');
    assert.equal(await cards(page).count(), 0, 'Stale persisted records stay out of the new shift');
    await page.evaluate(() => { Storage.prototype.removeItem = window.__storageRemove; });
    await page.getByRole('button', { name: 'Retry clearing saved data', exact: true }).click();
    await page.locator('#shiftClearWarning').waitFor({ state: 'hidden' });
    await assertStoredEmpty(page);
    await page.reload();
    await assertBlank(page);
    await assertStoredEmpty(page);
  });
}

test('a pending failed Office save cannot resurrect copied records after shift clear', async ({ page }) => {
  await fillPatient(page, 'TEST UNSAVED OFFICE', 'RPP');
  await page.evaluate(() => {
    window.__storageSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (this === localStorage && key === 'hvnb_current_office') throw new DOMException('Synthetic Office failure', 'QuotaExceededError');
      return window.__storageSet.call(this, key, value);
    };
  });
  await local(patient(page), 'copyBtn').click();
  await acknowledgeCopyWarning(page);
  await showOffice(page);
  await page.locator('#officeSaveWarning').waitFor({ state: 'visible' });
  assert.equal(await cards(page).count(), 1);
  await clearShift(page);
  await page.evaluate(() => { Storage.prototype.setItem = window.__storageSet; });
  await assertBlank(page);
  await showOffice(page);
  assert.equal(await page.locator('#officeSaveWarning').isVisible(), false);
  await assertStoredEmpty(page);
  await showPatients(page);
  await fillPatient(page, 'TEST NEW SHIFT', 'Urine culture');
  await copyPatient(page);
  assert.deepEqual((await records(page)).map(record => record.name), ['TEST NEW SHIFT']);
});

test('stale Office retry notices a new shift before a storage event and cannot repopulate cleared forms', async ({ page }) => {
  await fillPatient(page, 'TEST STALE RETRY', 'RPP');
  await page.evaluate(() => {
    window.__storageSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (this === localStorage && key === 'hvnb_current_office') throw new DOMException('Synthetic Office failure', 'QuotaExceededError');
      return window.__storageSet.call(this, key, value);
    };
  });
  await local(patient(page), 'copyBtn').click();
  await acknowledgeCopyWarning(page);
  await showOffice(page);
  await page.locator('#officeSaveWarning').waitFor({ state: 'visible' });
  assert.equal(await cards(page).count(), 1);
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__storageSet;
    // The new marker and click occur in one task. No storage/focus event can
    // reset the app first: the retry itself must detect the new generation.
    localStorage.setItem('hvnb_current_shift_generation', 'synthetic-new-shift-before-event');
    document.querySelector('#retryOfficeSave').click();
  });
  await assertBlank(page);
  await assertStoredEmpty(page);
  await showOffice(page);
  assert.equal(await page.locator('#officeSaveWarning').isVisible(), false);
  assert.equal(await cards(page).count(), 0);
  await page.reload();
  await assertBlank(page);
  await assertStoredEmpty(page);
});



test('separate Office and shift controls fit desktop and mobile screens', async ({ page }) => {
  await fillTwoSaved(page);
  const qaDirectory = path.join(__dirname, 'qa');
  fs.mkdirSync(qaDirectory, { recursive: true });
  for (const viewport of [{ name: 'desktop', width: 1280, height: 1100 }, { name: 'mobile', width: 375, height: 1100 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await showOffice(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(qaDirectory, `shift-office-${viewport.name}.png`), animations: 'disabled' });
    await startClear(page);
    await page.screenshot({ path: path.join(qaDirectory, `shift-confirm-${viewport.name}.png`), animations: 'disabled' });
    assert.equal(await page.locator('#clearShiftDialog').getByRole('button', { name: 'Clear everything', exact: true }).isVisible(), true);
    await page.locator('#clearShiftDialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    const sizes = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(sizes.document <= sizes.viewport, `No horizontal overflow: ${JSON.stringify(sizes)}`);
    console.log(`QA ${viewport.name}: ${sizes.viewport}px viewport, ${sizes.document}px document; screenshots saved`);
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
  const selected = tests.filter(entry => !process.env.TEST_FILTER || entry.name.includes(process.env.TEST_FILTER));
  try {
    browser = await chromium.launch(launchOptions);
    for (const entry of selected) {
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
        await page.locator('#clearShiftBtn').waitFor();
        await entry.run({ page, origin });
        assert.deepEqual(errors, [], 'No browser JavaScript errors');
        console.log(`PASS ${entry.name}`);
      } catch (error) {
        failed++;
        console.error(`FAIL ${entry.name}\n${error.stack || error}`);
        if (errors.length) console.error(`Browser errors: ${errors.join('; ')}`);
      } finally { await context.close(); }
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log(`\n${selected.length - failed}/${selected.length} shift browser checks passed.`);
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
