/* Cross-cutting regression checks. Isolated browser; synthetic patient data only. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium, launchOptions} = require('./qa/browser.cjs');
const tests = [];
const test = (name, run) => tests.push({name, run});
const local = (page, id, i = 0) => page.locator('.patient').nth(i).locator(`[data-local-id="${id}"]`);

test('forty independent patients survive edits, middle insertion and full draft restoration', async page => {
  const count = 40;
  const metrics = await page.evaluate(count => {
    const start = performance.now();
    for(let i = 0; i < count; i++) {
      if(i) document.querySelectorAll('.patient')[i - 1].querySelector('[data-local-id="addPatientBtn"]').click();
      const p = document.querySelectorAll('.patient')[i];
      for(const [id, value] of Object.entries({name:`SYNTHETIC STRESS ${i}`, dob:'01/02/2000', symptoms:`Unique symptoms ${i}`, notes:`Line one ${i}\nLine two ${i}`})) {
        const field = p.querySelector(`[data-local-id="f_${id}"]`);
        field.value = value; field.dispatchEvent(new Event('input', {bubbles:true}));
      }
    }
    const ids = [...document.querySelectorAll('[id]')].map(n => n.id);
    return {elapsedMs:Math.round(performance.now() - start), duplicateIds:ids.length - new Set(ids).size};
  }, count);
  assert.equal(metrics.duplicateIds, 0);
  assert.equal(await page.locator('.patient').count(), count);
  for(let i = 0; i < count; i++) {
    const output = await local(page, 'output', i).inputValue();
    assert.ok(output.includes(`Patient: SYNTHETIC STRESS ${i}\n`));
    assert.ok(output.includes(`Symptoms: Unique symptoms ${i}\n`));
    assert.ok(output.endsWith(`Notes: Line one ${i}\nLine two ${i}`));
  }
  await local(page, 'f_symptoms', 12).fill('Changed only patient twelve');
  await local(page, 'addPatientBtn', 12).click();
  assert.equal(await local(page, 'f_name', 13).inputValue(), '');
  assert.equal(await local(page, 'f_name', 14).inputValue(), 'SYNTHETIC STRESS 13');
  const before = await page.locator('[data-local-id="output"]').evaluateAll(nodes => nodes.map(n => n.value));
  await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('hvnb_current_draft') || '{}').patients?.length === 41);
  await page.reload();
  await page.getByRole('button', {name:'Restore all 41 patients', exact:true}).click();
  assert.deepEqual(await page.locator('[data-local-id="output"]').evaluateAll(nodes => nodes.map(n => n.value)), before);
  console.log(`  Forty forms populated in ${metrics.elapsedMs} ms; 41 restored with exact separate outputs.`);
});

test('HTML-looking patient input remains literal in titles, output, clipboard and Office', async page => {
  const name = 'SYNTHETIC <img src=x onerror="window.__injected=true">';
  const tests = '<svg onload="window.__injected=true"> overnight';
  await local(page, 'f_name').fill(name);
  await local(page, 'f_dob').fill('01022000');
  await local(page, 'f_inspic').check();
  await local(page, 'f_overnights').fill(tests);
  await local(page, 'copyBtn').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('hvnb_current_office') || '[]').length === 1);
  assert.equal(await local(page, 'patientTitle').textContent(), 'Patient 1 · ' + name);
  assert.equal(await page.evaluate(() => window.__injected), undefined);
  assert.equal(await page.locator('.patient img, .patient svg, #officeContent img, #officeContent svg').count(), 0);
  assert.equal(await page.evaluate(() => window.__auditCopies.at(-1)), await local(page, 'output').inputValue());
  await page.locator('#view-office').click();
  assert.equal(await page.locator('.visit-name').textContent(), name);
  assert.equal(await page.locator('.overnight-tests').textContent(), tests);
});

test('prototype-looking custom choices are copied as literal option text', async page => {
  await page.evaluate(() => localStorage.setItem('hvnb_current_layout', JSON.stringify({v:4, base:12, sections:[{id:'custom_section', tab:'visit', title:'Custom', fields:[{id:'custom', type:'choice', label:'Custom choice', opts:['Yes'], sub:{id:'custom_sub', on:'Yes', opts:['constructor','toString'], out:{}}}]}]})));
  await page.reload();
  await page.locator('[data-choice="custom"]').click();
  await page.locator('[data-choice="custom_sub"][data-v="constructor"]').click();
  assert.equal(await local(page, 'output').inputValue(), '\u200BCustom choice: constructor');
  await page.locator('[data-choice="custom_sub"][data-v="toString"]').click();
  assert.equal(await local(page, 'output').inputValue(), '\u200BCustom choice: toString');
});

test('model-context navigation opens the requested workspace even while editing layout', async page => {
  await local(page, 'editBtn').click();
  const office = await page.evaluate(async () => window.__auditTool.execute({tab:'office'}));
  assert.equal(office.selected, true);
  assert.equal(await page.locator('#officeSection').isVisible(), true);
  assert.equal(await page.locator('#patients').isVisible(), false);
  const visit = await page.evaluate(async () => window.__auditTool.execute({tab:'visit'}));
  assert.equal(visit.selected, true);
  assert.equal(await local(page, 'panel-visit').isVisible(), true);
  const check = await page.evaluate(async () => window.__auditTool.execute({tab:'check'}));
  assert.equal(check.selected, true);
  assert.equal(await local(page, 'panel-check').isVisible(), true);
  const rejected = await page.evaluate(async () => { try { await window.__auditTool.execute({tab:'nope'}); return false; } catch { return true; } });
  assert.equal(rejected, true);
});

test('the application works without making patient-data network requests', async page => {
  const requested = [];
  page.on('request', request => requested.push(request.url()));
  await page.context().setOffline(true);
  await local(page, 'f_name').fill('SYNTHETIC OFFLINE');
  await local(page, 'f_dob').fill('02032001');
  await local(page, 'f_inspic').check();
  await local(page, 'f_overnights').fill('Urine culture');
  await local(page, 'copyBtn').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('hvnb_current_office') || '[]').length === 1);
  await page.locator('#view-office').click();
  assert.equal(await page.locator('.visit-name').textContent(), 'SYNTHETIC OFFLINE');
  assert.deepEqual(requested, []);
});

(async () => {
  const source = fs.readFileSync(path.resolve(process.env.AUDIT_SOURCE || 'index.html'));
  const server = http.createServer((req, res) => {res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(source);});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch(launchOptions);
  let failed = 0;
  const selected = tests.filter(t => !process.env.TEST_FILTER || t.name.includes(process.env.TEST_FILTER));
  try {
    for(const entry of selected) {
      const context = await browser.newContext();
      await context.addInitScript(() => {
        window.__auditCopies = [];
        Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:async text => {window.__auditCopies.push(text);}}});
        Object.defineProperty(document, 'modelContext', {configurable:true, value:{registerTool:tool => {window.__auditTool = tool;}}});
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await entry.run(page);
        assert.deepEqual(errors, [], 'No browser JavaScript errors');
        console.log('PASS ' + entry.name);
      } catch(e) {failed++; console.error('FAIL ' + entry.name + '\n' + e.stack);}
      finally {await context.close();}
    }
  } finally {await browser.close(); await new Promise(resolve => server.close(resolve));}
  console.log(`${selected.length - failed}/${selected.length} quality audit checks passed.`);
  if(failed) process.exitCode = 1;
})().catch(e => {console.error(e); process.exitCode = 1;});
