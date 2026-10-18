/**
 * M4 independent unit tests (tester). The tester wrote a second, separate
 * transliteration of the original Objective-C
 * (vendor/macdown/MacDown/Code/Extension/NSTextView+Autocomplete.m and
 * MPDocument.m) on top of a tiny NSTextView model (live string, selection
 * after insertText), and compares it with src/editor/text.ts on random
 * documents and selections. Explicit expectations from spec section 5 and
 * section 10 (E1 to E23) come first.
 *
 * Test names start with the spec ID they cover.
 */
import { describe, expect, it } from 'vitest';
import {
  BLOCKQUOTE,
  ORDERED_LIST,
  autoPairInput,
  completeNextBlockquoteLine,
  completeNextIndentedLine,
  completeNextListItem,
  deleteMatchingPair,
  indentLines,
  insertSpacesForTab,
  insertTab,
  makeHeader,
  newParagraph,
  returnKey,
  smartHomeTarget,
  toggleBlock,
  toggleLink,
  toggleMarkup,
  unindentLines,
  unindentSpacesBefore,
  unorderedList,
  urlFromClipboard,
  transform,
  type TextEdit,
  type TextState,
} from '../../src/editor/text';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
interface Res {
  doc: string;
  from: number;
  to: number;
}

/** Document with a cursor `|` or a selection `«…»`. */
function parse(marked: string): TextState {
  const a = marked.indexOf('«');
  if (a >= 0) {
    const b = marked.indexOf('»');
    const doc = marked.replace('«', '').replace('»', '');
    return { doc, from: a, to: b - 1 };
  }
  const c = marked.indexOf('|');
  const doc = marked.replace('|', '');
  return { doc, from: c, to: c };
}

function show(r: Res): string {
  if (r.from === r.to) return r.doc.slice(0, r.from) + '|' + r.doc.slice(r.from);
  return r.doc.slice(0, r.from) + '«' + r.doc.slice(r.from, r.to) + '»' + r.doc.slice(r.to);
}

function apply(s: TextState, e: TextEdit | null): Res {
  if (!e) return { doc: s.doc, from: s.from, to: s.to };
  return { doc: s.doc.slice(0, e.from) + e.insert + s.doc.slice(e.to), from: e.selFrom, to: e.selTo };
}

const run = (marked: string, f: (s: TextState) => TextEdit | null) => {
  const s = parse(marked);
  return show(apply(s, f(s)));
};

// ---------------------------------------------------------------------------
// Reference model: NSTextView + the original Obj-C, transliterated again
// ---------------------------------------------------------------------------
class TV {
  constructor(public s: string, public loc: number, public len: number) {}
  get end() {
    return this.loc + this.len;
  }
  /** insertText:replacementRange: (the cursor ends after the inserted text). */
  insertText(str: string, r?: [number, number]) {
    const [l, n] = r ?? [this.loc, this.len];
    this.s = this.s.slice(0, l) + str + this.s.slice(l + n);
    this.loc = l + str.length;
    this.len = 0;
  }
  insertNewline() {
    this.insertText('\n');
  }
  /** replaceCharactersInRange:withString: for a range ending at or before the cursor. */
  replaceBeforeCursor(l: number, n: number, str: string) {
    this.s = this.s.slice(0, l) + str + this.s.slice(l + n);
    if (this.loc >= l + n) this.loc += str.length - n;
    else if (this.loc > l) this.loc = l + str.length;
  }
}

/** locationOfFirstNewlineBefore: (returns start - 1). */
const nlBefore = (s: string, loc: number) => {
  if (loc > s.length) loc = s.length;
  return (loc === 0 ? 0 : s.lastIndexOf('\n', loc - 1) + 1) - 1;
};
const WS = (c: string) => c === ' ' || c === '\t' || /\p{Zs}/u.test(c);
const firstNonWs = (s: string, loc: number) => {
  let p = nlBefore(s, loc) + 1;
  if (loc > s.length) loc = s.length;
  while (p < loc && WS(s[p])) p++;
  return p;
};
/** lineRangeForRange: */
function lineRangeFor(s: string, loc: number, len: number): [number, number] {
  const start = loc === 0 ? 0 : s.lastIndexOf('\n', loc - 1) + 1;
  const last = len > 0 ? loc + len - 1 : loc;
  const nl = last >= s.length ? -1 : s.indexOf('\n', last);
  return [start, nl < 0 ? s.length : nl + 1];
}

function refSurrounded(content: string, loc: number, len: number, prefix: string, suffix: string): boolean {
  if (content.length < loc + len + suffix.length) return false;
  if (loc < prefix.length) return false;
  if (!content.slice(loc + len).startsWith(suffix) || !content.slice(0, loc).endsWith(prefix)) return false;
  if (prefix !== '*' || suffix !== '*') return true;
  if (refSurrounded(content, loc, len, '***', '***')) return true;
  if (refSurrounded(content, loc, len, '**', '**')) return false;
  return true;
}

function refToggleMarkup(tv: TV, prefix: string, suffix: string): boolean {
  let [loc, len] = [tv.loc, tv.len];
  const selection = tv.s.slice(loc, loc + len);
  let isOn: boolean;
  if (refSurrounded(tv.s, loc, len, prefix, suffix)) {
    const sub: [number, number] = [loc - prefix.length, selection.length + prefix.length + suffix.length];
    tv.insertText(selection, sub);
    loc = sub[0];
    isOn = false;
  } else {
    tv.insertText(prefix + selection + suffix, [loc, len]);
    loc += prefix.length;
    isOn = true;
  }
  tv.loc = loc;
  tv.len = len;
  return isOn;
}

function refToggleBlock(tv: TV, pattern: RegExp, prefix: string, strip?: RegExp) {
  const content = tv.s;
  let [sl, sn] = [tv.loc, tv.len];
  const [ls, le] = lineRangeFor(content, sl, sn);
  let toProcess = content.slice(ls, le);
  let trailing = false;
  if (toProcess.endsWith('\n')) {
    toProcess = toProcess.slice(0, -1);
    trailing = true;
  }
  const lines = toProcess.split('\n');
  let isMarked = true;
  for (const line of lines) if (!pattern.test(line)) { isMarked = false; break; }
  const pl = prefix.length;
  const cut = (line: string) => (strip ? (strip.exec(line)?.[0].length ?? 0) : pl);
  let total = 0;
  const first = isMarked ? cut(lines[0]) : pl;
  const mod = lines.map((line) => {
    if (line.length) total += isMarked ? cut(line) : pl;
    return isMarked ? line.slice(cut(line)) : prefix + line;
  });
  let processed = mod.join('\n');
  if (trailing) processed += '\n';
  tv.insertText(processed, [ls, le - ls]);
  if (!isMarked) {
    sl += pl;
    if (sn + total >= pl) sn += total - pl;
    else sn = 0;
  } else {
    if (first <= sl) sl -= first;
    else sl = 0;
    if (total - first <= sn) sn -= total - first;
    else sn = 0;
    if (sl < ls) {
      sn -= ls - sl;
      sl = ls;
    }
  }
  tv.loc = sl;
  tv.len = sn;
}

function refIndent(tv: TV, padding: string) {
  const [ls, le] = lineRangeFor(tv.s, tv.loc, tv.len);
  const lines = tv.s.slice(ls, le).split('\n');
  let total = 0;
  const mod = lines.map((l) => {
    if (l.length) total += padding.length;
    return padding + l;
  });
  if (mod[mod.length - 1] === padding) mod[mod.length - 1] = '';
  const [sl, sn] = [tv.loc, tv.len];
  tv.insertText(mod.join('\n'), [ls, le - ls]);
  tv.loc = sl + padding.length;
  tv.len = sn + (total > padding.length ? total - padding.length : 0);
}

function refUnindent(tv: TV) {
  const [ls, le] = lineRangeFor(tv.s, tv.loc, tv.len);
  const lines = tv.s.slice(ls, le).split('\n');
  let first = 0;
  let total = 0;
  const mod = lines.map((line, index) => {
    let shift: number;
    for (shift = 0; shift < 4; shift++) {
      if (shift >= line.length) break;
      const c = line[shift];
      if (c === '\t') shift++;
      if (c !== ' ') break;
    }
    if (index === 0) first += shift;
    total += shift;
    return shift && shift < line.length ? line.slice(shift) : line;
  });
  const [sl, sn] = [tv.loc, tv.len];
  tv.insertText(mod.join('\n'), [ls, le - ls]);
  tv.loc = sl - first;
  tv.len = sn - (total - first);
}

function refHeader(tv: TV, level: number) {
  const [ls, le] = lineRangeFor(tv.s, tv.loc, tv.len);
  let header = '###### '.slice(6 - level);
  if (level === 0) header = header.slice(0, header.length - 1);
  const lines = tv.s.slice(ls, le).split('\n');
  const regex = /^(#+ )*.*?$/s;
  let first = 0;
  let total = 0;
  const out: string[] = [];
  lines.forEach((line, index) => {
    const r = regex.exec(line)!;
    if (lines.length > 1 && firstNonWs(line, line.length) === line.length) {
      out.push(line);
      return;
    }
    // Group 1 is the last repetition of `(#+ )`.
    const m = /^(?:#+ )*/.exec(line)![0];
    const last = m.length ? /(#+ )$/.exec(m)![1] : '';
    void r;
    const headerLen = last.length;
    const start = m.length;
    out.push(header + line.slice(start));
    const shift = header.length - headerLen;
    if (index === 0) first += shift;
    total += shift;
  });
  const [sl, sn] = [tv.loc, tv.len];
  tv.insertText(out.join('\n'), [ls, le - ls]);
  tv.loc = sl + first;
  tv.len = sn + total - first;
}

const LIST_HEAD = /^(\s*)((?:(?:\*|\+|-|)\s+)?)((?:\d+\.\s+)?)(\S)?/m;
function refListItem(tv: TV, autoIncrement: boolean): boolean {
  if (tv.len || !tv.s.length) return false;
  let location = tv.loc;
  const start = nlBefore(tv.s, location) + 1;
  const end = location;
  const nonws = firstNonWs(tv.s, location);
  if (nonws === location) return false;
  const line = tv.s.slice(start, end);
  const m = LIST_HEAD.exec(line);
  if (!m) return false;
  const isUl = m[2].length !== 0;
  const isOl = m[3].length !== 0;
  const previousLineEmpty = (m[4] ?? '').length === 0;
  let t: string | null = null;
  if (previousLineEmpty) {
    if (isUl || isOl) tv.replaceBeforeCursor(start, end - start, '');
    t = '';
  } else if (isUl) t = m[2].slice(0, -1);
  else if (isOl) {
    let i = parseInt(m[3].slice(0, -1), 10);
    if (autoIncrement) i += 1;
    t = `${i}.`;
  }
  if (t === null) return false;
  tv.insertNewline();
  location += 1;
  const indent = m[1];
  const contentLength = tv.s.length; // live string
  if (contentLength > location + t.length && tv.s.slice(location, location + t.length) === t) {
    tv.insertText(indent);
    return true;
  }
  let it = indent + t;
  if (contentLength > location + it.length && tv.s.slice(location, location + it.length) === it) return true;
  if (t.length) it = it + ' ';
  tv.insertText(it);
  return true;
}

function refQuote(tv: TV): boolean {
  const content = tv.s;
  const contentLength = content.length;
  if (tv.len || !contentLength) return false;
  const [ls, le] = lineRangeFor(content, tv.loc, tv.len);
  const line = content.slice(ls, le);
  const m = /^((?:> ?)+).*$/m.exec(line);
  if (!m) return false;
  const sel = tv.loc;
  tv.insertNewline();
  const markers = m[1];
  const nextLineStart = sel + 1;
  if (contentLength > nextLineStart + markers.length && tv.s.slice(nextLineStart, nextLineStart + markers.length) === markers) return true;
  tv.insertText(markers);
  return true;
}

function refIndented(tv: TV): boolean {
  if (tv.len) return false;
  const content = tv.s;
  const [start] = lineRangeFor(content, tv.loc, 0);
  const end = firstNonWs(content, tv.loc);
  if (end <= start) return false;
  tv.insertNewline();
  tv.insertText(content.slice(start, end)); // `content` is live, but the range lies before the edit
  return true;
}

function refReturn(tv: TV, insertPrefix: boolean, auto: boolean) {
  if (insertPrefix && refListItem(tv, auto)) return;
  if (insertPrefix && refQuote(tv)) return;
  if (refIndented(tv)) return;
  tv.insertNewline();
}

function refNewParagraph(tv: TV) {
  const content = tv.s;
  const loc = tv.loc;
  const len = tv.len;
  const nb = nlBefore(content, loc);
  // locationOfFirstNewlineAfter:(loc + len - 1)
  let p = loc + len - 1 + 1;
  if (p < 0) p = 0; // NSUInteger wrap: -1 + 1 = 0
  if (p > content.length) p = content.length;
  const nl = content.indexOf('\n', p);
  const na = nl < 0 ? content.length : nl;
  if (loc === nb + 1 && loc === na) tv.insertNewline();
  else tv.insertText('\n\n');
}

function resOf(tv: TV): Res {
  return { doc: tv.s, from: tv.loc, to: tv.loc + tv.len };
}
const validSel = (r: Res) => r.from >= 0 && r.to >= r.from && r.to <= r.doc.length;

// ---------------------------------------------------------------------------
// Random generation
// ---------------------------------------------------------------------------
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const LINES = [
  '', '', ' ', '  ', '\t', 'a', 'ab cd', '* a', '- b', '+ c', '* ', '-', '1. x', '12. y', '1 z', '09. n', '> q', '>', '> ', '> > r', '>> s', '# h', '## i', '#x', '#', '# # j',
  '  * n', '    code', '\tt', '  \tx', '   \ty', '     five', '* 1. both', '- [ ] task', '(', 'x(y)', '"q"', '**b**', '- ', '1. ', '  1. z', '\t- w',
];
function genDoc(r: () => number): TextState {
  const n = 1 + Math.floor(r() * 4);
  const lines: string[] = [];
  for (let i = 0; i < n; i++) lines.push(LINES[Math.floor(r() * LINES.length)]);
  let doc = lines.join('\n');
  if (r() < 0.25) doc += '\n';
  const a = Math.floor(r() * (doc.length + 1));
  const b = r() < 0.5 ? a : Math.min(doc.length, a + Math.floor(r() * 12));
  return { doc, from: a, to: b };
}

const N = 4000;

function fuzz(name: string, port: (s: TextState) => TextEdit | null, ref: (tv: TV) => void, opts: { cursorOnly?: boolean; selection?: boolean } = {}) {
  it(`${name}: ${N} random documents agree with the independent transliteration`, () => {
    const r = rng(name.length * 7919 + 17);
    const bad: string[] = [];
    for (let i = 0; i < N && bad.length < 5; i++) {
      const s = genDoc(r);
      if (opts.cursorOnly) s.to = s.from;
      const tv = new TV(s.doc, s.from, s.to - s.from);
      ref(tv);
      const expected = resOf(tv);
      const actual = apply(s, port(s));
      const cmp = validSel(expected) ? show(expected) : expected.doc;
      const got = validSel(expected) ? show(actual) : actual.doc;
      if (cmp !== got) bad.push(`input ${JSON.stringify(show({ doc: s.doc, from: s.from, to: s.to }))}\n   expected ${JSON.stringify(cmp)}\n   actual   ${JSON.stringify(got)}`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
}

// ---------------------------------------------------------------------------
// Spec section 10 S-16 cases E1 to E23, section 5
// ---------------------------------------------------------------------------
describe('S-16 editor cases (pure functions)', () => {
  /** Typed character: the auto-pair edit, or plain insertion when the input rules do not apply. */
  const typed = (m: string, ch: string, strike = false) =>
    run(m, (s) => autoPairInput(s, ch, strike) ?? { from: s.from, to: s.to, insert: ch, selFrom: s.from + 1, selTo: s.from + 1 });
  const ret = (m: string, o = { insertPrefix: true, autoIncrement: true }) => run(m, (s) => returnKey(s, o));

  it('F-62 E1 typing ( gives a pair', () => expect(typed('|', '(')).toBe('(|)'));
  it('F-64 E2 typing ) before ) skips it', () => expect(typed('(|)', ')')).toBe('()|'));
  it('F-65 E3 Backspace between ( and ) deletes both', () => expect(run('(|)', deleteMatchingPair)).toBe('|'));
  it('F-63 E4 typing * around a selection wraps it and keeps it selected', () => expect(typed('«word»', '*')).toBe('*«word»*'));
  it('F-62 E5 no pair before a letter', () => expect(typed('x|y', '(')).toBe('x(|y'));
  it('F-66 E6 list continues', () => expect(ret('* item|')).toBe('* item\n* |'));
  it('F-67 E7 number increments, P-39 off keeps the number', () => {
    expect(ret('3. item|')).toBe('3. item\n4. |');
    expect(ret('3. item|', { insertPrefix: true, autoIncrement: false })).toBe('3. item\n3. |');
  });
  it('F-66 E8 Return on an empty item removes the marker and adds a newline', () => expect(ret('* |')).toBe('\n|'));
  it('F-68 E9 quote continues', () => expect(ret('> q|')).toBe('> q\n> |'));
  it('F-70 E10 Tab with P-37 goes to column 4', () => expect(run('ab|', (s) => insertTab(s, true))).toBe('ab  |'));
  it('F-40 E11 strong on and off', () => {
    expect(run('«a»', (s) => toggleMarkup(s, '**', '**'))).toBe('**«a»**');
    expect(run('**«a»**', (s) => toggleMarkup(s, '**', '**'))).toBe('«a»');
  });
  it('F-48 / F-53 E12 Cmd+2 and Cmd+0', () => {
    expect(run('«Title»', (s) => makeHeader(s, 2))).toBe('## «Title»'); // the selection keeps covering the same text
    expect(run('## «Title»', (s) => makeHeader(s, 0))).toBe('«Title»');
  });
  it('F-55 E13 unordered list on two lines and off again', () => {
    const on = run('«l1\nl2»', (s) => toggleBlock(s, unorderedList('* ')));
    expect(on).toBe('* «l1\n* l2»');
    expect(run(on, (s) => toggleBlock(s, unorderedList('* ')))).toBe('«l1\nl2»');
  });
  it('F-57 E14 shift right', () => {
    expect(run('«a\nb»', (s) => indentLines(s, '\t'))).toBe('\t«a\n\tb»');
    expect(run('«a\nb»', (s) => indentLines(s, '    '))).toBe('    «a\n    b»');
  });
  it('F-62 E15 no pair for \' after a letter', () => expect(typed('don|', "'")).toBe("don'|"));
  it('F-62 E16 quote inside an empty pair makes a new pair', () => expect(typed('"|"', '"')).toBe('""|""'));
  it('§5.4 E17 a selected **a** is wrapped again', () => expect(run('«**a**»', (s) => toggleMarkup(s, '**', '**'))).toBe('**«**a**»**'));
  it('F-66 E18 empty indented item', () => expect(ret('  * |')).toBe('\n  |'));
  it('F-68 E19 an empty quote line is continued', () => expect(ret('> |')).toBe('> \n> |'));
  it('F-61 E20 New Paragraph at the cursor', () => expect(run('ab|cd', newParagraph)).toBe('ab\n\n|cd'));
  it('F-69 E21 indented line continues with P-38 off', () => expect(ret('  ab|', { insertPrefix: false, autoIncrement: true })).toBe('  ab\n  |'));
  it('F-54 E22 ordered list toggle off strips the matched prefix (U-05 deviation)', () => {
    expect(run('«1. a\n1. b»', (s) => toggleBlock(s, ORDERED_LIST))).toBe('«a\nb»');
    expect(run('«a\nb»', (s) => toggleBlock(s, ORDERED_LIST))).toBe('1. «a\n1. b»');
  });
  it('F-58 E23 "  \\tx" loses spaces and tab as one unit', () => expect(run('  |\tx', unindentLines)).toBe('|x'));
});

describe('F-54 U-05 deviation, details', () => {
  const ol = (m: string) => run(m, (s) => toggleBlock(s, ORDERED_LIST));
  it('F-54 a line "1 z" (no dot) is not a list item: the prefix is added (original pattern would match)', () => {
    expect(ol('«1 z»')).toBe('1. «1 z»');
  });
  it('F-54 numbers of different widths are all stripped', () => expect(ol('«1. a\n10. b\n123. c»')).toBe('«a\nb\nc»'));
  it('F-54 mixed lines: one unnumbered line makes every line gain a prefix', () => expect(ol('«1. a\nb»')).toBe('1. «1. a\n1. b»'));
  it('F-54 an empty line inside makes the prefix go on (every line, empty ones included); the empty line adds nothing to the selection length (original quirk)', () => expect(ol('«1. a\n\n1. b»')).toBe('1. «1. a\n1. \n1. 1». b'));
  it('F-54 "1. " with nothing after it is not matched (needs a non-space)', () => expect(ol('«1. »')).toBe('1. «1. »'));
  it('F-54 empty document: one empty line gets the prefix', () => expect(ol('|')).toBe('1. |'));
});

describe('F-55 / F-56 block toggle quirks from toggleBlockWithPattern', () => {
  const ul = (m: string) => run(m, (s) => toggleBlock(s, unorderedList('* ')));
  const bq = (m: string) => run(m, (s) => toggleBlock(s, BLOCKQUOTE));
  it('F-55 cursor only: acts on the whole line, cursor shifts by the prefix', () => expect(ul('ab|c')).toBe('* ab|c'));
  it('F-55 all three markers are recognised', () => expect(ul('«* a\n+ b\n- c»')).toBe('«a\nb\nc»'));
  it('F-55 "-" without a following non-space is not a list line', () => expect(ul('«-»')).toBe('* «-»'));
  it('F-56 trailing newline of the range is kept', () => expect(bq('«a\nb\n»')).toBe('> «a\n> b\n»'));
  it('F-56 selection ending just after a newline does not include the next line', () => expect(bq('«a\n»b')).toBe('> «a\n»b'));
  it('F-56 off: "> x" becomes "x"', () => expect(bq('> x|')).toBe('x|'));
  it('F-56 ">x" (no space) is not a quote line', () => expect(bq('>x|')).toBe('> >x|'));
  it('F-55 removing the prefix at the line start keeps the selection start at the line start', () => expect(ul('«* a»')).toBe('«a»'));
});

describe('F-47 to F-53 headers', () => {
  const h = (m: string, n: number) => run(m, (s) => makeHeader(s, n));
  it('F-47 existing prefixes of any level are replaced, repeated groups are all stripped', () => {
    expect(h('# # # x|', 2)).toBe('## x|');
    expect(h('###### x|', 1)).toBe('# x|');
  });
  it('F-47 "#foo" (no space) is not a header prefix', () => expect(h('#foo|', 1)).toBe('# #foo|'));
  it('F-47 a lone empty line becomes "# "', () => expect(h('|', 1)).toBe('# |'));
  it('F-47 multi-line: whitespace-only lines are left alone', () => expect(h('«a\n\n  \nb»', 1)).toBe('# «a\n\n  \n# b»'));
  it('F-53 Paragraph strips the prefixes only', () => {
    expect(h('«## a\n### b»', 0)).toBe('«a\nb»');
    expect(h('plain|', 0)).toBe('plain|');
  });
  it('F-47 a "#" alone (no space) gets a prefix', () => expect(h('#|', 2)).toBe('## #|'));
  it('F-47 "# " alone is removed to just the new header', () => expect(h('# |', 2)).toBe('## |'));
});

describe('F-57 / F-58 indent and unindent', () => {
  const ind = (m: string, p = '\t') => run(m, (s) => indentLines(s, p));
  const un = (m: string) => run(m, unindentLines);
  it('F-57 empty lines in the range get the padding too (the selection grows only by the non-empty lines)', () => expect(ind('«a\n\nb»')).toBe('\t«a\n\t\n\t»b'));
  it('F-57 a final empty line after a trailing newline gets none', () => expect(ind('«a\n»')).toBe('\t«a\n»'));
  it('F-57 cursor on an empty last line: the original replaces the lone padding by "" (nothing is indented)', () => expect(ind('a\n|')).toBe('a\n|'));
  it('F-57 cursor only: whole line, cursor moves with the text', () => expect(ind('a|b')).toBe('\ta|b'));
  it('F-58 up to 4 spaces', () => expect(un('«      a»')).toBe('«  a»'));
  it('F-58 a single tab', () => expect(un('«\t\ta»')).toBe('«\ta»'));
  it('F-58 spaces then tab, at most 4 characters', () => {
    expect(un('«  \ta»')).toBe('«a»');
    expect(un('«   \ta»')).toBe('«a»');
  });
  it('F-58 a whitespace-only line is left unchanged', () => {
    expect(un('«  \n\t\n    »').replace(/[«»]/g, '')).toBe('  \n\t\n    ');
  });
  it('F-58 5 spaces then text: only 4 are removed', () => expect(un('«     a»')).toBe('« a»'));
  it('F-58 nothing to remove', () => expect(un('«a\nb»')).toBe('«a\nb»'));
  it('F-58 Shift+Tab with the cursor inside the indentation keeps the cursor at the line start', () => expect(un('  |  a')).toBe('|a'));
});

describe('F-40 to F-46 inline toggles', () => {
  const tg = (m: string, p: string, q = p) => run(m, (s) => toggleMarkup(s, p, q));
  it('F-40 empty selection inserts both and places the cursor between', () => expect(tg('|', '**')).toBe('**|**'));
  it('F-40 empty selection between ** and ** removes them', () => expect(tg('**|**', '**')).toBe('|'));
  it('F-41 inside bold, Emphasize adds * and does not break the bold', () => expect(tg('**«a»**', '*')).toBe('***«a»***'));
  it('F-41 inside bold-italic, Emphasize removes one level', () => expect(tg('***«a»***', '*')).toBe('**«a»**'));
  it('F-41 asymmetric: *a** is treated as surrounded by *', () => expect(tg('*«a»**', '*')).toBe('«a»*'));
  it('F-41 a lone * at one side only wraps', () => expect(tg('*«a»', '*')).toBe('**«a»*'));
  it('F-42 underline', () => expect(tg('«a»', '_')).toBe('_«a»_'));
  it('F-43 strikethrough', () => expect(tg('~~«a»~~', '~~')).toBe('«a»'));
  it('F-44 highlight', () => expect(tg('«a»', '==')).toBe('==«a»=='));
  it('F-45 inline code', () => expect(tg('`«a b»`', '`')).toBe('«a b»'));
  it('F-46 comment', () => {
    expect(tg('«a»', '<!--', '-->')).toBe('<!--«a»-->');
    expect(tg('<!--«a»-->', '<!--', '-->')).toBe('«a»');
  });
  it('F-40 multi-line selection is wrapped as a whole', () => expect(tg('«a\nb»', '**')).toBe('**«a\nb»**'));
  it('F-40 only the immediate neighbours count: "** a **" with the selection " a " is unwrapped', () => expect(tg('**« a »**', '**')).toBe('« a »'));
  it('F-40 selection at the start of the document with no room for the prefix wraps', () => expect(tg('«a»**', '**')).toBe('**«a»****'));
  it('F-40 toggling twice returns the original document and selection', () => {
    for (const m of ['«a»', 'x «b c» y', '|', '«a\nb»']) {
      for (const p of ['**', '*', '_', '~~', '==', '`']) expect(tg(tg(m, p), p), `${m} ${p}`).toBe(m);
    }
  });
});

describe('F-59 / F-60 Link and Image (pure)', () => {
  const lk = (m: string, clip: string | null, image = false) => run(m, (s) => toggleLink(s, image, clip));
  it('F-59 http, https, file (any case) are inserted and selected', () => {
    for (const u of ['http://a.b', 'https://a.b/c?d=e#f', 'HTTPS://A.B', 'file:///tmp/a.png', 'File:///x']) {
      expect(lk('«t»', u)).toBe(`[t](«${u}»)`);
      expect(lk('«t»', u, true)).toBe(`![t](«${u}»)`);
    }
  });
  it('F-59 other schemes and non-URLs are ignored, cursor inside ()', () => {
    for (const u of ['ftp://a.b', 'mailto:a@b.c', 'javascript:alert(1)', 'data:text/plain,hi', 'a.b', 'just text', '', 'http://a b', 'see https://a.b', '/usr/bin', 'C:\\x']) {
      expect(lk('«t»', u), JSON.stringify(u)).toBe('[t](|)');
    }
  });
  it('F-59 null clipboard (no permission) is no URL', () => expect(lk('«t»', null)).toBe('[t](|)'));
  it('F-59 empty selection: [](url)', () => expect(lk('|', 'https://a.b')).toBe('[](«https://a.b»)'));
  it('F-59 removing the markup ignores the clipboard', () => expect(lk('[«t»]()', 'https://a.b')).toBe('«t»'));
  it('F-59 a link whose parentheses are not empty is wrapped again, not removed', () => expect(lk('[«t»](u)', null)).toBe('[[t](|)](u)'));
  it('F-60 image removal', () => expect(lk('![«t»]()', null, true)).toBe('«t»'));
  it('F-59 a link on top of an image: [ before ![ is surrounded by "[" , the "!" does not matter', () => {
    expect(lk('![«t»]()', null)).toBe('!«t»');
  });
  it('F-59 URL parse: a relative or scheme-less string is not a URL', () => {
    expect(urlFromClipboard('http://')).not.toBeNull(); // NSURL accepts "http://" with scheme http
    expect(urlFromClipboard('ht tp://x')).toBeNull();
  });
});

describe('F-61 New Paragraph', () => {
  const np = (m: string) => run(m, newParagraph);
  it('F-61 replaces a selection', () => expect(np('a«bc»d')).toBe('a\n\n|d'));
  it('F-61 on an empty line only one newline', () => {
    expect(np('a\n|\nb')).toBe('a\n\n|\nb');
    expect(np('|')).toBe('\n|');
  });
  it('F-61 at the end of a non-empty line', () => expect(np('ab|')).toBe('ab\n\n|'));
  it('F-61 at the start of a non-empty line', () => expect(np('|ab')).toBe('\n\n|ab'));
  it('F-61 list and quote prefixes are not continued', () => {
    expect(np('* a|')).toBe('* a\n\n|');
    expect(np('> a|')).toBe('> a\n\n|');
  });
  it('F-61 empty line with a selection of the line ending', () => expect(np('a«\n»b')).toBe('a\n\n|b'));
});

describe('F-66 to F-69 Return (pure)', () => {
  const R = (m: string, o = { insertPrefix: true, autoIncrement: true }) => run(m, (s) => returnKey(s, o));
  it('F-66 each bullet keeps its own character, not P-45', () => {
    expect(R('+ a|')).toBe('+ a\n+ |');
    expect(R('- a|')).toBe('- a\n- |');
  });
  it('F-66 bullet plus number continues as a bullet', () => expect(R('* 1. x|')).toBe('* 1. x\n* |'));
  it('F-66 indentation is kept for nested items', () => expect(R('    - a|')).toBe('    - a\n    - |'));
  it('F-66 mid-line Return splits the item: the text after the cursor moves to the new item', () => expect(R('* ab|cd')).toBe('* ab\n* |cd'));
  it('F-66 Return with the cursor in the marker of a non-empty item: "* |a" is an empty-item case', () => {
    // up to the cursor there is only "* ": the empty-item rule removes it
    expect(R('* |a')).toBe('\n|a');
  });
  it('F-67 leading zeros are dropped', () => {
    expect(R('009. a|')).toBe('009. a\n10. |');
    expect(R('09. a|', { insertPrefix: true, autoIncrement: false })).toBe('09. a\n9. |');
  });
  it('F-67 big numbers', () => expect(R('99. a|')).toBe('99. a\n100. |'));
  it('F-66 duplicate guard: the text after the cursor already starts with the marker, so none is added', () => expect(R('* a|* b')).toBe('* a\n|* b'));
  it('F-66 Return on an empty numbered item', () => expect(R('1. |')).toBe('\n|'));
  it('F-66 Return at the very start of a list line does nothing special: plain newline', () => expect(R('|* a')).toBe('\n|* a'));
  it('F-66 whitespace-only before the cursor falls through to the indent rule', () => expect(R('  |')).toBe('  \n  |'));
  it('F-68 nested quote markers are copied', () => {
    expect(R('>> a|')).toBe('>> a\n>> |');
    expect(R('> > a|')).toBe('> > a\n> > |');
    expect(R('>a|')).toBe('>a\n>|');
  });
  it('F-68 Return in the middle of a quote line prefixes the second half', () => expect(R('> ab|cd')).toBe('> ab\n> |cd'));
  it('F-68 quote lines nested in a list: the list rule has precedence', () => expect(R('- > a|')).toBe('- > a\n- |'));
  it('F-68 a quote line after an indent: not a quote line (starts with space), indent rule', () => expect(R('  > a|')).toBe('  > a\n  |'));
  it('F-69 tabs and mixed indentation are copied', () => expect(R(' \t x|')).toBe(' \t x\n \t |'));
  it('F-69 an indent-only line: the indent up to the cursor', () => expect(R('   |')).toBe('   \n   |'));
  it('F-69 P-38 off: lists are not continued but the indent is', () => {
    const off = { insertPrefix: false, autoIncrement: true };
    expect(R('  * a|', off)).toBe('  * a\n  |');
    expect(R('> a|', off)).toBe('> a\n|');
    expect(R('1. a|', off)).toBe('1. a\n|');
  });
  it('§5.2 a non-empty selection is replaced by a plain newline (no continuation)', () => {
    expect(R('* «ab»')).toBe('* \n|');
    expect(R('> «ab»c')).toBe('> \n|c');
  });
  it('§5.2 an empty document gives a newline', () => expect(R('|')).toBe('\n|'));
  it('F-66 task items continue as plain bullets', () => expect(R('- [x] a|')).toBe('- [x] a\n- |'));
  it('F-66 an item whose content is just spaces counts as empty? "- |  " (cursor before spaces) is an empty item', () => expect(R('- |  ')).toBe('\n|  '));
});

describe('F-62 to F-65 auto-pair (pure)', () => {
  const t = (m: string, ch: string, strike = false) =>
    run(m, (s) => autoPairInput(s, ch, strike) ?? { from: s.from, to: s.to, insert: ch, selFrom: s.from + 1, selTo: s.from + 1 });
  it('F-62 every opener gets its pair when the next character is a boundary', () => {
    for (const [o, c] of [['(', ')'], ['[', ']'], ['{', '}'], ['<', '>'], ['（', '）'], ['「', '」'], ['『', '』'], ['‘', '’'], ['“', '”']]) {
      expect(t('|', o), o).toBe(`${o}|${c}`);
      expect(t('a |', o), o).toBe(`a ${o}|${c}`);
    }
  });
  it('F-62 boundary is whitespace, newline or Unicode punctuation only', () => {
    for (const next of [' ', '\n', '\t', '.', ',', ')', '-', '_', '"', '!', ']', '}', '、', '。']) expect(t(`|${next}`, '('), JSON.stringify(next)).toBe(`(|)${next}`);
    // Symbols (Sm, Sk, Sc) and letters/digits are not boundaries.
    for (const next of ['a', '1', '$', '+', '<', '=', '>', '^', '`', '|', '~', '€']) expect(t(`|${next}`, '('), JSON.stringify(next)).toBe(`(|${next}`);
  });
  it('F-62 quote: previous character must be a boundary too', () => {
    expect(t('a|', '"')).toBe('a"|');
    expect(t('1|', "'")).toBe("1'|");
    expect(t(' |', '"')).toBe(' "|"');
    expect(t('(|)', '"')).toBe('("|")'); // previous is punctuation
    expect(t('.|', "'")).toBe(".'|'");
    expect(t('$|', '"')).toBe('$"|'); // $ is a symbol, not a boundary
  });
  it('F-62 brackets after a letter are paired (previous character is not checked)', () => expect(t('a|', '(')).toBe('a(|)'));
  it('F-64 skip over each closer', () => {
    for (const [o, c] of [['(', ')'], ['[', ']'], ['{', '}'], ['>', '>'], ['）', '）'], ['」', '」'], ['』', '』'], ['’', '’'], ['”', '”']]) {
      void o;
      expect(t(`a|${c}`, c), c).toBe(`a${c}|`);
    }
  });
  it('F-64 a closer typed when the next character is not that closer is left to normal typing (no edit)', () => {
    expect(autoPairInput(parse('|'), ')', false)).toBeNull();
    expect(autoPairInput(parse('a|b'), ']', false)).toBeNull();
  });
  it('F-64 skip over works for > only as closer of <', () => expect(t('<|>', '>')).toBe('<>|'));
  it('F-64 quotes: next char equal to the typed quote, prefers inserting a new pair when boundaries allow', () => {
    expect(t('"a|"', '"')).toBe('"a"|'); // previous 'a' is not a boundary: skip
    expect(t('"|"', '"')).toBe('""|""'); // quirk
    expect(t("'|'", "'")).toBe("''|''");
  });
  it('F-63 wrap with every opener and markup character, selection stays on the text', () => {
    for (const [o, c] of [['(', ')'], ['[', ']'], ['{', '}'], ['<', '>'], ["'", "'"], ['"', '"'], ['「', '」']]) expect(t('«ab»', o)).toBe(`${o}«ab»${c}`);
    for (const m of ['*', '_', '`', '=']) expect(t('x «ab» y', m), m).toBe(`x ${m}«ab»${m} y`);
  });
  it('F-63 ~ wraps only with strikethrough enabled', () => {
    expect(t('«ab»', '~', true)).toBe('~«ab»~');
    expect(t('«ab»', '~', false)).toBe('~|'); // normal typing replaces the selection
  });
  it('F-63 closers and other characters do not wrap', () => {
    for (const c of [')', ']', '}', 'a', '#', '-', '+', '>']) expect(t('«ab»', c), c).toBe(`${c}|`); // replaces the selection, no wrapping
  });
  it('F-63 multi-line selection wraps', () => expect(t('«a\nb»', '(')).toBe('(«a\nb»)'));
  it('F-62 multi-character input (paste) is never completed', () => {
    expect(autoPairInput(parse('|'), '()', false)).toBeNull();
    expect(autoPairInput(parse('«a»'), '((', false)).toBeNull();
  });
  it('F-65 delete both for every pair; a selection starting between the pair also deletes both', () => {
    for (const [o, c] of [['(', ')'], ['[', ']'], ['{', '}'], ['<', '>'], ["'", "'"], ['"', '"'], ['（', '）'], ['「', '」']]) {
      expect(run(`x${o}|${c}y`, deleteMatchingPair), o).toBe('x|y');
    }
    expect(run('x(«)y»', deleteMatchingPair)).toBe('x«y»');
    expect(run('(«ab»)', deleteMatchingPair)).toBe('(«ab»)'); // selection start is not between a pair
  });
  it('F-65 not at the document end, not at the start, not for mismatched pairs', () => {
    expect(run('(|', deleteMatchingPair)).toBe('(|');
    expect(run('|()', deleteMatchingPair)).toBe('|()');
    expect(run('(|]', deleteMatchingPair)).toBe('(|]');
    expect(run('(a|)', deleteMatchingPair)).toBe('(a|)');
    expect(run('()|', deleteMatchingPair)).toBe('()|');
  });
});

describe('F-70 to F-73 Tab, Backspace, Home (pure)', () => {
  const tab = (m: string) => run(m, insertSpacesForTab);
  const bs = (m: string) => run(m, unindentSpacesBefore);
  it('F-70 spaces up to the next 4-column stop', () => {
    expect(tab('|')).toBe('    |');
    expect(tab('a|')).toBe('a   |');
    expect(tab('ab|')).toBe('ab  |');
    expect(tab('abc|')).toBe('abc |');
    expect(tab('abcd|')).toBe('abcd    |');
    expect(tab('x\nab|')).toBe('x\nab  |');
  });
  it('F-70 the column counts a tab as one character', () => expect(tab('\ta|')).toBe('\ta  |'));
  it('F-72 deletes back to the previous 4-column stop, at most 4', () => {
    expect(bs('x       |')).toBe('x   |');
    expect(bs('    |')).toBe('|');
    expect(bs('      |')).toBe('    |');
    expect(bs('ab  |')).toBe('ab|');
    expect(bs('abc  |')).toBe('abc |'); // column 5: back to the stop at 4
  });
  it('F-72 fewer than 2 spaces: normal Backspace (null edit)', () => {
    expect(bs('a |')).toBe('a |');
    expect(bs(' |')).toBe(' |');
  });
  it('F-72 at the line start there is nothing to delete', () => expect(bs('x\n|  ')).toBe('x\n|  '));
  it('F-72 a long run of spaces: column 10 goes back to the stop at 8', () => expect(bs('a         |')).toBe('a       |'));
  it('F-73 smart Home target', () => {
    const sh = (m: string) => smartHomeTarget(parse(m));
    expect(sh('  ab|c')).toBe(2);
    expect(sh('  |abc')).toBeNull();
    expect(sh(' |  abc')).toBeNull(); // the cursor is inside the indentation
    expect(sh('|')).toBeNull();
    expect(sh('ab|')).toBe(0);
    expect(sh('x\n\t\tab|')).toBe(4);
  });
});

describe('F-105 to F-107 Transformations (pure)', () => {
  const tf = (m: string, k: 'upper' | 'lower' | 'capitalize') => run(m, (s) => transform(s, k));
  it('F-105 upper', () => expect(tf('«Hello wörld»', 'upper')).toBe('«HELLO WÖRLD»'));
  it('F-106 lower', () => expect(tf('«HeLLo»', 'lower')).toBe('«hello»'));
  it('F-107 capitalize: first letter of each whitespace-delimited word, the rest lower case', () => expect(tf('«hELLO wORLD\nfoo»', 'capitalize')).toBe('«Hello World\nFoo»'));
  it('F-105 the selection is kept after a length-changing transform (ß -> SS)', () => expect(tf('«straße»', 'upper')).toBe('«STRASSE»'));
});

// ---------------------------------------------------------------------------
// Differential fuzz against the independent transliteration
// ---------------------------------------------------------------------------
describe('differential: text.ts vs the independent Obj-C transliteration', () => {
  for (const [p, q, label] of [['**', '**', 'F-40 strong'], ['*', '*', 'F-41 emphasize'], ['_', '_', 'F-42 underline'], ['~~', '~~', 'F-43 strikethrough'], ['==', '==', 'F-44 highlight'], ['`', '`', 'F-45 inline code'], ['<!--', '-->', 'F-46 comment'], ['[', ']()', 'F-59 link markup']] as const) {
    fuzz(label, (s) => toggleMarkup(s, p, q), (tv) => void refToggleMarkup(tv, p, q));
  }
  fuzz('F-55 unordered list (*)', (s) => toggleBlock(s, unorderedList('* ')), (tv) => refToggleBlock(tv, /^[*+-] \S/, '* '));
  fuzz('F-55 unordered list (-)', (s) => toggleBlock(s, unorderedList('- ')), (tv) => refToggleBlock(tv, /^[*+-] \S/, '- '));
  fuzz('F-56 blockquote', (s) => toggleBlock(s, BLOCKQUOTE), (tv) => refToggleBlock(tv, /^> \S/, '> '));
  fuzz('F-54 ordered list (U-05 deviation model)', (s) => toggleBlock(s, ORDERED_LIST), (tv) => refToggleBlock(tv, /^[0-9]+\. \S/, '1. ', /^[0-9]+\. /));
  for (let lv = 0; lv <= 6; lv++) fuzz(`F-${lv === 0 ? 53 : 46 + lv} header level ${lv}`, (s) => makeHeader(s, lv), (tv) => refHeader(tv, lv));
  fuzz('F-57 shift right (tab)', (s) => indentLines(s, '\t'), (tv) => refIndent(tv, '\t'));
  fuzz('F-57 shift right (P-37)', (s) => indentLines(s, '    '), (tv) => refIndent(tv, '    '));
  fuzz('F-58 shift left', unindentLines, refUnindent);
  fuzz('F-66 list item (P-39 on)', (s) => completeNextListItem(s, true), (tv) => void refListItem(tv, true), { cursorOnly: true });
  fuzz('F-67 list item (P-39 off)', (s) => completeNextListItem(s, false), (tv) => void refListItem(tv, false), { cursorOnly: true });
  fuzz('F-68 blockquote line', completeNextBlockquoteLine, (tv) => void refQuote(tv), { cursorOnly: true });
  fuzz('F-69 indented line', completeNextIndentedLine, (tv) => void refIndented(tv), { cursorOnly: true });
  fuzz('F-66 to F-69 Return with P-38 on', (s) => returnKey(s, { insertPrefix: true, autoIncrement: true }), (tv) => refReturn(tv, true, true));
  fuzz('F-69 Return with P-38 off', (s) => returnKey(s, { insertPrefix: false, autoIncrement: true }), (tv) => refReturn(tv, false, true));
  fuzz('F-61 New Paragraph', newParagraph, refNewParagraph);
});

// ---------------------------------------------------------------------------
// Boundaries the builder's selection clamp could hide
// ---------------------------------------------------------------------------
describe('selection results never leave the document', () => {
  it('F-58 / F-47 / F-55: every edit result has a valid selection for 4000 random inputs', () => {
    const r = rng(99);
    const fns: ((s: TextState) => TextEdit | null)[] = [unindentLines, (s) => makeHeader(s, 3), (s) => toggleBlock(s, BLOCKQUOTE), (s) => indentLines(s, '\t'), newParagraph, (s) => returnKey(s, { insertPrefix: true, autoIncrement: true })];
    for (let i = 0; i < 4000; i++) {
      const s = genDoc(r);
      for (const f of fns) {
        const e = f(s);
        if (!e) continue;
        const res = apply(s, e);
        expect(validSel(res), JSON.stringify([s, e])).toBe(true);
      }
    }
  });
});
