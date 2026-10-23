'use strict';
// Build pre-existing saved forms for compatibility tests. The application no
// longer has controls for changing form definitions at runtime.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function defaultLayout(){
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const section = (start, end) => {
    const a = html.indexOf(start), b = html.indexOf(end, a);
    if(a < 0 || b < 0) throw Error('Default-form fixture source unavailable');
    return html.slice(a, b);
  };
  const env = {PHARMACY_PRESETS:['Madison', 'Westgate', 'Maple', 'Refuah'], DEFAULT_BASE:12};
  vm.createContext(env);
  vm.runInContext(section('function chips(str){', 'function listItems(') +
    section('function defaultLayout(){', '\nconst WHEN_TEXT =') + '\nfixture = defaultLayout();', env);
  return JSON.parse(JSON.stringify(env.fixture));
}

async function installSavedLayout(page, layout){
  await page.evaluate(layout => {
    localStorage.setItem('hvnb_current_layout', JSON.stringify(layout));
    sessionStorage.removeItem('hvnb_current_draft');
  }, layout);
  await page.reload();
}

module.exports = {defaultLayout, installSavedLayout};
