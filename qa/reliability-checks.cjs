'use strict';
// Deterministic recovery and service-worker regressions with synthetic state.
// Actual application functions run with disposable storage/DOM doubles.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path');
const sourceRoot=process.env.AUDIT_SOURCE_DIR || path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(sourceRoot,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(sourceRoot,'sw.js'),'utf8');
const results=[];
function section(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert(a>=0&&b>a);return html.slice(a,b);}
function check(name,run){return Promise.resolve().then(run).then(detail=>{results.push({name,status:'PASS',detail});console.log('PASS '+name+(detail===undefined?'':' '+JSON.stringify(detail)));}).catch(e=>{results.push({name,status:'FAIL',error:e.stack});console.error('FAIL '+name+' '+e.stack);process.exitCode=1;});}
class MemoryStorage{constructor(){this.m=new Map();}getItem(k){return this.m.has(k)?this.m.get(k):null;}setItem(k,v){this.m.set(k,String(v));}removeItem(k){this.m.delete(k);}}
const cloned=x=>JSON.parse(JSON.stringify(x));
const createPageSource=section('function createPatientPage(){','\nlet initialized = false;');
function app(local,session,clock,installed=true){
 const elements=new Map();
 function element(id=''){return {id,hidden:false,dataset:{},style:{},open:false,textContent:'',content:{firstElementChild:{cloneNode:()=>element()}},append(){},after(){},replaceChildren(){},querySelectorAll:()=>[],addEventListener(){},setAttribute(){},focus(){},scrollIntoView(){},showModal(){this.open=true;},close(){this.open=false;}};}
 const doc={querySelector(sel){if(!elements.has(sel))elements.set(sel,element(sel));return elements.get(sel);},createElement:()=>element(),addEventListener(){}};
 const env={document:doc,navigator:{standalone:installed},window:{localStorage:local,sessionStorage:session,matchMedia:()=>({matches:installed}),addEventListener(){},scrollTo(){}},setTimeout:()=>1,clearTimeout(){},console,Date:class extends Date{static now(){return clock.now;}},Math};
 env.mountPatient=(root,seed,page)=>{
   env.page=page;const vals=cloned(seed.vals||{}),layout=cloned(seed.layout||{v:4,sections:[]});
   let office={values:[],writable:true,baseline:[],readFailed:false};
   const p={root,vals,serialize:()=>({vals:cloned(vals),meta:seed.meta||{},preservedAnswers:[]}),getOffice:()=>office,hasPendingOffice:()=>false,hasContent:()=>Object.values(vals).some(Boolean),name:()=>vals.name||'',title(){},renderSaveState(){},getLayout:()=>layout,acceptsLayout:()=>true,offerRestore:(d,alternative)=>{env.offered=cloned(d);env.alternative=alternative ? cloned(alternative) : null;},destroy(){},collapse(){},resize(){},focus(){},applyOffice:(values,writable,baseline,readFailed)=>{office={values,writable,baseline,readFailed};},keepPendingOffice(){},renderOffice(){},flushLayout(){}};
   env.lastPatient=p;return p;
 };
 vm.createContext(env);vm.runInContext(createPageSource+'\ncreatePatientPage();',env);return env;
}
function abxEnv(){
 const env={DEFAULT_BASE:12,PHARMACY_PRESETS:['Madison','Westgate','Maple','Refuah'],norm:s=>String(s??'').trim().toLowerCase(),TABS:['visit','check','office'],console};
 vm.createContext(env);
 const code=section('function defaultLayout(){','\nconst WHEN_TEXT =')+section('function reconcileValues(','\nfunction pruneValues(')+section('function context(vals){','\nfunction officeSteps(')+section('function normalizeLayout(){','\nfunction saveLayout(');
 vm.runInContext('let L; let V={}; let M={}; let preservedAnswers=[];'+section('function chips(str){','\nfunction chipsText(')+'\n'+code+"\nfunction secsOf(t){return L.sections.filter(s=>s.tab===t)}; function fieldById(id){return L.sections.flatMap(s=>s.fields).find(f=>f.id===id)}; function validDob(){return true}; L=defaultLayout(); normalizeLayout(); globalThis.probe={layout:L,buildOutput,reconcileValues,context,normalizeLayout,migrateRecentAntibioticValues,getPreserved:()=>preservedAnswers};",env);
 return env.probe;
}
function worker(fetchImpl){
 const listeners={},buckets=new Map(),events={};let skipped=false;
 const cacheAPI={async open(name){if(!buckets.has(name))buckets.set(name,new Map());const map=buckets.get(name);return {async put(url,r){map.set(String(url),await r.clone().text());},async match(url){const v=map.get(String(url));return v===undefined?undefined:new Response(v,{headers:{'content-type':'text/html'}});}};},async match(url,opts={}){const names=opts.cacheName?[opts.cacheName]:[...buckets.keys()];for(const n of names){const hit=await (await this.open(n)).match(url);if(hit)return hit;}},async keys(){return [...buckets.keys()];},async delete(n){return buckets.delete(n);}};
 const env={URL,Response,Request,AbortController,console,caches:cacheAPI,fetch:(...args)=>fetchImpl(...args),setTimeout:fn=>{events.abort=fn;return 1;},clearTimeout(){},self:{location:{href:'https://example.test/app/sw.js'},addEventListener:(t,fn)=>listeners[t]=fn,skipWaiting:async()=>{skipped=true;},clients:{claim:async()=>{}}}};
 vm.createContext(env);vm.runInContext(sw,env);
 return {listeners,buckets,caches:cacheAPI,events,get skipped(){return skipped;},async install(){let p;listeners.install({waitUntil:x=>p=x});return p;},async navigate(){let p;listeners.fetch({request:{url:'https://example.test/app/',method:'GET',mode:'navigate'},respondWith:x=>p=x});return p;}};
}

const release='v8.25';
const cacheKey='hvnb-shell-/app/-'+release;
const shell=version=>'<meta name="note-builder-app" content="shell"><meta name="note-builder-version" content="'+version+'">';
(async()=>{
 await check('A stale installed window stays blocked after reload and retains both recovery choices',()=>{
  const local=new MemoryStorage(),sa=new MemoryStorage(),sb=new MemoryStorage(),clock={now:1000};
  let a=app(local,sa,clock);a.lastPatient.vals.name='SYNTHETIC';a.lastPatient.vals.notes='Original';a.page.saveDraft();
  clock.now=2000;const b=app(local,sb,clock);b.page.restore(b.offered);b.lastPatient.vals.notes='NEWER WORK FROM B';b.page.saveDraft();
  clock.now=3000;a.page.saveDraft();assert.equal(a.document.querySelector('#draftWarning').hidden,false);
  clock.now=4000;a=app(local,sa,clock);assert.equal(a.offered.patients[0].vals.notes,'Original');assert.equal(a.alternative.patients[0].vals.notes,'NEWER WORK FROM B');a.page.restore(a.offered);
  assert.equal(a.lastPatient.vals.notes,'Original');assert.equal(JSON.parse(local.getItem('hvnb_current_app_draft')).patients[0].vals.notes,'NEWER WORK FROM B');assert.equal(a.document.querySelector('#draftWarning').hidden,false);
  clock.now=5000;a=app(local,sa,clock);a.page.restore(a.offered);assert.equal(JSON.parse(local.getItem('hvnb_current_app_draft')).patients[0].vals.notes,'NEWER WORK FROM B');
  a.page.restore(a.alternative);assert.equal(a.lastPatient.vals.notes,'NEWER WORK FROM B');assert.equal(a.document.querySelector('#draftWarning').hidden,true);
 });
 await check('A transient durable failure can still recover newer session work and retry saving',()=>{
  const local=new MemoryStorage(),session=new MemoryStorage(),clock={now:1000};let a=app(local,session,clock);a.lastPatient.vals.name='SYNTHETIC';a.page.saveDraft();
  const write=local.setItem.bind(local);local.setItem=(k,v)=>{if(k==='hvnb_current_app_draft')throw Error('Synthetic quota');write(k,v);};
  clock.now=2000;a.lastPatient.vals.notes='UNSAVED NEWER SESSION';a.page.saveDraft();assert.equal(a.document.querySelector('#draftWarning').hidden,false);local.setItem=write;
  clock.now=3000;a=app(local,session,clock);assert.equal(a.alternative,null);a.page.restore(a.offered);assert.equal(JSON.parse(local.getItem('hvnb_current_app_draft')).patients[0].vals.notes,'UNSAVED NEWER SESSION');assert.equal(a.document.querySelector('#draftWarning').hidden,true);
 });
 await check('Legacy divergent session drafts cannot replace an existing device recovery copy',()=>{
  const local=new MemoryStorage(),session=new MemoryStorage(),clock={now:3000};
  const state=notes=>({version:3,t:notes==='DEVICE'?1000:2000,layout:{v:4,sections:[]},patients:[{vals:{name:'SYNTHETIC',notes}}]});
  local.setItem('hvnb_current_app_draft',JSON.stringify(state('DEVICE')));session.setItem('hvnb_current_draft',JSON.stringify(state('WINDOW')));
  const a=app(local,session,clock);assert(a.alternative);a.page.restore(a.offered);assert.equal(JSON.parse(local.getItem('hvnb_current_app_draft')).patients[0].vals.notes,'DEVICE');
 });
 await check('Renamed affirmative choices keep antibiotic detail visibility, output and warnings',()=>{
  const p=abxEnv(),f=p.layout.sections.flatMap(s=>s.fields).find(f=>f.id==='abx');f.opts=['No','Taken'];f.yesValue='Taken';
  const v=p.reconcileValues({name:'SYNTHETIC',dob:'01/01/2000',abx:'Yes',abx_name:'SYNTHETIC HISTORY',abx_when:'Last week'},p.layout,{choices:[{id:'abx',from:'Yes',to:'Taken'}]});
  assert.equal(p.context(v).recentAntibiotics,true);assert(p.buildOutput(v).text.includes('SYNTHETIC HISTORY, Last week'));
  assert.equal(p.buildOutput({...v,abx_name:'',abx_when:''}).issues.length,2);
  assert(!p.buildOutput({...v,abx:'No'}).text.includes('SYNTHETIC HISTORY'));
 });
 await check('Old binary antibiotic imports gain a semantic affirmative value',()=>{
  const p=abxEnv(),f=p.layout.sections.flatMap(s=>s.fields).find(f=>f.id==='abx');f.opts=['No','Taken'];delete f.yesValue;p.normalizeLayout();assert.equal(f.yesValue,'Taken');assert.equal(p.context({abx:'Taken'}).recentAntibiotics,true);
 });
 await check('Legacy antibiotic free text remains preserved without inferring an affirmative answer',()=>{
  const p=abxEnv(),v={abx:'Amoxicillin last week'};p.migrateRecentAntibioticValues(v,true);assert.equal(v.abx_name,'Amoxicillin last week');assert(!v.abx);assert.equal(p.getPreserved().length,1);
 });
 await check('An older HTML release cannot install into the new worker cache',async()=>{
  const w=worker(async url=>new Response(String(url).endsWith('index.html')?shell('v8.24'):'asset',{headers:{'content-type':'text/html'}}));
  await assert.rejects(w.install());assert.equal(w.skipped,false);assert.equal(w.buckets.size,0);
 });
 await check('Matching release installs and activation removes only older app caches',async()=>{
  const w=worker(async url=>new Response(String(url).endsWith('index.html')?shell(release):'asset',{headers:{'content-type':'text/html'}}));
  await w.caches.open('hvnb-shell-/app/-v8.24');await w.caches.open('unrelated-cache');await w.install();assert(w.skipped);assert.equal(w.buckets.get(cacheKey).size,5);
  let pending;w.listeners.activate({waitUntil:p=>pending=p});await pending;assert(!w.buckets.has('hvnb-shell-/app/-v8.24'));assert(w.buckets.has('unrelated-cache'));
 });
 await check('A newer online release remains readable without contaminating the older release cache',async()=>{
  const w=worker(async()=>new Response(shell('v8.26'),{headers:{'content-type':'text/html'}}));
  await(await w.caches.open(cacheKey)).put('https://example.test/app/index.html',new Response(shell(release)));
  assert.equal(await(await w.navigate()).text(),shell('v8.26'));assert.equal(w.buckets.get(cacheKey).get('https://example.test/app/index.html'),shell(release));
 });
 await check('A timeout after HTML headers falls back to the saved app body',async()=>{
  const w=worker(async(request,options)=>new Response(new ReadableStream({start(controller){options.signal.addEventListener('abort',()=>controller.error(new DOMException('Synthetic timeout','AbortError')));}}),{headers:{'content-type':'text/html'}}));
  await(await w.caches.open(cacheKey)).put('https://example.test/app/index.html',new Response(shell(release)));
  const pending=w.navigate();await Promise.resolve();w.events.abort();assert.equal(await(await pending).text(),shell(release));
 });
 await check('Cache-write quota failures still return a readable online app',async()=>{
  const w=worker(async()=>new Response(shell(release),{headers:{'content-type':'text/html'}}));w.caches.open=async()=>({put:async()=>{throw Error('Synthetic quota');}});assert.equal(await(await w.navigate()).text(),shell(release));
 });
 await check('Durable failures stay visible even when session saving succeeds',()=>{
  const local=new MemoryStorage(),session=new MemoryStorage(),clock={now:1000};const a=app(local,session,clock);const write=local.setItem.bind(local);local.setItem=(k,v)=>{if(k==='hvnb_current_app_draft')throw Error('Synthetic quota');write(k,v);};a.lastPatient.vals.name='SYNTHETIC';a.page.saveDraft();assert(session.getItem('hvnb_current_draft'));assert.equal(a.document.querySelector('#draftWarning').hidden,false);
 });
 await check('Installed recovery survives three days while ordinary tabs remain session-only',()=>{
  const local=new MemoryStorage(),session=new MemoryStorage(),clock={now:1000};let a=app(local,session,clock);a.lastPatient.vals.name='SYNTHETIC';a.page.saveDraft();clock.now+=3*24*60*60*1000;a=app(local,new MemoryStorage(),clock);assert.equal(a.offered.patients[0].vals.name,'SYNTHETIC');
  const ordinary=new MemoryStorage(),tabSession=new MemoryStorage();a=app(ordinary,tabSession,clock,false);a.lastPatient.vals.name='SYNTHETIC';a.page.saveDraft();assert.equal(ordinary.getItem('hvnb_current_app_draft'),null);clock.now+=9*60*60*1000;a=app(ordinary,tabSession,clock,false);assert.equal(a.offered,undefined);
 });
 await check('Clear shift removes both recovery copies and unblocks the next shift',()=>{
  const local=new MemoryStorage(),session=new MemoryStorage(),clock={now:1000};const a=app(local,session,clock);a.lastPatient.vals.name='SYNTHETIC';a.page.saveDraft();a.page.clearShift();assert.equal(local.getItem('hvnb_current_app_draft'),null);assert.equal(session.getItem('hvnb_current_draft'),null);a.lastPatient.vals.name='NEXT SHIFT';a.page.saveDraft();assert.equal(JSON.parse(local.getItem('hvnb_current_app_draft')).patients[0].vals.name,'NEXT SHIFT');
 });
 await check('Inline scripts, service worker and regression scripts parse',()=>{
  const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!/\bsrc\s*=/.test(m[1]));scripts.forEach((m,i)=>new vm.Script(m[2],{filename:'index-inline-'+i}));new vm.Script(sw,{filename:'sw.js'});
 });
 console.log(results.filter(r=>r.status==='PASS').length+'/'+results.length+' reliability checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
