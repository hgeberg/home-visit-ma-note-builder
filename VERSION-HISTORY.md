# Home Visit MA Note Builder versions

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
