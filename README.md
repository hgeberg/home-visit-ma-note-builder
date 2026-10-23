# Home Visit MA Note Builder

Static home-visit notes, patient checklists, and Office follow-up. Current version: v8.25.

Open `index.html` through a local or hosted web server. Installed-app recovery and offline caching require a secure origin (HTTPS, or localhost for testing). Patient information stays in browser storage on that device.

## Regression checks

Use Node 24 and install the pinned test dependency and Chromium:

```sh
npm ci
npx playwright install --with-deps chromium
npm test
```

`npm run test:source` runs deterministic recovery, antibiotic, and service-worker checks without a browser. `node qa/run-checks.cjs storage` runs one browser group; the other groups are `layout`, `features`, and `installed`.

All browser suites use disposable contexts and synthetic patients. The shared browser helper blocks live analytics. `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_CHROME` can override the Playwright module and browser executable. Explicit legacy-migration cases still use old storage keys; current-state assertions and failure injection use `hvnb_current_*`.

GitHub Actions runs the source checks and all browser groups on pull requests and main. Physical iPhone/iPad installation and on-screen keyboards require device testing.

See `VERSION-HISTORY.md` for behavior changes and historical versions.
