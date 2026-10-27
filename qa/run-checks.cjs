'use strict';
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const groups = {
  storage:['multi-patient-checks.cjs','office-checks.cjs','shift-checks.cjs','data-audit-checks.cjs','qa/shift-review-checks.cjs'],
  layout:['layout-audit-checks.cjs','browser-audit-checks.cjs','quality-audit-checks.cjs'],
  features:['improvements-checks.cjs','house-checks.cjs','antibiotic-checks.cjs','qa/message-rail-checks.cjs'],
  installed:['webapp-checks.cjs']
};
const selected = process.argv[2];
if(selected && !Object.hasOwn(groups, selected)) throw Error('Unknown check group: ' + selected);
const suites = selected ? groups[selected] : ['qa/reliability-checks.cjs', 'qa/printing-device-checks.cjs', ...Object.values(groups).flat()];
let failed = 0;
for(const suite of suites){
  console.log('\n::group::' + suite);
  const result = spawnSync(process.execPath, [suite], {cwd:root, stdio:'inherit', timeout:240000, env:process.env});
  console.log('::endgroup::');
  if(result.status !== 0){ failed++; console.error(suite + ' failed' + (result.error ? ': ' + result.error.message : '')); }
}
console.log((suites.length - failed) + '/' + suites.length + ' suites passed.');
if(failed) process.exitCode = 1;
