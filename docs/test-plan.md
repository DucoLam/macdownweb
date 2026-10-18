# Test plan

Scope: `web/` against `docs/spec.md`. Updated for M3 (rendering parity). M4 and M5 sections are added when those milestones reach test.

## Tooling and commands

```sh
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
cd web
npm run build       # tsc -b (src, tests/unit, tests/e2e, vite and playwright config) + vite build
npm test            # Vitest (jsdom not needed for the render tests)
npm run test:e2e    # Playwright, Chromium, webServer = vite dev on :5173
```

Test names start with the spec ID they cover (`F-03 rejects negative quantity` style). Preferences are set through `?pref.<key>=<json>` or `window.macdownPrefs.set()`; the preview is read through the `data-macdown-scripts="done"` marker.

Files: unit `tests/unit/{layout,render,m2-gaps,m3-render,m3-independent}.test.ts`; E2E `tests/e2e/{layout,preview,samples,explore,m3-rendering,m3-independent}.spec.ts`. `m3-render` and `m3-rendering` were written by the builder; the tester reviewed them and added the independent files.

## Oracle for rendering parity

The original library is Hoedown 3.0.7. Its sources (reverse-engineer's `specs/hoedown`) were compiled with `cc` into the `hoedown` and `smartypants` CLIs. The CLIs were run with the flag set matching each preference set (spec §6.2) and compared with the web renderer:

- Markdown extensions (superscript, quote, underline, highlight, strikethrough, math with and without `$`, autolink, footnotes, intra-word emphasis off): about 100 hand-written inputs times 11 preference sets, plus random fuzzing (1500 inputs per extension).
- SmartyPants: 2500 random HTML fragments, 0 differences.
- Results are frozen as fixtures `tests/unit/fixtures/hoedown-golden.json` (inputs on which both agree) and `hoedown-smartypants.json` (400 fragments). Differences found are logged as defects.
- Not covered by the oracle (MacDown's own patches, not in the Hoedown tree): code blocks, TOC, task lists. These are checked against spec §6.4, §6.6, §6.7 and the vendored C patch.

Core Markdown differences between Hoedown and markdown-it are accepted by spec §6.3 ("tests compare structure"), as are the deviations listed in the M3 brief.

## M3 test cases

| F-ID | Cases (happy / validation / boundary) |
|---|---|
| F-110 | S-01, S-02, S-15; empty, whitespace-only and `[TOC]`-only documents; unicode, CJK, emoji, RTL; nested lists in blockquotes and quotes in lists; deep nesting (unlimited per §6.1); very large document timing; no console errors with every feature on |
| F-111 | S-04 on/off; malformed tables (header/delimiter mismatch, ragged rows); escaped pipe, code and emphasis in cells |
| F-112 | fenced code on/off, `~~~`, empty fence, blank-line-only fence, escaping |
| F-113 | S-12 on/off; scheme URLs, `www.`, e-mail; bare file names and domains must not link; oracle diff |
| F-114 to F-119 | each toggle on, off and default (fresh load and live); S-03; oracle diff for each |
| F-120 | S-13; live toggle; every rule of U-14 against the Hoedown `smartypants` CLI (2500 fuzz cases); skipped elements; TOC text not converted |
| F-121 | on (default) and off; the `_` rule (U-03); off applied to `*`, `_`, `~~`, `==`; nested content (D-08); oracle diff |
| F-122 | ids in order, restart on every render |
| F-123 | S-08; `[toc]`/`[Toc]`; several tokens; depth 1 to 6, `#######` not a header; first-level offset; after SmartyPants; inline markup and links in entries; no headers; click scrolls; TOC off leaves `[TOC]` |
| F-124 | P-20 on/off, no Prism request when off; escaping; all 8 theme names give distinct looks, unknown name falls back to default; large document with 400 blocks |
| F-125 | alias table (all 15 aliases) and the case-sensitive lookup (`JS`, `Python` not highlighted); first word only; on-demand loading (only used languages requested); dependencies (`cpp`, `php`) |
| F-126 | P-22 on/off; rows per line; class stays with P-20 off and no rows; indented block |
| F-127 | S-06 and S-06b; split at `:` only with Custom; empty info; `:info` without a language; Language name label for aliases; None shows no label |
| F-128 | S-mermaid with P-20 and P-24; needs both; a bad diagram stays code and later ones render; hostile labels inert; runner is `sandbox="allow-scripts"` |
| F-129 | the six engines plus `gv` and `graphviz`; needs P-20 and P-25; bad source; hostile labels and `URL` attributes inert |
| F-130 | inline `\\(`, display `\\[`, `$$`; MathML; P-18 gating live; no MathJax request when off; no CDN request; TeX with `<`, `&`; math in code is not typeset; invalid TeX; oracle diff for the Markdown stage |
| F-131 | `$x$` only with P-19 and P-18; escaped `\$`; `$` in raw HTML blocks |
| F-132 | S-07 on/off/live; `[X]` not a task; nested, ordered, loose items; checkboxes disabled and not clickable |
| F-133 | S-11; off; malformed (unterminated, invalid YAML, not at start, empty block); escaping, nesting, null; arrays; scalar document |
| F-134 | S-14 on/off live |
| F-135 | raw HTML pass-through; 19 hostile vectors with every script feature on (script, `on*`, `javascript:`, srcdoc, form, meta refresh, object, base, CSS url, fence-language and `data-information` injection); clicking `javascript:`, `data:` and `vbscript:` links; MathJax `\href`, `\class`, `\style`; diagram labels; app chrome unchanged |
| F-136, F-166 | each of the six styles and "no style" have distinct computed styles; default GitHub2; GitHub-2017 hidden; live switch; order base style before Prism theme |
| F-117 | S-09; numbering by first reference; back-links; off; repeated reference (D-06) |
| F-118 | grammar `^word`, `^(a b)`, `^()`; oracle diff |
| §6.10 | style and script order (builder's unit tests, reviewed) |
| M2 retest | D-01, D-02, D-03 via the existing failing tests |

## Exploratory checks (not automated)

- Visual review of a feature-rich document under GitHub2, Clearness Dark and Solarized (Dark) with the Okaidia theme, line numbers, language label, MathJax, Mermaid, Graphviz, TOC, footnote and front matter (screenshots in the tester scratchpad).
- Performance of a 350 000 character document.

## Not covered

Contrast ratios of preview styles (copied verbatim from the original), the preference UI (M5), export/print (M5), editor-side highlighting (M4).

## M4 (editing features)

Oracle: `vendor/macdown` (NSTextView+Autocomplete.m, MPDocument.m, MPEditorView.m, HGMarkdownHighlighter.m, pmh_grammar.leg), the bundle's `.style` files and toolbar icons, and a small AppKit program (scratchpad `m4/lm.m`) that measures NSLayoutManager rectangles for F-79.

| F-ID | Cases |
|---|---|
| F-40 to F-61 | every command by keyboard, Format menu, toolbar, keyboard with focus in the preview, menu after clicking the preview; multi-line, empty lines, trailing newline; one undo and one redo step per command; shortcut labels; Shift variants do not collide; non-shortcut modifiers inert; keyboard- and mouse-made selections; 4000-case differential fuzz against an independent transliteration of the Obj-C (unit) |
| F-59/F-60 | clipboard: http, https, file (any case), ftp, mailto, tel, data, javascript, www, paths, text, spaces, newline, empty; no permission; menu, toolbar and key; removal ignores clipboard |
| F-61 | 11 cursor/selection cases, undo, no toolbar button |
| F-62 to F-65 | S-16 E1 to E23 with real keys; typing flows; boundary set (punctuation vs symbols); every pair; wrap; skip; delete pair incl. selection; P-36 off |
| F-66 to F-69 | Return matrix for P-38 on/off and P-39 on/off (40 rows); undo; Shift+Return (observation) |
| F-70 to F-73 | Tab, Shift+Tab, Backspace (P-36 x P-37 matrix), smart Home incl. wrapped lines and Shift extension |
| F-74, F-166 | 15 themes vs `.style` files (editor colours, caret, selection, 20 element styles each), no theme defaults, block-level comment, live switch, F-165 |
| F-75 to F-79 | font, line spacing, insets (0 and 35 included), width limit on both sides of the boundary and on resize, scroll past end numbers and behaviour |
| F-13, F-14, U-08 | order, five flexible spaces, geometry, sizes, tooltips, icons byte-equal to the bundle, narrow widths, Customize (13 items, default state, each item off/on, default set, Done/Escape/outside, right click, modal accessibility), hide/show |
| F-81 to F-107 | Edit menu items and shortcuts, spell check checkable, Cut/Copy/Paste/Delete, Select All from the preview, Find family, Transformations |
| M3 retest | D-04 to D-08 in the browser (plus the existing unit and E2E tests) |

## M5 (files, preferences, export, print, help) and final regression

Oracles: `vendor/macdown` (MPDocument.m, MPRenderer.m, NSString+Lookup.m, the preference xibs), the installed `/Applications/MacDown.app` bundle (exported asset bytes: Styles, Prism, Extensions, MathJax/init.js), and three small macOS probes compiled from Objective-C (scratchpad `m5/`): `ret.m` (key bindings: Return, Shift+Return, keypad Enter, Opt+Return, Ctrl+Return), `enc.m` (`initWithData:encoding:` UTF-8: BOM, invalid bytes, CRLF, NUL) and `pe.m` / `pe2.m` (`stringByDeletingPathExtension`), plus `tr.m` (NSTextView `uppercaseWord:` family, Q-05). The File System Access API is mocked with `page.addInitScript` (open queue, save queue, failing write, byte-exact writes); the fallbacks use Playwright's `filechooser` and `download`.

Files: `tests/unit/m5-independent.test.ts`, `tests/e2e/m5-independent.spec.ts` (the builder's `m5-files-prefs-export.*` were reviewed, not replaced).

| Area | Cases |
|---|---|
| M4 retest | D-09 (`<b>x</b>`, `<div class=a>`, `<br/>`, P-36 off), D-10 (block comment colour in four themes against the `.style` files), D-11 (30 Tab and 30 Shift+Tab stay inside, Escape returns the focus), D-12 (empty toolbar stored as `[]`, survives a reload, Customize still reachable, Use Default Set); Q-04 (Return, Shift+Return, keypad Enter on bullet, quote and numbered lines); SD-09 (trailing newline case); Q-05 (13 AppKit-probe cases, one undo step); item 92 (command and typing are separate undo steps) |
| F-34 / F-16 | title lifecycle (em dash), undo back to clean, Revert enablement, untitled empty document |
| F-21, F-22, F-25, F-28 | prompt texts and buttons, Escape, Cancel keeps selection and undo history, Don't Save, Save in the prompt, cancelled picker; Open (picker options, handle, empty file, 5 valid and 7 invalid UTF-8 inputs incl. BOM, NUL, truncated, overlong, surrogate, UTF-16, Latin-1; CRLF; 2 MB file); fallback input (repeat same file, invalid UTF-8); Revert (external change, no handle); Close (3 choices) |
| F-26, F-27, F-30, F-31 | 18-row presumed-name matrix checked in the Export panel and the Save panel; Save in place, cancelled panel, failing write, UTF-8 bytes; download fallback; Save As; P-41 on 6 texts (selection kept) |
| F-29, F-32 / U-12 | draft timing and `pagehide`, restore, corrupt drafts (7 forms), P-02 on/off, empty state (menu disabled, no exceptions), New/Open from the empty state, stale-draft check after Close |
| F-33, drop | JPEG at the selection start (70 000 random bytes round-trip), first file only, PNG ignored, outside the editor ignored; .md on toolbar/editor/empty state; non-UTF-8; preview drop disabled |
| F-153 to F-155, F-142 | help.md and contribute.md byte-equal to the source, no prompt, draft untouched, Close restores text, selection and edited state, handle survives, reload while help is open, first launch with P-02 on and off, in-page links of help.md |
| F-140, F-141 | panes, titles, last pane, non-modal, keyboard, accessible names; General, Markdown (11 toggles one by one, live preview and Format menu), Editor (labels and order from the xib, ranges, clamping, empty = 0, arrow keys, width, font, live behaviours, P-38/P-39), Rendering (rows, enablement, live toggles); persistence, `?pref.` overrides, corrupt stores, storage event |
| F-17 / U-19, F-138 | zoom 2, 0.5, off, reload, re-render; Import of CSS and `.style`, same-name replace, Reload, broken theme resets |
| F-35, F-36, F-37, F-39 | 8 combinations of the two boxes with P-20 on and off compared byte for byte with the bundle's assets and order; MathJax config and CDN link; Prism themes; self-contained exported page (Prism, line numbers, Mermaid, Graphviz, clickable checkboxes) opened on its own; body equals the preview body; `<title>`; dialog keyboard; cancel and failure; PDF/Print on the preview document only, `@page` CSSOM rule, real Chromium PDF rasterised with `sips` (50 pt top/bottom, 0 left/right), print media emulation; Copy HTML (menu, toolbar, shortcut, front matter, TOC, no Prism or script output, single `text/plain` item, fresh render when hidden or manual, denied permission) |
| Security | hostile file opened (10 vectors, all script features on), hostile content exported and copied, hostile file name in `<title>` |
| Section 3 | every in-scope menu: items, order, shortcut glyphs; Out items absent; shortcut look-alikes; shortcuts blocked while a sheet is open |
| Exploratory | production build (`vite preview`), whole UI clicked through, screenshots, console and page errors recorded; focus after document commands; storage quota |

## Final sign-off (M5 fixes D-13 to D-20, SD-13, O-01, O-03, linear LinkEnd)

Files: `tests/unit/m5-signoff.test.ts` (74 tests), `tests/e2e/m5-signoff.spec.ts` (37 tests), fixture `tests/unit/fixtures/foundation-pathext.json` (output of a Foundation probe, `pathExtension` and `stringByDeletingPathExtension` of 35 names; scratchpad `so/pe.m`).

| Area | Cases |
|---|---|
| SD-13 | Source check (YAMLSerialization.m:80-82, MPDocument.m:1873-1875, NSString+Lookup.m `frontMatter:`): an empty `title:` is `""` and `presumedFileName` tests only nil. The single assertion in `m5-independent.test.ts` changed from `'H'` to `''`. Also E2E: Save suggests `Untitled.md` for it |
| D-13 / SD-11 | Mixed CRLF, LF and lone CR: Open (not edited), Save As bytes, CR-only, CRLF-only, trailing-CR documents; Backspace, Delete and Return at 9 positions around each break kind, each with undo, redo, undo (Edited clears at the original text); selection across breaks deleted or replaced then undone; typing next to breaks; Save in place; draft reload then Save As; download fallback bytes; pasted CRLF becomes LF (documented deviation); P-41 on a CRLF file; preview of CR/CRLF text |
| O-01 | Save As, Save + later change, Export HTML each issued in the same task as `set()`; typing then Save |
| O-03 | refused name then safe name (every forbidden character, a hidden name, only forbidden characters), both refused (error sheet, still edited, editor usable), NotAllowedError / SecurityError on the retry, AbortError on the first or the second panel (no sheet), Save As of a named document, Export HTML retry and error sheet, Save in place after the retry |
| F-18 / D-15 / D-16 | id vs `<a name>` in both orders, first of several names, name on a non-`<a>` element, `#`, `#top`, `#TOP`, `#Top`, `id="top"`, percent escapes (`%41`, `%20`, UTF-8, `%25`), malformed escapes (`#100%`, `#%`, `#%zz`, `#%E0%A4%A`, `#%FF`, `#%C3`) with page errors recorded, an id containing a literal `%` |
| D-17 | 35 names against the Foundation probe (`a.`, `a..md`, `..md`, `a.\tb`, no-break space, `a/b.c/d`, non-ASCII extensions...) |
| D-20 | Matrix: New, Open, Revert, Help, Close with the editor focused and typing working; editor pane hidden (preview focused, text unchanged); no document (Close focuses New; Enter on it; Open and Help from the empty state) |
| linearLinkEnd | Node names and positions equal to the stock parser on 30 fixed cases (nested brackets, images, reference links, titles, escapes, entities, HTML, lists, quotes, tables, code, CR/CRLF, CJK, 100 KB lines, 3000 nested `[`), the 10 Markdown documents of the repo and every Prism README paragraph, 30,000 random inputs over three alphabets, the GFM base; 40,000-link paragraph is linear; fallback: no override when `inlineNames`/`inlineParsers` are missing, of another shape, lack Link, Image or LinkEnd, or hold undefined parsers |
