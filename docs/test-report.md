# Test report

## M2 — Scaffold, layout, preview, core rendering, Edit menu

Date: 2026-10-17. Tester: test-engineer. App: `web/` at the working tree state tested (no `web/src` changes by the tester).

### Commands

```sh
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
cd web
npm test            # Vitest, 3 files
npm run test:e2e    # Playwright (Chromium headless shell); webServer = `npm run dev -- --port 5173 --strictPort`
```

Test files: `web/tests/unit/{layout,render,m2-gaps}.test.ts`, `web/tests/e2e/{layout,preview,samples,explore}.spec.ts`, `web/playwright.config.ts`, helpers in `web/tests/e2e/helpers.ts`.

### Totals

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| Unit (Vitest): 38 existing + 35 added | 73 | 0 | 0 |
| E2E (Playwright) | 75 | 4 | 0 |
| **Total** | **148** | **4** | **0** |

The 4 failures are real defects (D-01 to D-03, below; D-02 accounts for two tests). No test was weakened or skipped. The "Blocked script execution" console messages from Playwright's own injected scripts were ignored, as agreed. The "no console errors" test (explore.spec.ts) passes with only that message filtered out.

Measured F-02 latency: about 160 ms from the last keystroke to the updated preview (limit 300 ms).

### Go / no-go

**M2: GO with conditions.** All spec features claimed by M2 behave as specified. The open defects are one minor functional defect (D-01) and two minor accessibility defects (D-02, D-03), none of which block M3. Fix D-01 before M2 sign-off if the Edit > Find focus behaviour is wanted. Re-test is cheap (the tests exist and currently fail).

### F-ID results

| F-ID | Test(s) | Result |
|---|---|---|
| F-01 | layout: starts 1:1 editor left/preview right; title Untitled; divider drag (both directions); drag past edge collapses; explore: no console errors, narrow window, a11y names | pass (divider keyboard access: D-03) |
| F-02 | preview: updates after typing; within 300 ms (measured 160 ms); rapid typing coalesced; delete all; scroll position kept; explore: typing while preview hidden | pass |
| F-03 | preview: manual mode + View > Render Markdown; Cmd+R | pass |
| F-04 | layout: View > Left 1:3 Right = 0.25; no shortcut shown | pass |
| F-05 | layout: View > Left 1:1 Right = 0.5; Shift+Cmd+0 | pass |
| F-06 | layout: View > Left 3:1 Right = 0.75 | pass |
| F-07 | layout: View menu hide/restore + title toggle; Shift+Cmd+H; ratio memory; hidden item when nothing to restore; unit: split state | pass |
| F-08 | layout: View menu + title toggle; Shift+Cmd+E; works from focus inside the preview iframe; editor not editable while collapsed | pass |
| F-09 | layout: pull-down toggles editor and preview; titles change; no shortcut text; explore: keyboard open | pass for mouse; keyboard fails (D-02) |
| F-10 | layout: editorOnRight swaps panes, ratio is the left pane's | pass |
| F-11 | preview: editor scroll drives preview (top, middle, bottom); disabled by P-04 off; unit: anchor lines, scroll maths | pass |
| F-12 | preview: hidden by default; three labels and values; rendered text not source; singular; code block 0 / inline code 1; empty; type persists; explore: updates while preview hidden; unit edge cases | pass |
| F-13 | layout: View menu + title toggle; Opt+Cmd+T; toolbar items; explore: menu keyboard open | pass for mouse; keyboard fails (D-02) |
| F-15 | layout: Fullscreen API called; real fullscreen toggle with Exit title | pass |
| F-16 (partial) | layout: title "Untitled" | pass (partial by design) |
| F-18 | preview: `#` anchor scrolls without navigating; http link opens new tab, preview stays; relative and `tel:` links do nothing | pass |
| F-81 | preview: Cmd+Z and Edit > Undo; empty-history no-op | pass |
| F-82 | preview: Shift+Cmd+Z and Edit > Redo | pass |
| F-87 | preview: Cmd+A and Edit > Select All | pass |
| F-88 | preview: Cmd+F and Edit > Find open the panel; matches highlighted; no match; Cmd+F focuses field; **Edit > Find does not focus field** | **fail (D-01)** |
| F-110 | samples: S-01, S-02, S-15, hr/image/reference link/hard break; unit | pass |
| F-111 | samples: S-04; unit: header-only, alignment | pass |
| F-112 | samples: S-05, S-06 (indented); unit: empty, escaping, unterminated, `~~~`, aliases | pass (see spec discrepancy SD-01) |
| F-113 | samples: S-12 on and off; unit | pass |
| F-114 | samples: P-10 on; unit: off | pass |
| F-122 | samples: S-01 ids; renumbering after edit; unit: levels 1 to 6, inline markup, nested | pass |
| F-134 | samples: S-14 on and off; unit | pass |
| F-135 | samples: S-14 raw div; spans/script pass through, script not executed; unit | pass |
| F-136 | preview: GitHub2 default applied; Solarized (Dark) and empty style; unit: list, empty/unknown | pass |
| F-139 | preview: doctype, charset, viewport, no title when untitled; unit: escaping and order | pass |

Coverage: every M2 F-ID above is covered. Not covered by automation: visual quality of the layout (checked by screenshot only on failure), and contrast.

### Defects

**D-01 — minor — F-88.** Edit > Find… does not put the keyboard focus in the search field.
- Steps: open the app, click the editor, open Edit, choose "Find…".
- Expected (spec §2.6 F-88, §3 Edit "Find… Cmd+F", CodeMirror search panel): same as Cmd+F, where the search field is focused and typing searches immediately.
- Actual: the panel opens but the field is not focused (focus goes back to the editor). Cause visible in `web/src/App.tsx`: `withView()` calls `v.focus()` after `openSearchPanel`. Cmd+F works.
- Evidence: e2e `F-88 Edit > Find... focuses the search field` (passes for Cmd+F in `F-88 Find focuses the search field (Cmd+F)`); screenshot `web/test-results/preview-F-81-F-82-F-87-F-8-b43b2-nd-focuses-the-search-field-chromium/test-failed-1.png`.

**D-02 — minor (accessibility; not a spec item) — F-13, F-09.** Menu bar titles and the Layout pull-down cannot be opened with the keyboard.
- Steps: focus a menu title (for example View) or the Layout button, press Enter.
- Expected: the menu opens (a button should be activated by Enter or Space). Spec §3 does not demand keyboard navigation, so this is logged as an accessibility basic.
- Actual: nothing opens. The buttons only handle `onMouseDown` (`MenuBar.tsx`, `Toolbar.tsx`), and `onClick` is not used for opening.
- Evidence: e2e `F-13 menu bar titles are operable from the keyboard`, `F-09 Layout pull-down is operable from the keyboard`.

**D-03 — minor (accessibility; not a spec item) — F-01.** The divider has `role="separator"` and `aria-valuenow` but is not focusable and has no keyboard resizing.
- Steps: Tab through the page; or read `tabindex` of `[data-testid=split-divider]`.
- Expected: a focusable separator that can be moved with arrow keys (the ARIA pattern for a value-carrying separator). Not required by the spec.
- Actual: no `tabindex`, no key handling.
- Evidence: e2e `F-01 divider is keyboard accessible (focusable separator)`.

Failure count: 4 failing e2e tests = D-01 (1 test), D-02 (2 tests: menu bar and Layout pull-down), D-03 (1 test).

### Spec discrepancies and questions (not defects)

- **SD-01 (S-05/S-06 code blocks, F-112).** The spec samples S-05 and S-06 were already annotated with the M1b correction. The implementation strips one trailing newline before `</code>`, which matches the source and the sample text. No difference was found by the tests. Nothing to fix. For S-06 with Prism, line numbers and `data-information` are M3.
- **SD-02 (S-04 alignment attribute).** S-04 shows `style="text-align: left"`; markdown-it may emit `style="text-align:left"`. The tests accept either form (structural comparison, as the spec allows).
- **SD-03 (README vs spec on F-02).** README states a 150 ms debounce, spec says "up to 0.5 s". The M2 acceptance criterion (under 300 ms) is met. Not a defect.
- **Q-01 (for the Chief of Staff).** Spec F-16 says the window title is the file name or "Untitled". The web app sets the browser tab title only. Confirm this is the intended meaning of "window title" for the web build.
- **Q-02.** F-07 says the item is "hidden when the preview is collapsed and no previous ratio exists". This state is reachable only by dragging the divider to the right edge. The implementation follows it; the test drags the divider to reach it. Confirm that hiding (rather than disabling) is intended in the web UI.

---

## M3 — Rendering parity (and M2 retest)

Date: 2026-10-17. Tester: test-engineer. No file under `web/src` was changed.

### Commands

```sh
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
cd web
npm run build       # tsc -b now includes tests/e2e, then vite build: PASS
npm test            # Vitest, 5 files
npm run test:e2e    # Playwright, Chromium
```

Type-check fix (task 2): removed the unused `mod` import in `tests/e2e/explore.spec.ts`, the unused `splitState` import in `tests/e2e/preview.spec.ts`, and changed `waitForLoadState('commit')` to `'domcontentloaded'` (line 344). `web/tsconfig.json` include is now `["src", "tests", "vite.config.ts", "playwright.config.ts"]`. `npm run build` passes with the E2E specs type-checked.

### Totals

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| Unit (Vitest): 182 existing + 23 independent | 194 | 11 | 0 |
| E2E (Playwright): 110 existing + 113 independent | 218 | 5 | 0 |
| **Total** | **412** | **16** | **0** |

All 16 failures are real defects (D-04 to D-08); none was weakened or skipped. Unit failures: D-05 (1), D-06 (1), D-07 (2), D-08 (7). E2E failures: D-04 (3), D-05 (1), D-07 (1).

Measured: a 353 669-character document (3000 sections, 12 000 blocks) is shown in the preview about 500-660 ms after paste (includes the 150 ms debounce); an edit at the top of that document takes about 0.8-1.0 s to appear; 400 Prism-highlighted code blocks with line numbers take about 530 ms.

### M2 retest

| Defect | Test(s) | Result |
|---|---|---|
| D-01 Edit > Find does not focus the field | `F-88 Edit > Find... focuses the search field` | verified fixed |
| D-02 menus and Layout pull-down not keyboard-operable | `F-13 menu bar titles are operable from the keyboard`, `F-09 Layout pull-down is operable from the keyboard`, builder's `D-02 ...` (3 tests) | verified fixed |
| D-03 divider not focusable | `F-01 divider is keyboard accessible`, `D-03 the divider is focusable and Left/Right resize` | verified fixed |

M2 sign-off: GO (all M2 tests pass).

### Builder tests: critical review

- Good: spec samples S-01 to S-15 and S-06b, §6.10 order, TOC/task/front-matter details, Prism run in jsdom.
- Weak: `style "<name>" is applied` only checks that one style tag with more than 500 characters exists, not that the styles differ (replaced by a computed-style distinctness test). E2E toggle tests cover only 5 extensions plus SmartyPants (tables, fences, autolink, footnotes, intra-emphasis, hard wrap were unit-only). `frame()` takes the first non-main frame, which breaks if the diagram runner frame comes first. The safety test only reads `window.__pwned` once and does not click or hover. No test checked the case-sensitive alias in the browser, theme differences, CDN absence with P-18 off, large documents, malformed input or hostile diagram labels. These gaps are covered by `m3-independent.spec.ts`.
- Oracle: Hoedown 3.0.7 was built from the sources and used as a differential oracle (see `docs/test-plan.md`). SmartyPants: 0 differences in 2500 random fragments. Superscript, quote, math, underline, highlight, strikethrough, autolink and footnotes agree on about 950 generated cases, except the defects below.

### F-ID results

| F-ID | Test(s) | Result |
|---|---|---|
| F-110 | samples S-01/S-02/S-15; m3-independent: empty, whitespace, CJK/emoji/RTL, nested lists in quotes, large document, no console errors with all features on; unit golden sets | pass; deep nesting fails (D-07) |
| F-111 | S-04; malformed tables; escaped pipe, code, emphasis; on/off/default | pass |
| F-112 | fenced on/off/default, `~~~`, empty and blank fences, escaping | pass |
| F-113 | S-12; scheme URLs, `www.`, e-mail; on/off/default | pass; bare file names and domains linked (D-05) |
| F-114, F-115, F-116 | on/off/default each; S-03; golden | pass |
| F-117 | S-09; numbering; back-links; on/off/default | pass; repeated reference (D-06) |
| F-118 | grammar `^word`, `^(a b)`, `^()`; on/off/default; golden | pass |
| F-119 | on/off/default; precedence over SmartyPants; golden | pass |
| F-120 | S-13; live toggle; unit golden vs Hoedown CLI (400 fixtures, 2500 fuzz) | pass |
| F-121 | on, off, live; U-03; golden | pass for default; off mode fails for nested content (D-08) |
| F-122 | S-01 ids, renumbering | pass |
| F-123 | case-insensitive, several tokens, depth 1-6, `#######`, level offset, after SmartyPants, inline markup, no headers, click scroll, off | pass |
| F-124 | P-20 on/off, no Prism request when off, escaping, empty fences, 8 themes distinct, unknown theme falls back, 400 blocks | pass |
| F-125 | 15 aliases, case-sensitive lookup (`JS`, `Python` not highlighted), first word only, on-demand loading, dependencies | pass |
| F-126 | rows per line, live toggle, P-22 on with P-20 off, indented block | pass |
| F-127 | S-06, S-06b, Custom split, empty info, Language name label for aliases | pass |
| F-128 | Mermaid on/off, needs P-20+P-24, bad diagram stays code and later ones render (accepted), hostile labels, runner sandbox | pass |
| F-129 | six engines + `gv` + `graphviz`, gating, bad source, hostile labels and `URL` | pass |
| F-130 | `\\(`, `\\[`, `$$`, MathML, P-18 gating live, no MathJax request when off, no CDN request, TeX specials, math in code, invalid TeX | pass |
| F-131 | `$x$` with P-19 on/off, P-19 without P-18 | pass; `\$` and `$` in raw HTML typeset (D-04) |
| F-132 | S-07, `[X]`, nested/ordered/loose, disabled and unclickable, live | pass |
| F-133 | S-11, off, malformed (4 forms), escaping, nesting, null | pass |
| F-134 | S-14 live on/off | pass |
| F-135 | 19 hostile vectors with all script features on, `javascript:`/`data:`/`vbscript:` clicks, MathJax `\href`/`\class`/`\style`, diagram labels, `data-information` injection, chrome unchanged | pass (nothing ran) |
| F-136, F-166 | six styles distinct, no style, default GitHub2, GitHub-2017 hidden, live switch, style order | pass |
| F-141 | live toggle of all extensions | pass |

### Go / no-go

**M3: GO with conditions.** No blocker. D-08 (major) should be fixed before sign-off; D-04 to D-07 are minor. Preview safety, MathJax locality, Prism, diagrams, styles and SmartyPants all behave as specified.

### Defects

**D-04 — minor — F-131 (spec §6.9, §6.3 F-131).** A backslash-escaped dollar and `$x$` inside a raw HTML block are typeset as math when P-19 is on.
- Repro: `?pref.htmlMathJax=true&pref.htmlMathJaxInlineDollar=true`, type `cost \$5 and \$6`, or `<div>$x$</div>`.
- Expected: literal `cost $5 and $6` and literal `$x$`. Hoedown turns `\$` into a plain `$`, converts only its own `$…$` to `\(…\)`, and the original MathJax 2 has no `$` delimiter [hoedown document.c:923].
- Actual: an `mjx-container` appears. Cause: MathJax 3 is configured with `$` as an inline delimiter (as spec §6.9 prescribes), so the leftover `$` is typeset.
- Evidence: `F-131 a backslash-escaped dollar (P-19 on) is plain text, not math`, `F-131 $x$ inside a raw HTML block ...`, `F-130 S-10 with escaped delimiter`.

**D-05 — minor — F-113 (spec §2.7, §6.3).** With P-09 on, bare file names and domains are linked.
- Repro: P-09 on, type `see README.md and main.py or example.com, foo.io`.
- Expected: no links (only `http://`, `https://`, `ftp://`, `www.` and e-mail, as Hoedown's autolink.c).
- Actual: four links such as `http://README.md` (linkify-it `fuzzyLink`). Also `www.a.b/c` is not linked and `foo.www.bar.com` is linked whole.
- Evidence: unit `F-113 bare file names and domains are not linked (D-05)`; e2e `F-113 autolink: only http(s)://, ...`.

**D-06 — minor — F-117 (spec §6.5).** A second reference to the same footnote is rendered as another superscript with a duplicate id.
- Repro: `A[^1] B[^1]` plus `[^1]: N`.
- Expected: Hoedown renders a footnote only at its first reference; the second stays literal `[^1]` [hoedown document.c:1133].
- Actual: two `<sup id="fnref1">` (duplicate ids).
- Evidence: unit `F-117 a repeated reference of the same footnote stays literal text (D-06)`.

**D-07 — minor — F-110 (spec §6.1 step 2: maximum nesting is unlimited).** markdown-it's default `maxNesting` of 100 stops nesting early.
- Repro: 60 nested `- ` list levels (or 120 `>`).
- Expected: 60 `<li>` (120 blockquotes).
- Actual: 50 `<li>`; deeper levels become text.
- Evidence: unit `F-110 60 nested lists ...`, `F-110 120 nested blockquotes ...`; e2e `F-110 deeply nested blockquote / list does not crash the app`.

**D-08 — major — F-121 (spec §6.3 F-121).** With P-17 off, emphasis at the start of nested content is not recognised.
- Repro: P-17 off, type `[*a*](u)`, `**_a_**`, `"_a_"`, `~~_a_~~`, `==*a*==`.
- Expected: Hoedown parses nested content on its own, so the opener is allowed: `<a href="u"><em>a</em></a>`, `<strong><u>a</u></strong>` and so on.
- Actual: literal `*a*` and `_a_` (the rule looks at the character before the nested content). Also `~~~b~~~` gives `~<del>b</del>~` where Hoedown leaves it literal.
- Evidence: unit `F-121 off: ...` (7 tests).

### Spec discrepancies and questions

- **SD-04.** Spec §6.9 prescribes `['$','$']` as a MathJax inline delimiter when P-19 is on. Together with the Markdown stage (which already writes `\(…\)`) this causes D-04. Suggest dropping `$` from the MathJax config.
- **SD-05.** Spec §6.3 F-113 says `linkify: true + linkify-it`, which links bare domains and conflicts with the F-113 description (D-05).
- **SD-06.** Spec §6.10 includes `show-information.css` regardless of P-20, but the label (`pre[class*='language-'][data-information]`) only shows when Prism adds the class, so Custom without P-20 shows nothing. The implementation matches the original; the spec should say so.
- **Q-03.** Spec §6.1 says `data-information` and raw HTML are not escaped. That is faithful, but Copy HTML and export (M5) will carry attacker-controlled markup. Confirm that is accepted.
- Observations, not defects: in dark styles the Mermaid forest CSS and the Graphviz white background look poor (same as the original); markdown-it flanking rules differ from Hoedown next to punctuation (`b_>__1`), and `^^(` unclosed gives an empty `<sup>`; both are covered by the accepted core deviations.

---

## M4 - Editing features (and M3 retest)

Date: 2026-10-18. Tester: test-engineer. No file under `web/src` was changed. Files added: `web/tests/unit/m4-independent.test.ts` (163 tests), `web/tests/e2e/m4-independent.spec.ts` (432 tests). `docs/test-plan.md` has an M4 section.

### Commands

```sh
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
cd web
npm run build       # PASS
npm test            # Vitest, 9 files
npm run test:e2e    # Playwright, Chromium, webServer on :5173
```

No other vite or playwright process was running. The 16-minute freeze did not occur (load average about 10 during the runs, 2.5 minutes for E2E).

### Totals

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| Unit (Vitest): 331 existing + 163 independent | 494 | 0 | 0 |
| E2E (Playwright): 344 existing + 432 independent | 771 | 5 | 0 |
| **Total** | **1265** | **5** | **0** |

E2E duration: 150 s (2.5 min). The 5 failures are 4 real defects (D-09 to D-12, below); no assertion was weakened and none was skipped. Every builder test still passes.

### M3 retest (D-04 to D-08)

| Defect | Result |
|---|---|
| D-04 | Verified "not a defect". The bundle's `MathJax/init.js` (and `vendor/macdown/.../MathJax/init.js`) only sets `showProcessingMessages` and `messageStyle`; the MathJax 2.7.3 `config/TeX-AMS-MML_HTMLorMML.js` downloaded from cdnjs contains `tex2jax: inlineMath:[["\\(","\\)"]], displayMath:[["$$","$$"],["\\[","\\]"]]`, so there is no `$` delimiter. My M3 tests already asserted the original behaviour (literal `\$5`, literal `$x$` in raw HTML, 0 `mjx-container`), so no test needed changing. Added 3 browser tests (raw `\(y\)` typeset, `$x$` literal, `$x^2$` typeset only via the Markdown stage with P-19, `$$` display). Pass. |
| D-05 | Fixed: `README.md` and `example.com` not linked; `www.` and `http://` linked. Pass. |
| D-06 | Fixed: one `<sup>`, second `[^1]` literal. Pass. |
| D-07 | Fixed: 60 nested list levels and 120 blockquotes render. Pass. |
| D-08 | Fixed: `[*a*](u)`, `**_b_**`, `~~_c_~~`, `==*d*==`, `"_e_"` and `snake_case_word` with P-17 off. Pass. |

M3 sign-off: GO (all M3 tests pass).

### Builder tests: critical review

- Good: exact text and selection through `window.macdownEditor`, the E-case table, P-36/P-37/P-40 flows, the width formula, all 15 themes against their background colour.
- Weak: the theme test reads the expected background from the same `.style` file the app bundles (circular) and checks only the background and H1 size; commands were tested through the keyboard for 12 of 22 commands, through the menu for 12, with the focus always in the editor (the hook's `set()` focuses it); undo only for Strong; no test of multi-line selections with empty lines for toggles, no clipboard matrix beyond 7 values, no Customize beyond one item, no Tab/Shift+Tab/Backspace/Return matrix over P-36/P-37/P-38/P-39, scroll past end only monotonic, no toolbar geometry, icons or accessibility, no Edit menu coverage of Find items or Transformations undo.
- My additions cover these gaps. I wrote a second transliteration of NSTextView+Autocomplete.m and MPDocument.m on a small NSTextView model and ran 4000 random documents and selections per command against `src/editor/text.ts` (28 commands, selection included): 0 differences. A mutation of the reference was caught by the fuzz, so it is sensitive. The theme test parses the original `.style` files from `vendor/macdown` and checks colours, caret, selection, weight, italic and size for 20 elements in each of the 15 themes (computed styles).

### F-ID results

| F-ID | Test(s) | Result |
|---|---|---|
| F-40 to F-46 | unit toggles + fuzz; E2E each command via keyboard, menu, toolbar, keyboard in preview, menu after preview; labels; undo/redo per command | pass |
| F-47 to F-53 | same; unit header cases (existing prefixes, `#foo`, empty/whitespace lines, selection shift) | pass |
| F-54 | E22 and U-05 unit and E2E (digits, mixed lines, `1 z`, empty lines); stable double toggle | pass |
| F-55, F-56, F-80 | unit quirks (trailing newline, selection end after newline), P-45, E13 | pass |
| F-57, F-58 | unit (empty lines, final empty line, `"  \t"`, 5 spaces, whitespace-only), E14, E23 at every cursor position, Tab/Shift+Tab | pass |
| F-59, F-60 | 19 clipboard values x link and image, menu, toolbar, no permission, empty selection, multi-line, toggle off, clipboard re-read, one undo step | pass |
| F-61 | 11 cases, undo, menu | pass |
| F-62 to F-65 | E1 to E5, E15, E16; boundary set; every pair; typing flows; wrap/skip/delete; selection start between pair | pass, except typed `<b>` (D-09) |
| F-66 to F-69 | E6 to E9, E18, E19, E21; matrix P-38 x P-39 (about 50 rows); undo | pass |
| F-70 to F-73 | Tab (P-37 on/off, 14 rows), Shift+Tab (16 rows), Backspace matrix (23 rows), smart Home (11 rows, wrapped lines, Shift) | pass |
| F-74, F-166 | 15 themes + no theme, live switch, 15 distinct looks | pass for all colours; block-level HTML comment not coloured (D-10) |
| F-75 to F-77 | font, line pitch (0, 3, 8, 20), insets (0, 35, 15x30, 5x20) incl. text position | pass |
| F-78 | 0.45 formula for 3 widths, boundary (`width = 2*inset + max` and one pixel more), resize, switched off | pass |
| F-79 | short document, long document, off, last line reaches the top area | pass (see SD-09) |
| F-13 | hide/show via menu, shortcut (editor and preview focus), start hidden, undo history kept, commands still work | pass |
| F-14, U-08 | order, 5 flexible spaces equal, geometry, sizes 33 / 37x27 / 19x19, tooltips, icons byte-equal to bundle, narrow widths, Customize items, default set, close paths, right click | pass, except D-11 and D-12 |
| F-39 | existing builder test (Copy HTML) | pass |
| F-81 to F-93 | menu items, shortcuts, Undo/Redo, Select All from the preview, Cut/Copy/Paste (incl. no permission), Delete, Find family | pass |
| F-96 | checkable item, both directions, P-46 at start | pass |
| F-105 to F-107 | menu, multi-line, undo | pass |
| F-162 | hidden items and dead shortcuts for underline, strikethrough, highlight; live on; toolbar always works; Cmd+U inert | pass |
| M3 D-04 to D-08 | see above | pass |

Coverage: every M4 F-ID is covered. Not covered by automation: IME composition (F-62 rule 0), real Option/Cmd shortcuts on non-Mac layouts, persistence of toolbar and theme (M5), contrast ratios of the themes (copied from the original).

### Defects

**D-09 - minor - F-64 / F-62 (spec section 5.1 rules 2 and 3).** With P-36 on, typing an HTML tag inserts a stray closing tag.
- Repro: `?pref.editorCompleteMatchingCharacters=true`, empty editor, type `<b>`.
- Expected: `<` gives `<|>`, `b`, then `>` skips over the `>` (rule 3): `<b>|` (original: NSTextView+Autocomplete.m:116-172, no tag completion).
- Actual: `<b>|</b>`. Typing `<b>x</b>` gives `<b>x</b>|</b>`.
- Cause (observed): lang-html's closing-tag input handler (from `@codemirror/lang-markdown`) runs before the app's `EditorView.inputHandler` in `editorBehaviours()`, which is not wrapped in `Prec.highest` (only its keymap is). Off by default; undo removes it.
- Evidence: `F-64 typing an HTML tag: the > typed over the auto-inserted > must not add a closing tag` (fails).

**D-10 - minor - F-74 (spec section 7.2, element COMMENT).** An HTML comment that forms its own block is not coloured with the theme's COMMENT style; an inline comment is.
- Repro: theme Tomorrow+, type `para`, blank line, `<!-- c -->`, blank line, `para`. Also the result of Format > Comment on a whole line.
- Expected: COMMENT colour `888888` (peg-markdown-highlight `pmh_grammar.leg:365-366, 614-615`: `HtmlBlock` contains `HtmlComment`, which adds `pmh_COMMENT`; no bundled theme styles HTMLBLOCK, so the comment style is the only one).
- Actual: no styled span, text in the editor foreground colour (`CommentBlock` nodes get no style; `Comment` nodes inside paragraphs do).
- Evidence: `F-74 a block-level HTML comment ...`, `F-74 Format > Comment on a whole line ...` (fail); screenshot `web/test-results/m4-independent-F-74-editor-7371c--HtmlBlock-HtmlComment-does-chromium/test-failed-1.png`.

**D-11 - minor (accessibility) - F-14.** The Customize Toolbar dialog declares `aria-modal="true"` but does not trap the keyboard focus.
- Repro: View > Customize Toolbar, press Tab once after the initial focus (Done button).
- Expected: focus cycles inside the dialog (a modal sheet in the original).
- Actual: focus leaves the dialog and goes to page elements behind it.
- Evidence: `F-14 the dialog is modal and accessible ... Tab stays inside` (fails at Tab 1).

**D-12 - minor - F-14.** Unchecking the last remaining item turns the toolbar back into the default set.
- Repro: open the dialog and uncheck the ten default items one by one.
- Expected: an empty toolbar (NSToolbar allows removing every item; spec F-14 "all 13 items are allowed").
- Actual: after the last uncheck the default set returns and all boxes are checked again ("Clicking the checkbox did not change its state"). Cause: an empty `toolbarItemIdentifiers` list means "default set" (README), and the dialog stores `[]`.
- Evidence: `F-14 unchecking every item one by one leaves an empty toolbar ...` (fails).

### Spec discrepancies and questions

- **SD-07 (F-166).** The spec says "no theme" gives "an editor with no theme colours". In the source, `highlighter.styles = nil` selects `getDefaultStyles` (HGMarkdownHighlighter.m:435-461, 487), so Markdown elements still get the default palette (dark blue headers and so on). The app does this and a test verifies the HSB values; the spec text should say so.
- **SD-08 (F-58, original quirk).** Shift Left on a whitespace-only line leaves the text unchanged but still moves the cursor left by the counted shift (NSTextView+Autocomplete.m:437-455). Likewise Shift Right on an empty last line indents nothing (`lastObject isEqualToString:padding` becomes ""). The app reproduces both; the spec could note them.
- **SD-09 (F-79).** I compiled a probe against AppKit (scratchpad `m4/lm.m`, Menlo 14, spacing 3). `boundingRectForGlyphRange` of an empty range at the end of the text returns one line height (16 pt), so `trailingHeight` is one line (without spacing) when the text has no trailing whitespace; with trailing newlines it includes the extra empty line fragment (for `a\nb\nc\n` it is 35 pt, two lines). The spec formula ("height of trailing blank lines") and the app give 0 when nothing trails, so the bottom padding differs by at most one line (about 16 px) from the original. Not treated as a defect. Question for the CoS: follow the spec text or the AppKit measurement?
- **Q-04 (Shift+Return).** The spec is silent. The app inserts a plain newline without list continuation (CodeMirror default). Confirm intended.
- **Q-05 (Transformations with an empty selection, F-105 to F-107).** The spec gives no rule; the app transforms the word around the cursor ("inferred" in `text.ts`). Capitalize uses whitespace-delimited words. Confirm.
- **Observation.** Format shortcuts pressed while the Find field has the focus act on the editor selection (as in the original, where the responder chain reaches the document). CodeMirror merges typing that follows a command within 500 ms into the command's undo event, so Cmd+Z right after "Cmd+B, type" undoes both; the command itself is always one step.

### Go / no-go

**M4: GO with conditions.** No blocker or major defect. All 22 Format commands, editor behaviours, the 15 themes, appearance options, toolbar, Edit menu and the M3 fixes behave as specified. Fix D-09 (stray closing tag with P-36) before sign-off; D-10 to D-12 are minor and can follow with M5. The 5 failing tests stay as they are and will pass once the defects are fixed.


---

## M5 - Files, preferences, export, print, help (and M4 retest)

Date: 2026-10-18. Tester: test-engineer. No file under `web/src` was changed. Files added: `web/tests/unit/m5-independent.test.ts` (106 tests), `web/tests/e2e/m5-independent.spec.ts` (215 tests). `docs/test-plan.md` has an M5 section. Probes (Objective-C, macOS) are in the tester scratchpad `m5/`.

### Commands

```sh
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
cd web
npm run build       # tsc -b (src, tests, configs) + vite build: PASS
npm test            # Vitest, 11 files
npm run test:e2e    # Playwright, Chromium, webServer = vite dev on :5173 (6 workers)
```

No other `vite` or `playwright` process was running at the start of any run (my own exploratory servers were stopped first). No freeze or slowdown occurred.

Baseline before my additions (Chief of Staff's state, re-run by me): build pass, unit 525/525 (0.9 s), E2E 830/830 in 1.7 min. Final run of everything together (`npm run build && npm test; npm run test:e2e`): 177 s wall time.

### Totals (final run)

| Suite | Existing | Added by me | Passed | Failed | Skipped |
|---|---|---|---|---|---|
| Unit (Vitest) | 525 | 106 | 630 | 1 | 0 |
| E2E (Playwright), 2.9 min | 830 | 215 | 1031 | 14 | 0 |
| **Total** | 1355 | 321 | **1661** | **15** | **0** |

All 15 failures are intentional evidence of defects D-13 to D-20 (below). No test was weakened, skipped or deleted. Every builder test and every earlier independent test passes. While writing the suite, a few of my own tests were wrong or racy and were corrected before the final run (wrong selectors for aliased `language-javascript`, YAML with an unquoted colon, a Save pressed in the same task as a programmatic text change, a 5 s poll that was too short for a 4 MB export under 6 workers); none of those corrections touched an assertion about the app's behaviour.

### M4 retest (D-09 to D-12)

| Defect | Result | Evidence |
|---|---|---|
| D-09 typed `<b>` adds a closing tag | **Verified fixed** | `F-64 typing an HTML tag: the > typed over the auto-inserted > must not add a closing tag` passes; extras: `<b>x</b>`, `<div class=a>`, `<br/>`, P-36 off |
| D-10 block HTML comment not coloured | **Verified fixed** | the two `F-74` tests pass; extra: the COMMENT colour from the `.style` file in Tomorrow+, Solarized (Dark), Mou Paper, Writer+ |
| D-11 Customize dialog does not trap Tab | **Verified fixed** | `F-14 the dialog is modal ...` passes; extra: 30 Tab and 30 Shift+Tab stay inside, Escape returns the focus to the editor |
| D-12 unchecking the last item restores the default set | **Verified fixed** | `F-14 unchecking every item one by one ...` passes; extra: stored as `[]`, survives a reload, Customize still reachable from View with an empty toolbar, Use Default Set stores `null` |

Spec section 13 items 83 to 92: 83 to 86 above; 87 (SD-07) and 88 (SD-08) pass in the existing M4 suite; 89 (SD-09) and 90 (Q-04) below; 91 (Q-05) re-verified with a new AppKit probe (`tr.m`, 13 cases, for example `ab| cd` -> `«AB» cd`, `ab |cd` -> the space only, `ab\n|cd` -> `ab\n«CD»`, `hELLO wORLD-x` -> `Hello World-X`) and each case is one undo step in the app; 92 (undo isolation) verified: after Cmd+B and typing, Cmd+Z undoes only the typing.

### Review of the two edits to `tests/e2e/m4-independent.spec.ts`

- **Q-04 (Shift+Return continues the list): CONFIRMED.** Source: `MPDocument.m:702-712` maps only the selector `insertNewline:` to `textViewShouldInsertNewline:`. My own AppKit probe (`ret.m`, `-[NSTextView interpretKeyEvents:]` with synthetic key events, a subclass logging `doCommandBySelector:`): Return, Shift+Return, keypad Enter and Shift+keypad Enter all send `insertNewline:`; Opt+Return sends `insertNewlineIgnoringFieldEditor:`; Ctrl+Return sends `insertLineBreak:`. The edited test expects `'* a\n* |'`, which is right. I added a test that covers Return, Shift+Return and keypad Enter on bullet, quote and numbered lines (`F-66 (Q-04) ...`), plus Opt+Return as a no-crash check.
- **F-79 (one line of trailing height subtracted): CONFIRMED.** My M4 probe (`m4/lm.m`, re-run today) gives `boundingRectForGlyphRange` of the trailing range: 16.00 pt for `a\nb\nc`, 35.00 pt for `a\nb\nc\n`, 73.00 pt for `a\nb\nc\n\n\n` (Menlo 14, spacing 3). The edited test subtracts `14 * 1.17 = 16.38` px (CodeMirror's line height) with a 1 px tolerance, which matches the probe's 16 pt within the tolerance. The edit only covered the no-trailing-newline case, so I added the trailing-newline case (`F-79 (SD-09) ... trailing newlines add the extra empty line fragment`), which passes.

### Builder tests: critical review

- Good: broad coverage of the happy paths (all File commands with the mocked picker, both fallbacks, F-30 and F-31 basics, prompts, P-01 and P-02 flows, label and order checks of the three panes, `?pref.` overrides, export asset gating, Copy HTML, help and first launch); unit tests for the pure document and export functions.
- Weak or missing (covered by my files): only one invalid-UTF-8 input and no BOM, CRLF, NUL or UTF-16 case; two F-31 cases (the highest-level rule, setext, `#nospace`, tab separator, front-matter variants were not tested); the export tests did not compare the embedded assets with the original (they checked substrings such as `Prism`), not the asset order, not Prism theme files, not the line-numbers and show-language plugins, and not that the exported page works when opened on its own; the print test checked a string in the adopted style sheet, not that it is a page rule, and nothing proved Chromium honours it; numeric field tests covered one field; no test of stepper keys, the P-35 minimum, import errors, a broken theme, `storage` events, corrupt preference stores; one drag-and-drop test only (no JPEG byte check, no second file, no PNG, no drop outside the editor, no non-UTF-8 drop); no hostile-file or hostile-file-name test; no test that commands with no document (P-02 off) are inert; the help tests did not follow the help document's own links; no keyboard-focus checks after document commands.
- Style: several tests wait on `toHaveTitle` implicitly through `await queueOpen(...)`; none was found to be weak enough to hide a defect in what it claims.

### What was tested independently (summary)

Details are in the test names (`F-xx ...`). Highlights: 15 UTF-8 decode cases and 15 refusals, each checked against the Foundation probe `enc.m`; 18 presumed-name cases through both the Export panel and the Save panel; byte-for-byte comparison of every embedded asset of the HTML export with `/Applications/MacDown.app` for 8 combinations of (P-20, Include styles, Include syntax highlighting) with Mermaid, Graphviz, MathJax, task lists, line numbers and the language label on; the exported page opened on its own (Prism tokens, line numbers, Mermaid and Graphviz SVG, clickable checkboxes, no page errors); `@page { margin: 50pt 0pt }` verified as a CSS page rule in the preview document and, in Chromium, as a real PDF (rasterised with `sips`: block starts 50 pt from the top, ends 50 pt from the bottom, touches both sides); Copy HTML from the menu, the toolbar and Opt+Cmd+C (single `text/plain` item, body only, no Prism tokens, no `disabled` task checkboxes, no MathJax markup); a hostile `.md` (10 vectors with every script feature on) stays inert, nothing runs in the app origin from export or Copy HTML, a hostile file name is escaped in `<title>`; every in-scope menu item, order and shortcut glyph against spec section 3; the Preferences window labels, order, enablement, ranges, live apply, persistence and overrides.

### Defects

**D-13 - major - F-22 / F-26 / F-34.** A file with CRLF line endings is silently converted to LF as soon as it is edited and saved, and its edited state never clears.
- Repro: open a file whose bytes are `a\r\nb\r\n` (File > Open or drop), type `c` at the end, Save.
- Expected: spec section 1 "Reads and writes UTF-8" with the original's behaviour: `readFromData:` uses `initWithData:encoding:` and `dataOfType:` uses `dataUsingEncoding:` [MPDocument.m:540-551] and NSTextView keeps the text as read; Foundation probe `enc.m`: CRLF stays `000d 000a`. The saved file must be `a\r\nb\r\nc`; after typing `z` and Backspace the title must be `win.md`, not `win.md - Edited`.
- Actual: CodeMirror's document uses `\n` (no `lineSeparator` is configured in `editor/setup.ts`/`Editor.tsx`), so the text read back from the editor is `a\nb\nc`; the saved bytes are LF only, and `isEdited` compares the LF text with the CRLF saved text, so the document stays "Edited" after undoing to the original content.
- Evidence: `F-22 a CRLF file keeps its line endings through an edit and Save`, `F-34 a CRLF file typed in and back out is not "Edited"`.

**D-14 - minor - F-25 / F-29 / F-32.** With P-02 off, closing a document leaves its text in the draft, and it comes back when P-02 is switched on again.
- Repro: Preferences > General, uncheck "Ensure open document on launch"; type `discard me`; File > Close > Don't Save (the empty state shows); check P-02 again; reload.
- Expected: the closed document is gone (spec F-25 closes the document; F-29 keeps a draft of the current document): a blank document.
- Actual: `localStorage["macdown.draft"]` still holds `discard me` (the autosave effect only runs for an open document), and the next launch restores it as `Untitled - Edited`.
- Evidence: `F-25 / F-29 closing a document with P-02 off must not bring the discarded text back when P-02 is switched on later`.

**D-15 - minor - F-18 / F-153.** In-page links to `<a name="...">` anchors do nothing, so the seven in-page links of the bundled help document (to five `name` anchors) are dead.
- Repro: Help > MacDown Help, click "Markdown preference pane" (`#markdown-pane`); or any document with `[go](#target)` and `<a name="target"></a>`.
- Expected: spec F-18 "in-page `#` anchors scroll"; WebKit follows `name` anchors, and `help.md:190, 219, 261, 309, 316` define their targets only as `<a name=...>`.
- Actual: no scroll. `components/Preview.tsx:89-92` looks the target up with `getElementById` only.
- Evidence: `F-18 a link to an <a name="..."> anchor scrolls the preview`, `F-153 in-page anchors of the help document scroll the preview`, `F-18 / F-153 every in-page link of the bundled help.md ...` (an `id` anchor works: control test passes).

**D-16 - minor - F-18.** An in-page link with a malformed percent escape throws an uncaught `URIError`.
- Repro: Markdown `<a href="#100%">x</a>` (or `#%E0%A4%A`), click the link in the preview.
- Expected: no error (the link finds no target and does nothing).
- Actual: `URIError: URI malformed` at `Preview.tsx:90` (`decodeURIComponent` is not guarded), reported as a page error.
- Evidence: `F-18 an in-page link with a malformed percent escape does not throw`.

**D-17 - minor - F-31 / E-04.** The file name "without extension" strips text after any last dot, even when it is not an extension.
- Repro: open or name a file `Notes v1.5 final`, `a.`, or `v1. final`; Export HTML (panel name, `<title>`) or Save As.
- Expected: spec F-31 (1) `stringByDeletingPathExtension` [MPDocument.m:1867]. Foundation probe (`pe.m`, `pe2.m`): `a.` -> `a.`, `v1. final` -> `v1. final`, `Notes v1.5 final` -> `Notes v1.5 final`, `a.md.` -> `a.md.`, `a.m d` -> `a.m d` (an extension is non-empty and has no space).
- Actual: `document.ts stripExtension` gives `a`, `v1`, `Notes v1`, `a.md`, `a`.
- Evidence: unit `F-31 / F-16 file name handling > stripExtension: a last dot that is not followed by a valid extension is not stripped`.

**D-18 - minor - F-29.** When a draft is too large for localStorage the previous draft stays and is restored later.
- Repro: type or paste a 2.7 million character document (draft stored), then make it 5.4 million characters.
- Expected: either the newest text is stored or no stale draft remains (spec F-29 "restore on reload").
- Actual: `setItem` fails silently; the 2.7 million character draft stays and a reload restores the older text.
- Evidence: `F-29 a draft too large for localStorage must not leave an older draft behind to be restored later`. (A document opened from a file stores its saved text as well as its current text in the draft, so it reaches the limit at roughly half the size.)

**D-19 - minor - F-16.** The remembered split ratio of a named document is not applied when that document is restored at launch.
- Repro: open `one.md`, View > Left 1:3 Right, reload.
- Expected: spec F-16 "split ratio is remembered per document": 0.25.
- Actual: 0.5. The ratio is applied by `switchTo` (Open) but not for the launch document (`App.tsx initialDocuments`).
- Evidence: `F-16 the split ratio is remembered per file name, independently, and restored after a reload of the named draft` (the per-name memory itself passes up to the reload).

**D-20 - minor (usability / accessibility) - F-21 / F-22 / F-25 / F-28 / F-153.** After New, Open, Revert, Help or Close the keyboard focus is on `<body>`, so typing does nothing until the editor is clicked.
- Repro: File > New (Don't Save), then type; same after Open, Revert, Help, Close.
- Expected: the new document's text view is the first responder (AppKit's default for a new document window; the web app already focuses the editor after the save prompt and after Find).
- Actual: `document.activeElement` is `BODY`. `App.tsx replaceWith` focuses the old editor view before the new `Editor` (keyed by document id) mounts.
- Evidence: the five tests in `focus after document commands`.

### Observations (not defects)

- **O-01** Save and Export read `textRef.current`, which is assigned during React's render. A Save fired in the same task as a text change saves the previous text (probe: gap 0 ms stale, 5 ms and 20 ms current). Human typing is not affected.
- **O-02** F-20 (accepted): the written preview document inherits the app's base URL, so a relative image `pic.png` is requested from the app origin (`http://localhost:5173/pic.png`) instead of staying unresolved. Links do nothing, as documented.
- **O-03** `saveDocument` swallows every picker error that is not an abort: if a real `showSaveFilePicker` rejects the suggested name (a front-matter title such as `a/b: c` is used as is, F-31), Save does nothing and shows no message. Real picker behaviour could not be tested in headless Chromium.
- **O-04** With no document (P-02 off) the hidden editor stays in the DOM (`hidden`), harmless.
- **O-05** F-36 / F-37: the browser print dialog cannot be opened in headless Chromium. The in-app path (`print()` on the preview document, the presumed name as page title, `@page { margin: 50pt 0pt }` as an adopted sheet) is tested, and the same rule printed from a top-level Chromium page gives the expected 50/0 pt margins. A manual check in a real browser is still advisable (Firefox and Safari have no File System Access API, so only the fallback path applies there).
- **O-06** The README "Type check" bullet says `tests/e2e` is excluded from `tsc -b`; `tsconfig.json` includes `tests` and `npm run build` type-checks the E2E specs.

### Spec discrepancies and questions for the Chief of Staff

- **SD-10 (F-18, section 2.1).** Say that in-page links also target `<a name>` anchors (the original help document needs it). Recommend fixing D-15 rather than changing the help text.
- **SD-11 (section 1, F-22 / F-26).** The spec says only "Reads and writes UTF-8". Probe results to add: a leading UTF-8 BOM is dropped on reading and never written; CRLF and lone CR are preserved; embedded NUL is kept; any invalid sequence (including encoded surrogates, overlongs and UTF-16 input) fails with the "could not be opened" error. The app already does all of this except CRLF (D-13). Please confirm that line endings must be preserved (the original does), or decide on a normalisation.
- **SD-12 (U-12).** Still marked open. The implemented and tested mapping (checked = last draft or blank document; unchecked = empty state with New and Open, menu commands disabled) is coherent; recommend marking it resolved, and deciding D-14 (the draft after Close with P-02 off).
- **SD-13 (F-31).** The original returns the front-matter `title` description even when it is empty (`""`) or null (`<null>`), and would fail on a non-mapping front matter. The app falls back to the header in those cases. The spec is silent; the app's behaviour is saner, please confirm.
- **SD-14 (section 3 / F-26).** The Save panel name rule (a presumed name that already ends with `.md` leaves the default `Untitled.md`) is faithful to `prepareSavePanel:` and tested, but looks like an original quirk worth a sentence in F-26.
- **SD-15 (F-36 / F-37).** The spec asks for "Save as PDF" through the print dialog; the file name cannot be verified automatically (Chromium uses the page title). Documented in README; no action.

### Go / no-go

- **M5: GO with conditions.** Every M5 feature works as specified in the main flows: files (New, Open, Save, Save As, Revert, Close, both the File System Access path and the fallbacks), dirty state and title, F-31 names, strict UTF-8, autosave and P-02, drag and drop, help in front of the document, all four preference panes with live apply, persistence, overrides, import, zoom, HTML export (assets identical to the original's), print and Copy HTML, About, security. D-13 (major, silent CRLF to LF conversion on save) should be fixed or explicitly accepted by the Chief of Staff before sign-off; D-14 to D-20 are minor and can follow.


---

## Final regression (whole spec, M2 to M5)

Date: 2026-10-18. Tester: test-engineer. Build under test: `web/` working tree, unchanged by the tester.

### Runs

| Command | Result |
|---|---|
| `npm run build` | PASS (tsc -b over `src`, `tests`, configs; vite build; one 1.8 MB MathJax chunk, as before) |
| `npm test` | 631 tests, **630 passed, 1 failed** (D-17), 11 files, 0.9 s |
| `npm run test:e2e` | 1045 tests, **1031 passed, 14 failed** (D-13 to D-16, D-18 to D-20, see M5 section), 0 skipped, **2.9 min** with 6 workers |
| everything together (`npm run build && npm test; npm run test:e2e`) | 177 s wall time |
| Baseline from the Chief of Staff's state, re-run by me before adding tests | build pass, unit 525/525, E2E 830/830 in 1.7 min (1:45) |

Totals: 1676 tests, 1661 passed, 15 failed, 0 skipped. Every failing test names a defect; no passing test was changed to pass.

### M2 to M4 defect status

| Defect | Status |
|---|---|
| D-01 to D-03 | fixed (verified in M3) |
| D-04 | not a defect (M4) |
| D-05 to D-08 | fixed (verified in M4) |
| D-09 to D-12 | fixed (verified in M5) |
| D-13 | fixed (verified in the final sign-off) |
| D-14 to D-20 | fixed (verified in the final sign-off) |

### Exploratory pass (production build, real browser run)

`npm run build && npm run preview` (served on :4173), driven with Playwright (Chromium, 1280x800, a fresh profile). Script: scratchpad `m5/x1.mjs`; screenshots in `m5/shots/`.

- First launch opens the help document; File > Close brings the blank document.
- A rich document (front matter, TOC, strikethrough, highlight, autolink, footnote, task list, table, a JavaScript block with line numbers and the language label, a Mermaid diagram, a Graphviz diagram, `\\(x^2\\)` and `$$ y = x $$`) rendered correctly with every Rendering option on; word count shown.
- All four Preferences panes opened and photographed: labels, grouping, control order and enablement look like the original's panes (Editor: Base font preview "Menlo Regular - 14.0", Theme with Reveal (disabled) / Reload / Import…, Behavior group; Rendering: indented sub-options, note "Math support requires Internet connection.", Default path). No overlap or clipping.
- Export HTML with everything on, in the production build: 4.4 MB file, 12 script tags, 5 style tags, saved as `Demo.html` (front-matter title); opened on its own page it highlighted the code (4 tokens) and drew both diagrams (2 SVGs).
- View menu: all splits, hide and restore of both panes, Customize Toolbar dialog, Find panel, About, narrow window (700x600: the toolbar and both panes stay usable), full screen toggled on and off, Help and Contributing in front of the rich document, Close back to it.
- **Console and page errors during normal use: none** (also none for the 4 MB export and all diagrams). No failed or 4xx requests.
- Problems found in this pass (all logged above): focus lost after document commands (D-20), stale draft after an over-quota document (D-18). No visual problems found.

### Coverage of every In F-ID

Statuses: **tested-pass** = at least one passing test exercises the feature as specified (the Result column says when a test of that ID fails); **partial** = part of the behaviour cannot be automated, or is a documented deviation, or a sub-behaviour fails; **untested** = no test. Counts are the number of distinct E2E / unit tests whose title names the ID (a title such as `F-40 to F-61 ...` counts for every ID in the range). The names are two representatives; the full list is in the test titles.

Summary: 132 In F-IDs (the 115 of the Scope column plus the 17 rendering rows whose scope is in their own table) = **125 tested-pass, 7 partial (F-16, F-18, F-20, F-36, F-37, F-62, F-130), 0 untested**. F-ID results with a failing test: F-16, F-18, F-21, F-22, F-25, F-28, F-29, F-31, F-34, F-153 (defects D-13 to D-20). The Out IDs were checked in the menus and the Preferences panes: none is offered, except the disabled Reveal buttons (F-137, as designed).

Section 3 (menus): every item of the MacDown, File, Edit, View, Format and Help menus is covered (`section 3 ... menu: items, order and shortcut glyphs`, with shortcut glyphs typed from the spec, and shortcut look-alike tests). The Window and Plug-ins menus are Out and absent. Section 2 traceability in `web/README.md`: every In F-ID has a row or is inside a row's range; no In F-ID is missing.

| F-ID | Status | Result | E2E / unit tests | Representative tests |
|---|---|---|---|---|
| F-01 | tested-pass | pass | 8 / 1 | explore: F-01 no console errors or page errors during a normal editing s…; layout: F-01 starts with editor left, preview right, about 1:1, both vi… |
| F-02 | tested-pass | pass | 8 / 0 | explore: F-02 typing while the preview is hidden, then restoring shows c…; m3-independent: F-02 very large document: preview updates, with time recorded |
| F-03 | tested-pass | pass | 2 / 0 | preview: F-03 with auto-update off, typing does not update; View > Rende… |
| F-04 | tested-pass | pass | 2 / 0 | layout: F-04 View menu split-1-3 sets the divider to 0.25 |
| F-05 | tested-pass | pass | 2 / 1 | layout: F-05 View menu split-1-1 sets the divider to 0.5; m2-gaps: F-05 Shift+Cmd+0 matches through Digit0 |
| F-06 | tested-pass | pass | 2 / 0 | layout: F-06 View menu split-3-1 sets the divider to 0.75 |
| F-07 | tested-pass | pass | 4 / 3 | layout: F-07 View menu hides and restores the preview with title toggle; m2-gaps: F-07 hiding the preview then showing it restores the previous r… |
| F-08 | tested-pass | pass | 4 / 1 | layout: F-08 View menu hides and restores the editor with title toggle; m2-gaps: F-08 hiding the editor sets the fraction to 0 and hides the edi… |
| F-09 | tested-pass | pass | 4 / 0 | explore: F-09 Layout pull-down is operable from the keyboard (Enter open…; layout: F-09 toolbar Layout pull-down toggles the editor pane |
| F-10 | tested-pass | pass | 2 / 1 | layout: F-10 editorOnRight swaps panes and mirrors the ratio semantic; m5-files-prefs-export: F-10 P-03 applies live from the General pane |
| F-11 | tested-pass | pass | 2 / 3 | preview: F-11 scrolling the editor scrolls the preview proportionally; m2-gaps: F-11 dash-only line directly after a blank line is not an ancho… |
| F-12 | tested-pass | pass | 8 / 4 | explore: F-12 word count updates while the preview pane is hidden; preview: F-12 hidden by default (P-05 off) |
| F-13 | tested-pass | pass | 10 / 1 | explore: F-13 menu bar titles are operable from the keyboard (Enter open…; layout: F-13 View menu hides and shows the toolbar with title toggle |
| F-14 | tested-pass | pass | 22 / 0 | m4-editing: F-14 T-10..T-12 Comment, Highlight, Strikethrough through toolb…; m4-independent: F-14 the dialog lists all 13 items in the original order with l… |
| F-15 | tested-pass | pass | 2 / 0 | layout: F-15 View menu has Enter Full Screen and requests fullscreen |
| F-16 | partial | pass (D-19 fixed) | 7 / 2 | layout: F-01 default window title/tab title is Untitled (F-16 partial); m5-files-prefs-export: F-34 / F-16 an empty untitled document is not edited: title "Un… — window frame not remembered (title and split ratio only, by design); split ratio restored on launch since D-19 was fixed; the window frame is not remembered, by design |
| F-17 | tested-pass | pass | 3 / 0 | m5-files-prefs-export: F-17 / U-19 scale preview: zoom = font size / 14 when on, reset…; m5-independent: F-17 zoom = base font size / 14 when P-29 is on; applied live, … |
| F-18 | partial | pass (D-15, D-16 fixed) | 10 / 0 | m3-independent: F-135 clicking javascript: links in the preview does nothing (F…; m5-independent: F-18 dragging onto the preview is disabled: a dropped .md on th… — anchors, external links and drag tested; `name` anchors and malformed escapes work since D-15 and D-16 were fixed; partial because the preview is a sandboxed iframe and link clicks are handled by the app |
| F-20 | partial | pass | 1 / 0 | m5-independent: F-20 (accepted deviation) clicking a relative link does nothing — accepted deviation (relative URLs unresolved); only link-click behaviour tested |
| F-21 | tested-pass | pass (D-20 fixed) | 9 / 0 | m5-files-prefs-export: F-21 New on an edited document asks to save: Cancel keeps it, D…; m5-independent: F-21 the prompt names the document, offers Don't Save / Cancel … |
| F-22 | tested-pass | pass (D-13, D-20 fixed) | 24 / 0 | m5-files-prefs-export: F-22 Open (File System Access API): the file becomes the docume…; m5-independent: F-22 the picker offers md, markdown and plain text; the opened … |
| F-25 | tested-pass | pass (D-14, D-20 fixed) | 6 / 0 | m5-files-prefs-export: F-25 Close: asks when edited, then a blank untitled document (P…; m5-independent: F-25 Close of an edited document: Cancel keeps it, Don't Save c… |
| F-26 | tested-pass | pass | 7 / 0 | m5-files-prefs-export: F-26 / F-31 first Save: panel suggests the highest-level header…; m5-independent: F-26 fallback: the opened file is saved by download under its o… |
| F-27 | tested-pass | pass | 3 / 0 | m5-files-prefs-export: F-27 Save As always opens the panel with the current name and s…; m5-independent: F-27 Save As with a handle-less restored document opens the pan… |
| F-28 | tested-pass | pass (D-20 fixed) | 4 / 0 | m5-files-prefs-export: F-28 Revert to Saved: disabled until edited; asks; reloads the …; m5-independent: F-28 Revert asks, Cancel keeps the edits, Revert reloads the fi… |
| F-29 | tested-pass | pass (D-14, D-18 fixed) | 7 / 0 | m5-files-prefs-export: F-29 the draft survives a reload (text, edited state); m5-independent: F-29 the draft is written within about 250 ms of a change and i… |
| F-30 | tested-pass | pass | 8 / 0 | m5-files-prefs-export: F-30 P-41 on: Save appends a newline in the editor and the file…; m5-independent: F-30 P-41 on: Save of "abc" appends a newline; the selection is… |
| F-31 | tested-pass | pass (D-17 fixed) | 21 / 0 | m5-files-prefs-export: F-26 / F-31 first Save: panel suggests the highest-level header…; m5-independent: F-31 presumed name "# Top" (P-28 off) = "Top": Export HTML pane… |
| F-32 | tested-pass | pass | 4 / 0 | m5-independent: F-32 / U-12 P-02 on (default): a blank document or the last dra… |
| F-33 | tested-pass | pass | 4 / 0 | m5-files-prefs-export: F-33 a JPEG dropped on the editor is inserted as a data URI at …; m5-independent: F-33 a JPEG dropped on the editor is inserted as a data URI at … |
| F-34 | tested-pass | pass (D-13 fixed) | 6 / 0 | m5-files-prefs-export: F-34 / F-16 an empty untitled document is not edited: title "Un…; m5-independent: F-34 an untitled document is edited only while it has text: typ… |
| F-35 | tested-pass | pass | 9 / 0 | m5-files-prefs-export: F-35 Export HTML: accessory defaults, panel name, exported body…; m5-independent: E-07 / F-35 hostile content exported and copied stays text: not… |
| F-36 | partial | pass | 3 / 0 | m5-files-prefs-export: F-36 Export PDF (Opt+Cmd+P): print dialog with the presumed fil…; m5-independent: F-37 / F-36 Print and Export PDF call print() on the preview do… — print() on the preview, file name/title and the 50/0 pt page rule tested; the browser print dialog and PDF file cannot be automated |
| F-37 | partial | pass | 7 / 0 | m5-files-prefs-export: F-37 Print (Cmd+P) prints the preview document only, with 50 pt…; m5-independent: F-37 the preview document carries @page { margin: 50pt 0pt } as… — as F-36; margins also verified by printing a PDF in Chromium with the same rule on a top-level page |
| F-39 | tested-pass | pass | 6 / 0 | m5-files-prefs-export: E-07 / F-39 Copy HTML copies the body only (no template, styles…; m5-independent: F-39 / E-07 copies the body HTML only, as plain text: from the … |
| F-40 | tested-pass | pass | 22 / 11 | m4-editing: F-40 Cmd+b: "a «b» c" -> "a **«b»** c"; m4-independent: F-40 strong via kbd: "a «b» c" -> "a **«b»** c" |
| F-41 | tested-pass | pass | 15 / 7 | m4-editing: F-41 Cmd+i: "«b»" -> "*«b»*"; m4-independent: F-41 emphasize via kbd: "a «b» c" -> "a *«b»* c" |
| F-42 | tested-pass | pass | 13 / 4 | m4-editing: F-42 toolbar Underline works even while Format > Underline is h…; m4-independent: F-42 underline via kbd: "a «b» c" -> "a _«b»_ c" |
| F-43 | tested-pass | pass | 12 / 4 | m4-independent: F-43 strikethrough via kbd: "a «b» c" -> "a ~~«b»~~ c"; m4-editor: F-42 F-43 F-44 F-45 F-46 markers |
| F-44 | tested-pass | pass | 12 / 4 | m4-independent: F-44 highlight via kbd: "a «b» c" -> "a ==«b»== c"; m4-editor: F-42 F-43 F-44 F-45 F-46 markers |
| F-45 | tested-pass | pass | 13 / 4 | m4-editing: F-45 Cmd+k: "«c»" -> "`«c»`"; m4-independent: F-45 inline-code via kbd: "a «b» c" -> "a `«b»` c" |
| F-46 | tested-pass | pass | 13 / 4 | m4-editing: F-46 Cmd+Slash: "«c»" -> "<!--«c»-->"; m4-independent: F-46 comment via kbd: "a «b» c" -> "a <!--«b»--> c" |
| F-47 | tested-pass | pass | 13 / 14 | m4-editing: F-47 Cmd+Digit1: "ti\|tle" -> "# ti\|tle"; m4-independent: F-47 header-1 via kbd: "one\ntw\|o\nthree" -> "one\n# tw\|o\nth… |
| F-48 | tested-pass | pass | 14 / 4 | m4-editing: F-48 Cmd+Digit2: "# ti\|tle" -> "## ti\|tle"; m4-independent: F-48 header-2 via kbd: "one\ntw\|o\nthree" -> "one\n## tw\|o\nt… |
| F-49 | tested-pass | pass | 13 / 3 | m4-editing: F-49 Cmd+Digit3: "a\|" -> "### a\|"; m4-independent: F-49 header-3 via kbd: "one\ntw\|o\nthree" -> "one\n### tw\|o\n… |
| F-50 | tested-pass | pass | 12 / 3 | m4-editing: F-50 Cmd+Digit4: "a\|" -> "#### a\|"; m4-independent: F-50 header-4 via kbd: "one\ntw\|o\nthree" -> "one\n#### tw\|o\… |
| F-51 | tested-pass | pass | 12 / 3 | m4-editing: F-51 Cmd+Digit5: "a\|" -> "##### a\|"; m4-independent: F-51 header-5 via kbd: "one\ntw\|o\nthree" -> "one\n##### tw\|o… |
| F-52 | tested-pass | pass | 12 / 3 | m4-editing: F-52 Cmd+Digit6: "a\|" -> "###### a\|"; m4-independent: F-52 header-6 via kbd: "one\ntw\|o\nthree" -> "one\n###### tw\|… |
| F-53 | tested-pass | pass | 13 / 5 | m4-editing: F-53 Cmd+Digit0: "## # a\|" -> "a\|"; m4-independent: F-53 paragraph via kbd: "one\n## tw\|o\nthree" -> "one\ntw\|o\n… |
| F-54 | tested-pass | pass | 16 / 11 | m4-editing: F-54 Shift+Cmd+KeyO: "«a\nb»" -> "1. «a\n1. b»"; m4-independent: F-54 ordered-list via kbd: "a\n«b\nc»\nd" -> "a\n1. «b\n1. c»\n… |
| F-55 | tested-pass | pass | 16 / 15 | m4-editing: F-55 Shift+Cmd+KeyU: "«a\nb»" -> "* «a\n* b»"; m4-independent: F-55 unordered-list via kbd: "a\n«b\nc»\nd" -> "a\n* «b\n* c»\n… |
| F-56 | tested-pass | pass | 13 / 7 | m4-editing: F-56 Shift+Cmd+KeyB: "«a\n\nb»" -> "> «a\n> \n>» b"; m4-independent: F-56 blockquote via kbd: "a\n«b\nc»\nd" -> "a\n> «b\n> c»\nd" |
| F-57 | tested-pass | pass | 15 / 10 | m4-editing: F-57 Cmd+BracketRight: "«a\nb»" -> "\t«a\n\tb»"; m4-independent: F-57 shift-right via kbd: "a\n«b»\nc" -> "a\n\t«b»\nc" |
| F-58 | tested-pass | pass | 14 / 13 | m4-editing: F-58 Cmd+BracketLeft: "« a\n \tb\n\tc»" -> "«a\nb\nc»"; m4-independent: F-58 shift-left via kbd: "a\n\t«b»\nc" -> "a\n«b»\nc" |
| F-59 | tested-pass | pass | 67 / 13 | m4-editing: F-59 Shift+Cmd+KeyK: "«x»" -> "[x](\|)"; m4-independent: F-59 link via kbd: "a «b» c" -> "a [b](\|) c" |
| F-60 | tested-pass | pass | 15 / 3 | m4-editing: F-60 Shift+Cmd+KeyI: "«x»" -> "![x](\|)"; m4-independent: F-60 image via kbd: "a «b» c" -> "a ![b](\|) c" |
| F-61 | tested-pass | pass | 29 / 10 | m4-editing: F-61 Cmd+Enter: "ab\|cd" -> "ab\n\n\|cd"; m4-independent: F-61 new-paragraph via kbd: "ab\|cd" -> "ab\n\n\|cd" |
| F-62 | partial | pass | 21 / 13 | m4-editing: F-62 off by default: typing ( inserts only (; m4-independent: F-62 E1 type ( -> (\|) — IME composition (rule 0) is not automatable |
| F-63 | tested-pass | pass | 8 / 7 | m4-editing: F-63 wrap with a bracket: "a «b» c" + [; m4-independent: F-63 E4 [word] selected, type * -> *word* with word selected |
| F-64 | tested-pass | pass | 5 / 7 | m4-editing: F-64 skip the closing bracket: "(\|)" + ); m4-independent: F-64 E2 (\|) type ) -> ()\| |
| F-65 | tested-pass | pass | 5 / 5 | m4-editing: F-65 Backspace between an empty pair deletes both; off without …; m4-independent: F-65 E3 (\|) Backspace -> \| |
| F-66 | tested-pass | pass | 46 / 23 | m4-editing: F-66: "* item\|" -> "* item\n* \|"; m4-independent: F-66 E6 "* item\|" Return |
| F-67 | tested-pass | pass | 8 / 7 | m4-editing: F-67: "1. one\|" -> "1. one\n2. \|"; m4-independent: F-67 E7 "3. item\|" Return: P-39 on and off |
| F-68 | tested-pass | pass | 6 / 11 | m4-editing: F-68: "> quote\|" -> "> quote\n> \|"; m4-independent: F-68 E9 "> q\|" Return |
| F-69 | tested-pass | pass | 22 / 9 | m4-editing: F-69: " code\|" -> " code\n \|"; m4-independent: F-69 E21 " ab\|" Return with P-38 off |
| F-70 | tested-pass | pass | 19 / 4 | m4-editing: F-70 Tab inserts a tab; with P-37 spaces to the next 4-column s…; m4-independent: F-70 E10 "ab\|" Tab with P-37 |
| F-71 | tested-pass | pass | 17 / 1 | m4-editing: F-71 Shift+Tab unindents with and without a selection; m4-independent: F-71 P-37 off: "\tab\|" Shift+Tab -> "ab\|" |
| F-72 | tested-pass | pass | 27 / 6 | m4-editing: F-72 P-37 Backspace deletes back to the previous 4-column stop;…; m4-independent: F-72 P-36 off, P-37 off: "(\|)" Backspace -> "\|)" |
| F-73 | tested-pass | pass | 18 / 2 | m4-editing: F-73 P-40 smart Home: first non-whitespace, then line start; m4-independent: F-73 P-40 on: "x\n abc\|" Cmd+Left -> "x\n \|abc" |
| F-74 | tested-pass | pass | 29 / 1 | m4-editing: F-74 default theme is Tomorrow+ (dark background #2d2d2d, H1 24…; m4-independent: F-74 theme "Mou Fresh Air": editor colours, caret, selection an… |
| F-75 | tested-pass | pass | 4 / 1 | m4-editing: F-75 / F-76 base font and line spacing: default Menlo 14 with 3…; m4-independent: F-75 default font is Menlo 14; Courier 18 and Monaco 11 apply l… |
| F-76 | tested-pass | pass | 5 / 0 | m4-editing: F-75 / F-76 base font and line spacing: default Menlo 14 with 3…; m4-independent: F-76 line spacing 0: the line pitch grows by exactly the spacing |
| F-77 | tested-pass | pass | 5 / 0 | m4-editing: F-77 text insets: default 15 x 30, preferences apply; m4-independent: F-77 insets 0 x 0: padding and text position |
| F-78 | tested-pass | pass | 4 / 1 | m4-editing: F-78 P-35 width limit: inset = (width - max) x 0.45 when wider …; m4-independent: F-78 width limit: inset (width - max) x 0.45 only when width > … |
| F-79 | tested-pass | pass | 5 / 1 | m4-editing: F-78 / F-79 layout settles: no measure loop with the width limi…; m4-independent: F-79 scroll past end: short document gets padding of its own he… |
| F-80 | tested-pass | pass | 2 / 0 | m4-editing: F-55 / F-80 Unordered List uses the P-45 marker |
| F-81 | tested-pass | pass | 5 / 0 | m4-independent: F-81 / F-82 Undo and Redo from the menu step through typing and…; m5-independent: F-81 (item 92) a Format command and the typing right after it a… |
| F-82 | tested-pass | pass | 2 / 0 | m4-independent: F-81 / F-82 Undo and Redo from the menu step through typing and…; preview: F-82 redo via Shift+Cmd+Z and Edit menu re-applies |
| F-83 | tested-pass | pass | 3 / 0 | m4-editing: F-83 / F-84 / F-85 Cut, Copy and Paste from the menu; m4-independent: F-83 / F-84 / F-85 Cut, Copy and Paste from the menu, multi-lin… |
| F-84 | tested-pass | pass | 3 / 0 | m4-editing: F-83 / F-84 / F-85 Cut, Copy and Paste from the menu; m4-independent: F-83 / F-84 / F-85 Cut, Copy and Paste from the menu, multi-lin… |
| F-85 | tested-pass | pass | 3 / 0 | m4-editing: F-83 / F-84 / F-85 Cut, Copy and Paste from the menu; m4-independent: F-83 / F-84 / F-85 Cut, Copy and Paste from the menu, multi-lin… |
| F-86 | tested-pass | pass | 2 / 1 | m4-editing: F-86 Delete removes the selection; m4-independent: F-86 Delete removes the selection (one undo step), does nothing… |
| F-87 | tested-pass | pass | 2 / 0 | m4-independent: F-87 Select All from the menu selects the whole editor text, al…; preview: F-87 Select All via Cmd+A and Edit menu selects the whole edito… |
| F-88 | tested-pass | pass | 5 / 0 | m4-independent: F-88 to F-93 Find items: Find focuses the field, Find Next / Pr…; preview: F-88 Find opens the search panel via Cmd+F and the Edit menu, a… |
| F-89 | tested-pass | pass | 2 / 0 | m4-editing: F-89 Find and Replace (Opt+Cmd+F) opens the panel with the repl…; m4-independent: F-88 to F-93 Find items: Find focuses the field, Find Next / Pr… |
| F-90 | tested-pass | pass | 2 / 0 | m4-editing: F-89 Find and Replace (Opt+Cmd+F) opens the panel with the repl…; m4-independent: F-88 to F-93 Find items: Find focuses the field, Find Next / Pr… |
| F-91 | tested-pass | pass | 2 / 0 | m4-editing: F-89 Find and Replace (Opt+Cmd+F) opens the panel with the repl…; m4-independent: F-88 to F-93 Find items: Find focuses the field, Find Next / Pr… |
| F-92 | tested-pass | pass | 2 / 1 | m4-editing: F-92 Use Selection for Find (Cmd+E) then Find Next; m4-integration: F-92 Use Selection for Find sets the search string |
| F-93 | tested-pass | pass | 2 / 1 | m4-editing: F-93 Jump to Selection (Cmd+J) scrolls the selection into view …; m4-independent: F-88 to F-93 Find items: Find focuses the field, Find Next / Pr… |
| F-96 | tested-pass | pass | 4 / 0 | m4-editing: F-96 Check Spelling While Typing is a checkable item, off by de…; m4-independent: F-96 Check Spelling While Typing: checkable item, off by defaul… |
| F-105 | tested-pass | pass | 17 / 3 | m4-editing: F-105 to F-107 Transformations; m4-independent: F-105 to F-107 make-upper-case: "«hello wörld\nsecond»" (one un… |
| F-106 | tested-pass | pass | 17 / 2 | m4-independent: F-106 lower; m4-editing: F-105 to F-107 Transformations |
| F-107 | tested-pass | pass | 17 / 2 | m4-editing: F-105 to F-107 Transformations; m4-independent: F-105 to F-107 make-upper-case: "«hello wörld\nsecond»" (one un… |
| F-110 | tested-pass | pass | 11 / 7 | m3-independent: F-110 empty document renders an empty body and the app stays us…; m4-independent: F-110 D-07 60 nested list levels and 120 nested blockquotes ren… |
| F-111 | tested-pass | pass | 7 / 2 | m3-independent: F-111 extensionTables on; samples: S-04 table with alignment (F-111) |
| F-112 | tested-pass | pass | 7 / 3 | m3-independent: F-112 extensionFencedCode on; samples: S-05 fenced code with alias (F-112): div > pre > code.language-… |
| F-113 | tested-pass | pass | 8 / 2 | m3-independent: F-113 extensionAutolink on; m4-independent: F-113 D-05 autolink: README.md and example.com are not linked, … |
| F-114 | tested-pass | pass | 4 / 1 | m3-independent: F-114 extensionStrikethough on; samples: F-114 strikethrough only when P-10 is on |
| F-115 | tested-pass | pass | 3 / 0 | m3-independent: F-115 extensionUnderline on |
| F-116 | tested-pass | pass | 3 / 0 | m3-independent: F-116 extensionHighlight on |
| F-117 | tested-pass | pass | 6 / 1 | m3-independent: F-117 extensionFootnotes on; m4-independent: F-117 D-06 a repeated footnote reference stays literal and ids … |
| F-118 | tested-pass | pass | 4 / 0 | m3-independent: F-118 extensionSuperscript on |
| F-119 | tested-pass | pass | 3 / 0 | m3-independent: F-119 extensionQuote on |
| F-120 | tested-pass | pass | 1 / 1 | m3-independent: F-120 extensionSmartyPants on and off (S-13) |
| F-121 | tested-pass | pass | 2 / 8 | m3-independent: F-121 extensionIntraEmphasis on (default) and off; m4-independent: F-121 D-08 intra-emphasis off: opener at the start of nested co… |
| F-122 | tested-pass | pass | 2 / 4 | samples: S-01 headers (ATX + setext) get toc_N ids (F-110, F-122); m2-gaps: F-122 every header level 1-6 gets a sequential toc id |
| F-123 | tested-pass | pass | 8 / 0 | m3-independent: F-123 [TOC] is case-insensitive and every occurrence is replaced |
| F-124 | tested-pass | pass | 5 / 0 | m3-independent: F-124 P-20 off: no highlighting, no Prism requests |
| F-125 | tested-pass | pass | 5 / 0 | m3-independent: F-125 alias lookup is case-sensitive: js is highlighted, JS and… |
| F-126 | tested-pass | pass | 3 / 0 | m3-independent: F-126 P-22 line numbers: one row per line, class follows the pr… |
| F-127 | tested-pass | pass | 4 / 0 | m3-independent: F-127 S-06b P-23 not Custom: whole word is the language, no dat… |
| F-128 | tested-pass | pass | 4 / 0 | m3-independent: F-128 mermaid: multiple diagrams, a bad one stays code and late… |
| F-129 | tested-pass | pass | 4 / 0 | m3-independent: F-129 graphviz: dot, circo, fdp, neato, osage, twopi, gv, graph… |
| F-130 | partial | pass | 9 / 0 | m3-independent: F-130 inline \\( \\) and display \\[ \\] and $$ delimiters are … — MathJax 3 local instead of 2.7.3 CDN (documented deviation); the export links the 2.7.3 CDN as the original |
| F-131 | tested-pass | pass | 7 / 0 | m3-independent: F-131 $x$ is math only with P-19; m4-independent: F-131 D-04 original has no $ delimiter: a leftover $x$ in raw H… |
| F-132 | tested-pass | pass | 5 / 0 | m3-independent: F-132 on: [ ] and [x] items, ordered, nested; [X] not a task; c… |
| F-133 | tested-pass | pass | 4 / 0 | m3-independent: F-133 on: S-11 table before the body |
| F-134 | tested-pass | pass | 2 / 1 | m3-independent: F-134 htmlHardWrap on and off; samples: S-14 hard wrap and raw HTML (F-134, F-135): P-29b on |
| F-135 | tested-pass | pass | 7 / 2 | m3-independent: F-135 raw HTML vectors do not execute (every script feature on); m5-independent: F-135 / F-18 a hostile .md opened from disk stays inert: no scr… |
| F-136 | tested-pass | pass | 6 / 3 | m3-independent: F-136 each in-scope style and "no style" look different; GitHub…; preview: F-136 default style GitHub2 is applied to the preview |
| F-138 | tested-pass | pass | 5 / 0 | m5-files-prefs-export: F-138 / F-161 Import… adds a user CSS style and a .style theme;…; m5-independent: F-138 Import… adds a CSS style: listed, selectable, applied to … |
| F-139 | tested-pass | pass | 2 / 2 | m5-independent: E-04 / F-139 the template: doctype, charset, viewport; <title> …; preview: F-139 preview document uses the template (utf-8 meta, viewport,… |
| F-140 | tested-pass | pass | 6 / 0 | m5-files-prefs-export: F-140 Cmd+, and MacDown > Preferences… open the window; panes G…; m5-independent: F-142 / F-140 the MacDown menu lists About MacDown and Preferen… |
| F-141 | tested-pass | pass | 22 / 0 | m3-independent: F-141 toggling every extension live updates the preview without…; m3-rendering: toggling P-20 live re-renders with and without tokens (F-141) |
| F-142 | tested-pass | pass | 2 / 0 | m5-files-prefs-export: F-142 About MacDown shows name, version 0.7.3 (1008.4), copyrig…; m5-independent: F-142 / F-140 the MacDown menu lists About MacDown and Preferen… |
| F-153 | tested-pass | pass (D-15, D-20 fixed) | 10 / 1 | m5-files-prefs-export: F-153 MacDown Help opens help.md as an editable document withou…; m5-independent: F-153 Help is the original help.md byte for byte, opens in fron… |
| F-154 | tested-pass | pass | 2 / 0 | m5-files-prefs-export: F-154 Contributing to MacDown opens contribute.md; a reload whi…; m5-independent: F-153 a reload while the help document is open restores the use… |
| F-155 | tested-pass | pass | 2 / 0 | m5-files-prefs-export: F-155 the first visit opens the help document; the next visit d…; m5-independent: F-155 the first launch opens help in front of the (blank) docum… |
| F-162 | tested-pass | pass | 7 / 0 | m4-editing: F-162 Underline, Strikethrough, Highlight: hidden and inert unl…; m4-independent: F-162 underline: hidden item and dead shortcut while extensionU… |
| F-164 | tested-pass | pass | 1 / 0 | m5-independent: F-164 / F-96 Check Spelling While Typing is persisted … |
| F-165 | tested-pass | pass | 1 / 0 | m4-independent: F-165 divider takes the editor background when the preview is c… |
| F-166 | tested-pass | pass | 4 / 2 | m3-independent: F-166 no style: no style tags and live switch between a style a…; m4-editing: F-74 / F-166 all 15 themes and "no theme" apply, with the file … |

(Counts in the table are those of the M5 run; the final sign-off added 111 tests, see the next section. Result column updated.)

In F-IDs with no test: **none**. F-20 and F-164 have one test each (F-20 is an accepted deviation).

### Release recommendation

- **M5: GO with conditions** (see the M5 section: fix or accept D-13).
- **Release as a whole: GO with conditions.** No blocker, no data loss other than D-13 (line endings rewritten on save) and the stale-draft cases (D-14, D-18); security checks passed (preview inert, export and Copy HTML cannot execute in the app origin, hostile `.md` and file names harmless); all 132 In features have tests and 125 of them pass cleanly. Conditions: D-13 fixed or explicitly accepted by the Chief of Staff; D-15 and D-20 recommended before release because they are visible in the first minutes of use (dead help links, no keyboard focus after New or Open); D-14, D-16 to D-19 may ship as known issues. After fixes, re-run the 15 failing tests (they pass as they stand once the defects are fixed) and the full suite.


---

## Final sign-off

Date: 2026-10-18. Tester: test-engineer. Build under test: `web/` working tree after the builder's fixes for D-13 to D-20, O-01, O-03 and `linearLinkEnd.ts`. No file under `web/src` was changed. Added: `web/tests/unit/m5-signoff.test.ts` (74 tests), `web/tests/e2e/m5-signoff.spec.ts` (37 tests), `web/tests/unit/fixtures/foundation-pathext.json`; `docs/test-plan.md` has a "Final sign-off" section. Probe: `pe.m` (Foundation `pathExtension` and `stringByDeletingPathExtension`, 35 names; 33 compared), scratchpad `so/`.

### Commands and results

```sh
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
cd web
npm run build                         # PASS (tsc -b over src, tests and configs; vite build; MathJax chunk 1.8 MB as before)
npm test                              # Vitest: 14 files, 762 passed, 0 failed, 1.1 s
npm run test:e2e                      # run A: 6 workers (default), 5.2 min, load average 3 to 15: 1084 passed, 7 failed (load, see below)
npm run test:e2e -- --workers=3       # run B: 3 workers, 4.4 min (263 s), load average 5 to 6: 1091 passed, 0 failed
```

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| Unit (Vitest) | 762 (688 existing incl. the changed SD-13 assertion, +74 mine) | 0 | 0 |
| E2E (Playwright, Chromium), run B, 3 workers | 1091 (1054 existing, +37 mine) | 0 | 0 |
| **Total** | **1853** | **0** | **0** |

Before the runs no `vite --port 5173` or `playwright test` process was running.

**Machine load and flaky tests.** Another workload on the machine kept the load average between 3 and 15 during run A (nothing of mine was running between the runs). In run A seven tests failed on timeouts and all seven passed when rerun alone (2 workers, 38.7 s): `m3-independent.spec.ts:270` (F-124 Prism theme looks), `:379` (F-130 escaped `\$`), `:403`, `:410`, `:417`, `:423` (F-132 task lists), and `m5-independent.spec.ts:2199` (E-03 export without P-18). In run B (3 workers, load 5 to 6) they all passed, with the rest of the suite. The two tests flagged earlier (`m4-independent.spec.ts:1612` and `:1806`) passed in both runs. None of the 7 is a defect; they are load-flaky.

### SD-13 verdict: the builder is right

- `NSString+Lookup.m:55-87` (`frontMatter:`): the front matter text between the `---` lines is parsed with `kYAMLReadOptionStringScalars`; the result `objects[0]` is returned whatever it is.
- `YAMLSerialization.m:80-82`: every scalar node becomes `[[NSString alloc] initWithUTF8String:...]`. For `title:` libyaml's document loader emits an empty plain scalar node, so the value is `@""`; `title: ~` and `title: null` are the strings `~` and `null`, never `NSNull`.
- `MPDocument.m:1873-1875`: `title = [[[string frontMatter:NULL] objectForKey:@"title"] description]; if (title) return title;`, the only test is for nil, so `@""` is returned and the header is not used.
- I could not run the YAML parser itself (libyaml is not in the vendor tree and not on the machine; PyYAML is absent); the conclusion rests on the source and on libyaml's well-known behaviour for an empty value. The spec text (item 102) matches.
- Action: the single assertion in `tests/unit/m5-independent.test.ts` (line 192) is now `expect(name('---\ntitle:\n---\n# H', true)).toBe('')`, with a comment. Nothing else in that file was changed. An E2E test confirms Save then suggests `Untitled.md` (the documented deviation for the original's crash).

### Status of D-13 to D-20

| Defect | Status | Evidence |
|---|---|---|
| D-13 CRLF converted to LF | **verified fixed** | The 14 earlier tests pass. New: mixed CRLF / LF / lone CR document opens not edited and Save As writes it byte for byte; CR-only, CRLF-only, trailing-CR cases; Backspace, Delete and Return at 9 positions around a CRLF, a CR and an LF, each with undo, redo, undo (Edited clears, title back to `mixed.md`); a selection across breaks deleted or replaced, undone; typing next to breaks; Save in place; draft reload (stays Edited) then Save As; download fallback bytes; P-41 on a CRLF file. Pasted CRLF becomes LF (the documented deviation). |
| D-14 stale text after Close with P-02 off | **verified fixed** | earlier test passes. |
| D-15 `<a name>` anchors | **verified fixed** | id before name in both orders, first of several names, a `name` on a non-`<a>` element is not a target, `id="top"` wins for `#top`, the 7 help links (earlier test). |
| D-16 malformed percent escape | **verified fixed** | `#100%`, `#%`, `#%zz`, `#%E0%A4%A`, `#%FF`, `#%C3`: no page error, no scroll; `%41`, `%20`, `%C3%A9`, `%25` find ids `A`, `a b`, `café`, `100%`. |
| D-17 extension stripping | **verified fixed** | 33 of 35 names compared to Foundation (the two ending in `/` are skipped) (`a.`, `a..md`, `..md`, `.md`, `a.md.`, `a.\tb`, no-break space, `a/b.c/d`, `x.日本`, newline in extension). Only difference, not tested and not reachable: a name ending in `/` (Foundation drops the slash; file names never end in one). |
| D-18 stale over-quota draft | **verified fixed** | earlier test passes. |
| D-19 split ratio at launch | **verified fixed** | earlier test passes. |
| D-20 focus | **verified fixed** | New, Open, Revert, Help and Close leave the cursor in the editor and typing works; with the editor pane hidden the preview iframe gets the focus and typing changes nothing; with no document Close focuses New, Enter on it creates a document with the editor focused, Open and Help from the empty state focus the editor. |

### Review of the builder's other changes

- **O-01 (Save in the same task as a change): verified.** Save As, Save, and Export HTML issued in the same task as `set()` write the new text. When a Save is followed in the same task by another change, the file holds the text current when the write happens (NSDocument also writes after the panel returns) and the Edited state agrees with it (test asserts consistency, not a particular value).
- **O-03 (refused save-picker name): verified.** A refused name is retried with a safe name (`a/b: c.md` -> `a-b- c.md`; `x*y?"z"<w>|\v.md` -> `x-y--z--w---v.md`; `***.md` -> `---.md`; a name starting with a dot gets `Untitled` in front); a second refusal shows "The document “Untitled” could not be saved." and the document stays edited, nothing written, the editor usable; `NotAllowedError` and `SecurityError` on the retry give the sheet; `AbortError` on either panel gives no retry and no sheet; Save As of a named document and Export HTML use the same path; after a successful retry the next Save writes in place without a panel. The tests use quoted YAML titles (an unquoted `a/b: c` is invalid YAML and falls back to Untitled, which is correct).
- **`linearLinkEnd.ts`: output equals the stock parser.** Compared as node names and positions on 30 hand-written cases (links, images, nested brackets, reference links and definitions, titles, escapes, entities, inline HTML, autolinks, lists, quotes, tables, code, CR/CRLF, CJK, 3000 nested `[`, 500-deep image nesting, a 100 KB line on each side of a link, a 50 KB link text and destination), the repo's 10 Markdown documents plus every paragraph of the Prism README and CHANGELOG, **30,000 random inputs** over three alphabets, and on the GFM base; all equal. The 40,000-link paragraph (about 2.2 MB) parses well under the 3 s bound. In the production build a 2 MB file with 40,000 links in one paragraph opens in **3.0 s** (headless Chromium, load 5) and a keystroke in it takes 66 ms. Fallback: with no `inlineNames`/`inlineParsers`, with another shape, with Link, Image or LinkEnd missing, or with undefined parsers, `linearLinkEnd` returns `{}`, so Lezer's own parser is used unchanged (tested at unit level; the app-level switch-off was not simulated in the browser). It reads Lezer-internal fields of `@lezer/markdown` 1.8.0; a future upgrade that changes the internals silently falls back to the stock O(n^2) parser, and the equivalence tests would flag a change of tree.
- **In-page link rules** (id first, then the first `<a name>`, `#`, `#top`, `#TOP`, `#Top`): verified above.

### Exploratory pass (production build)

`npm run build && npm run preview` on :4173, Playwright (Chromium 1280x800, fresh profile, File System Access API removed to exercise the fallbacks): first launch shows help, Close gives Untitled; typed a heading and a link; Cmd+B gave `**bold**`; opened a CRLF file through the file input, typed at the end, Save downloaded it with CRLF kept (`# W\r\n\r\ntext\r\n<a name="x"></a>[go](#x)\r\nmore`); Preferences opened (General, Markdown, Editor, Rendering tabs) and a checkbox toggled; Export HTML downloaded `win.html` (9 KB, name from the file); Help opened and the in-page link "Markdown preference pane" scrolled the preview (scroll 4759 px); a 2 MB file with 40,000 links opened in 3.0 s. **Console errors, warnings, page errors, failed requests and 4xx responses: none.** (In the dev server, Chromium logs "Blocked script execution ... sandboxed" console messages from the preview iframe when documents with in-page links are rendered; they come from the sandbox and were not seen in the production-build run, which did not render hostile HTML.)

### New defects

None (D-21 and later: not assigned). Observations, not defects:
- **O-07** The Export HTML error sheet names the file as suggested (`a/b: c.html`), not the sanitised name of the second attempt. Cosmetic.
- **O-08** Save As on an untitled document suggests `Untitled.md` (F-27: the current name), so a front-matter title is not used there; this is the specified behaviour.

### Remaining known issues and partial features

| ID | Impact |
|---|---|
| F-16 (partial) | Window frame is not remembered (title and split ratio only, by design); the split ratio per file is remembered and now restored at launch. |
| F-18 (partial) | Links in the preview are handled by the app (anchors, external links); relative file links do nothing (F-20). |
| F-20 (accepted deviation) | A relative image `pic.png` is requested from the app origin; relative links do nothing. |
| F-36 / F-37 (partial) | Print and Export PDF call the browser print dialog; the file name is the page title and cannot be set, the dialog and PDF file cannot be automated (the `@page` 50pt/0pt margins were verified in a real Chromium PDF). |
| F-62 (partial) | IME composition (rule 0) of auto-pairing is not automatable. |
| F-130 (partial) | MathJax 3 runs locally instead of 2.7.3 from the CDN; the export links the 2.7.3 CDN as the original. |
| Deviations kept | Pasted or dropped CRLF text gets LF breaks; a draft larger than the browser quota is not kept; the Save panel suggests `Untitled.md` where the original raises; file handles are not persisted across reloads; the app is client-only (no Firefox or Safari File System Access API, fallbacks tested). |
| Load sensitivity | 7 tests (listed above) need an unloaded machine or fewer workers. |

### Manual checks still needed

1. Print and Export PDF (Cmd+P, Opt+Cmd+P) in a real, headed browser: the dialog opens, the margins look right, the suggested PDF name.
2. Real File System Access pickers in headed Chrome/Edge: Open, Save, Save As, and especially a name the OS refuses (the O-03 retry may be refused for lack of user activation, then the error sheet shows); Revert after an external change; the permission prompt on Save to a handle after a long idle time.
3. Firefox and Safari: only the fallback paths (file input, download) apply; a quick pass of New, Open, Save, Export.
4. Clipboard permission prompts for Copy HTML in a normal (non-headless) profile.
5. IME composition with auto-pairing (Japanese, Chinese), VoiceOver reading of the menus, dialogs and preferences.
6. Visual comparison against the real MacDown 0.7.3 on a Retina display (fonts, theme colours, full screen).

### Go / no-go

- **Release: GO.** All eight M5 defects (D-13 to D-20) are verified fixed; no blocker or major defect is open; no new defect was found; the full suite is green (1853 passed, 0 failed, 0 skipped; the 7 failures of the loaded run passed alone and in the 3-worker run); build passes; the production build runs without console or page errors. SD-13 resolved in the builder's favour.
- Per milestone: **M2 GO, M3 GO, M4 GO, M5 GO.**
- Conditions: none blocking. The manual checks above should be done once by a person before a public announcement.
