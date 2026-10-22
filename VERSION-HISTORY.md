# Home Visit MA Note Builder versions

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
