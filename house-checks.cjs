/* House navigation: isolated Chrome contexts with synthetic patients only. */
const fs = require('node:fs'), http = require('node:http'), assert = require('node:assert/strict');
const {chromium, launchOptions} = require('./qa/browser.cjs');
const tests = [], test = (name, run) => tests.push({name, run});
const patient = (p, n=0) => p.locator('.patient').nth(n);
const field = (p, id, n=0) => patient(p,n).locator('[data-local-id="'+id+'"]');
const visibleCount = p => p.locator('.patient:visible').count();
const draft = p => p.evaluate(() => JSON.parse(sessionStorage.getItem('hvnb_current_draft') || 'null'));
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
async function copy(p,n=0){await field(p,'copyBtn',n).click();await field(p,'sentBanner',n).waitFor({state:'visible'});}

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
  const q=await c.newPage();await q.addInitScript(value=>sessionStorage.setItem('hvnb_current_draft',JSON.stringify(value)),saved);
  await q.goto(url);await restore(q);
  assert.equal(await q.locator('#houseHeading').innerText(),'House 1');assert.equal(await visibleCount(q),2);
  assert.equal(await field(q,'f_name').inputValue(),'SYNTHETIC ALPHA');
});

test('A pending copy stays with its original patient when moving to another house',async p=>{
  await seed(p,'SYNTHETIC ALPHA');await field(p,'f_overnights').fill('RPP');
  await p.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise(resolve=>window.finishCopy=resolve)}}));
  await field(p,'copyBtn').click();await p.waitForFunction(()=>typeof window.finishCopy==='function');
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
  const q=await c.newPage();await q.goto(url);await seed(q,'SYNTHETIC OTHER TAB');
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
