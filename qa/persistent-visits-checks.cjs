'use strict';
// Full visit recovery uses disposable browser contexts and synthetic patients.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {chromium, launchOptions} = require('./browser.cjs');

const root = path.resolve(__dirname, '..');
const draftKey = 'hvnb_current_app_draft';
const sessionKey = 'hvnb_current_draft';
const screenshotDir = process.env.PERSISTENT_VISITS_SCREENSHOT_DIR;
const tests = [];
const test = (name, run, installed = false) => tests.push({name, run, installed});
const patient = (page, n = 0) => page.locator('#patients .patient').nth(n);
const field = (page, id, n = 0) => patient(page, n).locator('[data-local-id="' + id + '"]');
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), draftKey);
const office = page => page.evaluate(() => JSON.parse(localStorage.getItem('hvnb_current_office') || '[]'));
const restore = page => page.getByRole('button', {name:/^Restore (this visit|all)/}).click();
const checkpoint = async page => {
  // Blur commits the last input; wait for the real autosave instead of relying on pagehide.
  await page.locator('#houseHeading').focus();
  await page.waitForTimeout(450);
};
async function setup(context, installed) {
  context.setDefaultTimeout(15000);
  await context.addInitScript(installed => {
    Object.defineProperty(navigator, 'standalone', {configurable:true, value:installed});
    Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:() => Promise.resolve()}});
  }, installed);
}
async function seed(page, name = 'SYNTHETIC PERSISTED VISIT', n = 0) {
  await field(page, 'f_name', n).fill(name);
  await field(page, 'f_dob', n).fill('01/02/2000');
  await field(page, 'f_inspic', n).check();
  await field(page, 'f_symptoms', n).fill('SYNTHETIC sore throat and cough');
  await field(page, 'f_temp', n).fill('99.4');
  await field(page, 'f_notes', n).fill('SYNTHETIC complete visit notes\nSecond line retained');
  await field(page, 'f_overnights', n).fill('RPP');
}
async function copy(page, n = 0) {
  await field(page, 'copyBtn', n).click();
  await field(page, 'sentBanner', n).waitFor({state:'visible'});
}
async function openSavedVisit(page, name, capture = false) {
  await page.locator('#view-office').click();
  const card = page.locator('.office-patient').filter({hasText:name});
  await card.getByRole('button', {name:'Edit saved entry', exact:true}).click();
  const button = page.getByRole('button', {name:'Open visit page', exact:true});
  assert.equal(await button.isEnabled(), true, 'A complete saved visit can be opened');
  const viewport = page.viewportSize();
  if (capture && screenshotDir) {
    fs.mkdirSync(screenshotDir, {recursive:true});
    await page.setViewportSize({width:320, height:900});
    await page.screenshot({path:path.join(screenshotDir, 'persistent-visits-office-phone.png')});
  }
  await button.click();
  if (capture && screenshotDir) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({path:path.join(screenshotDir, 'persistent-visits-header-phone.png')});
    await page.setViewportSize(viewport);
  }
  return page.locator('#patients .patient').filter({has:page.locator('[data-local-id="patientTitle"]').filter({hasText:name})});
}

for (const installed of [false, true]) {
  const mode = installed ? 'Installed app' : 'Regular Safari-style tab';
  test(mode + ' restores copied visits, unfinished visits, houses, answers and checklists after every page closes', async (page, context, url) => {
    await seed(page);
    await copy(page);
    const copiedMessage = await field(page, 'output').inputValue();
    await field(page, 'tab-check').click();
    await field(page, 'f_k_confirm').check();
    await page.locator('#newHouseBtn').click();
    await seed(page, 'SYNTHETIC UNFINISHED HOUSE', 1);
    await checkpoint(page);
    const before = await saved(page);
    assert.equal(before.patients.length, 2);
    assert.equal(before.patients[0].meta.sentText, copiedMessage.replace(/^\u200b/, ''));
    await page.close();

    const reopened = await context.newPage();
    await reopened.goto(url);
    assert.equal(await reopened.evaluate(key => sessionStorage.getItem(key), sessionKey), null);
    await restore(reopened);
    assert.equal(await reopened.locator('#houseHeading').innerText(), 'House 2');
    assert.equal(await field(reopened, 'f_name', 1).inputValue(), 'SYNTHETIC UNFINISHED HOUSE');
    const linked = await openSavedVisit(reopened, 'SYNTHETIC PERSISTED VISIT');
    assert.equal(await reopened.locator('#houseHeading').innerText(), 'House 1');
    assert.equal(await linked.locator('[data-local-id="f_symptoms"]').inputValue(), 'SYNTHETIC sore throat and cough');
    assert.equal(await linked.locator('[data-local-id="f_temp"]').inputValue(), '99.4');
    assert.equal(await linked.locator('[data-local-id="f_notes"]').inputValue(), 'SYNTHETIC complete visit notes\nSecond line retained');
    assert.equal(await linked.locator('[data-local-id="output"]').inputValue(), copiedMessage);
    assert.match(await linked.locator('[data-local-id="saveState"]').innerText(), /copied/i);
    await linked.locator('[data-local-id="tab-check"]').click();
    assert.equal(await linked.locator('[data-local-id="f_k_confirm"]').isChecked(), true);
  }, installed);

  test(mode + ' offers a complete visit saved three days ago without an eight-hour cutoff', async (page, context, url) => {
    await seed(page);
    await copy(page);
    await checkpoint(page);
    const original = await saved(page);
    await page.close();
    original.t = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const reopened = await context.newPage();
    await reopened.addInitScript(({key, value}) => localStorage.setItem(key, JSON.stringify(value)), {key:draftKey, value:original});
    await reopened.goto(url);
    await restore(reopened);
    assert.equal(await field(reopened, 'f_notes').inputValue(), 'SYNTHETIC complete visit notes\nSecond line retained');
    assert.match(await field(reopened, 'saveState').innerText(), /copied/i);
  }, installed);

  test(mode + ' reopens the complete copied visit from Office after Start fresh', async (page, context, url) => {
    await seed(page);
    await copy(page);
    const copiedMessage = await field(page, 'output').inputValue();
    await checkpoint(page);
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(url);
    await reopened.getByRole('button', {name:'Start fresh', exact:true}).click();
    assert.equal(await field(reopened, 'f_name').inputValue(), '');
    const linked = await openSavedVisit(reopened, 'SYNTHETIC PERSISTED VISIT', !installed);
    assert.equal(await linked.locator('[data-local-id="f_notes"]').inputValue(), 'SYNTHETIC complete visit notes\nSecond line retained');
    assert.equal(await linked.locator('[data-local-id="output"]').inputValue(), copiedMessage);
    assert.match(await linked.locator('[data-local-id="saveState"]').innerText(), /copied/i);
    await linked.locator('[data-local-id="copyBtn"]').click();
    assert.equal((await office(reopened)).length, 1, 'Opening and copying a saved visit keeps its existing Office record');
  }, installed);
}

test('Clearing a copied patient preserves the complete saved Office visit', async page => {
  await seed(page);
  await copy(page);
  const copiedMessage = await field(page, 'output').inputValue();
  await field(page, 'newBtn').click();
  const confirm = page.getByRole('button', {name:'Clear this patient', exact:true});
  if (await confirm.count()) await confirm.click();
  assert.equal(await field(page, 'f_name').inputValue(), '');
  const linked = await openSavedVisit(page, 'SYNTHETIC PERSISTED VISIT');
  assert.equal(await linked.locator('[data-local-id="f_temp"]').inputValue(), '99.4');
  assert.equal(await linked.locator('[data-local-id="output"]').inputValue(), copiedMessage);
  assert.match(await linked.locator('[data-local-id="saveState"]').innerText(), /copied/i);
});

test('A copied Office retry retains the exact copied answers and checklist after edits and reopening', async (page, context, url) => {
  await seed(page);
  await field(page, 'tab-check').click();
  await field(page, 'f_k_confirm').check();
  await field(page, 'tab-visit').click();
  await page.evaluate(() => {
    window.syntheticFailOfficeRead = true;
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (this === localStorage && key === 'hvnb_current_office' && window.syntheticFailOfficeRead) throw new Error('Synthetic Office read failure');
      return original.call(this, key);
    };
  });
  await copy(page);
  const copiedMessage = await field(page, 'output').inputValue();
  await field(page, 'f_symptoms').fill('SYNTHETIC EDIT AFTER COPYING');
  await page.getByRole('button', {name:'Same patient, keep editing', exact:true}).click();
  await field(page, 'tab-check').click();
  await field(page, 'f_k_confirm').uncheck();
  await checkpoint(page);
  await page.close();

  const reopened = await context.newPage();
  await reopened.goto(url);
  await restore(reopened);
  await reopened.locator('#retryOfficeSave').click();
  await reopened.waitForFunction(() => JSON.parse(localStorage.getItem('hvnb_current_office') || '[]').length === 1);
  await field(reopened, 'tab-visit').click();
  await field(reopened, 'newBtn').click();
  await reopened.getByRole('button', {name:'Clear this patient', exact:true}).click();
  const linked = await openSavedVisit(reopened, 'SYNTHETIC PERSISTED VISIT');
  assert.equal(await linked.locator('[data-local-id="f_symptoms"]').inputValue(), 'SYNTHETIC sore throat and cough');
  assert.equal(await linked.locator('[data-local-id="output"]').inputValue(), copiedMessage);
  await linked.locator('[data-local-id="tab-check"]').click();
  assert.equal(await linked.locator('[data-local-id="f_k_confirm"]').isChecked(), true);
});

test('Undo after typing a new patient retains the pending copied visit snapshot for Office retry', async page => {
  await seed(page);
  await page.evaluate(() => {
    window.syntheticFailOfficeRead = true;
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (this === localStorage && key === 'hvnb_current_office' && window.syntheticFailOfficeRead) throw new Error('Synthetic Office read failure');
      return original.call(this, key);
    };
  });
  await copy(page);
  const copiedMessage = await field(page, 'output').inputValue();
  await field(page, 'f_notes').fill('SYNTHETIC UNCOPIED CHANGE');
  await page.getByRole('button', {name:'Same patient, keep editing', exact:true}).click();
  await field(page, 'newBtn').click();
  await page.getByRole('button', {name:'Clear this patient', exact:true}).click();
  await field(page, 'f_name').fill('SYNTHETIC NEXT PATIENT');
  await page.locator('#undoAction').click();
  assert.equal(await field(page, 'f_name').inputValue(), 'SYNTHETIC NEXT PATIENT');
  assert.equal(await field(page, 'f_name', 1).inputValue(), 'SYNTHETIC PERSISTED VISIT');
  await page.evaluate(() => window.syntheticFailOfficeRead = false);
  await page.locator('#retryOfficeSave').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('hvnb_current_office') || '[]').length === 1);
  await field(page, 'newBtn', 1).click();
  await page.getByRole('button', {name:'Clear this patient', exact:true}).click();
  const linked = await openSavedVisit(page, 'SYNTHETIC PERSISTED VISIT');
  assert.equal(await linked.locator('[data-local-id="output"]').inputValue(), copiedMessage);
  assert.equal(await linked.locator('[data-local-id="f_notes"]').inputValue(), 'SYNTHETIC complete visit notes\nSecond line retained');
});

test('An archived visit with a different saved layout retains edited legacy answers through another reopening', async (page, context, url) => {
  const name = 'SYNTHETIC CUSTOM LEGACY';
  await seed(page, name);
  await copy(page);
  await page.evaluate(() => {
    const entries = JSON.parse(localStorage.getItem('hvnb_current_office'));
    const savedVisit = entries[0].visit;
    savedVisit.layout.sections[0].fields.push({id:'synthetic_extra', type:'text', label:'Synthetic legacy answer'});
    savedVisit.vals.synthetic_extra = 'SYNTHETIC LEGACY VALUE';
    savedVisit.meta.sentVals.synthetic_extra = 'SYNTHETIC LEGACY VALUE';
    localStorage.setItem('hvnb_current_office', JSON.stringify(entries));
  });
  await checkpoint(page);
  await page.close();

  const reopened = await context.newPage();
  await reopened.goto(url);
  await reopened.getByRole('button', {name:'Start fresh', exact:true}).click();
  const linked = await openSavedVisit(reopened, name);
  const extra = linked.locator('[data-local-id="f_synthetic_extra"]');
  assert.equal(await extra.inputValue(), 'SYNTHETIC LEGACY VALUE');
  await extra.fill('SYNTHETIC UPDATED LEGACY VALUE');
  const guard = reopened.getByRole('button', {name:'Same patient, keep editing', exact:true});
  if (await guard.count()) await guard.click();
  await checkpoint(reopened);
  await reopened.close();

  const restored = await context.newPage();
  await restored.goto(url);
  await restore(restored);
  const recovered = restored.locator('#patients .patient').filter({has:restored.locator('[data-local-id="patientTitle"]').filter({hasText:name})});
  assert.equal(await recovered.locator('[data-local-id="f_synthetic_extra"]').inputValue(), 'SYNTHETIC UPDATED LEGACY VALUE');
  assert.equal(await recovered.locator('[data-local-id="f_temp"]').inputValue(), '99.4');
});

test('Legacy Office entries remain editable and explain why a full visit cannot be opened', async (page, context, url) => {
  await page.evaluate(() => localStorage.setItem('hvnb_current_office', JSON.stringify([
    {id:'synthetic-legacy-office', name:'SYNTHETIC LEGACY TESTS ONLY', dob:'01/02/2000', t:Date.now(), overnights:'RPP', steps:[]}
  ])));
  await page.reload();
  await page.locator('#view-office').click();
  await page.getByRole('button', {name:'Edit saved entry', exact:true}).click();
  assert.equal(await page.getByRole('button', {name:'Open visit page', exact:true}).isEnabled(), false);
  assert.match(await page.locator('dialog[open]').innerText(), /visit.*(unavailable|no longer|not saved)|no.*(visit|form)|older|earlier/i);
  await page.locator('[data-local-id="sheet_overnights"]').fill('RPP, Strep culture');
  await page.getByRole('button', {name:'Save changes', exact:true}).click();
  assert.equal((await office(page))[0].overnights, 'RPP, Strep culture');
});

test('Ordinary browser storage failures warn even when the temporary tab draft succeeds', async page => {
  await page.evaluate(key => {
    window.syntheticFailDurable = true;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (this === localStorage && name === key && window.syntheticFailDurable) throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, draftKey);
  await seed(page);
  await checkpoint(page);
  assert.equal(await page.locator('#draftWarning').isVisible(), true);
  assert.match(await page.locator('#draftWarning').innerText(), /saved.*reopen|reopen.*sav/i);
  assert.ok(await page.evaluate(key => sessionStorage.getItem(key), sessionKey));
  await page.evaluate(() => window.syntheticFailDurable = false);
  await field(page, 'f_notes').fill('SYNTHETIC SAVE RETRY');
  await checkpoint(page);
  assert.equal(await page.locator('#draftWarning').isVisible(), false);
  assert.equal((await saved(page)).patients[0].vals.notes, 'SYNTHETIC SAVE RETRY');
});

test('Ordinary browser reopening works when temporary session storage cannot save', async (page, context, url) => {
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (this === sessionStorage && name === key) throw new Error('Synthetic session failure');
      return original.call(this, name, value);
    };
  }, sessionKey);
  await seed(page);
  await checkpoint(page);
  assert.equal(await page.locator('#draftWarning').isVisible(), false);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(url);
  await restore(reopened);
  assert.equal(await field(reopened, 'f_notes').inputValue(), 'SYNTHETIC complete visit notes\nSecond line retained');
});

test('A stale ordinary tab cannot overwrite a newer saved shift', async (page, context, url) => {
  await seed(page);
  await checkpoint(page);
  const second = await context.newPage();
  await second.goto(url);
  await restore(second);
  await field(second, 'f_notes').fill('SYNTHETIC NEWER TAB');
  await checkpoint(second);
  await field(page, 'f_notes').fill('SYNTHETIC STALE TAB');
  await checkpoint(page);
  assert.equal(await page.locator('#draftWarning').isVisible(), true);
  assert.equal((await saved(page)).patients[0].vals.notes, 'SYNTHETIC NEWER TAB');
  await page.reload();
  assert.match(await page.locator('dialog[open]').innerText(), /Different saved shifts/i);
  await page.getByRole('button', {name:'Restore saved device shift', exact:true}).click();
  assert.equal(await field(page, 'f_notes').inputValue(), 'SYNTHETIC NEWER TAB');
});

test('Clear shift removes complete saved visits and persistent recovery from all ordinary tabs', async (page, context, url) => {
  await seed(page);
  await copy(page);
  await checkpoint(page);
  const second = await context.newPage();
  await second.goto(url);
  await restore(second);
  await second.locator('#clearShiftBtn').click();
  await second.locator('#confirmClearShift').click();
  await page.waitForFunction(() => document.querySelector('[data-local-id="f_name"]').value === '');
  assert.equal(await saved(second), null);
  assert.deepEqual(await office(second), []);
  await page.close();
  await second.close();
  const reopened = await context.newPage();
  await reopened.goto(url);
  assert.equal(await reopened.getByRole('button', {name:/^Restore/}).count(), 0);
  assert.equal(await field(reopened, 'f_name').inputValue(), '');
  await reopened.locator('#view-office').click();
  assert.equal(await reopened.locator('.office-patient').count(), 0);
});

async function forceCloseDisposableBrowser(context, profile) {
  const browser = context.browser();
  assert.ok(browser, 'The disposable profile has its own browser');
  const session = await browser.newBrowserCDPSession();
  const {arguments:args} = await session.send('Browser.getBrowserCommandLine');
  const joined = args.find(value => value.startsWith('--user-data-dir='));
  const index = args.indexOf('--user-data-dir');
  const userDataDir = joined ? joined.slice('--user-data-dir='.length) : index >= 0 ? args[index + 1] : null;
  assert.ok(userDataDir, 'The browser exposes its dedicated profile path');
  assert.equal(path.resolve(userDataDir), path.resolve(profile), 'Only the disposable test browser may be force-closed');
  const {processInfo} = await session.send('SystemInfo.getProcessInfo');
  const roots = processInfo.filter(info => info.type === 'browser');
  assert.equal(roots.length, 1, 'Exactly one dedicated browser process is identified');
  const pid = Number(roots[0].id);
  assert.ok(Number.isSafeInteger(pid) && pid > 0 && pid !== process.pid, 'The dedicated browser process ID is valid');
  const disconnected = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('The disposable browser did not exit after force-close')), 15000);
    browser.once('disconnected', () => { clearTimeout(timeout); resolve(); });
  });
  process.kill(pid, 'SIGKILL');
  await disconnected;
}

test('A forced regular-browser shutdown retains a previously copied full visit on disk', async (page, context, url) => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'note-builder-browser-recovery-'));
  let persistent;
  try {
    persistent = await chromium.launchPersistentContext(profile, {...launchOptions, serviceWorkers:'block', args:[...(launchOptions.args || []), '--enable-automation']});
    await setup(persistent, false);
    const first = await persistent.newPage();
    await first.goto(url);
    await seed(first, 'SYNTHETIC BROWSER RESTART');
    await copy(first);
    const copiedMessage = await field(first, 'output').inputValue();
    await checkpoint(first);
    assert.equal((await saved(first)).patients[0].vals.name, 'SYNTHETIC BROWSER RESTART', 'The full visit was saved before forced shutdown');
    // Model a previously saved visit, allowing the browser's batched disk write to finish.
    await first.waitForTimeout(6000);
    const beforeKeys = await first.evaluate(() => Object.keys(localStorage).sort());
    await forceCloseDisposableBrowser(persistent, profile);
    persistent = null;
    persistent = await chromium.launchPersistentContext(profile, {...launchOptions, serviceWorkers:'block', args:[...(launchOptions.args || []), '--enable-automation']});
    await setup(persistent, false);
    const reopened = await persistent.newPage();
    await reopened.addInitScript(({draft, office}) => {
      window.syntheticStartupStorage = {
        keys:Object.keys(localStorage),
        draft:localStorage.getItem(draft),
        office:localStorage.getItem(office)
      };
    }, {draft:draftKey, office:'hvnb_current_office'});
    await reopened.goto(url);
    const startup = await reopened.evaluate(() => window.syntheticStartupStorage);
    if (process.env.PERSISTENT_VISITS_TRACE_STORAGE) console.log('INFO forced-close keys ' + JSON.stringify({before:beforeKeys, after:startup.keys.sort(), draftRetained:!!startup.draft, officeRetained:!!startup.office}));
    assert.ok(startup.draft, 'The browser retained its disk draft after force-close; startup keys: ' + JSON.stringify(startup.keys) + '; Office survived: ' + !!startup.office);
    await restore(reopened);
    const linked = await openSavedVisit(reopened, 'SYNTHETIC BROWSER RESTART');
    assert.equal(await linked.locator('[data-local-id="output"]').inputValue(), copiedMessage);
    assert.equal(await linked.locator('[data-local-id="f_temp"]').inputValue(), '99.4');
  } finally {
    if (persistent) await persistent.close();
    const resolved = path.resolve(profile), temporary = path.resolve(os.tmpdir()) + path.sep;
    if (!resolved.startsWith(temporary) || !path.basename(resolved).startsWith('note-builder-browser-recovery-')) throw Error('Unexpected test-profile cleanup path');
    fs.rmSync(resolved, {recursive:true, force:true, maxRetries:10, retryDelay:200});
  }
});

(async () => {
  const assets = new Set(['index.html', 'sw.js', 'manifest.webmanifest', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png']);
  const server = http.createServer((request, response) => {
    let file = new URL(request.url, 'http://local').pathname.replace(/^\/app\//, '');
    if (!file) file = 'index.html';
    if (!assets.has(file)) { response.writeHead(404); response.end(); return; }
    const contentType = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.png') ? 'image/png' : file.endsWith('.webmanifest') ? 'application/manifest+json' : 'text/html; charset=utf-8';
    response.writeHead(200, {'Content-Type':contentType, 'Cache-Control':'no-store'});
    response.end(fs.readFileSync(path.join(root, file)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/app/';
  const selected = tests.filter(entry => !process.env.TEST_FILTER || process.env.TEST_FILTER.split('|').some(filter => entry.name.includes(filter)));
  let browser, failed = 0;
  try {
    browser = await chromium.launch(launchOptions);
    for (const entry of selected) {
      const context = await browser.newContext({serviceWorkers:'block', viewport:{width:810, height:1080}}), errors = [];
      await setup(context, entry.installed);
      context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
      const page = await context.newPage();
      try {
        await page.goto(url);
        await entry.run(page, context, url);
        assert.deepEqual(errors, [], 'No browser JavaScript errors');
        console.log('PASS ' + entry.name);
      } catch (error) {
        failed++;
        console.error('FAIL ' + entry.name + '\n' + (error.stack || error));
        if (errors.length) console.error('Browser errors: ' + errors.join('; '));
      } finally { await context.close(); }
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log((selected.length - failed) + '/' + selected.length + ' persistent-visit browser checks passed.');
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
