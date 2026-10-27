/* Printing controller checks run with disposable DOM, clock, fetch and storage doubles. */
'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {randomUUID, webcrypto} = require('node:crypto');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const source = html.slice(html.lastIndexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
const deviceKey = 'hvnb_current_printing_device_v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const syntheticPin = '135790';
const dummyInstructions = 'Synthetic printing instructions. No real office credentials.';
const deferred = () => {let resolve, reject; const promise = new Promise((done, fail) => {resolve = done; reject = fail;}); return {promise, resolve, reject};};
const reply = (body, status = 200) => ({ok:status >= 200 && status < 300, status, json:async () => JSON.parse(JSON.stringify(body))});

class MemoryStorage {
  constructor(entries = []) {this.values = new Map(entries);}
  getItem(key) {return this.values.get(key) ?? null;}
  setItem(key, value) {this.values.set(key, String(value));}
}

function harness(options = {}) {
  const local = options.storage || new MemoryStorage();
  const nodes = new Map(), documentEvents = new Map(), windowEvents = new Map(), timers = new Map();
  const clock = {now:1700000000000};
  let timerId = 0, focused = null;
  function listen(events, type, callback) {if (!events.has(type)) events.set(type, []); events.get(type).push(callback);}
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {id, hidden:false, disabled:false, open:false, textContent:'', value:'', children:[],
      events:new Map(), attributes:new Map(), addEventListener(type, callback) {listen(this.events, type, callback);},
      setAttribute(name, value) {this.attributes.set(name, String(value));}, removeAttribute(name) {this.attributes.delete(name);},
      replaceChildren() {this.textContent = ''; this.children = [];}, focus() {if (!this.disabled) focused = id;},
      querySelector(selector) {assert.equal(selector, 'button[type="submit"]'); return node('printingSubmit');}});
    return nodes.get(id);
  }
  node('officePrintingInstructions').hidden = true;
  node('officePrintingLockRow').hidden = true;
  node('officePrintingRetry').hidden = true;
  const document = {visibilityState:'visible', getElementById:node,
    addEventListener(type, callback) {listen(documentEvents, type, callback);}};
  const availableCrypto = options.crypto === undefined ? {randomUUID, getRandomValues:value => webcrypto.getRandomValues(value)} : options.crypto;
  const window = {crypto:availableCrypto, addEventListener(type, callback) {listen(windowEvents, type, callback);}};
  const server = {
    status:() => reply({attemptsRemaining:2, lockedUntil:null}),
    unlock:() => reply({attemptsRemaining:2, lockedUntil:null, instructions:dummyInstructions}),
  };
  const calls = [];
  const fetch = async (url, init) => {
    const call = {url:new URL(url), method:init.method, body:init.body ? JSON.parse(init.body) : undefined, signal:init.signal};
    calls.push(call);
    return server[call.method === 'POST' ? 'unlock' : 'status'](call);
  };
  const addTimer = (callback, delay, interval) => {const id = ++timerId; timers.set(id, {callback, delay, interval, due:clock.now + delay}); return id;};
  const context = {window, document, localStorage:local, fetch, AbortController, Uint8Array, encodeURIComponent,
    Date:class extends Date {static now() {return clock.now;}},
    setTimeout:(callback, delay) => addTimer(callback, delay, false), clearTimeout:id => timers.delete(id),
    setInterval:(callback, delay) => addTimer(callback, delay, true), clearInterval:id => timers.delete(id)};
  vm.createContext(context);
  vm.runInContext(source, context, {filename:'printing-controller.js'});
  const flush = async () => {for (let index = 0; index < 16; index++) await Promise.resolve();};
  const emit = async (events, type, event = {}) => {await Promise.all((events.get(type) || []).map(callback => callback({preventDefault() {}, ...event}))); await flush();};
  const api = {node, local, clock, server, calls, timers, flush, get focused() {return focused;},
    async open() {node('officePrintingTools').open = true; await emit(node('officePrintingTools').events, 'toggle');},
    async close() {node('officePrintingTools').open = false; await emit(node('officePrintingTools').events, 'toggle');},
    async submit(value = syntheticPin) {node('officePrintingPin').value = value; return emit(node('officePrintingForm').events, 'submit');},
    async refresh() {await emit(node('officePrintingRetry').events, 'click');},
    async lock() {await emit(node('officePrintingLock').events, 'click');},
    async visibility(value) {document.visibilityState = value; await emit(documentEvents, 'visibilitychange');},
    async office(hidden) {node('officeSection').hidden = hidden; await emit(node(hidden ? 'view-patients' : 'view-office').events, 'click');},
    async pagehide() {await emit(windowEvents, 'pagehide');},
    async pageshow() {await emit(windowEvents, 'pageshow', {persisted:true});},
    async advance(milliseconds) {
      const target = clock.now + milliseconds;
      while (true) {
        const next = [...timers.entries()].filter(([, timer]) => timer.due <= target).sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
        if (!next) break;
        const [id, timer] = next;
        clock.now = timer.due;
        if (timer.interval) timer.due += timer.delay; else timers.delete(id);
        timer.callback(); await flush();
      }
      clock.now = target; await flush();
    },
  };
  return api;
}

test('one UUIDv4 persists only in the printing key and is sent consistently with a short Device code', async () => {
  const local = new MemoryStorage([['unrelated', 'kept']]), h = harness({storage:local});
  const id = local.getItem(deviceKey);
  assert.match(id, uuid);
  assert.equal(h.node('officePrintingDevice').textContent, 'Device ' + id.replace(/-/g, '').slice(0, 8).toUpperCase());
  await h.open(); await h.submit();
  assert.equal(h.calls[0].url.searchParams.get('device'), id);
  assert.deepEqual(h.calls[1].body, {pin:syntheticPin, deviceId:id});
  assert.equal(h.calls[1].url.search, '');
  assert.deepEqual([...local.values.keys()].sort(), [deviceKey, 'unrelated'].sort());
  assert.equal(local.getItem('unrelated'), 'kept');
  assert.ok([...local.values.values()].every(value => value !== syntheticPin && !value.includes(dummyInstructions)));
  const reopened = harness({storage:local});
  await reopened.open();
  assert.equal(reopened.calls[0].url.searchParams.get('device'), id);
});

test('invalid saved identifiers are replaced, and separate browser stores receive different IDs', () => {
  const local = new MemoryStorage([[deviceKey, 'invalid-browser-identity']]);
  harness({storage:local});
  assert.match(local.getItem(deviceKey), uuid);
  const another = harness();
  assert.notEqual(another.local.getItem(deviceKey), local.getItem(deviceKey));
});

test('getRandomValues produces RFCv4 IDs and blocked storage keeps one ID in page memory', async () => {
  const storage = {getItem() {throw Error('blocked');}, setItem() {throw Error('blocked');}};
  const h = harness({storage, crypto:{getRandomValues:value => webcrypto.getRandomValues(value)}});
  await h.open(); await h.submit(); await h.lock(); await h.refresh();
  const ids = h.calls.map(call => call.body?.deviceId || call.url.searchParams.get('device'));
  assert.match(ids[0], uuid);
  assert.ok(ids.every(id => id === ids[0]));
  assert.match(h.node('officePrintingDevice').textContent, /^Device [0-9A-F]{8}$/);
});

test('without crypto or a saved ID the original status and PIN calls still work', async () => {
  const h = harness({crypto:{}});
  await h.open(); await h.submit();
  assert.equal(h.calls[0].url.search, '');
  assert.deepEqual(h.calls[1].body, {pin:syntheticPin});
  assert.equal(h.local.values.size, 0);
  assert.equal(h.node('officePrintingDevice').textContent, 'Browser tracking unavailable.');
  assert.equal(h.node('officePrintingInstructions').textContent, dummyInstructions);
});

test('visible cooldown polls at fifteen seconds and an owner reset unlocks entry without a PIN retry', async () => {
  const h = harness();
  let reset = false;
  h.server.status = () => reply({attemptsRemaining:reset ? 2 : 0, lockedUntil:reset ? null : h.clock.now + 900000});
  await h.open();
  assert.equal(h.node('officePrintingPin').disabled, true);
  assert.equal(h.node('officePrintingRetry').hidden, false);
  await h.advance(14999);
  assert.equal(h.calls.length, 1);
  reset = true;
  await h.advance(1);
  assert.equal(h.calls.length, 2);
  assert.equal(h.node('officePrintingPin').disabled, false);
  assert.equal(h.node('printingSubmit').disabled, false);
  assert.equal(h.node('officePrintingInstructions').textContent, '');
  await h.advance(45000);
  assert.equal(h.calls.length, 2);
  assert.ok(h.calls.every(call => call.method === 'GET'));
});

test('polling and countdown stop when hidden, outside Office, closed or navigating away, then refresh on return', async () => {
  const h = harness();
  h.server.status = () => reply({attemptsRemaining:0, lockedUntil:h.clock.now + 900000});
  await h.open();
  assert.ok(h.timers.size > 0);
  await h.visibility('hidden');
  assert.equal(h.timers.size, 0);
  await h.advance(30000);
  assert.equal(h.calls.length, 1);
  await h.visibility('visible');
  assert.equal(h.calls.length, 2);
  await h.office(true);
  assert.equal(h.timers.size, 0);
  await h.advance(30000);
  assert.equal(h.calls.length, 2);
  await h.office(false);
  assert.equal(h.calls.length, 3);
  await h.close();
  assert.equal(h.timers.size, 0);
  await h.open();
  await h.pagehide();
  assert.equal(h.timers.size, 0);
  assert.equal(h.node('officePrintingTools').open, false);
  await h.pageshow();
  assert.equal(h.node('officePrintingInstructions').textContent, '');
});

test('manual access refresh picks up a reset during cooldown and polling does not overlap a request', async () => {
  const h = harness();
  let reset = false;
  h.server.status = () => reply({attemptsRemaining:reset ? 2 : 0, lockedUntil:reset ? null : h.clock.now + 900000});
  await h.open(); reset = true; await h.refresh();
  assert.equal(h.node('officePrintingPin').disabled, false);
  reset = false; await h.refresh();
  const waiting = deferred();
  h.server.status = () => waiting.promise;
  await h.advance(15000);
  const calls = h.calls.length;
  await h.advance(15000);
  assert.equal(h.calls.length, calls, 'An in-flight status request prevents overlapping polls');
  waiting.resolve(reply({attemptsRemaining:2, lockedUntil:null}));
  await h.flush();
  assert.equal(h.node('printingSubmit').disabled, false);
});

test('closing tools invalidates a delayed poll so it cannot restore access or timers', async () => {
  const h = harness(), waiting = deferred();
  h.server.status = () => reply({attemptsRemaining:0, lockedUntil:h.clock.now + 900000});
  await h.open(); h.server.status = () => waiting.promise;
  await h.advance(15000);
  const poll = h.calls.at(-1);
  await h.close();
  assert.equal(poll.signal.aborted, true);
  waiting.resolve(reply({attemptsRemaining:2, lockedUntil:null}));
  await h.flush();
  assert.equal(h.timers.size, 0);
  assert.equal(h.node('officePrintingInstructions').textContent, '');
  assert.equal(h.node('officePrintingPin').disabled, true);
});

test('a transient failed poll preserves the known cooldown and later notices the owner reset', async () => {
  const h = harness();
  h.server.status = () => reply({attemptsRemaining:0, lockedUntil:h.clock.now + 900000});
  await h.open();
  h.server.status = () => {throw Error('temporary network failure');};
  await h.advance(15000);
  assert.equal(h.node('printingSubmit').disabled, true);
  assert.equal(h.node('officePrintingRetry').textContent, 'Retry connection');
  h.server.status = () => reply({attemptsRemaining:2, lockedUntil:null});
  await h.advance(15000);
  assert.equal(h.node('printingSubmit').disabled, false);
  assert.equal(h.calls.length, 3);
  assert.ok(h.calls.every(call => call.method === 'GET'));
});

test('a stale status cannot override a newer submission, and failed status refresh stays closed', async () => {
  const h = harness(), waiting = deferred();
  await h.open();
  h.server.status = () => waiting.promise;
  const statusRequest = h.refresh();
  await h.flush();
  h.server.unlock = () => reply({attemptsRemaining:0, lockedUntil:h.clock.now + 900000}, 429);
  await h.submit();
  waiting.resolve(reply({attemptsRemaining:2, lockedUntil:null}));
  await statusRequest;
  assert.equal(h.node('officePrintingPin').disabled, true);
  assert.equal(h.node('officePrintingInstructions').textContent, '');
  h.server.status = () => {throw Error('network unavailable');};
  await h.refresh();
  assert.equal(h.node('printingSubmit').disabled, true);
  assert.equal(h.node('officePrintingRetry').hidden, false);
  assert.equal(h.node('officePrintingInstructions').textContent, '');
  assert.equal(h.calls.filter(call => call.method === 'POST').length, 1);
});

test('invalid server allowance is rejected instead of enabling PIN entry', async () => {
  const h = harness();
  h.server.status = () => reply({attemptsRemaining:3, lockedUntil:null});
  await h.open();
  assert.equal(h.node('printingSubmit').disabled, true);
  assert.equal(h.node('officePrintingInstructions').textContent, '');
});
