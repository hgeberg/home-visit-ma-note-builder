'use strict';
// Synthetic regressions for visit identity, archived work, and dialog focus.
// Run the application's real state functions with disposable DOM/storage doubles.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const sourceRoot = process.env.AUDIT_SOURCE_DIR || path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(sourceRoot, 'index.html'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function section(start, end){
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert(a >= 0 && b > a, 'Application source section missing: ' + start);
  return html.slice(a, b);
}
let passed = 0, failed = 0;
function check(name, run){
  try{ run(); passed++; console.log('PASS ' + name); }
  catch(error){ failed++; console.error('FAIL ' + name + '\n' + error.stack); }
}
class MemoryStorage {
  constructor(){ this.values = new Map(); }
  getItem(key){ return this.values.get(key) ?? null; }
  setItem(key, value){ this.values.set(key, String(value)); }
  removeItem(key){ this.values.delete(key); }
}

function dom(){
  const elements = new Map();
  const document = {
    activeElement:null,
    querySelector(selector){
      if(!elements.has(selector)) elements.set(selector, element(selector.slice(1)));
      return elements.get(selector);
    },
    createElement:() => element(),
    addEventListener(){}
  };
  function element(id = ''){
    const listeners = new Map();
    return {
      id, dataset:{}, style:{}, children:[], hidden:false, open:false, value:'', textContent:'',
      content:{firstElementChild:{cloneNode:() => element()}},
      append(...children){ this.children.push(...children); },
      replaceChildren(...children){ this.children = children; },
      after(){}, remove(){}, setAttribute(){}, scrollIntoView(){},
      querySelector:() => null, querySelectorAll:() => [],
      addEventListener(type, fn){ listeners.set(type, fn); },
      click(){ listeners.get('click')?.(); },
      focus(){ document.activeElement = this; },
      showModal(){ this.open = true; }, close(){ this.open = false; }
    };
  }
  document.querySelector('#seenSection').hidden = true;
  return {document, element};
}

function patientSource(){
  return section('function chips(str){', 'function listItems(') +
    section('function maskDob(v){', '/* ---------- default layout ---------- */') +
    section('function defaultLayout(){', '\nconst WHEN_TEXT =') +
    section('function freshMeta(){', '\nfunction loadLayout(){') +
    section('function hasContent(vals){', '\nfunction reconcileValues(') +
    section('function context(vals', '\nfunction officeSteps(') +
    section(html.includes('function messageStatus(') ? 'function messageStatus(' : 'function visitProgress(', '\nfunction setCollapsed(') +
    section('function copiedVisitSnapshot(', '\nfunction saveCopiedOffice(') +
    section('function clearVisit(', '\nfunction sentGuard(');
}

function app(local = new MemoryStorage(), session = new MemoryStorage()){
  const {document} = dom();
  const mounted = [];
  const environment = {
    console, document, Math,
    window:{localStorage:local, sessionStorage:session, addEventListener(){}, scrollTo(){}},
    setTimeout:() => 1, clearTimeout(){}
  };
  environment.mountPatient = (root, seed, page) => {
    environment.page = page;
    const patientEnvironment = {
      console, root, seed:clone(seed), page, clone, Math, Date,
      DEFAULT_BASE:12, PHARMACY_PRESETS:['Madison', 'Westgate', 'Maple', 'Refuah'],
      norm:value => String(value ?? '').trim().toLowerCase(),
      uid:prefix => prefix + Math.random().toString(36).slice(2),
      renderAll(){}, setCollapsed(){}, setTab(){}, flash(){},
      saveDraft:() => page.saveDraft()
    };
    vm.createContext(patientEnvironment);
    vm.runInContext(patientSource() + `
      let L = seed.layout || defaultLayout(), V = seed.vals || {}, M = restoreMeta(seed.meta);
      let office = [], officeBaseline = [], officeWritable = true, officeReadFailed = false;
      let pendingOfficeSync = [], preservedAnswers = seed.preservedAnswers || [], tab = 'visit', collapsed = false;
      globalThis.api = {
        root, destroyed:false,
        clear:clearVisit,
        serialize:() => ({id:root.id, vals:V, meta:M, preservedAnswers}),
        snapshot:() => ({...copiedVisitSnapshot(V, M), id:root.id}),
        visitId:() => M.visitId,
        officeId:() => M.officeId,
        getLayout:() => L,
        setLayout:value => { L = clone(value); },
        acceptsLayout:value => !!value && Array.isArray(value.sections),
        hasContent:() => hasContent(V) || !!preservedAnswers.length,
        name:() => String(V.name || '').trim(),
        progress:visitProgress,
        snapshotMessageStatus:visit => messageStatus(visit.vals, visit.meta || {}, visit.layout),
        output:() => buildOutput(V).text,
        setValues:value => { V = clone(value); },
        setMeta:value => { M = restoreMeta(value); },
        getOffice:() => ({values:office, baseline:officeBaseline, writable:officeWritable, readFailed:officeReadFailed}),
        applyOffice:(values, writable, baseline, readFailed) => {
          office = values; officeWritable = writable; officeBaseline = baseline; officeReadFailed = !!readFailed;
        },
        hasPendingOffice:() => false,
        keepPendingOffice(){}, renderOffice(){}, renderSaveState(){}, title(){}, collapse(){}, resize(){},
        showVisit(){ this.visitShown = true; },
        focus(){ this.focused = true; },
        destroy(){ this.destroyed = true; },
        offerRestore:draft => { globalThis.offeredDraft = clone(draft); }
      };`, patientEnvironment);
    patientEnvironment.api.offerRestore = draft => { environment.offeredDraft = clone(draft); };
    mounted.push(patientEnvironment.api);
    return patientEnvironment.api;
  };
  vm.createContext(environment);
  vm.runInContext(section('function createPatientPage(){', '\nlet initialized = false;') + '\ncreatePatientPage();', environment);
  return {
    page:environment.page, document, local, session,
    get offeredDraft(){ return environment.offeredDraft; },
    get patients(){ return mounted.filter(patient => !patient.destroyed); },
    get first(){ return this.patients[0]; }
  };
}

function seedVisit(patient, id = 'visit-synthetic'){
  patient.setValues({name:'SYNTHETIC PATIENT', dob:'01/01/2000', notes:'Original note'});
  patient.setMeta({visitId:id, seenAt:1000});
}

check('Office reopening preserves newer archived answers and checklist checks', () => {
  const a = app(), original = a.first;
  seedVisit(original);
  original.setValues({...original.snapshot().vals, overnights:'Blood', bloodreason:'Synthetic reason'});
  original.setMeta({...original.snapshot().meta, officeId:'v-synthetic', sentAt:1100, sentText:original.output(), sentVals:original.snapshot().vals});
  const copied = original.snapshot();
  const office = [{id:'v-synthetic', name:'SYNTHETIC PATIENT', t:1100, shift:'initial', overnights:'Blood', steps:[], visit:copied}];
  original.applyOffice(clone(office), true, clone(office), false);
  original.setValues({...original.snapshot().vals, notes:'NEWER UNCOPIED NOTE', k_pa:true, k_posted:true});
  original.clear(false);
  assert.equal(a.page.openOfficeVisit('v-synthetic'), true);
  const reopened = a.patients.find(patient => patient.visitId() === 'visit-synthetic');
  assert.equal(reopened.snapshot().vals.notes, 'NEWER UNCOPIED NOTE');
  assert.equal(reopened.snapshot().vals.k_pa, true);
  assert.equal(reopened.snapshot().vals.k_posted, true);
  assert.equal(reopened.progress().messageStatus, 'changed');
  assert.equal(a.page.seenVisits().find(entry => entry.visit.meta.visitId === 'visit-synthetic').visit.vals.notes, 'NEWER UNCOPIED NOTE');
  // Reopening again must also recognize the visit when its Office link is absent.
  reopened.setMeta({...reopened.snapshot().meta, officeId:null});
  reopened.setValues({...reopened.snapshot().vals, notes:'EDITED AFTER REOPENING'});
  assert.equal(a.page.openOfficeVisit('v-synthetic'), true);
  assert.equal(a.patients.filter(patient => patient.visitId() === 'visit-synthetic').length, 1);
  assert.equal(reopened.snapshot().vals.notes, 'EDITED AFTER REOPENING');
  a.page.saveDraft();
  const reloaded = app(a.local);
  assert(reloaded.offeredDraft, 'The reopened visit must be saved for recovery');
  reloaded.page.restore(reloaded.offeredDraft);
  const recovered = reloaded.patients.find(patient => patient.visitId() === 'visit-synthetic');
  assert.equal(recovered.snapshot().vals.notes, 'EDITED AFTER REOPENING');
  assert.equal(recovered.snapshot().vals.k_pa, true);
  assert.equal(recovered.snapshot().vals.k_posted, true);
});

for(const reuseBlankForm of [false, true]) check('Undo after reopening a cleared visit preserves newer edits' + (reuseBlankForm ? ' and another patient in the old form' : ' without duplicating the visit'), () => {
  const a = app(); seedVisit(a.first);
  a.first.clear(false);
  if(reuseBlankForm){
    seedVisit(a.first, 'visit-another');
    a.first.setValues({name:'SYNTHETIC OTHER PATIENT', notes:'KEEP OTHER PATIENT'});
  }
  a.page.openSeenVisit('visit-synthetic');
  const reopened = a.patients.find(patient => patient.visitId() === 'visit-synthetic');
  reopened.setValues({...reopened.snapshot().vals, notes:'EDITED AFTER REOPENING', k_pa:true});
  a.page.undoLast();
  assert.equal(a.patients.filter(patient => patient.visitId() === 'visit-synthetic').length, 1);
  assert.equal(reopened.snapshot().vals.notes, 'EDITED AFTER REOPENING');
  assert.equal(reopened.snapshot().vals.k_pa, true);
  assert.equal(reopened.visitShown, true);
  if(reuseBlankForm){
    assert.equal(a.first.visitId(), 'visit-another');
    assert.equal(a.first.snapshot().vals.notes, 'KEEP OTHER PATIENT');
  }
});

check('Clear-shift review includes archived uncopied visits and opens their forms', () => {
  const a = app(); seedVisit(a.first);
  a.first.clear(false);
  const item = a.page.reviewItems().find(item => item.visitId === 'visit-synthetic');
  assert(item, 'Archived uncopied visit must remain reviewable');
  assert.equal(item.archived, true);
  assert(item.reasons.includes('Not copied'));
  a.page.renderShiftReview();
  const list = a.document.querySelector('#shiftReviewList');
  const button = list.children.flatMap(li => li.children).find(node => node.dataset.reviewItem === item.id);
  assert(button, 'Archived visit must have an actionable review button');
  button.click();
  const reopened = a.patients.find(patient => patient.visitId() === 'visit-synthetic');
  assert(reopened?.visitShown, 'Review button must open the archived visit');
  assert.equal(a.page.reviewItems().filter(item => item.name === 'SYNTHETIC PATIENT').length, 1);
});

check('Archived review distinguishes changed messages, copied visits, and checklist-only visits', () => {
  const a = app(); seedVisit(a.first, 'visit-changed');
  a.first.setMeta({...a.first.snapshot().meta, sentAt:1100, sentText:a.first.output(), sentVals:a.first.snapshot().vals});
  a.first.setValues({...a.first.snapshot().vals, notes:'UNCOPIED CHANGE'});
  a.first.clear(false);
  seedVisit(a.first, 'visit-copied');
  a.first.setMeta({...a.first.snapshot().meta, sentAt:1200, sentText:a.first.output(), sentVals:a.first.snapshot().vals});
  a.first.clear(false);
  a.first.setValues({k_pa:true});
  a.first.setMeta({visitId:'visit-checklist', seenAt:1300});
  a.first.clear(false);
  const items = a.page.reviewItems();
  assert(items.some(item => item.visitId === 'visit-changed' && item.reasons.includes('Changes not copied')));
  assert(!items.some(item => item.visitId === 'visit-copied'));
  assert(!items.some(item => item.visitId === 'visit-checklist'));
});

check('Archived message review uses the saved layout rather than the current form', () => {
  const a = app(); seedVisit(a.first);
  const savedLayout = clone(a.first.getLayout());
  savedLayout.sections.flatMap(section => section.fields).find(field => field.id === 'notes').out = 'Earlier note label';
  a.first.setLayout(savedLayout);
  a.first.setMeta({...a.first.snapshot().meta, sentAt:1100, sentText:a.first.output(), sentVals:a.first.snapshot().vals});
  a.first.clear(false);
  const currentLayout = clone(savedLayout);
  currentLayout.sections.flatMap(section => section.fields).find(field => field.id === 'notes').out = 'Current note label';
  a.first.setLayout(currentLayout);
  assert(!a.page.reviewItems().some(item => item.visitId === 'visit-synthetic'), 'An unchanged copied archive must not acquire a false change warning');
});

check('The copied-edit dialog keeps focus on the newly added patient', () => {
  const elements = new Map(), buttons = [];
  let environment;
  function node(id){
    return {id, isConnected:true, open:false, append(){}, querySelector:() => buttons[0], querySelectorAll:() => [],
      addEventListener(){}, closest:() => null, focus(){ environment.document.activeElement = this; },
      showModal(){ this.open = true; }, close(){ this.open = false; }};
  }
  const oldInput = node('patient-1_f_name'), replacement = node(oldInput.id), newTitle = node('patient-2_patientTitle'), host = node('host');
  elements.set(oldInput.id, oldInput);
  environment = {
    console, V:{name:'NEXT PATIENT'}, M:{sentAt:100}, clone, fmtTime:() => '',
    lifecycle:{signal:{aborted:false}}, root:node('patient-1'),
    document:{activeElement:oldInput, body:{}, querySelector:() => null, getElementById:id => elements.get(id)},
    h:(tag, attrs) => { const el = node(attrs?.id || tag); Object.assign(el, attrs || {}); if(tag === 'button') buttons.push(el); return el; },
    $:() => host, localSelector:value => value, setTimeout:() => 1, drainSheets(){}, saveDraft(){},
    renderAll(){ oldInput.isConnected = false; elements.set(replacement.id, replacement); },
    page:{addPatient(){ newTitle.focus(); }}
  };
  vm.createContext(environment);
  vm.runInContext('let sheetOpen=false, sheetDismiss=null, sheetDialog=null, sheetReturnFocus=null, activePatientSheet=null;' +
    section('function openSheet(opts){', 'function drainSheets(){') +
    section('function sentGuard(beforeEdit){', '/* ---------- restore + layout updates ---------- */') +
    '\nfunction sheet(opts){ openSheet(opts); }\nsentGuard({name:"ORIGINAL PATIENT"});', environment);
  buttons.find(button => button.text === 'No, undo this edit and add a patient').onclick();
  assert.equal(environment.V.name, 'ORIGINAL PATIENT');
  assert.equal(environment.document.activeElement.id, newTitle.id);
});

console.log(passed + '/' + (passed + failed) + ' visit integrity checks passed.');
if(failed) process.exitCode = 1;
