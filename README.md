# Home Visit MA Note Builder

Static home-visit notes, patient checklists, and Office follow-up. Current version: v9.3.4.

Numeric weights include pounds in the message preview and copied message, such as `Weight: 100 lb` or `Weight: 145.5 lb`. Entries that already include units stay as entered.

New house is available beneath the Teams message on tablets and desktops and in a fixed bottom bar on phones while Visit is open. It opens a blank house using the same action as the top New house button, preserving earlier visits and checklists. Vertical page bounce is disabled to keep the workspace navigation in view when pulling past the bottom.

The NJ visit workflow asks for temperature, height, and weight for every patient. Pressing Copy with missing or incomplete vitals opens a popup with Enter measurement, Unable to obtain with an optional explanation, Pt refused, or Copy anyways to omit remaining measurements. Copy message applies entered measurements and selected reasons to the visit and message; Go back discards popup edits. Previously saved reasons appear for review. Heights can be marked Measured or Patient-reported. BP remains available when requested or warranted.

Pharmacy shows flu-treatment preference only while Rapid flu is checked, with capsule/liquid preference when Tamiflu is selected. Unchecking Rapid flu hides these controls and excludes them from the copied message while retaining the selections for reuse. Treatment decisions remain with the clinician.

Labs collected/sent replaces the public "Overnights" wording, with UA, stool culture, and GPP shortcuts alongside the existing choices. Lab-selection reference explains strep PCR versus culture and 4plex versus RPP. A positive rapid strep paired with a strep lab, or positive rapid flu/COVID paired with 4plex/RPP, prompts a reminder unless the clinician specifically requested the lab. Entered orders are never automatically removed.

Urine collection distinguishes suspected UTI from urine accompanying bloodwork. Suspected UTI shows an optional patient checklist for the dipstick, posted photo, UA, UC, labeled cup, and culture tube. Existing saved forms gain these fields and updated labels while retaining entered answers, custom fields, checked items, stored lab orders, and running rapid-test results.

Rapid strep, flu, and COVID each offer a `running` result alongside Positive and Negative. Select it when copying the visit before the test finishes; the message includes, for example, `Rapid flu: running`. It saves with the visit and can be replaced by the final result later. Running tests do not require a flu type or positive-result awareness.

Office shows Incomplete and Completed patients in two visible sections on the same page, with counts and shortcuts to jump between them. Check Completed on a patient to move their card to Completed, or uncheck it to return them to Incomplete. This changes only the completion status; saved test details, visit answers, and checklists stay intact. Completion saves on this browser/device and stays as chosen when editing or copying the patient again. Existing entries start incomplete. The shared Office reference checklist remains available below both lists.

The main Visit, Patients Seen, and Office navigation stays visible while scrolling. Each patient has Visit and Checklist tabs; Office is available from the main navigation. Patient tabs and the desktop message preview stay below the navigation bar, including when a saved-draft warning is shown.

Patients Seen is a separate workspace section for every entered visit in the current shift, including visits with no tests and messages that have not been copied. Search by name or DOB and open the complete visit. Clearing one patient or choosing Start fresh keeps their answers in Patients Seen; Clear shift removes them. Entries persist on this browser/device and are not automatically removed at midnight. Previously discarded visits without an existing saved form or Office snapshot cannot be reconstructed.

Vitals includes Height with separate Feet and Inches inputs. Entering one digit in Feet moves focus to Inches for that same patient. Leaving Feet blank accepts total inches, preserving fractional inches and converting to feet and inches after leaving Inches and in the message. A complete height appears as `Height: 5 ft 10 in` alongside the other vitals. Empty height stays out of the message; incomplete or invalid heights are reviewed before copying. Existing saved forms gain the fields while keeping their answers.

Complete shifts now save persistently on this device in ordinary browser tabs as well as the installed app. Reopening offers all patient answers, checklists, copied-message history, and houses without an eight-hour cutoff. Storage failures and conflicting windows remain visible; an older window cannot overwrite a newer saved shift.

Copying a message with labs collected/sent saves a complete visit snapshot with its Office entry. Open visit page uses the current form when available, then the latest visit preserved in Patients Seen, and finally the last copied Office snapshot. Newer archived answers and checklist items take priority over an older copied message; edits made only in Office stay in Office. Older test-only entries cannot recover answers they never saved. Start fresh and Clear this patient retain Office entries and their saved visit copies; Clear shift removes the shift's forms, recovery copies, and Office entries. Browser/device data clearing still removes local data; there is no patient-data cloud backup.

Patients today supports search by name or DOB across all houses and shows message-copy and Office-save status. Clear shift opens a review of uncopied messages, changes since copying, and pending Office saves with links to the relevant visit or Office retry. Blank forms and checklist activity do not count as unfinished messages; the checklist remains an optional reference. The review also includes uncopied messages and changes in Patients Seen after clearing a patient or starting fresh; opening one restores its visit. Review and Cancel leave the shift intact, and Clear everything retains its explicit destructive confirmation.

Exposure Yes shows Strep, Flu, and COVID shortcuts that can be selected together or combined with typed details. Medication allergies offers NKDA as its default shortcut. Saved forms receive these shortcut updates without changing entered answers.

Symptoms has separate Nausea and Vomiting choices, plus Fussy, Not sleeping, and Sinus pain. Previously saved forms gain these shortcuts while retaining custom choices and all entered symptom text.

The website has a fixed form. Layout editing, field/section changes, and layout import/export/reset controls are removed. Form changes are made in the source. Previously saved forms and draft form snapshots remain readable, and Office saved-entry editing remains available.

Edit saved entry in Office includes Open visit page. It opens the linked patient’s Visit tab, changing houses and expanding the form as needed, or restores its saved visit copy when the original form is no longer open. Older entries without complete copies are explained in the editor. Unsaved Office edits require confirmation before navigating away.

Open `index.html` through a local or hosted web server. Offline caching requires a secure origin (HTTPS, or localhost for testing). Patient information stays in browser storage on that device in both regular tabs and the installed app.

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

`node qa/guideline-checks.cjs` runs focused NJ-guideline browser checks for vital reminders, flu preferences, lab reminders, the UTI checklist, saved-form migration, and narrow-screen layout using synthetic patients.

`npm run test:source` runs deterministic recovery, visit integrity, antibiotic, printing-controller, and service-worker checks without a browser. `node qa/run-checks.cjs storage` runs one browser group; the other groups are `layout`, `features`, and `installed`.

All browser suites use disposable contexts and synthetic patients. The shared browser helper blocks live analytics. `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_CHROME` can override the Playwright module and browser executable. Explicit legacy-migration cases still use old storage keys; current-state assertions and failure injection use `hvnb_current_*`.

GitHub Actions runs the source checks and all browser groups on pull requests and main, using the Ubuntu 24.04 runner's preinstalled Google Chrome. Physical iPhone/iPad installation and on-screen keyboards require device testing.

See `VERSION-HISTORY.md` for behavior changes and historical versions.

