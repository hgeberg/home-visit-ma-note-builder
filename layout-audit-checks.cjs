'use strict';
// Form editing is retired. Exercise visits and forms saved by earlier releases.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,launchOptions}=require('./qa/browser.cjs');
const {defaultLayout,installSavedLayout}=require('./qa/form-fixtures.cjs');
const source=fs.readFileSync(path.join(__dirname,'index.html'));
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(source)});
const results=[],fid=(p,id)=>p.locator('[data-local-id="'+id+'"]');
const field=(id,type='text',extra={})=>({id,type,label:'Synthetic '+id,...extra});
const layout=fields=>({base:12,v:4,sections:[{id:'s',tab:'visit',title:'Synthetic fields',fields}]});
const find=(l,id)=>l.sections.flatMap(s=>s.fields).find(f=>f.id===id);
const flush=p=>p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
async function seed(p,name='SYNTHETIC FORM'){await fid(p,'f_name').fill(name);await fid(p,'f_dob').fill('01/01/2000');await fid(p,'f_inspic').check();}
async function noEditor(p){
 assert.equal(await p.locator('[data-local-id="editBtn"], .editor, .builder, [data-local-id^="e_"]').count(),0);
 assert.equal(await p.getByRole('button',{name:/^(Edit (layout|form)|Import layout|Export layout|Reset to default)$/}).count(),0);
 assert.equal(await p.locator('.patient [role="tab"]').count(),2*await p.locator('.patient').count());
}
async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch(launchOptions);
 async function run(name,test){
  const c=await browser.newContext();
  await c.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied=text}}}));
  const p=await c.newPage(),errors=[];p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  try{await p.goto('http://127.0.0.1:'+server.address().port);await test(p);assert.deepEqual(errors,[]);results.push(name);console.log('PASS '+name);}finally{await c.close();}
 }
 try{
  await run('Fixed forms retain copying, conditional history, houses and recovery without editor controls',async p=>{
   await seed(p);await p.locator('[data-choice="abx"][data-v="Yes"]').click();await fid(p,'f_abx_name').fill('SYNTHETIC MEDICINE');await fid(p,'f_abx_when').fill('Last week');await fid(p,'f_overnights').fill('RPP');await fid(p,'copyBtn').click();await fid(p,'sentBanner').waitFor({state:'visible'});
   assert.match(await p.evaluate(()=>window.copied),/SYNTHETIC MEDICINE, Last week/);
   await p.locator('#appendPatient').click();await p.locator('#newHouseBtn').click();await noEditor(p);
   await p.locator('#view-office').click();assert.equal(await p.locator('.office-patient').count(),1);await noEditor(p);
   await flush(p);await p.reload();await p.getByRole('button',{name:'Restore all 3 patients',exact:true}).click();
   assert.equal(await p.locator('.patient').count(),3);assert.equal(await fid(p.locator('.patient').first(),'f_abx_name').inputValue(),'SYNTHETIC MEDICINE');await noEditor(p);
  });
  await run('DOB formats and calendar warnings still work',async p=>{
   await fid(p,'f_name').fill('SYNTHETIC DATE');
   for(const [input,expected]of[['2000-01-02','01/02/2000'],['2/29/2000','02/29/2000'],['2000.12.31','12/31/2000']]){await fid(p,'f_dob').fill(input);assert.equal(await fid(p,'f_dob').inputValue(),expected);}
   await fid(p,'f_dob').fill('02/29/2001');await fid(p,'copyBtn').click();assert.match(await p.getByRole('dialog').innerText(),/DOB: enter a valid date/);await p.getByRole('button',{name:'Go back',exact:true}).click();
   await fid(p,'f_polholder').fill('N/A');assert.equal(await fid(p,'f_polholder').inputValue(),'N/A');
  });
  await run('Existing custom forms retain labels, extra answers and patient isolation',async p=>{
   const saved=defaultLayout();find(saved,'symptoms').label='Current concerns';saved.sections[0].fields.push(field('legacy_extra'));await installSavedLayout(p,saved);
   for(let i=0;i<2;i++){if(i)await p.locator('#appendPatient').click();const q=p.locator('.patient').nth(i);await fid(q,'f_name').fill('SYNTHETIC '+i);await fid(q,'f_symptoms').fill('Concerns '+i);await fid(q,'f_legacy_extra').fill('Retained answer '+i);const text=await fid(q,'output').inputValue();assert.match(text,new RegExp('Current concerns: Concerns '+i));assert.match(text,new RegExp('Retained answer '+i));}
   await flush(p);await p.reload();await p.getByRole('button',{name:'Restore all 2 patients',exact:true}).click();assert.equal(await fid(p.locator('.patient').nth(1),'f_legacy_extra').inputValue(),'Retained answer 1');await noEditor(p);
  });
  await run('Invalid saved form definitions fall back without overwriting stored bytes',async p=>{
   const cases=['{broken',layout([field('a','choice',{opts:'yes'})]),layout([field('a'),field('a')]),
    ...['bad"id','constructor','__proto__','prototype'].map(id=>layout([field(id)])),
    layout([field('a','unknown')]),layout([field('a','text',{chips:'yes'})]),layout([field('a','choice',{opts:['Yes','Yes']})]),
    layout([field('a','choice',{opts:['Yes'],detail:{id:'a',on:'Yes'}})]),
    layout([field('a','tests',{items:[{id:'t',n:'Test',kind:'posneg',sub:'A'}]})]),layout([field('a','tests',{items:[null]})]),
    layout([field('a','text',{when:'unknownCondition'})]),layout([field('a'),{id:'mirror',type:'mirror',of:'a'}]),
    {base:12,v:4,sections:[{id:'s',tab:'visit',title:'One',fields:[]},{id:'s',tab:'check',title:'Two',fields:[]}]},
    layout([field('a','choice',{opts:['Yes'],sub:{id:'child',on:'No',opts:['One']}})]),
    layout([field('foo_bar','tests',{items:[{id:'x',n:'One',kind:'done'}]}),field('foo','tests',{items:[{id:'bar_x',n:'Two',kind:'done'}]})])];
   for(const value of cases){const raw=typeof value==='string'?value:JSON.stringify(value);await p.evaluate(raw=>{localStorage.setItem('hvnb_current_layout',raw);sessionStorage.removeItem('hvnb_current_draft')},raw);await p.reload();assert.match(await fid(p,'layoutWarning').innerText(),/saved layout could not be loaded/);assert.equal(await fid(p,'f_name').count(),1);assert.equal(await p.evaluate(()=>localStorage.getItem('hvnb_current_layout')),raw);await noEditor(p);}
  });
  await run('Draft snapshots retain custom answers when another tab changes its saved form',async p=>{
   const saved=defaultLayout();saved.sections[0].fields.push(field('legacy_extra'));await installSavedLayout(p,saved);await seed(p);await fid(p,'f_legacy_extra').fill('SYNTHETIC IMPORTANT ANSWER');await flush(p);
   await p.evaluate(l=>localStorage.setItem('hvnb_current_layout',JSON.stringify(l)),defaultLayout());await p.reload();await p.getByRole('button',{name:'Restore this visit',exact:true}).click();assert.equal(await fid(p,'f_legacy_extra').inputValue(),'SYNTHETIC IMPORTANT ANSWER');assert.match(await fid(p,'output').inputValue(),/SYNTHETIC IMPORTANT ANSWER/);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('hvnb_current_layout')).sections[0].fields.some(f=>f.id==='legacy_extra')),false);await noEditor(p);
  });
  await run('Saved custom choices and test subtypes retain their meaning',async p=>{
   const saved=defaultLayout(),exposure=find(saved,'exposure'),aware=find(saved,'aware');exposure.opts=['No','Certainly','Unknown'];exposure.detail.on='Certainly';aware.opts=['Aware','Not yet aware'];aware.unawareValue='Not yet aware';find(saved,'tests').items.find(it=>it.id==='flu').sub=['X','Y'];
   await installSavedLayout(p,saved);await seed(p);await p.locator('[data-choice="exposure"][data-v="Certainly"]').click();await fid(p,'f_exposureto').fill('SYNTHETIC CONTACT');await fid(p,'t_tests_flu').check();await p.locator('[data-item="flu"] [data-r="Positive"]').click();await p.locator('[data-item="flu"] [data-s="Y"]').click();await p.locator('[data-choice="aware"][data-v="Not yet aware"]').click();
   const text=await fid(p,'output').inputValue();assert.match(text,/Exposure: Certainly, to SYNTHETIC CONTACT/);assert.match(text,/POSITIVE \(Y\)/);assert.match(text,/PATIENT NOT YET AWARE/);assert.match(await fid(p,'tagLine').innerText(),/patient unaware/);await noEditor(p);
  });
  await run('Office remains a navigation action and saved-entry editing remains available',async p=>{
   await seed(p);await fid(p,'f_overnights').fill('4plex');await fid(p,'copyBtn').click();await fid(p,'sentBanner').waitFor({state:'visible'});
   await fid(p,'tab-visit').focus();await p.keyboard.press('End');assert.equal(await p.evaluate(()=>document.activeElement.dataset.localId),'tab-check');assert.equal(await fid(p,'tab-office').getAttribute('aria-controls'),'officeSection');
   await fid(p,'tab-office').click();await p.getByRole('button',{name:'Edit saved entry',exact:true}).click();await p.getByRole('dialog').getByLabel('Name',{exact:true}).fill('SYNTHETIC SAVED CHANGE');await p.getByRole('button',{name:'Save changes',exact:true}).click();assert.match(await p.locator('.office-patient').innerText(),/SYNTHETIC SAVED CHANGE/);await noEditor(p);
  });
 }finally{await browser.close();await new Promise(r=>server.close(r));}
 console.log(results.length+'/'+results.length+' fixed-form and compatibility checks passed.');
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});

