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
      id, dataset:{}, style:{}, children:[], hidden:false, open:false, value:'', textContent:'', isConnected:true,
      content:{firstElementChild:{cloneNode:() => element()}},
      append(...children){ this.children.push(...children); },
      replaceChildren(...children){ this.children = children; },
      after(){}, remove(){ this.isConnected = false; }, setAttribute(){}, scrollIntoView(){},
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
  const {document, element} = dom();
  const mounted = [];
  const environment = {
    console, document, Math,
    window:{localStorage:local, sessionStorage:session, addEventListener(){}, scrollTo(){}},
    setTimeout:() => 1, clearTimeout(){}, scheduleMessageViewport(){}
  };
  environment.mountPatient = (root, seed, page) => {
    environment.page = page;
    const heading = element(root.id + '_patientTitle');
    root.querySelector = selector => selector === '[data-local-id="patientTitle"]' ? heading : null;
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
        officeIncomplete:() => office.filter(entry => entry.completed !== true).map(entry => ({id:entry.id, name:entry.name})),
        hasPendingOffice:() => false,
        keepPendingOffice(){ return () => {}; }, renderOffice(){}, renderSaveState(){}, title(){}, collapse(){}, resize(){},
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

check('Deleting an uncopied household patient removes its live form and archived visit, not the other patient', () => {
  const a = app(), keep = a.first;
  seedVisit(keep, 'visit-keep');
  const cancel = a.page.addPatient(keep.root, {vals:{name:'SYNTHETIC PATIENT', notes:'Canceled'}, meta:{visitId:'visit-cancel'}}, false);
  a.page.archiveVisit(cancel.snapshot());
  a.page.saveDraft();
  const original = clone(JSON.parse(a.local.getItem('hvnb_current_app_draft')).patients[0]);
  assert.equal(a.page.removePatient(cancel.root), true);
  assert.equal(cancel.destroyed, true);
  assert.equal(cancel.root.isConnected, false);
  assert.equal(a.patients.length, 1);
  assert.equal(a.page.canRemovePatient(keep.root), false);
  assert.equal(a.page.seenVisits().length, 1);
  for(const [storage, key] of [[a.local,'hvnb_current_app_draft'], [a.session,'hvnb_current_draft']]){
    const saved = JSON.parse(storage.getItem(key));
    assert.deepEqual(saved.patients, [original]);
    assert.equal(saved.seenVisits, undefined);
  }
});

check('Removing a copied household patient keeps the complete latest visit and its Office record', () => {
  const a = app(), copied = a.first;
  seedVisit(copied, 'visit-copied');
  copied.setMeta({...copied.snapshot().meta, sentAt:1100, sentText:copied.output(), sentVals:copied.snapshot().vals, officeId:'office-copied'});
  const office = [{id:'office-copied', name:'SYNTHETIC PATIENT', shift:'initial', steps:[], visit:copied.snapshot()}];
  copied.applyOffice(clone(office), true, clone(office), false);
  a.local.setItem('hvnb_current_office', JSON.stringify(office));
  copied.setValues({...copied.snapshot().vals, notes:'Newest synthetic answers'});
  const keep = a.page.addPatient(copied.root, {vals:{name:'SYNTHETIC REMAINING'}, meta:{visitId:'visit-remaining'}}, false);
  assert.equal(a.page.removalKeepsVisit(copied.root), true);
  assert.equal(a.page.removePatient(copied.root), true);
  assert.equal(a.first, keep);
  const saved = JSON.parse(a.local.getItem('hvnb_current_app_draft'));
  assert.equal(saved.seenVisits[0].meta.visitId, 'visit-copied');
  assert.equal(saved.seenVisits[0].vals.notes, 'Newest synthetic answers');
  assert.deepEqual(JSON.parse(a.local.getItem('hvnb_current_office')), clone(office));
  assert.equal(a.page.seenVisits().length, 2);
});

check('A failed reduced-draft write refuses an individual patient deletion without changing either recovery copy', () => {
  const a = app(), keep = a.first;
  seedVisit(keep, 'visit-keep');
  const cancel = a.page.addPatient(keep.root, {vals:{name:'SYNTHETIC CANCELED'}, meta:{visitId:'visit-cancel'}}, false);
  const device = a.local.getItem('hvnb_current_app_draft'), session = a.session.getItem('hvnb_current_draft');
  const write = a.local.setItem.bind(a.local);
  a.local.setItem = (key, value) => { if(key === 'hvnb_current_app_draft') throw Error('Synthetic quota failure'); write(key, value); };
  assert.equal(a.page.removePatient(cancel.root), false);
  assert.equal(cancel.destroyed, false);
  assert.equal(a.patients.length, 2);
  assert.equal(a.local.getItem('hvnb_current_app_draft'), device);
  assert.equal(a.session.getItem('hvnb_current_draft'), session);
  a.local.setItem = write;
  assert.equal(a.page.removePatient(cancel.root), true);
});

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

check('Copied rapid tests that are still running stay visible in the shift review and Patients Seen', () => {
  const a = app(), patient = a.first;
  seedVisit(patient, 'visit-running');
  const values = {...patient.snapshot().vals, tests:{flu:{on:true, r:'running'}, strep:{on:true, r:'Negative'}}};
  patient.setValues(values);
  patient.setMeta({...patient.snapshot().meta, sentAt:1100, sentText:patient.output(), sentVals:values});
  const reviewItem = () => a.page.reviewItems().find(item => item.name === 'SYNTHETIC PATIENT');
  assert.deepEqual(Array.from(reviewItem().reasons), ['Rapid flu running']);
  patient.clear(false);
  assert.equal(reviewItem().archived, true);
  assert.deepEqual(Array.from(reviewItem().reasons), ['Rapid flu running']);
  a.page.showSeen();
  const card = a.document.querySelector('#seenList').children[0];
  assert(card.children.some(child => child.textContent === 'Rapid flu running'));
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
    console, V:{name:'NEXT PATIENT'}, M:{sentAt:100,recentFields:['f_weight','f_name']}, clone, fmtTime:() => '',
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
    section('function sentGuard(', '/* ---------- restore + layout updates ---------- */') +
    '\nfunction sheet(opts){ openSheet(opts); }\nsentGuard({name:"ORIGINAL PATIENT"}, ["f_weight"]);', environment);
  buttons.find(button => button.text === 'No, undo this edit and add a patient').onclick();
  assert.equal(environment.V.name, 'ORIGINAL PATIENT');
  assert.equal(Array.from(environment.M.recentFields).join(','), 'f_weight');
  assert.equal(environment.document.activeElement.id, newTitle.id);
});

check('Clear-shift review groups Incomplete Office patients into one entry that opens Office', () => {
  const a = app();
  const office = [
    {id:'office-open', name:'SYNTHETIC OPEN LABS', shift:'initial', overnights:'RPP', steps:[]},
    {id:'office-unnamed', name:'', shift:'initial', overnights:'RPP', steps:[]},
    {id:'office-done', name:'SYNTHETIC DONE LABS', shift:'initial', overnights:'RPP', steps:[], completed:true}
  ];
  a.first.applyOffice(clone(office), true, clone(office), false);
  const items = a.page.reviewItems().filter(item => item.officeIncomplete);
  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'Office: 2 patients still Incomplete');
  assert.equal(items[0].detail, 'SYNTHETIC OPEN LABS, Name not entered');
  assert.deepEqual(Array.from(items[0].reasons), ['Clearing the shift removes these Office entries']);
  a.page.renderShiftReview();
  const button = a.document.querySelector('#shiftReviewList').children.flatMap(li => li.children).find(node => node.dataset.reviewItem === 'office-incomplete');
  a.page.showPatients();
  assert.equal(a.document.querySelector('#officeSection').hidden, true);
  button.click();
  assert.equal(a.document.querySelector('#officeSection').hidden, false, 'The entry opens the Office list');
  office.forEach(entry => { entry.completed = true; });
  a.first.applyOffice(clone(office), true, clone(office), false);
  assert.equal(a.page.reviewItems().some(item => item.officeIncomplete), false);
});

check('Office entries name one shared layout: stored once, read by another window, and never without a usable form', () => {
  const key = 'hvnb_current_office_layouts';
  const a = app(), layout = clone(a.first.getLayout());
  const id = a.page.officeLayoutId(layout);
  assert.equal(a.page.officeLayoutId(clone(layout)), id, 'The same layout keeps its id');
  const changed = clone(layout); changed.sections[0].title += ' (synthetic change)';
  const changedId = a.page.officeLayoutId(changed);
  assert.notEqual(changedId, id);
  assert.equal(a.local.getItem(key), null, 'Naming a layout stores nothing by itself');
  a.page.saveOfficeLayouts([{id:'office-a', visit:{layoutId:id}}, {id:'office-b', visit:{layoutId:id}}, {id:'office-own', visit:{layout}}, {id:'office-older'}]);
  assert.deepEqual(JSON.parse(a.local.getItem(key)), {[id]:layout}, 'Only layouts that entries name are stored, once each');
  const stored = a.local.getItem(key);
  a.page.saveOfficeLayouts([{id:'office-a', visit:{layoutId:id}}]);
  assert.equal(a.local.getItem(key), stored, 'A stored layout is not written again');

  const b = app(a.local);
  assert.deepEqual(clone(b.page.officeLayout(id)), layout, 'Another window reads the stored layout');
  assert.equal(b.page.officeLayoutId(clone(layout)), id, 'and names the same layout by the stored id');
  const write = a.local.setItem.bind(a.local);
  a.local.setItem = (name, value) => { if(name === key) throw Error('Synthetic quota failure'); write(name, value); };
  assert.throws(() => a.page.saveOfficeLayouts([{id:'office-c', visit:{layoutId:changedId}}]), /Synthetic quota failure/, 'A failed layout write fails the Office save that asked for it');
  a.local.setItem = write;
  a.page.saveOfficeLayouts([{id:'office-c', visit:{layoutId:changedId}}]);
  assert.deepEqual(JSON.parse(a.local.getItem(key)), {[id]:layout, [changedId]:changed});
  assert.deepEqual(clone(b.page.officeLayout(changedId)), changed, 'A layout stored later is found without reloading');

  const visit = {version:1, vals:{name:'SYNTHETIC PATIENT'}, meta:{visitId:'visit-shared', officeId:'office-a'}, layoutId:changedId};
  b.first.applyOffice([{id:'office-a', name:'SYNTHETIC PATIENT', shift:'initial', overnights:'RPP', steps:[], visit:clone(visit)}], true, [], false);
  const saved = clone(b.page.savedOfficeVisit('office-a'));
  assert.deepEqual(saved.layout, changed, 'A saved visit opens with the layout it was copied with');
  assert.equal(saved.layoutId, undefined);
  assert.deepEqual(clone(b.page.officeVisitLayout({layout})), layout, 'An entry from an earlier version keeps its own layout');
  assert.deepEqual(clone(b.page.officeVisitLayout({layoutId:'layout-synthetic-lost'})), clone(b.first.getLayout()), 'A lost layout falls back to the current form');
  assert.equal(b.page.officeVisitLayout({}), null, 'An entry saved without a form stays unavailable');
  b.page.keepOfficeVisits();
  const kept = b.page.seenVisits().find(entry => entry.visit.meta.visitId === 'visit-shared');
  assert.deepEqual(clone(kept.visit.layout), changed, 'Patients Seen keeps the visit with its layout');
  assert.equal(kept.visit.layoutId, undefined);
});

console.log(passed + '/' + (passed + failed) + ' visit integrity checks passed.');
if(failed) process.exitCode = 1;
