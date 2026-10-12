# Code audit — Home Visit MA Note Builder

Audit started October 11, 2026 (New York time). Reviewed the complete HTML, CSS, and both JavaScript blocks in `index.html`, starting from the published v8.10 code. The local source was byte-for-byte identical to GitHub commit `e999349f1a0f05ad904dc773cf8125649798c91e` before changes. This application has no server-side patient processing or third-party runtime dependencies.

The review used three independent code/browser audits plus an integrating review. Previous audit conclusions were not treated as proof. All 39 existing browser checks were rerun on the starting version; they passed. New tests reproduced defects outside their coverage.

## Confirmed findings and repairs

| Area | Reproduced problem | Repair |
| --- | --- | --- |
| Clipboard ordering | Two pending copies of the same patient could complete in reverse order, replacing newer Office orders with an older snapshot. | One clipboard operation at a time across the page, including layout export and manual fallback. Clear actions invalidate obsolete completions. |
| Office storage reads | A transient read failure was interpreted as an empty Office list; recopying could create a duplicate patient. | Preserve the last reliable records and identifiers, report the read failure, and retain the exact copied snapshot for retry. |
| Concurrent Office editing | A second open editor could overwrite another tab's updated tests even when the second user changed only the name. | Merge only fields actually changed by that editor; failed-write retries use the same field-level merge. |
| Damaged stored data | Invalid Office step elements or copied metadata could cause errors during recopy or restored editing. | Normalize stored record/metadata shapes before using them. Malformed Office JSON remains intact with a persistent warning. |
| Draft layout changes | A layout edit in another tab could make restoring a draft silently discard its custom-field answers. | Store one validated layout snapshot with the draft and restore it in memory without overwriting the other tab's saved layout preference. |
| Pending layout saves | Closing or refreshing during the layout-save debounce could lose a recent edit. | Flush pending layout edits before saving the draft when the page leaves or becomes hidden. |
| Layout imports | Invalid nested options/items passed validation, were saved, and then disabled the form across reloads. | Validate the complete supported layout structure before saving; recover invalid stored layouts with a visible warning and usable default form. |
| Layout identifiers | Duplicate field IDs made different visible inputs share one output value. Certain test ID combinations also generated duplicate DOM IDs. | Reject duplicate, unsafe, reserved, and colliding generated identifiers. |
| Changed test options | A removed flu subtype could still appear in the copied message while no matching option was selected. | Reconcile test result and subtype selections whenever a layout changes. |
| Reset/import choices | Resetting or importing a layout could retain a choice that no longer existed, omit its conditional details, and print the obsolete value. | Reconcile every patient's values against the new layout; migrate explicit editor renames and remove obsolete selections. |
| Renamed awareness option | Renaming “Unaware” removed the related tagging reminder. | Track that option's meaning separately from its displayed label and preserve it during renaming. |
| Editor round trips | Duplicate choices and orphaned conditional controls could produce layouts the new validator would reject on reload. | Deduplicate editor choices and remove invalid conditional references; verify exported layouts can be imported again. |
| Custom option text | An imported sub-choice named `constructor` or `toString` could print a JavaScript function instead of the selected text. | Use only explicit own-property output mappings; preserve other option text literally. |
| DOB handling | Pasting `2000-01-02` produced `20/00/0102`. Impossible calendar dates were copied without a date warning. | Convert recognizable year-first dates accurately and warn before copying invalid calendar dates. Warnings remain overridable. |
| Modal interaction | Keyboard focus escaped copied-visit warnings into patient controls; closing dialogs often left focus on the page body. | Native modal dialogs, a shared presentation queue, contained keyboard focus, and focus restoration after dismissal and rerendering actions. |
| Keyboard controls | Patient tabs and radio groups exposed ARIA roles without the expected arrow navigation and tab stops. The exposure detail input had no accessible label. | Implement arrow/Home/End navigation, roving tab stops, and an explicit conditional-input label. |
| Mobile Office view | A long unbroken patient name expanded a 390px page to 1468px. | Allow Office identifiers to wrap and shrink; verify 320px and 390px layouts. |
| Browser-tool navigation | Requesting Office while layout editing opened the patient's layout editor instead of the Office workspace. | Route the tool through the global Office control. |

## Verification

Tests run in isolated installed Chrome contexts on Windows with synthetic patient data. Clipboard success/failure, delayed completion, browser-storage exceptions, concurrent tabs, and malformed stored/imported data are deliberately simulated. No real patient records or live browser storage are used.

Regression scripts:

- `multi-patient-checks.cjs`: patient isolation, insertion, copy snapshots, clear/restore, shared layout, storage limits.
- `office-checks.cjs`: copy-only Office saving, exact test details, legacy entries, read/write recovery, concurrent tabs.
- `shift-checks.cjs`: separate Office workspace, clearing/canceling, stale drafts and callbacks, cross-tab clearing, deletion failures.
- `data-audit-checks.cjs`: clipboard ordering/lock release, transient reads, concurrent edits, damaged records and metadata.
- `layout-audit-checks.cjs`: seven grouped regressions including 17 malformed import payloads, option/test changes, date formatting, layout recovery, and export/import round trips.
- `browser-audit-checks.cjs`: modal focus, keyboard controls, labels, mobile overflow, and manual-copy fallback.
- `quality-audit-checks.cjs`: 40 populated patients plus a middle insertion, exact restoration of all 41 outputs, literal HTML-looking inputs, offline operation, and browser-tool navigation.

Final verification: **80 regression checks passed** on the corrected v8.11 source: 11 multi-patient, 13 Office, 15 shift, 17 data lifecycle, 7 grouped layout, 12 browser interaction, and 5 general quality checks. The 17 malformed-import payloads are included in the grouped layout count, not counted again. Inline JavaScript syntax checks also passed.

Two cross-tab click actions timed out while suites ran in parallel. Each passed on an isolated rerun without an application change or browser JavaScript error. The data suite's action timeout was increased from 5 to 15 seconds, and a test filter was added for reproducible targeted runs.

The final large-household check populated 40 synthetic forms in about 0.95 seconds on this machine and restored all 41 forms, including a middle insertion, with exactly matching outputs. This is a local observation, not a device-independent performance promise.

Integration review also found and corrected a pending-Office-retry liveness issue: another successful Office mutation must not hide the recovery control while an exact copied snapshot is still awaiting a reliable read/retry.

## Scope and remaining limits

The audit checks software behavior, not the medical correctness of the supplied checklist wording. Chrome desktop and narrow mobile-sized viewports were exercised; a physical iPhone/Safari session was not available. Real mobile clipboard permission prompts can differ from the simulated paths.

Browser storage remains local to the device/browser and can be removed by browser settings. The app reports detected storage failures; this review does not turn it into a server-backed record system. Concurrent editors changing the same Office field still use the last explicit saved change.

Office updates use a localStorage read/merge/write sequence, which is not a browser-wide atomic transaction. Stale editors and retry conflicts are tested, but exact simultaneous writes from separate browser processes are not proven race-free. This remains a concurrency limitation, not a claim of guaranteed multi-user synchronization.

Historical source snapshots are preserved as historical versions, not upgraded copies. The current shift coordination protocol does not control older versions open in other tabs.

No finite review can establish that every possible bug is absent. The findings above have concrete reproductions and regression coverage; remaining conclusions are limited to the reviewed code and tested environments.

## Rollback

The unchanged v8.10 source is saved at `backups/before-code-audit-2026-10-11/index.html` and on [codex/backup-before-code-audit-2026-10-11](https://github.com/hgeberg/home-visit-ma-note-builder/tree/codex/backup-before-code-audit-2026-10-11). The original v8.7 and intermediate backups remain preserved.
