/**
 * Editor themes (F-74, F-166, spec §7.2, P-31). The 15 `.style` files are
 * the original ones from MacDown/Resources/Themes (MIT), parsed at run time
 * with a port of peg-markdown-highlight's style parser
 * [vendor/macdown/Dependency/peg-markdown-highlight/pmh_styleparser.c] and
 * applied the way HGMarkdownHighlighter does:
 *
 * - `editor`: foreground = text colour, background, caret;
 *   `editor-selection`: selected text colour and background;
 *   `editor-current-line`: current line (no bundled theme uses it).
 * - Element blocks (H1–H6, EMPH, STRONG, LINK, …) become CodeMirror
 *   highlight tags on the Markdown syntax tree (see MARKDOWN_STYLE_TAGS).
 *   Blocks apply in file order, so a later block wins where two overlap
 *   (`element_styles[styles_pos++]`, HGMarkdownHighlighter.m:540-560); font
 *   traits only add (bold, italic, underlined).
 * - `font-size` is absolute (points, used as CSS px), or relative to the base
 *   font with a leading `+`/`-`; never below 4 (`kMinFontSize`).
 * - No theme (empty `editorStyleName`, F-166): the highlighter's built-in
 *   default styles (`getDefaultStyles`, HGMarkdownHighlighter.m:435-463) on
 *   the default text colour and a clear (white) background.
 */
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting, type TagStyle } from '@codemirror/language';
import { Tag, styleTags, tags } from '@lezer/highlight';
import type { MarkdownConfig } from '@lezer/markdown';

// ---------------------------------------------------------------------------
// Theme files
// ---------------------------------------------------------------------------

import { userTheme, userThemeNames } from '../prefs/userAssets';

const files = import.meta.glob('./themes/*.style', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Theme sources by name (`Tomorrow+`, `Mou Night`, …). */
export const THEME_SOURCES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(files).map(([path, text]) => [path.replace(/^.*\//, '').replace(/\.style$/, ''), text]),
);

/** P-31 pop-up items after the empty "no theme" item, sorted by name. */
export const THEME_NAMES: readonly string[] = Object.keys(THEME_SOURCES).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

export const DEFAULT_THEME = 'Tomorrow+';

/** Built-in plus user-imported theme names (F-138), sorted. */
export function themeNames(): string[] {
  return [...new Set([...THEME_NAMES, ...userThemeNames()])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Parser (pmh_styleparser.c)
// ---------------------------------------------------------------------------

/** pmh element names (pmh_definitions.h), in enum order. */
export const ELEMENT_NAMES = [
  'LINK', 'AUTO_LINK_URL', 'AUTO_LINK_EMAIL', 'IMAGE', 'CODE', 'HTML', 'HTML_ENTITY', 'EMPH', 'STRONG',
  'LIST_BULLET', 'LIST_ENUMERATOR', 'COMMENT', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'VERBATIM',
  'HTMLBLOCK', 'HRULE', 'REFERENCE', 'NOTE',
] as const;
export type ElementName = (typeof ELEMENT_NAMES)[number];

export interface StyleAttributes {
  foreground?: string;
  background?: string;
  caret?: string;
  fontSize?: { size: number; relative: boolean };
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  /** Default styles only: `NSUnboldFontMask` (BLOCKQUOTE). */
  unbold?: boolean;
}

export interface StyleSheet {
  editor: StyleAttributes | null;
  selection: StyleAttributes | null;
  currentLine: StyleAttributes | null;
  /** Element blocks in file order. */
  elements: { name: ElementName; attrs: StyleAttributes }[];
  errors: string[];
}

/** `new_argb_from_hex_str`: 6 (rrggbb) or 8 (aarrggbb) hex digits → CSS colour. */
function parseColor(value: string, line: number, errors: string[]): string | undefined {
  if (value.length !== 6 && value.length !== 8) {
    errors.push(`line ${line}: Value '${value}' is not a valid color value: it should be a hexadecimal number, 6 or 8 characters long.`);
    return undefined;
  }
  const bad = /[^0-9a-fA-F]/.exec(value);
  if (bad) {
    errors.push(
      `line ${line}: Value '${value}' is not a valid color value: the character '${bad[0]}' is invalid. The color value should be a hexadecimal number, 6 or 8 characters long.`,
    );
    return undefined;
  }
  const n = parseInt(value, 16);
  const a = value.length === 8 ? ((n >>> 24) & 0xff) / 255 : 1;
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  if (a === 1) return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}

/** Parses a peg-markdown-highlight stylesheet. */
export function parseStyleSheet(input: string): StyleSheet {
  const sheet: StyleSheet = { editor: null, selection: null, currentLine: null, elements: [], errors: [] };
  // get_blocks: blocks are separated by empty (whitespace-only) lines; `#`
  // comment lines are ignored.
  const blocks: { line: number; text: string }[][] = [];
  let current: { line: number; text: string }[] | null = null;
  input.split('\n').forEach((raw, i) => {
    const text = raw.replace(/\r$/, '');
    if (/^[ \t]*$/.test(text)) {
      current = null;
      return;
    }
    if (/^[ \t]*#/.test(text)) return;
    if (!current) {
      current = [];
      blocks.push(current);
    }
    current.push({ line: i + 1, text });
  });

  for (const block of blocks) {
    const name = block[0].text.trim();
    const attrs: StyleAttributes = {};
    for (const { line, text } of block.slice(1)) {
      const colon = text.indexOf(':');
      if (colon < 0) {
        sheet.errors.push(`line ${line}: '${text.trim()}' is not a valid attribute line (no ':')`);
        continue;
      }
      const attrName = text.slice(0, colon).trim().toLowerCase();
      const value = text.slice(colon + 1).trim();
      // Attributes are prepended to a linked list and applied from the head,
      // so the first declaration of an attribute wins.
      switch (attrName) {
        case 'color':
        case 'foreground':
        case 'foreground-color': {
          const c = parseColor(value, line, sheet.errors);
          if (c && attrs.foreground === undefined) attrs.foreground = c;
          break;
        }
        case 'background':
        case 'background-color': {
          const c = parseColor(value, line, sheet.errors);
          if (c && attrs.background === undefined) attrs.background = c;
          break;
        }
        case 'caret':
        case 'caret-color': {
          const c = parseColor(value, line, sheet.errors);
          if (c && attrs.caret === undefined) attrs.caret = c;
          break;
        }
        case 'font-size': {
          const n = parseInt(value, 10); // strtol: `24px` → 24
          if (Number.isNaN(n)) sheet.errors.push(`line ${line}: Value '${value}' is invalid for attribute 'font-size'`);
          else if (!attrs.fontSize) attrs.fontSize = { size: n, relative: value.startsWith('+') || value.startsWith('-') };
          break;
        }
        case 'font-family':
          if (attrs.fontFamily === undefined) attrs.fontFamily = value;
          break;
        case 'font-style':
          for (const v of value.split(',').map((x) => x.trim().toLowerCase())) {
            if (v === 'italic') attrs.italic = true;
            else if (v === 'bold') attrs.bold = true;
            else if (v === 'underlined') attrs.underlined = true;
            else sheet.errors.push(`line ${line}: Value '${v}' is invalid for attribute 'font-style'`);
          }
          break;
        default:
          break; // pmh_attr_type_other: kept as a string, unused
      }
    }
    if ((ELEMENT_NAMES as readonly string[]).includes(name)) sheet.elements.push({ name: name as ElementName, attrs });
    else if (name === 'editor') sheet.editor = attrs;
    else if (name === 'editor-current-line') sheet.currentLine = attrs;
    else if (name === 'editor-selection') sheet.selection = attrs;
    else
      sheet.errors.push(
        `line ${block[0].line}: Style rule '${name}' is not a language element type name or one of the following: 'editor', 'editor-current-line', 'editor-selection'`,
      );
  }
  return sheet;
}

// ---------------------------------------------------------------------------
// Default styles (no theme)
// ---------------------------------------------------------------------------

/** `NSColor colorWithCalibratedHue:saturation:brightness:` → hex. */
export function hsb(h: number, s: number, b: number): string {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return b - b * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

const HG = { GREEN: 0.34, YELLOW: 0.15, BLUE: 0.67, RED: 0, MAGENTA: 0.87, CYAN: 0.5 };
const DARK = (h: number) => hsb(h, 1, 0.4);
const LIGHT = (h: number) => hsb(h, 0.2, 1);
const DIM = (h: number) => hsb(h, 0.2, 0.5);
const DARK_GRAY = hsb(0, 0, 0.2);
const MED_GRAY = hsb(0, 0, 0.5);
const LIGHT_GRAY = hsb(0, 0, 0.9);

/** `getDefaultStyles` [HGMarkdownHighlighter.m:441-461], in array order. */
export const DEFAULT_STYLES: { name: ElementName; attrs: StyleAttributes }[] = [
  ...(['H1', 'H2', 'H3', 'H4', 'H5', 'H6'] as const).map((name) => ({
    name,
    attrs: { foreground: DARK(HG.BLUE), background: LIGHT(HG.BLUE), bold: true },
  })),
  { name: 'HRULE', attrs: { foreground: DARK_GRAY, background: LIGHT_GRAY } },
  { name: 'LIST_BULLET', attrs: { foreground: DARK(HG.MAGENTA) } },
  { name: 'LIST_ENUMERATOR', attrs: { foreground: DARK(HG.MAGENTA) } },
  { name: 'LINK', attrs: { foreground: DARK(HG.CYAN), background: LIGHT(HG.CYAN) } },
  { name: 'AUTO_LINK_URL', attrs: { foreground: DARK(HG.CYAN), background: LIGHT(HG.CYAN) } },
  { name: 'AUTO_LINK_EMAIL', attrs: { foreground: DARK(HG.CYAN), background: LIGHT(HG.CYAN) } },
  { name: 'IMAGE', attrs: { foreground: DARK(HG.MAGENTA), background: LIGHT(HG.MAGENTA) } },
  { name: 'REFERENCE', attrs: { foreground: DIM(HG.RED) } },
  { name: 'CODE', attrs: { foreground: DARK(HG.GREEN), background: LIGHT(HG.GREEN) } },
  { name: 'EMPH', attrs: { foreground: DARK(HG.YELLOW), italic: true } },
  { name: 'STRONG', attrs: { foreground: DARK(HG.MAGENTA), bold: true } },
  { name: 'HTML_ENTITY', attrs: { foreground: MED_GRAY } },
  { name: 'COMMENT', attrs: { foreground: MED_GRAY } },
  { name: 'VERBATIM', attrs: { foreground: DARK(HG.GREEN), background: LIGHT(HG.GREEN) } },
  // BLOCKQUOTE removes the background and the bold trait.
  { name: 'BLOCKQUOTE', attrs: { foreground: DARK(HG.MAGENTA), background: 'transparent', unbold: true } },
];

// ---------------------------------------------------------------------------
// CodeMirror mapping
// ---------------------------------------------------------------------------

/** One highlight tag per pmh element. */
export const ELEMENT_TAGS: Readonly<Record<ElementName, Tag>> = Object.fromEntries(
  ELEMENT_NAMES.map((n) => [n, Tag.define()]),
) as Record<ElementName, Tag>;

const T = ELEMENT_TAGS;

/**
 * Lezer Markdown nodes → pmh elements. Differences from peg-markdown-highlight
 * (which has its own grammar): e-mail autolinks share AUTO_LINK_URL (every
 * bundled theme gives both the same colour); fenced code counts as VERBATIM;
 * footnotes (NOTE) are not parsed.
 */
export const MARKDOWN_STYLE_TAGS: MarkdownConfig = {
  props: [
    styleTags({
      'ATXHeading1/... SetextHeading1/...': T.H1,
      'ATXHeading2/... SetextHeading2/...': T.H2,
      'ATXHeading3/...': T.H3,
      'ATXHeading4/...': T.H4,
      'ATXHeading5/...': T.H5,
      'ATXHeading6/...': T.H6,
      'Emphasis/...': T.EMPH,
      'StrongEmphasis/...': T.STRONG,
      'Link/...': T.LINK,
      'Image/...': T.IMAGE,
      'Autolink/... URL': T.AUTO_LINK_URL,
      'InlineCode/...': T.CODE,
      'FencedCode/... CodeBlock/...': T.VERBATIM,
      HTMLTag: T.HTML,
      HTMLBlock: T.HTMLBLOCK,
      Entity: T.HTML_ENTITY,
      'BulletList/ListItem/ListMark': T.LIST_BULLET,
      'OrderedList/ListItem/ListMark': T.LIST_ENUMERATOR,
      'Comment CommentBlock': T.COMMENT,
      'Blockquote/...': T.BLOCKQUOTE,
      HorizontalRule: T.HRULE,
      'LinkReference/...': T.REFERENCE,
    }),
  ],
};

export interface ThemeOptions {
  /** P-30 base font size. */
  baseFontSize: number;
  /** P-32 line spacing (points), applied to header spans that change the size. */
  lineSpacing: number;
}

export interface BuiltTheme {
  extension: Extension;
  /** Background of the editor (F-165). */
  background: string;
  dark: boolean;
  /** Parse errors (F-74: the caller resets `editorStyleName`). */
  errors: string[];
}

/** CSS line height used for the editor text: the font's height plus P-32. */
export const lineHeightFor = (spacing: number) => `calc(1.17em + ${spacing}px)`;

/**
 * Tags that take an element's style. D-10: a block-level HTML comment
 * (`CommentBlock`) is re-parsed by the nested HTML language, whose `Comment`
 * node carries `tags.blockComment` and hides the `CommentBlock` tag, so
 * COMMENT also styles the HTML language's comment tags. This matches
 * peg-markdown-highlight, where `HtmlBlock` contains `HtmlComment`, which
 * adds `pmh_COMMENT` (pmh_grammar.leg:365-366, 614-615).
 */
function styledTags(name: string): Tag | Tag[] {
  const tag = ELEMENT_TAGS[name as keyof typeof ELEMENT_TAGS];
  return name === 'COMMENT' ? [tag, tags.comment] : tag;
}

function tagStyle(tag: Tag | Tag[], a: StyleAttributes, o: ThemeOptions): TagStyle {
  const s: TagStyle = { tag };
  if (a.foreground) s.color = a.foreground;
  if (a.background) s.backgroundColor = a.background;
  if (a.bold) s.fontWeight = 'bold';
  else if (a.unbold) s.fontWeight = 'normal';
  if (a.italic) s.fontStyle = 'italic';
  if (a.underlined) s.textDecoration = 'underline';
  if (a.fontFamily) s.fontFamily = a.fontFamily;
  if (a.fontSize && a.fontSize.size !== 0) {
    const size = Math.max(4, a.fontSize.relative ? o.baseFontSize + a.fontSize.size : a.fontSize.size);
    s.fontSize = `${size}px`;
    s.lineHeight = lineHeightFor(o.lineSpacing);
  }
  return s;
}

function luminance(color: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/**
 * Builds the CodeMirror theme and highlighting for `name` (P-31). An empty
 * or unknown name gives the default styles (F-166).
 */
export function buildTheme(name: string, o: ThemeOptions): BuiltTheme {
  const source = name ? (userTheme(name) ?? THEME_SOURCES[name]) : undefined;
  const sheet = source !== undefined ? parseStyleSheet(source) : null;
  const elements = sheet ? sheet.elements : DEFAULT_STYLES;
  const editor = sheet?.editor ?? {};
  const background = editor.background ?? '#ffffff';
  const foreground = editor.foreground ?? '#000000';
  const caret = editor.caret ?? foreground;
  const dark = luminance(background) < 0.5;

  const base: Record<string, Record<string, string>> = {
    '&': { backgroundColor: background, color: foreground },
    '.cm-content': { caretColor: caret },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: caret },
    '.cm-gutters': { backgroundColor: background, color: foreground, border: 'none' },
  };
  const sel = sheet?.selection;
  if (sel?.background) {
    base['.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground'] = {
      backgroundColor: sel.background,
    };
  }
  if (sel?.foreground) base['.cm-content ::selection, .cm-content::selection'] = { color: sel.foreground };
  if (sel?.underlined) base['.cm-content ::selection'] = { ...(base['.cm-content ::selection'] ?? {}), textDecoration: 'underline' };
  const cur = sheet?.currentLine;
  if (cur?.background) base['.cm-activeLine'] = { backgroundColor: cur.background };

  const highlight = HighlightStyle.define(
    elements.map((e) => tagStyle(styledTags(e.name), e.attrs, o)),
    { themeType: dark ? 'dark' : 'light' },
  );
  return {
    extension: [EditorView.theme(base, { dark }), syntaxHighlighting(highlight)],
    background,
    dark,
    errors: sheet?.errors ?? [],
  };
}
