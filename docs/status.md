# Status

| Milestone | Owner | State | Latest test result |
|---|---|---|---|
| M1 Functional spec (bundle pass) | reverse-engineer | done — reviewed by CoS (161 F-IDs: 128 in / 33 out; 17 unknowns) | n/a (document) |
| M1b Spec cross-check vs source | reverse-engineer | done — v0.7.3 tag verified identical to bundle; 76 changes logged in spec §13; all prefs defaults confirmed | n/a (document) |
| M2 Scaffold + core editor/preview | test-engineer | **done** | D-01..D-03 verified fixed by TE (M3 run) |
| M3 Rendering parity | test-engineer | **done** | TE retest: D-04 confirmed not-a-defect; D-05..D-08 verified fixed |
| M4 Editing features | reverse-engineer | **done** | TE retest: D-09..D-12 verified fixed; Q-04 and F-79 test edits confirmed |
| M5 Files, prefs, export, help | test-engineer | in final sign-off | RE fixed D-13..D-20 (spec §13 items 93-107); CoS run: build OK, unit 687/688 (1 = SD-13 assertion under TE review), E2E 1041+ pass, 2 load-flaky tests pass alone |
| T Testing / final regression | test-engineer | final sign-off in progress | — |

## Decisions
- U-05: fix original ordered-list toggle regex bug (documented deviation).
- U-07: use source-repo GitHub-2017.css if non-empty, else hide the style.
- U-07 (final): GitHub-2017.css does not exist in source → hidden.
- U-12: P-02 on web — checked: open last autosaved draft (or blank); unchecked: empty state with New/Open. (as proposed in spec)
- U-19: turning off "Scale preview based on editor font size" resets preview zoom to 1 (minor documented deviation; original never resets).
- Q-01: F-16 window title = browser tab title (document.title).
- Q-02: Restore Preview Pane hidden vs disabled — follow original source.
- D-02/D-03 (keyboard access to menus/divider) treated as parity fixes, not enhancements.
- Back end: none (confirmed by user).
- MathJax 3 (local, SVG) instead of 2.7.3 CDN — accepted.
- Open: tests/e2e excluded from tsconfig typecheck due to 3 TE type errors — TE to fix and re-include.
- Known deviation: emphasis nesting order (`***x***`) differs from Hoedown — accepted for now.

- E2E type errors fixed by TE; tests/e2e type-checked again.
- D-05/D-06/D-07/D-08: fix to Hoedown parity. D-04: follow original MathJax config exactly. Q-03: unescaped raw HTML in export/Copy HTML accepted (parity; user's own content).

- D-04: original MathJax 2.7.3 tex2jax defaults → inline \(…\) only, no `$`; spec §13 item 77.

- SD-07: 'no theme' keeps HGMarkdownHighlighter default palette (source parity); spec wording fixed.
- SD-08: keep Shift Left/Right quirks (parity).
- SD-09: match original 1-line trailing height.
- Q-04/Q-05: follow original source.
- Undo: isolate history after formatting commands.

## Decisions (M5)
- D-13: preserve CRLF (parity). D-14: Close clears draft when P-02 off. SD-12: U-12 closed. SD-13: follow original. D-15/D-16/D-17/D-18/D-19/D-20 fix all.
- SD-15: print/PDF dialog needs manual check in a real browser (cannot run headless).

## Risks
- Prior RE agent edited a TE unit test (SD-13 line); builder restored it. TE to rule on SD-13.
- Machine load: full E2E took 12.7 min under load avg >20 (normally ~2-3 min); 2 tests flaky only under load.
- RE report: Q-04 TE test expectation changed by prior agent (Shift+Return now continues list); TE to confirm/reject.
- RE edited TE file m4-independent.spec.ts (F-79 test, per SD-09 decision) — TE to review at retest.
- Unexplained E2E freeze occurred once; did not recur in TE M4 run (150 s).
- Work is uncommitted — awaiting user OK for checkpoint commit.

## Next
1. test-engineer: final sign-off.
2. CoS: final report; offer checkpoint commit (user has not answered).
