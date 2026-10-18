/**
 * Editor text commands (spec §2.4, §2.5, §5, §13), ported line by line from
 * the original:
 *   vendor/macdown/MacDown/Code/Extension/NSTextView+Autocomplete.m  [ac:line]
 *   vendor/macdown/MacDown/Code/Document/MPDocument.m                [doc:line]
 *   vendor/macdown/MacDown/Code/Extension/NSString+Lookup.m          [lookup:line]
 *
 * Every function is pure: it takes the document and the selection and
 * returns one replacement plus the selection after it (or null when the
 * original would fall through to the default behaviour). CodeMirror
 * wrappers live in commands.ts. Line breaks are `\n` (CodeMirror
 * normalises them). Positions are UTF-16 offsets, like NSString.
 *
 * Protective deviations (the original can produce an invalid NSRange through
 * unsigned underflow): resulting selections are clamped to the document.
 */

export interface TextState {
  doc: string;
  /** Selection start (NSRange.location). */
  from: number;
  /** Selection end (location + length). */
  to: number;
}

export interface TextEdit {
  from: number;
  to: number;
  insert: string;
  /** Selection in the new document. */
  selFrom: number;
  selTo: number;
}

// ---------------------------------------------------------------------------
// NSString helpers
// ---------------------------------------------------------------------------

/** `locationOfFirstNewlineBefore:` + 1, i.e. the start of the line [lookup:16-24]. */
export function lineStart(doc: string, loc: number): number {
  loc = Math.min(Math.max(loc, 0), doc.length);
  if (loc === 0) return 0;
  return doc.lastIndexOf('\n', loc - 1) + 1;
}

/** `contentsEnd` of the line containing `loc` (before its newline). */
export function lineContentsEnd(doc: string, loc: number): number {
  loc = Math.min(Math.max(loc, 0), doc.length);
  const i = doc.indexOf('\n', loc);
  return i < 0 ? doc.length : i;
}

/** `locationOfFirstNewlineAfter:` [lookup:26-34]; `loc` -1 wraps to 0 as in C. */
export function firstNewlineAfter(doc: string, loc: number): number {
  return lineContentsEnd(doc, Math.min(loc + 1, doc.length));
}

/** `MPCharacterIsWhitespace`: `whitespaceCharacterSet` (tab and Zs). */
export function isWhitespace(ch: string | undefined): boolean {
  return !!ch && /^[\t\p{Zs}]$/u.test(ch);
}

/** `locationOfFirstNonWhitespaceCharacterInLineBefore:` [lookup:36-45]. */
export function firstNonWhitespaceBefore(doc: string, loc: number): number {
  let p = lineStart(doc, loc);
  loc = Math.min(loc, doc.length);
  while (p < loc && isWhitespace(doc[p])) p++;
  return p;
}

/** `-[NSString lineRangeForRange:]`: whole lines, including the last line's newline. */
export function lineRange(doc: string, from: number, to: number): [number, number] {
  const start = lineStart(doc, from);
  const last = to > from ? to - 1 : from;
  const nl = doc.indexOf('\n', Math.min(last, doc.length));
  return [start, nl < 0 ? doc.length : nl + 1];
}

/** Builds an edit and clamps the selection to the new document length. */
function edit(s: TextState, from: number, to: number, insert: string, selFrom: number, selTo: number): TextEdit {
  const newLength = s.doc.length - (to - from) + insert.length;
  const c = (x: number) => Math.min(Math.max(x, 0), newLength);
  const a = c(selFrom);
  return { from, to, insert, selFrom: a, selTo: Math.max(a, c(selTo)) };
}

// ---------------------------------------------------------------------------
// §5.4 inline toggles (F-40 to F-46, F-59, F-60)
// ---------------------------------------------------------------------------

/** `substringInRange:isSurroundedByPrefix:suffix:` [ac:47-71]. */
export function isSurrounded(doc: string, from: number, to: number, prefix: string, suffix: string): boolean {
  if (doc.length < to + suffix.length) return false;
  if (from < prefix.length) return false;
  if (!doc.startsWith(suffix, to) || !doc.slice(0, from).endsWith(prefix)) return false;
  // `*` must not unwrap strong (`**`), but does unwrap strong-emphasis (`***`).
  if (prefix !== '*' || suffix !== '*') return true;
  if (isSurrounded(doc, from, to, '***', '***')) return true;
  if (isSurrounded(doc, from, to, '**', '**')) return false;
  return true;
}

/**
 * `toggleForMarkupPrefix:suffix:` [ac:277-305]. Only the text just outside
 * the selection is examined (a selected `**a**` is wrapped again, E17).
 */
export function toggleMarkup(s: TextState, prefix: string, suffix: string): TextEdit & { inserted: boolean } {
  const sel = s.doc.slice(s.from, s.to);
  if (isSurrounded(s.doc, s.from, s.to, prefix, suffix)) {
    const subFrom = s.from - prefix.length;
    return { ...edit(s, subFrom, s.to + suffix.length, sel, subFrom, subFrom + sel.length), inserted: false };
  }
  const at = s.from + prefix.length;
  return { ...edit(s, s.from, s.to, prefix + sel + suffix, at, at + sel.length), inserted: true };
}

/**
 * NSPasteboard `URLForType:` [src:MacDown/Code/Extension/NSPasteboard+Types.m:14-38]:
 * the clipboard string, if `NSURL URLWithString:` accepts it and its scheme
 * is http, https or file (case-insensitive).
 */
export function urlFromClipboard(text: string | null | undefined): string | null {
  if (!text) return null;
  // NSURL rejects characters that are not allowed in a URL (spaces, non-ASCII…).
  if (/[^\x21-\x7e]|[<>"{}|\\^`]/.test(text)) return null;
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(text);
  if (!m || !/^(?:https?|file)$/i.test(m[1])) return null;
  return text;
}

/**
 * `toggleLink:` / `toggleImage:` [doc:1369-1407]: toggles `[`…`]()` (or
 * `![`…`]()`). When markup was added, the cursor goes inside `()`, and a
 * clipboard URL (see urlFromClipboard) is inserted there and selected.
 */
export function toggleLink(s: TextState, image: boolean, clipboard: string | null): TextEdit {
  const t = toggleMarkup(s, image ? '![' : '[', ']()');
  if (!t.inserted) return t;
  const url = urlFromClipboard(clipboard);
  const loc = t.selTo + 2;
  if (!url) return { ...t, selFrom: loc, selTo: loc };
  const insert = t.insert.slice(0, -1) + url + ')';
  return edit(s, t.from, t.to, insert, loc, loc + url.length);
}

// ---------------------------------------------------------------------------
// §5.4 block toggles (F-54 to F-56)
// ---------------------------------------------------------------------------

export interface BlockToggle {
  pattern: RegExp;
  prefix: string;
  /** U-05 deviation: remove the matched text instead of `prefix.length` characters. */
  strip?: RegExp;
}

/** F-54 ordered list, with the U-05 regex fix (CoS decision, recorded deviation). */
export const ORDERED_LIST: BlockToggle = { pattern: /^[0-9]+\. \S/, prefix: '1. ', strip: /^[0-9]+\. / };
/** The original's F-54 pattern [doc:1409-1412] (never matches `1. x`). */
export const ORDERED_LIST_ORIGINAL: BlockToggle = { pattern: /^[0-9]+ \S/, prefix: '1. ' };
/** F-55, prefix from P-45. */
export const unorderedList = (marker: string): BlockToggle => ({ pattern: /^[*+-] \S/, prefix: marker });
/** F-56 [doc:1420-1423]. */
export const BLOCKQUOTE: BlockToggle = { pattern: /^> \S/, prefix: '> ' };

/** P-45 marker (`editorUnorderedListMarker`, MPPreferences.m:159-171). */
export function unorderedListMarker(type: number): string {
  return type === 1 ? '+ ' : type === 2 ? '- ' : '* ';
}

/**
 * `toggleBlockWithPattern:prefix:` [ac:307-385]: if every selected line
 * (empty ones included) matches, the prefix is removed from each line;
 * otherwise the prefix is added to every line.
 */
export function toggleBlock(s: TextState, t: BlockToggle): TextEdit {
  const [ls, le] = lineRange(s.doc, s.from, s.to);
  let toProcess = s.doc.slice(ls, le);
  let trailing = false;
  if (toProcess.endsWith('\n')) {
    toProcess = toProcess.slice(0, -1);
    trailing = true;
  }
  const lines = toProcess.split('\n');
  const isMarked = lines.every((l) => t.pattern.test(l));
  const prefixLength = t.prefix.length;
  const removal = (line: string) => (t.strip ? (t.strip.exec(line)?.[0].length ?? 0) : prefixLength);

  let totalShift = 0;
  const firstShift = isMarked ? removal(lines[0]) : prefixLength;
  const mod = lines.map((line) => {
    if (line.length) totalShift += isMarked ? removal(line) : prefixLength;
    return isMarked ? line.slice(removal(line)) : t.prefix + line;
  });
  let processed = mod.join('\n');
  if (trailing) processed += '\n';

  let loc = s.from;
  let len = s.to - s.from;
  if (!isMarked) {
    loc += prefixLength;
    if (len + totalShift >= prefixLength) len += totalShift - prefixLength;
    else len = 0; // underflow
  } else {
    loc = firstShift <= loc ? loc - firstShift : 0;
    len = totalShift - firstShift <= len ? len - (totalShift - firstShift) : 0;
    if (loc < ls) {
      len = Math.max(0, len - (ls - loc));
      loc = ls;
    }
  }
  return edit(s, ls, le, processed, loc, loc + len);
}

// ---------------------------------------------------------------------------
// F-47 to F-53 headers
// ---------------------------------------------------------------------------

/** `makeHeaderForSelectedLinesWithLevel:` [ac:653-716]; level 0 = paragraph. */
export function makeHeader(s: TextState, level: number): TextEdit {
  const [ls, le] = lineRange(s.doc, s.from, s.to);
  const header = level ? '#'.repeat(level) + ' ' : '';
  const lines = s.doc.slice(ls, le).split('\n');
  const lineCount = lines.length;
  let firstShift = 0;
  let totalShift = 0;
  const out = lines.map((line, index) => {
    // Whitespace-only lines are skipped unless it is the only line.
    if (lineCount > 1 && firstNonWhitespaceBefore(line, line.length) === line.length) return line;
    // `^(#+ )*`: the capture is the group's last iteration (ICU and JS agree).
    const m = /^(#+ )*.*?$/ds.exec(line);
    const hr = m?.indices?.[1];
    const hrLength = hr ? hr[1] - hr[0] : 0;
    const content = hr ? line.slice(hr[1]) : line;
    const shift = header.length - hrLength;
    if (index === 0) firstShift += shift;
    totalShift += shift;
    return header + content;
  });
  const loc = s.from + firstShift;
  return edit(s, ls, le, out.join('\n'), loc, loc + (s.to - s.from) + totalShift - firstShift);
}

// ---------------------------------------------------------------------------
// F-57 / F-58 shift right and left
// ---------------------------------------------------------------------------

/** `indentSelectedLinesWithPadding:` [ac:387-417]. */
export function indentLines(s: TextState, padding: string): TextEdit {
  const [ls, le] = lineRange(s.doc, s.from, s.to);
  const lines = s.doc.slice(ls, le).split('\n');
  let totalShift = 0;
  const mod = lines.map((line) => {
    if (line.length) totalShift += padding.length;
    return padding + line;
  });
  if (mod[mod.length - 1] === padding) mod[mod.length - 1] = '';
  const loc = s.from + padding.length;
  const len = s.to - s.from + (totalShift > padding.length ? totalShift - padding.length : 0);
  return edit(s, ls, le, mod.join('\n'), loc, loc + len);
}

/** `unindentSelectedLines` [ac:419-467]. */
export function unindentLines(s: TextState): TextEdit {
  const [ls, le] = lineRange(s.doc, s.from, s.to);
  const lines = s.doc.slice(ls, le).split('\n');
  let firstShift = 0;
  let totalShift = 0;
  const mod = lines.map((line, index) => {
    let shift = 0;
    for (shift = 0; shift < 4; shift++) {
      if (shift >= line.length) break;
      const c = line[shift];
      if (c === '\t') shift++;
      if (c !== ' ') break;
    }
    if (index === 0) firstShift += shift;
    totalShift += shift;
    return shift && shift < line.length ? line.slice(shift) : line;
  });
  const loc = s.from - firstShift;
  return edit(s, ls, le, mod.join('\n'), loc, loc + (s.to - s.from) - (totalShift - firstShift));
}

/** Indent unit for F-57 (`indent:` [doc:1425-1431]). */
export const indentPadding = (convertTabs: boolean) => (convertTabs ? '    ' : '\t');

// ---------------------------------------------------------------------------
// §5.3 Tab, Backspace, Home
// ---------------------------------------------------------------------------

/** `insertSpacesForTab` [ac:74-85]: spaces up to the next 4-column stop. */
export function insertSpacesForTab(s: TextState): TextEdit {
  const p = lineStart(s.doc, s.from) - 1;
  const offset = (s.from - p - 1) % 4;
  const spaces = '    '.slice(offset);
  return edit(s, s.from, s.to, spaces, s.from + spaces.length, s.from + spaces.length);
}

/** F-70 Tab without a selection (with a selection the caller runs F-57). */
export function insertTab(s: TextState, convertTabs: boolean): TextEdit {
  if (convertTabs) return insertSpacesForTab(s);
  return edit(s, s.from, s.to, '\t', s.from + 1, s.from + 1);
}

/** `unindentForSpacesBefore:` [ac:246-275] (F-72, P-37, empty selection). */
export function unindentSpacesBefore(s: TextState): TextEdit | null {
  const { doc } = s;
  const location = s.from;
  let count = 0;
  while (location - count > 0 && doc[location - count - 1] === ' ') {
    count++;
    if (count >= 4) break;
  }
  if (count < 2) return null;
  const ls = lineStart(doc, location);
  if (location <= ls) return null;
  let offset = (location - ls) % 4;
  if (offset === 0) offset = 4;
  if (count < offset) offset = count;
  return edit(s, location - offset, location, '', location - offset, location - offset);
}

/**
 * Smart Home target (F-73, `textViewShouldMoveToLeftEndOfLine:` [doc:803-830]):
 * the first non-whitespace character of the line, or null for the normal
 * Cmd+Left. The visual-row check is done by the caller.
 */
export function smartHomeTarget(s: TextState): number | null {
  const cur = s.from;
  const location = firstNonWhitespaceBefore(s.doc, cur);
  if (location === cur || cur === 0) return null;
  return location;
}

// ---------------------------------------------------------------------------
// §5.1 auto-pairing (F-62 to F-65), P-36
// ---------------------------------------------------------------------------

/** `kMPMatchingCharactersMap` [ac:19-32], in order. */
export const PAIRS: readonly [string, string][] = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
  ['<', '>'],
  ["'", "'"],
  ['"', '"'],
  ['（', '）'],
  ['「', '」'],
  ['『', '』'],
  ['‘', '’'],
  ['“', '”'],
];

/** `kMPMarkupCharacters` [ac:36-38]. */
const MARKUP = ['*', '_', '`', '='];

/** `whitespaceAndNewlineCharacterSet ∪ punctuationCharacterSet`. */
export function isBoundary(ch: string): boolean {
  return /^[\p{Zs}\t\n\r\v\f\u0085\u2028\u2029\p{P}]$/u.test(ch);
}

/** `completeMatchingCharacterForText:atLocation:` [ac:116-172] (empty selection). */
export function completeMatchingCharacter(s: TextState, c: string): TextEdit | null {
  const { doc } = s;
  const location = s.from;
  const n = location < doc.length ? doc[location] : ' ';
  const p = location > 0 ? doc[location - 1] : ' ';
  for (const [open, close] of PAIRS) {
    if (isBoundary(n) && c === open && (isBoundary(p) || open !== close)) {
      return edit(s, location, location, open + close, location + 1, location + 1);
    } else if (c === close && n === close) {
      return edit(s, location, location, '', location + 1, location + 1);
    }
  }
  return null;
}

/** `wrapMatchingCharactersOfCharacter:aroundTextInRange:strikethroughEnabled:` [ac:186-213]. */
export function wrapSelection(s: TextState, c: string, strikethrough: boolean): TextEdit | null {
  const wrap = (open: string, close: string) =>
    edit(s, s.from, s.to, open + s.doc.slice(s.from, s.to) + close, s.from + 1, s.to + 1);
  for (const [open, close] of PAIRS) if (c === open) return wrap(open, close);
  if (MARKUP.includes(c)) return wrap(c, c);
  if (strikethrough && c === '~') return wrap(c, c);
  return null;
}

/** `completeMatchingCharactersForTextInRange:withString:strikethroughEnabled:` [ac:87-114]. */
export function autoPairInput(s: TextState, text: string, strikethrough: boolean): TextEdit | null {
  if (text.length !== 1) return null;
  if (s.from === s.to) return completeMatchingCharacter(s, text);
  return wrapSelection(s, text, strikethrough);
}

/**
 * `deleteMatchingCharactersAround:` [ac:215-244]: Backspace whose selection
 * starts between an opener and its closer deletes both characters (the
 * selection itself is kept, shifted).
 */
export function deleteMatchingPair(s: TextState): TextEdit | null {
  const { doc } = s;
  const location = s.from;
  if (location === 0 || location >= doc.length) return null;
  const f = doc[location - 1];
  const b = doc[location];
  for (const [open, close] of PAIRS) {
    if (f === open && b === close) {
      const map = (x: number) => (x <= location - 1 ? x : x >= location + 1 ? x - 2 : location - 1);
      return edit(s, location - 1, location + 1, '', map(s.from), map(s.to));
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// §5.2 Return (F-66 to F-69) and F-61 New Paragraph
// ---------------------------------------------------------------------------

/** `kMPListLineHeadPattern` [ac:40-41]. */
const LIST_LINE_HEAD = /^(\s*)((?:(?:\*|\+|-|)\s+)?)((?:\d+\.\s+)?)(\S)?/;
/** `kMPBlockquoteLinePattern` [ac:42]. */
const BLOCKQUOTE_LINE = /^((?:> ?)+).*$/m;

/** `completeNextListItem:` [ac:494-591]. */
export function completeNextListItem(s: TextState, autoIncrement: boolean): TextEdit | null {
  const { doc } = s;
  const location = s.from;
  if (s.to > s.from || !doc.length) return null;
  const start = lineStart(doc, location);
  const end = location;
  if (firstNonWhitespaceBefore(doc, location) === location) return null;
  const line = doc.slice(start, end);
  const m = LIST_LINE_HEAD.exec(line);
  if (!m) return null;
  const isUl = m[2].length !== 0;
  const isOl = m[3].length !== 0;
  const previousLineEmpty = m[4] === undefined;

  let t: string | null = null;
  let replaceFrom = location;
  if (previousLineEmpty) {
    // Empty item: the line text up to the cursor is deleted (indent and marker).
    if (isUl || isOl) replaceFrom = start;
    t = '';
  } else if (isUl) {
    t = m[2].slice(0, -1); // exclude the trailing whitespace character
  } else if (isOl) {
    let i = parseInt(m[3].slice(0, -1), 10); // `integerValue`
    if (autoIncrement) i += 1;
    t = `${i}.`;
  }
  if (t === null) return null;

  // State after `insertNewline:` (NSTextView.string is the live string).
  const after = doc.slice(0, replaceFrom) + '\n' + doc.slice(end);
  const loc = location + 1; // not adjusted for the deletion, as in the original
  const indent = m[1];
  const contentLength = after.length;
  let inserted: string;
  if (contentLength > loc + t.length && after.substr(loc, t.length) === t) {
    inserted = indent; // has a matching list item: only the indent
  } else {
    const it = indent + t;
    if (contentLength > loc + it.length && after.substr(loc, it.length) === it) inserted = '';
    else inserted = t.length ? it + ' ' : it;
  }
  const insert = '\n' + inserted;
  const cursor = replaceFrom + insert.length;
  return edit(s, replaceFrom, end, insert, cursor, cursor);
}

/** `completeNextBlockquoteLine` [ac:593-632]. No termination rule (E19). */
export function completeNextBlockquoteLine(s: TextState): TextEdit | null {
  const { doc } = s;
  const contentLength = doc.length;
  if (s.to > s.from || !contentLength) return null;
  const [ls, le] = lineRange(doc, s.from, s.from);
  const m = BLOCKQUOTE_LINE.exec(doc.slice(ls, le));
  if (!m || m.index !== 0) return null;
  const markers = m[1];
  const after = doc.slice(0, s.from) + '\n' + doc.slice(s.from);
  const nextLineStart = s.from + 1;
  let insert = '\n';
  // Identical markers already follow: accept (contentLength is the old length).
  if (!(contentLength > nextLineStart + markers.length && after.substr(nextLineStart, markers.length) === markers)) {
    insert += markers;
  }
  return edit(s, s.from, s.from, insert, s.from + insert.length, s.from + insert.length);
}

/** `completeNextIndentedLine` [ac:634-651]. Not gated by P-38 (F-69). */
export function completeNextIndentedLine(s: TextState): TextEdit | null {
  if (s.to > s.from) return null;
  const start = lineStart(s.doc, s.from);
  const end = firstNonWhitespaceBefore(s.doc, s.from);
  if (end <= start) return null;
  const insert = '\n' + s.doc.slice(start, end);
  return edit(s, s.from, s.from, insert, s.from + insert.length, s.from + insert.length);
}

/** Plain `insertNewline:` (replaces the selection, no auto-indent). */
export function plainNewline(s: TextState): TextEdit {
  return edit(s, s.from, s.to, '\n', s.from + 1, s.from + 1);
}

export interface ReturnOptions {
  /** P-38 `editorInsertPrefixInBlock`. */
  insertPrefix: boolean;
  /** P-39 `editorAutoIncrementNumberedLists`. */
  autoIncrement: boolean;
}

/** `textViewShouldInsertNewline:` [doc:769-783]: list, quote, indent, else newline. */
export function returnKey(s: TextState, o: ReturnOptions): TextEdit {
  if (o.insertPrefix) {
    const list = completeNextListItem(s, o.autoIncrement);
    if (list) return list;
    const quote = completeNextBlockquoteLine(s);
    if (quote) return quote;
  }
  return completeNextIndentedLine(s) ?? plainNewline(s);
}

/** `insertNewParagraph:` [doc:1438-1454] (F-61, Cmd+Return). */
export function newParagraph(s: TextState): TextEdit {
  const location = s.from;
  const length = s.to - s.from;
  const newlineBefore = lineStart(s.doc, location) - 1;
  const newlineAfter = firstNewlineAfter(s.doc, location + length - 1);
  if (location === newlineBefore + 1 && location === newlineAfter) return plainNewline(s);
  return edit(s, s.from, s.to, '\n\n', s.from + 2, s.from + 2);
}

// ---------------------------------------------------------------------------
// F-105 to F-107 transformations (NSTextView uppercaseWord: etc.)
// ---------------------------------------------------------------------------

export type Transformation = 'upper' | 'lower' | 'capitalize';

/**
 * `-[NSString capitalizedString]` as AppKit applies it in `capitalizeWord:`
 * (Q-05, measured with an AppKit probe): a letter is upper-cased when the
 * character before it is not a letter (digits, `-`, `_`, `.`, `:` and
 * whitespace all start a new word), except that an apostrophe (`'` or `’`)
 * after a letter does not; every other letter is lower-cased. So
 * `hELLO wORLD-x` → `Hello World-X`, `it's` → `It's`, `x1y` → `X1Y`.
 */
export function capitalize(text: string): string {
  let out = '';
  let inWord = false;
  for (const ch of text) {
    if (/\p{L}/u.test(ch)) {
      out += inWord ? ch.toLowerCase() : ch.toUpperCase();
      inWord = true;
    } else if (/\p{M}/u.test(ch) || (inWord && (ch === "'" || ch === '’'))) {
      out += ch;
    } else {
      out += ch;
      inWord = false;
    }
  }
  return out;
}

let wordSegmenter: Intl.Segmenter | null = null;

/**
 * The word-granularity unit around UTF-16 index `i` (`selectionRangeForProposedRange:
 * granularity:NSSelectByWord`): a word, a run of horizontal whitespace, a
 * newline or a single punctuation character (UAX #29, as ICU and
 * `Intl.Segmenter` implement it).
 */
export function wordUnitAt(doc: string, i: number): { from: number; to: number } {
  if (!doc.length) return { from: 0, to: 0 };
  const at = Math.max(0, Math.min(i, doc.length - 1));
  wordSegmenter ??= new Intl.Segmenter(undefined, { granularity: 'word' });
  // Segment only the line around the index (segments never cross a newline).
  const lineStart = doc.lastIndexOf('\n', at - 1) + 1;
  let lineEnd = doc.indexOf('\n', at);
  if (lineEnd < 0) lineEnd = doc.length;
  if (at === lineEnd) return { from: at, to: at + 1 }; // the newline itself
  for (const seg of wordSegmenter.segment(doc.slice(lineStart, lineEnd))) {
    const from = lineStart + seg.index;
    const to = from + seg.segment.length;
    if (at >= from && at < to) return { from, to };
  }
  return { from: at, to: at + 1 };
}

/**
 * Applies a transformation (F-105 to F-107), as NSTextView's
 * `uppercaseWord:`, `lowercaseWord:` and `capitalizeWord:` do (Q-05, AppKit
 * probe): the selection is first extended to whole words (word
 * granularity), the words are transformed, and the transformed range is
 * selected. With an empty selection the unit is the one before the cursor,
 * or after it at the start of the document or of a line: `ab| cd` → `«AB» cd`,
 * `ab |cd` → `ab« »cd` (the space), `ab\n|cd` → `ab\n«CD»`.
 */
export function transform(s: TextState, kind: Transformation): TextEdit | null {
  if (!s.doc.length) return null;
  let from: number;
  let to: number;
  if (s.from === s.to) {
    const i = s.from;
    const atLineStart = i === 0 || s.doc[i - 1] === '\n';
    const unit = wordUnitAt(s.doc, atLineStart && i < s.doc.length ? i : i - 1);
    ({ from, to } = unit);
  } else {
    from = wordUnitAt(s.doc, s.from).from;
    to = wordUnitAt(s.doc, s.to - 1).to;
  }
  const text = s.doc.slice(from, to);
  const out = kind === 'upper' ? text.toUpperCase() : kind === 'lower' ? text.toLowerCase() : capitalize(text);
  return edit(s, from, to, out, from, from + out.length);
}
