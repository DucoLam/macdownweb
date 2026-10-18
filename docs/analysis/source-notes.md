# MacDown source cross-check notes (M1b)

Source: https://github.com/MacDownApp/macdown (MIT), cloned to `vendor/macdown` (gitignored) with
`git clone --depth 1 --recurse-submodules`, then `git fetch --depth 1 origin tag v0.7.3` and
`git checkout v0.7.3`.

Citation format used in `docs/spec.md`: `[src:path:line]`, where `path` is relative to
`vendor/macdown/` (for example `[src:MacDown/Code/Document/MPDocument.m:1411]`). Hoedown citations
use `[hoedown:src/file.c:line]` and refer to upstream hoedown tag `3.0.7`
(https://github.com/hoedown/hoedown, the pod MacDown pins in `Podfile` / `Podfile.lock`; the
MacDownApp/cocoapods-specs podspec for 3.0.7 points at the upstream tag, so it is not a patched
fork). A scratch clone was used for reading; it is not kept in the repo.

## 1. Version check

| Item | Value | Evidence |
|---|---|---|
| Bundle version | `CFBundleShortVersionString = 0.7.3`, `CFBundleVersion = 1008.4` | `MacDown.app/Contents/Info.plist` |
| Tag | `v0.7.3` (lightweight) -> commit `0a9e065b98544e8477f6ee1285fcccb5bfbc8e7b`, 2020-01-03, "Upgrade Xcode" | `git ls-remote --tags` |
| HEAD of `master` | `3e2a2bf101c215c143bf00d9f857965f0ee82487`, 2021-04-29 (no newer release tag than v0.8.0d71 pre-release) | `git log -1` |
| Info.plist in source | `CFBundleShortVersionString = 0.1`, `CFBundleVersion = 1` at both tag and HEAD: placeholders; the release version is injected at build time by `Tools/utils.sh` / `Tools/build_for_release.py` | `MacDown/MacDown-Info.plist:79-84` |
| Bundle vs tag | `help.md`, `contribute.md`, `Templates/Default.handlebars`, `syntax_highlighting.json`, `MathJax/init.js`, `Extensions/tasklist.js`, `Extensions/mermaid.init.js`, `Styles/GitHub2.css`, `Themes/Tomorrow+.style` are byte-identical (`cmp`) between the bundle and the v0.7.3 tag | `cmp` run during M1b |

Conclusion: the v0.7.3 tag matches the analysed bundle. All spec citations use the tag.

### Differences HEAD vs v0.7.3

`git diff --stat v0.7.3 3e2a2bf`: **no changes under `MacDown/Code/`**, `Styles/` (mode change only),
`Themes/` or `Dependency/`. Changed: localisation `.strings`/xibs, `help.md` (46 lines), Mermaid
update (`mermaid.min.js`, `mermaid.init.js`), `Info.plist` (adds `x-macdown` URL scheme, copyright
2014–2020), README, `assets/`, and a new `Tools/GitHub-style-generator` that would generate
`Styles/GitHub-2020.css` from `primer-markdown` (the output is not committed). None of these change
0.7.3 behaviour; the spec ignores them.

### GitHub-2017.css (U-07)

`MacDown/Resources/Styles/` at v0.7.3 (and at HEAD) contains only `Clearness Dark.css`,
`Clearness.css`, `GitHub.css`, `GitHub2.css`, `Solarized (Dark).css`, `Solarized (Light).css`.
`GitHub-2017.css` is **not in the source repo**. The Xcode project copies the whole `Resources/Styles`
folder as a folder reference (`MacDown.xcodeproj/project.pbxproj:390`), so the 0-byte file in the
bundle was most likely a stray, untracked file in the release builder's working tree (probably an
earlier run of a style generator). Per the CoS decision, the web app hides this style.

## 2. Preferences (MPPreferences)

Keys: `MacDown/Code/Preferences/MPPreferences.h:17-74` (PAPreferences: the property name is the
`NSUserDefaults` key).

First-launch defaults, `loadDefaultPreferences` (`MPPreferences.m:244-262`):
`extensionIntraEmphasis = YES`, `extensionTables = YES`, `extensionFencedCode = YES`,
`extensionFootnotes = YES`, `editorBaseFontInfo = {name: "Menlo-Regular", size: 14.0}`,
`editorStyleName = "Tomorrow+"`, `editorHorizontalInset = 15`, `editorVerticalInset = 30`,
`editorLineSpacing = 3`, `editorSyncScrolling = YES`, `htmlStyleName = "GitHub2"`,
`htmlDefaultDirectoryUrl = file://<home>/`. Constants at `MPPreferences.m:26-35`.

Every-launch defaults for missing keys, `loadDefaultUserDefaults` (`MPPreferences.m:275-286`):
`editorMaximumWidth = 1000`, `editorAutoIncrementNumberedLists = YES`,
`editorInsertPrefixInBlock = YES`, `htmlTemplateName = "Default"`.

Every other key defaults to `NO` / `0` / nil (comment at `MPPreferences.m:231-233`). This includes
`editorCompleteMatchingCharacters` (U-09: confirmed off).

List marker mapping: `MPPreferences.m:159-172` (0 `* `, 1 `+ `, 2 `- `, other `* `).

Hidden editor text-checking keys (`MPDocument.m:38-62`, `1205-1216`, `1610-1624`): NSTextView
properties are mirrored to `editor<Property>` keys: `editorAutomaticDashSubstitutionEnabled`,
`editorAutomaticDataDetectionEnabled`, `editorAutomaticQuoteSubstitutionEnabled`,
`editorAutomaticSpellingCorrectionEnabled`, `editorAutomaticTextReplacementEnabled`,
`editorContinuousSpellCheckingEnabled`, `editorGrammarCheckingEnabled` (all default NO) and
`editorEnabledTextCheckingTypes` (default `NSTextCheckingAllTypes`).

Preference UI (bindings, labels, enablement, stepper ranges) verified from the source xibs in
`MacDown/Localization/Base.lproj/*.xib` (dumped with a scratch `xibdump.py`). Pane order is
General, Markdown, **Editor**, **Rendering**, Terminal (`MacDown/Code/Application/MPMainController.m:131-137`).

All keys and defaults in spec §8 match the source. Corrections were to the UI details, not the
defaults (see the spec change log).

## 3. Editor behaviour sources

| Behaviour | Source |
|---|---|
| Pair table, markup chars, list and blockquote regexes | `MacDown/Code/Extension/NSTextView+Autocomplete.m:19-42` |
| `*` toggle special case | `NSTextView+Autocomplete.m:47-71` |
| Tab -> spaces | `NSTextView+Autocomplete.m:74-85` |
| Auto-pair / skip closer | `NSTextView+Autocomplete.m:87-181` (boundary set at 116-123, condition at 143-144) |
| Wrap selection | `NSTextView+Autocomplete.m:183-222` |
| Delete empty pair | `NSTextView+Autocomplete.m:224-244` |
| Backspace soft-tab | `NSTextView+Autocomplete.m:246-275` |
| Inline toggle | `NSTextView+Autocomplete.m:277-305` |
| Block toggle | `NSTextView+Autocomplete.m:307-385` |
| Shift right / left | `NSTextView+Autocomplete.m:387-467` |
| Easter egg | `NSTextView+Autocomplete.m:469-492` |
| List continuation | `NSTextView+Autocomplete.m:494-591` |
| Blockquote continuation | `NSTextView+Autocomplete.m:593-632` |
| Indented line continuation | `NSTextView+Autocomplete.m:634-651` |
| Headers | `NSTextView+Autocomplete.m:653-716` |
| Line helpers | `MacDown/Code/Extension/NSString+Lookup.m:16-46` |
| Key dispatch (Tab, Shift+Tab, Return, Backspace, Cmd+Left) | `MacDown/Code/Document/MPDocument.m:702-830` |
| Format actions | `MPDocument.m:1299-1454` |
| Clipboard URL filter | `MacDown/Code/Extension/NSPasteboard+Types.m:14-38` |
| JPEG drop | `MacDown/Code/View/MPEditorView.m:42-93` |
| Scroll past end | `MPEditorView.m:96-218` |

## 4. Rendering sources

| Item | Source |
|---|---|
| Extension and renderer flags | `MPDocument.m:126-170` |
| Patched flag values | `MacDown/Code/Extension/hoedown_html_patch.h` (`USE_TASK_LIST = 1<<4`, `BLOCKCODE_LINE_NUMBERS = 1<<5`, `BLOCKCODE_INFORMATION = 1<<6`) |
| Pipeline, TOC substitution, front matter prefix | `MacDown/Code/Document/MPRenderer.m:96-145`, `586-617` |
| Nesting level `SIZE_MAX`, TOC level 6 | `MPRenderer.m:32-33` |
| Language alias and dependency walk | `MPRenderer.m:233-305` |
| Style and script lists (preview) | `MPRenderer.m:360-531` |
| Export asset selection | `MPRenderer.m:660-702` |
| Asset tag templates, embedding rules | `MacDown/Code/Document/MPAsset.m:69-191` |
| Code block, task list, TOC header patches | `MacDown/Code/Extension/hoedown_html_patch.c:22-185` |
| Front matter regex and YAML | `NSString+Lookup.m:55-87`; table HTML `MacDown/Code/Extension/NSObject+HTMLTabularize.m` |
| Presumed title | `NSString+Lookup.m:89-112`, `MPDocument.m:1865-1892` |
| Word count | `MacDown/Code/Extension/DOMNode+Text.m` |
| Prism theme list, style list | `MacDown/Code/Preferences/MPHtmlPreferencesViewController.m:63-170`; `MacDown/Code/Utility/MPUtilities.m:52-158` |
| MathJax loader redirect | `MPDocument.m:835-848`; local `MacDown/Resources/MathJax/MathJax.js` (loader only, root taken from the script `src`, i.e. the CDN) |
| Hoedown footnotes, math, header ids, tables | `[hoedown:src/html.c:222-223, 456-464, 499-557]` |
| Hoedown emphasis / intra-word | `[hoedown:src/document.c:619-655, 775-800]` |
| Hoedown math parsing | `[hoedown:src/document.c:733-772, 921-949, 1356-1367]` |
| Hoedown superscript | `[hoedown:src/document.c:1320-1354]` |
| Hoedown fence info | `[hoedown:src/document.c:1453-1475]` |
| Hoedown SmartyPants | `[hoedown:src/html_smartypants.c:159-300, 307-345, 390-398]` |

## 5. Toolbar and menus

- Items, labels, icons, actions and segment styles: `MacDown/Code/Application/MPToolbarController.m:48-94`, `201-299`.
- Default set and flexible spaces: `MPToolbarController.m:126-169` (`flexibleSpaceAfterIndices = {2, 3, 5, 7, 11}`; `spaceAfterIndices = {}` is an empty C array, so reading `[0]` is undefined behaviour; in practice no fixed space is added).
- Main menu, key equivalents, bindings: `MacDown/Localization/Base.lproj/MainMenu.xib` (Render Markdown `enabled` bound to `currentDocument.previewVisible` at line 370; Underline / Strikethrough / Highlight `hidden` bound to the negated extension preference at lines 443, 453, 463; New Paragraph key equivalent `\r` at lines 561-564). All shortcuts in spec §3 match.
- Touch Bar: `MacDown/Localization/Base.lproj/MPDocument.xib:54-315`.

## 6. Application

- Preference window controllers and order: `MPMainController.m:127-146`.
- Help / Contributing: `MPMainController.m:28-51`, `153-161`; first-launch tips `292-296`.
- Untitled document on launch: `MPMainController.m:183-188`.
- Copying Styles/Themes to Application Support: `MPMainController.m:210-245`.
