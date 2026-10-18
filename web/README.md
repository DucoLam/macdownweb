# MacDown Web

A browser rebuild of MacDown 0.7.3 (macOS Markdown editor). The spec is `../docs/spec.md` and the plan is `../docs/plan.md`.

Stack: TypeScript, React + Vite, CodeMirror 6, markdown-it, Vitest. There is no backend.

## Setup and run

Node 24 is at `~/.nvm/versions/node/v24.22.0/bin` and is not on PATH by default:

```sh
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
cd web
npm install
npm run dev        # dev server at http://localhost:5173
npm run build      # type check (tsc -b) and production build into dist/
npm run preview    # serve dist/
npm test           # Vitest unit tests (vitest run)
npm run test:e2e   # Playwright E2E tests (starts the dev server on :5173)
npm run typecheck  # tsc -b only
```

### Testing aids

- **Preference overrides.** Preferences are set in the Preferences window (MacDown > Preferences…, `Cmd+,`) and persisted in localStorage. For tests, any preference from spec §8 can also be set in the URL as `?pref.<key>=<value>`; URL overrides win over stored values and are never persisted (an explicit change of the same key in the window replaces the override). Values are parsed as JSON where possible, for example `?pref.editorShowWordCount=true&pref.extensionStrikethough=true&pref.editorOnRight=true`.
- **Runtime hook.** `window.macdownPrefs.set({ ... })`, `.get()` and `.reset()` change preferences live. A change re-renders the preview (F-141).
- **M3 rendering options.** Every §8.2/§8.3 option goes through the same mechanism, for example `?pref.htmlSyntaxHighlighting=true&pref.htmlHighlightingThemeName=Okaidia&pref.htmlLineNumbers=true&pref.htmlCodeBlockAccessory=2&pref.htmlMathJax=true&pref.htmlMathJaxInlineDollar=true&pref.htmlTaskList=true&pref.htmlRendersTOC=true&pref.htmlDetectFrontMatter=true&pref.htmlMermaid=true&pref.htmlGraphviz=true&pref.extensionSmartyPants=true`. Preview style: `?pref.htmlStyleName=Clearness%20Dark`; the empty "no style" item (F-166) is `?pref.htmlStyleName=%22%22`. Prism theme names: `''` (Default), `Coy`, `Dark`, `Funky`, `Okaidia`, `Solarizedlight`, `Tomorrow`, `Twilight`.
- **Preview script state.** The preview document's `<html>` has `data-macdown-scripts="pending"` while Prism, MathJax or diagram assets are loading and `"done"` once every page script ran. Wait for `done` before asserting on highlighted or typeset output.
- **Editor hook.** `window.macdownEditor` gives exact access to the editor: `.text()`, `.selection()` (`{from, to}`), `.set(doc, from?, to?)` (one transaction that replaces the document, never passed through the input rules) and `.select(from, to?)`.
- **M4 editor preferences.** For example `?pref.editorCompleteMatchingCharacters=true` (P-36), `?pref.editorConvertTabs=true` (P-37), `?pref.editorInsertPrefixInBlock=false` (P-38), `?pref.editorAutoIncrementNumberedLists=false` (P-39), `?pref.editorSmartHome=true` (P-40), `?pref.editorScrollsPastEnd=true` (P-42), `?pref.editorUnorderedListMarkerType=2` (P-45), `?pref.editorWidthLimited=true&pref.editorMaximumWidth=600` (P-35), `?pref.editorHorizontalInset=30&pref.editorVerticalInset=10` (P-33, P-34), `?pref.editorLineSpacing=8` (P-32), `?pref.editorBaseFontInfo={"name":"Courier-Regular","size":18}` (P-30), `?pref.editorStyleName=Solarized%20(Dark)` (P-31; `%22%22` = no theme, F-166), `?pref.editorContinuousSpellCheckingEnabled=true` (P-46), `?pref.toolbarVisible=false` and `?pref.toolbarItemIdentifiers=["comment","highlight","strikethrough","layout"]` (F-13, F-14; `null` = unset = the default set, `[]` = an empty toolbar, D-12). The 15 theme names are those of spec §7.2.
- **Document hook (M5).** `window.macdownDocument.info()` returns `{ kind: 'untitled' | 'file' | 'help', name, savedText, hasHandle }` (or null when no document is open), `.edited()` the F-34 edited state, `.stashed()` the document kept behind a help document.
- **First launch (F-155).** A browser profile without `macdown.firstVersionInstalled` opens the help document. `playwright.config.ts` sets that key through `storageState` for every test; the F-155 test uses an empty storage state.
- **File pickers.** The File System Access API (`showOpenFilePicker`, `showSaveFilePicker`) is used when present; tests mock both with `page.addInitScript`. Without it, Open uses the hidden `<input type=file>` (`open-file-input`, Playwright `filechooser`) and Save/Export download the file (Playwright `download`).
- **Split state.** The `data-testid="split"` element exposes `data-left-ratio` (4 decimals), `data-editor-visible` and `data-preview-visible`.

### data-testid reference

| testid | Element |
|---|---|
| `menubar`, `menu-<file\|edit\|view\|format\|help>`, `menu-<id>-dropdown` | In-app menu bar, menu titles and open dropdowns |
| `menuitem-<id>` | Menu items. View: `render`, `split-1-3`, `split-1-1`, `split-3-1`, `toggle-preview`, `toggle-editor`, `toggle-toolbar` (label Hide/Show Toolbar), `customize-toolbar`, `full-screen`. Edit: `undo`, `redo`, `cut`, `copy`, `paste`, `delete`, `select-all`, `find`, `find-replace`, `find-next`, `find-previous`, `use-selection-for-find`, `jump-to-selection`, `check-spelling` (`role="menuitemcheckbox"`, `aria-checked`), `make-upper-case`, `make-lower-case`, `capitalize`. Format: `copy-html`, `strong`, `emphasize`, `underline`, `strikethrough`, `highlight` (the last three only while P-11, P-10, P-12 are on, F-162), `inline-code`, `comment`, `header-1` … `header-6`, `paragraph`, `ordered-list`, `unordered-list`, `blockquote`, `shift-right`, `shift-left`, `link`, `image`, `new-paragraph` |
| `toolbar` | Toolbar (absent when hidden, F-13). `data-items` lists the shown identifiers in order, `flexible-space` included |
| `toolbar-item-<identifier>` | Toolbar item container (§4 item identifiers: `indent-group`, `text-formatting-group`, `heading-group`, `list-group`, `blockquote`, `code`, `link`, `image`, `copy-html`, `comment`, `highlight`, `strikethrough`, `layout`) |
| `toolbar-<sub-identifier>` | Toolbar buttons (§4 sub-item identifiers: `shift-left`, `shift-right`, `bold`, `italic`, `underline`, `heading1` … `heading3`, `unordered-list`, `ordered-list`, `blockquote`, `code`, `link`, `image`, `copy-html`, `comment`, `highlight`, `strikethrough`); `title` is the sub-item label, `data-command` the Format command |
| `toolbar-flexible-space`, `toolbar-space` | Spaces between toolbar items |
| `toolbar-customize`, `toolbar-customize-<item>`, `toolbar-customize-default`, `toolbar-customize-done` | Customize Toolbar dialog (F-14): the dialog, one checkbox per allowed item, Use Default Set, Done |
| `toolbar-layout` | Layout pull-down button (T-13, F-09). Enter/Space/Down open it, Up/Down move, Escape closes (D-02) |
| `layout-toggle-editor`, `layout-toggle-preview` | Layout pull-down items (shown when the pull-down is open) |
| `split` | Split container |
| `split-divider` | Draggable divider. Focusable (`tabindex=0`); Left/Right arrow keys move it by 2 % (D-03) |
| `editor-pane`, `editor` | Editor pane and CodeMirror host (`.cm-content` inside is the editable element). `editor` has `data-theme` = the current `editorStyleName` |
| `preview-pane`, `preview-iframe` | Preview pane and sandboxed iframe |
| `diagram-runner` | Hidden iframe (`sandbox="allow-scripts"`, opaque origin) that renders Mermaid and Graphviz. Created on first use, appended to `<body>` |
| `word-count` | Word-count pop-up (a `<select>`). Only rendered when `editorShowWordCount` (P-05) is on, which is off by default |
| `menu-app`, `menuitem-about`, `menuitem-preferences` | MacDown menu: About MacDown, Preferences… (`Cmd+,`) |
| `menuitem-<id>` (File) | `new`, `open`, `close`, `save`, `save-as`, `revert` (enabled only for an edited saved document), `export-html`, `export-pdf`, `print`. `new` and `close` show `⌘N` / `⌘W` but are menu only (browser-reserved) |
| `menuitem-help`, `menuitem-contributing` | Help menu (F-153, F-154) |
| `save-prompt`, `save-prompt-message`, `save-prompt-save`, `save-prompt-cancel`, `save-prompt-dont-save` | "Do you want to save the changes…" sheet (F-21, F-22, F-25, drop) |
| `revert-prompt`, `revert-prompt-message`, `revert-prompt-revert`, `revert-prompt-cancel` | Revert to Saved sheet (F-28) |
| `alert`, `alert-message`, `alert-ok` | Error sheet (file not UTF-8, write failure) |
| `export-html-dialog`, `export-html-filename`, `export-include-styles`, `export-include-highlighting`, `export-html-save`, `export-html-cancel` | Export HTML accessory (F-35, E-01, E-02) |
| `about`, `about-version`, `about-copyright`, `about-close` | About MacDown (F-142) |
| `empty-state`, `empty-state-new`, `empty-state-open` | No document open (P-02 off, U-12) |
| `open-file-input` | Hidden open input (fallback without the File System Access API) |
| `preferences`, `preferences-title`, `preferences-close`, `preferences-tab-<general\|markdown\|editor\|rendering>`, `preferences-pane-<pane>` | Preferences window (F-140). `preferences` has `data-pane` |
| `pref-<defaults key>` | One control per preference, named by its §8 key, e.g. `pref-markdownManualRender` (checked = "Update preview automatically", negated key), `pref-supressesUntitledDocumentOnLaunch` (checked = "Ensure open document on launch"), `pref-htmlStyleName`, `pref-editorStyleName`, `pref-editorLineSpacing` |
| `pref-editorBaseFontInfo-preview`, `-change`, `-family`, `-size` | Base font (P-30): preview text, Change…, family pop-up, size field |
| `pref-htmlStyleName-<reveal\|reload\|import\|import-input>`, `pref-editorStyleName-<…>` | Reveal (disabled, F-137 Out), Reload and Import… (F-138) next to the CSS and Theme pop-ups |

## Structure

```
web/
  index.html
  public/icons/             Toolbar icons from MacDown.app (MIT)
  src/
    main.tsx, App.tsx       App shell: menus, toolbar, split, render loop, shortcuts
    app.css                 App chrome styles
    prefs/                  Typed preferences with spec §8 defaults and an in-memory store
    render/                 Markdown → HTML (markdown.ts), Hoedown-compatible rules
                            (extensions.ts, hoedown.ts), SmartyPants port (smartypants.ts),
                            TOC (toc.ts), front matter (frontMatter.ts), §6.10 asset order
                            (assets.ts + assets/*.css), page template (template.ts),
                            preview styles (styles.ts + styles/*.css), page scripts run
                            against the preview (postprocess.ts, prism.ts, diagrams.ts,
                            mathjax.ts), DOM word count (wordCount.ts), syntax_highlighting.json
  public/macdown/           Bundled MacDown assets (MIT): Prism 1.4.1 components and
                            plugins, Extensions (tasklist, mermaid, viz), MathJax/init.js
    editor/                 CodeMirror 6 setup (setup.ts) and React wrapper (Editor.tsx); line endings
                            kept as read (lineBreaks.ts, D-13); linear-time link parsing (linearLinkEnd.ts)
    document/               Document model (document.ts), file access (files.ts), draft and launch
                            state (draft.ts), HTML export (export.ts), bundled help (help.ts, assets/)
    layout/                 Split-view state (split.ts), scroll sync (scrollSync.ts)
    components/             MenuBar, Toolbar, Preview (iframe), shortcuts, Dialogs (sheets, export,
                            about, empty state), PreferencesWindow
  tests/unit/               Vitest unit tests (M4: m4-editor, m4-integration, m4-fixes; M5: m5-files-prefs-export,
                            m5-fixes, linear-link-end); *-independent files are the test engineer's
  tests/e2e/                Playwright specs (M4: m4-editing.spec.ts; M5: m5-files-prefs-export.spec.ts,
                            m5-fixes.spec.ts)
```

The renderer API is `renderMarkdown(markdown, prefs)`, which returns the body HTML, `parseMarkdown(markdown, prefs)`, which also returns the code-block languages and the front matter, and `renderDocument(markdown, prefs, { title })`, which returns `{ body, html, styles, scripts, languages, frontMatter }` (`src/render/index.ts`). `styles` and `scripts` are the §6.10 asset ids in inclusion order; M5 export can embed them from `public/macdown/`.

## Spec traceability (M2 to M5)

| Spec ID | Status | Where |
|---|---|---|
| F-01 Split editor/preview, 1:1 default | done | `layout/split.ts`, `App.tsx` |
| F-02 Live preview | done. Debounced 150 ms (see Deviations); preview scroll position kept across re-renders | `App.tsx`, `components/Preview.tsx` |
| F-03 Render Markdown (View menu, Cmd+R) | done. With P-01 off it is the only way to refresh | `App.tsx` |
| F-04 / F-05 / F-06 Left 1:3, 1:1 (Shift+Cmd+0), 3:1 Right | done | `layout/split.ts` |
| F-07 Hide/Restore Preview Pane (Shift+Cmd+H, Layout) | done, including ratio memory and the "hidden when there is nothing to restore" rule | `layout/split.ts` |
| F-08 Hide/Restore Editor Pane (Shift+Cmd+E, Layout) | done. The editor is not editable while collapsed | `layout/split.ts`, `editor/Editor.tsx` |
| F-09 Layout toolbar pull-down | done | `components/Toolbar.tsx` |
| F-10 Editor on right (P-03) | done (via `?pref.editorOnRight=true`) | `App.tsx` |
| F-11 Scroll sync (P-04, default on) | done. Port of `updateHeaderLocations` / `syncScrollers` | `layout/scrollSync.ts` |
| F-12 Word count (P-05, P-06c) | done. DOM count of the rendered preview, same rules as `DOMNode+Text.m` | `render/wordCount.ts` |
| F-13 Show/Hide Toolbar (Opt+Cmd+T) | done | `App.tsx` |
| F-15 Enter/Exit Full Screen (Ctrl+Cmd+F) | done (Fullscreen API) | `App.tsx` |
| F-16 Window title and layout memory | done (M5): file name or "Untitled", " — Edited" while edited (Q-01: `document.title`); split ratio remembered per named document, also for the document restored at launch (D-19) | `document/document.ts` `windowTitle`, `document/draft.ts` |
| F-18 Preview link handling | done: `#` anchors scroll to the `id` or the first `<a name>` (D-15), `#` and `#top` to the top, malformed escapes never throw (D-16); http(s)/ftp/mailto open a new tab, other links do nothing | `components/Preview.tsx` |
| F-81 / F-82 / F-87 / F-88 Undo, Redo, Select All, Find | done (CodeMirror) | `App.tsx`, `editor/setup.ts` |
| F-110 Core Markdown | done (markdown-it, CommonMark) | `render/markdown.ts` |
| F-111 Tables (P-07) | done | `render/markdown.ts` |
| F-112 Fenced code (P-08) and §6.4 code-block HTML | done, without Prism (M3) | `render/markdown.ts` |
| F-113 Autolink (P-09) | done | `render/markdown.ts` |
| F-114 Strikethrough (P-10), `<del>` | done | `render/markdown.ts` |
| F-122 Header ids `toc_N` | done | `render/markdown.ts` |
| F-134 Hard wrap (P-29b) | done | `render/markdown.ts` |
| F-135 Raw HTML pass-through | done | `render/markdown.ts` |
| F-136 Preview style (default GitHub2) | done. Selectable through `?pref.htmlStyleName=…`; the UI comes in M5 | `render/styles.ts` |
| F-139 Template (§7.4) | done | `render/template.ts` |
| F-115 Underline (P-11) `_x_` → `<u>` | done (M3) | `render/extensions.ts` `underlinePlugin` |
| F-116 Highlight (P-12) `==x==` → `<mark>` | done (M3) | markdown-it-mark |
| F-117 Footnotes (P-13), Hoedown markup §6.5 | done (M3) | markdown-it-footnote + `hoedownFootnotes` |
| F-118 Superscript (P-14) `^x`, `^(x y)` | done (M3), U-13 grammar | `superscriptPlugin` |
| F-119 Quote (P-15) `"x"` → `<q>` | done (M3) | `quotePlugin` |
| F-120 SmartyPants (P-16) | done (M3): port of Hoedown `html_smartypants.c`, run on the body HTML before the TOC | `render/smartypants.ts` |
| F-121 Intra-word emphasis (P-17), including the `_` rule (U-03) and `~~`, `==` | done (M3) | `intraEmphasisPlugin` |
| F-123 TOC (P-27) | done (M3): `[TOC]` paragraphs matched case-insensitively, inserted after SmartyPants, levels 1–6, first-header level offset | `render/toc.ts` |
| F-124 Prism highlighting (P-20) and theme (P-21) | done (M3): bundled Prism 1.4.1, theme file fallback to `prism.css` | `render/prism.ts`, `render/assets.ts` |
| F-125 Language aliases and on-demand loading | done (M3): case-sensitive alias, first word only, `require` dependencies first, files fetched per document | `render/markdown.ts` `addToLanguages`, `render/assets.ts` |
| F-126 Line numbers (P-22) | done (M3): class follows P-22, rows from the line-numbers plugin | `renderCodeBlock`, Prism plugin |
| F-127 Accessory (P-23) | done (M3): Language name = show-language plugin; Custom = `lang:info` split + `data-information` + `show-information.css` | `renderCodeBlock`, `render/assets.ts` |
| F-128 Mermaid (P-20 + P-24) | done (M3), bundled mermaid.min.js | `render/diagrams.ts` |
| F-129 Graphviz (P-20 + P-25): dot, circo, fdp, neato, osage, twopi (`gv`, `graphviz` aliases) | done (M3), bundled viz.js | `render/diagrams.ts` |
| F-130 MathJax (P-18) | done (M3), partial by design: MathJax 3 (local `mathjax-full`, SVG output) instead of MathJax 2.7.3 from the CDN | `render/mathjax.ts`, `mathPlugin` |
| F-131 `$…$` inline math (P-19) | done (M3) | `mathPlugin`, `render/mathjax.ts` |
| F-132 Task lists (P-26) | done (M3): `[ ]`/`[x]` only, checkbox inside `<p>` for loose items, disabled as tasklist.js does | `taskListPlugin`, `render/postprocess.ts` |
| F-133 Front matter (P-28) | done (M3): original regex, YAML failsafe schema (all strings), ordered keys, tables per `HTMLTable` | `render/frontMatter.ts` |
| F-136 Preview styles, all of §7.1 | done (M3): Clearness, Clearness Dark, GitHub, GitHub2, Solarized (Dark), Solarized (Light); GitHub-2017 hidden | `render/styles.ts` |
| F-166 "No style" option | done (M3): empty `htmlStyleName` writes no style tag | `render/index.ts` |
| §6.10 inclusion order | done (M3): `renderDocument().styles` / `.scripts` | `render/assets.ts` |
| D-01 Edit > Find… focuses the search field | fixed | `App.tsx` `openFind` |
| D-02 Menus and Layout pull-down keyboard operable | fixed | `components/MenuBar.tsx`, `components/Toolbar.tsx`, `components/menuKeys.ts` |
| D-03 Divider focusable, arrow keys resize | fixed | `App.tsx` |
| F-13 / F-14 Toolbar (§4): resolved default order (U-08) with flexible spaces; Comment, Highlight, Strikethrough only through `toolbarItemIdentifiers` / Customize Toolbar; View > Hide/Show Toolbar (Opt+Cmd+T) | done (M4). Customize Toolbar is a checkbox dialog, not NSToolbar drag and drop | `components/Toolbar.tsx`, `App.tsx` |
| F-39 Copy HTML (Opt+Cmd+C, toolbar) | done (M4): body HTML of the current text, rendered fresh | `App.tsx` `copyHtml` |
| F-40 to F-46 Strong, Emphasize (bold-safe), Underline, Strikethrough, Highlight, Inline Code, Comment | done (M4), `toggleForMarkupPrefix:suffix:` port | `editor/text.ts` `toggleMarkup`, `editor/commands.ts` |
| F-47 to F-53 Header 1–6, Paragraph (Cmd+1…6, Cmd+0) | done (M4) | `text.ts` `makeHeader` |
| F-54 Ordered List (Shift+Cmd+O) | done (M4) with the U-05 deviation (`^[0-9]+\. \S`, matched prefix stripped) | `text.ts` `ORDERED_LIST`, `toggleBlock` |
| F-55 / F-80 Unordered List (P-45 marker), F-56 Blockquote | done (M4); selection shifted as in the original | `text.ts` `toggleBlock` |
| F-57 / F-58 Shift Right / Left (Cmd+], Cmd+[) | done (M4) | `text.ts` `indentLines`, `unindentLines` |
| F-59 / F-60 Link / Image (Shift+Cmd+K, Shift+Cmd+I) | done (M4): the clipboard text is used only when it is an `http`, `https` or `file` URL (async Clipboard API; no permission = no URL) | `text.ts` `toggleLink`, `urlFromClipboard` |
| F-61 New Paragraph (Cmd+Return) | done (M4): `\n\n` at the cursor, one newline on an empty line | `text.ts` `newParagraph` |
| F-162 Hidden Format items | done (M4): Underline, Strikethrough, Highlight menu items and shortcuts only while P-11 / P-10 / P-12 are on; the toolbar buttons always work | `App.tsx` |
| F-62 to F-65 Auto-pair, wrap, skip closer, delete pair (P-36, default off) | done (M4), boundary rule for `'` and `"`, the `""` quirk kept | `text.ts` `autoPairInput`, `deleteMatchingPair`; `commands.ts` input handler |
| F-66 to F-69 Return: list, number (P-39), quote, indent (F-69 not gated by P-38) | done (M4), empty item ends the list, empty quote is continued | `text.ts` `returnKey` |
| F-70 / F-71 Tab / Shift+Tab, F-72 soft-tab Backspace (P-37), F-73 smart Home (P-40) | done (M4). Other Backspaces delete exactly one character (CodeMirror's indent-unit deletion is not used) | `commands.ts` `editorBehaviours` |
| F-74 / F-166 Editor themes | done (M4): the 15 `.style` files parsed at run time, default Tomorrow+, empty name = no theme, parse errors reset `editorStyleName` | `editor/themes.ts`, `editor/themes/*.style` |
| F-75 / F-76 / F-77 Font (P-30), line spacing (P-32), insets (P-33, P-34) | done (M4) | `editor/setup.ts` `editorAppearance` |
| F-78 Width limit (P-35): inset (width − max) × 0.45 | done (M4), re-measured on resize | `setup.ts` `horizontalInset`, `layoutPlugin` |
| F-79 Scroll past end (P-42) | done (M4) | `setup.ts` `scrollPastEndExtra` |
| F-83 to F-86 Cut, Copy, Paste, Delete (menu) | done (M4) | `commands.ts` |
| F-89 to F-93 Find and Replace, Find Next/Previous, Use Selection for Find, Jump to Selection | done (M4), CodeMirror search | `commands.ts`, `App.tsx` |
| F-96 Check Spelling While Typing (P-46) | done (M4): checkable Edit item, sets `spellcheck` on the editor | `App.tsx`, `setup.ts` |
| F-105 to F-107 Make Upper Case, Make Lower Case, Capitalize | done (M4) | `text.ts` `transform` |
| Q-02 Restore Preview Pane hidden, not disabled | checked: the original sets `it.hidden` [MPDocument.m:670]; no change | `layout/split.ts` |
| M4 fixes D-09 to D-12, SD-07 to SD-09, Q-04, Q-05, undo isolation | done; recorded in spec §13 "M4 fixes" (items 83 to 92) | `editor/setup.ts` (`autoCloseTags: false`), `editor/commands.ts` (`Prec.highest` input handler, `isolateHistory`, Shift+Return), `editor/themes.ts` (`styledTags`), `components/Modal.tsx` (`trapTab`), `components/Toolbar.tsx` (`[]` vs `null`), `editor/text.ts` (`transform`, `capitalize`) |
| F-21 New | done (M5): save prompt for an edited document, then a blank untitled document with a fresh undo history. Menu only (`Cmd+N` is browser-reserved) | `App.tsx` `newDocument` |
| F-22 Open | done (M5): `showOpenFilePicker` (types `.md`, `.markdown`, `.txt`), else `<input type=file>`; strict UTF-8 (a non-UTF-8 file shows "The document “x” could not be opened."); CRLF / CR line endings kept as read (D-13); the file is chosen first, then the save prompt; the editor gets the focus (D-20) | `document/files.ts`, `App.tsx` `openDocument` |
| F-25 Close | done (M5): save prompt; then the user's document again (after help), a blank untitled document (P-02 on) or the empty state (P-02 off, which also clears the draft, D-14). Menu only (`Cmd+W`) | `App.tsx` `closeDocument` |
| F-26 / F-27 Save, Save As | done (M5): in place through the file handle; otherwise `showSaveFilePicker` with the F-31 name + `.md` (Save As: the current name), else a download. Written with the document's own line endings (D-13). A picker that refuses the name is asked again with a safe name, then an error sheet (O-03) | `App.tsx` `saveDocument` |
| F-28 Revert to Saved | done (M5): enabled for an edited saved document, confirmation sheet, re-reads the file (or the saved text), fresh undo history | `App.tsx` `revertDocument` |
| F-29 Autosave | done (M5): draft in localStorage (`macdown.draft`) 250 ms after a change and on `pagehide`; a draft over the quota removes the older one (D-18) | `document/draft.ts` |
| F-30 Ensure newline on save (P-41) | done (M5): `\n` appended in the editor after the panel and before writing, selection kept, never for an empty text | `App.tsx` `ensureNewline` |
| F-31 Presumed file name | done (M5): file name without extension (`stringByDeletingPathExtension` rules, D-17), front-matter title (P-28, an empty title is `""`, SD-13), highest-level ATX header with `/`, `\|` and `:` replaced by `-`, "Untitled" | `document/document.ts` |
| F-32 / U-12 Launch (P-02) | done (M5): checked = the draft or a blank document; unchecked = empty state with New and Open | `App.tsx` `initialDocuments` |
| F-33 JPEG drop | done (M5): the first dropped file, when JPEG, inserted as `![](data:image/jpeg;base64,…)` at the selection start | `App.tsx` drop handler |
| Drag and drop of Markdown files | done (M5): a `.md`/`.markdown`/`.txt` file dropped anywhere opens as the document (save prompt first); drops on the preview are ignored (F-18) | `App.tsx`, `components/Preview.tsx` |
| F-34 Dirty state | done (M5): an untitled empty document is never edited; otherwise text ≠ saved text | `document/document.ts` `isEdited` |
| F-35 / E-01 to E-04 Export HTML | done (M5): accessory sheet (Include styles = style set; Include syntax highlighting = P-20), save panel or download (`<presumed name>.html`), assets embedded per U-11 (one trailing newline dropped), MathJax config embedded and MathJax 2.7.3 linked from the CDN, no `show-information.css`, no `tasklist.js`, Mermaid/Graphviz only with highlighting, `<title>` only for a saved document | `document/export.ts` |
| F-36 / E-05 Export PDF | done (M5): the print dialog for the preview document with the presumed file name as its title (the browser's "Save as PDF" name) | `App.tsx` `printPreview` |
| F-37 / E-06 Print | done (M5): `print()` on the preview document only; `@page { margin: 50pt 0pt; }` as an adopted style sheet (no extra `<style>` in the page) | `components/Preview.tsx` `PRINT_CSS` |
| F-17 Preview zoom (P-29) | done (M5): CSS `zoom` = base font size / 14 on the preview root, re-applied after each render and on font change; off = 1 (U-19) | `components/Preview.tsx` `applyZoom` |
| F-138 Reload / user styles and themes | done (M5): Reload re-reads the stored user files and re-applies; Import… adds a `.css` style or `.style` theme (a built-in name is replaced, as an edited copy in the folder would be) | `prefs/userAssets.ts`, `components/PreferencesWindow.tsx` |
| F-140 Preferences window | done (M5): General, Markdown, Editor, Rendering (Terminal Out), labels/groups/order from the xibs, enablement (P-05 needs P-01, P-39 needs P-38, P-35 field needs its box, P-21/P-22/P-24/P-25 need P-20, P-19 needs P-18, P-23 always), numeric ranges (P-32 0–100, P-33/P-34 0–35, P-35 300–10000; emptied = 0), "no style"/"no theme" items. Non-modal panel; Escape or × closes; the last pane is remembered | `components/PreferencesWindow.tsx` |
| F-141 Persistence and live apply | done (M5): only changed keys are stored in `macdown.preferences`; every change re-renders and re-applies the editor; P-01 off also turns P-05 off | `prefs/store.ts` |
| F-142 About MacDown | done (M5) | `components/Dialogs.tsx` |
| F-153 / F-154 Help, Contributing | done (M5): the original `help.md` / `contribute.md` as editable documents (`help.md`, `contribute.md`) in front of the user's document, which is kept (and stays the draft); Close returns to it | `document/help.ts`, `App.tsx` `showBundled` |
| F-164 Persisted text-checking toggle | done: Check Spelling While Typing (P-46) is a preference, so it persists (M5); the other toggles are Out | `App.tsx`, `prefs/store.ts` |
| F-165 Divider colour follows the visible pane | done (M4) | `App.tsx` `dividerColor` |
| F-20 Preview base URL | partial by design: relative URLs stay unresolved, because the browser gives no folder for an opened file (spec scope "otherwise unresolved") | `components/Preview.tsx` |
| F-155 First launch | done (M5): the first visit (no `macdown.firstVersionInstalled`) opens the help document | `document/draft.ts` `detectFreshInstall` |

## Persistence keys (localStorage)

| Key | Content |
|---|---|
| `macdown.preferences` | Preferences the user changed (§8 keys); missing keys take the defaults |
| `macdown.draft` | The current document: `{ version: 1, kind, name, savedText, text }` (F-29) |
| `macdown.firstVersionInstalled` | `0.7.3` after the first visit (F-155) |
| `macdown.splitRatios` | `{ "<file name>": ratio }` (F-16) |
| `macdown.userStyles`, `macdown.userThemes` | Imported styles and themes `{ name: text }` (F-138) |
| `macdown.preferencesPane` | Last selected preferences pane |

## Deviations and notes

- **Render delay.** The original coalesces renders with up to 0.5 s of delay. M2's acceptance criterion is under 300 ms, so the app renders 150 ms after typing stops.
- **Preview iframe and scripts (M3 decision).** The preview stays `sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"`, with no `allow-scripts`, so raw HTML in the Markdown (`<script>`, `onerror=`, `javascript:` links) never runs. The page is written with `document.write` from outside, which keeps updates synchronous and keeps the scroll position. The page scripts of §6.10 run from the app window against the iframe document instead of as `<script>` tags in it (`render/postprocess.ts`), in the original order: tasklist.js, then Prism, then Mermaid, then Graphviz, then MathJax. Prism runs from the bundled 1.4.1 files, with one isolated instance per document script list, so only the grammars the original would load are present. MathJax 3 typesets the iframe document from the app window. Mermaid and Viz.js build markup from user input, so they run in a separate hidden iframe with `sandbox="allow-scripts"` and no same origin, which cannot reach the app. Its SVG output is inserted into the script-less preview. Each step runs synchronously when its assets are already loaded, so re-renders do not flash. Style CSS (base style, Prism theme and plugins, show-information, Mermaid) is inlined as `<style>` in §6.10 order. Chromium logs "Blocked script execution … sandboxed" once per written document when automation tools inject scripts into the frame; the app itself never tries to run a script there.
- **MathJax.** MathJax 3 from the local `mathjax-full` package, SVG output (no font files), lazy-loaded as a separate chunk only when P-18 is on; no CDN at runtime. Delimiters per §6.9 as corrected by D-04 (spec §13): MathJax 2.7.3 `tex2jax` defaults, so inline `\(…\)` only (the Markdown stage turns `$…$` into `\(…\)` when P-19 is on; a leftover `$`, such as `\$` or `$x$` in raw HTML, stays literal), display `\[…\]` and `$$…$$`, `processEscapes: false` (in the Markdown source the user writes `\\(…\\)` and `\\[…\\]`); raw MathML is typeset too. The original used MathJax 2.7.3 HTML-CSS from cdnjs, so glyph rendering differs.
- **Hoedown vs markdown-it.** The Hoedown rules are ported where the spec defines them (code blocks, footnote markup, TOC, task lists, superscript, quote, math, SmartyPants, intra-emphasis). Emphasis nesting still uses markdown-it's delimiter algorithm: `***x***` gives `<em><strong>` where Hoedown gives `<strong><em>`, and with P-11 `___x___` gives `<u><strong>`. Backslash escapes cover all ASCII punctuation, not only Hoedown's set. Footnote definition continuation follows markdown-it-footnote, and inline `^[…]` footnotes are disabled.
- **Mermaid/Graphviz errors.** A diagram that fails to render stays as its code block. The original's Mermaid loop stopped at the first error.
- **TOC replacement** inserts the TOC literally. The original used it as an `NSRegularExpression` template, so `$1` or `\` in a header would have been interpreted.
- **Layout pull-down items** no longer show the HideEditor/HidePreview images (U-15: the original items have no images).
- **Type check.** `tsconfig.json` includes `src`, all of `tests` (unit and E2E specs) and the Vite and Playwright configs, so `npm run build` (`tsc -b`) type-checks the E2E specs too; a type error in a spec breaks the build.
- **Code blocks** follow the source (`hoedown_html_patch.c`) where it differs from spec §6.4 and S-05/S-06. One trailing newline is removed before `</code>`. The `lang:info` split happens only when the accessory is Custom (P-23 = 2), which answers U-02. The alias lookup is case-sensitive (`NSDictionary objectForKey:`).
- **GitHub-2017.css** is empty in the bundle and missing from the source repository, so it is hidden from the style list (U-07 decision in `docs/status.md`).
- **Scroll sync coordinates.** Editor anchor positions use real scroll coordinates, including the vertical inset. The original measured them in text-container coordinates, without the inset.
- **Shortcuts.** On non-Mac platforms Cmd is mapped to Ctrl, and Ctrl+Cmd+F (full screen) is available from the menu only. Browsers reserve Cmd/Ctrl+N, W and T, so those commands are reached through the menu bar (wired in M5).
- **M4 notes.** Shortcuts are handled by one capture-phase listener for the menu items (`App.tsx`); CodeMirror bindings that collide with MacDown key equivalents are removed (`editor/setup.ts` `REMOVED_BINDINGS`), so `Cmd+U` does nothing while Format > Underline is hidden. Return list continuation is on by default (P-38, spec-mandated), so typing `* a`, Enter, `b` gives `* a\n* b`; the E2E helper `typeText` therefore types list lines as the user would see them, while `setDoc` (synthetic paste) and `window.macdownEditor.set` are never changed by the input rules. The Out items of the Edit menu (F-94, F-95, F-97 to F-104, F-108, F-109) are not shown. The theme pop-up and the editor preferences UI are M5; until then they are set through `?pref.` or `window.macdownPrefs`. Preference patches that change nothing do not notify subscribers (`prefs/store.ts`).
- **M5 notes.**
  - *Single document.* The original opens each document in its own window. The web app has one document: New, Open and drop replace it after the save prompt; Help and Contributing open in front of it and Close brings it back (a help copy is never written to the draft).
  - *Browser-reserved shortcuts.* `Cmd+N` (New) and `Cmd+W` (Close) are shown in the File menu but only the menu runs them; browsers do not pass them to pages. `Cmd+T` (Opt+Cmd+T is fine) and `Cmd+Q` are not used. `Cmd+O`, `Cmd+S`, `Shift+Cmd+S`, `Cmd+P`, `Opt+Cmd+E`, `Opt+Cmd+P` and `Cmd+,` call `preventDefault` and work.
  - *File handles are not persisted.* After a reload the draft keeps the name and saved text of an opened file, but not its file handle, so the next Save opens the save panel with that name. In the download fallback every Save downloads the file again.
  - *Rename / Move To* are not in the spec's File menu (AppKit adds them at run time) and are not offered.
  - *Prompts.* The save, revert and error sheets use the standard AppKit texts; while one is open, menu key equivalents are ignored.
  - *Export PDF* uses the print dialog; the browser decides the PDF file name (Chromium uses the page title, which is set to the presumed file name during the dialog).
  - *Default path (P-29c)* is shown read-only; relative URLs in the preview stay unresolved (F-20), because a file handle gives no folder.
  - *Preferences window* is a non-modal panel over the app, so changes are visible live; the original is a separate window. Fonts come from a fixed list of common families plus a size field instead of the macOS font panel.
