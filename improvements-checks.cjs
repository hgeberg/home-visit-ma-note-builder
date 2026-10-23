/* Integration checks for v8.13; disposable browser contexts, dummy records. */
const fs = require('node:fs'), http = require('node:http'), assert = require('node:assert/strict');
const {chromium, launchOptions} = require('./qa/browser.cjs');
const tests = [], test = (name, run, offline = false) => tests.push({name, run, offline});
const f = (p,id,n=0) => p.locator('.patient').nth(n).locator('[data-local-id="'+id+'"]');
const stored = p => p.evaluate(() => JSON.parse(localStorage.getItem('hvnb_current_office') || '[]'));
async function seed(p,name='SYNTHETIC ALPHA',n=0){await f(p,'f_name',n).fill(name);await f(p,'f_dob',n).fill('01/01/2000');await f(p,'f_inspic',n).check();await f(p,'f_overnights',n).fill('RPP');}
async function copy(p,n=0){await f(p,'copyBtn',n).click();await f(p,'sentBanner',n).waitFor({state:'visible'});}
async function restore(p){await p.getByRole('button',{name:/^Restore (this visit|all)/}).click();}
async function clear(p,n=0){await f(p,'newBtn',n).click();const b=p.getByRole('button',{name:'Clear this patient',exact:true});if(await b.count())await b.click();}
async function failure(p,mode='write'){await p.evaluate(mode=>{window.failOffice=true;const method=mode==='read'?'getItem':'setItem',old=Storage.prototype[method];Storage.prototype[method]=function(k,...v){if(this===localStorage&&k==='hvnb_current_office'&&window.failOffice)throw Error('Synthetic failure');return old.call(this,k,...v)};},mode);}
async function editTests(p,value){await f(p,'e_tests_tests').fill(value);await f(p,'e_tests_tests').blur();}
async function remove(p){await p.locator('#view-office').click();await p.locator('.office-patient').getByRole('button',{name:'Remove',exact:true}).click();await p.locator('dialog[open]').getByRole('button',{name:'Remove',exact:true}).click();}

test('Persistent copy and Office states remain visible and Retry works from Patients', async p=>{
  await seed(p);await failure(p);await copy(p);
  await p.waitForTimeout(2900);
  assert.match(await f(p,'saveState').innerText(),/Message copied.*Office save pending/);
  assert.equal(await p.locator('#patients').isVisible(),true);assert.equal(await p.locator('#officeSaveWarning').isVisible(),true);
  await p.evaluate(()=>window.failOffice=false);await p.locator('#retryOfficeSave').click();
  assert.match(await f(p,'saveState').innerText(),/Office saved/);assert.equal(await p.locator('#officeSaveWarning').isVisible(),false);
  assert.equal((await stored(p)).length,1);
});
test('Message differences show changed fields, exclude checklist edits, and clear on recopy', async p=>{
  await seed(p);await f(p,'f_symptoms').fill('Original symptoms');await copy(p);
  await f(p,'f_symptoms').fill('Changed symptoms <literal>');await p.getByRole('button',{name:'Same patient, keep editing',exact:true}).click();
  await f(p,'changeDetails').locator('summary').click();
  assert.match(await f(p,'changeDetails').locator('del').innerText(),/Original symptoms/);
  assert.match(await f(p,'changeDetails').locator('ins').innerText(),/Changed symptoms <literal>/);
  assert.equal(await f(p,'changeDetails').locator('literal').count(),0);
  await copy(p);assert.equal(await f(p,'changeDetails').isVisible(),false);
  await f(p,'tab-check').click();await f(p,'f_k_confirm').check();await f(p,'tab-visit').click();
  assert.equal(await f(p,'changeDetails').isVisible(),false);
});
test('Navigation expands the chosen patient and collapse choices survive reload', async p=>{
  await seed(p);await f(p,'addPatientBtn').click();await seed(p,'SYNTHETIC BETA',1);
  await f(p,'collapseBtn').click();assert.equal(await f(p,'patientBody').isVisible(),false);
  await p.locator('#patientNavigator > summary').click();
  await p.locator('#patientJumps').getByRole('button',{name:'1. SYNTHETIC ALPHA',exact:true}).click();assert.equal(await f(p,'patientBody').isVisible(),true);
  await p.locator('#collapsePatients').click();assert.equal(await f(p,'patientBody',1).isVisible(),false);
  await p.reload();await restore(p);assert.equal(await f(p,'patientBody').isVisible(),false);assert.equal(await f(p,'patientBody',1).isVisible(),false);
  await p.locator('#expandPatients').click();assert.equal(await f(p,'f_name',1).inputValue(),'SYNTHETIC BETA');
});
test('Layout review can be canceled and preserves affected answers for every patient', async p=>{
  await seed(p);await f(p,'addPatientBtn').click();await seed(p,'SYNTHETIC BETA',1);
  for(let n=0;n<2;n++){const root=p.locator('.patient').nth(n);await root.locator('[data-item="flu"] input').check();await root.locator('[data-item="flu"] [data-r="Positive"]').click();await root.locator('[data-item="flu"] [data-s="'+(n?'A':'B')+'"]').click();}
  await f(p,'editBtn').click();
  const replacement='Rapid strep, RSV, Rapid COVID, Ears (done), Urine dip (done)';
  await editTests(p,replacement);assert.match(await p.locator('dialog[open]').innerText(),/SYNTHETIC ALPHA.*Rapid flu/s);assert.match(await p.locator('dialog[open]').innerText(),/SYNTHETIC BETA/);
  await p.getByRole('button',{name:'Cancel',exact:true}).click();assert.match(await f(p,'output').inputValue(),/Rapid flu: POSITIVE \(B\)/);
  await editTests(p,replacement);await p.getByRole('button',{name:'Apply and preserve answers',exact:true}).click();
  for(let n=0;n<2;n++){const root=p.locator('.patient').nth(n);assert.ok(!(await f(p,'output',n).inputValue()).includes('POSITIVE'));await root.locator('.preserved-answers summary').click();assert.match(await root.locator('.preserved-answers').innerText(),new RegExp('Rapid flu: Positive \\('+(n?'A':'B')+'\\)'));}
  await p.reload();await restore(p);assert.equal(await p.locator('.preserved-answers').count(),2);
  assert.equal(await f(p,'f_name',1).inputValue(),'SYNTHETIC BETA');
});
test('Removing an entered field keeps its original answer after confirmation', async p=>{
  await f(p,'f_notes').fill('SYNTHETIC IMPORTANT NOTE');await f(p,'editBtn').click();
  await p.locator('[data-field="notes"] .editor').getByRole('button',{name:'Delete',exact:true}).click();
  await p.locator('dialog[open]').getByRole('button',{name:'Delete',exact:true}).click();
  await p.getByRole('button',{name:'Apply and preserve answers',exact:true}).click();
  assert.equal(await f(p,'f_notes').count(),0);await p.locator('.preserved-answers summary').click();assert.match(await p.locator('.preserved-answers').innerText(),/SYNTHETIC IMPORTANT NOTE/);
  await p.reload();await restore(p);assert.equal(await p.locator('.preserved-answers').count(),1);
});
test('Undo clearing restores the exact values and copied association', async p=>{
  await seed(p);await copy(p);const before=await f(p,'output').inputValue();const id=(await stored(p))[0].id;
  await clear(p);await p.locator('#undoAction').click();assert.equal(await f(p,'output').inputValue(),before);
  await copy(p);assert.equal((await stored(p)).length,1);assert.equal((await stored(p))[0].id,id);
});
test('Undo clearing after new typing adds a patient without replacing that typing', async p=>{
  await seed(p);await clear(p);await f(p,'f_name').fill('SYNTHETIC NEW INPUT');await p.locator('#undoAction').click();
  assert.equal(await p.locator('.patient').count(),2);assert.equal(await f(p,'f_name').inputValue(),'SYNTHETIC NEW INPUT');assert.equal(await f(p,'f_name',1).inputValue(),'SYNTHETIC ALPHA');
});
test('Undo clear transfers pending copied recovery without creating duplicate Office entries', async p=>{
  await seed(p);await failure(p,'read');await copy(p);await clear(p);await f(p,'f_name').fill('SYNTHETIC NEW INPUT');await p.locator('#undoAction').click();
  await p.evaluate(()=>window.failOffice=false);await p.locator('#retryOfficeSave').click();await copy(p,1);assert.equal((await stored(p)).length,1);
});
test('Undo Office removal restores that entry without overwriting another tab', async(p,c,url)=>{
  await seed(p);await copy(p);const original=(await stored(p))[0];await remove(p);
  const q=await c.newPage();await q.goto(url);await seed(q,'SYNTHETIC OTHER');await copy(q);
  await p.locator('#undoAction').click();const result=await stored(p);assert.equal(result.length,2);assert.deepEqual(result.find(o=>o.id===original.id),original);
});
test('Undo is invalidated by Clear shift, including a shift cleared in another tab', async(p,c,url)=>{
  await seed(p);await clear(p);const q=await c.newPage();await q.goto(url);await q.locator('#clearShiftBtn').click();await q.locator('#confirmClearShift').click();
  await p.locator('#undoNotice').waitFor({state:'hidden'});assert.equal(await f(p,'f_name').inputValue(),'');assert.deepEqual(await stored(p),[]);
});
test('Undo expires and cannot restore an old action', async p=>{
  await seed(p);await clear(p);
  await p.evaluate(()=>{const now=Date.now;Date.now=()=>now()+31000;});await p.locator('#undoAction').click();
  assert.equal(await f(p,'f_name').inputValue(),'');assert.equal(await p.locator('#undoNotice').isVisible(),false);
});
test('Existing v8.12 data migrates once and old writes cannot alter current records', async(p,c,url)=>{
  await p.close();await c.addInitScript(()=>{
    if(location.protocol !== 'http:') return;
    if(!localStorage.getItem('seededLegacy')){
      localStorage.removeItem('hvnb_current_migrated');sessionStorage.removeItem('hvnb_current_migrated');
      localStorage.setItem('hvnb_office',JSON.stringify([{id:'legacy-1',name:'SYNTHETIC LEGACY',dob:'01/01/2000',overnights:'RPP',steps:[],t:1}]));
      sessionStorage.setItem('hvnb_draft',JSON.stringify({version:3,t:Date.now(),shift:'initial',patients:[{vals:{name:'SYNTHETIC RESTORED'},meta:{}}]}));
      localStorage.setItem('seededLegacy','yes');
    }
  });
  const q=await c.newPage();await q.goto(url);await restore(q);assert.equal(await f(q,'f_name').inputValue(),'SYNTHETIC RESTORED');assert.equal((await stored(q))[0].name,'SYNTHETIC LEGACY');
  await q.evaluate(()=>{localStorage.setItem('hvnb_office','[]');localStorage.setItem('hvnb_shift_generation','old-tab-shift');});
  await q.reload();await restore(q);assert.equal((await stored(q))[0].name,'SYNTHETIC LEGACY');
  await q.locator('#clearShiftBtn').click();await q.locator('#confirmClearShift').click();await q.reload();assert.deepEqual(await stored(q),[]);
});
test('Historical links have their own storage and leave the current app intact', async(p,c,url)=>{
  await seed(p);await copy(p);const before=await stored(p);
  for(const file of ['previous-version.html','backups/before-office-overnights-2026-10-11/index.html']){
    const q=await c.newPage();await q.goto(url+file);
    assert.match(await q.locator('body').innerText(),/Historical version/);
    assert.ok(!(await q.locator('body').innerText()).includes('SYNTHETIC ALPHA'));
    const name=q.locator('[data-local-id="f_name"], #f_name').first();await name.fill('SYNTHETIC OLD');
    await q.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
    assert.deepEqual(await stored(q),before);await q.close();
  }
});
test('Migration failure leaves legacy data untouched and Retry completes the migration', async(p,c,url)=>{
  await p.close();await c.addInitScript(()=>{
    if(location.protocol !== 'http:') return;
    localStorage.removeItem('hvnb_current_migrated');localStorage.setItem('hvnb_office','[{"id":"migrate","name":"SYNTHETIC MIGRATE","steps":[],"overnights":"RPP"}]');
    window.blockMigration=true;const old=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='hvnb_current_office'&&window.blockMigration)throw Error('Synthetic migration failure');return old.call(this,k,v)};
  });
  const q=await c.newPage();await q.goto(url);assert.equal(await q.locator('#storageSetupWarning').isVisible(),true);assert.equal(await q.locator('.patient').count(),0);
  assert.match(await q.evaluate(()=>localStorage.getItem('hvnb_office')),/SYNTHETIC MIGRATE/);
  await q.evaluate(()=>window.blockMigration=false);await q.locator('#retryStorageSetup').click();assert.equal((await stored(q))[0].name,'SYNTHETIC MIGRATE');
});
test('Offline reload and a new offline tab work after setup; cache contains only static app assets', async(p,c,url)=>{
  await p.waitForFunction(()=>document.querySelector('#offlineStatus').textContent==='Ready for offline opening');
  await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await seed(p);await copy(p);await c.setOffline(true);await p.reload();await restore(p);
  assert.equal(await f(p,'f_name').inputValue(),'SYNTHETIC ALPHA');
  // Chromium's offline emulation can leave navigator.onLine true after a
  // worker-served navigation. Check readiness against the reported state;
  // successful reload/new-tab opening below verifies the offline behavior.
  await p.waitForFunction(()=>document.querySelector('#offlineStatus').textContent===(navigator.onLine?'Ready for offline opening':'Offline · saved app available'));
  const q=await c.newPage();await q.goto(url);assert.equal(await q.locator('.patient').count(),1);assert.equal((await stored(q)).length,1);
  const cached=await p.evaluate(async()=>{const values=[];for(const name of await caches.keys()){const cache=await caches.open(name);for(const req of await cache.keys())values.push({url:req.url,content:await (await cache.match(req)).text()});}return values;});
  assert.equal(cached.length,5);assert.ok(cached.some(item=>item.url.endsWith('/app/index.html')));assert.ok(cached.every(item=>!item.content.includes('SYNTHETIC ALPHA')));
  await c.setOffline(false);
},true);
test('Unavailable network response falls back to the saved app without caching historical pages', async(p,c,url,serverState)=>{
  await p.waitForFunction(()=>!!navigator.serviceWorker.controller);await seed(p);
  serverState.failApp=true;
  try{await p.reload();await restore(p);assert.equal(await f(p,'f_name').inputValue(),'SYNTHETIC ALPHA');}
  finally{serverState.failApp=false;}
  const q=await c.newPage();await q.goto(url+'previous-version.html');assert.match(await q.locator('body').innerText(),/Historical version/);
  assert.equal(await p.evaluate(async()=>{let n=0;for(const name of await caches.keys())n+=(await(await caches.open(name)).keys()).length;return n;}),5);
},true);
test('New controls fit mobile and desktop, including long names and collapsed patients', async p=>{
  await seed(p,'SYNTHETIC '+ 'LONGNAME'.repeat(12));await copy(p);await f(p,'addPatientBtn').click();await seed(p,'SYNTHETIC BETA',1);await f(p,'collapseBtn').click();
  for(const width of [320,390,1280]){
    await p.setViewportSize({width,height:1000});await p.evaluate(()=>scrollTo(0,0));
    const sizes=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(sizes.scroll<=sizes.width,JSON.stringify(sizes));
    await p.screenshot({path:'qa/improvements-'+width+'.png'});
  }
});

(async()=>{
  const state={failApp:false};
  const allowed=new Set(['index.html','sw.js','manifest.webmanifest','icons/apple-touch-icon.png','icons/icon-192.png','icons/icon-512.png','previous-version.html','backups/before-office-overnights-2026-10-11/index.html']);
  const server=http.createServer((req,res)=>{
    let file=new URL(req.url,'http://local').pathname.replace(/^\/app\//,'');if(!file)file='index.html';
    if(!allowed.has(file)){res.writeHead(404);res.end();return;}
    if(file==='index.html'&&state.failApp){res.writeHead(503);res.end('Unavailable');return;}
    const type=file.endsWith('.js')?'application/javascript':file.endsWith('.png')?'image/png':file.endsWith('.webmanifest')?'application/manifest+json':'text/html; charset=utf-8';
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(fs.readFileSync(file));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/app/';
  const browser=await chromium.launch(launchOptions);let failed=0;
  const selected=tests.filter(t=>!process.env.TEST_FILTER||t.name.includes(process.env.TEST_FILTER));
  try{for(const t of selected){const c=await browser.newContext({serviceWorkers:t.offline?'allow':'block'});await c.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.resolve()}}));const errors=[];c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));const p=await c.newPage();p.setDefaultTimeout(10000);try{await p.goto(url);await t.run(p,c,url,state);assert.deepEqual(errors,[]);console.log('PASS '+t.name);}catch(e){failed++;console.error('FAIL '+t.name+'\n'+e.stack);}finally{await c.close();}}}
  finally{await browser.close();await new Promise(r=>server.close(r));}
  console.log((selected.length-failed)+'/'+selected.length+' improvement checks passed.');if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
