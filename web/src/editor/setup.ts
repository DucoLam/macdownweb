/**
 * CodeMirror 6 editor setup: syntax highlighting with the editor themes
 * (F-74, §7.2), the §8.4 appearance preferences (F-75 to F-79, P-46) and
 * the §5 behaviours (commands.ts).
 */
import { EditorState, Compartment, Facet, type Extension } from '@codemirror/state';
import { EditorView, keymap, drawSelection, ViewPlugin, highlightActiveLine, type KeyBinding, type ViewUpdate } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, commonmarkLanguage } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import type { MacDownPreferences } from '../prefs/defaults';
import { behaviourPrefs, editorBehaviours, type BehaviourPreferences } from './commands';
import { fileText, lineBreaks } from './lineBreaks';
import { linearLinkEnd } from './linearLinkEnd';
import { MARKDOWN_STYLE_TAGS, buildTheme, lineHeightFor, parseStyleSheet, THEME_SOURCES } from './themes';

export type EditorPreferences = Pick<
  MacDownPreferences,
  | 'editorBaseFontInfo'
  | 'editorHorizontalInset'
  | 'editorVerticalInset'
  | 'editorLineSpacing'
  | 'editorScrollsPastEnd'
  | 'editorStyleName'
  | 'editorWidthLimited'
  | 'editorMaximumWidth'
  | 'editorContinuousSpellCheckingEnabled'
> &
  BehaviourPreferences;

/** `Menlo-Regular` (PostScript name) → CSS font stack. */
export function fontFamilyFor(postScriptName: string): string {
  const family = postScriptName.replace(/-(Regular|Roman|Book)$/i, '').replace(/-/g, ' ');
  return `"${family}", Menlo, Monaco, Consolas, "Liberation Mono", monospace`;
}

/**
 * F-78 (P-35): with the width limit on and the editor wider than
 * 2 × inset + maximum width, both horizontal insets become
 * (width − maximum) × 0.45 (`adjustEditorInsets`, MPDocument.m:1649-1663).
 */
export function horizontalInset(width: number, inset: number, limited: boolean, maxWidth: number): number {
  if (limited && width > 2 * inset + maxWidth) return (width - maxWidth) * 0.45;
  return inset;
}

/**
 * F-79 (P-42): extra bottom space = min(content height, visible height)
 * − height of the trailing blank text − 2 × vertical inset, when positive
 * (MPEditorView.m:130-142, 184-218).
 */
export function scrollPastEndExtra(contentHeight: number, visibleHeight: number, trailingHeight: number, verticalInset: number): number {
  const offset = Math.min(contentHeight, visibleHeight) - trailingHeight - 2 * verticalInset;
  return offset > 0 ? offset : 0;
}

interface LayoutPrefs {
  hInset: number;
  vInset: number;
  widthLimited: boolean;
  maxWidth: number;
  scrollsPastEnd: boolean;
  /** Height of one line of the base font without P-32 spacing (px). */
  fontLine: number;
  /** P-32 line spacing (px). */
  spacing: number;
}

const layoutPrefs = Facet.define<LayoutPrefs, LayoutPrefs>({
  combine: (v) =>
    v[v.length - 1] ?? { hInset: 15, vInset: 30, widthLimited: false, maxWidth: 1000, scrollsPastEnd: false, fontLine: 14 * 1.17, spacing: 3 },
});

/**
 * F-79 `trailingHeight` (MPEditorView.m:184-218): the bounding rectangle of
 * the whitespace after the last visible character.
 * - No visible character (empty or blank text): the whole used rectangle, so
 *   no padding is added.
 * - Nothing trails (SD-09): `boundingRectForGlyphRange:` of an empty range at
 *   the end returns one line of the font (16 pt for Menlo 14), measured with an
 *   AppKit probe, so one line height without the spacing.
 * - Trailing whitespace: from the top of the line holding the first trailing
 *   character to the end; a trailing newline adds AppKit's extra line
 *   fragment, which has no paragraph spacing.
 */
export function trailingHeight(
  text: string,
  m: { top: number; end: number; topOfLineAt: (pos: number) => number; fontLine: number; spacing: number },
): number {
  if (!/\S/.test(text)) return m.end - m.top;
  const firstJunk = text.search(/\s*$/);
  if (firstJunk >= text.length) return m.fontLine;
  const h = m.end - m.topOfLineAt(firstJunk);
  return text.endsWith('\n') ? h - m.spacing : h;
}

/** Measures the editor and applies F-77/F-78 insets and F-79 padding to the content element. */
const layoutPlugin = ViewPlugin.fromClass(
  class {
    /**
     * The pane width can change (split ratio, window) in a frame where
     * CodeMirror's own measure does not report a geometry change, which left
     * the F-78 inset computed for the old width. The scroller is watched
     * directly as well.
     */
    readonly resize: ResizeObserver | null;
    constructor(readonly view: EditorView) {
      this.resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.schedule()) : null;
      this.resize?.observe(view.scrollDOM);
      this.schedule();
    }
    destroy() {
      this.resize?.disconnect();
    }
    update(u: ViewUpdate) {
      if (u.geometryChanged || u.docChanged || u.startState.facet(layoutPrefs) !== u.state.facet(layoutPrefs)) this.schedule();
    }
    schedule() {
      this.view.requestMeasure({
        key: this,
        read: (view) => {
          const p = view.state.facet(layoutPrefs);
          const width = view.scrollDOM.clientWidth;
          const x = horizontalInset(width, p.hInset, p.widthLimited, p.maxWidth);
          let bottom = p.vInset;
          if (p.scrollsPastEnd) {
            const doc = view.state.doc;
            const top = view.lineBlockAt(0).top;
            const end = view.lineBlockAt(doc.length).bottom;
            const trailing = trailingHeight(doc.toString(), {
              top,
              end,
              topOfLineAt: (pos) => view.lineBlockAt(pos).top,
              fontLine: p.fontLine,
              spacing: p.spacing,
            });
            bottom += scrollPastEndExtra(end - top + 2 * p.vInset, view.scrollDOM.clientHeight, trailing, p.vInset);
          }
          return { x, bottom, top: p.vInset };
        },
        write: ({ x, bottom, top }, view) => {
          const s = view.contentDOM.style;
          const px = (n: number) => `${Math.round(n * 100) / 100}px`;
          if (s.paddingLeft !== px(x)) s.paddingLeft = s.paddingRight = px(x);
          if (s.paddingTop !== px(top)) s.paddingTop = px(top);
          if (s.paddingBottom !== px(bottom)) s.paddingBottom = px(bottom);
        },
      });
    }
  },
);

/** Theme, font and spacing (P-30, P-31, P-32) plus layout preferences. */
export function editorAppearance(prefs: EditorPreferences): { extension: Extension; themeErrors: string[]; background: string } {
  const { name, size } = prefs.editorBaseFontInfo;
  const theme = buildTheme(prefs.editorStyleName, { baseFontSize: size, lineSpacing: prefs.editorLineSpacing });
  const hasCurrentLine = !!(prefs.editorStyleName && THEME_SOURCES[prefs.editorStyleName] && parseStyleSheet(THEME_SOURCES[prefs.editorStyleName]).currentLine);
  return {
    themeErrors: theme.errors,
    background: theme.background,
    extension: [
      theme.extension,
      hasCurrentLine ? highlightActiveLine() : [],
      EditorView.theme({
        '&': { height: '100%', fontSize: `${size}px` },
        '.cm-scroller': { fontFamily: fontFamilyFor(name), lineHeight: lineHeightFor(prefs.editorLineSpacing) },
        '.cm-content': { padding: `${prefs.editorVerticalInset}px ${prefs.editorHorizontalInset}px` },
        '.cm-line': { padding: '0' },
        '&.cm-focused': { outline: 'none' },
      }),
      layoutPlugin,
      layoutPrefs.of({
        hInset: prefs.editorHorizontalInset,
        vInset: prefs.editorVerticalInset,
        widthLimited: prefs.editorWidthLimited,
        maxWidth: prefs.editorMaximumWidth,
        scrollsPastEnd: prefs.editorScrollsPastEnd,
        fontLine: size * 1.17, // lineHeightFor() without the spacing
        spacing: prefs.editorLineSpacing,
      }),
      // F-96 / P-46 Check Spelling While Typing.
      EditorView.contentAttributes.of({
        spellcheck: prefs.editorContinuousSpellCheckingEnabled ? 'true' : 'false',
        autocorrect: 'off',
        autocapitalize: 'off',
      }),
    ],
  };
}

export function behaviourFrom(prefs: BehaviourPreferences): BehaviourPreferences {
  return {
    editorCompleteMatchingCharacters: prefs.editorCompleteMatchingCharacters,
    editorConvertTabs: prefs.editorConvertTabs,
    editorInsertPrefixInBlock: prefs.editorInsertPrefixInBlock,
    editorAutoIncrementNumberedLists: prefs.editorAutoIncrementNumberedLists,
    editorSmartHome: prefs.editorSmartHome,
    editorUnorderedListMarkerType: prefs.editorUnorderedListMarkerType,
    extensionStrikethough: prefs.extensionStrikethough,
  };
}

export interface EditorHandlers {
  onDocChanged: (text: string) => void;
}

export interface EditorCompartments {
  appearance: Compartment;
  behaviour: Compartment;
  editable: Compartment;
}

/**
 * Markdown language for the editor: CommonMark (peg-markdown-highlight has no
 * GFM tables or strikethrough), the theme tags, and none of lang-markdown's
 * own editing helpers (its Enter/Backspace keymap, HTML tag completion and
 * URL-paste links), which MacDown does not have.
 *
 * D-09: the nested HTML language is created with `autoCloseTags: false`.
 * lang-markdown's default (`html({ matchClosingTags: false })`) installs
 * lang-html's closing-tag input handler, which typed `</b>` after `<b>`.
 * MacDown has no tag completion (NSTextView+Autocomplete.m:116-172 only
 * pairs single characters).
 */
export function markdownLanguageSupport(): Extension {
  return markdown({
    base: commonmarkLanguage,
    addKeymap: false,
    completeHTMLTags: false,
    pasteURLAsLink: false,
    htmlTagLanguage: html({ matchClosingTags: false, autoCloseTags: false }),
    // Same tree as Lezer's parser, without its O(n^2) link closing (large files).
    extensions: [MARKDOWN_STYLE_TAGS, linearLinkEnd(commonmarkLanguage.parser)],
  });
}

/**
 * CodeMirror bindings that collide with MacDown key equivalents (§3 Format)
 * or with NSTextView behaviour, removed so that, for example, `Cmd+U` does
 * nothing while Format > Underline is hidden (F-162) instead of running
 * CodeMirror's undoSelection. Mod-Enter, Mod-[, Mod-], Mod-/, Mod-i and
 * Shift-Mod-k are MacDown's New Paragraph, Shift Left/Right, Comment,
 * Emphasize and Link; Alt-A is CodeMirror's block comment.
 */
export const REMOVED_BINDINGS = new Set(['Mod-Enter', 'Mod-i', 'Mod-[', 'Mod-]', 'Shift-Mod-k', 'Mod-/', 'Mod-u', 'Alt-u', 'Mod-Shift-u', 'Alt-A']);

export function macDownKeymap(bindings: readonly KeyBinding[]): KeyBinding[] {
  const out: KeyBinding[] = [];
  const removed = (k?: string) => !!k && REMOVED_BINDINGS.has(k);
  for (const b of bindings) {
    // CodeMirror uses `mac` on macOS when set, otherwise `key`.
    const macKey = b.mac ?? b.key;
    const otherKey = b.key;
    const keepMac = !!macKey && !removed(macKey);
    const keepOther = !!otherKey && !removed(otherKey);
    if (keepMac && keepOther && !removed(b.win) && !removed(b.linux)) {
      out.push(b);
      continue;
    }
    if (!keepMac && !keepOther) continue;
    const { key: _k, mac: _m, win: _w, linux: _l, ...rest } = b;
    void _k; void _m; void _w; void _l;
    if (keepMac) out.push({ ...rest, mac: macKey });
    if (keepOther) out.push({ ...rest, win: b.win ?? otherKey, linux: b.linux ?? otherKey });
  }
  return out;
}

export function createEditorState(
  doc: string,
  prefs: EditorPreferences,
  handlers: EditorHandlers,
  compartments: EditorCompartments,
): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      history(),
      drawSelection(),
      highlightSelectionMatches(),
      EditorView.lineWrapping, // NSTextView wraps lines; MacDown has no horizontal scrolling.
      markdownLanguageSupport(),
      search({ top: true }), // NSTextFinder's find bar sits at the top of the text view.
      editorBehaviours(),
      compartments.behaviour.of(behaviourPrefs.of(behaviourFrom(prefs))),
      keymap.of(macDownKeymap([...defaultKeymap, ...historyKeymap, ...searchKeymap])),
      compartments.appearance.of(editorAppearance(prefs).extension),
      compartments.editable.of(EditorView.editable.of(true)),
      EditorView.contentAttributes.of({ 'aria-label': 'Markdown editor' }),
      lineBreaks(doc), // D-13: CRLF / CR kept as read
      EditorView.updateListener.of((u) => {
        if (u.docChanged) handlers.onDocChanged(fileText(u.state));
      }),
    ],
  });
}
