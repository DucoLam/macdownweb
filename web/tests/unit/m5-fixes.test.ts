/**
 * M5 fixes (builder tests): D-13 line breaks, D-16 percent decoding, D-17
 * path extensions, D-18 draft quota, SD-13 empty front-matter titles, O-03
 * safe picker names.
 */
import { describe, expect, it } from 'vitest';
import { EditorState, type Transaction } from '@codemirror/state';
import { history, redo, undo } from '@codemirror/commands';
import { fileText, lineBreaks, normalizeLineBreaks, scanLineBreaks } from '../../src/editor/lineBreaks';
import { pathExtension, presumedFileName, stripExtension, suggestedSaveName, UNTITLED } from '../../src/document/document';
import { safeFileName } from '../../src/document/files';
import { percentDecode } from '../../src/components/Preview';
import { DRAFT_KEY, saveDraft } from '../../src/document/draft';

function editor(raw: string) {
  let state = EditorState.create({ doc: raw, extensions: [history(), lineBreaks(raw)] });
  const dispatch = (tr: Transaction) => (state = tr.state);
  return {
    get text() {
      return fileText(state);
    },
    get lf() {
      return state.doc.toString();
    },
    change(from: number, to: number, insert: string) {
      state = state.update({ changes: { from, to, insert }, userEvent: 'input' }).state;
    },
    undo: () => undo({ state, dispatch }),
    redo: () => redo({ state, dispatch }),
  };
}

describe('D-13 line breaks are kept as read (NSTextView probe)', () => {
  it('scanLineBreaks gives editor positions of the breaks that are not LF', () => {
    expect(scanLineBreaks('a\nb')).toEqual([]);
    expect(scanLineBreaks('a\r\nb\r\n')).toEqual([{ pos: 1, sep: '\r\n' }, { pos: 3, sep: '\r\n' }]);
    expect(scanLineBreaks('a\rb\nc\r\nd')).toEqual([{ pos: 1, sep: '\r' }, { pos: 5, sep: '\r\n' }]);
  });
  for (const raw of ['', 'a', 'a\r\nb\r\n', 'a\rb\r', 'a\r\nb\nc\rd', '\r\n\r\n', '\r\r\n\n', 'x\r']) {
    it(`round-trips ${JSON.stringify(raw)} unchanged`, () => expect(editor(raw).text).toBe(raw));
  }
  it('typing in a CRLF document keeps CRLF; a new break is LF, as insertNewline: does', () => {
    const e = editor('a\r\nb\r\n');
    e.change(4, 4, 'c');
    expect(e.text).toBe('a\r\nb\r\nc');
    e.change(5, 5, '\n');
    expect(e.text).toBe('a\r\nb\r\nc\n');
  });
  it('text inserted just before a break stays before it', () => {
    const e = editor('a\r\nb');
    e.change(1, 1, 'X');
    expect(e.text).toBe('aX\r\nb');
  });
  it('deleting a break deletes it whole; undo brings the CRLF back, redo deletes it again', () => {
    const e = editor('a\r\nb\rc');
    e.change(1, 2, '');
    expect(e.text).toBe('ab\rc');
    e.undo();
    expect(e.text).toBe('a\r\nb\rc');
    e.redo();
    expect(e.text).toBe('ab\rc');
    e.undo();
    expect(e.text).toBe('a\r\nb\rc');
  });
  it('typing and deleting back gives the original text (F-34 not edited)', () => {
    const e = editor('a\r\nb\r\n');
    e.change(0, 0, 'z');
    e.change(0, 1, '');
    expect(e.text).toBe('a\r\nb\r\n');
  });
  it('replacing everything drops the old separators; undo restores them all', () => {
    const e = editor('a\r\nb\r\nc');
    e.change(0, 5, 'x\ny');
    expect(e.text).toBe('x\ny');
    e.undo();
    expect(e.text).toBe('a\r\nb\r\nc');
  });
  it('normalizeLineBreaks turns CR and CRLF into LF (Hoedown first pass)', () => {
    expect(normalizeLineBreaks('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
    expect(normalizeLineBreaks('plain')).toBe('plain');
  });
});

describe('D-17 pathExtension (Foundation probe on macOS)', () => {
  const cases: [string, string, string][] = [
    ['a.md', 'md', 'a'],
    ['a..md', 'md', 'a.'],
    ['..md', '', '..md'],
    ['...', '', '...'],
    ['a .md', 'md', 'a '],
    ['a .b', 'b', 'a '],
    ['a.b ', '', 'a.b '],
    ['a. b', '', 'a. b'],
    ['a.\tb', '\tb', 'a'],
    ['a.b c', 'b c', 'a'],
    ['a.b:c', 'b:c', 'a'],
    ['a/b.md', 'md', 'a/b'],
    ['a.b/c', '', 'a.b/c'],
    ['', '', ''],
    ['.', '', '.'],
  ];
  for (const [name, ext, stripped] of cases) {
    it(`${JSON.stringify(name)}: extension ${JSON.stringify(ext)}, without it ${JSON.stringify(stripped)}`, () => {
      expect(pathExtension(name)).toBe(ext);
      expect(stripExtension(name)).toBe(stripped);
    });
  }
});

describe('SD-13 empty front-matter title', () => {
  it('the presumed name is "" (string scalar), and the Save panel keeps its default Untitled.md', () => {
    for (const t of ['---\ntitle:\n---\n# H', '---\ntitle: ""\n---\n# H']) {
      expect(presumedFileName(UNTITLED, t, true)).toBe('');
      expect(suggestedSaveName(UNTITLED, t, true)).toBe('Untitled.md');
    }
  });
  it('"~" and "null" are strings, not null', () => {
    expect(presumedFileName(UNTITLED, '---\ntitle: ~\n---\n', true)).toBe('~');
    expect(presumedFileName(UNTITLED, '---\ntitle: null\n---\n', true)).toBe('null');
  });
});

describe('D-16 percentDecode follows the URL standard', () => {
  it('keeps malformed escapes and replaces invalid UTF-8', () => {
    expect(percentDecode('100%')).toBe('100%');
    expect(percentDecode('%zz%4')).toBe('%zz%4');
    expect(percentDecode('a%20b')).toBe('a b');
    expect(percentDecode('%C3%A9')).toBe('é');
    expect(percentDecode('%E0%A4%A')).toBe('�%A');
    expect(percentDecode('é%41')).toBe('éA');
  });
});

describe('O-03 safeFileName', () => {
  it('replaces characters that pickers refuse and avoids hidden or empty names', () => {
    expect(safeFileName('a/b: c.md')).toBe('a-b- c.md');
    expect(safeFileName('.html')).toBe('Untitled.html');
    expect(safeFileName('')).toBe('Untitled');
    expect(safeFileName('ok.md')).toBe('ok.md');
  });
});

describe('D-18 a draft too large for storage removes the older draft', () => {
  it('setItem failing removes the key', () => {
    const data = new Map<string, string>([[DRAFT_KEY, 'old']]);
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
      removeItem: (k: string) => void data.delete(k),
    } as unknown as Storage;
    saveDraft(UNTITLED, 'x'.repeat(10), storage);
    expect(data.has(DRAFT_KEY)).toBe(false);
  });
});
