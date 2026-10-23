/* Recent-antibiotics workflow: isolated browser profiles and synthetic history. */
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium, launchOptions} = require('./qa/browser.cjs');
const {defaultLayout, installSavedLayout} = require('./qa/form-fixtures.cjs');
const tests=[],test=(name,run)=>tests.push({name,run});
const patient=(p,n=0)=>p.locator('.patient').nth(n);
const field=(p,id,n=0)=>patient(p,n).locator('[data-local-id="'+id+'"]');
const choice=(p,value,n=0)=>patient(p,n).locator('[data-choice="abx"][data-v="'+value+'"]');
const output=(p,n=0)=>field(p,'output',n).inputValue();
const restore=p=>p.getByRole('button',{name:/^Restore (this visit|all)/}).click();
async function flush(p){await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));return p.evaluate(()=>JSON.parse(sessionStorage.getItem('hvnb_current_draft')));}
async function seed(p,n=0){await field(p,'f_name',n).fill('SYNTHETIC ANTIBIOTIC '+n);await field(p,'f_dob',n).fill('01/01/2000');await field(p,'f_inspic',n).check();}

test('Yes reveals which and when with four shortcuts; No hides and excludes retained details',async p=>{
  await seed(p);
  assert.equal(await patient(p).locator('[data-field="abx"] [role="radio"]').count(),2);
  assert.equal(await field(p,'f_abx_name').isVisible(),false);assert.equal(await field(p,'f_abx_when').isVisible(),false);
  await choice(p,'Yes').click();
  assert.equal(await field(p,'f_abx_name').isVisible(),true);assert.equal(await field(p,'f_abx_when').isVisible(),true);
  assert.equal(await p.evaluate(()=>document.activeElement.matches('input,textarea')),false);
  for(const name of ['Amoxicillin','Penicillin V','Cephalexin','Zpack']){
    await patient(p).locator('[data-field="abx_name"]').getByRole('button',{name,exact:true}).click();
    assert.equal(await field(p,'f_abx_name').inputValue(),name);
    assert.match(await output(p),new RegExp('Recent antibiotics: '+name));
    assert.equal(await p.evaluate(()=>document.activeElement.matches('input,textarea')),false);
  }
  await field(p,'f_abx_when').fill('Finished October 10, 2026');
  await choice(p,'No').click();assert.match(await output(p),/Recent antibiotics: No/);
  assert.doesNotMatch(await output(p),/Zpack|When taken|Recent antibiotic:/);
  assert.equal(await field(p,'f_abx_name').isVisible(),false);assert.equal(await field(p,'f_abx_when').isVisible(),false);
  await choice(p,'Yes').click();assert.equal(await field(p,'f_abx_name').inputValue(),'Zpack');
  assert.equal(await field(p,'f_abx_when').inputValue(),'Finished October 10, 2026');
  await p.reload();await restore(p);assert.match(await output(p),/Recent antibiotics: Zpack, Finished October 10, 2026/);
  assert.doesNotMatch(await output(p),/Recent antibiotics: Yes|\nRecent antibiotic:|\nWhen taken:/);
});

test('Custom antibiotic text and dates copy exactly; missing Yes details prompt before copying',async p=>{
  await seed(p);await choice(p,'Yes').click();await field(p,'copyBtn').click();
  assert.match(await p.locator('dialog[open]').innerText(),/Recent antibiotic: not entered/);
  assert.match(await p.locator('dialog[open]').innerText(),/When taken: not entered/);
  await p.getByRole('button',{name:'Go back',exact:true}).click();
  await field(p,'f_abx_name').fill('Other antibiotic, patient-reported');await field(p,'f_abx_when').fill('About 3 weeks ago');
  await field(p,'copyBtn').click();await field(p,'sentBanner').waitFor({state:'visible'});
  const copied=await p.evaluate(()=>window.copied);
  assert.deepEqual(copied.split('\n').filter(line=>line.startsWith('Recent antibiotics:')),['Recent antibiotics: Other antibiotic, patient-reported, About 3 weeks ago']);
  assert.doesNotMatch(copied,/Recent antibiotics: Yes|\nRecent antibiotic:|\nWhen taken:/);
});

test('Antibiotic histories remain separate across patients, houses and draft recovery',async p=>{
  await seed(p);await choice(p,'Yes').click();await field(p,'f_abx_name').fill('Amoxicillin');await field(p,'f_abx_when').fill('Last month');
  await p.locator('#appendPatient').click();await seed(p,1);await choice(p,'No',1).click();
  await p.locator('#newHouseBtn').click();await seed(p,2);await choice(p,'Yes',2).click();await field(p,'f_abx_name',2).fill('Cephalexin');await field(p,'f_abx_when',2).fill('Last week');
  await p.reload();await restore(p);assert.match(await output(p,2),/Cephalexin/);assert.doesNotMatch(await output(p,2),/Amoxicillin/);
  await p.locator('#patientNavSummary').click();await p.locator('#patientJumps').getByRole('button',{name:'1. SYNTHETIC ANTIBIOTIC 0',exact:true}).click();
  assert.match(await output(p),/Amoxicillin/);assert.doesNotMatch(await output(p),/Cephalexin/);
  assert.match(await output(p,1),/Recent antibiotics: No/);assert.equal(await field(p,'f_abx_name',1).isVisible(),false);
});

test('Old drafts preserve free text without inferring Yes and retain explicit No or None answers',async(p,c,url)=>{
  await seed(p);const saved=await flush(p),layout=saved.layout;
  delete layout.recentAntibioticsVersion;
  for(const section of layout.sections){section.fields=section.fields.filter(f=>!['abx_name','abx_when'].includes(f.id));const abx=section.fields.find(f=>f.id==='abx');if(abx){delete abx.yesValue;Object.assign(abx,{type:'text',chips:[{v:'No',m:'fill'},{v:'None',m:'fill'}]});}}
  const old={version:3,t:Date.now(),layout,patients:['No','None','Amoxicillin finished last week','Unknown'].map((abx,i)=>({vals:{name:'SYNTHETIC LEGACY '+i,abx},layout}))};
  const q=await c.newPage();await q.addInitScript(value=>{if(!sessionStorage.getItem('hvnb_current_draft'))sessionStorage.setItem('hvnb_current_draft',JSON.stringify(value));},old);
  await q.goto(url);await restore(q);
  for(const n of [0,1])assert.equal(await choice(q,'No',n).getAttribute('aria-checked'),'true');
  for(const n of [2,3]){
    assert.equal(await choice(q,'Yes',n).getAttribute('aria-checked'),'false');
    await patient(q,n).locator('.preserved-answers summary').click();
    assert.match(await patient(q,n).locator('.preserved-answers').innerText(),new RegExp(old.patients[n].vals.abx));
    await choice(q,'Yes',n).click();assert.equal(await field(q,'f_abx_name',n).inputValue(),old.patients[n].vals.abx);
  }
  await q.reload();await restore(q);assert.equal(await field(q,'f_abx_name',2).inputValue(),'Amoxicillin finished last week');
  assert.equal(await patient(q,2).locator('.preserved-answers li').count(),1);
});

test('Saved layouts gain the workflow without removing unrelated customization',async(p,c,url)=>{
  await seed(p);const layout=(await flush(p)).layout;delete layout.recentAntibioticsVersion;
  for(const section of layout.sections){section.fields=section.fields.filter(f=>!['abx_name','abx_when'].includes(f.id));const abx=section.fields.find(f=>f.id==='abx');if(abx){delete abx.yesValue;Object.assign(abx,{type:'text',chips:[{v:'No',m:'fill'},{v:'None',m:'fill'}]});}}
  layout.sections[0].title='SYNTHETIC CUSTOM SECTION';
  const q=await c.newPage();await q.goto(url);await q.evaluate(value=>localStorage.setItem('hvnb_current_layout',JSON.stringify(value)),layout);await q.reload();
  assert.equal(await choice(q,'Yes').count(),1);assert.equal(await q.getByRole('heading',{name:'SYNTHETIC CUSTOM SECTION',exact:true}).count(),1);
  await choice(q,'Yes').click();await field(q,'f_abx_name').fill('Custom history medicine');await field(q,'f_abx_when').fill('Last week');await flush(q);
  await q.reload();await restore(q);assert.equal(await field(q,'f_abx_name').inputValue(),'Custom history medicine');
  assert.equal(await q.getByRole('heading',{name:'SYNTHETIC CUSTOM SECTION',exact:true}).count(),1);
});

test('Conditional fields and buttons fit mobile and desktop widths',async p=>{
  await seed(p);await choice(p,'Yes').click();fs.mkdirSync('qa/antibiotics',{recursive:true});
  for(const width of [320,390,1280]){
    await p.setViewportSize({width,height:1000});await patient(p).locator('[data-field="abx"]').scrollIntoViewIfNeeded();
    const allergies=await patient(p).locator('[data-field="allergies"]').boundingBox();
    const antibiotics=await patient(p).locator('[data-field="abx"]').boundingBox();
    const symptoms=await patient(p).locator('[data-field="symptoms"]').boundingBox();
    assert.ok(antibiotics.y>=allergies.y+allergies.height,'Antibiotics starts below the allergies row');
    assert.ok(Math.abs(antibiotics.width-symptoms.width)<1,'Antibiotics spans the full form row');
    const size=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width,JSON.stringify(size));
    await p.screenshot({path:'qa/antibiotics/'+width+'.png'});
  }
});

test('A previously saved renamed affirmative choice retains history and missing-detail warnings',async p=>{
 const layout=defaultLayout(),abx=layout.sections.flatMap(s=>s.fields).find(f=>f.id==='abx');abx.opts=['No','Taken'];abx.yesValue='Taken';await installSavedLayout(p,layout);
 await seed(p);await choice(p,'Taken').click();await field(p,'f_abx_name').fill('SYNTHETIC SAVED HISTORY');await field(p,'f_abx_when').fill('Last week');
 assert.equal(await field(p,'f_abx_name').isVisible(),true);assert.match(await output(p),/SYNTHETIC SAVED HISTORY, Last week/);
 await field(p,'f_abx_name').fill('');await field(p,'f_abx_when').fill('');await field(p,'copyBtn').click();assert.match(await p.locator('dialog[open]').innerText(),/Recent antibiotic: not entered/);assert.match(await p.locator('dialog[open]').innerText(),/When taken: not entered/);
 await p.getByRole('button',{name:'Go back',exact:true}).click();await flush(p);await p.reload();await restore(p);
 assert.equal(await choice(p,'Taken').getAttribute('aria-checked'),'true');assert.equal(await field(p,'f_abx_name').isVisible(),true);
});

test('Legacy saved binary choices gain their meaning while invalid saved semantics fall back safely',async p=>{
 const layout=defaultLayout(),abx=layout.sections.flatMap(s=>s.fields).find(f=>f.id==='abx');abx.opts=['No','Taken'];delete abx.yesValue;await installSavedLayout(p,layout);
 await choice(p,'Taken').click();assert.equal(await field(p,'f_abx_name').isVisible(),true);
 abx.yesValue='Removed option';await installSavedLayout(p,layout);
 assert.match(await field(p,'layoutWarning').innerText(),/saved layout could not be loaded/);assert.equal(await choice(p,'Yes').count(),1);
 assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('hvnb_current_layout')).sections.flatMap(s=>s.fields).find(f=>f.id==='abx').yesValue),'Removed option');
});

(async()=>{
 const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync('index.html'));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/';
 const browser=await chromium.launch(launchOptions);let failed=0;
 const selected=tests.filter(t=>!process.env.TEST_FILTER||t.name.includes(process.env.TEST_FILTER));
 try{for(const t of selected){const c=await browser.newContext({serviceWorkers:'block'}),errors=[];
  c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await c.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:text=>{window.copied=text;return Promise.resolve();}}}));
  const p=await c.newPage();p.setDefaultTimeout(10000);
  try{await p.goto(url);await t.run(p,c,url);assert.deepEqual(errors,[]);console.log('PASS '+t.name);}catch(e){failed++;console.error('FAIL '+t.name+'\n'+e.stack);}finally{await c.close();}
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
 console.log((selected.length-failed)+'/'+selected.length+' antibiotic checks passed.');if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
