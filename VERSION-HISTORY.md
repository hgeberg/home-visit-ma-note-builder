# Home Visit MA Note Builder versions

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

`WEBSITE-AUDIT.md` and `audit-checks.cjs` document the original v8.7 audit. That older script deliberately reproduces original defects and reads the preserved v8.7 snapshot; its passing defect checks are not claims that those defects are fixed.
