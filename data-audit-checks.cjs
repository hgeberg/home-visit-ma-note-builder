/* Data lifecycle regressions; synthetic values in disposable browser contexts only. */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium, launchOptions} = require('./qa/browser.cjs');
const {defaultLayout, installSavedLayout} = require('./qa/form-fixtures.cjs');
const html = fs.readFileSync(path.join(__dirname, 'index.html'));
const tests = [];
const test = (name, fn) => tests.push([name,fn]);
const patient = (p,n=0) => p.locator('.patient').nth(n);
const field = (p,id,n=0) => patient(p,n).locator('[data-local-id="f_'+id+'"]');
const button = (p,id,n=0) => patient(p,n).locator('[data-local-id="'+id+'"]');
async function fill(p,id,value,n=0){ await field(p,id,n).fill(value); }
async function copy(p,n=0){ await button(p,'copyBtn',n).click(); const b=p.getByRole('button',{name:'Copy anyway',exact:true}); if(await b.count()) await b.click(); await p.waitForTimeout(30); }
async function fresh(c,url){const p=await c.newPage();p.setDefaultTimeout(15000);await p.goto(url);return p;}
async function stored(p){ return p.evaluate(()=>JSON.parse(localStorage.getItem('hvnb_current_office')||'[]')); }
async function clipboard(p,mode='success'){ await p.evaluate(mode=>{window.pendingCopies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:text=>mode==='delayed' ? new Promise((resolve,reject)=>window.pendingCopies.push({text,resolve,reject})) : mode==='blocked' ? Promise.reject(Error('Synthetic clipboard rejection')) : Promise.resolve()}});if(mode==='blocked')document.execCommand=()=>false;},mode); }
async function seed(p,name='SYNTHETIC AUDIT ONLY',overnights='Blood',n=0){await fill(p,'name',name,n);await fill(p,'overnights',overnights,n);}
async function settle(p,n=0){await p.evaluate(n=>pendingCopies[n].resolve(),n);await p.waitForTimeout(30);}
async function samePatient(p){const b=p.getByRole('button',{name:'Same patient, keep editing',exact:true});if(await b.count())await b.click();}
async function retry(p){await p.locator('#view-office').click();await p.locator('#retryOfficeSave').click();await p.waitForTimeout(30);}
async function failRead(p){await p.evaluate(()=>{const original=Storage.prototype.getItem;let once=true;Storage.prototype.getItem=function(k){if(this===localStorage&&k==='hvnb_current_office'&&once){once=false;throw Error('Synthetic read failure');}return original.call(this,k);};});}

async function unreadDraftPage(c,url,{installed=false,kind='session',once=false}={}){
 const p=await c.newPage();p.setDefaultTimeout(15000);
 await p.addInitScript(({installed,kind,once})=>{
  localStorage.setItem('hvnb_current_migrated','1');sessionStorage.setItem('hvnb_current_migrated','1');
  Object.defineProperty(navigator,'standalone',{configurable:true,value:installed});
  const draft=notes=>JSON.stringify({version:4,t:Date.now()-(notes==='DEVICE'?2000:1000),patients:[{vals:{name:'SYNTHETIC '+notes,notes,k_pa:true}}]});
  sessionStorage.setItem('hvnb_current_draft',draft('WINDOW'));
  if(installed||kind==='device')localStorage.setItem('hvnb_current_app_draft',draft('DEVICE'));
  const read=Storage.prototype.getItem;
  window.syntheticDraftBytes=()=>({session:read.call(sessionStorage,'hvnb_current_draft'),device:read.call(localStorage,'hvnb_current_app_draft')});
  window.originalDraftBytes=window.syntheticDraftBytes();window.failDraftRead=true;
  Storage.prototype.getItem=function(k){
   if(window.failDraftRead&&((kind==='session'&&this===sessionStorage&&k==='hvnb_current_draft')||(kind==='device'&&this===localStorage&&k==='hvnb_current_app_draft'))){
    if(once)window.failDraftRead=false;throw Error('Synthetic initial draft read failure');
   }
   return read.call(this,k);
  };
 },{installed,kind,once});
 await p.goto(url);return p;
}

test('A failed first draft read preserves saved bytes and Retry restores the original patient',async(c,url)=>{
 const p=await unreadDraftPage(c,url,{once:true});
 assert.equal(await p.locator('#draftReadWarning').isVisible(),true);assert.equal(await p.locator('.patient').count(),0);
 assert.equal(await p.locator('#patients').getAttribute('inert'),'');
 await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
 assert.deepEqual(await p.evaluate(()=>window.syntheticDraftBytes()),await p.evaluate(()=>window.originalDraftBytes));
 await p.locator('#retryDraftRead').click();await p.getByRole('button',{name:'Restore this visit',exact:true}).click();
 assert.equal(await field(p,'name').inputValue(),'SYNTHETIC WINDOW');assert.equal(await field(p,'notes').inputValue(),'WINDOW');
 assert.equal(await button(p,'f_k_pa').isChecked(),true);assert.equal(await p.locator('#draftReadWarning').isVisible(),false);
 await fill(p,'notes','SYNTHETIC SAVING WORKS AGAIN');await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
 assert.equal(await p.evaluate(()=>JSON.parse(sessionStorage.getItem('hvnb_current_draft')).patients[0].vals.notes),'SYNTHETIC SAVING WORKS AGAIN');
});

test('Repeated failed draft reads keep the original draft intact until a successful retry',async(c,url)=>{
 const p=await unreadDraftPage(c,url);
 for(let i=0;i<2;i++)await p.locator('#retryDraftRead').click();
 await p.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pagehide'));});
 assert.equal(await p.locator('.patient').count(),0);assert.equal(await p.locator('#draftReadWarning').isVisible(),true);
 assert.deepEqual(await p.evaluate(()=>window.syntheticDraftBytes()),await p.evaluate(()=>window.originalDraftBytes));
 await p.evaluate(()=>window.failDraftRead=false);await p.locator('#retryDraftRead').click();
 await p.getByRole('button',{name:'Restore this visit',exact:true}).click();assert.equal(await field(p,'name').inputValue(),'SYNTHETIC WINDOW');
});

for(const installed of [false,true])for(const kind of ['session','device'])test((installed?'Installed':'Ordinary')+' '+kind+' draft read failures preserve saved copies and recover the selected shift',async(c,url)=>{
 const p=await unreadDraftPage(c,url,{installed,kind});
 assert.equal(await p.locator('.patient').count(),0);await p.locator('#retryDraftRead').click();
 await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
 assert.deepEqual(await p.evaluate(()=>window.syntheticDraftBytes()),await p.evaluate(()=>window.originalDraftBytes));
 await p.evaluate(()=>window.failDraftRead=false);await p.locator('#retryDraftRead').click();
 if(installed||kind==='device'){
  assert.match(await p.locator('dialog[open]').innerText(),/Different saved shifts/);
  await p.getByRole('button',{name:'Restore saved device shift',exact:true}).click();
  assert.equal(await field(p,'name').inputValue(),'SYNTHETIC DEVICE');assert.equal(await field(p,'notes').inputValue(),'DEVICE');
 }else{
  await p.getByRole('button',{name:'Restore this visit',exact:true}).click();
  assert.equal(await field(p,'name').inputValue(),'SYNTHETIC WINDOW');
 }
 assert.equal(await p.locator('#draftReadWarning').isVisible(),false);
});

test('Retry after another tab clears the shift does not restore the unread older draft',async(c,url)=>{
 const p=await unreadDraftPage(c,url),q=await fresh(c,url);
 await q.locator('#clearShiftBtn').click();await q.locator('#confirmClearShift').click();
 await p.evaluate(()=>window.dispatchEvent(new Event('focus')));
 assert.equal(await p.locator('.patient').count(),0);
 assert.deepEqual(await p.evaluate(()=>window.syntheticDraftBytes()),await p.evaluate(()=>window.originalDraftBytes));
 await p.evaluate(()=>window.failDraftRead=false);await p.locator('#retryDraftRead').click();
 assert.equal(await p.getByRole('button',{name:'Restore this visit',exact:true}).count(),0);assert.equal(await field(p,'name').inputValue(),'');
 await fill(p,'name','SYNTHETIC NEW SHIFT');await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
 assert.equal(await p.evaluate(()=>JSON.parse(sessionStorage.getItem('hvnb_current_draft')).patients[0].vals.name),'SYNTHETIC NEW SHIFT');
});

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
 const p=await fresh(c,url);await clipboard(p);await seed(p);await copy(p);const q=await fresh(c,url);await q.getByRole('button',{name:'Restore this visit',exact:true}).click();for(const x of[p,q]){await x.locator('#view-office').click();await x.getByRole('button',{name:'Edit saved entry',exact:true}).click();}await p.locator('[data-local-id="sheet_overnights"]').fill('RPP');await p.getByRole('button',{name:'Save changes',exact:true}).click();await q.locator('[data-local-id="sheet_name"]').fill('SYNTHETIC CORRECTED');await q.getByRole('button',{name:'Save changes',exact:true}).click();const result=await stored(q);assert.equal(result[0].overnights,'RPP');assert.equal(result[0].name,'SYNTHETIC CORRECTED');
});
test('Retry after write failure merges only locally changed record fields',async(c,url)=>{
 const p=await fresh(c,url);await clipboard(p);await seed(p);await copy(p);const q=await fresh(c,url);await q.getByRole('button',{name:'Restore this visit',exact:true}).click();await p.evaluate(()=>{window.failOfficeWrites=true;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===localStorage&&k==='hvnb_current_office'&&window.failOfficeWrites)throw Error('Synthetic quota failure');return original.call(this,k,v);};});await p.locator('#view-office').click();await p.getByRole('button',{name:'Edit saved entry',exact:true}).click();await p.locator('[data-local-id="sheet_name"]').fill('SYNTHETIC RENAMED');await p.getByRole('button',{name:'Save changes',exact:true}).click();await q.locator('#view-office').click();await q.getByRole('button',{name:'Edit saved entry',exact:true}).click();await q.locator('[data-local-id="sheet_overnights"]').fill('RPP');await q.getByRole('button',{name:'Save changes',exact:true}).click();await p.evaluate(()=>window.failOfficeWrites=false);await p.locator('#retryOfficeSave').click();const result=await stored(p);assert.equal(result[0].name,'SYNTHETIC RENAMED');assert.equal(result[0].overnights,'RPP');
});
test('Corrupt Office JSON stays intact and reports a persistent startup warning',async(c,url)=>{
 const p=await fresh(c,url);const corrupt='{broken synthetic data';await p.evaluate(raw=>localStorage.setItem('hvnb_current_office',raw),corrupt);await p.reload();assert.equal(await p.locator('#officeSaveWarning').getAttribute('hidden'),null);await clipboard(p);await seed(p);await copy(p);await retry(p);assert.equal(await p.evaluate(()=>localStorage.getItem('hvnb_current_office')),corrupt);assert.equal(await p.locator('#officeSaveWarning').getAttribute('hidden'),null);await p.evaluate(()=>localStorage.setItem('hvnb_current_office','[]'));await p.locator('#retryOfficeSave').click();assert.equal((await stored(p))[0].name,'SYNTHETIC AUDIT ONLY');
});
test('Malformed Office step elements do not crash recopy or lose test names',async(c,url)=>{
 const p=await fresh(c,url);await clipboard(p);await seed(p);await copy(p);await p.evaluate(()=>{const list=JSON.parse(localStorage.getItem('hvnb_current_office'));list[0].steps=[null,7,{id:'invalid'}, {id:'valid',label:'Synthetic step',done:true}];localStorage.setItem('hvnb_current_office',JSON.stringify(list));});await copy(p);const result=await stored(p);assert.equal(result.length,1);assert.equal(result[0].overnights,'Blood');assert(result[0].steps.every(s=>s&&typeof s.id==='string'&&typeof s.label==='string'));
});
test('Malformed copied metadata cannot crash undo during restored draft editing',async(c,url)=>{
 const p=await fresh(c,url);await p.addInitScript(()=>sessionStorage.setItem('hvnb_current_draft',JSON.stringify({version:2,t:Date.now(),patients:[{vals:{name:'SYNTHETIC RESTORE'},meta:{sentAt:Date.now(),sentText:'Patient: SYNTHETIC RESTORE',sentVals:'broken'}}]})));await p.reload();await p.getByRole('button',{name:'Restore this visit',exact:true}).click();await fill(p,'name','SYNTHETIC EDIT');await p.getByRole('button',{name:'No, undo this edit and add a patient',exact:true}).click();assert.equal(await p.locator('.patient').count(),2);assert.equal(await field(p,'name').inputValue(),'SYNTHETIC RESTORE');
});
test('Recovery replays queued Copy before a newer saved-entry edit',async(c,url)=>{
 const p=await fresh(c,url);await clipboard(p);await seed(p);await copy(p);await fill(p,'overnights','RPP');await samePatient(p);await failRead(p);await copy(p);await p.locator('#view-office').click();await p.getByRole('button',{name:'Edit saved entry',exact:true}).click();await p.locator('[data-local-id="sheet_name"]').fill('SYNTHETIC EDIT AFTER COPY');await p.getByRole('button',{name:'Save changes',exact:true}).click();const result=await stored(p);assert.equal(result.length,1);assert.equal(result[0].overnights,'RPP');assert.equal(result[0].name,'SYNTHETIC EDIT AFTER COPY');assert.notEqual(await p.locator('#officeSaveWarning').getAttribute('hidden'),null);
});
test('Recovery replays queued Copy before a newer saved-entry removal',async(c,url)=>{
 const p=await fresh(c,url);await clipboard(p);await seed(p);await copy(p);await fill(p,'overnights','RPP');await samePatient(p);await failRead(p);await copy(p);await p.locator('#view-office').click();await p.locator('.office-patient').getByRole('button',{name:'Remove',exact:true}).click();await p.locator('dialog[open]').getByRole('button',{name:'Remove',exact:true}).click();assert.deepEqual(await stored(p),[]);assert.notEqual(await p.locator('#officeSaveWarning').getAttribute('hidden'),null);
});
test('Draft restoration preserves custom fields despite another tab changing layout preference',async(c,url)=>{
 const original=defaultLayout(),custom=JSON.parse(JSON.stringify(original));custom.sections[0].fields.push({id:'audit_extra',type:'text',label:'Audit extra',out:'Audit extra'});
 const p=await fresh(c,url);await installSavedLayout(p,custom);await seed(p);await fill(p,'audit_extra','SYNTHETIC IMPORTANT DRAFT VALUE');await p.waitForTimeout(400);
 const q=await fresh(c,url);await q.evaluate(layout=>localStorage.setItem('hvnb_current_layout',JSON.stringify(layout)),original);
 await p.reload();await p.getByRole('button',{name:'Restore this visit',exact:true}).click();
 assert.equal(await field(p,'audit_extra').inputValue(),'SYNTHETIC IMPORTANT DRAFT VALUE');assert((await button(p,'output').inputValue()).includes('SYNTHETIC IMPORTANT DRAFT VALUE'));
 assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('hvnb_current_layout'))),original);
 const draft=await p.evaluate(()=>JSON.parse(sessionStorage.getItem('hvnb_current_draft')));assert.equal(draft.layout.sections[0].fields.at(-1).id,'audit_extra');assert.equal(draft.patients[0].layout,undefined);
});

test('Leaving the page immediately flushes entered patient answers to the draft',async(c,url)=>{
 const p=await fresh(c,url);await seed(p);await fill(p,'notes','SYNTHETIC LAST ANSWER');
 await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
 const draft=await p.evaluate(()=>JSON.parse(sessionStorage.getItem('hvnb_current_draft')));
 assert.equal(draft.patients[0].vals.notes,'SYNTHETIC LAST ANSWER');
});

test('A write failure during queued-copy replay keeps the warning and visible pending card',async(c,url)=>{
 const p=await fresh(c,url);await clipboard(p);await seed(p);await failRead(p);await copy(p);await p.evaluate(()=>{let writes=0;window.failReplay=true;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===localStorage&&k==='hvnb_current_office'&&++writes>1&&window.failReplay)throw Error('Synthetic replay quota failure');return original.call(this,k,v);};});await retry(p);assert.equal(await p.locator('.office-patient').count(),1);assert.equal(await p.locator('#officeSaveWarning').getAttribute('hidden'),null);assert.deepEqual(await stored(p),[]);await p.evaluate(()=>window.failReplay=false);await p.locator('#retryOfficeSave').click();assert.equal((await stored(p)).length,1);assert.notEqual(await p.locator('#officeSaveWarning').getAttribute('hidden'),null);
});

(async()=>{const filter=process.env.TEST_FILTER||process.argv[2];const selected=tests.filter(([name])=>!filter||name.includes(filter));if(!selected.length)throw Error('No data lifecycle checks matched '+filter);const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));let b;let failed=0;try{b=await chromium.launch(launchOptions);const url='http://127.0.0.1:'+server.address().port+'/';for(const[name,fn]of selected){const c=await b.newContext();const errors=[];c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));try{await fn(c,url);assert.deepEqual(errors,[]);console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}finally{await c.close();}}}finally{if(b)await b.close();await new Promise(r=>server.close(r));}console.log(`\n${selected.length-failed}/${selected.length} data lifecycle checks passed.`);if(failed)process.exitCode=1;})();
