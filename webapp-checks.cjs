/* Installed-app recovery uses synthetic data in disposable Chrome profiles. */
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium, launchOptions} = require('./qa/browser.cjs');
const backupKey='hvnb_current_app_draft',tests=[],test=(name,run,offline=false)=>tests.push({name,run,offline});
const patient=(p,n=0)=>p.locator('.patient').nth(n);
const field=(p,id,n=0)=>patient(p,n).locator('[data-local-id="'+id+'"]');
const backup=p=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),backupKey);
const restore=p=>p.getByRole('button',{name:/^Restore (this visit|all)/}).click();
async function seed(p,name='SYNTHETIC APP ALPHA',n=0){await field(p,'f_name',n).fill(name);await field(p,'f_dob',n).fill('01/01/2000');await field(p,'f_inspic',n).check();await field(p,'f_symptoms',n).fill(name+' symptoms');}
async function flush(p){await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));}
async function installed(c){await c.addInitScript(()=>{
 Object.defineProperty(navigator,'standalone',{configurable:true,value:true});
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.resolve()}});
});}
async function copy(p,n=0){await field(p,'copyBtn',n).click();await field(p,'sentBanner',n).waitFor({state:'visible'});}

test('Manifest and opaque icons use the GitHub project scope and launch in standalone mode',async(p,c,url)=>{
 const manifest=await p.evaluate(async()=>{const link=document.querySelector('link[rel="manifest"]');const response=await fetch(link.href);return {url:link.href,data:await response.json()};});
 assert.equal(manifest.data.display,'standalone');assert.equal(new URL(manifest.data.start_url,manifest.url).href,url);assert.equal(new URL(manifest.data.scope,manifest.url).href,url);
 assert.equal(new URL(manifest.data.id,manifest.url).href,url);assert.equal(manifest.data.short_name,'Note Builder');
 for(const icon of manifest.data.icons){const size=Number(icon.sizes.split('x')[0]),response=await c.request.get(new URL(icon.src,manifest.url).href);assert.equal(response.status(),200);const png=await response.body();assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);assert.equal(png[25],2,'Opaque RGB icon');}
 const touch=await p.locator('link[rel="apple-touch-icon"]').getAttribute('href'),response=await c.request.get(new URL(touch,url).href),png=await response.body();assert.equal(png.readUInt32BE(16),180);assert.equal(png.readUInt32BE(20),180);
});

test('Closing all app pages retains houses, notes, checklists and Office for reopening',async(p,c,url)=>{
 await seed(p);await field(p,'f_overnights').fill('RPP');await copy(p);
 await field(p,'tab-check').click();await field(p,'f_k_confirm').check();
 await p.locator('#appendPatient').click();await seed(p,'SYNTHETIC APP BETA',1);
 await p.locator('#newHouseBtn').click();await seed(p,'SYNTHETIC APP GAMMA',2);await flush(p);
 const before=await backup(p);assert.equal(before.patients.length,3);await p.close();
 const q=await c.newPage();await q.goto(url);assert.equal(await q.evaluate(()=>sessionStorage.getItem('hvnb_current_draft')),null);
 assert.match(await q.locator('dialog[open]').innerText(),/saved on this device/);assert.equal((await backup(q)).patients.length,3);await restore(q);
 assert.equal(await q.locator('#houseHeading').innerText(),'House 2');assert.equal(await q.locator('.patient:visible').count(),1);assert.equal(await field(q,'f_name',2).inputValue(),'SYNTHETIC APP GAMMA');
 assert.equal(await field(q,'f_k_confirm').isChecked(),true);assert.equal(await field(q,'f_symptoms',1).inputValue(),'SYNTHETIC APP BETA symptoms');
 assert.equal(await q.locator('#patientNavigator').evaluate(el=>el.open),false);
 await q.locator('#view-office').click();assert.equal(await q.locator('.office-patient').count(),1);assert.match(await q.locator('#officeContent').innerText(),/SYNTHETIC APP ALPHA/);
});

test('A shift older than eight hours survives installed-app reopening without an automatic expiry',async(p,c,url)=>{
 await seed(p);await flush(p);const saved=await backup(p);await p.close();saved.t=Date.now()-3*24*60*60*1000;
 const q=await c.newPage();await q.goto(url);await q.getByRole('button',{name:'Start fresh',exact:true}).click();
 await q.evaluate(({key,value})=>{localStorage.setItem(key,JSON.stringify(value));sessionStorage.clear();},{key:backupKey,value:saved});
 // Open a separate document without pagehide replacing the deliberately older fixture.
 const r=await c.newPage();await r.goto(url);assert.match(await r.locator('dialog[open]').innerText(),/Saved on this device/);await restore(r);assert.equal(await field(r,'f_name').inputValue(),'SYNTHETIC APP ALPHA');
});

test('The undecided recovery dialog cannot overwrite the saved shift with a blank page',async(p,c,url)=>{
 await seed(p);await flush(p);await p.close();const q=await c.newPage();await q.goto(url);const saved=await backup(q);
 await q.waitForTimeout(700);assert.deepEqual(await backup(q),saved);await q.close();
 const r=await c.newPage();await r.goto(url);await restore(r);assert.equal(await field(r,'f_name').inputValue(),'SYNTHETIC APP ALPHA');
});

test('Start fresh clears active forms while retaining Patients Seen and copied Office entries',async(p,c,url)=>{
 await seed(p);await field(p,'f_overnights').fill('RPP');await copy(p);await p.close();
 const q=await c.newPage();await q.goto(url);await q.getByRole('button',{name:'Start fresh',exact:true}).click();assert.equal((await backup(q)).seenVisits[0].vals.name,'SYNTHETIC APP ALPHA');assert.deepEqual((await backup(q)).patients[0].vals,{});
 await q.locator('#view-office').click();assert.equal(await q.locator('.office-patient').count(),1);await q.close();
 const r=await c.newPage();await r.goto(url);assert.equal(await r.getByRole('button',{name:/^Restore/}).count(),0);assert.equal(await field(r,'f_name').inputValue(),'');
});

test('Clear shift removes durable recovery across app windows and blocks a pending old copy',async(p,c,url)=>{
 await seed(p);await field(p,'f_overnights').fill('RPP');await flush(p);
 const q=await c.newPage();await q.goto(url);await restore(q);
 await p.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise(resolve=>window.finishCopy=resolve)}}));await field(p,'copyBtn').click();await p.waitForFunction(()=>typeof finishCopy==='function');
 await q.locator('#clearShiftBtn').click();await q.locator('#confirmClearShift').click();await p.waitForFunction(()=>document.querySelector('[data-local-id="f_name"]').value==='');await p.evaluate(()=>window.finishCopy());
 assert.equal(await backup(q),null);assert.equal(await backup(p),null);await p.close();await q.close();
 const r=await c.newPage();await r.goto(url);assert.equal(await r.getByRole('button',{name:/^Restore/}).count(),0);assert.equal(await field(r,'f_name').inputValue(),'');assert.deepEqual(await r.evaluate(()=>JSON.parse(localStorage.getItem('hvnb_current_office')||'[]')),[]);
});

test('A failed durable deletion stays visible until Retry removes the recovery copy',async p=>{
 await seed(p);await flush(p);await p.evaluate(key=>{window.blockRecoveryDelete=true;const old=Storage.prototype.removeItem;Storage.prototype.removeItem=function(k){if(this===localStorage&&k===key&&window.blockRecoveryDelete)throw Error('Synthetic durable deletion failure');return old.call(this,k);};},backupKey);
 await p.locator('#clearShiftBtn').click();await p.locator('#confirmClearShift').click();assert.equal(await p.locator('#shiftClearWarning').isVisible(),true);assert.notEqual(await backup(p),null);
 await p.evaluate(()=>window.blockRecoveryDelete=false);await p.locator('#retryShiftClear').click();assert.equal(await p.locator('#shiftClearWarning').isVisible(),false);assert.equal(await backup(p),null);
});

test('Failed durable saving warns despite a successful session save and recovers on retry',async p=>{
 await p.evaluate(key=>{window.failRecovery=true;const old=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===localStorage&&k===key&&window.failRecovery)throw Error('Synthetic durable save failure');return old.call(this,k,v);};},backupKey);
 await seed(p);await flush(p);assert.equal(await p.locator('#draftWarning').isVisible(),true);assert.match(await p.locator('#draftWarning').innerText(),/could not be saved for reopening/);assert.notEqual(await p.evaluate(()=>sessionStorage.getItem('hvnb_current_draft')),null);
 await p.evaluate(()=>window.failRecovery=false);await field(p,'f_symptoms').fill('SYNTHETIC RECOVERY RETRY');await flush(p);assert.equal(await p.locator('#draftWarning').isVisible(),false);assert.equal((await backup(p)).patients[0].vals.symptoms,'SYNTHETIC RECOVERY RETRY');
});

test('Durable recovery works when session storage itself cannot save',async(p,c,url)=>{
 await p.evaluate(()=>{const old=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===sessionStorage&&k==='hvnb_current_draft')throw Error('Synthetic session failure');return old.call(this,k,v);};});
 await seed(p);await flush(p);assert.equal(await p.locator('#draftWarning').isVisible(),false);await p.close();const q=await c.newPage();await q.goto(url);await restore(q);assert.equal(await field(q,'f_name').inputValue(),'SYNTHETIC APP ALPHA');
});

test('A stale app window cannot overwrite another window’s newer saved shift',async(p,c,url)=>{
 await seed(p);await flush(p);const q=await c.newPage();await q.goto(url);
 await field(p,'f_symptoms').fill('SYNTHETIC NEWEST SAVED HISTORY');await flush(p);await restore(q);await flush(q);
 assert.equal(await q.locator('#draftWarning').isVisible(),true);assert.match(await q.locator('#draftWarning').innerText(),/Another window/);assert.equal((await backup(q)).patients[0].vals.symptoms,'SYNTHETIC NEWEST SAVED HISTORY');
});

test('Reloading a conflicted window keeps both drafts and cannot replace the device shift',async(p,c,url)=>{
 await seed(p);await flush(p);const q=await c.newPage();await q.goto(url);
 await field(p,'f_symptoms').fill('SYNTHETIC NEWER DEVICE HISTORY');await flush(p);await restore(q);
 await field(q,'f_symptoms').fill('SYNTHETIC LOCAL WINDOW HISTORY');await flush(q);
 assert.equal(await q.locator('#draftWarning').isVisible(),true);
 await q.reload();assert.match(await q.locator('dialog[open]').innerText(),/Different saved shifts/);
 await q.getByRole('button',{name:'Restore this window’s shift',exact:true}).click();await flush(q);
 assert.equal(await field(q,'f_symptoms').inputValue(),'SYNTHETIC LOCAL WINDOW HISTORY');assert.equal((await backup(q)).patients[0].vals.symptoms,'SYNTHETIC NEWER DEVICE HISTORY');
 assert.equal(await q.locator('#draftWarning').isVisible(),true);
 await q.reload();await q.getByRole('button',{name:'Restore saved device shift',exact:true}).click();
 assert.equal(await field(q,'f_symptoms').inputValue(),'SYNTHETIC NEWER DEVICE HISTORY');
});

test('A failed device save recovers newer session work and retries after reload',async(p,c,url)=>{
 await seed(p);await flush(p);await p.evaluate(()=>{const old=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===localStorage&&k==='hvnb_current_app_draft')throw Error('Synthetic quota');return old.call(this,k,v);};});
 await field(p,'f_symptoms').fill('SYNTHETIC SESSION AFTER QUOTA');await flush(p);assert.equal(await p.locator('#draftWarning').isVisible(),true);
 await p.reload();await restore(p);assert.equal(await field(p,'f_symptoms').inputValue(),'SYNTHETIC SESSION AFTER QUOTA');await flush(p);assert.equal((await backup(p)).patients[0].vals.symptoms,'SYNTHETIC SESSION AFTER QUOTA');assert.equal(await p.locator('#draftWarning').isVisible(),false);
});

test('Pending copied Office recovery survives closing and can be retried after reopening',async(p,c,url)=>{
 await p.evaluate(()=>{const old=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===localStorage&&k==='hvnb_current_office')throw Error('Synthetic Office save failure');return old.call(this,k,v);};});
 await seed(p);await field(p,'f_overnights').fill('RPP');await copy(p);await flush(p);const saved=await backup(p);assert.ok(saved.officeRecovery || saved.patients[0].pendingOfficeSync?.length);await p.close();
 const q=await c.newPage();await q.goto(url);await restore(q);await q.locator('#retryOfficeSave').click();await q.waitForFunction(()=>JSON.parse(localStorage.getItem('hvnb_current_office')||'[]').length===1);assert.equal((await q.evaluate(()=>JSON.parse(localStorage.getItem('hvnb_current_office'))))[0].name,'SYNTHETIC APP ALPHA');
});

test('A regular Safari-style tab restores complete visits from persistent storage',async(p,c,url,browser)=>{
 await seed(p);await flush(p);
 const plain=await browser.newContext({serviceWorkers:'block'}),q=await plain.newPage();
 await q.goto(url);await seed(q,'SYNTHETIC BROWSER TAB');await flush(q);assert.equal((await backup(q)).patients[0].vals.name,'SYNTHETIC BROWSER TAB');await q.close();
 const r=await plain.newPage();await r.goto(url);assert.equal(await r.getByRole('button',{name:/^Restore/}).count(),1);await restore(r);assert.equal(await field(r,'f_name').inputValue(),'SYNTHETIC BROWSER TAB');await plain.close();
});

test('Standard standalone display-mode detection enables durable recovery',async(p,c,url,browser)=>{
 const modern=await browser.newContext({serviceWorkers:'block'});await modern.addInitScript(()=>{const original=window.matchMedia.bind(window);window.matchMedia=query=>{const result=original(query);if(query==='(display-mode: standalone)')Object.defineProperty(result,'matches',{value:true});return result;};});
 const q=await modern.newPage();await q.goto(url);await seed(q,'SYNTHETIC MODERN APP');await flush(q);assert.equal((await backup(q)).patients[0].vals.name,'SYNTHETIC MODERN APP');await modern.close();
});

test('Offline app reopening restores the shift and serves only static assets from the cache',async(p,c,url)=>{
 await p.waitForFunction(()=>!!navigator.serviceWorker.controller);await p.waitForFunction(()=>document.querySelector('#offlineStatus').textContent==='Ready for offline opening');
 await seed(p);await flush(p);await p.close();await c.setOffline(true);
 const q=await c.newPage();await q.goto(url);await restore(q);assert.equal(await field(q,'f_name').inputValue(),'SYNTHETIC APP ALPHA');
 const assets=await q.evaluate(async()=>{const result=[];for(const name of await caches.keys())for(const request of await(await caches.open(name)).keys()){const response=await(await caches.open(name)).match(request);result.push({url:request.url,contents:await response.text()});}return result;});
 assert.equal(assets.length,5);assert.ok(assets.every(asset=>!asset.contents.includes('SYNTHETIC APP ALPHA')));
 for(const asset of ['manifest.webmanifest','icons/apple-touch-icon.png','icons/icon-192.png','icons/icon-512.png'])assert.equal(await q.evaluate(async file=>(await fetch(file)).ok,asset),true);
},true);

test('A complete browser restart retains recovery on disk and opens offline',async(p,c,url)=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'note-builder-pwa-test-'));let persistent;
 try{
  persistent=await chromium.launchPersistentContext(profile,{...launchOptions,serviceWorkers:'allow'});await installed(persistent);const q=await persistent.newPage();await q.goto(url);await q.waitForFunction(()=>!!navigator.serviceWorker.controller);await seed(q,'SYNTHETIC RESTART');await flush(q);await q.close();await persistent.close();persistent=null;
  persistent=await chromium.launchPersistentContext(profile,{...launchOptions,serviceWorkers:'allow'});await installed(persistent);await persistent.setOffline(true);const r=await persistent.newPage();await r.goto(url);await restore(r);assert.equal(await field(r,'f_name').inputValue(),'SYNTHETIC RESTART');
 }finally{
  if(persistent)await persistent.close();const resolved=path.resolve(profile),temporary=path.resolve(os.tmpdir())+path.sep;
  if(!resolved.startsWith(temporary)||!path.basename(resolved).startsWith('note-builder-pwa-test-'))throw Error('Unexpected test-profile cleanup path');
  fs.rmSync(resolved,{recursive:true,force:true,maxRetries:3,retryDelay:200});
 }
});

(async()=>{
 const allowed=new Set(['index.html','sw.js','manifest.webmanifest','icons/apple-touch-icon.png','icons/icon-192.png','icons/icon-512.png']);
 const server=http.createServer((req,res)=>{let file=new URL(req.url,'http://local').pathname.replace(/^\/app\//,'');if(!file)file='index.html';if(!allowed.has(file)){res.writeHead(404);res.end();return;}const type=file.endsWith('.js')?'application/javascript':file.endsWith('.png')?'image/png':file.endsWith('.webmanifest')?'application/manifest+json':'text/html; charset=utf-8';res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/app/';
 const browser=await chromium.launch(launchOptions);let failed=0;const selected=tests.filter(t=>!process.env.TEST_FILTER||t.name.includes(process.env.TEST_FILTER));
 try{for(const t of selected){const c=await browser.newContext({serviceWorkers:t.offline?'allow':'block',viewport:{width:810,height:1080}}),errors=[];await installed(c);c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));const p=await c.newPage();p.setDefaultTimeout(10000);
  try{await p.goto(url);await t.run(p,c,url,browser);assert.deepEqual(errors,[]);console.log('PASS '+t.name);}catch(e){failed++;console.error('FAIL '+t.name+'\n'+e.stack);}finally{await c.close();}
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
 console.log((selected.length-failed)+'/'+selected.length+' web-app checks passed.');if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
