/**
 * M4 editor commands and behaviours (spec §2.4, §2.5, §5, §10 S-16, §13).
 * Pure text functions from src/editor/text.ts. Notation: `|` is the cursor,
 * `[` … `]` is the selection (`«`/`»` are used where the text has brackets).
 */
import { describe, expect, it } from 'vitest';
import {
  BLOCKQUOTE,
  ORDERED_LIST,
  ORDERED_LIST_ORIGINAL,
  autoPairInput,
  capitalize,
  deleteMatchingPair,
  indentLines,
  indentPadding,
  insertTab,
  isBoundary,
  lineRange,
  makeHeader,
  newParagraph,
  returnKey,
  smartHomeTarget,
  toggleBlock,
  toggleLink,
  toggleMarkup,
  transform,
  unindentLines,
  unindentSpacesBefore,
  unorderedList,
  unorderedListMarker,
  urlFromClipboard,
  type TextEdit,
  type TextState,
} from '../../src/editor/text';

/** Parses `a|b`, `[sel]` (or `«sel»` when the text contains brackets). */
function st(marked: string): TextState {
  const guillemets = marked.includes('«');
  const [o, c] = guillemets ? ['«', '»'] : ['[', ']'];
  const cur = marked.indexOf('|');
  if (cur >= 0) return { doc: marked.slice(0, cur) + marked.slice(cur + 1), from: cur, to: cur };
  const a = marked.indexOf(o);
  const b = marked.indexOf(c, a);
  if (a < 0 || b < 0) throw new Error('no cursor or selection in ' + marked);
  const doc = marked.slice(0, a) + marked.slice(a + 1, b) + marked.slice(b + 1);
  return { doc, from: a, to: b - 1 };
}

/** Applies an edit and renders the result in the same notation. */
function show(s: TextState, e: TextEdit | null, guillemets = false): string {
  if (!e) return 'null';
  const doc = s.doc.slice(0, e.from) + e.insert + s.doc.slice(e.to);
  if (e.selFrom === e.selTo) return doc.slice(0, e.selFrom) + '|' + doc.slice(e.selFrom);
  const [o, c] = guillemets ? ['«', '»'] : ['[', ']'];
  return doc.slice(0, e.selFrom) + o + doc.slice(e.selFrom, e.selTo) + c + doc.slice(e.selTo);
}

const apply = (m: string, f: (s: TextState) => TextEdit | null, g = false) => show(st(m), f(st(m)), g);
const ret = (m: string, insertPrefix = true, autoIncrement = true) => apply(m, (s) => returnKey(s, { insertPrefix, autoIncrement }));
const type = (m: string, ch: string, strike = false) => apply(m, (s) => autoPairInput(s, ch, strike));

describe('§10 S-16 editor behaviour cases E1 to E23', () => {
  it('E1 typing ( inserts a pair (P-36 on)', () => expect(type('|', '(')).toBe('(|)'));
  it('E2 typing ) before ) skips over it', () => expect(type('(|)', ')')).toBe('()|'));
  it('E3 Backspace inside an empty pair deletes both', () => expect(apply('(|)', deleteMatchingPair)).toBe('|'));
  it('E4 typing * with a selection wraps it and keeps it selected', () => expect(type('[word]', '*')).toBe('*[word]*'));
  it('E5 no pair when the next character is not a boundary', () => expect(type('x|y', '(')).toBe('null'));
  it('E6 Return continues a bullet item', () => expect(ret('* item|')).toBe('* item\n* |'));
  it('E7 Return continues a numbered item, incremented with P-39 on', () => {
    expect(ret('3. item|')).toBe('3. item\n4. |');
    expect(ret('3. item|', true, false)).toBe('3. item\n3. |');
  });
  it('E8 Return on an empty item removes the marker and inserts a newline', () => expect(ret('* |')).toBe('\n|'));
  it('E9 Return continues a blockquote', () => expect(ret('> q|')).toBe('> q\n> |'));
  it('E10 Tab with P-37 inserts spaces to the next 4-column stop', () => {
    expect(apply('ab|', (s) => insertTab(s, true))).toBe('ab  |');
    expect(apply('ab|', (s) => insertTab(s, false))).toBe('ab\t|');
    expect(apply('abcd|', (s) => insertTab(s, true))).toBe('abcd    |');
  });
  it('E11 Cmd+B wraps, pressing again unwraps', () => {
    expect(apply('[a]', (s) => toggleMarkup(s, '**', '**'))).toBe('**[a]**');
    expect(apply('**[a]**', (s) => toggleMarkup(s, '**', '**'))).toBe('[a]');
  });
  it('E12 Cmd+2 then Cmd+0', () => {
    expect(apply('[Title]', (s) => makeHeader(s, 2))).toBe('## [Title]');
    expect(apply('## [Title]', (s) => makeHeader(s, 0))).toBe('[Title]');
  });
  it('E13 Shift+Cmd+U toggles the unordered list on every line', () => {
    expect(apply('[l1\nl2]', (s) => toggleBlock(s, unorderedList('* ')))).toBe('* [l1\n* l2]');
    expect(apply('* [l1\n* l2]', (s) => toggleBlock(s, unorderedList('* ')))).toBe('[l1\nl2]');
  });
  it('E14 Cmd+] indents the selected lines', () => {
    expect(apply('[a\nb]', (s) => indentLines(s, indentPadding(false)))).toBe('\t[a\n\tb]');
    expect(apply('[a\nb]', (s) => indentLines(s, indentPadding(true)))).toBe('    [a\n    b]');
  });
  it("E15 typing ' after a letter inserts no pair", () => expect(type('don|', "'")).toBe('null'));
  it('E16 typing " inside an empty pair inserts a new pair (original quirk)', () => expect(type('"|"', '"')).toBe('""|""'));
  it('E17 a selection that includes the markup is wrapped again', () =>
    expect(apply('[**a**]', (s) => toggleMarkup(s, '**', '**'))).toBe('**[**a**]**'));
  it('E18 Return on an indented empty item keeps the indent', () => expect(ret('  * |')).toBe('\n  |'));
  it('E19 Return on an empty quote line adds another marker', () => expect(ret('> |')).toBe('> \n> |'));
  it('E20 Cmd+Return inserts two newlines at the cursor', () => expect(apply('ab|cd', newParagraph)).toBe('ab\n\n|cd'));
  it('E21 indent continuation works with P-38 off', () => expect(ret('  ab|', false)).toBe('  ab\n  |'));
  it('E22 Shift+Cmd+O removes an ordered list (U-05 deviation); the original adds a second prefix', () => {
    expect(apply('[1. a\n1. b]', (s) => toggleBlock(s, ORDERED_LIST))).toBe('[a\nb]');
    expect(apply('[1. a\n1. b]', (s) => toggleBlock(s, ORDERED_LIST_ORIGINAL))).toBe('1. [1. a\n1. 1. b]');
  });
  it('E23 Cmd+[ removes spaces followed by a tab as one unit', () => expect(apply('  \tx|', unindentLines)).toBe('x|'));
});

describe('F-40 to F-46 inline toggles (§5.4 toggleForMarkupPrefix)', () => {
  const t = (m: string, p: string, x = p) => apply(m, (s) => toggleMarkup(s, p, x));
  it('F-40 empty selection inserts the pair with the cursor between', () => expect(t('a|b', '**')).toBe('a**|**b'));
  it('F-41 Cmd+I inside bold adds * instead of breaking the bold', () => {
    expect(t('**[a]**', '*')).toBe('***[a]***');
    expect(t('***[a]***', '*')).toBe('**[a]**');
    expect(t('*[a]*', '*')).toBe('[a]');
  });
  it('F-42 F-43 F-44 F-45 F-46 markers', () => {
    expect(t('[a]', '_')).toBe('_[a]_');
    expect(t('[a]', '~~')).toBe('~~[a]~~');
    expect(t('==[a]==', '==')).toBe('[a]');
    expect(t('[a]', '`')).toBe('`[a]`');
    expect(t('[a]', '<!--', '-->')).toBe('<!--[a]-->');
    expect(t('<!--[a]-->', '<!--', '-->')).toBe('[a]');
  });
  it('F-40 only the text just outside the selection counts', () => {
    expect(t('**a[b]c**', '**')).toBe('**a**[b]**c**');
    expect(t('[a]**', '**')).toBe('**[a]****');
  });
});

describe('F-59 / F-60 link and image', () => {
  const g = true;
  it('F-59 adds [](), the cursor goes inside ()', () => {
    expect(apply('«a»', (s) => toggleLink(s, false, null), g)).toBe('[a](|)');
    expect(apply('|', (s) => toggleLink(s, false, null))).toBe('[](|)');
  });
  it('F-59 an http, https or file clipboard URL is inserted and selected', () => {
    expect(apply('«a»', (s) => toggleLink(s, false, 'https://x.org/p'), g)).toBe('[a](«https://x.org/p»)');
    expect(apply('«a»', (s) => toggleLink(s, false, 'FILE:///tmp/x'), g)).toBe('[a](«FILE:///tmp/x»)');
    expect(apply('«a»', (s) => toggleLink(s, false, 'ftp://x.org'), g)).toBe('[a](|)');
    expect(apply('«a»', (s) => toggleLink(s, false, 'not a url'), g)).toBe('[a](|)');
    expect(apply('«a»', (s) => toggleLink(s, false, 'mailto:a@b.c'), g)).toBe('[a](|)');
  });
  it('F-59 removes the markup when the selection is directly surrounded, and nothing else', () => {
    expect(apply('[«a»]()', (s) => toggleLink(s, false, 'http://x.y'), g)).toBe('«a»');
  });
  it('F-60 image', () => {
    expect(apply('«a»', (s) => toggleLink(s, true, 'http://i.png/x'), g)).toBe('![a](«http://i.png/x»)');
    expect(apply('![«a»]()', (s) => toggleLink(s, true, null), g)).toBe('«a»');
  });
  it('clipboard URL rule (NSPasteboard+Types)', () => {
    expect(urlFromClipboard('http://a.b')).toBe('http://a.b');
    expect(urlFromClipboard('HTTPS://a.b')).toBe('HTTPS://a.b');
    expect(urlFromClipboard('a.b')).toBeNull();
    expect(urlFromClipboard('http://a b')).toBeNull();
    expect(urlFromClipboard('')).toBeNull();
    expect(urlFromClipboard(null)).toBeNull();
  });
});

describe('F-47 to F-53 headers (makeHeaderForSelectedLinesWithLevel:)', () => {
  const h = (m: string, l: number) => apply(m, (s) => makeHeader(s, l));
  it('F-47 to F-52 every level, cursor kept relative', () => {
    for (let l = 1; l <= 6; l++) expect(h('ab|c', l)).toBe('#'.repeat(l) + ' ab|c');
  });
  it('F-47 existing # prefixes are replaced, `#foo` is not a prefix', () => {
    expect(h('### |x', 1)).toBe('# |x');
    expect(h('|#foo', 1)).toBe('# |#foo');
    // `(#+ )*` captures its last iteration, so the original shifts the
    // selection by 4 − 2 and the cursor ends after the text (clamped here).
    expect(h('## # |x', 3)).toBe('### x|');
  });
  it('F-53 paragraph strips the prefix', () => expect(h('#### a|', 0)).toBe('a|'));
  it('F-47 with several lines, whitespace-only lines are left alone', () =>
    expect(h('[a\n  \nb]', 2)).toBe('## [a\n  \n## b]'));
  it('F-47 a single empty line becomes "# " (at the document end)', () => expect(h('|', 1)).toBe('# |'));
  it('F-47 the line range includes the whole lines touched by the selection', () =>
    expect(h('x[a\nb]y\nz', 1)).toBe('# x[a\n# b]y\nz'));
});

describe('F-54 to F-56 block toggles (§5.4 toggleBlockWithPattern:)', () => {
  const ul = unorderedList('* ');
  it('F-55 a cursor line toggles on and off, cursor kept', () => {
    expect(apply('ab|c', (s) => toggleBlock(s, ul))).toBe('* ab|c');
    expect(apply('* ab|c', (s) => toggleBlock(s, ul))).toBe('ab|c');
  });
  it('F-55 empty lines need to match too, and also get the prefix', () => {
    // Empty lines are not counted in `totalShift`, so the selection end lags
    // by one prefix, as in the original [ac:347-349, 366-370].
    expect(apply('[a\n\nb]', (s) => toggleBlock(s, ul))).toBe('* [a\n* \n*] b');
  });
  it('F-55 the P-45 marker is used for adding; any marker is removed (fixed length)', () => {
    expect(apply('[a]', (s) => toggleBlock(s, unorderedList(unorderedListMarker(2))))).toBe('- [a]');
    expect(apply('[+ a\n- b]', (s) => toggleBlock(s, ul))).toBe('[a\nb]');
    expect(unorderedListMarker(0)).toBe('* ');
    expect(unorderedListMarker(1)).toBe('+ ');
  });
  it('F-55 a mixed block gets the prefix on every line', () =>
    expect(apply('[* a\nb]', (s) => toggleBlock(s, ul))).toBe('* [* a\n* b]'));
  it('F-55 a trailing newline of the line range is kept', () =>
    expect(apply('[a\n]b', (s) => toggleBlock(s, ul))).toBe('* [a\n]b'));
  it('F-54 adds "1. " to every line (not renumbered)', () =>
    expect(apply('[a\nb]', (s) => toggleBlock(s, ORDERED_LIST))).toBe('1. [a\n1. b]'));
  it('F-54 deviation strips multi-digit numbers', () =>
    expect(apply('[10. a\n9. b]', (s) => toggleBlock(s, ORDERED_LIST))).toBe('[a\nb]'));
  it('F-56 blockquote', () => {
    expect(apply('[q\nr]', (s) => toggleBlock(s, BLOCKQUOTE))).toBe('> [q\n> r]');
    expect(apply('> [q\n> r]', (s) => toggleBlock(s, BLOCKQUOTE))).toBe('[q\nr]');
    expect(apply('>q|', (s) => toggleBlock(s, BLOCKQUOTE))).toBe('> >q|');
  });
  it('F-55 cursor inside the removed prefix is clamped to the line start', () =>
    expect(apply('*| a', (s) => toggleBlock(s, ul))).toBe('|a'));
});

describe('F-57 / F-58 shift right and left', () => {
  it('F-57 every line gets the padding, including empty ones, except a final empty line', () => {
    // The empty line is padded but not counted in `totalShift` (original selection maths).
    expect(apply('[a\n\nb]', (s) => indentLines(s, '\t'))).toBe('\t[a\n\t\n\t]b');
    expect(apply('[a\n]b', (s) => indentLines(s, '\t'))).toBe('\t[a\n]b');
  });
  it('F-57 a cursor indents its line', () => expect(apply('a|b', (s) => indentLines(s, '\t'))).toBe('\ta|b'));
  it('F-58 removes up to 4 spaces, or one tab', () => {
    expect(apply('      a|', unindentLines)).toBe('  a|');
    expect(apply('\t\ta|', unindentLines)).toBe('\ta|');
    expect(apply(' a|', unindentLines)).toBe('a|');
    expect(apply('[    a\n\tb]', unindentLines)).toBe('[a\nb]');
  });
  it('F-58 a line made only of whitespace is unchanged (its shift still counts for the selection)', () => {
    const s = st('[    \na]');
    const e = unindentLines(s);
    expect(e.insert).toBe('    \na');
  });
});

describe('§5.1 auto-pairing details (F-62 to F-65)', () => {
  it('F-62 every pair of the table', () => {
    for (const [o, c] of [['(', ')'], ['[', ']'], ['{', '}'], ['<', '>'], ['（', '）'], ['「', '」'], ['『', '』'], ['‘', '’'], ['“', '”']])
      expect(type('|', o)).toBe(o + '|' + c);
  });
  it('F-62 quotes pair only between boundaries', () => {
    expect(type('a |', '"')).toBe('a "|"');
    expect(type('a|', '"')).toBe('null');
    expect(type("(|)", "'")).toBe("('|')");
  });
  it('F-62 boundary = whitespace, newline or Unicode punctuation (symbols are not)', () => {
    expect(isBoundary(' ')).toBe(true);
    expect(isBoundary('\n')).toBe(true);
    expect(isBoundary('.')).toBe(true);
    expect(isBoundary('=')).toBe(false);
    expect(isBoundary('a')).toBe(false);
    expect(type('|=', '(')).toBe('null');
    expect(type('|.', '(')).toBe('(|).');
  });
  it('F-63 wrapping: openers, markup characters, ~ only with P-10', () => {
    expect(show(st('«ab»'), autoPairInput(st('«ab»'), '[', false), true)).toBe('[«ab»]');
    expect(type('[ab]', '_')).toBe('_[ab]_');
    expect(type('[ab]', '`')).toBe('`[ab]`');
    expect(type('[ab]', '=')).toBe('=[ab]=');
    expect(type('[ab]', '~')).toBe('null');
    expect(type('[ab]', '~', true)).toBe('~[ab]~');
    expect(type('[ab]', ')')).toBe('null');
  });
  it('F-64 skipping only when the next character is the same closer', () => {
    expect(type('|)', ')')).toBe(')|');
    expect(type('|a', ')')).toBe('null');
    expect(type('a|]', ']')).toBe('a]|');
  });
  it('F-65 delete-pair: needs opener before and closer after; not at the document end', () => {
    expect(apply('a(|)b', deleteMatchingPair)).toBe('a|b');
    expect(apply('a(|', deleteMatchingPair)).toBe('null');
    expect(apply('(|]', deleteMatchingPair)).toBe('null');
    expect(apply('"|"', deleteMatchingPair)).toBe('|');
  });
});

describe('§5.2 Return details (F-66 to F-69)', () => {
  it('F-66 the line keeps its own bullet character and spacing (not P-45)', () => {
    expect(ret('- a|')).toBe('- a\n- |');
    expect(ret('+ a|')).toBe('+ a\n+ |');
    expect(ret('*   a|')).toBe('*   a\n*   |');
    expect(ret('  * a|')).toBe('  * a\n  * |');
  });
  it('F-66 task items continue as plain bullets; `* 1. x` continues as a bullet', () => {
    expect(ret('- [ ] t|')).toBe('- [ ] t\n- |');
    expect(ret('* 1. x|')).toBe('* 1. x\n* |');
  });
  it('F-67 leading zeros are dropped', () => expect(ret('09. a|')).toBe('09. a\n10. |'));
  it('F-66 only the text before the cursor is used', () => expect(ret('* a|b')).toBe('* a\n* |b'));
  it('F-66 the duplicate guard: a following marker is not repeated', () => {
    expect(ret('* a|* b')).toBe('* a\n|* b');
  });
  it('F-66 P-38 off: no list or quote continuation', () => {
    expect(ret('* a|', false)).toBe('* a\n|');
    expect(ret('> a|', false)).toBe('> a\n|');
  });
  it('F-68 nested markers and missing spaces are kept', () => {
    expect(ret('> > a|')).toBe('> > a\n> > |');
    expect(ret('>a|')).toBe('>a\n>|');
  });
  it('F-68 Return in the middle of a quote line prefixes the second half', () => expect(ret('> ab|cd')).toBe('> ab\n> |cd'));
  it('F-69 indentation is the whitespace up to the first non-whitespace character', () => {
    expect(ret('\t x|')).toBe('\t x\n\t |');
    expect(ret('   |')).toBe('   \n   |');
  });
  it('F-66 a selection or an empty document gives a plain newline', () => {
    expect(ret('* [a]')).toBe('* \n|');
    expect(ret('|')).toBe('\n|');
    expect(ret('a|')).toBe('a\n|');
  });
  it('F-61 New Paragraph on an empty line inserts a single newline; it replaces a selection', () => {
    expect(apply('a\n|\nb', newParagraph)).toBe('a\n\n|\nb');
    expect(apply('* a|', newParagraph)).toBe('* a\n\n|');
    expect(apply('a[bc]d', newParagraph)).toBe('a\n\n|d');
  });
});

describe('§5.3 Backspace and Home (F-72, F-73)', () => {
  it('F-72 deletes back to the previous 4-column stop when at least 2 spaces precede', () => {
    expect(apply('      |', unindentSpacesBefore)).toBe('    |');
    expect(apply('    |', unindentSpacesBefore)).toBe('|');
    expect(apply('a  |', unindentSpacesBefore)).toBe('a|');
    expect(apply('ab  |', unindentSpacesBefore)).toBe('ab|');
    expect(apply('abc  |', unindentSpacesBefore)).toBe('abc |');
    expect(apply('a |', unindentSpacesBefore)).toBe('null');
  });
  it('F-73 target is the first non-whitespace character, or null for the normal behaviour', () => {
    expect(smartHomeTarget(st('  ab|c'))).toBe(2);
    expect(smartHomeTarget(st('  |abc'))).toBeNull();
    expect(smartHomeTarget(st(' | abc'))).toBeNull();
    expect(smartHomeTarget(st('|abc'))).toBeNull();
    expect(smartHomeTarget(st('x\nab|c'))).toBe(2);
  });
});

describe('F-105 to F-107 transformations, helpers', () => {
  it('upper, lower, capitalize a selection', () => {
    expect(apply('[ab cD]', (s) => transform(s, 'upper'))).toBe('[AB CD]');
    expect(apply('[AB cD]', (s) => transform(s, 'lower'))).toBe('[ab cd]');
    // Q-05 (AppKit probe): capitalizedString starts a new word after '-', so 'x' becomes 'X'.
    expect(apply('[hELLO wORLD-x]', (s) => transform(s, 'capitalize'))).toBe('[Hello World-X]');
    expect(capitalize('a  b\tc')).toBe('A  B\tC');
  });
  // Q-05: NSTextView extends the selection to the word and selects the result (AppKit probe).
  it('the word around an empty selection', () => expect(apply('x ab|c y', (s) => transform(s, 'upper'))).toBe('x [ABC] y'));
  it('lineRange covers whole lines like NSString lineRangeForRange:', () => {
    expect(lineRange('a\nb\nc', 2, 2)).toEqual([2, 4]);
    expect(lineRange('a\nb\nc', 0, 2)).toEqual([0, 2]);
    expect(lineRange('a\nb', 3, 3)).toEqual([2, 3]);
  });
});
