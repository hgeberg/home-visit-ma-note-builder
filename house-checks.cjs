/* House navigation: isolated Chrome contexts with synthetic patients only. */
const fs = require('node:fs'), http = require('node:http'), assert = require('node:assert/strict');
const {chromium, launchOptions} = require('./qa/browser.cjs');
const {acknowledgeCopyWarning} = require('./qa/form-fixtures.cjs');
const tests = [], test = (name, run) => tests.push({name, run});
const patient = (p, n=0) => p.locator('.patient').nth(n);
const field = (p, id, n=0) => patient(p,n).locator('[data-local-id="'+id+'"]');
const visibleCount = p => p.locator('.patient:visible').count();
const draft = p => p.evaluate(() => JSON.parse(sessionStorage.getItem('hvnb_current_draft') || 'null'));
const deviceDraft = p => p.evaluate(() => JSON.parse(localStorage.getItem('hvnb_current_app_draft') || 'null'));
const officeDraft = p => p.evaluate(() => JSON.parse(localStorage.getItem('hvnb_current_office') || '[]'));
const flush = p => p.evaluate(() => window.dispatchEvent(new Event('pagehide')));
const dialog = p => p.locator('dialog[open]');
async function deletePatient(p,n=0,label='Delete patient'){
  await field(p,'deletePatientBtn',n).click();
  await dialog(p).getByRole('button',{name:label,exact:true}).click();
}
async function seed(p, name, n=0){
  await field(p,'f_name',n).fill(name);
  await field(p,'f_dob',n).fill('01/01/2000');
  await field(p,'f_inspic',n).check();
  await field(p,'f_symptoms',n).fill(name+' symptoms');
}
async function openPatient(p, name){
  if(!await p.locator('#patientNavigator').evaluate(el=>el.open)) await p.locator('#patientNavSummary').click();
  await p.locator('#patientJumps').getByRole('button',{name,exact:true}).click();
}
async function restore(p){await p.getByRole('button',{name:/^Restore (this visit|all)/}).click();}
async function copy(p,n=0){await field(p,'copyBtn',n).click();await acknowledgeCopyWarning(p);await field(p,'sentBanner',n).waitFor({state:'visible'});}

test('Patient list starts collapsed; adding patients waits for a field tap before typing',async p=>{
  assert.equal(await p.locator('#patientNavigator').evaluate(el=>el.open),false);
  assert.equal(await p.locator('#patientJumps').isVisible(),false);
  await seed(p,'SYNTHETIC ALPHA');
  await p.locator('#appendPatient').click();
  assert.equal(await p.evaluate(()=>document.activeElement.matches('input,textarea,[contenteditable="true"]')),false);
  await field(p,'f_name',1).click();
  assert.equal(await field(p,'f_name',1).evaluate(el=>el===document.activeElement),true);
  await seed(p,'SYNTHETIC BETA',1);
  await field(p,'addPatientBtn',1).click();
  assert.equal(await p.evaluate(()=>document.activeElement.matches('input,textarea,[contenteditable="true"]')),false);
  assert.equal(await visibleCount(p),3);
  assert.equal(await p.locator('#houseHeading').innerText(),'House 1');
  assert.equal(await field(p,'f_name',2).inputValue(),'');
  assert.equal(await field(p,'f_name').inputValue(),'SYNTHETIC ALPHA');
  assert.equal(new Set(await p.locator('.patient').evaluateAll(els=>els.map(el=>el.dataset.houseId))).size,1);
});

test('New house opens a blank page and history reopens the correct house and patient',async p=>{
  await seed(p,'SYNTHETIC ALPHA');await p.locator('#appendPatient').click();await seed(p,'SYNTHETIC BETA',1);
  await field(p,'nextHouseBtn',1).click();
  assert.equal(await p.evaluate(()=>scrollY),0);
  assert.equal(await p.evaluate(()=>document.activeElement.id),'houseHeading');
  assert.equal(await visibleCount(p),1);assert.equal(await patient(p).isVisible(),false);
  assert.equal(await p.locator('#houseHeading').innerText(),'House 2');
  assert.equal(await field(p,'f_name',2).inputValue(),'');
  await seed(p,'SYNTHETIC GAMMA',2);
  await openPatient(p,'2. SYNTHETIC BETA');
  assert.equal(await p.evaluate(()=>document.activeElement.matches('input,textarea,[contenteditable="true"]')),false);
  assert.equal(await visibleCount(p),2);assert.equal(await patient(p,2).isVisible(),false);
  assert.equal(await field(p,'f_symptoms',1).inputValue(),'SYNTHETIC BETA symptoms');
  assert.equal(await p.locator('#patientNavigator').evaluate(el=>el.open),false);
  await openPatient(p,'3. SYNTHETIC GAMMA');
  assert.equal(await visibleCount(p),1);assert.equal(await p.locator('#houseHeading').innerText(),'House 2');
  assert.equal(await field(p,'f_symptoms',2).inputValue(),'SYNTHETIC GAMMA symptoms');
});

test('Adding patients to an earlier house does not append them to the latest house',async p=>{
  await seed(p,'SYNTHETIC ALPHA');await p.locator('#newHouseBtn').click();await seed(p,'SYNTHETIC GAMMA',1);
  await openPatient(p,'1. SYNTHETIC ALPHA');await p.locator('#appendPatient').click();
  await seed(p,'SYNTHETIC BETA',1);
  assert.equal(await visibleCount(p),2);
  assert.equal(await patient(p,2).isVisible(),false);
  await p.locator('#newHouseBtn').click();
  assert.equal(await p.locator('#houseHeading').innerText(),'House 3');
  assert.equal(await visibleCount(p),1);
  await openPatient(p,'3. SYNTHETIC GAMMA');assert.equal(await visibleCount(p),1);
});

test('Reload restores house grouping, active house, checklists and drafts with history collapsed',async p=>{
  await seed(p,'SYNTHETIC ALPHA');await field(p,'tab-check').click();await field(p,'f_k_confirm').check();
  await p.locator('#newHouseBtn').click();await seed(p,'SYNTHETIC BETA',1);
  await p.locator('#appendPatient').click();await seed(p,'SYNTHETIC GAMMA',2);
  await p.reload();await restore(p);
  assert.equal(await visibleCount(p),2);assert.equal(await patient(p).isVisible(),false);
  assert.equal(await p.locator('#houseHeading').innerText(),'House 2');
  assert.equal(await p.locator('#patientNavigator').evaluate(el=>el.open),false);
  assert.equal(await field(p,'f_name',2).inputValue(),'SYNTHETIC GAMMA');
  const saved = await draft(p);assert.equal(saved.patients[1].houseId,saved.patients[2].houseId);
  assert.notEqual(saved.patients[0].houseId,saved.patients[1].houseId);
  assert.equal(saved.activeHouseId,saved.patients[1].houseId);
  await openPatient(p,'1. SYNTHETIC ALPHA');
  assert.equal(await field(p,'f_k_confirm').isChecked(),true);
  assert.equal(await visibleCount(p),1);
});

test('Pre-update multi-patient drafts restore together without losing any inputs',async(p,c,url)=>{
  const q=await c.newPage();await q.addInitScript(()=>{
    sessionStorage.setItem('hvnb_current_draft',JSON.stringify({version:3,t:Date.now(),patients:[
      {id:'patient-legacy-a',vals:{name:'SYNTHETIC LEGACY A',symptoms:'Legacy symptoms A'},collapsed:false},
      {id:'patient-legacy-b',vals:{name:'SYNTHETIC LEGACY B',symptoms:'Legacy symptoms B'},collapsed:true}
    ]}));
  });
  await q.goto(url);await restore(q);
  assert.equal(await visibleCount(q),2);assert.equal(await q.locator('#houseHeading').innerText(),'House 1');
  assert.equal(await field(q,'f_symptoms').inputValue(),'Legacy symptoms A');
  assert.equal(await field(q,'f_symptoms',1).inputValue(),'Legacy symptoms B');
  assert.equal(await field(q,'patientBody',1).isVisible(),false);
  assert.equal(await q.locator('#patientNavigator').evaluate(el=>el.open),false);
});

test('An empty new house survives reload and incomplete house metadata falls back safely',async(p,c,url)=>{
  await seed(p,'SYNTHETIC ALPHA');await p.locator('#newHouseBtn').click();
  await p.reload();await restore(p);
  assert.equal(await p.locator('#houseHeading').innerText(),'House 2');assert.equal(await visibleCount(p),1);
  assert.equal(await field(p,'f_name',1).inputValue(),'');
  const saved=await draft(p);saved.activeHouseId='missing-house';
  saved.patients[0].houseId='invalid-house <script>';delete saved.patients[1].houseId;
  // Seed both recovery copies so this case exercises invalid house metadata,
  // rather than choosing between the original device shift and a changed tab.
  const q=await c.newPage();await q.addInitScript(value=>{
    const raw=JSON.stringify(value);
    sessionStorage.setItem('hvnb_current_draft',raw);
    localStorage.setItem('hvnb_current_app_draft',raw);
  },saved);
  await q.goto(url);await restore(q);
  assert.equal(await q.locator('#houseHeading').innerText(),'House 1');assert.equal(await visibleCount(q),2);
  assert.equal(await field(q,'f_name').inputValue(),'SYNTHETIC ALPHA');
});

test('A pending copy stays with its original patient when moving to another house',async p=>{
  await seed(p,'SYNTHETIC ALPHA');await field(p,'f_overnights').fill('RPP');
  await p.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise(resolve=>window.finishCopy=resolve)}}));
  await field(p,'copyBtn').click();await acknowledgeCopyWarning(p);await p.waitForFunction(()=>typeof window.finishCopy==='function');
  await p.locator('#newHouseBtn').click();await seed(p,'SYNTHETIC BETA',1);
  await p.evaluate(()=>window.finishCopy());
  await p.waitForFunction(()=>JSON.parse(localStorage.getItem('hvnb_current_office')||'[]').length===1);
  const entries=await p.evaluate(()=>JSON.parse(localStorage.getItem('hvnb_current_office')));
  assert.equal(entries[0].name,'SYNTHETIC ALPHA');
  assert.equal(await p.locator('#houseHeading').innerText(),'House 2');
  assert.equal(await visibleCount(p),1);assert.equal(await field(p,'f_name',1).inputValue(),'SYNTHETIC BETA');
  await openPatient(p,'1. SYNTHETIC ALPHA');assert.match(await field(p,'saveState').innerText(),/Message copied.*Office saved/);
});

test('Office keeps copied patients from every house and returns to the selected house',async p=>{
  await seed(p,'SYNTHETIC ALPHA');await field(p,'f_overnights').fill('RPP');await copy(p);
  await p.locator('#newHouseBtn').click();await seed(p,'SYNTHETIC BETA',1);await field(p,'f_overnights',1).fill('Urine culture');await copy(p,1);
  await p.locator('#view-office').click();
  assert.equal(await p.locator('#houseToolbar').isVisible(),false);
  assert.equal(await p.locator('.office-patient').count(),2);
  assert.match(await p.locator('#officeContent').innerText(),/SYNTHETIC ALPHA/);
  assert.match(await p.locator('#officeContent').innerText(),/SYNTHETIC BETA/);
  await p.locator('#view-patients').click();
  assert.equal(await p.locator('#houseHeading').innerText(),'House 2');assert.equal(await visibleCount(p),1);
  assert.equal(await field(p,'f_name',1).inputValue(),'SYNTHETIC BETA');
});

test('Collapse controls affect the current house and opening history expands its chosen patient',async p=>{
  await seed(p,'SYNTHETIC ALPHA');await p.locator('#newHouseBtn').click();await seed(p,'SYNTHETIC BETA',1);
  await p.locator('#collapsePatients').click();
  assert.equal(await field(p,'patientBody',1).isVisible(),false);
  assert.equal(await field(p,'patientBody').getAttribute('hidden'),null);
  await openPatient(p,'2. SYNTHETIC BETA');assert.equal(await field(p,'patientBody',1).isVisible(),true);
  await openPatient(p,'1. SYNTHETIC ALPHA');assert.equal(await field(p,'patientBody').isVisible(),true);
});

test('Clear shift removes every house and starts one blank page with history collapsed',async(p,c,url)=>{
  await seed(p,'SYNTHETIC ALPHA');await p.locator('#newHouseBtn').click();await seed(p,'SYNTHETIC BETA',1);
  const q=await c.newPage();await q.goto(url);await q.getByRole('button',{name:'Start fresh',exact:true}).click();await seed(q,'SYNTHETIC OTHER TAB');
  await p.locator('#patientNavSummary').click();
  await p.locator('#clearShiftBtn').click();await p.locator('#confirmClearShift').click();
  await q.waitForFunction(()=>document.querySelector('[data-local-id="f_name"]').value==='');
  for(const page of [p,q]){
    assert.equal(await page.locator('.patient').count(),1);assert.equal(await visibleCount(page),1);
    assert.equal(await page.locator('#houseHeading').innerText(),'House 1');
    assert.equal(await field(page,'f_name').inputValue(),'');
    assert.equal(await page.locator('#patientNavigator').evaluate(el=>el.open),false);
    assert.equal(await page.locator('#patientJumps button').count(),1);
  }
  await p.reload();assert.equal(await p.getByRole('button',{name:/^Restore/}).count(),0);
});

test('House navigation and expanded history fit phone and desktop widths',async p=>{
  await seed(p,'SYNTHETIC '+ 'LONGNAME'.repeat(10));await p.locator('#appendPatient').click();await seed(p,'SYNTHETIC BETA',1);
  await p.locator('#newHouseBtn').click();await seed(p,'SYNTHETIC GAMMA',2);
  fs.mkdirSync('qa/houses',{recursive:true});
  for(const width of [320,390,1280]){
    await p.setViewportSize({width,height:1000});
    for(const open of [false,true]){
      await p.locator('#patientNavigator').evaluate((el,value)=>el.open=value,open);
      const size=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
      assert.ok(size.scroll<=size.width,JSON.stringify(size));
      await p.evaluate(()=>scrollTo(0,0));
      await p.screenshot({path:'qa/houses/'+width+(open?'-history':'-collapsed')+'.png'});
    }
  }
});

test('Delete patient: cancel or delete one entered visit on a phone, preserving the survivor after reload',async p=>{
  await p.setViewportSize({width:390,height:852});
  assert.equal(await field(p,'deletePatientBtn').isVisible(),false);
  await seed(p,'SYNTHETIC SURVIVOR');await field(p,'tab-check').click();await field(p,'f_k_confirm').check();
  await p.locator('#appendPatient').click();await seed(p,'SYNTHETIC CANCELED',1);await flush(p);
  const before=await deviceDraft(p), survivor=before.patients[0], removed=before.patients[1];
  assert.equal(await p.locator('#housePatientNav button').count(),2);
  await field(p,'deletePatientBtn',1).click();
  assert.match(await dialog(p).innerText(),/SYNTHETIC CANCELED/);
  await dialog(p).getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await visibleCount(p),2);
  await deletePatient(p,1);
  assert.equal(await visibleCount(p),1);assert.equal(await p.locator('#'+removed.id).count(),0);
  assert.equal(await p.locator('#housePatientNav').isVisible(),false);
  assert.equal(await field(p,'deletePatientBtn').isVisible(),false);
  assert.equal(await field(p,'f_k_confirm').isChecked(),true);
  assert.equal(await p.evaluate(()=>document.activeElement.dataset.localId),'patientTitle');
  assert.deepEqual((await deviceDraft(p)).patients,[survivor]);
  assert.deepEqual((await draft(p)).patients,[survivor]);
  await p.locator('#view-seen').click();
  assert.equal(await p.locator('.seen-visit').count(),1);assert.doesNotMatch(await p.locator('#seenList').innerText(),/CANCELED/);
  await p.locator('#clearShiftBtn').click();assert.doesNotMatch(await p.locator('#shiftReviewList').innerText(),/CANCELED/);await p.locator('#cancelClearShift').click();
  await p.reload();await restore(p);
  assert.equal(await visibleCount(p),1);assert.equal(await field(p,'f_name').inputValue(),'SYNTHETIC SURVIVOR');
  assert.equal(await field(p,'f_k_confirm').isChecked(),true);
  await p.locator('#view-seen').click();assert.equal(await p.locator('.seen-visit').count(),1);
});

test('Delete patient: stable visit identity handles duplicate names, collapsed cards and other houses',async p=>{
  await seed(p,'SYNTHETIC SAME NAME');await field(p,'f_notes').fill('Keep first');
  await p.locator('#appendPatient').click();await seed(p,'SYNTHETIC SAME NAME',1);await field(p,'f_notes',1).fill('Remove second');
  await p.locator('#appendPatient').click();await seed(p,'SYNTHETIC THIRD',2);
  await p.locator('#newHouseBtn').click();await seed(p,'SYNTHETIC OTHER HOUSE',3);
  assert.equal(await field(p,'deletePatientBtn',3).isVisible(),false);
  await openPatient(p,'2. SYNTHETIC SAME NAME');await field(p,'collapseBtn',1).click();await flush(p);
  const before=await deviceDraft(p);
  assert.equal(await field(p,'patientBody',1).isVisible(),false);
  assert.equal(await field(p,'deletePatientBtn',1).isVisible(),true);
  await deletePatient(p,1);
  assert.equal(await visibleCount(p),2);assert.equal(await p.locator('.patient').count(),3);
  assert.equal(await p.locator('#housePatientNav button').count(),2);
  assert.match(await p.locator('#housePatientNav').innerText(),/SYNTHETIC THIRD/);
  assert.equal(await field(p,'f_notes').inputValue(),'Keep first');
  assert.deepEqual((await deviceDraft(p)).patients,[before.patients[0],before.patients[2],before.patients[3]]);
  await openPatient(p,'3. SYNTHETIC OTHER HOUSE');assert.equal(await field(p,'f_name',2).inputValue(),'SYNTHETIC OTHER HOUSE');
  assert.equal(await field(p,'deletePatientBtn',2).isVisible(),false);
});

test('Delete patient: removing the first copied form preserves its history, latest edits and Office owner',async p=>{
  await seed(p,'SYNTHETIC COPIED');await field(p,'f_overnights').fill('RPP');await copy(p);
  await field(p,'f_notes').fill('Latest synthetic note');
  await p.locator('#appendPatient').click();await seed(p,'SYNTHETIC REMAINING',1);await flush(p);
  const before=await officeDraft(p), saved=await deviceDraft(p);
  await deletePatient(p,0,'Remove from house');
  assert.equal(await visibleCount(p),1);assert.equal(await field(p,'f_name').inputValue(),'SYNTHETIC REMAINING');
  assert.deepEqual(await officeDraft(p),before);
  const after=await deviceDraft(p);assert.deepEqual(after.patients,[saved.patients[1]]);
  assert.equal(after.seenVisits[0].meta.visitId,saved.patients[0].meta.visitId);
  assert.equal(after.seenVisits[0].vals.notes,'Latest synthetic note');
  await p.locator('#view-office').click();assert.equal(await p.locator('.office-patient').count(),1);
  await p.locator('[data-office-completed]').check();assert.equal((await officeDraft(p))[0].completed,true);
  await p.locator('#view-seen').click();assert.equal(await p.locator('.seen-visit').count(),2);
  await p.locator('#seenList').getByRole('button',{name:'Open visit for SYNTHETIC COPIED',exact:true}).click();
  assert.equal(await field(p,'f_notes',1).inputValue(),'Latest synthetic note');
});

test('Delete patient: dropping a reopened uncopied visit also removes its earlier archive',async p=>{
  await seed(p,'SYNTHETIC KEEP');await p.locator('#appendPatient').click();await seed(p,'SYNTHETIC ARCHIVE CANCELED',1);await flush(p);
  const removedId=(await deviceDraft(p)).patients[1].meta.visitId;
  await field(p,'newBtn',1).click();await dialog(p).getByRole('button',{name:'Clear this patient',exact:true}).click();
  await p.locator('#view-seen').click();
  await p.locator('#seenList').getByRole('button',{name:'Open visit for SYNTHETIC ARCHIVE CANCELED',exact:true}).click();
  assert.equal(await visibleCount(p),3);
  await deletePatient(p,2);
  assert.equal(await visibleCount(p),2);
  const saved=await deviceDraft(p);assert.ok(!saved.patients.some(v=>v.meta.visitId===removedId));
  assert.ok(!(saved.seenVisits||[]).some(v=>v.meta.visitId===removedId));
  await p.locator('#view-seen').click();assert.equal(await p.locator('.seen-visit').count(),1);
  assert.doesNotMatch(await p.locator('#seenList').innerText(),/CANCELED/);
});

test('Delete patient: a cleared form transfers earlier pending Office copies without restoring the cancellation',async p=>{
  await seed(p,'SYNTHETIC EARLIER COPY');await field(p,'f_overnights').fill('RPP');
  await p.evaluate(()=>{
    window.syntheticFailOfficeRead=true;
    const original=Storage.prototype.getItem;
    Storage.prototype.getItem=function(key){if(this===localStorage&&key==='hvnb_current_office'&&window.syntheticFailOfficeRead)throw Error('Synthetic read failure');return original.call(this,key);};
  });
  await copy(p);await field(p,'newBtn').click();
  await seed(p,'SYNTHETIC CANCELED');await p.locator('#appendPatient').click();await seed(p,'SYNTHETIC KEEPER',1);await flush(p);
  const before=await deviceDraft(p);assert.equal(before.patients[0].pendingOfficeSync.length,1);
  await deletePatient(p,0);
  const saved=await deviceDraft(p);assert.equal(saved.patients.length,1);
  assert.equal(saved.patients[0].pendingOfficeSync.length,1);
  assert.equal(saved.patients[0].pendingOfficeSync[0].values.name,'SYNTHETIC EARLIER COPY');
  assert.equal(saved.patients[0].pendingOfficeSync[0].current,false);
  await p.evaluate(()=>{window.syntheticFailOfficeRead=false;});
  await p.locator('#retryOfficeSave').click();await p.locator('#officeSaveWarning').waitFor({state:'hidden'});
  assert.equal((await officeDraft(p))[0].name,'SYNTHETIC EARLIER COPY');
  await p.locator('#view-seen').click();assert.equal(await p.locator('.seen-visit').count(),2);
  assert.doesNotMatch(await p.locator('#seenList').innerText(),/CANCELED/);
});

test('Delete patient: a failed device write leaves both original forms and recovery copies intact',async p=>{
  await seed(p,'SYNTHETIC KEEP');await p.locator('#appendPatient').click();await seed(p,'SYNTHETIC CANCEL',1);await flush(p);
  const before=await deviceDraft(p);
  await p.evaluate(()=>{
    window.syntheticFailDeviceWrite=true;
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(this===localStorage&&key==='hvnb_current_app_draft'&&window.syntheticFailDeviceWrite)throw Error('Synthetic quota');return original.call(this,key,value);};
  });
  await deletePatient(p,1);
  assert.match(await dialog(p).innerText(),/No patient was removed/);
  assert.equal(await visibleCount(p),2);assert.deepEqual(await deviceDraft(p),before);
  assert.deepEqual((await draft(p)).patients,before.patients);
  await dialog(p).getByRole('button',{name:'OK',exact:true}).click();
  await p.evaluate(()=>{window.syntheticFailDeviceWrite=false;});
  await deletePatient(p,1);assert.equal(await visibleCount(p),1);
  assert.equal((await deviceDraft(p)).patients.length,1);
});

test('Delete patient: a stale confirmation cannot delete a newer shift or resurrect a canceled patient',async(p,c,url)=>{
  await seed(p,'SYNTHETIC KEEP');await p.locator('#appendPatient').click();await seed(p,'SYNTHETIC CANCEL',1);await flush(p);
  const q=await c.newPage();await q.goto(url);await restore(q);await flush(q);
  await field(p,'deletePatientBtn',1).click();
  await field(q,'f_notes').fill('Newer work in second window');await flush(q);const newer=await deviceDraft(q);
  await dialog(p).getByRole('button',{name:'Delete patient',exact:true}).click();
  assert.match(await dialog(p).innerText(),/No patient was removed/);
  assert.deepEqual(await deviceDraft(q),newer);assert.equal(await visibleCount(p),2);
  await dialog(p).getByRole('button',{name:'OK',exact:true}).click();
  await deletePatient(q,1);await flush(p);
  assert.equal((await deviceDraft(q)).patients.length,1);assert.equal((await deviceDraft(q)).patients[0].vals.notes,'Newer work in second window');
  assert.equal(await p.locator('#draftWarning').isVisible(),true);
});

test('Delete patient: a failed session update cannot restore a cancellation, and one remaining blank form stays usable',async p=>{
  await seed(p,'SYNTHETIC KEEP');await p.locator('#appendPatient').click();await seed(p,'SYNTHETIC CANCELED',1);await flush(p);
  await p.evaluate(()=>{
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(this===sessionStorage&&key==='hvnb_current_draft')throw Error('Synthetic session quota');return original.call(this,key,value);};
  });
  await deletePatient(p,1);
  assert.equal((await deviceDraft(p)).patients.length,1);assert.equal(await draft(p),null);
  await p.reload();await restore(p);assert.equal(await field(p,'f_name').inputValue(),'SYNTHETIC KEEP');
  await p.locator('#appendPatient').click();
  await deletePatient(p,0);
  assert.equal(await visibleCount(p),1);assert.equal(await field(p,'f_name').inputValue(),'');
  assert.equal(await deviceDraft(p),null);assert.equal(await draft(p),null);
  await p.reload();assert.equal(await dialog(p).count(),0);assert.equal(await visibleCount(p),1);
  await seed(p,'SYNTHETIC NEW PATIENT');await flush(p);assert.equal((await deviceDraft(p)).patients[0].vals.name,'SYNTHETIC NEW PATIENT');
});

(async()=>{
  const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync('index.html'));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/';
  const browser=await chromium.launch(launchOptions);let failed=0;
  const selected=tests.filter(t=>!process.env.TEST_FILTER || t.name.includes(process.env.TEST_FILTER));
  try{for(const t of selected){
    const c=await browser.newContext({serviceWorkers:'block'}), errors=[];
    c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
    await c.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.resolve()}}));
    const p=await c.newPage();p.setDefaultTimeout(10000);
    try{await p.goto(url);await t.run(p,c,url);assert.deepEqual(errors,[]);console.log('PASS '+t.name);}
    catch(e){failed++;console.error('FAIL '+t.name+'\n'+e.stack);}
    finally{await c.close();}
  }}finally{await browser.close();await new Promise(r=>server.close(r));}
  console.log((selected.length-failed)+'/'+selected.length+' house checks passed.');if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
