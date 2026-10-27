/* Server-backed printing access checks. API responses and PINs are synthetic. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium, launchOptions} = require('./browser.cjs');
const root = path.resolve(__dirname, '..');
const api = 'https://premier-printing-pin-trial.hgeberg.chatgpt.site';
const syntheticPin = '135790';
const dummyInstructions = 'Dummy requisition instructions delivered by the server.\n1. Open the synthetic sample file.\n2. Print the sample requisition.\n<strong>This stays literal text.</strong>\nNo office credentials or patient information.';
const tests = [];
const test = (name, run) => tests.push({name, run});
const pin = page => page.locator('#officePrintingPin');
const stars = page => page.locator('#officePrintingStars');
const details = page => page.locator('#officePrintingTools');
const instructions = page => page.locator('#officePrintingInstructions');
const status = page => page.locator('#officePrintingStatus');
const error = page => page.locator('#officePrintingError');
const submitButton = page => page.locator('#officePrintingForm button[type="submit"]');
const focused = (page, id) => page.evaluate(expected => document.activeElement?.id === expected, id);
const deferred = () => {let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve};};
const locked = async page => {
  assert.equal(await instructions(page).isVisible(), false, 'Instructions stay hidden while locked');
  assert.ok(await instructions(page).evaluate(el => !el.textContent && !el.children.length), 'Locked content is empty');
};
const noStoredSecrets = async page => {
  const values = await page.evaluate(() => [localStorage, sessionStorage].flatMap(store => Object.keys(store).map(key => store.getItem(key) || '')));
  assert.ok(values.every(value => value !== syntheticPin && !value.includes(JSON.stringify(syntheticPin)) && !value.includes(dummyInstructions)), 'Browser storage contains no printing PIN or instructions');
};

async function mockApi(page) {
  const mock = {failures:0, lockedUntil:null, posts:[], gets:0, errorStatus:null, abort:false, deferred:null, entered:null};
  const view = () => {
    if (mock.lockedUntil && mock.lockedUntil <= Date.now()) {mock.lockedUntil = null; mock.failures = 0;}
    return {mode:'live', attemptsRemaining:mock.lockedUntil ? 0 : 2 - mock.failures, lockedUntil:mock.lockedUntil, cooldownSeconds:mock.lockedUntil ? Math.ceil((mock.lockedUntil - Date.now()) / 1000) : 0};
  };
  const fulfill = (route, code, body) => route.fulfill({status:code, contentType:'application/json', headers:{'Cache-Control':'no-store', 'Access-Control-Allow-Origin':route.request().headers().origin || '*'}, body:JSON.stringify(body)});
  await page.route(api + '/api/pin/**', async route => {
    const request = route.request(), endpoint = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') return route.fulfill({status:204, headers:{'Access-Control-Allow-Origin':request.headers().origin || '*', 'Access-Control-Allow-Methods':'GET, POST, OPTIONS', 'Access-Control-Allow-Headers':'content-type'}});
    if (endpoint === '/api/pin/status') {mock.gets++; return fulfill(route, 200, view());}
    if (endpoint !== '/api/pin/unlock' || request.method() !== 'POST') return fulfill(route, 404, {error:'not_found'});
    mock.posts.push({body:request.postDataJSON(), url:request.url(), headers:request.headers()});
    if (mock.deferred) {mock.entered?.resolve(); await mock.deferred.promise;}
    if (mock.abort) return route.abort('failed');
    if (mock.errorStatus) return fulfill(route, mock.errorStatus, {...view(), error:'unavailable', message:'Verification is unavailable.', instructions:dummyInstructions});
    const state = view();
    if (state.lockedUntil) return fulfill(route, 429, {...state, error:'cooldown', message:'Too many attempts. Try again after the cooldown.'});
    if (mock.posts.at(-1).body.pin === syntheticPin) {mock.failures = 0; return fulfill(route, 200, {...view(), instructions:dummyInstructions});}
    mock.failures++;
    if (mock.failures >= 2) mock.lockedUntil = Date.now() + 15 * 60 * 1000;
    return fulfill(route, mock.lockedUntil ? 429 : 401, {...view(), error:mock.lockedUntil ? 'cooldown' : 'invalid_pin', message:mock.lockedUntil ? 'Too many attempts. Try again after the cooldown.' : 'Incorrect printing PIN.'});
  });
  return mock;
}
async function openTools(page, ready = true) {
  if (!(await details(page).evaluate(el => el.open))) await details(page).locator('summary').click();
  await pin(page).waitFor({state:'visible'});
  if (ready) await page.waitForFunction(() => {
    const button = document.querySelector('#officePrintingForm button[type="submit"]');
    return button && !button.disabled && /2.*attempt/i.test(document.getElementById('officePrintingStatus').textContent);
  });
}
async function submit(page, value = syntheticPin) {await pin(page).fill(value); await pin(page).press('Enter');}
async function unlock(page) {await submit(page); await instructions(page).waitFor({state:'visible'});}
async function settledError(page) {
  await error(page).waitFor({state:'visible'});
  await page.waitForFunction(() => !document.querySelector('#officePrintingForm button[type="submit"]').disabled);
}

// This is the security boundary: public files cannot contain an offline unlocker.
test('public source contains no encrypted payload or browser-side decryption fallback', async () => {
  const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(!/const\s+encrypted\s*=/.test(source), 'Public encrypted instruction payload is removed');
  assert.ok(!/subtle\s*\.\s*decrypt\s*\(/.test(source), 'Instructions cannot be decrypted offline by the public app');
});

test('Office tools starts collapsed and visible digits replace ten stars one at a time', async ({page, mock}) => {
  assert.equal(await details(page).evaluate(el => el.open), false);
  await locked(page);
  await openTools(page);
  assert.equal(await pin(page).getAttribute('type'), 'text');
  assert.equal(await pin(page).getAttribute('maxlength'), '10');
  assert.equal(await pin(page).getAttribute('inputmode'), 'numeric');
  assert.equal(await stars(page).textContent(), '*'.repeat(10));
  await pin(page).pressSequentially('1');
  assert.equal(await stars(page).textContent(), ' ' + '*'.repeat(9));
  await pin(page).pressSequentially('2');
  assert.equal(await stars(page).textContent(), '  ' + '*'.repeat(8));
  await pin(page).press('Backspace');
  assert.equal(await stars(page).textContent(), ' ' + '*'.repeat(9));
  await pin(page).fill('');
  await pin(page).pressSequentially('1'.repeat(11));
  assert.equal((await pin(page).inputValue()).length, 10);
  assert.equal((await stars(page).textContent()).trim(), '');
  await pin(page).fill('');
  await pin(page).press('Enter');
  await error(page).waitFor({state:'visible'});
  assert.equal(mock.posts.length, 0, 'Empty entry does not consume a server attempt');
  const admin = page.locator('a[href="' + api + '/admin"]');
  assert.equal(await admin.count(), 1, 'Owner settings link points to the Sites backend');
});

test('only a successful server response reveals literal text and Lock and reload clear it', async ({page, mock}) => {
  await openTools(page);
  await noStoredSecrets(page);
  await unlock(page);
  assert.equal(await instructions(page).innerText(), dummyInstructions);
  assert.equal(await instructions(page).locator('strong, script').count(), 0, 'Server content is rendered as text');
  assert.equal(await focused(page, 'officePrintingInstructions'), true);
  assert.equal(await pin(page).inputValue(), '');
  assert.equal(mock.posts.length, 1);
  assert.deepEqual(Object.keys(mock.posts[0].body).sort(), ['deviceId', 'pin'], 'Request sends the printing PIN and browser identifier only');
  assert.equal(mock.posts[0].body.pin, syntheticPin);
  assert.match(mock.posts[0].body.deviceId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(await page.locator('#officePrintingDevice').innerText(), 'Device ' + mock.posts[0].body.deviceId.replace(/-/g, '').slice(0,8).toUpperCase());
  assert.equal(new URL(mock.posts[0].url).search, '', 'No PIN is placed in a URL');
  assert.equal(mock.posts[0].headers.cookie, undefined, 'Public unlock request does not include cookies');
  await noStoredSecrets(page);
  await page.locator('#officePrintingLock').click();
  await locked(page);
  assert.equal(await stars(page).textContent(), '*'.repeat(10));
  assert.equal(await focused(page, 'officePrintingPin'), true);
  await unlock(page);
  await page.reload();
  await page.locator('#view-office').click();
  await locked(page);
  assert.equal(await details(page).evaluate(el => el.open), false);
  assert.equal(await pin(page).inputValue(), '');
  await noStoredSecrets(page);
});

test('two failures show a fifteen-minute server cooldown that survives reload', async ({page, mock}) => {
  await openTools(page);
  await submit(page, '0');
  await page.waitForFunction(() => /^1 .*attempt/i.test(document.getElementById('officePrintingStatus').textContent));
  await settledError(page);
  await submit(page, '0');
  await page.waitForFunction(() => document.getElementById('officePrintingPin').disabled && document.getElementById('officePrintingStatus').textContent.startsWith('Try again in'));
  assert.equal(await submitButton(page).isDisabled(), true);
  const countdown = (await status(page).innerText()).match(/Try again in (\d+):(\d{2})/);
  assert.ok(countdown && Number(countdown[1]) * 60 + Number(countdown[2]) >= 890);
  assert.equal(mock.posts.length, 2);
  const lockedUntil = mock.lockedUntil;
  await page.reload();
  await page.locator('#view-office').click();
  await openTools(page, false);
  await page.waitForFunction(() => document.getElementById('officePrintingPin').disabled && document.getElementById('officePrintingStatus').textContent.startsWith('Try again in'));
  assert.equal(mock.lockedUntil, lockedUntil, 'Reload cannot clear the mock server lock');
  await locked(page);
});

test('forbidden, unavailable and failed-network responses never reveal instructions or use a fallback', async ({page, mock}) => {
  await openTools(page);
  for (const code of [403, 503]) {
    mock.errorStatus = code;
    await submit(page);
    await error(page).waitFor({state:'visible'});
    assert.equal(await submitButton(page).isDisabled(), true, 'Unavailable verification fails closed');
    assert.equal(await page.locator('#officePrintingRetry').isVisible(), true, 'Connection retry is available');
    await locked(page);
    await noStoredSecrets(page);
    const getsBefore = mock.gets;
    await page.locator('#officePrintingRetry').click();
    await page.waitForFunction(() => !document.querySelector('#officePrintingForm button[type="submit"]').disabled);
    assert.ok(mock.gets > getsBefore, 'Retry checks current server metadata before re-enabling entry');
  }
  mock.errorStatus = null;
  mock.abort = true;
  await submit(page);
  await error(page).waitFor({state:'visible'});
  assert.equal(await submitButton(page).isDisabled(), true, 'A failed network request leaves verification disabled');
  assert.equal(await page.locator('#officePrintingRetry').isVisible(), true);
  await locked(page);
  await noStoredSecrets(page);
  assert.equal(mock.posts.length, 3, 'Each attempt contacted the server rather than unlocking locally');
});

test('closing Office tools invalidates an in-flight success and reopening remains locked', async ({page, mock}) => {
  await openTools(page);
  mock.deferred = deferred(); mock.entered = deferred();
  await submit(page);
  await mock.entered.promise;
  await locked(page);
  await details(page).locator('summary').click();
  assert.equal(await details(page).evaluate(el => el.open), false);
  mock.deferred.resolve();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await openTools(page);
  await locked(page);
  assert.equal(await pin(page).inputValue(), '');
  await noStoredSecrets(page);
});

test('PIN entry and returned instructions fit 320px and desktop screens', async ({page}) => {
  await openTools(page);
  for (const width of [1280, 320]) {
    await page.setViewportSize({width, height:1000});
    await pin(page).fill('12');
    const fits = await page.evaluate(() => {
      const input = document.getElementById('officePrintingPin').getBoundingClientRect();
      const stars = document.getElementById('officePrintingStars').getBoundingClientRect();
      return document.documentElement.scrollWidth <= innerWidth && input.left >= 0 && input.right <= innerWidth && stars.left >= input.left && stars.right <= input.right;
    });
    assert.ok(fits, 'Ten PIN positions fit width ' + width);
    await page.locator('.office-printing-pin').screenshot({path:path.join(root, 'qa', `printing-entry-${width}.png`)});
  }
  await unlock(page);
  for (const width of [1280, 320]) {
    await page.setViewportSize({width, height:1000});
    const fits = await page.evaluate(() => {
      const card = document.querySelector('.office-printing').getBoundingClientRect();
      return document.documentElement.scrollWidth <= innerWidth && card.left >= 0 && card.right <= innerWidth;
    });
    assert.ok(fits, 'Returned instructions fit width ' + width);
    assert.equal(await page.locator('#officePrintingLock').isVisible(), true);
  }
});

(async () => {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {response.writeHead(404); response.end(); return;}
    const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.png') ? 'image/png' : file.endsWith('.webmanifest') ? 'application/manifest+json' : 'application/octet-stream';
    response.writeHead(200, {'Content-Type':type, 'Cache-Control':'no-store'});
    response.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port + '/';
  let browser, failed = 0;
  try {
    browser = await chromium.launch(launchOptions);
    for (const entry of tests) {
      const context = await browser.newContext({viewport:{width:1280, height:1000}, serviceWorkers:'block'}), errors = [];
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      page.on('pageerror', () => errors.push(true));
      const mock = await mockApi(page);
      try {
        await page.goto(origin);
        await page.locator('.patient').first().waitFor();
        await page.locator('#view-office').click();
        await entry.run({page, mock});
        assert.equal(errors.length, 0, 'No printing JavaScript errors');
        console.log('PASS ' + entry.name);
      } catch (error) {
        failed++;
        console.error('FAIL ' + entry.name + '\n' + (error.stack || error));
      } finally {await context.close();}
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log((tests.length - failed) + '/' + tests.length + ' server-backed printing checks passed.');
  if (failed) process.exitCode = 1;
})().catch(error => {console.error(error); process.exitCode = 1;});
