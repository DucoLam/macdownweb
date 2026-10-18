# Plan — MacDown → Web Application

## Source
- App bundle: `~/Downloads/MacDown.app` (0.7.3)
- Source code (MIT): https://github.com/MacDownApp/macdown — authoritative for behaviour, preference keys/defaults, and Hoedown flags. Clone into `vendor/macdown` (gitignored) for reference.

## Goal
Rebuild MacDown 0.7.3 (native macOS Markdown editor, `~/Downloads/MacDown.app`) as a browser-based web application with feature parity on the core editing/preview workflow.

## Definition of done
- `docs/spec.md` describes MacDown's features (derived from the app bundle: nibs, plists, help.md, Styles, Themes, Prism, MathJax, syntax_highlighting.json, preference panes).
- Web app in `web/` builds (`npm run build`) and runs (`npm run dev`) with Node 24.
- Every in-scope feature in the spec is implemented and covered by Playwright E2E or unit tests; test-engineer reports all milestones passing.

## Scope
**In:** split editor/preview with live render and scroll sync; Markdown extensions toggles (tables, fenced code, autolink, strikethrough, underline, highlight, footnotes, superscript, quote, smartypants, intra-emphasis, TOC, etc. as exposed in MacDown prefs); Prism code highlighting with language list; MathJax (TeX); task lists; front matter; preview CSS styles from `Resources/Styles`; editor themes from `Resources/Themes` + editor syntax highlighting; formatting toolbar + keyboard shortcuts (bold, italic, underline, highlight, strikethrough, headings 1–6, lists, blockquote, inline code, link, image, comment, shift left/right, copy HTML, hide editor/preview); editor behaviours (auto-pair, smart list continuation, tab/indent, word count); preferences panes General/Markdown/Rendering/Editor; new/open/save/save-as/autosave draft; export HTML (with/without styles) and PDF (via print); help document.
**Out:** Sparkle auto-update, AppleScript (sdef), `macdown` CLI / Terminal pane, localization (English only), multi-window document tabs beyond a single open document, macOS-specific services.

## Assumptions
- Client-only SPA, no backend (MacDown is a local single-document editor). File access via File System Access API with upload/download fallback; prefs/drafts in localStorage.
- MacDown is MIT-licensed; reusing its bundled Styles/Themes CSS and help.md is acceptable.
- Node is at `~/.nvm/versions/node/v24.22.0/bin` (not on default PATH) — every shell command must `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH`.
- REA MCP server failed to connect this session; reverse-engineer analyses the bundle with standard tools (plutil, ibtool/strings, file reading).

## Risks
- Hoedown vs. markdown-it rendering differences → spec must give reference input/output examples; tests compare structure, not byte-exact HTML.
- Compiled nibs may be hard to read → fall back to strings/localizable .strings files for menu & preference labels.
- File System Access API is Chromium-only → fallback required; Playwright runs Chromium.

## Target stack
TypeScript, React + Vite, CodeMirror 6 (editor), markdown-it + plugins (renderer), Prism, MathJax 3, Vitest (unit), Playwright (E2E). No backend.

## Milestones
| # | Milestone | Owner | Inputs | Deliverables | Acceptance criteria |
|---|---|---|---|---|---|
| M1 | Functional spec | reverse-engineer | MacDown.app bundle + source repo (M1b: cross-check pass against source) | `docs/spec.md` | Covers every menu item, toolbar button, shortcut, preference (name, default, effect), rendering extension, export option; each feature has an ID (F-xx) and in/out-of-scope flag; includes sample Markdown→expected HTML cases |
| M2 | Scaffold + core editor/preview | reverse-engineer | spec | `web/` Vite app; CodeMirror editor; live markdown-it preview; split pane; scroll sync; hide editor/preview; word count | `npm run build` ok; typing updates preview <300ms; layout toggles work |
| M3 | Rendering parity | reverse-engineer | spec | Extensions with toggles, Prism, MathJax, task lists, TOC, front matter, preview Styles | spec sample cases render correctly |
| M4 | Editing features | reverse-engineer | spec | Toolbar, shortcuts, auto-pair, list continuation, indent shift, editor themes | each F-xx editing feature works via button & shortcut |
| M5 | Files, prefs, export, help | reverse-engineer | spec | New/open/save/save-as/autosave, Preferences UI (persisted), export HTML/PDF, copy HTML, help doc | prefs persist across reload; exported HTML matches preview |
| T  | Test each milestone (M2–M5) | test-engineer | spec + `web/` | `web/tests/` (Vitest + Playwright), `docs/test-report.md` | all in-scope F-xx have ≥1 passing test; defects logged with repro |

## Hand-off order
M1 (RE) → CoS reviews spec → M2 (RE) → T-M2 (TE) → fixes → M3 → T-M3 → … → M5 → T-M5 → full regression (TE) → report.
