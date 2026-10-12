# Home Visit MA Note Builder versions

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

`WEBSITE-AUDIT.md` and `audit-checks.cjs` document the original v8.7 audit. That older script deliberately reproduces original defects and reads the preserved v8.7 snapshot; its passing defect checks are not claims that those defects are fixed.
