const fs = require('fs');
const http = require('http');
const assert = require('assert/strict');
const { chromium } = require('C:/Users/Hillel/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source = fs.readFileSync(require('path').join(__dirname, 'index.html'));
const server = http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(source)});
const results=[];
const fid=(scope,id)=>scope.locator('[data-local-id="'+id+'"]');
const field=(id,type='text',extra={})=>({id,type,label:'Synthetic '+id,...extra});
const layout=(fields,extra={})=>({base:12,v:4,sections:[{id:'s',tab:'visit',title:'Synthetic fields',fields}],...extra});
async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 async function fresh(){const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);return {context,page,errors};}
 async function run(name,test){const state=await fresh();try{await test(state);assert.deepEqual(state.errors,[]);results.push(name+' passed');console.log(name+' passed');}finally{await state.context.close();}}
 async function change(scope,id,value){await fid(scope,id).fill(value);await fid(scope,id).blur();}
 async function beginImport(page,value){await page.getByRole('button',{name:'Import layout',exact:true}).first().click();await page.getByRole('dialog').locator('textarea').fill(JSON.stringify(value));await page.getByRole('button',{name:'Replace my layout',exact:true}).click();}
 try{
  await run('DOB formats and calendar warning',async({page})=>{
   await fid(page,'f_name').fill('Synthetic Date');
   await fid(page,'f_dob').fill('2000-01-02');assert.equal(await fid(page,'f_dob').inputValue(),'01/02/2000');
   await fid(page,'f_dob').fill('2/29/2000');assert.equal(await fid(page,'f_dob').inputValue(),'02/29/2000');
   await fid(page,'f_dob').fill('02/29/2001');await fid(page,'copyBtn').click();
   assert.match(await page.getByRole('dialog').innerText(),/DOB: enter a valid date/);
   await page.getByRole('button',{name:'Go back',exact:true}).click();
   await fid(page,'f_dob').fill('2000.12.31');assert.equal(await fid(page,'f_dob').inputValue(),'12/31/2000');
   await fid(page,'f_polholder').fill('N/A');assert.equal(await fid(page,'f_polholder').inputValue(),'N/A');
  });
  await run('All patients migrate editor renames and clear obsolete selections',async({page})=>{
   await fid(page,'addPatientBtn').click();
   const patients=page.locator('.patient');
   for(let i=0;i<2;i++){
    const p=patients.nth(i);await fid(p,'f_name').fill('Synthetic '+i);
    await p.locator('[data-choice="exposure"][data-v="Yes"]').click();await fid(p,'f_exposureto').fill('Synthetic contact '+i);
    await p.locator('[data-item="flu"] input').check();await p.locator('[data-item="flu"] [data-r="Positive"]').click();await p.locator('[data-item="flu"] [data-s="'+(i?'B':'A')+'"]').click();
    await p.locator('[data-choice="aware"][data-v="Unaware"]').click();
   }
   const p=patients.first();await fid(p,'editBtn').click();
   await change(p,'e_opts_exposure','No, Certainly, Unknown');
   await change(p,'e_opts_aware','Aware, Not yet aware');
   await change(p,'e_tests_tests','Rapid strep, Rapid flu[X|Y], Rapid COVID, Ears (done), Urine dip (done)');
   for(let i=0;i<2;i++){
    const q=patients.nth(i),text=await fid(q,'output').inputValue();
    assert.match(text,/Exposure: Certainly, to Synthetic contact/);assert.ok(text.includes('POSITIVE ('+(i?'Y':'X')+')'));
    assert.match(text,/PATIENT NOT YET AWARE/);assert.match(await fid(q,'tagLine').innerText(),/patient unaware/);
    assert.equal(await q.locator('[data-item="flu"] [data-s][aria-checked="true"]').count(),1);
   }
   await change(p,'e_tests_tests','Rapid strep, Rapid flu[Y], Rapid COVID, Ears (done), Urine dip (done)');
   assert.ok(!(await fid(p,'output').inputValue()).includes('POSITIVE (X)'));assert.equal(await p.locator('[data-item="flu"] [data-s][aria-checked="true"]').count(),0);
   assert.match(await fid(patients.nth(1),'output').inputValue(),/POSITIVE \(Y\)/);
   await page.getByRole('button',{name:'Reset to default',exact:true}).first().click();await page.getByRole('button',{name:'Reset layout',exact:true}).click();
   for(let i=0;i<2;i++){const q=patients.nth(i),text=await fid(q,'output').inputValue();assert.ok(!text.includes('Certainly'));assert.ok(!text.includes('NOT YET AWARE'));assert.ok(!/POSITIVE \([XY]\)/.test(text));assert.match(text,new RegExp('Synthetic '+i));}
  });
  await run('Invalid imports reject before persistence',async({page})=>{
   await fid(page,'editBtn').click();
   const cases=[
    layout([field('a','choice',{opts:'yes'})]),layout([field('a'),field('a')]),
    layout([field('bad"id')]),layout([field('constructor')]),layout([field('__proto__')]),layout([field('prototype')]),
    layout([field('a','unknown')]),layout([field('a','text',{chips:'yes'})]),
    layout([field('a','choice',{opts:['Yes','Yes']})]),layout([field('a','choice',{opts:['Yes'],detail:{id:'a',on:'Yes'}})]),
    layout([field('a','tests',{items:[{id:'t',n:'Test',kind:'posneg',sub:'A'}]})]),
    layout([field('a','tests',{items:[null]})]),layout([field('a','text',{when:'unknownCondition'})]),
    layout([field('a'),{id:'mirror',type:'mirror',of:'a'}]),
    layout([field('a')],{sections:[{id:'s',tab:'visit',title:'One',fields:[]},{id:'s',tab:'check',title:'Two',fields:[]}]}),
    layout([field('a','choice',{opts:['Yes'],sub:{id:'child',on:'No',opts:['One']}})]),
    layout([field('foo_bar','tests',{items:[{id:'x',n:'One',kind:'done'}]}),field('foo','tests',{items:[{id:'bar_x',n:'Two',kind:'done'}]})])
   ];
   for(const value of cases){await beginImport(page,value);assert.match(await page.getByRole('dialog').innerText(),/doesn’t look like an exported layout/);assert.equal(await page.evaluate(()=>localStorage.getItem('hvnb_layout')),null);await page.getByRole('button',{name:'Cancel',exact:true}).click();}
  });
  await run('Stored corrupt layouts recover with visible warning',async({page})=>{
   for(const value of ['{broken',JSON.stringify(layout([field('a','choice',{opts:12})]))]){
    await page.evaluate(value=>{localStorage.setItem('hvnb_layout',value);sessionStorage.clear()},value);await page.reload();
    assert.match(await fid(page,'layoutWarning').innerText(),/saved layout could not be loaded/);assert.equal(await fid(page,'f_name').count(),1);
   }
   await fid(page,'editBtn').click();await beginImport(page,layout([field('safe')]));assert.equal(await page.getByRole('dialog').count(),0);
   assert.equal(await fid(page,'layoutWarning').count(),0);await change(page,'e_label_safe','Synthetic safe');await page.reload();assert.equal(await fid(page,'f_safe').count(),1);assert.equal(await fid(page,'layoutWarning').count(),0);
  });
  await run('Import clears incompatible values in every form and preserves isolation',async({page})=>{
   await fid(page,'addPatientBtn').click();const patients=page.locator('.patient');
   for(let i=0;i<2;i++){await fid(patients.nth(i),'f_name').fill('Synthetic '+i);await patients.nth(i).locator('[data-choice="exposure"][data-v="Yes"]').click();}
   await fid(patients.first(),'editBtn').click();
   await beginImport(page,layout([field('name'),field('exposure','choice',{opts:['Absent','Present','Unknown']})]));
   for(let i=0;i<2;i++){const out=await fid(patients.nth(i),'output').inputValue();assert.ok(!out.includes('Exposure: Yes'));assert.equal(await patients.nth(i).locator('[data-choice="exposure"][aria-checked="true"]').count(),0);assert.match(out,new RegExp('Synthetic '+i));}
  });
  await run('Export round trip and test kind edits stay valid',async({page})=>{
   await page.locator('[data-item="flu"] input').check();await page.locator('[data-item="flu"] [data-r="Positive"]').click();await page.locator('[data-item="flu"] [data-s="A"]').click();
   await fid(page,'editBtn').click();await change(page,'e_tests_tests','Rapid strep, Rapid flu (done), Rapid COVID, Ears (done), Urine dip (done)');assert.match(await fid(page,'output').inputValue(),/Rapid flu: Done/);
   await change(page,'e_tests_tests','Rapid strep, Rapid flu[A|B], Rapid COVID, Ears (done), Urine dip (done)');assert.ok(!(await fid(page,'output').inputValue()).includes('POSITIVE'));
   await page.getByRole('button',{name:'Export layout',exact:true}).click();const value=JSON.parse(await page.getByRole('dialog').locator('textarea').inputValue());await page.getByRole('button',{name:'Close',exact:true}).click();await beginImport(page,value);assert.equal(await page.getByRole('dialog').count(),0);
   await page.evaluate(()=>sessionStorage.clear());await page.reload();assert.equal(await fid(page,'layoutWarning').count(),0);assert.equal(await fid(page,'f_name').count(),1);
  });
  await run('Editor deletions and duplicate options export a valid layout',async({page})=>{
   await fid(page,'editBtn').click();
   await change(page,'e_opts_exposure','No, Unknown, No');
   assert.equal(await fid(page,'f_exposureto').count(),0);
   await change(page,'e_opts_preg','No, N/A');
   assert.equal(await page.locator('[data-sub-of="preg"]').count(),0);
   await page.locator('[data-field="exposure"] .editor').getByRole('button',{name:'Delete',exact:true}).click();
   await page.getByRole('dialog').getByRole('button',{name:'Delete',exact:true}).click();
   await page.getByRole('button',{name:'Export layout',exact:true}).click();const value=JSON.parse(await page.getByRole('dialog').locator('textarea').inputValue());await page.getByRole('button',{name:'Close',exact:true}).click();await beginImport(page,value);assert.equal(await page.getByRole('dialog').count(),0);
   await page.evaluate(()=>sessionStorage.clear());await page.reload();assert.equal(await fid(page,'layoutWarning').count(),0);assert.equal(await fid(page,'f_name').count(),1);
  });
 }finally{await browser.close();server.close();}
 console.log(JSON.stringify({passed:results.length,cases:results},null,2));
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1});
