/**
 * M5 independent unit tests (test-engineer): document model, UTF-8 reading,
 * draft storage, preferences store, preferences window helpers and HTML
 * export. Complements tests/unit/m5-files-prefs-export.test.ts (builder).
 *
 * Oracles: vendor/macdown (MPDocument.m, NSString+Lookup.m, MPRenderer.m),
 * and Foundation probes run on macOS (initWithData:encoding: UTF-8,
 * stringByDeletingPathExtension).
 */
import { describe, expect, it } from 'vitest';
import {
  UNTITLED,
  displayName,
  hasExtension,
  htmlTitle,
  isEdited,
  isMarkdownFileName,
  newlineInsertionPoint,
  presumedFileName,
  stripExtension,
  suggestedSaveName,
  titleString,
  windowTitle,
  type DocumentInfo,
} from '../../src/document/document';
import { decodeUtf8, isAbort, withExtension } from '../../src/document/files';
import { DRAFT_KEY, FIRST_VERSION_KEY, SPLIT_RATIOS_KEY, detectFreshInstall, draftToInfo, loadDraft, loadSplitRatio, saveDraft, saveSplitRatio } from '../../src/document/draft';
import { MATHJAX_CDN, buildExportHtml, embeddedScript, embeddedStyle, exportAssets, exportDefaults } from '../../src/document/export';
import { PREFS_STORAGE_KEY, PreferencesStore, parsePrefOverrides, sanitizePreferences } from '../../src/prefs/store';
import { DEFAULT_PREFERENCES, withDefaults } from '../../src/prefs/defaults';
import { commitNumber, fontPreviewText } from '../../src/components/PreferencesWindow';
import { renderTemplate } from '../../src/render';

class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
}
/** A storage that always fails (quota or privacy mode). */
class BrokenStorage extends MemoryStorage {
  setItem(): void {
    throw new DOMException('quota', 'QuotaExceededError');
  }
  getItem(): string | null {
    throw new DOMException('denied', 'SecurityError');
  }
}

const file = (name: string, savedText: string): DocumentInfo => ({ kind: 'file', name, savedText });
const bytes = (...b: number[]) => new Uint8Array(b);

describe('F-22 strict UTF-8 (Foundation probe: NSString initWithData:encoding:NSUTF8StringEncoding)', () => {
  const valid: [string, Uint8Array, string][] = [
    ['empty', bytes(), ''],
    ['ASCII', bytes(0x61, 0x62), 'ab'],
    ['BOM is dropped', bytes(0xef, 0xbb, 0xbf, 0x61), 'a'],
    ['only a BOM', bytes(0xef, 0xbb, 0xbf), ''],
    ['a second BOM is kept as U+FEFF', bytes(0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf, 0x61), '﻿a'],
    ['CRLF is kept', bytes(0x61, 0x0d, 0x0a, 0x62), 'a\r\nb'],
    ['lone CR is kept', bytes(0x61, 0x0d, 0x62), 'a\rb'],
    ['NUL is kept', bytes(0x61, 0x00, 0x62), 'a\u0000b'],
    ['2-byte', bytes(0xc3, 0xa9), 'é'],
    ['3-byte', bytes(0xe2, 0x82, 0xac), '€'],
    ['4-byte (astral)', bytes(0xf0, 0x9f, 0x98, 0x80), '😀'],
    ['U+10FFFF', bytes(0xf4, 0x8f, 0xbf, 0xbf), '\u{10FFFF}'],
    ['U+FFFD', bytes(0xef, 0xbf, 0xbd), '�'],
    ['U+D7FF (last before surrogates)', bytes(0xed, 0x9f, 0xbf), '퟿'],
    ['U+E000 (first after surrogates)', bytes(0xee, 0x80, 0x80), ''],
  ];
  for (const [name, b, s] of valid) it(`decodes: ${name}`, () => expect(decodeUtf8(b)).toBe(s));

  const invalid: [string, Uint8Array][] = [
    ['lone 0xFF', bytes(0x61, 0xff, 0x62)],
    ['lone continuation byte', bytes(0x80)],
    ['truncated 2-byte', bytes(0xc3)],
    ['truncated 3-byte', bytes(0xe2, 0x82)],
    ['truncated 4-byte', bytes(0xf0, 0x9f, 0x98)],
    ['overlong NUL', bytes(0xc0, 0x80)],
    ['overlong slash', bytes(0xe0, 0x80, 0xaf)],
    ['encoded surrogate D800', bytes(0xed, 0xa0, 0x80)],
    ['encoded surrogate DFFF', bytes(0xed, 0xbf, 0xbf)],
    ['above U+10FFFF', bytes(0xf4, 0x90, 0x80, 0x80)],
    ['0xF8 lead', bytes(0xf8, 0x88, 0x80, 0x80, 0x80)],
    ['UTF-16LE with BOM', bytes(0xff, 0xfe, 0x61, 0x00)],
    ['UTF-16BE with BOM', bytes(0xfe, 0xff, 0x00, 0x61)],
    ['Latin-1 é', bytes(0x63, 0x61, 0x66, 0xe9)],
    ['CESU-8 pair', bytes(0xed, 0xa0, 0xbd, 0xed, 0xb8, 0x80)],
  ];
  for (const [name, b] of invalid) it(`refuses: ${name}`, () => expect(decodeUtf8(b)).toBeNull());

  it('accepts an ArrayBuffer as well as a typed array', () => {
    expect(decodeUtf8(bytes(0x61, 0xc3, 0xa9).buffer)).toBe('aé');
  });
  it('a large buffer decodes without a stack problem', () => {
    const n = 5_000_000;
    const big = new Uint8Array(n).fill(0x61);
    expect(decodeUtf8(big)!.length).toBe(n);
  });
});

describe('F-31 / F-16 file name handling', () => {
  it('stripExtension follows stringByDeletingPathExtension for ordinary names (Foundation probe)', () => {
    for (const [n, want] of [['a.md', 'a'], ['a b.md', 'a b'], ['a.b.c', 'a.b'], ['x.MD', 'x'], ['noext', 'noext'], ['.hidden', '.hidden'], ['.md', '.md'], ['é.markdown', 'é'], ['a..md', 'a.']] as const)
      expect(stripExtension(n), n).toBe(want);
  });

  // Foundation: an "extension" is the text after the last dot only when it is non-empty and contains no space.
  // Probe: "a." -> "a.", "a.m d" -> "a.m d", "v1. final" -> "v1. final", "Notes v1.5 final" -> "Notes v1.5 final", "a.md." -> "a.md."
  it('stripExtension: a last dot that is not followed by a valid extension is not stripped (Foundation probe)', () => {
    expect(stripExtension('a.')).toBe('a.');
    expect(stripExtension('a.m d')).toBe('a.m d');
    expect(stripExtension('v1. final')).toBe('v1. final');
    expect(stripExtension('Notes v1.5 final')).toBe('Notes v1.5 final');
    expect(stripExtension('a.md.')).toBe('a.md.');
  });

  it('hasExtension is case-insensitive and needs a name before the dot', () => {
    expect(hasExtension('a.MD', 'md')).toBe(true);
    expect(hasExtension('a.md', 'MD')).toBe(true);
    expect(hasExtension('.md', 'md')).toBe(false);
    expect(hasExtension('a.markdown', 'md')).toBe(false);
    expect(hasExtension('a', 'md')).toBe(false);
  });

  it('withExtension adds the extension unless the name already ends with it (or an alternative), case-insensitively', () => {
    expect(withExtension('a', 'md', ['markdown'])).toBe('a.md');
    expect(withExtension('a.MD', 'md', ['markdown'])).toBe('a.MD');
    expect(withExtension('a.markdown', 'md', ['markdown'])).toBe('a.markdown');
    expect(withExtension('a.txt', 'md', ['markdown'])).toBe('a.txt.md');
    expect(withExtension('A.HTML', 'html')).toBe('A.HTML');
    expect(withExtension('', 'html')).toBe('.html');
    expect(withExtension('x', 'html')).toBe('x.html');
  });

  it('isMarkdownFileName: the drop and open filters', () => {
    for (const n of ['a.md', 'a.MARKDOWN', 'a.mdown', 'a.mkd', 'a.mkdn', 'a.txt', 'a.text', 'x.y.md']) expect(isMarkdownFileName(n), n).toBe(true);
    for (const n of ['a.png', 'a.jpg', 'a.pdf', 'a', 'a.md.png', 'md', '.md.bak']) expect(isMarkdownFileName(n), n).toBe(false);
  });
});

describe('F-31 presumed file name (MPDocument.m:1865-1892, NSString+Lookup.m:89-112)', () => {
  const none = UNTITLED;
  const name = (text: string, p28 = false, info: DocumentInfo = none) => presumedFileName(info, text, p28);

  it('titleString: highest level first, anywhere in the text', () => {
    expect(titleString('## b\n# a')).toBe('a');
    expect(titleString('### c\ntext\n## b')).toBe('b');
    expect(titleString('###### f')).toBe('f');
    expect(titleString('####### g')).toBeNull();
    expect(titleString('x\n=\n')).toBeNull();
    expect(titleString('#x')).toBeNull();
    expect(titleString('')).toBeNull();
  });
  it('titleString: the regex ^#\\s+(\\S.*)$ lets \\s+ span newlines, exactly as the original', () => {
    expect(titleString('#\nTitle')).toBe('Title');
    expect(titleString('#   \n\n  Title here')).toBe('Title here');
    expect(titleString('# \n')).toBeNull();
  });
  it('titleString keeps trailing spaces and inner markup; tabs separate the marker', () => {
    expect(titleString('# a  ')).toBe('a  ');
    expect(titleString('#\ta')).toBe('a');
    expect(titleString('# *a* `b`')).toBe('*a* `b`');
  });
  it('replaces / | : with - only for header titles', () => {
    expect(name('# a/b|c:d')).toBe('a-b-c-d');
    expect(name('---\ntitle: a/b|c:d\n---\n', true)).toBe('a/b|c:d');
    expect(name('x', false, file('a/b|c:d.md', 'x'))).toBe('a/b|c:d');
  });
  it('front matter title: P-28 on only, before headers; missing, non-string and empty titles', () => {
    expect(name('---\ntitle: T\n---\n# H', true)).toBe('T');
    expect(name('---\ntitle: T\n---\n# H', false)).toBe('H');
    expect(name('---\nauthor: x\n---\n# H', true)).toBe('H');
    expect(name('---\ntitle: 42\n---\n', true)).toBe('42');
    expect(name('---\ntitle: true\n---\n', true)).toBe('true');
    expect(name('---\ntitle:\n---\n# H', true)).toBe('H');
    expect(name('# H\n---\ntitle: T\n---\n', true)).toBe('H'); // not at the start of the text
    expect(name('---\n: bad: yaml: [\n---\n# H', true)).toBe('H');
  });
  it('a saved document uses its file name without extension, whatever the text says', () => {
    expect(name('# H', true, file('real.v2.md', ''))).toBe('real.v2');
    expect(name('', false, file('.hidden', ''))).toBe('.hidden');
  });
  it('Untitled when nothing is found', () => {
    expect(name('')).toBe('Untitled');
    expect(name('plain text')).toBe('Untitled');
  });
  it('suggestedSaveName: name + .md; a name that already ends in .md leaves the default "Untitled.md"; a saved document keeps its name', () => {
    expect(suggestedSaveName(none, '# Plan', false)).toBe('Plan.md');
    expect(suggestedSaveName(none, '# Plan.md', false)).toBe('Untitled.md');
    expect(suggestedSaveName(none, '# Plan.MD', false)).toBe('Untitled.md');
    expect(suggestedSaveName(none, '# Plan.markdown', false)).toBe('Plan.markdown.md');
    expect(suggestedSaveName(none, '', false)).toBe('Untitled.md');
    expect(suggestedSaveName(file('k.markdown', ''), '# Other', false)).toBe('k.markdown');
  });
  it('htmlTitle: file name without extension, empty for an untitled document (E-04)', () => {
    expect(htmlTitle(none)).toBe('');
    expect(htmlTitle(file('a.b.md', ''))).toBe('a.b');
  });
});

describe('F-34 / F-16 edited state and title', () => {
  it('untitled documents: edited iff they have text', () => {
    expect(isEdited(UNTITLED, '')).toBe(false);
    expect(isEdited(UNTITLED, ' ')).toBe(true);
  });
  it('saved documents: edited iff the text differs from the saved text, including the empty file', () => {
    expect(isEdited(file('a.md', ''), '')).toBe(false);
    expect(isEdited(file('a.md', ''), 'x')).toBe(true);
    expect(isEdited(file('a.md', 'x'), '')).toBe(true);
    expect(isEdited(file('a.md', 'x\n'), 'x')).toBe(true);
  });
  it('windowTitle: name, then " — Edited" with an em dash', () => {
    expect(windowTitle(UNTITLED, '')).toBe('Untitled');
    expect(windowTitle(UNTITLED, 'a')).toBe('Untitled — Edited');
    expect(windowTitle(file('n.md', 'a'), 'b')).toBe('n.md — Edited');
    expect(windowTitle(file('n.md', 'a'), 'a')).toBe('n.md');
    expect(windowTitle(file('n.md', 'a'), 'b')).toContain('—');
    expect(displayName(UNTITLED)).toBe('Untitled');
  });
});

describe('F-30 newline at end of file (MPDocument.m:522-538, newlineCharacterSet)', () => {
  const nl = [['', null], ['a', 1], ['a\n', null], ['a\r', null], ['a\r\n', null], ['a ', 2], ['  ', 2], ['a ', null], ['a ', null], ['a\u0085', null], ['a\u000b', null], ['a\u000c', null], ['a\t', 2], ['\n', null], ['a\n\n', null]] as const;
  for (const [t, at] of nl) it(`${JSON.stringify(t)} -> ${at === null ? 'unchanged' : 'append at ' + at}`, () => expect(newlineInsertionPoint(t)).toBe(at));
});

describe('F-29 draft storage', () => {
  it('round-trips an untitled and a file draft', () => {
    const s = new MemoryStorage();
    saveDraft(UNTITLED, 'hi', s);
    expect(loadDraft(s)).toEqual({ version: 1, kind: 'untitled', name: null, savedText: null, text: 'hi' });
    saveDraft(file('a.md', 'old'), 'new', s);
    expect(loadDraft(s)).toEqual({ version: 1, kind: 'file', name: 'a.md', savedText: 'old', text: 'new' });
    expect(draftToInfo(loadDraft(s)!)).toEqual(file('a.md', 'old'));
  });
  it('never stores a help document and keeps the previous draft', () => {
    const s = new MemoryStorage();
    saveDraft(UNTITLED, 'mine', s);
    saveDraft({ kind: 'help', name: 'help.md', savedText: 'h' }, 'help text', s);
    expect(loadDraft(s)!.text).toBe('mine');
  });
  it('unicode, newlines and large drafts survive', () => {
    const s = new MemoryStorage();
    const t = 'é😀\r\n \u0000' + 'x'.repeat(100_000);
    saveDraft(UNTITLED, t, s);
    expect(loadDraft(s)!.text).toBe(t);
  });
  const bad: [string, string | null][] = [
    ['missing', null], ['not json', '{'], ['null', 'null'], ['array', '[]'], ['string', '"x"'], ['wrong version', '{"version":2,"kind":"untitled","text":"x"}'],
    ['text not a string', '{"version":1,"kind":"untitled","text":3}'], ['unknown kind', '{"version":1,"kind":"help","name":"h","text":"x"}'],
    ['file without name', '{"version":1,"kind":"file","text":"x"}'], ['file with empty name', '{"version":1,"kind":"file","name":"","text":"x"}'],
  ];
  for (const [n, raw] of bad)
    it(`a ${n} draft counts as none`, () => {
      const s = new MemoryStorage();
      if (raw !== null) s.setItem(DRAFT_KEY, raw);
      expect(loadDraft(s)).toBeNull();
    });
  it('an untitled draft ignores a stray name and saved text', () => {
    const s = new MemoryStorage();
    s.setItem(DRAFT_KEY, '{"version":1,"kind":"untitled","name":"x.md","savedText":"s","text":"t"}');
    expect(loadDraft(s)).toEqual({ version: 1, kind: 'untitled', name: null, savedText: null, text: 't' });
  });
  it('a failing storage never throws', () => {
    const b = new BrokenStorage();
    expect(() => saveDraft(UNTITLED, 'x', b)).not.toThrow();
    expect(loadDraft(b)).toBeNull();
    expect(detectFreshInstall(b)).toBe(false);
    expect(loadSplitRatio('a.md', b)).toBeNull();
    expect(() => saveSplitRatio('a.md', 0.4, b)).not.toThrow();
    expect(loadDraft(null)).toBeNull();
  });
});

describe('F-155 first launch and F-16 split ratios', () => {
  it('only the first visit is fresh, and it records the version', () => {
    const s = new MemoryStorage();
    expect(detectFreshInstall(s)).toBe(true);
    expect(s.getItem(FIRST_VERSION_KEY)).toBe('0.7.3');
    expect(detectFreshInstall(s)).toBe(false);
  });
  it('split ratios are per name and validated', () => {
    const s = new MemoryStorage();
    expect(loadSplitRatio('a.md', s)).toBeNull();
    saveSplitRatio('a.md', 0.25, s);
    saveSplitRatio('b.md', 0.75, s);
    expect(loadSplitRatio('a.md', s)).toBe(0.25);
    expect(loadSplitRatio('b.md', s)).toBe(0.75);
    expect(loadSplitRatio('c.md', s)).toBeNull();
    s.setItem(SPLIT_RATIOS_KEY, JSON.stringify({ 'a.md': 2, 'b.md': -1, 'c.md': 'x', 'd.md': 0, 'e.md': 1 }));
    expect([loadSplitRatio('a.md', s), loadSplitRatio('b.md', s), loadSplitRatio('c.md', s), loadSplitRatio('d.md', s), loadSplitRatio('e.md', s)]).toEqual([null, null, null, 0, 1]);
    s.setItem(SPLIT_RATIOS_KEY, '{');
    expect(loadSplitRatio('a.md', s)).toBeNull();
    expect(() => saveSplitRatio('a.md', 0.5, s)).not.toThrow();
  });
  it('a document called __proto__ or constructor does not break the ratio map', () => {
    const s = new MemoryStorage();
    saveSplitRatio('__proto__', 0.3, s);
    saveSplitRatio('constructor', 0.6, s);
    expect(loadSplitRatio('constructor', s)).toBe(0.6);
    expect(loadSplitRatio('toString', s)).toBeNull();
  });
});

describe('F-141 preferences store', () => {
  it('sanitizePreferences keeps only known, correctly typed keys', () => {
    expect(sanitizePreferences(null)).toEqual({});
    expect(sanitizePreferences([])).toEqual({});
    expect(sanitizePreferences('x')).toEqual({});
    expect(sanitizePreferences({ extensionAutolink: true, bogus: 1, editorLineSpacing: '7', editorHorizontalInset: 7 })).toEqual({ extensionAutolink: true, editorHorizontalInset: 7 });
    expect(sanitizePreferences({ editorBaseFontInfo: { name: 'X', size: 12 } })).toEqual({ editorBaseFontInfo: { name: 'X', size: 12 } });
    expect(sanitizePreferences({ editorBaseFontInfo: { name: 'X', size: 0 } })).toEqual({});
    expect(sanitizePreferences({ editorBaseFontInfo: { name: 3, size: 12 } })).toEqual({});
    expect(sanitizePreferences({ editorBaseFontInfo: null })).toEqual({});
    expect(sanitizePreferences({ toolbarItemIdentifiers: null })).toEqual({ toolbarItemIdentifiers: null });
    expect(sanitizePreferences({ toolbarItemIdentifiers: [] })).toEqual({ toolbarItemIdentifiers: [] });
    expect(sanitizePreferences({ toolbarItemIdentifiers: ['bold', 3] })).toEqual({});
    expect(sanitizePreferences({ toolbarItemIdentifiers: 'bold' })).toEqual({});
    expect(sanitizePreferences({ __proto__: { extensionAutolink: true } })).toEqual({});
  });

  it('persists only the keys that were set, removes the entry when nothing is left, and never writes URL overrides', () => {
    const s = new MemoryStorage();
    const p = new PreferencesStore({}, { storage: s, overrides: { extensionUnderline: true } });
    expect(p.get().extensionUnderline).toBe(true);
    expect(s.getItem(PREFS_STORAGE_KEY)).toBeNull();
    p.set({ extensionAutolink: true });
    expect(JSON.parse(s.getItem(PREFS_STORAGE_KEY)!)).toEqual({ extensionAutolink: true });
    p.reset();
    expect(s.getItem(PREFS_STORAGE_KEY)).toBeNull();
    expect(p.get().extensionUnderline).toBe(false);
  });
  it('an explicit set of an overridden key replaces the override even when the value is the same', () => {
    const s = new MemoryStorage();
    const p = new PreferencesStore({}, { storage: s, overrides: { extensionAutolink: true } });
    p.set({ extensionAutolink: true });
    expect(JSON.parse(s.getItem(PREFS_STORAGE_KEY) ?? '{}')).toEqual({}); // no change from the effective value: nothing is written
    p.set({ extensionAutolink: false });
    expect(JSON.parse(s.getItem(PREFS_STORAGE_KEY)!)).toEqual({ extensionAutolink: false });
    expect(p.get().extensionAutolink).toBe(false);
  });
  it('a stored value beats the default, a URL override beats the stored value', () => {
    const s = new MemoryStorage();
    s.setItem(PREFS_STORAGE_KEY, JSON.stringify({ editorLineSpacing: 9, extensionAutolink: true }));
    const p = new PreferencesStore({}, { storage: s, overrides: { editorLineSpacing: 4 } });
    expect(p.get().editorLineSpacing).toBe(4);
    expect(p.get().extensionAutolink).toBe(true);
    expect(p.persisted()).toEqual({ editorLineSpacing: 9, extensionAutolink: true });
  });
  it('notifies on change only, and reload() picks up another tab\'s write', () => {
    const s = new MemoryStorage();
    const p = new PreferencesStore({}, { storage: s });
    let n = 0;
    p.subscribe(() => n++);
    p.set({ extensionAutolink: false }); // equals the default: no notification
    expect(n).toBe(0);
    p.set({ extensionAutolink: true });
    expect(n).toBe(1);
    s.setItem(PREFS_STORAGE_KEY, JSON.stringify({ extensionUnderline: true }));
    p.reload();
    expect(n).toBe(2);
    expect(p.get().extensionUnderline).toBe(true);
    expect(p.get().extensionAutolink).toBe(false);
    p.reload();
    expect(n).toBe(2);
  });
  it('a broken storage keeps the store working in memory', () => {
    const p = new PreferencesStore({}, { storage: new BrokenStorage() });
    expect(() => p.set({ extensionAutolink: true })).not.toThrow();
    expect(p.get().extensionAutolink).toBe(true);
  });
  it('the defaults of section 8 for the keys the M5 window edits', () => {
    const d = DEFAULT_PREFERENCES;
    expect([d.markdownManualRender, d.supressesUntitledDocumentOnLaunch, d.editorOnRight, d.editorSyncScrolling, d.editorShowWordCount]).toEqual([false, false, false, true, false]);
    expect([d.extensionTables, d.extensionFencedCode, d.extensionFootnotes, d.extensionIntraEmphasis, d.extensionAutolink, d.extensionSmartyPants]).toEqual([true, true, true, true, false, false]);
    expect([d.htmlStyleName, d.htmlHighlightingThemeName, d.htmlCodeBlockAccessory, d.htmlDefaultDirectoryUrl, d.htmlTemplateName]).toEqual(['GitHub2', '', 0, '~', 'Default']);
    expect([d.editorStyleName, d.editorLineSpacing, d.editorHorizontalInset, d.editorVerticalInset, d.editorMaximumWidth, d.editorUnorderedListMarkerType]).toEqual(['Tomorrow+', 3, 15, 30, 1000, 0]);
    expect(d.editorBaseFontInfo).toEqual({ name: 'Menlo-Regular', size: 14 });
    expect([d.editorInsertPrefixInBlock, d.editorAutoIncrementNumberedLists, d.editorEnsuresNewlineAtEndOfFile, d.editorScrollsPastEnd, d.editorSmartHome, d.editorConvertTabs, d.editorCompleteMatchingCharacters]).toEqual([true, true, false, false, false, false, false]);
  });
  it('parsePrefOverrides: JSON values, plain strings, the empty string, objects, null; unknown keys and other parameters ignored', () => {
    const o = parsePrefOverrides('?pref.editorLineSpacing=5&pref.htmlStyleName=Clearness&pref.editorStyleName=%22%22&pref.editorBaseFontInfo=%7B%22name%22%3A%22X%22%2C%22size%22%3A18%7D&pref.toolbarItemIdentifiers=null&pref.bogus=1&other=2&pref.extensionAutolink=true');
    expect(o).toEqual({ editorLineSpacing: 5, htmlStyleName: 'Clearness', editorStyleName: '', editorBaseFontInfo: { name: 'X', size: 18 }, toolbarItemIdentifiers: null, extensionAutolink: true });
    expect(parsePrefOverrides('')).toEqual({});
  });
});

describe('F-140 preferences window helpers', () => {
  it('commitNumber: empty is 0 (clamped), values are rounded to integers and clamped to the stepper range', () => {
    expect(commitNumber('', 0, 100)).toBe(0);
    expect(commitNumber('   ', 0, 35)).toBe(0);
    expect(commitNumber('', 300, 10000)).toBe(300);
    expect(commitNumber('50', 0, 100)).toBe(50);
    expect(commitNumber('101', 0, 100)).toBe(100);
    expect(commitNumber('-5', 0, 100)).toBe(0);
    expect(commitNumber('299', 300, 10000)).toBe(300);
    expect(commitNumber('10001', 300, 10000)).toBe(10000);
    expect(commitNumber('12.4', 0, 100)).toBe(12);
    expect(commitNumber('12.5', 0, 100)).toBe(13);
    expect(commitNumber(' 7 ', 0, 100)).toBe(7);
    expect(commitNumber('1e2', 0, 1000)).toBe(100);
    expect(commitNumber('abc', 0, 100)).toBe(0);
    expect(commitNumber('Infinity', 5, 100)).toBe(5);
    expect(commitNumber('-0', 0, 100)).toBe(0);
    expect(Object.is(commitNumber('-0', 0, 100), -0)).toBe(false);
  });
  it('fontPreviewText is "%@ - %.1lf" with dashes shown as spaces', () => {
    expect(fontPreviewText({ name: 'Menlo-Regular', size: 14 })).toBe('Menlo Regular - 14.0');
    expect(fontPreviewText({ name: 'Courier New-Regular', size: 12.5 })).toBe('Courier New Regular - 12.5');
    expect(fontPreviewText({ name: 'Monaco', size: 9 })).toBe('Monaco - 9.0');
    expect(fontPreviewText({ name: 'A-B-C', size: 288 })).toBe('A B C - 288.0');
  });
});

describe('F-35 export HTML (MPRenderer.m:660-702, MPAsset.m:69-191)', () => {
  const p = (o: Parameters<typeof withDefaults>[0] = {}) => withDefaults(o);
  const ids = (a: ReturnType<typeof exportAssets>) => a.map((x) => x.id);

  it('exportDefaults: Include styles unless "no style"; highlighting follows P-20', () => {
    expect(exportDefaults(p())).toEqual({ styles: true, highlighting: false });
    expect(exportDefaults(p({ htmlStyleName: '' }))).toEqual({ styles: false, highlighting: false });
    expect(exportDefaults(p({ htmlSyntaxHighlighting: true }))).toEqual({ styles: true, highlighting: true });
  });
  it('neither box and no MathJax: no assets', () => {
    expect(exportAssets(p({ htmlMermaid: true, htmlGraphviz: true, htmlTaskList: true, htmlCodeBlockAccessory: 2 }), ['javascript'], { styles: false, highlighting: false })).toEqual([]);
  });
  it('styles only: one base style, nothing else, even with Custom accessory (show-information.css is never exported)', () => {
    const a = exportAssets(p({ htmlCodeBlockAccessory: 2, htmlTaskList: true }), [], { styles: true, highlighting: false });
    expect(ids(a)).toEqual(['style:GitHub2']);
  });
  it('the empty style exports no base style even when the box is checked', () => {
    expect(exportAssets(p({ htmlStyleName: '' }), [], { styles: true, highlighting: false })).toEqual([]);
  });
  it('an unknown style name exports nothing (a missing file)', () => {
    expect(exportAssets(p({ htmlStyleName: 'Nope' }), [], { styles: true, highlighting: false })).toEqual([]);
  });
  it('highlighting without styles: Prism CSS, core, languages; independent of P-20', () => {
    for (const p20 of [false, true]) {
      const a = exportAssets(p({ htmlSyntaxHighlighting: p20 }), ['javascript'], { styles: false, highlighting: true });
      expect(ids(a)[0]).toMatch(/^prism-theme:/);
      expect(ids(a)).toContain('prism-core');
      expect(ids(a).some((x) => x.startsWith('style:'))).toBe(false);
    }
  });
  it('Mermaid needs its preference and the box; Graphviz likewise; both never without the box', () => {
    const on = p({ htmlMermaid: true, htmlGraphviz: true });
    expect(ids(exportAssets(on, [], { styles: true, highlighting: false }))).toEqual(['style:GitHub2']);
    const a = ids(exportAssets(on, [], { styles: false, highlighting: true }));
    expect(a).toContain('mermaid');
    expect(a).toContain('viz');
    expect(ids(exportAssets(p({ htmlMermaid: true }), [], { styles: false, highlighting: true }))).not.toContain('viz');
    expect(ids(exportAssets(p({ htmlGraphviz: true }), [], { styles: false, highlighting: true }))).not.toContain('mermaid');
  });
  it('MathJax: config first, then the CDN link; present with neither box; absent with P-18 off', () => {
    const a = exportAssets(p({ htmlMathJax: true }), [], { styles: false, highlighting: false });
    expect(a).toEqual([
      { kind: 'script', id: 'mathjax-config', path: 'mathjax/init.js', type: 'text/x-mathjax-config' },
      { kind: 'script-link', id: 'mathjax', url: MATHJAX_CDN },
    ]);
    expect(MATHJAX_CDN).toBe('https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.3/MathJax.js?config=TeX-AMS-MML_HTMLorMML');
    expect(exportAssets(p(), [], { styles: true, highlighting: true }).some((x) => x.id.startsWith('mathjax'))).toBe(false);
  });
  it('plugins: line numbers and show-language add CSS and JS after the theme / core; Custom adds nothing', () => {
    const a = ids(exportAssets(p({ htmlLineNumbers: true, htmlCodeBlockAccessory: 1 }), [], { styles: false, highlighting: true }));
    expect(a.slice(0, 3)).toEqual(['prism-theme:prism.css', 'prism-plugin:line-numbers', 'prism-plugin:show-language']);
    expect(a.slice(3)).toEqual(['prism-core', 'prism-plugin:line-numbers', 'prism-plugin:show-language']);
    expect(ids(exportAssets(p({ htmlCodeBlockAccessory: 2 }), [], { styles: false, highlighting: true }))).toEqual(['prism-theme:prism.css', 'prism-core']);
  });
  it('the Prism theme name picks its file; an unknown name falls back to prism.css', () => {
    const t = (n: string) => ids(exportAssets(p({ htmlHighlightingThemeName: n }), [], { styles: false, highlighting: true }))[0];
    expect(t('')).toBe('prism-theme:prism.css');
    expect(t('Okaidia')).toBe('prism-theme:prism-okaidia.css');
    expect(t('Solarizedlight')).toBe('prism-theme:prism-solarizedlight.css');
    expect(t('Nope')).toBe('prism-theme:prism.css');
  });

  it('embedded tags drop exactly one trailing newline', () => {
    expect(embeddedStyle('a{}\n')).toBe('<style type="text/css">\na{}\n</style>');
    expect(embeddedStyle('a{}\n\n')).toBe('<style type="text/css">\na{}\n\n</style>');
    expect(embeddedStyle('a{}')).toBe('<style type="text/css">\na{}\n</style>');
    expect(embeddedScript('x()\n')).toBe('<script type="text/javascript">\nx()\n</script>');
    expect(embeddedScript('c', 'text/x-mathjax-config')).toBe('<script type="text/x-mathjax-config">\nc\n</script>');
    expect(embeddedStyle('')).toBe('<style type="text/css">\n\n</style>');
  });

  it('buildExportHtml asks the loader for each script once, in order, and writes them inline; a loader failure rejects', async () => {
    const asked: string[] = [];
    const html = await buildExportHtml(
      '```js\nx\n```\n\n$$a$$',
      p({ htmlMathJax: true, htmlLineNumbers: true }),
      { styles: true, highlighting: true, title: '' },
      async (path) => {
        asked.push(path);
        return `/* ${path} */\n`;
      },
    );
    expect(asked[0]).toBe('prism/components/prism-core.min.js');
    expect(asked.filter((a) => a.includes('prism-clike')).length).toBe(1);
    expect(asked.indexOf('prism/components/prism-clike.min.js')).toBeLessThan(asked.indexOf('prism/components/prism-javascript.min.js'));
    expect(asked.at(-1)).toBe('mathjax/init.js');
    expect(html).toContain('<script type="text/x-mathjax-config">\n/* mathjax/init.js */\n</script>');
    expect(html).toContain(`<script type="text/javascript" src="${MATHJAX_CDN}"></script>`);
    await expect(buildExportHtml('x', p({ htmlSyntaxHighlighting: true }), { styles: false, highlighting: true, title: '' }, async () => Promise.reject(new Error('404')))).rejects.toThrow('404');
  });

  it('the template: title escaped, absent when empty, one body, scripts after the body text', () => {
    expect(renderTemplate({ title: 'a<b>&"c"', styleTags: [], body: 'B', scriptTags: [] })).toContain('<title>a&lt;b&gt;&amp;&quot;c&quot;</title>');
    expect(renderTemplate({ title: '', styleTags: [], body: 'B', scriptTags: [] })).not.toContain('<title>');
    const html = renderTemplate({ title: 't', styleTags: ['<style>x</style>'], body: 'BODY', scriptTags: ['<script>y</script>'] });
    expect(html.indexOf('<style>')).toBeLessThan(html.indexOf('BODY'));
    expect(html.indexOf('BODY')).toBeLessThan(html.indexOf('<script>'));
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html.endsWith('</html>\n')).toBe(true);
  });
});

describe('F-22 picker aborts', () => {
  it('isAbort recognises AbortError as DOMException or plain object only', () => {
    expect(isAbort(new DOMException('x', 'AbortError'))).toBe(true);
    expect(isAbort({ name: 'AbortError' })).toBe(true);
    expect(isAbort(new DOMException('x', 'NotAllowedError'))).toBe(false);
    expect(isAbort(new Error('AbortError'))).toBe(false);
    expect(isAbort(null)).toBe(false);
    expect(isAbort(undefined)).toBe(false);
  });
});
