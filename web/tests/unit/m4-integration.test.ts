/**
 * M4 integration: the CodeMirror wrappers (commands.ts), the editor setup
 * (setup.ts), the editor themes (themes.ts, spec §7.2) and the toolbar
 * model (Toolbar.tsx, spec §4), on a real EditorView in jsdom.
 * The pure text rules are in m4-editor.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { Compartment, EditorSelection, Prec, StateEffect } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { defaultKeymap, historyKeymap } from '@codemirror/commands';
import { searchKeymap, getSearchQuery } from '@codemirror/search';
import { withDefaults, type MacDownPreferences } from '../../src/prefs/defaults';
import { parsePrefOverrides } from '../../src/prefs/store';
import {
  createEditorState,
  editorAppearance,
  fontFamilyFor,
  horizontalInset,
  macDownKeymap,
  scrollPastEndExtra,
  REMOVED_BINDINGS,
} from '../../src/editor/setup';
import {
  deleteSelection,
  jumpToSelection,
  runFormatCommand,
  transformCommand,
  useSelectionForFind,
  type FormatCommandId,
} from '../../src/editor/commands';
import { DEFAULT_THEME, ELEMENT_NAMES, THEME_NAMES, THEME_SOURCES, buildTheme, hsb, parseStyleSheet } from '../../src/editor/themes';
import { DEFAULT_TOOLBAR_ITEMS, FLEXIBLE_SPACE, TOOLBAR_ITEMS, toolbarItemsFor } from '../../src/components/Toolbar';

let views: EditorView[] = [];
afterEach(() => {
  views.forEach((v) => v.destroy());
  views = [];
});

/** Creates an editor with `doc` (`|` = cursor, `[`…`]` = selection). */
function editor(marked: string, overrides: Partial<MacDownPreferences> = {}): EditorView {
  let doc = marked;
  let from: number;
  let to: number;
  const cur = marked.indexOf('|');
  if (cur >= 0) {
    doc = marked.slice(0, cur) + marked.slice(cur + 1);
    from = to = cur;
  } else {
    const a = marked.indexOf('[');
    const b = marked.indexOf(']', a);
    doc = marked.slice(0, a) + marked.slice(a + 1, b) + marked.slice(b + 1);
    from = a;
    to = b - 1;
  }
  const prefs = withDefaults(overrides);
  const state = createEditorState(doc, prefs, { onDocChanged: () => undefined }, {
    appearance: new Compartment(),
    behaviour: new Compartment(),
    editable: new Compartment(),
  });
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({ state, parent });
  view.dispatch({ selection: EditorSelection.single(from, to) });
  views.push(view);
  return view;
}

/** Document with the selection marked like the input. */
function shown(view: EditorView): string {
  const doc = view.state.doc.toString();
  const { from, to } = view.state.selection.main;
  if (from === to) return doc.slice(0, from) + '|' + doc.slice(from);
  return doc.slice(0, from) + '[' + doc.slice(from, to) + ']' + doc.slice(to);
}

/** Runs the editor keymaps for a key (jsdom is not a Mac, so Mod = Ctrl). */
function press(view: EditorView, key: string, mods: { shift?: boolean; ctrl?: boolean } = {}): boolean {
  const e = new KeyboardEvent('keydown', { key, shiftKey: !!mods.shift, ctrlKey: !!mods.ctrl, bubbles: true, cancelable: true });
  return runScopeHandlers(view, e, 'editor');
}

/** Runs the input handlers as typing would (auto-pairing, F-62 to F-64). */
function typeChar(view: EditorView, ch: string): void {
  const { from, to } = view.state.selection.main;
  const handled = view.state
    .facet(EditorView.inputHandler)
    .some((h) => h(view, from, to, ch, () => view.state.update({ changes: { from, to, insert: ch } })));
  if (!handled) view.dispatch({ changes: { from, to, insert: ch }, selection: EditorSelection.cursor(from + ch.length) });
}

const fmt = async (marked: string, id: FormatCommandId, overrides: Partial<MacDownPreferences> = {}, clipboard: string | null = null) => {
  const v = editor(marked, overrides);
  await runFormatCommand(v, id, async () => clipboard);
  return shown(v);
};

describe('Format menu commands on the editor (F-40 to F-61)', () => {
  it('F-40 to F-46 inline toggles keep the inner text selected', async () => {
    expect(await fmt('[a]', 'strong')).toBe('**[a]**');
    expect(await fmt('**[a]**', 'strong')).toBe('[a]');
    expect(await fmt('[a]', 'emphasize')).toBe('*[a]*');
    expect(await fmt('**[a]**', 'emphasize')).toBe('***[a]***'); // F-41 bold is not broken
    expect(await fmt('[a]', 'underline')).toBe('_[a]_');
    expect(await fmt('[a]', 'strikethrough')).toBe('~~[a]~~');
    expect(await fmt('[a]', 'highlight')).toBe('==[a]==');
    expect(await fmt('[a]', 'inline-code')).toBe('`[a]`');
    expect(await fmt('[a]', 'comment')).toBe('<!--[a]-->');
    expect(await fmt('x|y', 'strong')).toBe('x**|**y');
  });
  it('F-47 to F-53 headers and paragraph', async () => {
    for (let n = 1; n <= 6; n++) expect(await fmt('ti|tle', `header-${n}` as FormatCommandId)).toBe('#'.repeat(n) + ' ti|tle');
    expect(await fmt('## ti|tle', 'paragraph')).toBe('ti|tle');
  });
  it('F-54 ordered list (U-05 deviation), F-55 unordered list with P-45, F-56 blockquote', async () => {
    expect(await fmt('[a\nb]', 'ordered-list')).toBe('1. [a\n1. b]');
    expect(await fmt('[1. a\n1. b]', 'ordered-list')).toBe('[a\nb]');
    expect(await fmt('[a\nb]', 'unordered-list')).toBe('* [a\n* b]');
    expect(await fmt('[a\nb]', 'unordered-list', { editorUnorderedListMarkerType: 1 })).toBe('+ [a\n+ b]');
    expect(await fmt('[a\nb]', 'unordered-list', { editorUnorderedListMarkerType: 2 })).toBe('- [a\n- b]');
    expect(await fmt('[a\nb]', 'blockquote')).toBe('> [a\n> b]');
    expect(await fmt('> [a\n> b]', 'blockquote')).toBe('[a\nb]');
  });
  it('F-57 / F-58 shift right (tab, or 4 spaces with P-37) and shift left', async () => {
    expect(await fmt('[a\nb]', 'shift-right')).toBe('\t[a\n\tb]');
    expect(await fmt('[a\nb]', 'shift-right', { editorConvertTabs: true })).toBe('    [a\n    b]');
    expect(await fmt('    [a\n\tb]', 'shift-left')).toBe('[a\nb]');
  });
  it('F-59 / F-60 link and image read the clipboard (http, https, file only)', async () => {
    expect(await fmt('[t]', 'link')).toBe('[t](|)');
    expect(await fmt('[t]', 'link', {}, 'https://x.org')).toBe('[t]([https://x.org])');
    expect(await fmt('[t]', 'link', {}, 'FILE:///tmp/a')).toBe('[t]([FILE:///tmp/a])');
    expect(await fmt('[t]', 'link', {}, 'mailto:a@b.c')).toBe('[t](|)');
    expect(await fmt('[t]', 'link', {}, 'not a url')).toBe('[t](|)');
    expect(await fmt('[t]', 'image', {}, 'http://x/i.png')).toBe('![t]([http://x/i.png])');
    // Removal: the selection is directly surrounded by `[` and `]()`; the clipboard is not used.
    const v = editor('|');
    v.dispatch({ changes: { from: 0, insert: '[t]()' }, selection: EditorSelection.single(1, 2) });
    await runFormatCommand(v, 'link', async () => 'https://x.org');
    expect(shown(v)).toBe('[t]');
  });
  it('F-61 New Paragraph inserts two newlines at the cursor', async () => {
    expect(await fmt('ab|cd', 'new-paragraph')).toBe('ab\n\n|cd');
    expect(await fmt('a\n|\nb', 'new-paragraph')).toBe('a\n\n|\nb');
  });
  it('each command is one undo step', async () => {
    const v = editor('[a]');
    await runFormatCommand(v, 'strong');
    expect(v.state.doc.toString()).toBe('**a**');
    expect(press(v, 'z', { ctrl: true })).toBe(true);
    expect(v.state.doc.toString()).toBe('a');
  });
  it('commands do nothing while the editor is not editable (collapsed pane)', async () => {
    const v = editor('[a]');
    v.dispatch({ effects: StateEffect.appendConfig.of(Prec.highest(EditorView.editable.of(false))) });
    expect(await runFormatCommand(v, 'strong')).toBe(false);
    expect(await runFormatCommand(v, 'link', async () => 'https://x')).toBe(false);
    expect(v.state.doc.toString()).toBe('a');
  });
});

describe('Editor behaviours through the keymap (§5)', () => {
  it('F-66 / F-67 / F-68 Return continues lists and quotes; E8 empty item ends the list', () => {
    let v = editor('* item|');
    press(v, 'Enter');
    expect(shown(v)).toBe('* item\n* |');
    press(v, 'Enter');
    expect(shown(v)).toBe('* item\n\n|');
    v = editor('3. a|');
    press(v, 'Enter');
    expect(shown(v)).toBe('3. a\n4. |');
    v = editor('3. a|', { editorAutoIncrementNumberedLists: false });
    press(v, 'Enter');
    expect(shown(v)).toBe('3. a\n3. |');
    v = editor('> |');
    press(v, 'Enter');
    expect(shown(v)).toBe('> \n> |'); // E19
  });
  it('F-69 indentation is continued even with P-38 off; P-38 off stops list continuation', () => {
    let v = editor('  ab|', { editorInsertPrefixInBlock: false });
    press(v, 'Enter');
    expect(shown(v)).toBe('  ab\n  |');
    v = editor('* a|', { editorInsertPrefixInBlock: false });
    press(v, 'Enter');
    expect(shown(v)).toBe('* a\n|');
  });
  it('Return with plain text inserts a plain newline (no CodeMirror auto-indent)', () => {
    const v = editor('# h|');
    press(v, 'Enter');
    expect(shown(v)).toBe('# h\n|');
  });
  it('F-70 Tab: tab character, spaces to the next stop with P-37, indent with a selection', () => {
    let v = editor('ab|');
    press(v, 'Tab');
    expect(shown(v)).toBe('ab\t|');
    v = editor('ab|', { editorConvertTabs: true });
    press(v, 'Tab');
    expect(shown(v)).toBe('ab  |'); // E10
    v = editor('[a\nb]');
    press(v, 'Tab');
    expect(shown(v)).toBe('\t[a\n\tb]'); // E14
  });
  it('F-71 Shift+Tab unindents with or without a selection', () => {
    const v = editor('  \tx|');
    press(v, 'Tab', { shift: true });
    expect(shown(v)).toBe('x|'); // E23
  });
  it('F-65 / F-72 Backspace: pair deletion with P-36, soft tab with P-37, else default', () => {
    let v = editor('(|)', { editorCompleteMatchingCharacters: true });
    press(v, 'Backspace');
    expect(shown(v)).toBe('|');
    v = editor('(|)');
    press(v, 'Backspace');
    expect(shown(v)).toBe('|)'); // P-36 off: normal Backspace
    v = editor('      |', { editorConvertTabs: true });
    press(v, 'Backspace');
    expect(shown(v)).toBe('    |');
  });
  it('F-62 to F-64 auto-pairing only with P-36 (default off)', () => {
    let v = editor('|');
    typeChar(v, '(');
    expect(shown(v)).toBe('(|');
    v = editor('|', { editorCompleteMatchingCharacters: true });
    typeChar(v, '(');
    expect(shown(v)).toBe('(|)'); // E1
    typeChar(v, ')');
    expect(shown(v)).toBe('()|'); // E2
    v = editor('don|', { editorCompleteMatchingCharacters: true });
    typeChar(v, "'");
    expect(shown(v)).toBe("don'|"); // E15
    v = editor('[word]', { editorCompleteMatchingCharacters: true });
    typeChar(v, '*');
    expect(shown(v)).toBe('*[word]*'); // E4
    v = editor('[w]', { editorCompleteMatchingCharacters: true });
    typeChar(v, '~');
    expect(shown(v)).toBe('~|'); // ~ wraps only with P-10
    v = editor('[w]', { editorCompleteMatchingCharacters: true, extensionStrikethough: true });
    typeChar(v, '~');
    expect(shown(v)).toBe('~[w]~');
  });
  // F-73 needs layout (visual rows), so it is covered in tests/e2e/m4-editing.spec.ts.
  it('MacDown key equivalents do not fall through to CodeMirror commands', () => {
    const v = editor('a|b');
    for (const key of ['u', 'i', '[', ']', '/', 'Enter']) expect(press(v, key, { ctrl: true })).toBe(false);
    expect(press(v, 'k', { ctrl: true, shift: true })).toBe(false);
    expect(shown(v)).toBe('a|b');
  });
});

describe('macDownKeymap', () => {
  it('removes every listed binding, keeps the others', () => {
    const all = [...defaultKeymap, ...historyKeymap, ...searchKeymap];
    const kept = macDownKeymap(all);
    const keys = kept.flatMap((b) => [b.key, b.mac, b.win, b.linux]).filter(Boolean);
    for (const k of REMOVED_BINDINGS) expect(keys).not.toContain(k);
    expect(keys).toContain('Mod-z');
    expect(keys).toContain('Mod-f');
    expect(keys).toContain('Mod-g');
  });
  it('splits a binding whose Mac key is removed but whose generic key is kept', () => {
    const out = macDownKeymap([{ key: 'Alt-x', mac: 'Mod-u', run: () => true }]);
    expect(out).toHaveLength(1);
    expect(out[0].mac).toBeUndefined();
    expect(out[0].win).toBe('Alt-x');
    expect(out[0].linux).toBe('Alt-x');
  });
});

describe('Edit menu helpers (F-86, F-92, F-93, F-105 to F-107)', () => {
  it('F-86 Delete removes the selection, nothing with an empty selection', () => {
    let v = editor('a[bc]d');
    expect(deleteSelection(v)).toBe(true);
    expect(shown(v)).toBe('a|d');
    v = editor('a|b');
    expect(deleteSelection(v)).toBe(false);
  });
  it('F-92 Use Selection for Find sets the search string', () => {
    const v = editor('x [needle] y');
    expect(useSelectionForFind(v)).toBe(true);
    expect(getSearchQuery(v.state).search).toBe('needle');
  });
  it('F-93 Jump to Selection does not change the text or the selection', () => {
    const v = editor('a[b]c');
    expect(jumpToSelection(v)).toBe(true);
    expect(shown(v)).toBe('a[b]c');
  });
  it('F-105 to F-107 transformations', () => {
    const v = editor('[hello wORLD]');
    transformCommand(v, 'upper');
    expect(shown(v)).toBe('[HELLO WORLD]');
    transformCommand(v, 'capitalize');
    expect(shown(v)).toBe('[Hello World]');
    transformCommand(v, 'lower');
    expect(shown(v)).toBe('[hello world]');
  });
});

describe('§8.4 appearance (F-75 to F-79, P-46)', () => {
  it('F-78 the inset becomes (width − max) × 0.45 when wider than 2 × inset + max', () => {
    expect(horizontalInset(1400, 15, true, 1000)).toBeCloseTo(180);
    expect(horizontalInset(1030, 15, true, 1000)).toBe(15); // not wider than 2×15+1000
    expect(horizontalInset(1031, 15, true, 1000)).toBeCloseTo(13.95);
    expect(horizontalInset(1400, 15, false, 1000)).toBe(15);
  });
  it('F-79 scroll-past-end padding formula', () => {
    expect(scrollPastEndExtra(2000, 600, 0, 30)).toBe(540);
    expect(scrollPastEndExtra(300, 600, 20, 30)).toBe(220);
    expect(scrollPastEndExtra(50, 600, 0, 30)).toBe(0);
  });
  it('F-75 font family from the PostScript name', () => {
    expect(fontFamilyFor('Menlo-Regular')).toMatch(/^"Menlo",/);
    expect(fontFamilyFor('Courier-New')).toMatch(/^"Courier New",/);
  });
  it('P-46 spell check attribute follows the preference (default off)', () => {
    let v = editor('a|');
    expect(v.contentDOM.getAttribute('spellcheck')).toBe('false');
    v = editor('a|', { editorContinuousSpellCheckingEnabled: true });
    expect(v.contentDOM.getAttribute('spellcheck')).toBe('true');
  });
  it('F-74 a theme with errors is reported to the caller', () => {
    const a = editorAppearance(withDefaults());
    expect(a.themeErrors).toEqual([]);
    expect(a.background).toBe('#2d2d2d');
  });
});

describe('Editor themes (§7.2, F-74, F-166)', () => {
  const expected = [
    'Mou Fresh Air', 'Mou Fresh Air+', 'Mou Night', 'Mou Night+', 'Mou Paper', 'Mou Paper+',
    'Solarized (Dark)', 'Solarized (Dark)+', 'Solarized (Light)', 'Solarized (Light)+',
    'Tomorrow', 'Tomorrow Blue', 'Tomorrow+', 'Writer', 'Writer+',
  ];
  it('all 15 bundled themes are listed, default Tomorrow+', () => {
    expect([...THEME_NAMES].sort()).toEqual([...expected].sort());
    expect(DEFAULT_THEME).toBe('Tomorrow+');
    expect(withDefaults().editorStyleName).toBe('Tomorrow+');
  });
  it.each(expected)('%s parses without errors and has editor colours', (name) => {
    const sheet = parseStyleSheet(THEME_SOURCES[name]);
    expect(sheet.errors).toEqual([]);
    expect(sheet.editor?.background).toMatch(/^#[0-9a-f]{6}$|^rgba/);
    expect(sheet.elements.length).toBeGreaterThan(10);
    for (const e of sheet.elements) expect(ELEMENT_NAMES).toContain(e.name);
  });
  it('the + variants add header sizes H1 24 … H6 11', () => {
    for (const name of expected.filter((n) => n.endsWith('+'))) {
      const sizes = parseStyleSheet(THEME_SOURCES[name]).elements.filter((e) => /^H[1-6]$/.test(e.name)).map((e) => [e.name, e.attrs.fontSize?.size]);
      expect(Object.fromEntries(sizes)).toEqual({ H1: 24, H2: 20, H3: 17, H4: 15, H5: 13, H6: 11 });
    }
    expect(parseStyleSheet(THEME_SOURCES['Tomorrow']).elements.some((e) => e.attrs.fontSize)).toBe(false);
  });
  it('Tomorrow+ colours (from the .style file)', () => {
    const s = parseStyleSheet(THEME_SOURCES['Tomorrow+']);
    expect(s.editor).toMatchObject({ foreground: '#cccccc', background: '#2d2d2d', caret: '#cc99cc' });
    expect(s.selection).toMatchObject({ foreground: '#ffffff', background: '#515151' });
    const h1 = s.elements.find((e) => e.name === 'H1')!.attrs;
    expect(h1).toMatchObject({ foreground: '#66cccc', bold: true });
    expect(s.elements.find((e) => e.name === 'EMPH')!.attrs).toMatchObject({ foreground: '#ffcc66', italic: true });
  });
  it('F-166 no theme: white background, black text, dark flag off', () => {
    const t = buildTheme('', { baseFontSize: 14, lineSpacing: 3 });
    expect(t.background).toBe('#ffffff');
    expect(t.dark).toBe(false);
    expect(t.errors).toEqual([]);
    expect(buildTheme('Mou Night', { baseFontSize: 14, lineSpacing: 3 }).dark).toBe(true);
  });
  it('parser: errors use the original wording; 8-digit colours carry alpha; relative sizes', () => {
    const s = parseStyleSheet('editor\nbackground: 12345\n\nH1\nforeground: 80ff0000\nfont-size: +4\n\nBOGUS\ncolor: 000000\n');
    expect(s.errors[0]).toContain("Value '12345' is not a valid color value: it should be a hexadecimal number, 6 or 8 characters long.");
    expect(s.errors.some((e) => e.includes("Style rule 'BOGUS'"))).toBe(true);
    expect(s.elements[0].attrs.foreground).toBe('rgba(255, 0, 0, 0.502)');
    expect(s.elements[0].attrs.fontSize).toEqual({ size: 4, relative: true });
  });
  it('hsb() converts like NSColor', () => {
    expect(hsb(0, 0, 1)).toBe('#ffffff');
    expect(hsb(0, 1, 1)).toBe('#ff0000');
    expect(hsb(0.67, 1, 0.4)).toBe('#020066'); // HGMarkdownHighlighter dark blue
  });
});

describe('Toolbar model (§4, F-14)', () => {
  it('default set and flexible spaces in the resolved order (U-08)', () => {
    expect(DEFAULT_TOOLBAR_ITEMS).toEqual([
      'indent-group', 'text-formatting-group', 'heading-group', FLEXIBLE_SPACE,
      'list-group', FLEXIBLE_SPACE, 'blockquote', 'code', FLEXIBLE_SPACE,
      'link', 'image', FLEXIBLE_SPACE, 'copy-html', FLEXIBLE_SPACE, 'layout',
    ]);
  });
  it('13 allowed items; Comment, Highlight and Strikethrough only through customisation', () => {
    expect(TOOLBAR_ITEMS.map((t) => t.id)).toHaveLength(13);
    for (const id of ['comment', 'highlight', 'strikethrough']) expect(DEFAULT_TOOLBAR_ITEMS).not.toContain(id);
    const all = toolbarItemsFor(() => true);
    expect(all).toContain('comment');
    expect(all.indexOf('strikethrough')).toBeLessThan(all.indexOf('layout'));
  });
  it('Text Styles has Strong, Emphasize and Underline; groups map to Format commands', () => {
    const ts = TOOLBAR_ITEMS.find((t) => t.id === 'text-formatting-group')!;
    expect(ts.buttons.map((b) => [b.id, b.label, b.command])).toEqual([
      ['bold', 'Strong', 'strong'],
      ['italic', 'Emphasize', 'emphasize'],
      ['underline', 'Underline', 'underline'],
    ]);
  });
  it('?pref.toolbarItemIdentifiers and ?pref.toolbarVisible overrides', () => {
    expect(parsePrefOverrides('?pref.toolbarItemIdentifiers=["comment","layout"]&pref.toolbarVisible=false')).toEqual({
      toolbarItemIdentifiers: ['comment', 'layout'],
      toolbarVisible: false,
    });
  });
});
