# Home Visit MA Note Builder

Static home-visit notes, patient checklists, and Office follow-up. Current version: v9.1.1.

Patients today supports search by name or DOB across all houses and shows message-copy and Office-save status. Clear shift opens a review of uncopied messages, changes since copying, and pending Office saves with links to the relevant visit or Office retry. Blank forms and checklist activity do not count as unfinished messages; the checklist remains an optional reference. Review and Cancel leave the shift intact, and Clear everything retains its explicit destructive confirmation.

Exposure Yes shows Strep, Flu, and COVID shortcuts that can be selected together or combined with typed details. Medication allergies offers NKDA as its default shortcut. Saved forms receive these shortcut updates without changing entered answers.

Symptoms has separate Nausea and Vomiting choices, plus Fussy, Not sleeping, and Sinus pain. Previously saved forms gain these shortcuts while retaining custom choices and all entered symptom text.

The website has a fixed form. Layout editing, field/section changes, and layout import/export/reset controls are removed. Form changes are made in the source. Previously saved forms and draft form snapshots remain readable, and Office saved-entry editing remains available.

Edit saved entry in Office includes Open visit page. It opens the linked patient’s Visit tab, changing houses and expanding the form as needed. Cleared or unavailable forms are explained in the editor. Unsaved Office edits require confirmation before navigating away.

Open `index.html` through a local or hosted web server. Installed-app recovery and offline caching require a secure origin (HTTPS, or localhost for testing). Patient information stays in browser storage on that device.

Office tools contains a server-verified PIN prompt for Lakewood Field printing instructions. Instructions are requested from the Sites backend after verification and are never embedded or cached in the public app. Two failures trigger a 15-minute server cooldown; anonymous visitors on a shared network may share that limit. The owner can change the PIN through the backend’s /admin page after ChatGPT sign-in. Printing access requires internet.

Printing access keeps one random browser identifier in its own local-storage key and shows a short Device code beside the PIN prompt. The identifier lets the owner identify a browser when granting extra attempts; it does not bypass the network limit. Storage failures keep the identifier in memory for the current page. During cooldown, an open, visible Office tools panel checks access every 15 seconds so an owner reset can appear without reloading. Check printing access refreshes the state manually. No PIN or instructions are stored, and status checks never retry a PIN.

## Regression checks

Use Node 24 and install the pinned test dependency and Chromium:

```sh
npm ci
npx playwright install --with-deps chromium
npm test
```

`node qa/printing-checks.cjs` runs focused printing-gate browser checks using mocked API responses and synthetic credentials.

`npm run test:source` runs deterministic recovery, antibiotic, and service-worker checks without a browser. `node qa/run-checks.cjs storage` runs one browser group; the other groups are `layout`, `features`, and `installed`.

All browser suites use disposable contexts and synthetic patients. The shared browser helper blocks live analytics. `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_CHROME` can override the Playwright module and browser executable. Explicit legacy-migration cases still use old storage keys; current-state assertions and failure injection use `hvnb_current_*`.

GitHub Actions runs the source checks and all browser groups on pull requests and main, using the Ubuntu 24.04 runner's preinstalled Google Chrome. Physical iPhone/iPad installation and on-screen keyboards require device testing.

See `VERSION-HISTORY.md` for behavior changes and historical versions.
