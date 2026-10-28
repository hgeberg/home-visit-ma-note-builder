# Home Visit MA Note Builder versions

## v9.2.1 — sticky Visit navigation (October 28, 2026)

Renamed the main Patients tab to Visit and kept Visit, Patients Seen, and Office visible while scrolling. Removed the duplicate Office shortcut inside each patient, leaving Visit and Checklist. The navigation height adjusts for narrow screens and saved-draft warnings, keeping patient tabs, the desktop message preview, and scrolled-to fields below it. Dialogs preserve a field selected immediately after opening instead of letting delayed autofocus move typing to another field. Advanced the app version and offline cache together.

## v9.2.0 — Patients Seen and height in vitals (October 27, 2026)

Added Patients Seen as its own workspace section, separate from the current house's forms and Office overnight tests. All entered visits appear automatically, including patients without tests and messages not yet copied. Search by name or DOB and open the full visit. Clearing a patient or choosing Start fresh keeps their entered answers and checklist in this shift's history. Visit identities prevent unrelated patients with the same name and DOB from being combined. Clear shift removes this history along with forms, recovery copies, and Office entries; visits are not automatically discarded at midnight.

History uses the existing durable shift storage, recovery copies, storage-failure warnings, and conflicting-window protection. Existing full Office snapshots are included when their original form is unavailable. No patient data is uploaded. Previously discarded visits without any saved full copy remain unavailable.

Added paired Feet and Inches inputs to Vitals. Typing one digit in Feet moves focus to that patient's Inches box. Complete heights join the message as `Height: 5 ft 10 in`; blank height is omitted, and incomplete or invalid heights are reviewed before copying. Older saved forms gain the fields without replacing entered answers. Release metadata, package version, and the offline cache advance together to v9.2.0.

## v9.1.2 — persistent browser visits and complete Office saves (October 27, 2026)

Ordinary browser tabs now save the complete shift persistently on this device, using the same recovery as the installed Home Screen app. Reopening restores patient answers, houses, checklists, copied-message history, and pending Office work without the former eight-hour cutoff. Legacy tab drafts migrate when restored. Storage-read failures preserve the saved copies, failed persistent writes show a warning, and older windows cannot overwrite a newer saved shift.

Copying a message with overnight tests saves a complete visit copy with its Office entry. Open visit page opens the existing linked patient or restores that saved copy after Start fresh or Clear this patient, retaining its original identity, house, layout, answers, and copied-message history. Pending Office retries keep the exact copied snapshot even after later edits. Different saved form layouts survive subsequent reopening. Office-only edits stay separate from the saved visit answers; copying the visit again updates its saved copy.

Older Office entries without complete visit copies remain editable and explain why the full visit is unavailable. Start fresh and Clear this patient retain Office entries and their saved copies; Clear shift removes the forms, recovery copies, and Office records for that shift. Browser-data removal still erases local information. Release metadata, package version, and the offline cache advance to v9.1.2.

Validation: 22 deterministic reliability checks, 11 printing-controller checks, and 178 browser cases passed across full and targeted runs. Coverage includes regular-tab and installed recovery, three-day-old visits, exact copied snapshots through pending saves and Undo, mixed legacy layouts, conflicting windows, storage failures, and clearing every recovery copy. A disposable Chrome profile retained a previously saved complete visit and Office entry after forced shutdown and restart. The header and archived Office editor were visually checked at 320px. Physical iPhone/iPad Safari remains outside automated coverage.

## v9.1.1 — printing browser tracking and access refresh (October 26, 2026)

Office tools shows a short Device code from a random UUID stored only for printing access. Status checks and PIN submissions send the same identifier so the owner can identify a browser when granting extra attempts. The network limit remains enforced by the backend. Blocked browser storage uses an in-memory identifier, and browsers without secure UUID generation retain the original access calls.

During cooldown, the open, visible Office tools panel refreshes server status every 15 seconds to pick up owner changes. Check printing access also refreshes it manually. Closing tools, leaving Office, hiding the page, or submitting a PIN stops polling; returning checks access again. Status responses cannot override newer submissions, and no PIN is automatically retried. Release metadata and the offline cache advance to v9.1.1.

Validation: 21 reliability checks and 11 deterministic printing-controller checks passed without browser automation. Coverage includes identifier persistence, blocked storage, crypto fallbacks, matching GET/POST identity, owner-reset polling, temporary network failures, manual refresh, stale requests, page visibility/navigation, and preserving the browser identifier when clearing a shift. The existing browser regression request assertions also include the identifier.

## v9.1.0 — server-verified printing PIN and owner settings (October 26, 2026)

Office tools opens the printing PIN prompt. Instructions are delivered by the Sites backend only after server verification; the public app no longer contains the encrypted instructions or local decryption code. The existing printing PIN is retained initially. Two failed attempts cause a server-enforced 15-minute cooldown. PIN entry keeps ten stars and replaces them one at a time with visible digits.

The owner-only PIN settings page requires the authorized ChatGPT account and changes the printing PIN immediately. The current PIN is never displayed, and changing it preserves active cooldowns. Printing instructions require an internet connection; patient workflows and offline app storage remain browser-local. Release metadata, package version, and the offline cache advance to v9.1.0.

Validation: all 21 reliability checks, 18 existing Office browser checks, seven server-backed printing checks, 23 backend/admin checks, and seven owner-settings browser checks passed. Local database integration verified that an owner PIN update rejects the old PIN and accepts the new one, then restores the synthetic test setting. Public-source scans found no protected credentials or instruction payload.

## v9.0.9 — replace PIN stars one at a time (October 26, 2026)

The printing PIN field starts with ten stars. Each entered digit replaces one star while remaining visible; deleting digits restores the corresponding stars. Submission and Lock instructions restore all ten stars when clearing the entered PIN. The existing printing PIN and ten-digit input limit remain. Release metadata, package version, and the offline cache advance to v9.0.9.

Validation: all 21 reliability checks and five printing-gate browser checks passed. Checks cover individual star replacement, Backspace/clearing, ten-digit entry, failed-attempt and Lock resets, existing-PIN unlocking, and phone alignment. A cropped phone screenshot confirmed visible digits with trailing stars.

## v9.0.8 — ten-digit printing PIN entry (October 26, 2026)

The empty printing PIN field shows ten star placeholders and accepts up to ten digits. Entered digits are visible, and the existing printing PIN still unlocks the same encrypted instructions. The entered PIN is cleared after submission and is never saved in browser storage. Validation messages no longer specify a four-digit length. Release metadata, package version, and the offline cache advance to v9.0.8.

Validation: all 21 reliability checks and five printing-gate browser checks passed, including ten-star placeholders, visible entry, the ten-digit typing limit, existing-PIN unlocking, locking/reload, and phone layouts.

## v9.0.7 — printing contact name (October 26, 2026)

The protected printing instructions now end with “If you have any issues accessing the account or locating the file, please contact Yaakov Bryks.” The same printing PIN unlocks the instructions. Release metadata, package version, and the offline cache advance to v9.0.7.

Validation: all 21 reliability checks and four printing-gate browser checks passed, including the updated contact sentence after unlocking.

## v9.0.6 — Lakewood Field requisition printing (October 26, 2026)

Added a PIN-protected Office reference card with the office-computer sign-in steps, Microsoft Teams file location, fallback credentials, and contact guidance for printing Lakewood Field requisitions. Only encrypted instructions are included in the public app. Unlocking is temporary; Lock instructions and reopening the app clear the displayed instructions. Release metadata, package version, and the offline cache advance to v9.0.6.

Validation: all 21 deterministic reliability checks, 18 Office browser checks, and four focused printing-gate checks passed. The printing checks cover empty and incorrect PINs, unlocking, no browser-storage changes, locking, reload, keyboard focus, and desktop/320px layouts. A separate check verified exact credential recovery and their absence from the public HTML.

## v9.0.5 — shift review and searchable patient status (October 26, 2026)

Patients today can be searched by name or DOB across every house, including dates typed without separators. Each result shows its DOB, message-copy state, and relevant Office-save state. Filtering leaves the current house and patient forms unchanged.

Clear shift now reviews uncopied messages, changes made after copying, and pending Office saves before the existing destructive confirmation. Each current visit can be opened directly, including visits in another house or previously on Checklist. Pending saves from earlier cleared forms retain the copied patient's name and lead to Office for retry. Cancel and Escape keep the shift intact.

Blank forms and checklist-only activity do not trigger review warnings or affect patient status. Checklist use remains an optional reference. Message and save statuses are derived from existing state and remain current after copying, editing, recovery, and Office updates. Release metadata, package version, and the offline cache advance to v9.0.5.

Validation: 21 deterministic source checks and 11 focused review/search browser cases passed. Existing multi-patient, Office, shift, data lifecycle, and house suites also passed. Coverage includes keyboard and 320px layouts, recovery, pending-save retry, unrelated saved patients, historical copies after clearing a form, and checklist exclusion. Physical mobile keyboards remain outside automated coverage.

## v9.0.4 — exposure shortcuts and one allergy shortcut (October 25, 2026)

Selecting Yes for Exposure reveals Strep, Flu, and COVID shortcuts below the editable exposure details. Multiple shortcuts can be selected together. Selecting No or Unknown hides the shortcuts and excludes the retained exposure details from the message. Medication allergies keeps NKDA and removes the duplicate None shortcut.

Saved forms and recovered draft layouts receive the shortcut updates while retaining custom choices and all entered answers. Release metadata, package version, and the offline cache advance to v9.0.4.

Validation: all 21 existing source checks and three focused output, saved-form, and schema checks passed. Browser checks verified multiple exposure selections, conditional visibility and output for Yes/No/Unknown, retained details when returning to Yes, and the NKDA shortcut.

## v9.0.3 — separate and additional symptom choices (October 25, 2026)

Replaced the combined Nausea/vomiting shortcut with separate Nausea and Vomiting choices, and added Fussy, Not sleeping, and Sinus pain. Previously saved forms and recovered draft layouts gain the new choices while retaining custom shortcuts. Existing entered symptom text, including Nausea/vomiting, remains unchanged.

Release metadata, package version, and the offline cache advance to v9.0.3.

Validation: all 21 existing source checks passed. Focused checks verified separate symptom output, saved-form upgrades, custom-choice retention, and unchanged historical symptom text. Browser checks confirmed the five choices work independently and update the message preview.

## v9.0.2 — open linked visits from Office (October 24, 2026)

The Edit saved entry dialog now includes Open visit page. It locates the original form by its saved Office association, opens the correct house, expands the patient, selects Visit, and focuses the patient heading. Matching survives draft recovery and independent name edits, including patients sharing a name and DOB. Navigation retains the current patient answers and does not recopy or change the saved Office entry.

If the form has been cleared or is not open in this tab, the editor explains that it is unavailable and disables the shortcut. Saving Office details remains available. Navigating with unsaved Office edits first asks for confirmation; Keep editing and Escape preserve the entered values.

Release metadata, package version, and offline cache advance to v9.0.2. Five new browser regressions cover navigation/focus, cross-house identity after recovery, unavailable forms, and both unsaved-edit confirmation paths. Existing legacy-entry, other-tab, and mobile editor checks also cover the shortcut.

## v9.0.1 — preserve checklist work and unread drafts (October 24, 2026)

Choosing “No, undo this edit and add a patient” restores the answers from immediately before the mistaken edit. Checklist work completed after copying, retained hidden history, copied-message status, and the saved Office association remain intact. The guard covers text, choice, checkbox, and nested test-result changes.

An initial session or installed-app draft read failure now leaves both recovery copies untouched. The app shows a Retry warning and waits to open patient forms until the required reads succeed. Repeated failures and page lifecycle events cannot replace or remove the unread draft. Retry offers the existing recovery choices, or opens a blank form when no current draft exists; a shift cleared in another tab is checked before restoring older work.

The displayed version, release metadata, package version, and static cache advance to v9.0.1. Validation adds six source regressions and eight browser regressions for these failures. All 21 deterministic source checks pass locally; the full browser suite runs in CI. Physical Safari/iOS behavior remains outside automated coverage.

## v9 — fixed forms, recovery conflicts, and offline reliability (October 23, 2026)

Installed-app session drafts retain the revision of the device copy they came from. Reloading a stale window cannot replace a different device shift. When both contain different work, recovery offers the device shift or the window's shift; opening the window's shift keeps the device copy and a visible conflict warning. A failed device write can still recover newer session work and retry when its original device copy has not changed. Older drafts remain recoverable.

Removed Edit layout and all runtime section/field editing, layout import/export, and layout reset controls. Form definitions are maintained through source updates. Existing saved custom forms, their conditional fields, and draft form snapshots remain readable without changing their stored answers. Patients, houses, checklists, message copying, and editing saved Office entries remain available.

Recent antibiotics tracks the affirmative option separately from its label so previously saved renamed choices retain detail fields, combined output, and missing-detail warnings. Older saved binary forms with No and a renamed affirmative option gain that meaning; invalid semantic references are rejected.

The service worker falls back to the saved app when a timeout aborts the HTML body after headers. Cache-write failures still permit online opening. Installation requires matching release metadata, and an older worker does not save a different release into its own cache. The static cache is v9; installed top padding remains 32px.

Current regression fixtures now target the current storage namespace while explicit legacy-migration cases retain old keys. A shared portable browser helper, pinned Playwright dependency, grouped runner, and CI workflow make the checks reproducible. Synthetic browser tests block live analytics.

Validation: 15 deterministic source checks pass locally, including the stale-window reload, transient quota retry, legacy recovery, antibiotic customization, release mismatch, slow-body fallback, and cache quota paths. Browser regression validation runs in CI, including fixed-form workflows and compatibility with earlier saved custom forms. Retired editor-only cases are removed or replaced with saved-form fixtures. Physical iPhone/iPad keyboards remain outside automated coverage.

## v8.24 — additional installed-app header spacing (October 21, 2026)

Increased the installed app's top padding from 20px to 32px, moving the header another 12px below the existing safe-area inset. The offline app cache is updated to v8.24.

## v8.23 — small header inset in the installed app (October 21, 2026)

The installed web app adds 6px above the header, on top of its existing safe-area spacing. Installation is detected with the standalone display mode or Apple's standalone flag. The offline app cache is updated to v8.23.

## v8.22 — refined dark-mode palette (October 21, 2026)

Dark mode now pairs layered slate surfaces with soft teal actions, cool off-white text and clearer field outlines. Selected tabs have a teal underline. The Teams message uses a navy surface, while success, warning and danger states use muted green, amber and rose. Browser chrome follows the new background, and the offline app cache is updated to v8.22.

Validation: reviewed phone, tablet and desktop screenshots at 390/810/1280px, including populated forms, the Teams preview, Office and the clear-shift dialog. Checked text and control contrast, saved theme selection, browser theme color and switching appearances. Inline scripts and the service worker passed syntax checks.

## v8.21 — saved dark-mode toggle (October 21, 2026)

A Dark mode button at the top switches the whole app between dark and light appearances, including forms, Office, dialogs and the Teams preview. It follows the device appearance until a choice is made, then remembers that choice on this browser/device and applies it before the page paints. Open tabs stay in sync, and the browser theme color follows the chosen appearance. The toggle still works for the current session if preference storage is unavailable. The offline app cache is updated to v8.21.

Validation: five appearance checks passed for system appearance, saved overrides and reloads, cross-tab synchronization, mobile/desktop dark layouts and Office, and unavailable preference storage. Screenshots were inspected at 320px and 1280px; layouts also fit 390px and 810px. Inline scripts and the service worker passed syntax checks.

## v8.20 — Teams preview beside the form and keyboard-aware sizing (October 21, 2026)

The live Teams message and its copy controls now sit beside each patient's form on tablet and desktop screens (760px and wider), following the current section while scrolling. Narrow phone screens retain a stacked layout. The message stays available when switching to Checklist, and each patient retains a separate preview.

The preview uses the visual viewport's height and offset, including keyboard resize and pan events, to fit the area above the keyboard. Long messages scroll inside the box while the copy controls remain accessible. At the final field, the panel also fits the remaining form area so the bottom of the form cannot push it upward. Closing the keyboard restores the larger preview. The offline app cache is updated to v8.20.

Validation: 33 browser scenarios passed (five message-preview, 11 house-navigation and 17 draft/copy/undo/offline scenarios), plus inline JavaScript and service-worker syntax checks. The new checks cover 768/810/1024/1280px side-by-side layouts, 320/390px phone layouts, exact copied text, separate patient previews, and simulated keyboard resizing/panning at middle and final fields, including keyboard closure. Physical iPad Safari keyboard behavior still requires device verification. The previous deployed source remains in Git commit `39a41a968e7d5c81302c5d24008bb35c495d70e7`.

## v8.19 — Home Screen app settings and durable shift recovery (October 21, 2026)

Added a project-scoped web-app manifest with the name Note Builder, standalone launch mode, light/dark browser theme colors, an Apple Home Screen icon, and opaque 192px/512px app icons. The blue note mark matches the existing favicon. `create-app-icons.py` recreates the PNGs using Pillow; a matching vector copy is `icons/icon.svg`. Offline setup caches only the static HTML, manifest and three PNGs. Static responses are consumed sequentially during installation so uncached requests cannot stall asset installation.

The installed web app saves a recovery copy on this device, including houses, patient inputs, checklists, copied-message state, layouts and pending Office saves. It offers recovery after closing/reopening or a browser restart, including offline opening after initial setup. Installed-app recovery has no eight-hour cutoff; Clear shift removes it and invalidates older copies in other app windows. The recovery prompt includes the saved date and time. Start fresh discards recovered forms while retaining copied Office work.

Ordinary browser tabs keep their existing separate session drafts and eight-hour recovery window. The installed mode is detected using Apple's standalone flag or the standard standalone display-mode query. Durable-save failures remain visible even when the temporary session save succeeds. A stale app window cannot overwrite another window's newer recovery record. Data remains in this browser/app on this device; clearing website data can remove it.

Validation: 15 installed-app cases cover icon dimensions and opacity, project-relative launch/scope URLs, full browser restart with a persistent profile, offline reopening, recovery older than eight hours, pending Office recovery, concurrent windows, failed writes/deletions, Clear shift and Start fresh. Existing shift and draft/offline checks also passed. The existing Office-edit case failed during the concurrent run and passed in isolation without an Office code change. Physical iPad installation, keyboards and Teams switching remain for device testing.

## v8.18 — full-width antibiotics question and one-line output (October 21, 2026)

Recent antibiotics starts on its own full-width row below medication allergies. When Yes is selected, the generated message combines the antibiotic and timing as one line, for example `Recent antibiotics: Amoxicillin, a week ago`. It omits the separate Yes, Recent antibiotic and When taken lines. No continues to produce `Recent antibiotics: No`, and missing details still trigger the existing copy review.

Validation: six antibiotic browser cases passed, including copied text, saved-history recovery, and confirmation that the antibiotics question occupies its own full-width row at 320/390/1280px. Inline JavaScript and the service worker passed syntax checks.

## v8.17 — conditional recent-antibiotic history (October 21, 2026)

Recent antibiotics now offers No and Yes. Yes reveals Which antibiotic? and When? with editable text and shortcuts for Amoxicillin, Penicillin V, Cephalexin and Zpack. The first three are strep treatment options listed in [CDC guidance](https://www.cdc.gov/group-a-strep/hcp/clinical-guidance/strep-throat.html); this is not a prescribing-frequency ranking. These controls record reported history and do not select a treatment or dosage.

The extra fields and shortcuts are hidden unless Yes is selected. Selecting No excludes earlier antibiotic details from the generated message while retaining them for subsequent editing. Copy warns about missing antibiotic names or dates when Yes is selected. Selecting Yes or a shortcut does not automatically open a text field.

Saved and imported layouts gain the updated workflow while retaining unrelated customization. Previous No/None entries become No. Other free-text entries are retained under Preserved answers and prefilled into Which antibiotic? when Yes is selected; no positive antibiotic history is inferred from text such as Unknown. Previous dates embedded in free text are retained verbatim rather than parsed or guessed. Draft recovery keeps each patient's choice, drug and dates separate.

Validation: six antibiotic-workflow cases, 11 house cases, seven layout-regression cases and 17 improvement cases passed (41 browser checks), plus JavaScript syntax checks and 320/390/1280px visual inspection. One copy-check expectation initially used the input label rather than the message label; it was corrected and passed. Physical mobile keyboards remain untested.

## v8.16 — additional pharmacy shortcuts (October 21, 2026)

Added Westgate, Maple and Refuah alongside Madison. Older saved or imported layouts gain the three new shortcuts while retaining custom pharmacy choices and entered values. The layout records the preset update so later user edits to the shortcuts are respected.

Validation: all 11 house browser checks passed. A separate disposable-browser check verified all four shortcuts populate the message, older layouts retain custom choices, and later shortcut edits and entered pharmacy details survive reload. Inline scripts and the service worker passed syntax checks.

## v8.15 — wait for a field tap before typing (October 21, 2026)

Adding another patient or reopening a patient scrolls to the form and places focus on its heading. No text field is selected automatically, so the mobile keyboard is not requested until a field is tapped. New house continues to open at the house heading.

Validation: all 11 house browser checks passed, including both Add patient controls, explicit name-field selection, and reopening earlier patients. Inline scripts and the service worker passed syntax checks. Physical mobile keyboard behavior remains untested.

## v8.14 — separate house pages and patient history (October 21, 2026)

**Add patient in this house** keeps additional household members on the current page. **New house** opens a fresh house page and retains all earlier patients. New-house buttons are available above the forms and below each patient's message.

**Patients today** is collapsed by default at the top. Expand it to see every patient grouped by house; choosing a patient opens that house and expands the selected patient. Only the current house's forms are shown. Collapse all and Expand all apply to that house.

Draft recovery retains house membership and the last-opened house, including a blank new house. Existing drafts without house information restore together as House 1. The Office list continues to collect copied overnight tests from all houses. Clear shift removes every house and resets to one blank patient with patient history collapsed.

Validation: 67 browser checks passed using synthetic data (11 house workflow, 11 multi-patient, 17 draft/undo/offline improvement, 15 shift, and 13 Office checks). House cases cover navigation, inserting patients into earlier houses, refresh recovery, legacy/malformed house metadata, pending copies, shared Office, cross-tab clearing, focus/scroll behavior, and 320/390/1280px layouts. Inline scripts and the service worker passed syntax checks. Physical iPhone/iPad Safari remains untested.

The previous deployed source is retained in Git commit `ed098498a4019c6e1adff1bdea348e240f19251b`.

## v8.11 — full code audit and reliability fixes (October 11, 2026)

A fresh review of the complete application found and fixed copy-ordering races, failed-read duplicates, overwritten concurrent Office edits, malformed stored data, invalid layout imports, stale choice/test values after layout changes, ISO DOB conversion, and keyboard/modal/mobile issues. Patient drafts now retain their own validated layout snapshot so another tab's layout changes cannot silently remove unfinished custom-field answers on restore. Pending layout edits are flushed before leaving the page.

The patient workflow remains the same: **Copy message** saves overnight orders, **Office** is a separate view, and **Clear shift** clears the whole shift after confirmation. A copy already in progress temporarily disables other Copy message buttons until it finishes or is canceled.

See `CODE-AUDIT-2026-10-11.md` for reproductions, repairs, verification, and testing limits. New regression suites are `data-audit-checks.cjs`, `layout-audit-checks.cjs`, `browser-audit-checks.cjs`, and `quality-audit-checks.cjs`.

The unchanged v8.10 source is preserved in `backups/before-code-audit-2026-10-11/index.html` and on [codex/backup-before-code-audit-2026-10-11](https://github.com/hgeberg/home-visit-ma-note-builder/tree/codex/backup-before-code-audit-2026-10-11), commit `e999349f1a0f05ad904dc773cf8125649798c91e`.

## v8.10 — separate Office view and end-of-shift clearing (October 11, 2026)

Use the **Patients** and **Office** tabs at the top to switch views. Office contains the saved overnight-test list and its single shared reference checklist; it is hidden while entering patient information. Each patient's Office button opens the same Office view. Copy-only saving is unchanged.

**Clear shift** is available in either view. After confirmation, it removes all patient forms, saved drafts and Office entries and starts one blank patient. Layout settings are retained. Other tabs running this version reset too, and outdated drafts and pending clipboard requests cannot restore cleared records. If browser storage prevents clearing, the app reports the failure and offers a retry rather than claiming all saved information was removed.

The preceding v8.9 source is preserved in `backups/before-shift-clear-2026-10-11/index.html` and on [codex/backup-before-shift-clear-2026-10-11](https://github.com/hgeberg/home-visit-ma-note-builder/tree/codex/backup-before-shift-clear-2026-10-11), commit `91d0a8295b1fe3da95f47b15349462886818abc3`.

## v8.9 — saved overnight tests and one Office reference (October 11, 2026)

Office now appears once, below all patient forms. Each patient's Office button jumps to this shared section. The Visit checklist remains separate for each patient.

Press **Copy message** to save a patient's exact overnight tests, name, DOB and blood-work reason (when entered) to the Office list. Copying again updates the same saved entry. Typing, switching tabs and clearing a form do not save changes to Office. A copied visit with no overnight tests does not create an entry; copying an existing entry with its overnight tests removed removes it from the list.

Patient cards contain the saved test details. One shared **Office checklist — reference** follows the full list. The list stays in this browser across page reloads. Failed saves display a persistent warning and a **Retry save** button; retries merge pending edits with other tabs' saved entries.

Earlier records are retained under **Earlier saved patients**. Their test names were not saved by the older version, so no test names are inferred. Use **Edit saved entry** to supply them, or copy the patient's visit again.

The previous v8.8 page is preserved at `backups/before-office-overnights-2026-10-11/index.html` and on [codex/backup-before-office-overnights-2026-10-11](https://github.com/hgeberg/home-visit-ma-note-builder/tree/codex/backup-before-office-overnights-2026-10-11), commit `7a2d197351740b9144778ad1f9471f85809a17e5`. The original v8.7 link remains available at the top of the app.

## v8.8 — multiple patients on one page (October 11, 2026)

Open `index.html` to use the updated version. Choose **Add another patient** below any patient's message and copy buttons. A blank form appears directly below that patient; previous forms stay editable. There is no application-imposed patient limit. Each patient has separate inputs, test results, checklist, output, copy status and clear button. Layout settings and the Office list remain shared.

Refreshing offers to restore every patient in that browser tab, including incomplete and blank added forms. Existing v8.7 single-patient drafts also restore. Drafts retain the original eight-hour recovery window and browser-local storage behavior. If storage fails, an on-page warning asks you to keep the page open and copy your messages.

## Original v8.7 — preserved before these changes

Use **Open original v8.7** at the top of the updated page, or open `previous-version.html` directly. The link opens a separate tab so it does not replace your current patient forms.

The original HTML was copied without changes. An additional copy is in `backups/before-multi-patient-2026-10-11/index.html`.

GitHub backup branch: [codex/backup-before-multi-patient-2026-10-11](https://github.com/hgeberg/home-visit-ma-note-builder/tree/codex/backup-before-multi-patient-2026-10-11).

Original published commit: `acc42e2cb63fc98d72ac86be0ef3a787acb258ce`.

To restore the original as the main page, replace `index.html` with `previous-version.html`. To restore the hosted site, publish the original backup branch's `index.html` to `main`; keep the newer files/commit available if you want to switch back later.

## Verification

Run `node multi-patient-checks.cjs` for the current browser regression checks. The script uses an isolated browser, synthetic patient data, and a temporary localhost server. It supports `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_CHROME` overrides for other machines.

Run `node office-checks.cjs` for the overnight list, copy-only saving, legacy records, shared reference, browser storage, and recovery checks.

Run `node shift-checks.cjs` for separate-view navigation, confirmation/cancellation, clearing, cross-tab synchronization, stale drafts, pending copies and failed storage deletion.

`WEBSITE-AUDIT.md` and `audit-checks.cjs` document the original v8.7 audit. That older script deliberately reproduces original defects and reads the preserved v8.7 snapshot; its passing defect checks are not claims that those defects are fixed.
