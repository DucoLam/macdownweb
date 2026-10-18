/**
 * M5 unit tests: document model (F-16, F-26, F-30, F-31, F-34), draft and
 * launch state (F-29, F-32 / U-12, F-155, F-16), HTML export (F-35, §9
 * E-01 to E-04), preferences store persistence (F-141) and the preferences
 * window helpers (F-140, P-32 to P-35, P-30).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  UNTITLED,
  displayName,
  htmlTitle,
  isEdited,
  newlineInsertionPoint,
  presumedFileName,
  suggestedSaveName,
  titleString,
  windowTitle,
  type DocumentInfo,
} from '../../src/document/document';
import {
  DRAFT_KEY,
  FIRST_VERSION_KEY,
  clearDraft,
  detectFreshInstall,
  loadDraft,
  loadSplitRatio,
  saveDraft,
  saveSplitRatio,
} from '../../src/document/draft';
import { decodeUtf8, withExtension } from '../../src/document/files';
import { MATHJAX_CDN, buildExportHtml, embeddedScript, embeddedStyle, exportAssets, exportDefaults } from '../../src/document/export';
import { HELP_DOCUMENT, CONTRIBUTE_DOCUMENT } from '../../src/document/help';
import { PREFS_STORAGE_KEY, PreferencesStore, parsePrefOverrides } from '../../src/prefs/store';
import { withDefaults } from '../../src/prefs/defaults';
import { commitNumber, fontPreviewText, PANES } from '../../src/components/PreferencesWindow';
import { renderDocument } from '../../src/render';
import { PRINT_CSS } from '../../src/components/Preview';

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

const file = (name: string, savedText: string): DocumentInfo => ({ kind: 'file', name, savedText });
const ROOT = resolve(__dirname, '../..');
const publicAsset = async (p: string) => readFileSync(resolve(ROOT, 'public/macdown', p), 'utf8');

describe('F-34 / F-16 edited state and window title', () => {
  it('an untitled empty document is not edited; typing makes it edited', () => {
    expect(isEdited(UNTITLED, '')).toBe(false);
    expect(isEdited(UNTITLED, 'a')).toBe(true);
    expect(windowTitle(UNTITLED, '')).toBe('Untitled');
    expect(windowTitle(UNTITLED, 'x')).toBe('Untitled — Edited');
  });
  it('a file is edited when the text differs from the saved text, and not after undoing back', () => {
    const f = file('notes.md', 'abc');
    expect(isEdited(f, 'abc')).toBe(false);
    expect(isEdited(f, 'abcd')).toBe(true);
    expect(windowTitle(f, 'abc')).toBe('notes.md');
    expect(windowTitle(f, '')).toBe('notes.md — Edited');
    expect(displayName(f)).toBe('notes.md');
  });
  it('E-04 / F-139 the page title is the file name without extension, empty for an unsaved document', () => {
    expect(htmlTitle(file('a.b.md', ''))).toBe('a.b');
    expect(htmlTitle(UNTITLED)).toBe('');
  });
});

describe('F-31 presumed file name and F-26 save name', () => {
  it('the highest-level ATX header wins, anywhere in the text; setext is ignored', () => {
    expect(titleString('## Two\n# One\n')).toBe('One');
    expect(titleString('Setext\n===\n### Three')).toBe('Three');
    expect(titleString('#nospace\n')).toBeNull();
    expect(titleString('')).toBeNull();
  });
  it('front-matter title (P-28) comes before headers and is used as is; / | : replaced only in header titles', () => {
    const t = '---\ntitle: "A/B: c"\n---\n# H/1|2:3\n';
    expect(presumedFileName(UNTITLED, t, true)).toBe('A/B: c');
    expect(presumedFileName(UNTITLED, t, false)).toBe('H-1-2-3');
    expect(presumedFileName(UNTITLED, 'text only', false)).toBe('Untitled');
  });
  it('a saved document uses its file name without extension', () => {
    expect(presumedFileName(file('My File.markdown', ''), '# Other', true)).toBe('My File');
  });
  it('the save panel suggests the presumed name plus .md for new documents, the file name for saved ones', () => {
    expect(suggestedSaveName(UNTITLED, '# Hello', false)).toBe('Hello.md');
    expect(suggestedSaveName(UNTITLED, '', false)).toBe('Untitled.md');
    expect(suggestedSaveName(UNTITLED, '# notes.md', false)).toBe('Untitled.md');
    expect(suggestedSaveName(file('x.markdown', ''), '# Hello', false)).toBe('x.markdown');
  });
  it('withExtension adds the export/save extension only when missing', () => {
    expect(withExtension('Hello', 'html')).toBe('Hello.html');
    expect(withExtension('a.HTML', 'html')).toBe('a.HTML');
    expect(withExtension('a.markdown', 'md', ['markdown'])).toBe('a.markdown');
  });
});

describe('F-30 ensure newline at end of file (P-41)', () => {
  it('only a non-empty text without a final newline character gets one', () => {
    expect(newlineInsertionPoint('')).toBeNull();
    expect(newlineInsertionPoint('a')).toBe(1);
    expect(newlineInsertionPoint('a\n')).toBeNull();
    expect(newlineInsertionPoint('a\r')).toBeNull();
    expect(newlineInsertionPoint('a ')).toBeNull();
    expect(newlineInsertionPoint('a ')).toBe(2);
  });
});

describe('F-22 UTF-8 reading', () => {
  it('valid UTF-8 decodes, invalid data is rejected', () => {
    expect(decodeUtf8(new TextEncoder().encode('héllo ✓'))).toBe('héllo ✓');
    expect(decodeUtf8(new Uint8Array([0xff, 0xfe, 0x41]))).toBeNull();
  });
});

describe('F-29 draft, F-155 first launch, F-16 split memory (localStorage)', () => {
  it('saves and restores the draft; help copies never replace it (F-153)', () => {
    const s = new MemoryStorage();
    expect(loadDraft(s)).toBeNull();
    saveDraft(file('a.md', 'x'), 'xy', s);
    expect(loadDraft(s)).toEqual({ version: 1, kind: 'file', name: 'a.md', savedText: 'x', text: 'xy' });
    saveDraft({ kind: 'help', name: 'help.md', savedText: 'h' }, 'h', s);
    expect(loadDraft(s)!.name).toBe('a.md');
    saveDraft(UNTITLED, 'draft', s);
    expect(loadDraft(s)).toEqual({ version: 1, kind: 'untitled', name: null, savedText: null, text: 'draft' });
    clearDraft(s);
    expect(loadDraft(s)).toBeNull();
  });
  it('a corrupt draft counts as none', () => {
    const s = new MemoryStorage();
    for (const v of ['{', '[]', '{"version":2,"text":"a","kind":"untitled"}', '{"version":1,"kind":"file","text":"a"}', '{"version":1,"kind":"x","text":"a"}']) {
      s.setItem(DRAFT_KEY, v);
      expect(loadDraft(s)).toBeNull();
    }
  });
  it('the first visit is a fresh install exactly once', () => {
    const s = new MemoryStorage();
    expect(detectFreshInstall(s)).toBe(true);
    expect(s.getItem(FIRST_VERSION_KEY)).toBe('0.7.3');
    expect(detectFreshInstall(s)).toBe(false);
  });
  it('split ratios are remembered per document name', () => {
    const s = new MemoryStorage();
    expect(loadSplitRatio('a.md', s)).toBeNull();
    saveSplitRatio('a.md', 0.25, s);
    saveSplitRatio('b.md', 0.75, s);
    expect(loadSplitRatio('a.md', s)).toBe(0.25);
    expect(loadSplitRatio('b.md', s)).toBe(0.75);
  });
});

describe('F-141 preferences persistence and URL overrides', () => {
  it('explicit changes persist across a reload; untouched keys keep their defaults', () => {
    const s = new MemoryStorage();
    const a = new PreferencesStore({}, { storage: s });
    a.set({ htmlStyleName: 'Clearness', editorLineSpacing: 8 });
    expect(JSON.parse(s.getItem(PREFS_STORAGE_KEY)!)).toEqual({ htmlStyleName: 'Clearness', editorLineSpacing: 8 });
    const b = new PreferencesStore({}, { storage: s });
    expect(b.get().htmlStyleName).toBe('Clearness');
    expect(b.get().editorLineSpacing).toBe(8);
    expect(b.get().editorStyleName).toBe('Tomorrow+');
  });
  it('?pref. overrides win at start-up and are not persisted', () => {
    const s = new MemoryStorage();
    new PreferencesStore({}, { storage: s }).set({ htmlStyleName: 'Clearness' });
    const b = new PreferencesStore({}, { storage: s, overrides: parsePrefOverrides('?pref.htmlStyleName=GitHub&pref.editorShowWordCount=true') });
    expect(b.get().htmlStyleName).toBe('GitHub');
    expect(b.get().editorShowWordCount).toBe(true);
    expect(JSON.parse(s.getItem(PREFS_STORAGE_KEY)!)).toEqual({ htmlStyleName: 'Clearness' });
    expect(new PreferencesStore({}, { storage: s }).get().htmlStyleName).toBe('Clearness');
  });
  it('the empty style and theme (F-166) persist as the empty string', () => {
    const s = new MemoryStorage();
    new PreferencesStore({}, { storage: s }).set({ htmlStyleName: '', editorStyleName: '' });
    const b = new PreferencesStore({}, { storage: s });
    expect([b.get().htmlStyleName, b.get().editorStyleName]).toEqual(['', '']);
  });
  it('a corrupt store is ignored', () => {
    const s = new MemoryStorage();
    s.setItem(PREFS_STORAGE_KEY, '{"htmlStyleName":3,"editorLineSpacing":"x","nope":1,"extensionTables":false}');
    const b = new PreferencesStore({}, { storage: s });
    expect(b.get().htmlStyleName).toBe('GitHub2');
    expect(b.get().extensionTables).toBe(false);
  });
});

describe('F-140 preferences window helpers', () => {
  it('panes in the original order, Terminal left out', () => {
    expect(PANES.map((p) => p.label)).toEqual(['General', 'Markdown', 'Editor', 'Rendering']);
  });
  it('numeric fields: emptied = 0, clamped to the stepper range, integers', () => {
    expect(commitNumber('', 0, 100)).toBe(0);
    expect(commitNumber('', 300, 10000)).toBe(300);
    expect(commitNumber('120', 0, 100)).toBe(100);
    expect(commitNumber('-4', 0, 35)).toBe(0);
    expect(commitNumber('7.6', 0, 35)).toBe(8);
    expect(commitNumber('abc', 0, 35)).toBe(0);
  });
  it('P-30 font preview text `%@ - %.1lf`', () => {
    expect(fontPreviewText({ name: 'Menlo-Regular', size: 14 })).toBe('Menlo Regular - 14.0');
    expect(fontPreviewText({ name: 'Courier', size: 18.5 })).toBe('Courier - 18.5');
  });
});

describe('F-35 / §9 HTML export', () => {
  const base = withDefaults();
  it('dialog defaults: Include styles unless the empty style is chosen; highlighting = P-20', () => {
    expect(exportDefaults(base)).toEqual({ styles: true, highlighting: false });
    expect(exportDefaults(withDefaults({ htmlStyleName: '', htmlSyntaxHighlighting: true }))).toEqual({ styles: false, highlighting: true });
  });
  it('E-01 styles only: the base style, nothing else', () => {
    expect(exportAssets(base, [], { styles: true, highlighting: false }).map((a) => a.id)).toEqual(['style:GitHub2']);
    expect(exportAssets(base, [], { styles: false, highlighting: false })).toEqual([]);
    expect(exportAssets(withDefaults({ htmlStyleName: '' }), [], { styles: true, highlighting: false })).toEqual([]);
  });
  it('E-01 show-information.css is never exported; E-03 tasklist.js is never exported', () => {
    const p = withDefaults({ htmlCodeBlockAccessory: 2, htmlTaskList: true, htmlSyntaxHighlighting: true });
    const ids = exportAssets(p, ['javascript'], { styles: true, highlighting: true }).map((a) => a.id);
    expect(ids).not.toContain('show-information');
    expect(ids).not.toContain('tasklist');
  });
  it('E-02 highlighting: Prism theme, plugin CSS, core, languages, plugins; Mermaid and Graphviz only with the box', () => {
    const p = withDefaults({ htmlHighlightingThemeName: 'Okaidia', htmlLineNumbers: true, htmlCodeBlockAccessory: 1, htmlMermaid: true, htmlGraphviz: true });
    expect(exportAssets(p, ['markup', 'php'], { styles: false, highlighting: true }).map((a) => a.id)).toEqual([
      'prism-theme:prism-okaidia.css',
      'prism-plugin:line-numbers',
      'prism-plugin:show-language',
      'mermaid',
      'prism-core',
      'prism-language:markup',
      'prism-language:php',
      'prism-language:php-extras',
      'prism-plugin:line-numbers',
      'prism-plugin:show-language',
      'mermaid',
      'mermaid-init',
      'viz',
      'viz-init',
    ]);
    // Without the box: no Prism, no Mermaid, no Graphviz, even with P-20, P-24, P-25 on.
    expect(exportAssets(withDefaults({ htmlSyntaxHighlighting: true, htmlMermaid: true, htmlGraphviz: true }), ['js'], { styles: true, highlighting: false }).map((a) => a.id)).toEqual(['style:GitHub2']);
  });
  it('E-03 MathJax: config embedded as text/x-mathjax-config, MathJax 2.7.3 linked from the CDN', () => {
    const a = exportAssets(withDefaults({ htmlMathJax: true }), [], { styles: false, highlighting: false });
    expect(a).toEqual([
      { kind: 'script', id: 'mathjax-config', path: 'mathjax/init.js', type: 'text/x-mathjax-config' },
      { kind: 'script-link', id: 'mathjax', url: MATHJAX_CDN },
    ]);
  });
  it('embedded tags drop one trailing newline (MPAsset.m:78-89)', () => {
    expect(embeddedStyle('a{}\n\n')).toBe('<style type="text/css">\na{}\n\n</style>');
    expect(embeddedScript('x()\n')).toBe('<script type="text/javascript">\nx()\n</script>');
    expect(embeddedScript('c', 'text/x-mathjax-config')).toBe('<script type="text/x-mathjax-config">\nc\n</script>');
  });
  it('the exported page: template, title only for a saved document, the preview body, embedded files', async () => {
    const md = '# Title\n\n```js\nvar a;\n```\n\n$$x$$\n';
    const p = withDefaults({ htmlMathJax: true, htmlSyntaxHighlighting: true });
    const html = await buildExportHtml(md, p, { styles: true, highlighting: true, title: 'notes' }, publicAsset);
    const preview = renderDocument(md, p, { title: 'notes' });
    expect(html.startsWith('<!DOCTYPE html>\n<html>\n\n<head>\n\n<meta charset="utf-8">')).toBe(true);
    expect(html).toContain('<title>notes</title>');
    expect(html).toContain(`<body>\n\n${preview.body}\n\n`);
    const css = readFileSync(resolve(ROOT, 'src/render/styles/GitHub2.css'), 'utf8');
    expect(html).toContain(embeddedStyle(css));
    expect(html).toContain(embeddedScript(await publicAsset('prism/components/prism-core.min.js')));
    expect(html).toContain(embeddedScript(await publicAsset('prism/components/prism-javascript.min.js')));
    expect(html).toContain(embeddedScript(await publicAsset('mathjax/init.js'), 'text/x-mathjax-config'));
    expect(html).toContain(`<script type="text/javascript" src="${MATHJAX_CDN}"></script>`);
    expect(html).not.toContain('tasklist');
    const untitled = await buildExportHtml(md, withDefaults(), { styles: false, highlighting: false, title: '' }, publicAsset);
    expect(untitled).not.toContain('<title>');
    expect(untitled).not.toContain('<style');
    expect(untitled).not.toContain('<script');
  });
});

describe('F-153 / F-154 bundled help documents, F-37 print layout', () => {
  it('help.md and contribute.md are the original 0.7.3 files', () => {
    expect(HELP_DOCUMENT.name).toBe('help.md');
    expect(HELP_DOCUMENT.text).toBe(readFileSync(resolve(ROOT, '../vendor/macdown/MacDown/Resources/help.md'), 'utf8'));
    expect(CONTRIBUTE_DOCUMENT.text).toBe(readFileSync(resolve(ROOT, '../vendor/macdown/MacDown/Resources/contribute.md'), 'utf8'));
  });
  it('print margins are 50 pt top and bottom, 0 pt left and right', () => {
    expect(PRINT_CSS).toBe('@page { margin: 50pt 0pt; }');
  });
});

describe('F-138 / F-161 user-imported styles and themes', () => {
  it('imported files join the pop-up lists, override built-in names, persist, and Reload re-reads them', async () => {
    const ua = await import('../../src/prefs/userAssets');
    const { styleNames, getStyleCss } = await import('../../src/render/styles');
    const { themeNames, buildTheme } = await import('../../src/editor/themes');
    localStorage.clear();
    ua.reloadUserAssets();
    const before = styleNames();
    ua.addUserStyle('Zed', 'body{}');
    expect(styleNames()).toEqual([...before, 'Zed'].sort((a, b) => a.localeCompare(b)));
    expect(getStyleCss('Zed')).toBe('body{}');
    ua.addUserStyle('GitHub2', 'p{}');
    expect(getStyleCss('GitHub2')).toBe('p{}');
    expect(styleNames().filter((n) => n === 'GitHub2')).toHaveLength(1);
    ua.addUserTheme('Ink', 'editor\nbackground: 102030\n');
    expect(themeNames()).toContain('Ink');
    expect(buildTheme('Ink', { baseFontSize: 14, lineSpacing: 3 }).background).toBe('#102030');
    expect(JSON.parse(localStorage.getItem(ua.USER_STYLES_KEY)!)).toEqual({ Zed: 'body{}', GitHub2: 'p{}' });
    localStorage.setItem(ua.USER_STYLES_KEY, JSON.stringify({ Other: 'a{}' }));
    expect(getStyleCss('Other')).toBeUndefined();
    ua.reloadUserAssets();
    expect(getStyleCss('Other')).toBe('a{}');
    expect(getStyleCss('Zed')).toBeUndefined();
    localStorage.clear();
    ua.reloadUserAssets();
  });
});
