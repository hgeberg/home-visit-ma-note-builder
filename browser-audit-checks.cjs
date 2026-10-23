const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium, launchOptions} = require('./qa/browser.cjs');

const checks = [];
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
(async () => {
  const server = http.createServer((req,res) => { res.writeHead(200,{'Content-Type':'text/html'}); res.end(fs.readFileSync(path.join(__dirname,'index.html'))); });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  try {
    const context = await browser.newContext({viewport:{width:390,height:844}});
    await context.addInitScript(() => {
      window.__copies = [];
      Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.__copies.push(text)}});
    });
    const page = await context.newPage();
    page.on('pageerror',e=>{ errors.push(e.message); console.error('BROWSER ERROR:',e.message); });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const patient = page.locator('.patient').first();
    const field = id=>patient.locator(`[data-local-id="${id}"]`);
    const activeId = ()=>page.evaluate(()=>document.activeElement.dataset.localId);
    const modal = page.locator('dialog[open][role="dialog"]');

    await field('tab-visit').focus();
    assert.equal(await patient.locator('[role="tab"][tabindex="0"]').count(),1);
    await page.keyboard.press('ArrowRight');
    assert.equal(await activeId(),'tab-check');
    assert.equal(await field('panel-check').isVisible(),true);
    await page.keyboard.press('Home');
    assert.equal(await activeId(),'tab-visit');
    assert.equal(await field('panel-visit').isVisible(),true);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await activeId(),'tab-check');
    await page.keyboard.press('ArrowRight');
    assert.equal(await activeId(),'tab-visit');
    pass('Patient tabs implement roving focus, arrows, Home and wraparound');

    const exposure = patient.locator('[data-choice="exposure"]');
    assert.equal(await exposure.locator('xpath=self::*[@tabindex="0"]').count(),1);
    await exposure.first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await patient.locator('[data-choice="exposure"][aria-checked="true"]').innerText(),'Yes');
    assert.equal(await field('f_exposureto').getAttribute('aria-label'),'Exposed to what?');
    assert.equal(await field('f_exposureto').isVisible(),true);
    await page.keyboard.press('End');
    assert.equal(await patient.locator('[data-choice="exposure"][aria-checked="true"]').innerText(),'Unknown');
    await page.keyboard.press('Home');
    assert.equal(await patient.locator('[data-choice="exposure"][aria-checked="true"]').innerText(),'No');
    pass('Choice radio groups support keyboard selection and detail inputs have labels');

    await field('t_tests_flu').check();
    await patient.locator('[data-item="flu"] [data-r="Positive"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await patient.locator('[data-item="flu"] [data-r="Negative"]').getAttribute('aria-checked'),'true');
    await page.keyboard.press('ArrowLeft');
    await patient.locator('[data-item="flu"] [data-s="A"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await patient.locator('[data-item="flu"] [data-s="B"]').getAttribute('aria-checked'),'true');
    await patient.locator('[data-choice="aware"][data-v="Aware"]').click();
    pass('Rapid-test results and positive subtypes support keyboard selection');

    await field('f_name').fill('Synthetic Browser Regression');
    await field('copyBtn').click();
    await page.waitForTimeout(60);
    assert.match(await modal.innerText(),/DOB: not entered/);
    await page.waitForTimeout(160);
    await page.screenshot({path:path.join(__dirname,'qa/fresh-dialog-mobile-fixed.png')});
    for (const key of ['Shift+Tab','Tab','Tab','Tab','Shift+Tab','Shift+Tab']) {
      await page.keyboard.press(key);
      assert.equal(await page.evaluate(()=>!!document.activeElement.closest('dialog[open]')),true,`Dialog must contain ${key} focus`);
    }
    await page.keyboard.press('Escape');
    assert.equal(await modal.count(),0);
    assert.equal(await activeId(),'copyBtn');
    pass('Copy-warning dialog traps focus and Escape restores the trigger');

    await field('f_dob').fill('01022000');
    await field('f_inspic').check();
    await field('f_overnights').fill('4plex');
    await field('copyBtn').click();
    await field('sentBanner').waitFor({state:'visible'});
    await field('f_notes').fill('Synthetic edited note');
    await page.waitForTimeout(60);
    assert.match(await modal.innerText(),/already copied/);
    await page.keyboard.press('Escape');
    assert.equal(await modal.count(),1);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(()=>!!document.activeElement.closest('dialog[open]')),true);
    await page.getByRole('button',{name:'Same patient, keep editing',exact:true}).click();
    assert.equal(await activeId(),'f_notes');
    pass('Copied-visit guard remains modal and restores the edited field');

    await field('addPatientBtn').click();
    const second = page.locator('.patient').nth(1);
    await second.locator('[data-local-id="f_name"]').fill('Second Synthetic Patient');
    await page.evaluate(()=>{
      const patients = document.querySelectorAll('.patient');
      patients[0].querySelector('[data-local-id="newBtn"]').click();
      patients[1].querySelector('[data-local-id="newBtn"]').click();
    });
    assert.equal(await modal.count(),1);
    await modal.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal(await modal.count(),1);
    await modal.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal(await modal.count(),0);
    pass('Sheets from multiple patients display sequentially without modal stacking');

    await page.locator('#view-office').click();
    await page.getByRole('button',{name:'Edit saved entry',exact:true}).click();
    await page.locator('[data-local-id="sheet_name"]').fill('S'.repeat(160));
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Edit saved entry');
    for (const width of [320,390]) {
      await page.setViewportSize({width,height:844});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Office must fit ${width}px`);
    }
    await page.screenshot({path:path.join(__dirname,'qa/fresh-office-mobile-fixed.png'),fullPage:true});
    pass('Saved long patient identifiers do not overflow 320px or 390px viewports');
    await page.getByRole('button',{name:'Remove',exact:true}).click();
    await modal.getByRole('button',{name:'Remove',exact:true}).click();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'officeHeading');
    pass('Office Save restores its replacement action and Remove focuses Office heading');

    await page.locator('#view-patients').click();
    await field('tab-visit').focus();
    await page.keyboard.press('End');
    assert.equal(await activeId(),'tab-check');
    assert.equal(await field('panel-check').isVisible(),true);
    assert.equal(await field('tab-office').getAttribute('aria-controls'),'officeSection');
    assert.equal(await patient.locator('[data-local-id="editBtn"], .editor, .builder').count(),0);
    await field('tab-visit').click();
    pass('Patient keyboard tabs stay separate from Office navigation with no layout editor');

    await page.locator('#clearShiftBtn').click();
    await second.locator('[data-local-id="newBtn"]').evaluate(button=>button.click());
    assert.equal(await modal.count(),0);
    await page.locator('#clearShiftDialog').getByRole('button',{name:'Cancel',exact:true}).click();
    await modal.waitFor({state:'visible'});
    await modal.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal(await modal.count(),0);
    pass('Patient sheet queue waits for the native Clear shift dialog to close');

    const fallbackContext = await browser.newContext({viewport:{width:320,height:700}});
    await fallbackContext.addInitScript(()=>{
      Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.reject(new Error('Synthetic clipboard denial'))}});
      document.execCommand = ()=>false;
    });
    const fallback = await fallbackContext.newPage();
    fallback.on('pageerror',e=>errors.push(e.message));
    await fallback.goto(`http://127.0.0.1:${server.address().port}`);
    await fallback.locator('[data-local-id="f_name"]').fill('Manual Copy Synthetic');
    await fallback.locator('[data-local-id="f_dob"]').fill('01022000');
    await fallback.locator('[data-local-id="f_inspic"]').check();
    await fallback.locator('[data-local-id="f_overnights"]').fill('4plex');
    await fallback.locator('[data-local-id="copyBtn"]').click();
    await fallback.waitForTimeout(100);
    assert.match(await fallback.locator('dialog[open][role="dialog"]').innerText(),/Copy it by hand/);
    assert.equal(await fallback.locator('dialog[open] textarea').evaluate(el=>el.selectionEnd-el.selectionStart===el.value.length),true);
    await fallback.keyboard.press('Escape');
    assert.equal(await fallback.locator('[data-local-id="copyBtn"]').isEnabled(),true);
    await fallback.locator('#view-office').click();
    assert.equal(await fallback.locator('.office-patient').count(),0);
    await fallback.locator('#view-patients').click();
    await fallback.locator('[data-local-id="copyBtn"]').click();
    await fallback.getByRole('button',{name:'I copied it',exact:true}).click();
    await fallback.locator('#view-office').click();
    assert.equal(await fallback.locator('.office-patient').count(),1);
    await fallbackContext.close();
    pass('Manual-copy dialog selection, Escape/copy-lock release, and confirmation work');

    assert.deepEqual(errors,[]);
    pass('All exercised browser workflows complete without page errors');
    await context.close();
    console.log(`${checks.length} browser audit checks passed.`);
  } finally {
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{ console.error(error); process.exitCode=1; });
