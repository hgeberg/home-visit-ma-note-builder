/* Data lifecycle regressions; synthetic values in disposable browser contexts only. */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require('C:/Users/Hillel/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html = fs.readFileSync(path.join(__dirname, 'index.html'));
const tests = [];
const test = (name, fn) => tests.push([name,fn]);
const patient = (p,n=0) => p.locator('.patient').nth(n);
const field = (p,id,n=0) => patient(p,n).locator('[data-local-id="f_'+id+'"]');
const button = (p,id,n=0) => patient(p,n).locator('[data-local-id="'+id+'"]');
async function fill(p,id,value,n=0){ await field(p,id,n).fill(value); }
async function copy(p,n=0){ await button(p,'copyBtn',n).click(); const b=p.getByRole('button',{name:'Copy anyway',exact:true}); if(await b.count()) await b.click(); await p.waitForTimeout(30); }
async function fresh(c,url){const p=await c.newPage();p.setDefaultTimeout(15000);await p.goto(url);return p;}
async function stored(p){ return p.evaluate(()=>JSON.parse(localStorage.getItem('hvnb_office')||'[]')); }
async function clipboard(p,mode='success'){ await p.evaluate(mode=>{window.pendingCopies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:text=>mode==='delayed' ? new Promise((resolve,reject)=>window.pendingCopies.push({text,resolve,reject})) : mode==='blocked' ? Promise.reject(Error('Synthetic clipboard rejection')) : Promise.resolve()}});if(mode==='blocked')document.execCommand=()=>false;},mode); }
async function seed(p,name='SYNTHETIC AUDIT ONLY',overnights='Blood',n=0){await fill(p,'name',name,n);await fill(p,'overnights',overnights,n);}
async function settle(p,n=0){await p.evaluate(n=>pendingCopies[n].resolve(),n);await p.waitForTimeout(30);}
async function samePatient(p){const b=p.getByRole('button',{name:'Same patient, keep editing',exact:true});if(await b.count())await b.click();}
async function retry(p){await p.locator('#view-office').click();await p.locator('#retryOfficeSave').click();await p.waitForTimeout(30);}
async function failRead(p){await p.evaluate(()=>{const original=Storage.prototype.getItem;let once=true;Storage.prototype.getItem=function(k){if(this===localStorage&&k==='hvnb_office'&&once){once=false;throw Error('Synthetic read failure');}return original.call(this,k);};});}

test('Only one clipboard request runs and a recopy saves newest values',async(c,url)=>{
 const p=await fresh(c,url);await clipboard(p,'delayed');await seed(p);await copy(p);assert(await button(p,'copyBtn').isDisabled());
 await fill(p,'overnights','RPP');await button(p,'copyBtn').evaluate(b=>b.click());assert.equal(await p.evaluate(()=>pendingCopies.length),1);
 await settle(p);assert.equal((await stored(p))[0].overnights,'Blood');assert(!(await button(p,'copyBtn').isDisabled()));await copy(p);await settle(p,1);assert.equal((await stored(p))[0].overnights,'RPP');
});
test('Clipboard lock spans existing and newly added patients',async(c,url)=>{
 const p=await fresh(c,url);await clipboard(p,'delayed');await seed(p);await copy(p);await button(p,'addPatientBtn').click();assert(await button(p,'copyBtn',1).isDisabled());await settle(p);assert(!(await button(p,'copyBtn',1).isDisabled()));await seed(p,'SYNTHETIC SECOND','RPP',1);await copy(p,1);assert(await button(p,'copyBtn',0).isDisabled());await settle(p,1);assert.equal((await stored(p)).length,2);
});
test('Clearing a pending patient releases lock without stale state mutation',async(c,url)=>{
 const p=await fresh(c,url);await clipboard(p,'delayed');await seed(p);await copy(p);await button(p,'newBtn').click();await p.getByRole('button',{name:'Clear this patient',exact:true}).click();assert(!(await button(p,'copyBtn').isDisabled()));await seed(p,'SYNTHETIC NEW','RPP');await copy(p);await settle(p,0);assert(await button(p,'copyBtn').isDisabled());assert.equal((await stored(p)).length,0);await settle(p,1);assert.equal((await stored(p))[0].name,'SYNTHETIC NEW');
});
test('Manual fallback cancellation, Escape, and success release the lock',async(c,url)=>{
 const p=await fresh(c,url);await clipboard(p,'blocked');await seed(p);await copy(p);assert(await button(p,'copyBtn').isDisabled());await p.getByRole('button',{name:'Cancel',exact:true}).click();assert(!(await button(p,'copyBtn').isDisabled()));await copy(p);await p.keyboard.press('Escape');assert(!(await button(p,'copyBtn').isDisabled()));await copy(p);await p.getByRole('button',{name:'I copied it',exact:true}).click();assert(!(await button(p,'copyBtn').isDisabled()));assert.equal((await stored(p)).length,1);
});
test('Read failure preserves patient association and retries exact copied snapshot',async(c,url)=>{
 const p=await fresh(c,url);await clipboard(p);await seed(p);await copy(p);await fill(p,'overnights','RPP');await samePatient(p);await failRead(p);await copy(p);assert.equal((await stored(p)).length,1);assert.equal((await stored(p))[0].overnights,'Blood');assert.equal(await p.locator('#officeSaveWarning').getAttribute('hidden'),null);await fill(p,'overnights','Strep culture');await samePatient(p);await retry(p);const result=await stored(p);assert.equal(result.length,1);assert.equal(result[0].overnights,'RPP');
});
test('A copied Office entry awaiting a read retry survives Clear this patient',async(c,url)=>{
 const p=await fresh(c,url);await clipboard(p);await seed(p);await failRead(p);await copy(p);await button(p,'newBtn').click();assert.equal(await field(p,'name').inputValue(),'');await seed(p,'SYNTHETIC NEXT','RPP');await copy(p);await retry(p);const result=await stored(p);assert.deepEqual(result.map(x=>x.name).sort(),['SYNTHETIC AUDIT ONLY','SYNTHETIC NEXT']);
});
test('Retry applies pending copied entries from every patient',async(c,url)=>{
 const p=await fresh(c,url);await clipboard(p);await seed(p);await failRead(p);await copy(p);await button(p,'addPatientBtn').click();await seed(p,'SYNTHETIC SECOND','RPP',1);await copy(p,1);await retry(p);assert.equal((await stored(p)).length,2);
});
test('Concurrent saved-entry edits preserve fields unchanged by the second editor',async(c,url)=>{
 const p=await fresh(c,url);await clipboard(p);await seed(p);await copy(p);const q=await fresh(c,url);for(const x of[p,q]){await x.locator('#view-office').click();await x.getByRole('button',{name:'Edit saved entry',exact:true}).click();}await p.locator('[data-local-id="sheet_overnights"]').fill('RPP');await p.getByRole('button',{name:'Save changes',exact:true}).click();await q.locator('[data-local-id="sheet_name"]').fill('SYNTHETIC CORRECTED');await q.getByRole('button',{name:'Save changes',exact:true}).click();const result=await stored(q);assert.equal(result[0].overnights,'RPP');assert.equal(result[0].name,'SYNTHETIC CORRECTED');
});
test('Retry after write failure merges only locally changed record fields',async(c,url)=>{
 const p=await fresh(c,url);await clipboard(p);await seed(p);await copy(p);const q=await fresh(c,url);await p.evaluate(()=>{window.failOfficeWrites=true;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===localStorage&&k==='hvnb_office'&&window.failOfficeWrites)throw Error('Synthetic quota failure');return original.call(this,k,v);};});await p.locator('#view-office').click();await p.getByRole('button',{name:'Edit saved entry',exact:true}).click();await p.locator('[data-local-id="sheet_name"]').fill('SYNTHETIC RENAMED');await p.getByRole('button',{name:'Save changes',exact:true}).click();await q.locator('#view-office').click();await q.getByRole('button',{name:'Edit saved entry',exact:true}).click();await q.locator('[data-local-id="sheet_overnights"]').fill('RPP');await q.getByRole('button',{name:'Save changes',exact:true}).click();await p.evaluate(()=>window.failOfficeWrites=false);await p.locator('#retryOfficeSave').click();const result=await stored(p);assert.equal(result[0].name,'SYNTHETIC RENAMED');assert.equal(result[0].overnights,'RPP');
});
test('Corrupt Office JSON stays intact and reports a persistent startup warning',async(c,url)=>{
 const p=await fresh(c,url);const corrupt='{broken synthetic data';await p.evaluate(raw=>localStorage.setItem('hvnb_office',raw),corrupt);await p.reload();assert.equal(await p.locator('#officeSaveWarning').getAttribute('hidden'),null);await clipboard(p);await seed(p);await copy(p);await retry(p);assert.equal(await p.evaluate(()=>localStorage.getItem('hvnb_office')),corrupt);assert.equal(await p.locator('#officeSaveWarning').getAttribute('hidden'),null);await p.evaluate(()=>localStorage.setItem('hvnb_office','[]'));await p.locator('#retryOfficeSave').click();assert.equal((await stored(p))[0].name,'SYNTHETIC AUDIT ONLY');
});
test('Malformed Office step elements do not crash recopy or lose test names',async(c,url)=>{
 const p=await fresh(c,url);await clipboard(p);await seed(p);await copy(p);await p.evaluate(()=>{const list=JSON.parse(localStorage.getItem('hvnb_office'));list[0].steps=[null,7,{id:'invalid'}, {id:'valid',label:'Synthetic step',done:true}];localStorage.setItem('hvnb_office',JSON.stringify(list));});await copy(p);const result=await stored(p);assert.equal(result.length,1);assert.equal(result[0].overnights,'Blood');assert(result[0].steps.every(s=>s&&typeof s.id==='string'&&typeof s.label==='string'));
});
test('Malformed copied metadata cannot crash undo during restored draft editing',async(c,url)=>{
 const p=await fresh(c,url);await p.addInitScript(()=>sessionStorage.setItem('hvnb_draft',JSON.stringify({version:2,t:Date.now(),patients:[{vals:{name:'SYNTHETIC RESTORE'},meta:{sentAt:Date.now(),sentText:'Patient: SYNTHETIC RESTORE',sentVals:'broken'}}]})));await p.reload();await p.getByRole('button',{name:'Restore this visit',exact:true}).click();await fill(p,'name','SYNTHETIC EDIT');await p.getByRole('button',{name:'No, undo this edit and add a patient',exact:true}).click();assert.equal(await p.locator('.patient').count(),2);assert.equal(await field(p,'name').inputValue(),'SYNTHETIC EDIT');
});
test('Recovery replays queued Copy before a newer saved-entry edit',async(c,url)=>{
 const p=await fresh(c,url);await clipboard(p);await seed(p);await copy(p);await fill(p,'overnights','RPP');await samePatient(p);await failRead(p);await copy(p);await p.locator('#view-office').click();await p.getByRole('button',{name:'Edit saved entry',exact:true}).click();await p.locator('[data-local-id="sheet_name"]').fill('SYNTHETIC EDIT AFTER COPY');await p.getByRole('button',{name:'Save changes',exact:true}).click();const result=await stored(p);assert.equal(result.length,1);assert.equal(result[0].overnights,'RPP');assert.equal(result[0].name,'SYNTHETIC EDIT AFTER COPY');assert.notEqual(await p.locator('#officeSaveWarning').getAttribute('hidden'),null);
});
test('Recovery replays queued Copy before a newer saved-entry removal',async(c,url)=>{
 const p=await fresh(c,url);await clipboard(p);await seed(p);await copy(p);await fill(p,'overnights','RPP');await samePatient(p);await failRead(p);await copy(p);await p.locator('#view-office').click();await p.locator('.office-patient').getByRole('button',{name:'Remove',exact:true}).click();await p.locator('dialog[open]').getByRole('button',{name:'Remove',exact:true}).click();assert.deepEqual(await stored(p),[]);assert.notEqual(await p.locator('#officeSaveWarning').getAttribute('hidden'),null);
});
test('Draft restoration preserves custom fields despite another tab changing layout preference',async(c,url)=>{
 const p=await fresh(c,url);await button(p,'editBtn').click();await p.getByRole('button',{name:'Export layout',exact:true}).first().click();const original=JSON.parse(await p.locator('dialog[open] textarea').inputValue());await p.getByRole('button',{name:'Close',exact:true}).click();await button(p,'editBtn').click();const custom=JSON.parse(JSON.stringify(original));custom.sections[0].fields.push({id:'audit_extra',type:'text',label:'Audit extra',out:'Audit extra'});await p.evaluate(layout=>localStorage.setItem('hvnb_layout',JSON.stringify(layout)),custom);await p.reload();await seed(p);await fill(p,'audit_extra','SYNTHETIC IMPORTANT DRAFT VALUE');await p.waitForTimeout(400);const q=await fresh(c,url);await q.evaluate(layout=>localStorage.setItem('hvnb_layout',JSON.stringify(layout)),original);await p.reload();await p.getByRole('button',{name:'Restore this visit',exact:true}).click();assert.equal(await field(p,'audit_extra').inputValue(),'SYNTHETIC IMPORTANT DRAFT VALUE');assert((await button(p,'output').inputValue()).includes('SYNTHETIC IMPORTANT DRAFT VALUE'));assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('hvnb_layout'))),original);const draft=await p.evaluate(()=>JSON.parse(sessionStorage.getItem('hvnb_draft')));assert.equal(draft.layout.sections[0].fields.at(-1).id,'audit_extra');assert.equal(draft.patients[0].layout,undefined);
});
test('Leaving the page flushes a pending layout edit before saving its draft',async(c,url)=>{
 const p=await fresh(c,url);await seed(p);await button(p,'editBtn').click();const label=p.locator('input[aria-label="Section name"]').first();await label.fill('SYNTHETIC SECTION TITLE');await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));const result=await p.evaluate(()=>({saved:JSON.parse(localStorage.getItem('hvnb_layout')),draft:JSON.parse(sessionStorage.getItem('hvnb_draft'))}));assert.equal(result.saved.sections[0].title,'SYNTHETIC SECTION TITLE');assert.equal(result.draft.layout.sections[0].title,'SYNTHETIC SECTION TITLE');
});
test('A write failure during queued-copy replay keeps the warning and visible pending card',async(c,url)=>{
 const p=await fresh(c,url);await clipboard(p);await seed(p);await failRead(p);await copy(p);await p.evaluate(()=>{let writes=0;window.failReplay=true;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===localStorage&&k==='hvnb_office'&&++writes>1&&window.failReplay)throw Error('Synthetic replay quota failure');return original.call(this,k,v);};});await retry(p);assert.equal(await p.locator('.office-patient').count(),1);assert.equal(await p.locator('#officeSaveWarning').getAttribute('hidden'),null);assert.deepEqual(await stored(p),[]);await p.evaluate(()=>window.failReplay=false);await p.locator('#retryOfficeSave').click();assert.equal((await stored(p)).length,1);assert.notEqual(await p.locator('#officeSaveWarning').getAttribute('hidden'),null);
});

(async()=>{const filter=process.env.TEST_FILTER||process.argv[2];const selected=tests.filter(([name])=>!filter||name.includes(filter));if(!selected.length)throw Error('No data lifecycle checks matched '+filter);const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));let b;let failed=0;try{b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const url='http://127.0.0.1:'+server.address().port+'/';for(const[name,fn]of selected){const c=await b.newContext();const errors=[];c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));try{await fn(c,url);assert.deepEqual(errors,[]);console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}finally{await c.close();}}}finally{if(b)await b.close();await new Promise(r=>server.close(r));}console.log(`\n${selected.length-failed}/${selected.length} data lifecycle checks passed.`);if(failed)process.exitCode=1;})();
