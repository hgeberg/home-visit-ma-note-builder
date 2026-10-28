'use strict';
// Patients Seen and height use disposable browser contexts and synthetic data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium, launchOptions} = require('./browser.cjs');
const root = path.resolve(__dirname, '..');
const tests = [], test = (name, run, installed = false) => tests.push({name, run, installed});
const patient = (page, n = 0) => page.locator('#patients .patient').nth(n);
const field = (page, id, n = 0) => patient(page, n).locator('[data-local-id="' + id + '"]');
const history = page => page.locator('#seenList .seen-visit');
const entry = (page, name) => history(page).filter({hasText:name});
const draft = page => page.evaluate(() => JSON.parse(localStorage.getItem('hvnb_current_app_draft') || 'null'));
const office = page => page.evaluate(() => JSON.parse(localStorage.getItem('hvnb_current_office') || '[]'));
const showSeen = page => page.locator('#view-seen').click();
const restore = page => page.getByRole('button', {name:/^Restore (this visit|all)/}).click();
const linked = (page, name) => page.locator('#patients .patient').filter({has:page.locator('[data-local-id="patientTitle"]').filter({hasText:name})});
async function seed(page, name, n = 0) {
  await field(page, 'f_name', n).fill(name);
  await field(page, 'f_dob', n).fill('01022000');
  await field(page, 'f_inspic', n).check();
  await field(page, 'f_symptoms', n).fill('SYNTHETIC cough');
  await field(page, 'f_height_ft', n).fill('5');
  await field(page, 'f_height_in', n).fill('10.5');
}
async function copy(page, n = 0) {
  await field(page, 'copyBtn', n).click();
  await field(page, 'sentBanner', n).waitFor({state:'visible'});
}
async function clear(page, n = 0) {
  await field(page, 'newBtn', n).click();
  const confirmation = page.getByRole('button', {name:'Clear this patient', exact:true});
  if (await confirmation.count()) await confirmation.click();
}
async function checkpoint(page) {
  await page.locator('#houseHeading').focus();
  await page.waitForTimeout(450);
}

test('All entered visits appear automatically, with or without tests, and blank forms are omitted', async page => {
  await showSeen(page); assert.equal(await history(page).count(), 0);
  await page.locator('#view-patients').click();
  await seed(page, 'SYNTHETIC NO LABS');
  await copy(page);
  await page.locator('#newHouseBtn').click();
  await seed(page, 'SYNTHETIC OVERNIGHTS', 1);
  await field(page, 'f_overnights', 1).fill('RPP'); await copy(page, 1);
  await page.locator('#appendPatient').click();
  await field(page, 'f_name', 2).fill('SYNTHETIC NOT COPIED');
  await page.locator('#appendPatient').click();
  await showSeen(page);
  assert.equal(await history(page).count(), 3);
  assert.equal((await office(page)).length, 1);
  assert.equal((await office(page))[0].name, 'SYNTHETIC OVERNIGHTS');
  assert.equal(await page.locator('#officeSection').isVisible(), false);
  assert.equal(await page.locator('#patients').isVisible(), false);
  await entry(page, 'SYNTHETIC NO LABS').getByRole('button').click();
  assert.equal(await page.locator('#houseHeading').innerText(), 'House 1');
  assert.equal(await field(page, 'f_height_in').inputValue(), '10.5');
});

test('One digit in feet focuses inches for the same patient and complete height joins the other vitals', async page => {
  await field(page, 'f_height_ft').pressSequentially('6');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.localId), 'f_height_in');
  await page.keyboard.type('0');
  await field(page, 'f_temp').fill('98.6');
  let text = await field(page, 'output').inputValue();
  assert.match(text, /Temp: 98.6/);assert.match(text, /Height: 6 ft 0 in/);
  await page.locator('#appendPatient').click();
  await field(page, 'f_height_ft', 1).pressSequentially('0');
  assert.equal(await page.evaluate(() => document.activeElement.id), await field(page, 'f_height_in', 1).getAttribute('id'));
  await page.keyboard.type('8.5');
  assert.match(await field(page, 'output', 1).inputValue(), /Height: 0 ft 8.5 in/);
  assert.equal(await field(page, 'f_height_in').inputValue(), '0');
  await field(page, 'f_height_in', 1).fill('12');
  assert.doesNotMatch(await field(page, 'output', 1).inputValue(), /Height:/);
  await field(page, 'f_height_ft', 1).fill('');
  assert.equal(await page.evaluate(() => document.activeElement.id), await field(page, 'f_height_ft', 1).getAttribute('id'));
});

for (const installed of [false, true]) {
  test((installed ? 'Installed app' : 'Regular browser') + ' preserves a no-lab visit after Clear patient, all tabs close, and Start fresh', async (page, context, url) => {
    await seed(page, 'SYNTHETIC ARCHIVED WITHOUT LABS');
    await field(page, 'tab-check').click(); await field(page, 'f_k_confirm').check(); await field(page, 'tab-visit').click();
    const original = await field(page, 'output').inputValue();
    await clear(page);
    await showSeen(page); assert.equal(await history(page).count(), 1);
    await page.close();
    let next = await context.newPage(); await next.goto(url);
    assert.equal(await next.getByRole('button', {name:/^Restore/}).count(), 0); await showSeen(next);
    assert.equal(await history(next).count(), 1);
    await entry(next, 'SYNTHETIC ARCHIVED WITHOUT LABS').getByRole('button').click();
    const visit = linked(next, 'SYNTHETIC ARCHIVED WITHOUT LABS');
    assert.equal(await visit.locator('[data-local-id="output"]').inputValue(), original);
    assert.equal(await visit.locator('[data-local-id="f_height_in"]').inputValue(), '10.5');
    await visit.locator('[data-local-id="tab-check"]').click();
    assert.equal(await visit.locator('[data-local-id="f_k_confirm"]').isChecked(), true);
    assert.equal((await office(next)).length, 0);
    await checkpoint(next);await next.close();next = await context.newPage();await next.goto(url);await restore(next);
    await showSeen(next);assert.equal(await history(next).count(), 1);
  }, installed);
}

test('Start fresh archives all current houses without copying and repeated reopening keeps one entry per visit', async (page, context, url) => {
  await seed(page, 'SYNTHETIC FIRST HOUSE');await page.locator('#newHouseBtn').click();await seed(page, 'SYNTHETIC SECOND HOUSE', 1);
  await checkpoint(page);await page.close();
  const next = await context.newPage();await next.goto(url);await next.getByRole('button', {name:'Start fresh', exact:true}).click();
  await showSeen(next);assert.equal(await history(next).count(), 2);
  await entry(next, 'SYNTHETIC FIRST HOUSE').getByRole('button').click();await showSeen(next);assert.equal(await history(next).count(), 2);
  await entry(next, 'SYNTHETIC FIRST HOUSE').getByRole('button').click();
  assert.equal(await next.locator('.patient').count(), 2, 'Repeated opening uses the active form instead of adding duplicates');
  await next.reload();await restore(next);await showSeen(next);assert.equal(await history(next).count(), 2);
});

test('Clearing and undoing visits with the same name and DOB keeps identities and current edits distinct', async page => {
  await seed(page, 'SYNTHETIC IDENTICAL');await field(page, 'f_notes').fill('SYNTHETIC FIRST VISIT');await clear(page);
  await seed(page, 'SYNTHETIC IDENTICAL');await field(page, 'f_notes').fill('SYNTHETIC SECOND VISIT');
  await page.locator('#undoAction').click();await showSeen(page);assert.equal(await history(page).count(), 2);
  const ids = await history(page).locator('button').evaluateAll(els => els.map(el => el.dataset.seenVisit));
  assert.equal(new Set(ids).size, 2);
  await history(page).first().getByRole('button').click();
  const values = await page.locator('[data-local-id="f_notes"]').evaluateAll(els => els.map(el => el.value));
  assert(values.includes('SYNTHETIC FIRST VISIT'));assert(values.includes('SYNTHETIC SECOND VISIT'));
});

test('Search supports names and digits-only DOB, renders patient text safely, and preserves selection', async page => {
  await seed(page, 'SYNTHETIC <script>NOT CODE</script>');await page.locator('#appendPatient').click();await seed(page, 'SYNTHETIC BETA', 1);
  await field(page, 'f_dob', 1).fill('03042001');await showSeen(page);
  await page.locator('#seenSearch').fill('01022000');assert.equal(await history(page).count(), 1);assert.match(await history(page).innerText(), /<script>NOT CODE<\/script>/);
  assert.equal(await page.locator('#seenList script').count(), 0);
  await page.locator('#seenSearch').fill('BETA');assert.equal(await history(page).count(), 1);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'seenSearch');
  await page.locator('#seenSearch').fill('NO MATCH');assert.match(await page.locator('#seenStatus').innerText(), /0.*No matches/);
  await page.locator('#clearSeenSearch').click();assert.equal(await history(page).count(), 2);
});

test('Removing an Office entry does not remove its independent Patients Seen visit', async page => {
  await seed(page, 'SYNTHETIC INDEPENDENT VISIT');await field(page, 'f_overnights').fill('RPP');await copy(page);await clear(page);
  await page.locator('#view-office').click();await page.locator('.office-patient').getByRole('button', {name:'Remove', exact:true}).click();
  await page.locator('dialog[open]').getByRole('button', {name:'Remove', exact:true}).click();
  assert.equal((await office(page)).length, 0);
  await showSeen(page);assert.equal(await entry(page, 'SYNTHETIC INDEPENDENT VISIT').count(), 1);
  await entry(page, 'SYNTHETIC INDEPENDENT VISIT').getByRole('button').click();
  assert.equal(await linked(page, 'SYNTHETIC INDEPENDENT VISIT').locator('[data-local-id="f_overnights"]').inputValue(), 'RPP');
});

test('History uses the persistent-write warning and recovers newer no-test archives from the session copy', async (page, context, url) => {
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if(this === localStorage && key === 'hvnb_current_app_draft') throw new Error('Synthetic history quota');
      return original.call(this, key, value);
    };
  });
  await seed(page, 'SYNTHETIC SESSION HISTORY');await clear(page);await showSeen(page);
  assert.equal(await page.locator('#draftWarning').isVisible(), true);assert.equal(await history(page).count(), 1);
  await page.reload();await showSeen(page);assert.equal(await history(page).count(), 1);
  assert.equal(await page.locator('#draftWarning').isVisible(), false);
});

test('Clear shift removes active and archived visits from this section and both recovery copies', async page => {
  await seed(page, 'SYNTHETIC OLD HISTORY');await clear(page);await seed(page, 'SYNTHETIC CURRENT HISTORY');await showSeen(page);
  assert.equal(await history(page).count(), 2);
  await page.locator('#clearShiftBtn').click();await page.locator('#confirmClearShift').click();
  await showSeen(page);assert.equal(await history(page).count(), 0);
  assert.equal(await draft(page), null);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('hvnb_current_draft')), null);
  await page.reload();await showSeen(page);assert.equal(await history(page).count(), 0);
});

test('Visit, Patients Seen and Office keyboard navigation keeps one Office action and both height inputs usable', async page => {
  assert.deepEqual(await page.locator('.workspace-tabs [role="tab"]').allTextContents(), ['Visit', 'Patients Seen', 'Office']);
  assert.equal(await page.locator('.patient [data-local-id="tab-office"], .patient [data-local-id="badge-office"]').count(), 0);
  assert.equal(await patient(page).locator('.tabs [role="tab"]').count(), 2);
  assert.equal(await field(page, 'tab-visit').innerText(), 'Visit');
  assert.match(await field(page, 'tab-check').innerText(), /^Checklist\b/);
  await page.locator('#view-patients').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#view-seen').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#view-office').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Home');assert.equal(await page.locator('#view-patients').getAttribute('aria-selected'), 'true');
  for(const width of [320,390,810,1440]){
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal overflow at '+width);
    const bounds = await page.locator('[data-local-id="f_height_ft"], [data-local-id="f_height_in"]').evaluateAll(els => els.map(el => {const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};}));
    assert(bounds.every(b => b.width >= 70 && b.left >= 0 && b.right <= width));
    assert(bounds[0].right < bounds[1].left, 'Feet and inches stay side by side');
  }
});

test('Workspace navigation stays reachable while scrolling and keeps checklist state through Office and saved visits', async page => {
  await seed(page, 'SYNTHETIC STICKY NAVIGATION');
  await field(page, 'tab-check').click();await field(page, 'f_k_confirm').check();await field(page, 'tab-visit').click();
  for(const width of [320,390,810,1280]){
    await page.setViewportSize({width,height:700});
    await field(page, 'f_notes').evaluate(el => el.scrollIntoView({block:'start'}));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const bar = await page.locator('.workspace-tools').evaluate(el => {
      const box = el.getBoundingClientRect(), style = getComputedStyle(el);
      return {top:box.top,bottom:box.bottom,left:box.left,right:box.right,height:box.height,position:style.position,expectedTop:parseFloat(style.top),scrollY,viewportHeight:innerHeight};
    });
    assert(bar.scrollY > 100, 'The visit is scrolled at '+width);
    assert.equal(bar.position, 'sticky');
    assert(Math.abs(bar.top - bar.expectedTop) <= 2, 'Workspace navigation stays pinned at '+width+': '+JSON.stringify(bar));
    assert(bar.top >= -1 && bar.bottom <= bar.viewportHeight, 'The complete navigation stays visible at '+width);
    assert(bar.left >= -1 && bar.right <= width+1, 'The navigation fits at '+width);
    const patientTabs = await patient(page).locator('.tabs').boundingBox();
    assert(patientTabs.y >= bar.bottom-1, 'Visit and Checklist stay below workspace navigation at '+width);
    for(const id of ['view-patients','view-seen','view-office']){
      const unobstructed = await page.locator('#'+id).evaluate(el => {
        const box = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(box.left+box.width/2, box.top+box.height/2));
      });
      assert(unobstructed, id+' is reachable above the scrolled form at '+width);
    }
    if(width === 390 || width === 1280) await page.screenshot({path:path.join(root,'qa','workspace-sticky-'+width+'.png')});
    await page.locator('#draftWarning').evaluate(el => {el.textContent='Synthetic save warning: keep this page open and retry saving this visit.';el.hidden=false;});
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const warningBar = await page.locator('.workspace-tools').boundingBox();
    const warningTabs = await patient(page).locator('.tabs').boundingBox();
    assert(warningBar.height >= bar.height, 'The navigation includes the visible save warning at '+width);
    assert(warningTabs.y >= warningBar.y+warningBar.height-1, 'The save warning does not cover Visit and Checklist at '+width);
    for(const id of ['view-patients','view-seen','view-office']){
      assert.equal(await page.locator('#'+id).evaluate(el => {const box=el.getBoundingClientRect();return el.contains(document.elementFromPoint(box.left+box.width/2,box.top+box.height/2));}), true, id+' stays reachable with a save warning at '+width);
    }
    await page.locator('#draftWarning').evaluate(el => {el.hidden=true;});
    await page.locator('#view-office').click();
    assert.equal(await page.locator('#officeSection').isVisible(), true);
    await page.locator('#view-patients').click();
    await field(page, 'tab-check').click();
    assert.equal(await field(page, 'f_k_confirm').isChecked(), true);
    await field(page, 'tab-visit').click();
  }
  await clear(page);await showSeen(page);
  await entry(page, 'SYNTHETIC STICKY NAVIGATION').getByRole('button').click();
  const visit = linked(page, 'SYNTHETIC STICKY NAVIGATION');
  await visit.locator('[data-local-id="tab-check"]').click();
  assert.equal(await visit.locator('[data-local-id="f_k_confirm"]').isChecked(), true);
  assert.equal(await page.locator('#view-patients').getAttribute('aria-selected'), 'true');
});

(async () => {
  const server = http.createServer((request, response) => {
    if(new URL(request.url, 'http://local').pathname !== '/app/') {response.writeHead(404);response.end();return;}
    response.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});response.end(fs.readFileSync(path.join(root,'index.html')));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:'+server.address().port+'/app/';
  let browser, failed=0;
  try {
    browser=await chromium.launch(launchOptions);
    for(const entry of tests){
      const context=await browser.newContext({serviceWorkers:'block',viewport:{width:810,height:1080}});context.setDefaultTimeout(10000);
      await context.addInitScript(installed => {
        Object.defineProperty(navigator,'standalone',{configurable:true,value:installed});
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.resolve()}});
      }, entry.installed);
      const page=await context.newPage(), errors=[];page.on('pageerror',error=>errors.push(error.message));
      try{await page.goto(url);await entry.run(page,context,url);assert.deepEqual(errors,[]);console.log('PASS '+entry.name);}
      catch(error){failed++;console.error('FAIL '+entry.name+'\n'+(error.stack||error));}
      finally{await context.close();}
    }
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
  console.log((tests.length-failed)+'/'+tests.length+' Patients Seen and height browser checks passed.');if(failed)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
