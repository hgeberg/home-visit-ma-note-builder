'use strict';
// NJ field workflow regressions use disposable contexts and synthetic visits.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium, launchOptions} = require('./browser.cjs');
const root = path.resolve(__dirname, '..');
const tests = [], test = (name, run) => tests.push({name, run});
const patient = (page, n = 0) => page.locator('#patients .patient').nth(n);
const field = (page, id, n = 0) => patient(page, n).locator('[data-local-id="' + id + '"]');
const choice = (page, id, value, n = 0) => patient(page, n).locator('[data-choice="' + id + '"][data-v="' + value + '"]');
const output = (page, n = 0) => field(page, 'output', n).inputValue();
const dialog = page => page.locator('dialog[open]');
const testRow = (page, id, n = 0) => patient(page, n).locator('.testrow[data-item="' + id + '"]');
const restore = page => page.getByRole('button', {name:/^Restore (this visit|all)/}).click();
const vitalReview = (page, id) => dialog(page).locator('[data-vital-review="' + id + '"]');
const vitalOption = (page, id, name) => vitalReview(page, id).getByRole('radio', {name, exact:true});
const vitalExplanation = (page, id) => vitalReview(page, id).locator('input');
const utiIds = ['k_uti_dip', 'k_uti_photo', 'k_uti_ua', 'k_uti_uc', 'k_uti_cup', 'k_uti_tube'];
async function seed(page, name = 'SYNTHETIC NJ GUIDELINES', n = 0, vitals = true) {
  await field(page, 'f_name', n).fill(name);
  await field(page, 'f_dob', n).fill('01022000');
  await field(page, 'f_inspic', n).check();
  if(vitals) {
    await field(page, 'f_temp', n).fill('98.6');
    await field(page, 'f_weight', n).fill('145');
    await field(page, 'f_height_ft', n).fill('5');
    await field(page, 'f_height_in', n).fill('10');
  }
}
async function selectTest(page, id, result, n = 0) {
  const row = testRow(page, id, n);
  await row.locator('input[type="checkbox"]').check();
  if(result) await row.getByRole('radio', {name:result, exact:true}).click();
}
async function inspectCopy(page, n = 0) {
  await field(page, 'copyBtn', n).click();
  await dialog(page).waitFor({state:'visible'});
  return dialog(page).innerText();
}
async function goBack(page) { await dialog(page).getByRole('button', {name:'Go back', exact:true}).click(); }
async function copy(page, n = 0) {
  await field(page, 'copyBtn', n).click();
  await field(page, 'sentBanner', n).waitFor({state:'visible'});
  assert.equal(await dialog(page).count(), 0);
  return page.evaluate(() => window.syntheticCopied);
}
async function checkpoint(page) {
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  return page.evaluate(() => JSON.parse(localStorage.getItem('hvnb_current_app_draft')));
}

test('Missing-vital options stay out of the form and appear only when Copy is pressed', async page => {
  await seed(page, 'SYNTHETIC MISSING ADULT VITALS', 0, false);
  for(const id of ['temp_reason', 'weight_reason', 'height_reason']) assert.equal(await field(page, 'f_' + id).count(), 0);
  assert.equal(await patient(page).getByText('Unable to obtain', {exact:true}).count(), 0);
  assert.equal(await patient(page).getByText('Pt refused', {exact:true}).count(), 0);
  assert.equal(await dialog(page).count(), 0);
  const warning = await inspectCopy(page);
  assert.match(warning, /temp(?:erature)?/i);assert.match(warning, /height/i);assert.match(warning, /weight/i);
  for(const id of ['temp','weight','height']) {
    for(const name of ['Unable to obtain','Pt refused']) assert.equal(await vitalOption(page,id,name).isVisible(), true);
    assert.equal(await vitalExplanation(page,id).isVisible(), false);
  }
  await vitalOption(page,'temp','Unable to obtain').click();
  await vitalExplanation(page,'temp').fill('SYNTHETIC thermometer unavailable');
  await vitalOption(page,'weight','Pt refused').click();
  await dialog(page).getByRole('button',{name:'Copy anyways',exact:true}).click();
  await field(page,'sentBanner').waitFor({state:'visible'});
  const copied = await page.evaluate(() => window.syntheticCopied);
  assert.match(copied,/Temperature not obtained:.*Unable to obtain.*SYNTHETIC thermometer unavailable/);
  assert.match(copied,/Weight not obtained: Pt refused/);
  assert.doesNotMatch(copied,/Height not obtained|NOT MARKED|: missing/i);
  const saved=await checkpoint(page);
  assert.match(saved.patients[0].vals.temp_reason,/SYNTHETIC thermometer unavailable/);
  assert.equal(saved.patients[0].vals.weight_reason,'Pt refused');
  assert(!saved.patients[0].vals.height_reason);
});

test('Unable to obtain accepts an optional explanation and cancel leaves answers unchanged', async page => {
  await seed(page, 'SYNTHETIC CANCEL MISSING VITALS',0,false);
  await inspectCopy(page);
  await dialog(page).getByRole('button',{name:'Copy message',exact:true}).click();
  assert.equal(await dialog(page).count(),1);
  assert.match(await dialog(page).getByRole('alert').innerText(),/choose a reason/i);
  assert.equal(await page.evaluate(() => window.syntheticCopied),undefined);
  await vitalOption(page,'temp','Unable to obtain').click();
  await vitalExplanation(page,'temp').fill('SYNTHETIC discarded reason');
  await vitalOption(page,'weight','Pt refused').click();
  await goBack(page);
  assert.doesNotMatch(await output(page),/discarded reason|not obtained|Pt refused/);
  let saved=await checkpoint(page);
  for(const id of ['temp_reason','weight_reason','height_reason']) assert(!saved.patients[0].vals[id]);
  await inspectCopy(page);
  for(const id of ['temp','weight','height']) await vitalOption(page,id,'Unable to obtain').click();
  await dialog(page).getByRole('button',{name:'Copy message',exact:true}).click();
  await field(page,'sentBanner').waitFor({state:'visible'});
  const copied=await page.evaluate(() => window.syntheticCopied);
  assert.match(copied,/Temperature not obtained: Unable to obtain/);
  assert.match(copied,/Weight not obtained: Unable to obtain/);
  assert.match(copied,/Height not obtained: Unable to obtain/);
});

test('Copy anyways bypasses missing vitals without inventing unavailable or refused reasons', async page => {
  await seed(page,'SYNTHETIC COPY WITHOUT VITALS',0,false);
  await inspectCopy(page);
  await dialog(page).getByRole('button',{name:'Copy anyways',exact:true}).click();
  await field(page,'sentBanner').waitFor({state:'visible'});
  const copied=await page.evaluate(() => window.syntheticCopied);
  assert.match(copied,/SYNTHETIC COPY WITHOUT VITALS/);
  assert.doesNotMatch(copied,/not obtained|Unable to obtain|refused|NOT MARKED|: missing/i);
  const saved=await checkpoint(page);
  for(const id of ['temp_reason','weight_reason','height_reason']) assert(!saved.patients[0].vals[id]);
});

test('Recorded missing-vital choices are prefilled at the next copy and only missing vitals appear', async page => {
  await seed(page,'SYNTHETIC REPEAT MISSING TEMPERATURE');
  await field(page,'f_temp').fill('');
  await inspectCopy(page);
  assert.equal(await vitalReview(page,'temp').count(),1);
  assert.equal(await vitalReview(page,'weight').count(),0);
  assert.equal(await vitalReview(page,'height').count(),0);
  await vitalOption(page,'temp','Unable to obtain').click();
  await vitalExplanation(page,'temp').fill('SYNTHETIC repeated thermometer issue');
  await dialog(page).getByRole('button',{name:'Copy message',exact:true}).click();
  await field(page,'sentBanner').waitFor({state:'visible'});
  await inspectCopy(page);
  assert.equal(await vitalOption(page,'temp','Unable to obtain').getAttribute('aria-checked'),'true');
  assert.equal(await vitalExplanation(page,'temp').inputValue(),'SYNTHETIC repeated thermometer issue');
  await goBack(page);
  const saved=await checkpoint(page);
  assert.match(saved.patients[0].vals.temp_reason,/SYNTHETIC repeated thermometer issue/);
});

test('An incomplete height offers the missing-vital options and can record refusal', async page => {
  await seed(page,'SYNTHETIC INCOMPLETE HEIGHT');
  await field(page,'f_height_in').fill('');
  await inspectCopy(page);
  assert.equal(await vitalReview(page,'height').count(),1);
  assert.equal(await vitalReview(page,'temp').count(),0);
  assert.equal(await vitalReview(page,'weight').count(),0);
  await vitalOption(page,'height','Pt refused').click();
  await dialog(page).getByRole('button',{name:'Copy message',exact:true}).click();
  await field(page,'sentBanner').waitFor({state:'visible'});
  const copied=await page.evaluate(() => window.syntheticCopied);
  assert.match(copied,/Height not obtained: Pt refused/);
  assert.doesNotMatch(copied,/Height: 5 ft|Height source/);
});

test('Collected vitals hide saved popup reasons and a patient-reported height is included in the message', async page => {
  await seed(page, 'SYNTHETIC REPORTED HEIGHT', 0, false);
  await inspectCopy(page);
  for(const id of ['temp','weight','height']) await vitalOption(page,id,'Pt refused').click();
  await dialog(page).getByRole('button',{name:'Copy message',exact:true}).click();
  await field(page,'sentBanner').waitFor({state:'visible'});
  await field(page, 'f_temp').fill('99.1');
  await dialog(page).getByRole('button',{name:'Same patient, keep editing',exact:true}).click();
  await field(page, 'f_weight').fill('170');
  await field(page, 'f_height_ft').fill('6');await field(page, 'f_height_in').fill('0');
  await choice(page, 'height_source', 'Patient-reported').click();
  for(const id of ['temp_reason', 'weight_reason', 'height_reason']) assert.equal(await field(page, 'f_' + id).count(), 0);
  assert.doesNotMatch(await field(page, 'f_weight').getAttribute('placeholder'), /Peds|under 100/i);
  assert.doesNotMatch(await field(page, 'f_bp').getAttribute('placeholder'), /Only if/i);
  const copied = await copy(page);
  assert.match(copied, /Height: 6 ft 0 in/);assert.match(copied, /Patient-reported/);
  assert.doesNotMatch(copied, /not obtained|Pt refused/);
});

test('Flu preferences require Tamiflu formulation only when relevant and preserve hidden choices', async page => {
  await seed(page);
  assert.equal(await patient(page).locator('[data-field="flu_pref"]').isVisible(), false);
  await selectTest(page,'flu','running');
  assert.equal(await patient(page).locator('[data-field="flu_pref"]').isVisible(), true);
  assert.equal(await patient(page).locator('[data-field="tamiflu_form"]').isVisible(), false);
  await choice(page, 'flu_pref', 'Tamiflu').click();
  assert.equal(await patient(page).locator('[data-field="tamiflu_form"]').isVisible(), true);
  assert.match(await inspectCopy(page), /Tamiflu.*(?:form|capsule|liquid|not marked)/i);
  await goBack(page);
  await choice(page, 'tamiflu_form', 'Capsules').click();
  assert.match(await output(page), /Tamiflu/);assert.match(await output(page), /Capsules/);
  await choice(page, 'flu_pref', 'Xofluza').click();
  assert.equal(await patient(page).locator('[data-field="tamiflu_form"]').isVisible(), false);
  assert.match(await output(page), /Xofluza/);assert.doesNotMatch(await output(page), /Tamiflu|Capsules/);
  await choice(page, 'flu_pref', 'Discuss with clinician').click();
  assert.match(await output(page), /Discuss with clinician/);assert.doesNotMatch(await output(page), /Xofluza|Tamiflu|Capsules/);
  await choice(page, 'flu_pref', 'Tamiflu').click();
  assert.equal(await choice(page, 'tamiflu_form', 'Capsules').getAttribute('aria-checked'), 'true');
  await choice(page, 'tamiflu_form', 'Liquid').click();
  await testRow(page,'flu').locator('input[type="checkbox"]').uncheck();
  assert.equal(await patient(page).locator('[data-field="flu_pref"]').isVisible(), false);
  assert.equal(await patient(page).locator('[data-field="tamiflu_form"]').isVisible(), false);
  assert.doesNotMatch(await output(page),/Flu treatment preference|Tamiflu form|Tamiflu|Liquid/);
  await selectTest(page,'flu','running');
  assert.equal(await choice(page,'flu_pref','Tamiflu').getAttribute('aria-checked'),'true');
  assert.equal(await choice(page,'tamiflu_form','Liquid').getAttribute('aria-checked'),'true');
  const copied = await copy(page);assert.match(copied, /Tamiflu/);assert.match(copied, /Liquid/);assert.doesNotMatch(copied, /Capsules/);
});

test('A positive rapid strep with a strep lab warns until the clinician request is confirmed', async page => {
  await seed(page);
  await selectTest(page, 'strep', 'Positive');await choice(page, 'aware', 'Aware').click();
  await field(page, 'f_overnights').fill('Strep throat PCR');
  assert.equal(await field(page, 'f_strep_lab_requested').isVisible(), true);
  const warning = await inspectCopy(page);assert.match(warning, /strep/i);assert.match(warning, /clinician/i);
  assert.equal(await field(page, 'f_overnights').inputValue(), 'Strep throat PCR');
  await goBack(page);await field(page, 'f_strep_lab_requested').check();
  const copied = await copy(page);
  assert.match(copied, /Labs collected\/sent: Strep throat PCR/);
  assert.doesNotMatch(copied, /specifically requested|Overnights sent/);
  assert.equal(await field(page, 'f_overnights').inputValue(), 'Strep throat PCR');
});

for(const id of ['flu', 'covid']) {
  test('A positive rapid ' + id + ' warns for 4plex/RPP while running and negative results do not', async page => {
    await seed(page);
    await selectTest(page, id, 'running');await field(page, 'f_overnights').fill('4plex');
    assert.equal(await field(page, 'f_viral_lab_requested').isVisible(), false);
    assert.match(await output(page), new RegExp('Rapid ' + (id === 'flu' ? 'flu' : 'COVID') + ': running'));
    await testRow(page, id).getByRole('radio', {name:'Negative', exact:true}).click();
    assert.equal(await field(page, 'f_viral_lab_requested').isVisible(), false);
    await testRow(page, id).getByRole('radio', {name:'Positive', exact:true}).click();
    if(id === 'flu') await testRow(page, id).getByRole('radio', {name:'A', exact:true}).click();
    await choice(page, 'aware', 'Aware').click();
    assert.equal(await field(page, 'f_viral_lab_requested').isVisible(), true);
    const warning = await inspectCopy(page);assert.match(warning, /4plex|RPP/i);assert.match(warning, /clinician/i);await goBack(page);
    await field(page, 'f_overnights').fill('RPP');await field(page, 'f_viral_lab_requested').check();
    const copied = await copy(page);assert.match(copied, /Labs collected\/sent: RPP/);
    assert.equal(await field(page, 'f_overnights').inputValue(), 'RPP');assert.doesNotMatch(copied, /specifically requested/);
  });
}

test('Lab choices and nearby explanations use the new terminology without changing entered orders', async page => {
  await seed(page);
  const labs = patient(page).locator('[data-field="overnights"]');
  for(const name of ['UA', 'Urine culture', 'Stool culture', 'GPP']) {
    await labs.getByRole('button', {name, exact:true}).click();
    assert((await field(page, 'f_overnights').inputValue()).includes(name));
  }
  const text = await output(page);assert.match(text, /Labs collected\/sent:/);assert.doesNotMatch(text, /Overnights sent/);
  const visit = await patient(page).locator('[data-local-id="panel-visit"]').innerText();
  assert.match(visit, /strep.*PCR|PCR.*strep/i);assert.match(visit, /culture/i);assert.match(visit, /4plex/i);assert.match(visit, /RPP/i);
  await page.locator('#view-office').click();assert.doesNotMatch(await page.locator('#officeSection').innerText(), /overnight/i);
});

test('UTI steps are conditional, kept out of Teams, and survive archived-visit reopening', async page => {
  await seed(page, 'SYNTHETIC UTI REOPEN');
  await selectTest(page, 'urine');await choice(page, 'urine_reason', 'Suspected UTI').click();
  await field(page, 'f_overnights').fill('UA, Urine culture');
  await field(page, 'tab-check').click();
  for(const id of utiIds) {assert.equal(await field(page, 'f_' + id).isVisible(), true);await field(page, 'f_' + id).check();}
  await field(page, 'tab-visit').click();
  assert.doesNotMatch(await output(page), /cup.*label|tube.*label|dipstick.*photo|k_uti/i);
  await checkpoint(page);await field(page, 'newBtn').click();
  await dialog(page).getByRole('button', {name:'Clear this patient', exact:true}).click();
  await page.locator('#view-seen').click();
  await page.locator('#seenList .seen-visit').filter({hasText:'SYNTHETIC UTI REOPEN'}).getByRole('button').click();
  const n = await page.locator('#patients .patient').count() - 1;
  assert.equal(await choice(page, 'urine_reason', 'Suspected UTI', n).getAttribute('aria-checked'), 'true');
  await field(page, 'tab-check', n).click();
  for(const id of utiIds) assert.equal(await field(page, 'f_' + id, n).isChecked(), true);
  await field(page, 'tab-visit', n).click();await choice(page, 'urine_reason', 'With bloodwork', n).click();
  await field(page, 'tab-check', n).click();
  for(const id of utiIds) assert.equal(await field(page, 'f_' + id, n).isVisible(), false);
  await field(page, 'tab-visit', n).click();await choice(page, 'urine_reason', 'Suspected UTI', n).click();
  await field(page, 'f_overnights', n).fill('None');await testRow(page, 'urine', n).locator('input[type="checkbox"]').uncheck();
  assert.equal(await patient(page, n).locator('[data-field="urine_reason"]').isVisible(), false);
  assert.doesNotMatch(await output(page, n), /Urine.*Suspected UTI/i);
});

test('UTI copy reminders cover dipstick, UA and culture while bloodwork urine stays separate', async page => {
  await seed(page);
  await field(page, 'f_overnights').fill('Urine culture');await choice(page, 'urine_reason', 'Suspected UTI').click();
  let warning = await inspectCopy(page);
  assert.match(warning, /dip/i);assert.match(warning, /\bUA\b|urinalysis/i);await goBack(page);
  await selectTest(page, 'urine');await field(page, 'f_overnights').fill('UA');
  warning = await inspectCopy(page);assert.match(warning, /culture|\bUC\b/i);await goBack(page);
  await choice(page, 'urine_reason', 'With bloodwork').click();
  await testRow(page, 'urine').locator('input[type="checkbox"]').uncheck();
  const copied = await copy(page);assert.match(copied, /With bloodwork/);assert.doesNotMatch(copied, /Suspected UTI/);
});

test('Old saved forms gain the new fields while keeping custom answers, checklists and running tests', async (page, context, url) => {
  await seed(page, 'SYNTHETIC LEGACY GUIDELINES');
  await selectTest(page, 'flu', 'running');await field(page, 'f_overnights').fill('SYNTHETIC custom lab, UA');
  await field(page, 'tab-check').click();await field(page, 'f_k_confirm').check();await field(page, 'tab-visit').click();
  const saved = await checkpoint(page), layout = saved.layout;
  delete layout.njGuidelinesVersion;
  const newIds = new Set(['temp_reason', 'weight_reason', 'height_reason', 'height_source', 'flu_pref', 'tamiflu_form', 'strep_lab_requested', 'viral_lab_requested', 'urine_reason', ...utiIds]);
  for(const section of layout.sections) {
    section.fields = section.fields.filter(f => !newIds.has(f.id));
    const weight = section.fields.find(f => f.id === 'weight');if(weight) weight.ph = 'Peds or under 100 lb';
    const labs = section.fields.find(f => f.id === 'overnights');if(labs) {labs.label = 'Overnights sent';labs.chips = [{v:'SYNTHETIC custom lab',m:'add'}];}
  }
  layout.sections[0].title = 'SYNTHETIC CUSTOM SECTION';
  layout.sections[0].fields.push({id:'legacy_custom',type:'text',label:'SYNTHETIC custom field'});
  saved.patients[0].vals.legacy_custom = 'SYNTHETIC retained answer';
  saved.patients[0].vals.temp = '';
  saved.patients[0].vals.temp_reason = 'SYNTHETIC legacy unavailable explanation';
  // Install the old fixture after closing the live form so its pagehide save
  // cannot replace the synthetic layout with the current form snapshot.
  await page.close();page = await context.newPage();
  await page.addInitScript(value => {
    if(localStorage.getItem('synthetic_guideline_fixture')) return;
    localStorage.setItem('synthetic_guideline_fixture', 'installed');
    localStorage.setItem('hvnb_current_app_draft', JSON.stringify(value));
    localStorage.setItem('hvnb_current_layout', JSON.stringify(value.layout));
    sessionStorage.removeItem('hvnb_current_draft');
  }, saved);
  await page.goto(url);await restore(page);
  assert.equal(await page.getByRole('heading', {name:'SYNTHETIC CUSTOM SECTION',exact:true}).count(), 1);
  assert.equal(await field(page, 'f_legacy_custom').inputValue(), 'SYNTHETIC retained answer');
  assert.equal(await field(page, 'f_overnights').inputValue(), 'SYNTHETIC custom lab, UA');
  assert.match(await output(page), /Rapid flu: running/);assert.match(await output(page), /Labs collected\/sent:/);
  assert.equal(await choice(page, 'flu_pref', 'Tamiflu').count(), 1);
  assert.equal(await patient(page).locator('[data-field="overnights"]').getByRole('button', {name:'UA', exact:true}).count(), 1);
  assert.equal(await patient(page).locator('[data-field="overnights"]').getByRole('button', {name:'SYNTHETIC custom lab', exact:true}).count(), 1);
  await field(page, 'tab-check').click();assert.equal(await field(page, 'f_k_confirm').isChecked(), true);
  for(const id of utiIds) assert.equal(await field(page, 'f_' + id).count(), 1);
  await field(page, 'tab-visit').click();await checkpoint(page);await page.reload();await restore(page);
  assert.equal(await choice(page, 'flu_pref', 'Tamiflu').count(), 1);
  assert.equal(await field(page, 'f_legacy_custom').inputValue(), 'SYNTHETIC retained answer');
  assert.equal(await field(page,'f_temp_reason').count(),0);
  assert.match(await output(page),/Temperature not obtained: SYNTHETIC legacy unavailable explanation/);
  await inspectCopy(page);
  assert.equal(await vitalOption(page,'temp','Unable to obtain').getAttribute('aria-checked'),'true');
  assert.equal(await vitalExplanation(page,'temp').inputValue(),'SYNTHETIC legacy unavailable explanation');
  await goBack(page);
  const retained=await checkpoint(page);
  assert.equal(retained.patients[0].vals.temp_reason,'SYNTHETIC legacy unavailable explanation');
});

test('Preferences, reasons and lab overrides stay isolated across patients and reloads', async page => {
  await seed(page, 'SYNTHETIC FIRST PREFERENCE');await selectTest(page,'flu','running');await choice(page, 'flu_pref', 'Tamiflu').click();await choice(page, 'tamiflu_form', 'Capsules').click();
  await selectTest(page, 'strep', 'Positive');await choice(page, 'aware', 'Aware').click();await field(page, 'f_overnights').fill('Strep culture');await field(page, 'f_strep_lab_requested').check();
  await page.locator('#appendPatient').click();await seed(page, 'SYNTHETIC SECOND PREFERENCE', 1, false);
  await selectTest(page,'flu','running',1);await choice(page, 'flu_pref', 'Xofluza', 1).click();
  await inspectCopy(page,1);
  for(const id of ['temp','weight','height']) {await vitalOption(page,id,'Unable to obtain').click();await vitalExplanation(page,id).fill('SYNTHETIC second patient unavailable');}
  await dialog(page).getByRole('button',{name:'Copy message',exact:true}).click();
  await field(page,'sentBanner',1).waitFor({state:'visible'});
  await checkpoint(page);await page.reload();await restore(page);
  assert.equal(await choice(page, 'flu_pref', 'Tamiflu').getAttribute('aria-checked'), 'true');
  assert.equal(await field(page, 'f_strep_lab_requested').isChecked(), true);
  assert.equal(await choice(page, 'flu_pref', 'Xofluza', 1).getAttribute('aria-checked'), 'true');
  assert.doesNotMatch(await output(page), /second patient unavailable|Xofluza/);
  assert.doesNotMatch(await output(page, 1), /Tamiflu|Capsules|Strep culture/);
});

test('New preferences and conditional UTI checks fit mobile and desktop widths', async page => {
  await seed(page, 'SYNTHETIC MOBILE GUIDELINES', 0, false);
  await page.setViewportSize({width:320,height:900});await inspectCopy(page);
  await vitalOption(page,'temp','Unable to obtain').click();
  await vitalExplanation(page,'temp').fill('SYNTHETIC device unavailable');
  assert.equal(await dialog(page).getByRole('button',{name:'Copy anyways',exact:true}).isVisible(),true);
  await page.screenshot({path:path.join(root,'qa','guideline-vitals-popup-320.png')});
  await goBack(page);
  await field(page, 'f_temp').fill('98.6');await field(page, 'f_weight').fill('145');
  await field(page, 'f_height_ft').fill('5');await field(page, 'f_height_in').fill('10');
  await selectTest(page,'flu','running');await choice(page, 'flu_pref', 'Tamiflu').click();await selectTest(page, 'urine');await choice(page, 'urine_reason', 'Suspected UTI').click();
  await selectTest(page, 'flu', 'Positive');await testRow(page, 'flu').getByRole('radio', {name:'A',exact:true}).click();
  await choice(page, 'aware', 'Aware').click();await field(page, 'f_overnights').fill('RPP, UA, Urine culture');
  for(const width of [320, 390, 1280]) {
    await page.setViewportSize({width,height:900});
    await patient(page).locator('[data-field="flu_pref"]').scrollIntoViewIfNeeded();
    let size = await page.evaluate(() => ({width:innerWidth,scroll:document.documentElement.scrollWidth}));
    assert(size.scroll <= size.width, 'Visit fits at ' + width + ': ' + JSON.stringify(size));
    await page.screenshot({path:path.join(root,'qa','guideline-' + width + '.png')});
    await field(page, 'f_temp').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(root,'qa','guideline-vitals-' + width + '.png')});
    await patient(page).locator('[data-field="urine_reason"]').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(root,'qa','guideline-tests-' + width + '.png')});
    await field(page, 'f_viral_lab_requested').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(root,'qa','guideline-labs-' + width + '.png')});
    await field(page, 'tab-check').click();await field(page, 'f_k_uti_tube').scrollIntoViewIfNeeded();
    size = await page.evaluate(() => ({width:innerWidth,scroll:document.documentElement.scrollWidth}));
    assert(size.scroll <= size.width, 'Checklist fits at ' + width + ': ' + JSON.stringify(size));
    await page.screenshot({path:path.join(root,'qa','guideline-uti-' + width + '.png')});
    await field(page, 'tab-visit').click();
  }
});

(async () => {
  const server = http.createServer((request, response) => {
    if(new URL(request.url, 'http://local').pathname !== '/app/') {response.writeHead(404);response.end();return;}
    response.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    response.end(fs.readFileSync(path.join(root, 'index.html')));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/app/';
  let browser, failed = 0;
  const selected = tests.filter(entry => !process.env.TEST_FILTER || entry.name.includes(process.env.TEST_FILTER));
  try {
    browser = await chromium.launch(launchOptions);
    for(const entry of selected) {
      const context = await browser.newContext({serviceWorkers:'block',viewport:{width:810,height:1080}});
      context.setDefaultTimeout(10000);
      await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:text => {window.syntheticCopied = text;return Promise.resolve();}}}));
      const errors = [];
      context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
      const page = await context.newPage();
      try {await page.goto(url);await entry.run(page, context, url);assert.deepEqual(errors, []);console.log('PASS ' + entry.name);}
      catch(error) {failed++;console.error('FAIL ' + entry.name + '\n' + (error.stack || error));}
      finally {await context.close();}
    }
  } finally {if(browser) await browser.close();await new Promise(resolve => server.close(resolve));}
  console.log((selected.length - failed) + '/' + selected.length + ' NJ guideline browser checks passed.');
  if(failed) process.exitCode = 1;
})().catch(error => {console.error(error);process.exitCode = 1;});
