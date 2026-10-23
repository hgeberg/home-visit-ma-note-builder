'use strict';
// Use a normal Playwright install, an explicit override, or the existing runtime.
const path = require('node:path');
const os = require('node:os');
const candidates = process.env.PLAYWRIGHT_MODULE ? [process.env.PLAYWRIGHT_MODULE] : [
  'playwright',
  ...(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? [path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright')] : []),
  path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
];
let playwright;
for(const candidate of candidates){
  try{ playwright = require(candidate); break; }
  catch(error){ if(error.code !== 'MODULE_NOT_FOUND') throw error; }
}
if(!playwright) throw Error('Install Playwright or set PLAYWRIGHT_MODULE to its module path.');
const launchOptions = {headless:true};
if(process.env.PLAYWRIGHT_CHROME) launchOptions.executablePath = process.env.PLAYWRIGHT_CHROME;
const isolate = async context => {
  // Synthetic visits must not contribute to the live website's analytics.
  await context.route(/^https:\/\/(?:www\.)?(?:googletagmanager|google-analytics)\.com\//, route => route.abort());
  return context;
};
const chromium = {
  async launch(options){
    const browser = await playwright.chromium.launch(options);
    const create = browser.newContext.bind(browser);
    browser.newContext = async options => isolate(await create(options));
    return browser;
  },
  async launchPersistentContext(profile, options){ return isolate(await playwright.chromium.launchPersistentContext(profile, options)); }
};
module.exports = {chromium, launchOptions};
