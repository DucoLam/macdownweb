/**
 * M4 editing features, independent test-engineer suite (complements the
 * builder's m4-editing.spec.ts). Every test name starts with the spec ID(s)
 * it covers.
 *
 * Conventions
 *  - `put(page, 'a «b» c')` sets document and selection through the
 *    `window.macdownEditor` hook; `|` is the cursor, `«…»` a selection.
 *  - Keystrokes go through Playwright's keyboard, so the real handlers run.
 *  - Expected values come from the spec (section 2.4, 2.5, 5, 10) and from
 *    the original source (vendor/macdown), not from the app code.
 *  - Platform: the keyboard modifier "M" is Cmd on macOS, Ctrl elsewhere.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, type Frame, type Page } from '@playwright/test';
import { open, mod, setDoc } from './helpers';

const q = (prefs: Record<string, unknown>) =>
  '?' + Object.entries(prefs).map(([k, v]) => `pref.${k}=${encodeURIComponent(JSON.stringify(v))}`).join('&');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function parse(marked: string) {
  const a = marked.indexOf('«');
  if (a >= 0) {
    const b = marked.indexOf('»');
    return { doc: marked.replace('«', '').replace('»', ''), from: a, to: b - 1 };
  }
  const c = marked.indexOf('|');
  if (c < 0) return { doc: marked, from: marked.length, to: marked.length }; // no marker: cursor at the end
  return { doc: marked.replace('|', ''), from: c, to: c };
}

async function put(page: Page, marked: string) {
  const { doc, from, to } = parse(marked);
  await page.evaluate(([d, f, t]) => (window as any).macdownEditor.set(d, f, t), [doc, from, to] as const);
}

async function got(page: Page): Promise<string> {
  const s = await page.evaluate(() => {
    const e = (window as any).macdownEditor;
    return { text: e.text() as string, ...(e.selection() as { from: number; to: number }) };
  });
  if (s.from === s.to) return s.text.slice(0, s.from) + '|' + s.text.slice(s.from);
  return s.text.slice(0, s.from) + '«' + s.text.slice(s.from, s.to) + '»' + s.text.slice(s.to);
}

const docText = (page: Page) => page.evaluate(() => (window as any).macdownEditor.text() as string);

async function press(page: Page, keys: string) {
  await page.keyboard.press(keys.replace(/\bM\b/g, await mod(page)));
}

async function setClipboard(page: Page, text: string) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
}

const ALL_TOOLBAR = ['indent-group', 'text-formatting-group', 'heading-group', 'list-group', 'blockquote', 'code', 'link', 'image', 'copy-html', 'comment', 'highlight', 'strikethrough', 'layout'];
const ALL_EXT = { extensionUnderline: true, extensionStrikethough: true, extensionHighlight: true, toolbarItemIdentifiers: ALL_TOOLBAR };

async function previewFrame(page: Page): Promise<Frame> {
  const h = await page.locator('[data-testid="preview-iframe"]').elementHandle();
  return (await h!.contentFrame())!;
}

// ---------------------------------------------------------------------------
// Format commands: every command, every channel (F-40 to F-61, F-162)
// ---------------------------------------------------------------------------
interface Cmd {
  f: string; // F-ID
  id: string; // Format menu id
  tb?: string; // toolbar button testid suffix
  keys: string; // shortcut
  before: string;
  after: string;
}

const CMDS: Cmd[] = [
  { f: 'F-40', id: 'strong', tb: 'bold', keys: 'M+b', before: 'a «b» c', after: 'a **«b»** c' },
  { f: 'F-41', id: 'emphasize', tb: 'italic', keys: 'M+i', before: 'a «b» c', after: 'a *«b»* c' },
  { f: 'F-42', id: 'underline', tb: 'underline', keys: 'M+u', before: 'a «b» c', after: 'a _«b»_ c' },
  { f: 'F-43', id: 'strikethrough', tb: 'strikethrough', keys: 'M+Minus', before: 'a «b» c', after: 'a ~~«b»~~ c' },
  { f: 'F-44', id: 'highlight', tb: 'highlight', keys: 'M+Equal', before: 'a «b» c', after: 'a ==«b»== c' },
  { f: 'F-45', id: 'inline-code', tb: 'code', keys: 'M+k', before: 'a «b» c', after: 'a `«b»` c' },
  { f: 'F-46', id: 'comment', tb: 'comment', keys: 'M+Slash', before: 'a «b» c', after: 'a <!--«b»--> c' },
  { f: 'F-47', id: 'header-1', tb: 'heading1', keys: 'M+Digit1', before: 'one\ntw|o\nthree', after: 'one\n# tw|o\nthree' },
  { f: 'F-48', id: 'header-2', tb: 'heading2', keys: 'M+Digit2', before: 'one\ntw|o\nthree', after: 'one\n## tw|o\nthree' },
  { f: 'F-49', id: 'header-3', tb: 'heading3', keys: 'M+Digit3', before: 'one\ntw|o\nthree', after: 'one\n### tw|o\nthree' },
  { f: 'F-50', id: 'header-4', keys: 'M+Digit4', before: 'one\ntw|o\nthree', after: 'one\n#### tw|o\nthree' },
  { f: 'F-51', id: 'header-5', keys: 'M+Digit5', before: 'one\ntw|o\nthree', after: 'one\n##### tw|o\nthree' },
  { f: 'F-52', id: 'header-6', keys: 'M+Digit6', before: 'one\ntw|o\nthree', after: 'one\n###### tw|o\nthree' },
  { f: 'F-53', id: 'paragraph', keys: 'M+Digit0', before: 'one\n## tw|o\nthree', after: 'one\ntw|o\nthree' },
  { f: 'F-54', id: 'ordered-list', tb: 'ordered-list', keys: 'Shift+M+KeyO', before: 'a\n«b\nc»\nd', after: 'a\n1. «b\n1. c»\nd' },
  { f: 'F-55', id: 'unordered-list', tb: 'unordered-list', keys: 'Shift+M+KeyU', before: 'a\n«b\nc»\nd', after: 'a\n* «b\n* c»\nd' },
  { f: 'F-56', id: 'blockquote', tb: 'blockquote', keys: 'Shift+M+KeyB', before: 'a\n«b\nc»\nd', after: 'a\n> «b\n> c»\nd' },
  { f: 'F-57', id: 'shift-right', tb: 'shift-right', keys: 'M+BracketRight', before: 'a\n«b»\nc', after: 'a\n\t«b»\nc' },
  { f: 'F-58', id: 'shift-left', tb: 'shift-left', keys: 'M+BracketLeft', before: 'a\n\t«b»\nc', after: 'a\n«b»\nc' },
  { f: 'F-59', id: 'link', tb: 'link', keys: 'Shift+M+KeyK', before: 'a «b» c', after: 'a [b](|) c' },
  { f: 'F-60', id: 'image', tb: 'image', keys: 'Shift+M+KeyI', before: 'a «b» c', after: 'a ![b](|) c' },
  { f: 'F-61', id: 'new-paragraph', keys: 'M+Enter', before: 'ab|cd', after: 'ab\n\n|cd' },
];

async function runVia(page: Page, c: Cmd, channel: 'kbd' | 'menu' | 'toolbar' | 'kbd-in-preview' | 'menu-after-preview') {
  const clickPreview = async () => {
    await page.frameLocator('[data-testid="preview-iframe"]').locator('body').click();
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('IFRAME');
  };
  switch (channel) {
    case 'kbd':
      return press(page, c.keys);
    case 'menu':
      await page.getByTestId('menu-format').click();
      return page.getByTestId(`menuitem-${c.id}`).click();
    case 'toolbar':
      return page.getByTestId(`toolbar-${c.tb}`).click();
    case 'kbd-in-preview':
      await clickPreview();
      return press(page, c.keys);
    case 'menu-after-preview':
      await clickPreview();
      await page.getByTestId('menu-format').click();
      return page.getByTestId(`menuitem-${c.id}`).click();
  }
}

test.describe('F-40 to F-61 every Format command through every channel', () => {
  for (const c of CMDS) {
    const channels: ('kbd' | 'menu' | 'toolbar' | 'kbd-in-preview' | 'menu-after-preview')[] = ['kbd', 'menu', 'kbd-in-preview', 'menu-after-preview'];
    if (c.tb) channels.push('toolbar');
    for (const ch of channels) {
      test(`${c.f} ${c.id} via ${ch}: ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)}`, async ({ page }) => {
        await open(page, q(ALL_EXT));
        await setClipboard(page, 'not a url');
        await put(page, c.before);
        await runVia(page, c, ch);
        await expect.poll(() => got(page)).toBe(c.after);
        // The command leaves the focus in the editor (typing continues at the selection).
        await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('cm-content'))).toBe(true);
      });
    }
  }

  test('F-40 to F-61 the menu shows the spec shortcut next to every Format item', async ({ page }) => {
    await open(page, q(ALL_EXT));
    const want: Record<string, string> = {
      'copy-html': '⌥⌘C', strong: '⌘B', emphasize: '⌘I', underline: '⌘U', strikethrough: '⌘-', highlight: '⌘=', 'inline-code': '⌘K', comment: '⌘/',
      'header-1': '⌘1', 'header-2': '⌘2', 'header-3': '⌘3', 'header-4': '⌘4', 'header-5': '⌘5', 'header-6': '⌘6', paragraph: '⌘0',
      'ordered-list': '⇧⌘O', 'unordered-list': '⇧⌘U', blockquote: '⇧⌘B', 'shift-right': '⌘]', 'shift-left': '⌘[', link: '⇧⌘K', image: '⇧⌘I', 'new-paragraph': '⌘↩',
    };
    await page.getByTestId('menu-format').click();
    for (const [id, sc] of Object.entries(want)) await expect(page.getByTestId(`menuitem-${id}`), id).toContainText(sc);
  });

  test('F-40 to F-61 shortcuts do not collide: Shift variants run the right command', async ({ page }) => {
    await open(page, q(ALL_EXT));
    await setClipboard(page, 'x');
    // Cmd+U underline vs Shift+Cmd+U unordered list; Cmd+B vs Shift+Cmd+B; Cmd+I vs Shift+Cmd+I; Cmd+K vs Shift+Cmd+K.
    const pairs: [string, string, string][] = [
      ['M+u', 'a «b» c', 'a _«b»_ c'],
      ['Shift+M+KeyU', 'a «b» c', '* a «b» c'],
      ['M+b', 'a «b» c', 'a **«b»** c'],
      ['Shift+M+KeyB', 'a «b» c', '> a «b» c'],
      ['M+i', 'a «b» c', 'a *«b»* c'],
      ['Shift+M+KeyI', 'a «b» c', 'a ![b](|) c'],
      ['M+k', 'a «b» c', 'a `«b»` c'],
      ['Shift+M+KeyK', 'a «b» c', 'a [b](|) c'],
    ];
    for (const [k, before, after] of pairs) {
      await put(page, before);
      await press(page, k);
      await expect.poll(() => got(page), `${k} on ${before}`).toBe(after);
    }
  });

  test('F-40 to F-61 modifier combinations that are not shortcuts do nothing (Ctrl+B, Alt+Cmd+B, Cmd+Alt+K)', async ({ page }) => {
    await open(page, q(ALL_EXT));
    for (const k of ['Control+b', 'Alt+M+b', 'Alt+M+k', 'Control+Shift+KeyK', 'Control+Digit1']) {
      await put(page, 'a «b» c');
      await press(page, k);
      await page.waitForTimeout(80);
      expect(await docText(page), k).toBe('a b c'); // Ctrl+B is also cursor-left on macOS, so only the text is compared
    }
  });

  test('F-40 to F-61 the menu and toolbar act on the editor selection that existed before focus moved (second of three identical words)', async ({ page }) => {
    await open(page);
    await put(page, 'b «b» b');
    await page.getByTestId('menu-format').click();
    await page.getByTestId('menuitem-strong').click();
    expect(await got(page)).toBe('b **«b»** b');
    await put(page, 'b «b» b');
    await page.getByTestId('toolbar-italic').click();
    expect(await got(page)).toBe('b *«b»* b');
  });

  test('F-40 to F-61 a selection made with the keyboard (Shift+Arrow) is the one the menu formats', async ({ page }) => {
    await open(page);
    await page.locator('[data-testid="editor"] .cm-content').click();
    await page.keyboard.type('hello world');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.getByTestId('menu-format').click();
    await page.getByTestId('menuitem-inline-code').click();
    expect(await got(page)).toBe('hello wo`«rld»`');
    // typing continues at the selection (replaces it)
    await page.keyboard.type('X');
    expect(await docText(page)).toBe('hello wo`X`');
  });

  test('F-40 to F-61 a selection made with the mouse (drag over text) is the one the toolbar formats', async ({ page }) => {
    await open(page);
    await setDoc(page, 'alpha beta gamma');
    const pt = await page.evaluate(() => {
      const line = document.querySelector('[data-testid="editor"] .cm-line')!;
      const node = line.firstChild as Text;
      const r = document.createRange();
      r.setStart(node, 6);
      r.setEnd(node, 10); // "beta"
      const b = r.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    await page.mouse.dblclick(pt.x, pt.y);
    const sel = await got(page);
    expect(sel).toMatch(/«\w+»/);
    const word = /«(\w+)»/.exec(sel)![1];
    await page.getByTestId('toolbar-bold').click();
    expect(await docText(page)).toContain(`**${word}**`);
  });

  test('F-40 each Format command is one undo step and one redo step (every command)', async ({ page }) => {
    await open(page, q(ALL_EXT));
    await setClipboard(page, 'not a url');
    for (const c of CMDS) {
      await put(page, c.before);
      const before = await docText(page);
      await runVia(page, c, 'menu');
      await expect.poll(() => got(page), c.id).toBe(c.after);
      const afterText = await docText(page);
      await press(page, 'M+z');
      expect(await docText(page), `${c.id}: one Cmd+Z restores the text`).toBe(before);
      await press(page, 'Shift+M+KeyZ');
      expect(await docText(page), `${c.id}: one Cmd+Shift+Z re-applies`).toBe(afterText);
    }
  });

  test('F-40 two Format commands in quick succession are two undo steps', async ({ page }) => {
    await open(page);
    await put(page, 'a «b» c');
    await press(page, 'M+b');
    await press(page, 'M+i');
    expect(await got(page)).toBe('a ***«b»*** c');
    await press(page, 'M+z');
    expect(await docText(page)).toBe('a **b** c');
    await press(page, 'M+z');
    expect(await docText(page)).toBe('a b c');
  });

  test('F-40 undo through the Edit menu reverts a toolbar command in one step', async ({ page }) => {
    await open(page);
    await put(page, 'x «y» z');
    await page.getByTestId('toolbar-bold').click();
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('menuitem-undo').click();
    expect(await docText(page)).toBe('x y z');
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('menuitem-redo').click();
    expect(await docText(page)).toBe('x **y** z');
  });

  test('F-59 / F-60 Link and Image with a clipboard URL are one undo step', async ({ page }) => {
    await open(page);
    await setClipboard(page, 'https://example.com/a');
    for (const [key, out] of [['Shift+M+KeyK', 'x [y](https://example.com/a) z'], ['Shift+M+KeyI', 'x ![y](https://example.com/a) z']] as const) {
      await put(page, 'x «y» z');
      await press(page, key);
      await expect.poll(() => docText(page)).toBe(out);
      await press(page, 'M+z');
      expect(await docText(page)).toBe('x y z');
    }
  });

  test('F-40 to F-61 commands are ignored while the editor pane is collapsed (not editable)', async ({ page }) => {
    await open(page);
    await put(page, 'a «b» c');
    await page.getByTestId('menu-view').click();
    await page.getByTestId('menuitem-toggle-editor').click();
    await page.getByTestId('menu-format').click();
    await page.getByTestId('menuitem-strong').click();
    await page.getByTestId('menu-view').click();
    await page.getByTestId('menuitem-toggle-editor').click();
    expect(await docText(page)).toBe('a b c');
  });

  test('F-40 formatting several lines does not touch the lines outside the selection', async ({ page }) => {
    await open(page);
    await put(page, 'keep1\n«x\ny»\nkeep2');
    await press(page, 'Shift+M+KeyB');
    expect(await docText(page)).toBe('keep1\n> x\n> y\nkeep2');
    await press(page, 'Shift+M+KeyB');
    expect(await docText(page)).toBe('keep1\nx\ny\nkeep2');
  });
});

// ---------------------------------------------------------------------------
// F-162
// ---------------------------------------------------------------------------
test.describe('F-162 extension-dependent Format items', () => {
  const items: [string, string, string, string, string][] = [
    ['underline', 'extensionUnderline', 'KeyU', '_', 'toolbar-underline'],
    ['strikethrough', 'extensionStrikethough', 'Minus', '~~', 'strikethrough'],
    ['highlight', 'extensionHighlight', 'Equal', '==', 'highlight'],
  ];
  for (const [id, pref, code, mark, tb] of items) {
    test(`F-162 ${id}: hidden item and dead shortcut while ${pref} is off; menu item, shortcut and toolbar work when on`, async ({ page }) => {
      await open(page, q({ toolbarItemIdentifiers: ALL_TOOLBAR }));
      await page.getByTestId('menu-format').click();
      await expect(page.getByTestId(`menuitem-${id}`)).toHaveCount(0);
      await page.keyboard.press('Escape');
      await put(page, 'a «b» c');
      await press(page, `M+${code}`);
      await page.waitForTimeout(60);
      expect(await got(page)).toBe('a «b» c');
      // the toolbar button always works
      await page.getByTestId(tb.startsWith('toolbar-') ? tb : `toolbar-${tb}`).click();
      expect(await docText(page)).toBe(`a ${mark}b${mark} c`);
      // turn the extension on live: item appears and the shortcut works
      await page.evaluate((p) => (window as any).macdownPrefs.set({ [p]: true }), pref);
      await page.getByTestId('menu-format').click();
      await expect(page.getByTestId(`menuitem-${id}`)).toBeVisible();
      await page.keyboard.press('Escape');
      await put(page, 'a «b» c');
      await press(page, `M+${code}`);
      await expect.poll(() => docText(page)).toBe(`a ${mark}b${mark} c`);
    });
  }

  test('F-162 Cmd+U with Underline hidden does not run any other editor command (no CodeMirror undoSelection)', async ({ page }) => {
    await open(page);
    await put(page, 'abc|');
    await page.keyboard.type('def');
    await page.keyboard.press('ArrowLeft');
    const before = await got(page);
    await press(page, 'M+u');
    expect(await got(page)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// F-59 / F-60 clipboard
// ---------------------------------------------------------------------------
test.describe('F-59 / F-60 Link and Image with clipboard contents', () => {
  const clips: [string, boolean][] = [
    ['http://example.com', true],
    ['https://example.com/path/a.html?x=1&y=2#frag', true],
    ['HTTPS://EXAMPLE.COM/UP', true],
    ['file:///Users/me/Pictures/a.png', true],
    ['FILE:///tmp/x', true],
    ['ftp://example.com/x', false],
    ['mailto:a@b.co', false],
    ['tel:+123', false],
    ['data:image/png;base64,AAAA', false],
    ['javascript:alert(1)', false],
    ['www.example.com', false],
    ['example.com/path', false],
    ['/Users/me/a.png', false],
    ['just some words', false],
    ['see https://example.com', false],
    ['https://example.com/with space', false],
    [' https://example.com', false],
    ['https://example.com\n', false],
    ['', false],
  ];
  for (const [clip, used] of clips) {
    for (const [cmd, open_, keys] of [['link', '[', 'Shift+M+KeyK'], ['image', '![', 'Shift+M+KeyI']] as const) {
      test(`F-59 ${cmd}: clipboard ${JSON.stringify(clip)} is ${used ? 'inserted and selected' : 'ignored'}`, async ({ page }) => {
        await open(page);
        await setClipboard(page, clip);
        await put(page, 'a «t» c');
        await press(page, keys);
        if (used) await expect.poll(() => got(page)).toBe(`a ${open_}t](«${clip}») c`);
        else await expect.poll(() => got(page)).toBe(`a ${open_}t](|) c`);
      });
    }
  }

  test('F-59 link through the menu and the toolbar use the clipboard too', async ({ page }) => {
    await open(page);
    await setClipboard(page, 'https://example.com');
    await put(page, '«t»');
    await page.getByTestId('menu-format').click();
    await page.getByTestId('menuitem-link').click();
    await expect.poll(() => got(page)).toBe('[t](«https://example.com»)');
    await put(page, '«t»');
    await page.getByTestId('toolbar-image').click();
    await expect.poll(() => got(page)).toBe('![t](«https://example.com»)');
  });

  test('F-59 without clipboard permission the markup is still added, the cursor is inside the parentheses', async ({ browser }) => {
    const ctx = await browser.newContext(); // no clipboard permission granted
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await open(page);
    await put(page, 'a «t» c');
    await press(page, 'Shift+M+KeyK');
    await expect.poll(() => got(page)).toBe('a [t](|) c');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('F-59 an empty selection gives []() with the clipboard URL selected', async ({ page }) => {
    await open(page);
    await setClipboard(page, 'https://example.com');
    await put(page, 'x|y');
    await press(page, 'Shift+M+KeyK');
    await expect.poll(() => got(page)).toBe('x[](«https://example.com»)y');
  });

  test('F-59 a multi-line selection is wrapped as one link', async ({ page }) => {
    await open(page);
    await setClipboard(page, 'nope');
    await put(page, '«l1\nl2»');
    await press(page, 'Shift+M+KeyK');
    await expect.poll(() => docText(page)).toBe('[l1\nl2]()');
  });

  test('F-59 toggling off with the cursor staying: [«t»]() -> «t», and again adds the markup', async ({ page }) => {
    await open(page);
    await setClipboard(page, 'https://example.com');
    await put(page, '[«t»]()');
    await press(page, 'Shift+M+KeyK');
    await expect.poll(() => got(page)).toBe('«t»');
    await press(page, 'Shift+M+KeyK');
    await expect.poll(() => got(page)).toBe('[t](«https://example.com»)');
  });

  test('F-59 the clipboard is read when the command runs, not earlier (changes between two uses)', async ({ page }) => {
    await open(page);
    await setClipboard(page, 'https://one.example');
    await put(page, '«a»');
    await press(page, 'Shift+M+KeyK');
    await expect.poll(() => docText(page)).toBe('[a](https://one.example)');
    await setClipboard(page, 'https://two.example');
    await put(page, '«b»');
    await press(page, 'Shift+M+KeyK');
    await expect.poll(() => docText(page)).toBe('[b](https://two.example)');
  });
});

// ---------------------------------------------------------------------------
// F-61 New Paragraph
// ---------------------------------------------------------------------------
test.describe('F-61 New Paragraph', () => {
  const cases: [string, string, string][] = [
    ['E20 inside a word', 'ab|cd', 'ab\n\n|cd'],
    ['at the end of a line', 'ab|', 'ab\n\n|'],
    ['at the start of a non-empty line', '|ab', '\n\n|ab'],
    ['replaces a selection', 'a«bc»d', 'a\n\n|d'],
    ['on an empty line: one plain newline', 'a\n|\nb', 'a\n\n|\nb'],
    ['in an empty document: one newline', '|', '\n|'],
    ['in a list: no continuation', '* item|', '* item\n\n|'],
    ['in a quote: no continuation', '> q|', '> q\n\n|'],
    ['in an indented line: no indent', '    code|', '    code\n\n|'],
    ['at the end after a trailing newline (empty last line)', 'a\n|', 'a\n\n|'],
    ['does not move to the end of the line', 'one |two three', 'one \n\n|two three'],
  ];
  for (const [name, before, after] of cases) {
    test(`F-61 ${name}: ${JSON.stringify(before)}`, async ({ page }) => {
      await open(page);
      await put(page, before);
      await press(page, 'M+Enter');
      expect(await got(page)).toBe(after);
    });
  }
  test('F-61 New Paragraph is a single undo step and typing continues after it', async ({ page }) => {
    await open(page);
    await put(page, 'ab|cd');
    await page.getByTestId('menu-format').click();
    await page.getByTestId('menuitem-new-paragraph').click();
    await expect.poll(() => docText(page)).toBe('ab\n\ncd');
    await page.waitForTimeout(700); // CodeMirror joins typing that follows within 500 ms into the previous undo event
    await page.keyboard.type('Z');
    expect(await docText(page)).toBe('ab\n\nZcd');
    await press(page, 'M+z'); // undoes the typing (a separate step)
    await press(page, 'M+z');
    expect(await docText(page)).toBe('abcd');
  });
  test('F-61 there is no New Paragraph toolbar button', async ({ page }) => {
    await open(page, q({ toolbarItemIdentifiers: ALL_TOOLBAR }));
    await expect(page.locator('[data-testid="toolbar"] button[data-command="new-paragraph"]')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// S-16 editor cases E1 to E23 (real keystrokes)
// ---------------------------------------------------------------------------
test.describe('S-16 editor cases, with real key events', () => {
  const on = q({ editorCompleteMatchingCharacters: true });
  test('F-62 E1 type ( -> (|)', async ({ page }) => {
    await open(page, on);
    await put(page, '|');
    await page.keyboard.type('(');
    expect(await got(page)).toBe('(|)');
  });
  test('F-64 E2 (|) type ) -> ()|', async ({ page }) => {
    await open(page, on);
    await put(page, '(|)');
    await page.keyboard.type(')');
    expect(await got(page)).toBe('()|');
  });
  test('F-65 E3 (|) Backspace -> |', async ({ page }) => {
    await open(page, on);
    await put(page, '(|)');
    await page.keyboard.press('Backspace');
    expect(await got(page)).toBe('|');
  });
  test('F-63 E4 [word] selected, type * -> *word* with word selected', async ({ page }) => {
    await open(page, on);
    await put(page, '«[word]»');
    await page.keyboard.type('*');
    expect(await got(page)).toBe('*«[word]»*');
  });
  test('F-62 E5 x|y type ( -> x(|y', async ({ page }) => {
    await open(page, on);
    await put(page, 'x|y');
    await page.keyboard.type('(');
    expect(await got(page)).toBe('x(|y');
  });
  test('F-66 E6 "* item|" Return', async ({ page }) => {
    await open(page);
    await put(page, '* item|');
    await page.keyboard.press('Enter');
    expect(await got(page)).toBe('* item\n* |');
  });
  test('F-67 E7 "3. item|" Return: P-39 on and off', async ({ page }) => {
    await open(page);
    await put(page, '3. item|');
    await page.keyboard.press('Enter');
    expect(await got(page)).toBe('3. item\n4. |');
    await open(page, q({ editorAutoIncrementNumberedLists: false }));
    await put(page, '3. item|');
    await page.keyboard.press('Enter');
    expect(await got(page)).toBe('3. item\n3. |');
  });
  test('F-66 E8 "* |" Return -> "\\n|"', async ({ page }) => {
    await open(page);
    await put(page, '* |');
    await page.keyboard.press('Enter');
    expect(await got(page)).toBe('\n|');
  });
  test('F-68 E9 "> q|" Return', async ({ page }) => {
    await open(page);
    await put(page, '> q|');
    await page.keyboard.press('Enter');
    expect(await got(page)).toBe('> q\n> |');
  });
  test('F-70 E10 "ab|" Tab with P-37', async ({ page }) => {
    await open(page, q({ editorConvertTabs: true }));
    await put(page, 'ab|');
    await page.keyboard.press('Tab');
    expect(await got(page)).toBe('ab  |');
  });
  test('F-40 E11 [a] selected, Cmd+B twice', async ({ page }) => {
    await open(page);
    await put(page, '«a»');
    await press(page, 'M+b');
    expect(await got(page)).toBe('**«a»**');
    await press(page, 'M+b');
    expect(await got(page)).toBe('«a»');
  });
  test('F-48 / F-53 E12 [Title] Cmd+2 then Cmd+0', async ({ page }) => {
    await open(page);
    await put(page, '«Title»');
    await press(page, 'M+Digit2');
    expect(await docText(page)).toBe('## Title');
    await press(page, 'M+Digit0');
    expect(await docText(page)).toBe('Title');
  });
  test('F-55 E13 two lines Shift+Cmd+U twice', async ({ page }) => {
    await open(page);
    await put(page, '«l1\nl2»');
    await press(page, 'Shift+M+KeyU');
    expect(await docText(page)).toBe('* l1\n* l2');
    await press(page, 'Shift+M+KeyU');
    expect(await docText(page)).toBe('l1\nl2');
  });
  test('F-57 E14 two lines Cmd+] without and with P-37', async ({ page }) => {
    await open(page);
    await put(page, '«a\nb»');
    await press(page, 'M+BracketRight');
    expect(await docText(page)).toBe('\ta\n\tb');
    await open(page, q({ editorConvertTabs: true }));
    await put(page, '«a\nb»');
    await press(page, 'M+BracketRight');
    expect(await docText(page)).toBe('    a\n    b');
  });
  test("F-62 E15 don| type ' -> don'|", async ({ page }) => {
    await open(page, on);
    await put(page, 'don|');
    await page.keyboard.type("'");
    expect(await got(page)).toBe("don'|");
  });
  test('F-62 E16 "|" type " -> ""|""', async ({ page }) => {
    await open(page, on);
    await put(page, '"|"');
    await page.keyboard.type('"');
    expect(await got(page)).toBe('""|""');
  });
  test('F-40 E17 [**a**] selected, Cmd+B -> ****a****', async ({ page }) => {
    await open(page);
    await put(page, '«**a**»');
    await press(page, 'M+b');
    expect(await docText(page)).toBe('****a****');
  });
  test('F-66 E18 "  * |" Return -> "\\n  |"', async ({ page }) => {
    await open(page);
    await put(page, '  * |');
    await page.keyboard.press('Enter');
    expect(await got(page)).toBe('\n  |');
  });
  test('F-68 E19 "> |" Return -> "> \\n> |"', async ({ page }) => {
    await open(page);
    await put(page, '> |');
    await page.keyboard.press('Enter');
    expect(await got(page)).toBe('> \n> |');
  });
  test('F-61 E20 ab|cd Cmd+Return', async ({ page }) => {
    await open(page);
    await put(page, 'ab|cd');
    await press(page, 'M+Enter');
    expect(await got(page)).toBe('ab\n\n|cd');
  });
  test('F-69 E21 "  ab|" Return with P-38 off', async ({ page }) => {
    await open(page, q({ editorInsertPrefixInBlock: false }));
    await put(page, '  ab|');
    await page.keyboard.press('Enter');
    expect(await got(page)).toBe('  ab\n  |');
  });
  test('F-54 E22 two ordered lines Shift+Cmd+O: web strips (U-05 deviation)', async ({ page }) => {
    await open(page);
    await put(page, '«1. a\n1. b»');
    await press(page, 'Shift+M+KeyO');
    expect(await docText(page)).toBe('a\nb');
    await press(page, 'Shift+M+KeyO');
    expect(await docText(page)).toBe('1. a\n1. b');
  });
  test('F-58 E23 "  \\tx" Cmd+[ anywhere on the line -> x', async ({ page }) => {
    await open(page);
    for (const pos of [0, 1, 2, 3, 4]) {
      await page.evaluate((p) => (window as any).macdownEditor.set('  \tx', p, p), pos);
      await press(page, 'M+BracketLeft');
      expect(await docText(page), `cursor at ${pos}`).toBe('x');
    }
  });
  test('F-54 U-05 the original behaviour (1. 1. x) is NOT reproduced: toggling an existing list twice is stable', async ({ page }) => {
    await open(page);
    await put(page, '«1. x»');
    await press(page, 'Shift+M+KeyO');
    expect(await docText(page)).toBe('x');
    await press(page, 'Shift+M+KeyO');
    expect(await docText(page)).toBe('1. x');
  });
});

// ---------------------------------------------------------------------------
// Typing flows with auto-pair (P-36)
// ---------------------------------------------------------------------------
test.describe('F-62 to F-65 typing flows (P-36)', () => {
  const on = q({ editorCompleteMatchingCharacters: true });
  const flows: [string, string, string][] = [
    ['link syntax', '[link](url)', '[link](url)|'],
    ['quoted word', '"hi"', '"hi"|'],
    ['apostrophe in a word', "don't", "don't|"],
    ['nested brackets', '((a))', '((a))|'],
    ['code with braces', '{a(b)c}', '{a(b)c}|'],
    ['curly CJK brackets', '「a」', '「a」|'],
    ['markdown emphasis is not paired', '*a* _b_ `c` =d=', '*a* _b_ `c` =d=|'],
  ];
  for (const [name, typed, result] of flows) {
    test(`F-62 typing ${name}: ${typed}`, async ({ page }) => {
      await open(page, on);
      await put(page, '|');
      await page.keyboard.type(typed);
      expect(await got(page)).toBe(result);
    });
  }
  test('F-64 typing an HTML tag: the > typed over the auto-inserted > must not add a closing tag', async ({ page }) => {
    await open(page, on);
    await put(page, '|');
    await page.keyboard.type('<b>');
    expect(await got(page)).toBe('<b>|');
    await page.keyboard.type('x</b>');
    expect(await got(page)).toBe('<b>x</b>|');
  });
  test('F-62 typing "(" in the middle of a document before a newline pairs', async ({ page }) => {
    await open(page, on);
    await put(page, 'a|\nb');
    await page.keyboard.type('(');
    expect(await got(page)).toBe('a(|)\nb');
  });
  test('F-62 a pair is one undo step (type ( then Cmd+Z leaves nothing)', async ({ page }) => {
    await open(page, on);
    await put(page, '|');
    await page.keyboard.type('(');
    await press(page, 'M+z');
    expect(await docText(page)).toBe('');
  });
  test('F-63 wrapping with a selection spanning lines and undo', async ({ page }) => {
    await open(page, on);
    await put(page, '«a\nb»');
    await page.waitForTimeout(700); // not joined with the programmatic set
    await page.keyboard.type('(');
    expect(await got(page)).toBe('(«a\nb»)');
    await press(page, 'M+z');
    expect(await docText(page)).toBe('a\nb');
  });
  test('F-63 ~ wraps only with P-10 on; * _ ` = always wrap', async ({ page }) => {
    await open(page, q({ editorCompleteMatchingCharacters: true, extensionStrikethough: true }));
    for (const [c, out] of [['~', '~«x»~'], ['*', '*«x»*'], ['_', '_«x»_'], ['`', '`«x»`'], ['=', '=«x»=']]) {
      await put(page, '«x»');
      await page.keyboard.type(c);
      expect(await got(page), c).toBe(out);
    }
  });
  test('F-65 Backspace with a selection starting between a pair deletes both characters', async ({ page }) => {
    await open(page, on);
    await put(page, 'x(«)y»');
    await page.keyboard.press('Backspace');
    expect(await docText(page)).toBe('xy');
  });
  test('F-65 Backspace between mismatched characters deletes one', async ({ page }) => {
    await open(page, on);
    await put(page, '(|]');
    await page.keyboard.press('Backspace');
    expect(await got(page)).toBe('|]');
  });
  test('F-65 every pair is removed by Backspace (CJK, curly quotes, quotes, angle brackets)', async ({ page }) => {
    await open(page, on);
    for (const [o, c] of [['(', ')'], ['[', ']'], ['{', '}'], ['<', '>'], ["'", "'"], ['"', '"'], ['（', '）'], ['「', '」'], ['『', '』'], ['‘', '’'], ['“', '”']]) {
      await put(page, `x${o}|${c}y`);
      await page.keyboard.press('Backspace');
      expect(await got(page), o).toBe('x|y');
    }
  });
  test('F-62 default off: nothing pairs, wraps or skips', async ({ page }) => {
    await open(page);
    await put(page, '|');
    await page.keyboard.type('("[');
    expect(await got(page)).toBe('("[|');
    await put(page, '«b»');
    await page.keyboard.type('*');
    expect(await got(page)).toBe('*|');
    await put(page, '(|)');
    await page.keyboard.type(')');
    expect(await got(page)).toBe('()|)');
  });
});

// ---------------------------------------------------------------------------
// Return, Tab, Shift+Tab, Backspace, Home matrices
// ---------------------------------------------------------------------------
test.describe('F-66 to F-69 Return matrix (P-38 and P-39)', () => {
  type Row = [string, string];
  const onRows: Row[] = [
    ['* a|', '* a\n* |'], ['+ a|', '+ a\n+ |'], ['- a|', '- a\n- |'], ['  - a|', '  - a\n  - |'], ['\t- a|', '\t- a\n\t- |'],
    ['1. a|', '1. a\n2. |'], ['9. a|', '9. a\n10. |'], ['  3. a|', '  3. a\n  4. |'], ['007. a|', '007. a\n8. |'],
    ['> a|', '> a\n> |'], ['>> a|', '>> a\n>> |'], ['> > a|', '> > a\n> > |'], ['>a|', '>a\n>|'],
    ['    code|', '    code\n    |'], ['\tcode|', '\tcode\n\t|'], ['  \t x|', '  \t x\n  \t |'],
    ['* |', '\n|'], ['1. |', '\n|'], ['> |', '> \n> |'], ['  * |', '\n  |'], ['  1. |', '\n  |'],
    ['plain|', 'plain\n|'], ['|', '\n|'], ['- [ ] t|', '- [ ] t\n- |'], ['* 1. x|', '* 1. x\n* |'],
    ['* ab|cd', '* ab\n* |cd'], ['> ab|cd', '> ab\n> |cd'], ['|* a', '\n|* a'], ['x\n* a|\ny', 'x\n* a\n* |\ny'],
    ['* a|* b', '* a\n|* b'],
  ];
  for (const [before, after] of onRows) {
    test(`F-66 P-38 on: ${JSON.stringify(before)} Return -> ${JSON.stringify(after)}`, async ({ page }) => {
      await open(page);
      await put(page, before);
      await page.keyboard.press('Enter');
      expect(await got(page)).toBe(after);
    });
  }
  const p39off: Row[] = [['1. a|', '1. a\n1. |'], ['9. a|', '9. a\n9. |'], ['007. a|', '007. a\n7. |'], ['* a|', '* a\n* |']];
  for (const [before, after] of p39off) {
    test(`F-67 P-38 on, P-39 off: ${JSON.stringify(before)} Return -> ${JSON.stringify(after)}`, async ({ page }) => {
      await open(page, q({ editorAutoIncrementNumberedLists: false }));
      await put(page, before);
      await page.keyboard.press('Enter');
      expect(await got(page)).toBe(after);
    });
  }
  const offRows: Row[] = [
    ['* a|', '* a\n|'], ['1. a|', '1. a\n|'], ['> a|', '> a\n|'], ['  x|', '  x\n  |'], ['  * a|', '  * a\n  |'], ['\tcode|', '\tcode\n\t|'],
    ['* |', '* \n|'], ['> |', '> \n|'], ['plain|', 'plain\n|'],
  ];
  for (const p39 of [true, false]) {
    for (const [before, after] of offRows) {
      test(`F-69 P-38 off (P-39 ${p39 ? 'on' : 'off'}): ${JSON.stringify(before)} Return -> ${JSON.stringify(after)}`, async ({ page }) => {
        await open(page, q({ editorInsertPrefixInBlock: false, editorAutoIncrementNumberedLists: p39 }));
        await put(page, before);
        await page.keyboard.press('Enter');
        expect(await got(page)).toBe(after);
      });
    }
  }
  test('F-66 Return is one undo step (marker and newline together)', async ({ page }) => {
    await open(page);
    await put(page, '* a|');
    await page.keyboard.press('Enter');
    await press(page, 'M+z');
    expect(await got(page)).toBe('* a|');
  });
  test('F-66 a list typed with the keyboard: continue, number, end', async ({ page }) => {
    await open(page);
    await put(page, '|');
    await page.keyboard.type('1. one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('end');
    expect(await docText(page)).toBe('1. one\n2. two\n\nend');
  });
  test('F-66 P-45 does not influence continuation (marker of the current line is reused)', async ({ page }) => {
    await open(page, q({ editorUnorderedListMarkerType: 2 }));
    await put(page, '* a|');
    await page.keyboard.press('Enter');
    expect(await got(page)).toBe('* a\n* |');
  });
  // Q-04 resolved (M4 fixes, spec §13): AppKit sends insertNewline: for Shift+Return too
  // (AppKit probe of -[NSTextView interpretKeyEvents:]), so MacDown continues the list.
  // The M4 observation expected '* a\n|'.
  test('F-66 Shift+Return continues the list like Return (Q-04: AppKit sends insertNewline: for both)', async ({ page }) => {
    await open(page);
    await put(page, '* a|');
    await page.keyboard.press('Shift+Enter');
    expect(await got(page)).toBe('* a\n* |');
  });
});

test.describe('F-70 / F-71 Tab and Shift+Tab', () => {
  const tab: [string, string, boolean][] = [
    ['|', '\t|', false], ['ab|', 'ab\t|', false], ['a|b', 'a\t|b', false], ['«a\nb»', '\t«a\n\tb»', false], ['«a»', '\t«a»', false],
    ['|', '    |', true], ['a|', 'a   |', true], ['ab|', 'ab  |', true], ['abc|', 'abc |', true], ['abcd|', 'abcd    |', true],
    ['x\nab|', 'x\nab  |', true], ['a|b', 'a   |b', true], ['«a\nb»', '    «a\n    b»', true], ['\tab|', '\tab |', true],
  ];
  for (const [before, after, p37] of tab) {
    test(`F-70 P-37 ${p37 ? 'on' : 'off'}: ${JSON.stringify(before)} Tab -> ${JSON.stringify(after)}`, async ({ page }) => {
      await open(page, p37 ? q({ editorConvertTabs: true }) : '');
      await put(page, before);
      await page.keyboard.press('Tab');
      expect(await got(page)).toBe(after);
    });
  }
  const back: [string, string][] = [
    ['\tab|', 'ab|'], ['    ab|', 'ab|'], ['  ab|', 'ab|'], ['ab|', 'ab|'], ['        x|', '    x|'], ['«\ta\n    b»', '«a\nb»'], ['  \tx|', 'x|'], ['x\n\t|', 'x\n|\t'], // a whitespace-only line is unchanged, the cursor still moves (original quirk)

  ];
  for (const p37 of [false, true]) {
    for (const [before, after] of back) {
      test(`F-71 P-37 ${p37 ? 'on' : 'off'}: ${JSON.stringify(before)} Shift+Tab -> ${JSON.stringify(after)}`, async ({ page }) => {
        await open(page, p37 ? q({ editorConvertTabs: true }) : '');
        await put(page, before);
        await page.keyboard.press('Shift+Tab');
        expect(await got(page)).toBe(after);
      });
    }
  }
  test('F-70 Tab is one undo step; Tab with a selection is one undo step', async ({ page }) => {
    await open(page);
    await put(page, '«a\nb»');
    await page.keyboard.press('Tab');
    await press(page, 'M+z');
    expect(await docText(page)).toBe('a\nb');
  });
  test('F-70 the editor keeps the focus after Tab (focus trap is as in the original editor)', async ({ page }) => {
    await open(page);
    await put(page, 'a|');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.classList.contains('cm-content'))).toBe(true);
  });
});

test.describe('F-65 / F-72 Backspace matrix (P-36 and P-37)', () => {
  const rows: [boolean, boolean, string, string][] = [
    // [P-36, P-37, before, after]
    [false, false, '(|)', '|)'], [true, false, '(|)', '|'], [false, true, '(|)', '|)'], [true, true, '(|)', '|'],
    [false, false, '    |', '   |'], [false, true, '    |', '|'], [true, false, '    |', '   |'], [true, true, '    |', '|'],
    [false, true, 'x       |', 'x   |'], [false, true, 'ab  |', 'ab|'], [false, true, 'abc  |', 'abc |'], [false, true, 'ab |', 'ab|'],
    [false, true, '      |', '    |'], [false, true, 'a         |', 'a       |'], [false, false, 'x       |', 'x      |'],
    [false, true, '«  »', '|'], [false, true, 'x\n  |', 'x\n|'], [false, true, 'x\n|  ', 'x|  '], [false, true, '|', '|'], [false, true, 'ab|', 'a|'],
    [true, true, '(  |)', '(|)'], [false, true, '\t  |', '\t|'], [false, true, 'a  b  |', 'a  b|'],
  ];
  for (const [p36, p37, before, after] of rows) {
    test(`F-72 P-36 ${p36 ? 'on' : 'off'}, P-37 ${p37 ? 'on' : 'off'}: ${JSON.stringify(before)} Backspace -> ${JSON.stringify(after)}`, async ({ page }) => {
      await open(page, q({ editorCompleteMatchingCharacters: p36, editorConvertTabs: p37 }));
      await put(page, before);
      await page.keyboard.press('Backspace');
      expect(await got(page)).toBe(after);
    });
  }
  test('F-72 a soft-tab Backspace is one undo step', async ({ page }) => {
    await open(page, q({ editorConvertTabs: true }));
    await put(page, 'x       |');
    await page.waitForTimeout(700); // not joined with the programmatic set
    await page.keyboard.press('Backspace');
    await press(page, 'M+z');
    expect(await docText(page)).toBe('x       ');
  });
  test('F-72 Backspace at a line start joins the lines (P-37 on)', async ({ page }) => {
    await open(page, q({ editorConvertTabs: true }));
    await put(page, 'a\n|b');
    await page.keyboard.press('Backspace');
    expect(await got(page)).toBe('a|b');
  });
});

test.describe('F-73 smart Home (Cmd+Left)', () => {
  const home = async (page: Page) => ((await mod(page)) === 'Meta' ? 'Meta+ArrowLeft' : 'Home');
  const rows: [boolean, string, string][] = [
    [true, 'x\n    abc|', 'x\n    |abc'], [true, 'x\n    |abc', 'x\n|    abc'], [true, 'x\n  |  abc', 'x\n|    abc'], [true, '    a|bc', '    |abc'],
    [true, '\t\tab|', '\t\t|ab'], [true, 'abc|', '|abc'], [true, '|', '|'], [true, '   |', '|   '], [true, 'a\n|', 'a\n|'],
    [false, 'x\n    abc|', 'x\n|    abc'], [false, '    a|bc', '|    abc'],
  ];
  for (const [p40, before, after] of rows) {
    test(`F-73 P-40 ${p40 ? 'on' : 'off'}: ${JSON.stringify(before)} Cmd+Left -> ${JSON.stringify(after)}`, async ({ page }) => {
      await open(page, p40 ? q({ editorSmartHome: true }) : '');
      await put(page, before);
      await page.keyboard.press(await home(page));
      expect(await got(page)).toBe(after);
    });
  }
  test('F-73 pressed again at the first non-whitespace goes to the line start; a third press stays', async ({ page }) => {
    await open(page, q({ editorSmartHome: true }));
    await put(page, '   abc|');
    await page.keyboard.press(await home(page));
    expect(await got(page)).toBe('   |abc');
    await page.keyboard.press(await home(page));
    expect(await got(page)).toBe('|   abc');
    await page.keyboard.press(await home(page));
    expect(await got(page)).toBe('|   abc');
  });
  test('F-73 Shift+Cmd+Left extends the selection to the line start (no smart jump)', async ({ page }) => {
    await open(page, q({ editorSmartHome: true }));
    await put(page, '    abc|');
    await page.keyboard.press('Shift+' + (await home(page)));
    expect(await got(page)).toBe('«    abc»');
  });
  test('F-73 soft-wrapped line: the normal behaviour (start of the visual row) is used when the target is on another row', async ({ page }) => {
    await open(page, q({ editorSmartHome: true }));
    const long = '    ' + 'word '.repeat(60);
    await put(page, long + '|');
    await page.keyboard.press(await home(page));
    const s = await page.evaluate(() => (window as any).macdownEditor.selection());
    // not the first non-whitespace character (4) and not the document start of the logical line: a later visual row start
    expect(s.from).toBeGreaterThan(4);
    expect(s.from).toBeLessThan(long.length);
  });
  test('F-73 soft-wrapped line, cursor on the first visual row: jumps to the first non-whitespace character', async ({ page }) => {
    await open(page, q({ editorSmartHome: true }));
    const long = '    ' + 'word '.repeat(60);
    await put(page, long + '|');
    await page.evaluate(() => (window as any).macdownEditor.select(10));
    await page.keyboard.press(await home(page));
    expect((await page.evaluate(() => (window as any).macdownEditor.selection())).from).toBe(4);
  });
  test('F-73 P-40 off on a wrapped line: Cmd+Left goes to the start of the visual row (NSTextView behaviour)', async ({ page }) => {
    await open(page);
    const long = 'word '.repeat(80);
    await put(page, long + '|');
    await page.keyboard.press(await home(page));
    const s = await page.evaluate(() => (window as any).macdownEditor.selection());
    expect(s.from).toBeGreaterThan(0);
    expect(s.from).toBeLessThan(long.length);
  });
});

// ---------------------------------------------------------------------------
// M3 retest, D-04 to D-08
// ---------------------------------------------------------------------------
test.describe('M3 retest D-04 to D-08', () => {
  async function render(page: Page, md: string) {
    await setDoc(page, md);
    await page.waitForTimeout(500);
    const f = await previewFrame(page);
    await expect.poll(async () => f.evaluate(() => document.documentElement.dataset.macdownScripts), { timeout: 20_000 }).toBe('done');
    return f;
  }
  const math = { htmlMathJax: true };

  test('F-131 D-04 original has no $ delimiter: a leftover $x$ in raw HTML stays literal even with P-19', async ({ page }) => {
    await open(page, q({ ...math, htmlMathJaxInlineDollar: true }));
    const f = await render(page, '<div id="raw">$x$ and \\(y\\)</div>');
    // \( y \) in raw HTML is typeset (outside skipped tags); $x$ is not.
    await expect.poll(() => f.evaluate(() => document.querySelectorAll('#raw mjx-container').length)).toBe(1);
    expect(await f.evaluate(() => document.querySelector('#raw')!.textContent)).toContain('$x$');
  });
  test('F-131 D-04 \\$ is a literal dollar; $x$ becomes inline math only through the Markdown stage with P-19', async ({ page }) => {
    await open(page, q({ ...math, htmlMathJaxInlineDollar: true }));
    let f = await render(page, 'cost \\$5 and \\$6');
    expect(await f.evaluate(() => document.querySelectorAll('mjx-container').length)).toBe(0);
    expect(await f.evaluate(() => document.querySelector('p')!.textContent)).toBe('cost $5 and $6');
    f = await render(page, 'let $x^2$ be');
    await expect.poll(() => f.evaluate(() => document.querySelectorAll('p mjx-container').length)).toBe(1);
  });
  test('F-131 D-04 without P-19, $x$ is plain text; $$..$$ alone in a paragraph is display math', async ({ page }) => {
    await open(page, q(math));
    let f = await render(page, 'let $x$ be');
    expect(await f.evaluate(() => document.querySelectorAll('mjx-container').length)).toBe(0);
    f = await render(page, '$$ y $$');
    await expect.poll(() => f.evaluate(() => document.querySelectorAll('mjx-container[display="true"]').length)).toBe(1);
  });
  test('F-113 D-05 autolink: README.md and example.com are not linked, www. and http:// are', async ({ page }) => {
    await open(page, q({ extensionAutolink: true }));
    const f = await render(page, 'see README.md and example.com or www.example.org and http://a.io');
    expect(await f.evaluate(() => Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href')))).toEqual(['http://www.example.org', 'http://a.io']);
  });
  test('F-117 D-06 a repeated footnote reference stays literal and ids are unique', async ({ page }) => {
    await open(page);
    const f = await render(page, 'A[^1] B[^1]\n\n[^1]: N');
    expect(await f.evaluate(() => document.querySelectorAll('sup').length)).toBe(1);
    expect(await f.evaluate(() => document.querySelector('p')!.textContent)).toContain('[^1]');
  });
  test('F-110 D-07 60 nested list levels and 120 nested blockquotes render fully', async ({ page }) => {
    await open(page);
    let f = await render(page, Array.from({ length: 60 }, (_, i) => '  '.repeat(i) + '- x' + i).join('\n'));
    expect(await f.evaluate(() => document.querySelectorAll('li').length)).toBe(60);
    f = await render(page, '> '.repeat(120) + 'deep');
    expect(await f.evaluate(() => document.querySelectorAll('blockquote').length)).toBe(120);
  });
  test('F-121 D-08 intra-emphasis off: opener at the start of nested content works', async ({ page }) => {
    await open(page, q({ extensionIntraEmphasis: false, extensionUnderline: true, extensionStrikethough: true, extensionHighlight: true, extensionQuote: true }));
    const f = await render(page, '[*a*](u) **_b_** ~~_c_~~ ==*d*== "_e_"\n\nsnake_case_word');
    const inner = await f.evaluate(() => document.querySelector('p')!.innerHTML);
    expect(inner).toContain('<a href="u"><em>a</em></a>');
    expect(inner).toContain('<strong><u>b</u></strong>');
    expect(inner).toContain('<del><u>c</u></del>');
    expect(inner).toContain('<mark><em>d</em></mark>');
    expect(inner).toContain('<q><u>e</u></q>');
    expect(await f.evaluate(() => document.querySelectorAll('p')[1].innerHTML)).toBe('snake_case_word');
  });
});

// ---------------------------------------------------------------------------
// Toolbar (section 4, U-08, F-13, F-14)
// ---------------------------------------------------------------------------
const RESOLVED_DEFAULT =
  'indent-group text-formatting-group heading-group flexible-space list-group flexible-space blockquote code flexible-space link image flexible-space copy-html flexible-space layout';
const BUNDLE = '/Applications/MacDown.app/Contents/Resources';
const iconDir = fileURLToPath(new URL('../../public/icons/', import.meta.url));

test.describe('section 4 toolbar default order, spacing and look (U-08)', () => {
  test('U-08 the default set, in order, with exactly five flexible spaces and no fixed spaces', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('toolbar')).toHaveAttribute('data-items', RESOLVED_DEFAULT);
    expect(await page.getByTestId('toolbar-flexible-space').count()).toBe(5);
    expect(await page.getByTestId('toolbar-space').count()).toBe(0);
    for (const id of ['comment', 'highlight', 'strikethrough']) await expect(page.getByTestId(`toolbar-item-${id}`)).toHaveCount(0);
  });

  test('U-08 flexible spaces share the free width equally; first item at the left edge, Layout at the right edge', async ({ page }) => {
    await open(page);
    const m = await page.evaluate(() => {
      const tb = document.querySelector('[data-testid="toolbar"]') as HTMLElement;
      const r = tb.getBoundingClientRect();
      const kids = Array.from(tb.children).map((c) => c.getBoundingClientRect());
      const flex = Array.from(tb.querySelectorAll('[data-testid="toolbar-flexible-space"]')).map((c) => c.getBoundingClientRect().width);
      return { left: r.left, right: r.right, first: kids[0].left, last: kids[kids.length - 1].right, flex };
    });
    expect(m.first - m.left).toBeLessThan(16);
    expect(m.right - m.last).toBeLessThan(16);
    expect(m.flex.length).toBe(5);
    expect(Math.max(...m.flex) - Math.min(...m.flex)).toBeLessThan(1.5);
    expect(m.flex[0]).toBeGreaterThan(40);
  });

  test('U-08 items do not overlap and do not leave the toolbar at 1280, 900 and 760 px wide', async ({ page }) => {
    for (const w of [1280, 900, 760]) {
      await page.setViewportSize({ width: w, height: 700 });
      await open(page);
      const r = await page.evaluate(() => {
        const tb = document.querySelector('[data-testid="toolbar"]') as HTMLElement;
        const boxes = Array.from(tb.children)
          .filter((c) => (c as HTMLElement).dataset.testid !== 'toolbar-flexible-space')
          .map((c) => c.getBoundingClientRect());
        let overlap = false;
        for (let i = 1; i < boxes.length; i++) if (boxes[i].left < boxes[i - 1].right - 0.5) overlap = true;
        return { overlap, last: boxes[boxes.length - 1].right, width: tb.clientWidth, scroll: tb.scrollWidth };
      });
      expect(r.overlap, `width ${w}`).toBe(false);
      expect(r.last, `width ${w}`).toBeLessThanOrEqual(w + 0.5);
      expect(r.scroll, `width ${w}`).toBeLessThanOrEqual(r.width + 1);
    }
  });

  test('section 4 segment buttons are 33 px wide, single buttons 37 x 27 px with a 19 x 19 icon; groups have the specified look', async ({ page }) => {
    await open(page, q({ toolbarItemIdentifiers: ALL_TOOLBAR }));
    const dims = await page.evaluate(() =>
      Object.fromEntries(
        Array.from(document.querySelectorAll('[data-testid="toolbar"] button')).map((b) => {
          const r = b.getBoundingClientRect();
          const i = b.querySelector('img');
          return [(b as HTMLElement).dataset.testid, { w: r.width, h: r.height, iw: i?.width, ih: i?.height, nw: i?.naturalWidth }];
        }),
      ),
    );
    for (const id of ['shift-left', 'shift-right', 'bold', 'italic', 'underline', 'heading1', 'heading2', 'heading3', 'unordered-list', 'ordered-list']) {
      expect(dims[`toolbar-${id}`].w, id).toBe(33);
      expect(dims[`toolbar-${id}`].iw, id).toBe(19);
    }
    for (const id of ['blockquote', 'code', 'link', 'image', 'copy-html', 'comment', 'highlight', 'strikethrough']) {
      expect(dims[`toolbar-${id}`].w, id).toBe(37);
      expect(dims[`toolbar-${id}`].h, id).toBe(27);
      expect(dims[`toolbar-${id}`].iw, id).toBe(19);
      expect(dims[`toolbar-${id}`].ih, id).toBe(19);
    }
    await expect
      .poll(() => page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="toolbar"] img')).every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0)))
      .toBe(true); // every icon loaded
    // separated groups (indent, list): a gap between the two segments; joined groups (text, heading): touching
    const gaps = await page.evaluate(() => {
      const gap = (g: string) => {
        const bs = Array.from(document.querySelectorAll(`[data-testid="toolbar-item-${g}"] button`)).map((b) => b.getBoundingClientRect());
        return bs[1].left - bs[0].right;
      };
      return { indent: gap('indent-group'), list: gap('list-group'), text: gap('text-formatting-group'), heading: gap('heading-group') };
    });
    expect(gaps.indent).toBeGreaterThan(0.5);
    expect(gaps.list).toBeGreaterThan(0.5);
    expect(gaps.text).toBeLessThan(1.5);
    expect(gaps.heading).toBeLessThan(1.5);
  });

  test('section 4 tooltips equal the sub-item labels, in group order (Text Styles has only Strong, Emphasize, Underline)', async ({ page }) => {
    await open(page, q({ toolbarItemIdentifiers: ALL_TOOLBAR }));
    const titles = await page.locator('[data-testid="toolbar"] button').evaluateAll((bs) => bs.map((b) => [(b as HTMLElement).dataset.testid, b.getAttribute('title'), b.getAttribute('aria-label')]));
    expect(titles).toEqual([
      ['toolbar-shift-left', 'Shift Left', 'Shift Left'],
      ['toolbar-shift-right', 'Shift Right', 'Shift Right'],
      ['toolbar-bold', 'Strong', 'Strong'],
      ['toolbar-italic', 'Emphasize', 'Emphasize'],
      ['toolbar-underline', 'Underline', 'Underline'],
      ['toolbar-heading1', 'Heading 1', 'Heading 1'],
      ['toolbar-heading2', 'Heading 2', 'Heading 2'],
      ['toolbar-heading3', 'Heading 3', 'Heading 3'],
      ['toolbar-unordered-list', 'Unordered List', 'Unordered List'],
      ['toolbar-ordered-list', 'Ordered List', 'Ordered List'],
      ['toolbar-blockquote', 'Blockquote', 'Blockquote'],
      ['toolbar-code', 'Inline Code', 'Inline Code'],
      ['toolbar-link', 'Link', 'Link'],
      ['toolbar-image', 'Image', 'Image'],
      ['toolbar-copy-html', 'Copy HTML', 'Copy HTML'],
      ['toolbar-comment', 'Comment', 'Comment'],
      ['toolbar-highlight', 'Highlight', 'Highlight'],
      ['toolbar-strikethrough', 'Strikethrough', 'Strikethrough'],
      ['toolbar-layout', 'Layout', 'Layout'],
    ]);
  });

  test('section 4 toolbar icons are the original ToolbarIcon*.png files of the bundle (byte for byte)', async ({ page }) => {
    test.skip(!existsSync(BUNDLE), 'MacDown.app bundle not available');
    await open(page, q({ toolbarItemIdentifiers: ALL_TOOLBAR }));
    const names = ['ShiftLeft', 'ShiftRight', 'Bold', 'Italic', 'Underlined', 'Heading1', 'Heading2', 'Heading3', 'UnorderedList', 'OrderedList', 'Blockquote', 'InlineCode', 'Link', 'Image', 'CopyHTML', 'Comment', 'Highlight', 'Strikethrough', 'EditorAndPreview'];
    for (const n of names) {
      for (const suffix of ['', '@2x']) {
        const a = readFileSync(`${iconDir}ToolbarIcon${n}${suffix}.png`);
        const b = readFileSync(`${BUNDLE}/ToolbarIcon${n}${suffix}.png`);
        expect(a.equals(b), `ToolbarIcon${n}${suffix}.png`).toBe(true);
      }
    }
    const srcs = await page.locator('[data-testid="toolbar"] img').evaluateAll((is) => is.map((i) => (i as HTMLImageElement).getAttribute('src')));
    expect(srcs.length).toBe(19);
    expect(new Set(srcs).size).toBe(19);
  });

  test('F-13 toolbar buttons keep the editor focus and selection (mousedown does not move focus)', async ({ page }) => {
    await open(page);
    await put(page, 'a «b» c');
    await page.getByTestId('toolbar-bold').hover();
    await page.mouse.down();
    expect(await page.evaluate(() => document.activeElement?.classList.contains('cm-content'))).toBe(true);
    await page.mouse.up();
  });
});

test.describe('F-13 Show / Hide Toolbar', () => {
  test('F-13 View > Hide Toolbar removes it and gives its height to the panes; the item turns into Show Toolbar', async ({ page }) => {
    await open(page);
    const top = () => page.evaluate(() => (document.querySelector('[data-testid="split"]') as HTMLElement).getBoundingClientRect().top);
    const t1 = await top();
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('menuitem-toggle-toolbar')).toContainText('Hide Toolbar');
    await expect(page.getByTestId('menuitem-toggle-toolbar')).toContainText('⌥⌘T');
    await page.getByTestId('menuitem-toggle-toolbar').click();
    await expect(page.getByTestId('toolbar')).toHaveCount(0);
    expect(await top()).toBeLessThan(t1 - 20);
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('menuitem-toggle-toolbar')).toContainText('Show Toolbar');
    await expect(page.getByTestId('menuitem-customize-toolbar')).toHaveCount(0); // nothing to customise while hidden
    await page.getByTestId('menuitem-toggle-toolbar').click();
    await expect(page.getByTestId('toolbar')).toBeVisible();
    expect(await top()).toBeCloseTo(t1, 0);
  });

  test('F-13 Opt+Cmd+T toggles from the editor, from the preview and with the toolbar hidden at start', async ({ page }) => {
    await open(page, q({ toolbarVisible: false }));
    await expect(page.getByTestId('toolbar')).toHaveCount(0);
    await press(page, 'Alt+M+KeyT');
    await expect(page.getByTestId('toolbar')).toBeVisible();
    await page.frameLocator('[data-testid="preview-iframe"]').locator('body').click();
    await press(page, 'Alt+M+KeyT');
    await expect(page.getByTestId('toolbar')).toHaveCount(0);
  });

  test('F-13 hiding the toolbar keeps the editor text, selection and undo history', async ({ page }) => {
    await open(page);
    await put(page, 'a «b» c');
    await press(page, 'M+b');
    await press(page, 'Alt+M+KeyT');
    await press(page, 'Alt+M+KeyT');
    expect(await got(page)).toBe('a **«b»** c');
    await press(page, 'M+z');
    expect(await docText(page)).toBe('a b c');
  });

  test('F-13 Format menu commands and shortcuts keep working with the toolbar hidden', async ({ page }) => {
    await open(page, q({ toolbarVisible: false }));
    await put(page, 'a «b» c');
    await page.getByTestId('menu-format').click();
    await page.getByTestId('menuitem-emphasize').click();
    expect(await docText(page)).toBe('a *b* c');
  });
});

test.describe('F-14 Customize Toolbar', () => {
  const dialog = (page: Page) => page.getByTestId('toolbar-customize');
  const openDialog = async (page: Page) => {
    await page.getByTestId('menu-view').click();
    await page.getByTestId('menuitem-customize-toolbar').click();
    await expect(dialog(page)).toBeVisible();
  };
  const items = (page: Page) => page.getByTestId('toolbar').getAttribute('data-items');

  test('F-14 the dialog lists all 13 items in the original order with labels; the default state is checked as specified', async ({ page }) => {
    await open(page);
    await openDialog(page);
    const labels = await dialog(page).locator('label').allInnerTexts();
    expect(labels.map((l) => l.trim())).toEqual(['Shift Left/Right', 'Text Styles', 'Headings', 'Ordered/Unordered List', 'Blockquote', 'Inline Code', 'Link', 'Image', 'Copy HTML', 'Comment', 'Highlight', 'Strikethrough', 'Layout']);
    for (const id of ALL_TOOLBAR) {
      const on = !['comment', 'highlight', 'strikethrough'].includes(id);
      if (on) await expect(page.getByTestId(`toolbar-customize-${id}`), id).toBeChecked();
      else await expect(page.getByTestId(`toolbar-customize-${id}`), id).not.toBeChecked();
    }
  });

  test('F-14 checking each of Comment, Highlight and Strikethrough adds exactly that button, and the button works', async ({ page }) => {
    await open(page);
    for (const [id, out] of [['comment', 'a <!--b--> c'], ['highlight', 'a ==b== c'], ['strikethrough', 'a ~~b~~ c']] as const) {
      await openDialog(page);
      await page.getByTestId(`toolbar-customize-${id}`).check();
      await page.getByTestId('toolbar-customize-done').click();
      await expect(page.getByTestId(`toolbar-${id}`)).toBeVisible();
      expect((await items(page))!.split(' ').filter((x) => x !== 'flexible-space').length).toBe(RESOLVED_DEFAULT.split(' ').filter((x) => x !== 'flexible-space').length + 1);
      await put(page, 'a «b» c');
      await page.getByTestId(`toolbar-${id}`).click();
      expect(await docText(page)).toBe(out);
      await openDialog(page);
      await page.getByTestId(`toolbar-customize-${id}`).uncheck();
      await page.getByTestId('toolbar-customize-done').click();
      await expect(page.getByTestId(`toolbar-${id}`)).toHaveCount(0);
    }
    expect(await items(page)).toBe(RESOLVED_DEFAULT);
  });

  for (const id of ALL_TOOLBAR.filter((i) => !['comment', 'highlight', 'strikethrough'].includes(i))) {
    test(`F-14 unchecking ${id} removes only that item and never leaves two adjacent flexible spaces or a leading one`, async ({ page }) => {
      await open(page);
      await openDialog(page);
      await page.getByTestId(`toolbar-customize-${id}`).uncheck();
      const list = (await items(page))!.split(' ');
      expect(list).not.toContain(id);
      expect(list.filter((x) => x !== 'flexible-space')).toEqual(ALL_TOOLBAR.filter((x) => x !== id && !['comment', 'highlight', 'strikethrough'].includes(x)));
      for (let i = 1; i < list.length; i++) expect(list[i] === 'flexible-space' && list[i - 1] === 'flexible-space', list.join(' ')).toBe(false);
      expect(list[0]).not.toBe('flexible-space');
    });
  }

  test('F-14 Use Default Set restores the default; Done, Escape and a click outside close the dialog and return the focus to the editor', async ({ page }) => {
    await open(page);
    await openDialog(page);
    await page.getByTestId('toolbar-customize-link').uncheck();
    await page.getByTestId('toolbar-customize-comment').check();
    await page.getByTestId('toolbar-customize-default').click();
    expect(await items(page)).toBe(RESOLVED_DEFAULT);
    await page.getByTestId('toolbar-customize-done').click();
    await expect(dialog(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.classList.contains('cm-content'))).toBe(true);
    await openDialog(page);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await openDialog(page);
    await page.mouse.click(5, 400);
    await expect(dialog(page)).toHaveCount(0);
  });

  test('F-14 the toolbar context menu event (right click) opens the dialog', async ({ page }) => {
    await open(page);
    await page.getByTestId('toolbar').click({ button: 'right', position: { x: 300, y: 12 } });
    await expect(dialog(page)).toBeVisible();
  });

  test('F-14 the dialog is modal and accessible: role dialog with a name, labelled checkboxes, Tab stays inside, first focus in the dialog', async ({ page }) => {
    await open(page);
    await openDialog(page);
    await expect(dialog(page)).toHaveAttribute('role', 'dialog');
    await expect(dialog(page)).toHaveAttribute('aria-label', 'Customize Toolbar');
    await expect(dialog(page)).toHaveAttribute('aria-modal', 'true');
    expect(await page.evaluate(() => !!document.querySelector('[data-testid="toolbar-customize"]')!.contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.querySelector('[data-testid="toolbar-customize"]')!.contains(document.activeElement)), `Tab ${i + 1}`).toBe(true);
    }
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => !!document.querySelector('[data-testid="toolbar-customize"]')!.contains(document.activeElement)), `Shift+Tab ${i + 1}`).toBe(true);
    }
  });

  test('F-14 unchecking every item one by one leaves an empty toolbar (NSToolbar allows it), it does not turn back into the default set', async ({ page }) => {
    await open(page);
    await openDialog(page);
    for (const id of ALL_TOOLBAR.filter((i) => !['comment', 'highlight', 'strikethrough'].includes(i))) await page.getByTestId(`toolbar-customize-${id}`).uncheck();
    for (const id of ALL_TOOLBAR) await expect(page.getByTestId(`toolbar-customize-${id}`), id).not.toBeChecked();
    expect(await page.locator('[data-testid="toolbar"] button').count()).toBe(0);
  });

  test('F-14 the toolbarItemIdentifiers preference accepts a custom list in the given order, including both kinds of space', async ({ page }) => {
    await open(page, q({ toolbarItemIdentifiers: ['layout', 'flexible-space', 'link', 'space', 'image'] }));
    await expect(page.getByTestId('toolbar')).toHaveAttribute('data-items', 'layout flexible-space link space image');
    expect(await page.getByTestId('toolbar-flexible-space').count()).toBe(1);
    expect(await page.getByTestId('toolbar-space').count()).toBe(1);
  });

  test('F-14 customising keeps the editor selection and content', async ({ page }) => {
    await open(page);
    await put(page, 'a «b» c');
    await openDialog(page);
    await page.getByTestId('toolbar-customize-comment').check();
    await page.getByTestId('toolbar-customize-done').click();
    expect(await got(page)).toBe('a «b» c');
  });
});

test.describe('F-09 / T-13 Layout pull-down is part of the toolbar customisation', () => {
  test('T-13 unchecking Layout removes the pull-down; the View menu still toggles the panes', async ({ page }) => {
    await open(page);
    await page.getByTestId('menu-view').click();
    await page.getByTestId('menuitem-customize-toolbar').click();
    await page.getByTestId('toolbar-customize-layout').uncheck();
    await expect(page.getByTestId('toolbar-layout')).toHaveCount(0);
    await page.getByTestId('toolbar-customize-done').click();
    await page.getByTestId('menu-view').click();
    await page.getByTestId('menuitem-toggle-preview').click();
    await expect(page.getByTestId('split')).toHaveAttribute('data-preview-visible', 'false');
  });
});

// ---------------------------------------------------------------------------
// Editor themes (section 7.2, F-74, F-166): colours compared with the original .style files
// ---------------------------------------------------------------------------
const THEME_DIR = fileURLToPath(new URL('../../../vendor/macdown/MacDown/Resources/Themes/', import.meta.url));
const THEME_NAMES = [
  'Mou Fresh Air', 'Mou Fresh Air+', 'Mou Night', 'Mou Night+', 'Mou Paper', 'Mou Paper+', 'Solarized (Dark)', 'Solarized (Dark)+',
  'Solarized (Light)', 'Solarized (Light)+', 'Tomorrow', 'Tomorrow Blue', 'Tomorrow+', 'Writer', 'Writer+',
];
type Attrs = Record<string, string>;
function parseStyle(text: string) {
  const out: Record<string, Attrs> = {};
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    if (!lines.length) continue;
    const a: Attrs = {};
    for (const l of lines.slice(1)) {
      const i = l.indexOf(':');
      a[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
    }
    out[lines[0]] = a;
  }
  return out;
}
const rgb = (hex: string) => `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`;

const THEME_DOC = [
  '# H1x', '## H2x', '### H3x', '#### H4x', '##### H5x', '###### H6x', '',
  '*emphx* **strongx** `codex` [linkx](http://u.x) ![imgx](http://i.x)', '',
  '<http://autox.com> &amp; <!-- commentx -->', '',
  '* bulletx', '1. enumx', '', '> quotex', '', '---', '', '[refx]: http://r.x', '', '    verbatimx',
].join('\n');

// [element, marker, exact text match]
const THEME_ELEMENTS: [string, string, boolean][] = [
  ['H1', 'H1x', false], ['H2', 'H2x', false], ['H3', 'H3x', false], ['H4', 'H4x', false], ['H5', 'H5x', false], ['H6', 'H6x', false],
  ['EMPH', 'emphx', false], ['STRONG', 'strongx', false], ['CODE', 'codex', false], ['LINK', 'linkx', false], ['IMAGE', 'imgx', false],
  ['AUTO_LINK_URL', 'autox', false], ['HTML_ENTITY', '&amp;', false], ['COMMENT', 'commentx', false], ['LIST_BULLET', '*', true],
  ['LIST_ENUMERATOR', '1.', true], ['BLOCKQUOTE', 'quotex', false], ['HRULE', '---', true], ['REFERENCE', 'refx', false], ['VERBATIM', 'verbatimx', false],
];

async function spanStyle(page: Page, marker: string, exact: boolean) {
  return page.evaluate(([m, ex]) => {
    const spans = Array.from(document.querySelectorAll('[data-testid="editor"] .cm-line span')).filter((s) => (ex ? s.textContent === m : (s.textContent ?? '').includes(m)));
    spans.sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length);
    const s = spans[0];
    if (!s) return null;
    const c = getComputedStyle(s);
    return { color: c.color, bg: c.backgroundColor, size: c.fontSize, weight: c.fontWeight, style: c.fontStyle, deco: c.textDecorationLine };
  }, [marker, exact] as const);
}

test.describe('F-74 editor themes against the original .style files', () => {
  for (const name of THEME_NAMES) {
    test(`F-74 theme "${name}": editor colours, caret, selection and every element style equal the .style file`, async ({ page }) => {
      const sheet = parseStyle(readFileSync(`${THEME_DIR}${name}.style`, 'utf8'));
      await open(page, q({ editorStyleName: name }));
      await expect(page.getByTestId('editor')).toHaveAttribute('data-theme', name);
      await put(page, THEME_DOC + '\n\nplain text«selected»');
      await page.waitForTimeout(250);
      const ed = await page.evaluate(() => {
        const e = document.querySelector('[data-testid="editor"] .cm-editor')!;
        const cursorEl = document.querySelector('.cm-cursor');
        const sel = document.querySelector('.cm-selectionBackground');
        return {
          bg: getComputedStyle(e).backgroundColor,
          fg: getComputedStyle(e).color,
          caret: cursorEl ? getComputedStyle(cursorEl).borderLeftColor : null,
          selBg: sel ? getComputedStyle(sel).backgroundColor : null,
          pane: getComputedStyle(document.querySelector('[data-testid="editor-pane"]')!).backgroundColor,
        };
      });
      expect(ed.bg).toBe(rgb(sheet.editor.background));
      expect(ed.fg).toBe(rgb(sheet.editor.foreground));
      if (sheet.editor.caret) expect(ed.caret, 'caret').toBe(rgb(sheet.editor.caret));
      if (sheet['editor-selection']?.background) expect(ed.selBg, 'selection background').toBe(rgb(sheet['editor-selection'].background));
      for (const [el, marker, exact] of THEME_ELEMENTS) {
        const a = sheet[el];
        const got = await spanStyle(page, marker, exact);
        expect(got, `${el} span exists`).not.toBeNull();
        const style = (a['font-style'] ?? '').toLowerCase();
        expect(got!.color, `${el} colour`).toBe(rgb(a.foreground ?? a.color ?? sheet.editor.foreground));
        expect(got!.bg, `${el} background`).toBe(a.background ? rgb(a.background) : 'rgba(0, 0, 0, 0)');
        expect(got!.weight, `${el} weight`).toBe(style.includes('bold') ? '700' : '400');
        expect(got!.style, `${el} italic`).toBe(style.includes('italic') ? 'italic' : 'normal');
        expect(got!.size, `${el} size`).toBe(a['font-size'] ? `${parseInt(a['font-size'], 10)}px` : '14px');
      }
    });
  }

  test('F-74 the 15 themes give 15 different editor looks', async ({ page }) => {
    const seen = new Set<string>();
    for (const name of THEME_NAMES) {
      await open(page, q({ editorStyleName: name }));
      await put(page, '# H\n\ntext');
      const l = await page.evaluate(() => {
        const e = document.querySelector('[data-testid="editor"] .cm-editor')!;
        const h = document.querySelector('[data-testid="editor"] .cm-line span')!;
        return [getComputedStyle(e).backgroundColor, getComputedStyle(e).color, getComputedStyle(h).color, getComputedStyle(h).fontSize].join('|');
      });
      seen.add(l);
    }
    expect(seen.size).toBe(15);
  });

  test('F-166 no theme: white background, black text and the highlighter default styles (HGMarkdownHighlighter getDefaultStyles)', async ({ page }) => {
    await open(page, q({ editorStyleName: '' }));
    await put(page, '# H1x\n\n*emphx* **strongx** `codex`');
    await page.waitForTimeout(200);
    const hsb = (h: number, s: number, v: number) => {
      const f = (n: number) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
      return `rgb(${Math.round(f(5) * 255)}, ${Math.round(f(3) * 255)}, ${Math.round(f(1) * 255)})`;
    };
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="editor"] .cm-editor')!).backgroundColor)).toBe('rgb(255, 255, 255)');
    const h1 = (await spanStyle(page, 'H1x', false))!;
    expect(h1.color).toBe(hsb(0.67, 1, 0.4));
    expect(h1.bg).toBe(hsb(0.67, 0.2, 1));
    expect(h1.weight).toBe('700');
    expect((await spanStyle(page, 'emphx', false))!.color).toBe(hsb(0.15, 1, 0.4));
    expect((await spanStyle(page, 'strongx', false))!.color).toBe(hsb(0.87, 1, 0.4));
    expect((await spanStyle(page, 'codex', false))!.color).toBe(hsb(0.34, 1, 0.4));
  });

  test('F-74 a block-level HTML comment (alone in its block) uses the COMMENT style, as peg-markdown-highlight HtmlBlock > HtmlComment does', async ({ page }) => {
    await open(page, q({ editorStyleName: 'Tomorrow+' }));
    await put(page, 'para\n\n<!-- blockcomment -->\n\npara');
    await page.waitForTimeout(250);
    const s = await spanStyle(page, 'blockcomment', false);
    expect(s, 'the comment text is inside a styled span').not.toBeNull();
    expect(s!.color).toBe(rgb('888888'));
  });

  test('F-74 Format > Comment on a whole line produces text that is coloured as a comment', async ({ page }) => {
    await open(page, q({ editorStyleName: 'Tomorrow+' }));
    await put(page, 'para\n\n«note»\n\npara');
    await press(page, 'M+Slash');
    await page.waitForTimeout(250);
    const s = await spanStyle(page, 'note', false);
    expect(s).not.toBeNull();
    expect(s!.color).toBe(rgb('888888'));
  });

  test('F-74 theme switch is live, keeps text, selection and focus', async ({ page }) => {
    await open(page);
    await put(page, '# a\n«b»');
    await page.evaluate(() => (window as any).macdownPrefs.set({ editorStyleName: 'Mou Night' }));
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="editor"] .cm-editor')!).backgroundColor)).toBe(rgb(parseStyle(readFileSync(`${THEME_DIR}Mou Night.style`, 'utf8')).editor.background));
    expect(await got(page)).toBe('# a\n«b»');
    expect(await page.evaluate(() => document.activeElement?.classList.contains('cm-content'))).toBe(true);
  });

  test('F-165 divider takes the editor background when the preview is collapsed', async ({ page }) => {
    await open(page, q({ editorStyleName: 'Mou Night' }));
    await page.getByTestId('menu-view').click();
    await page.getByTestId('menuitem-toggle-preview').click();
    const bg = rgb(parseStyle(readFileSync(`${THEME_DIR}Mou Night.style`, 'utf8')).editor.background);
    await expect.poll(() => page.getByTestId('split-divider').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(bg);
  });
});

// ---------------------------------------------------------------------------
// Appearance (F-75 to F-79)
// ---------------------------------------------------------------------------
test.describe('F-75 to F-79 editor appearance', () => {
  const NOTHEME = { editorStyleName: '' };
  const metrics = (page: Page) =>
    page.evaluate(() => {
      const sc = document.querySelector('[data-testid="editor"] .cm-scroller') as HTMLElement;
      const ct = document.querySelector('[data-testid="editor"] .cm-content') as HTMLElement;
      const lines = Array.from(document.querySelectorAll('[data-testid="editor"] .cm-line')).map((l) => l.getBoundingClientRect());
      const first = document.querySelector('[data-testid="editor"] .cm-line')!;
      const r = document.createRange();
      const tn = first.firstChild && first.firstChild.nodeType === 3 ? first.firstChild : null;
      if (tn) {
        r.setStart(tn, 0);
        r.setEnd(tn, 1);
      } else r.selectNodeContents(first);
      const cs = getComputedStyle(ct);
      const ed = getComputedStyle(document.querySelector('[data-testid="editor"] .cm-editor')!);
      return {
        family: getComputedStyle(sc).fontFamily, size: ed.fontSize, pitch: lines.length > 1 ? lines[1].top - lines[0].top : 0,
        pl: parseFloat(cs.paddingLeft), pr: parseFloat(cs.paddingRight), pt: parseFloat(cs.paddingTop), pb: parseFloat(cs.paddingBottom),
        textX: r.getBoundingClientRect().left - sc.getBoundingClientRect().left, textY: lines[0].top - sc.getBoundingClientRect().top + sc.scrollTop,
        width: sc.clientWidth, height: sc.clientHeight, scrollH: sc.scrollHeight,
      };
    });

  test('F-75 default font is Menlo 14; Courier 18 and Monaco 11 apply live', async ({ page }) => {
    await open(page);
    let m = await metrics(page);
    expect(m.family).toContain('Menlo');
    expect(m.size).toBe('14px');
    await page.evaluate(() => (window as any).macdownPrefs.set({ editorBaseFontInfo: { name: 'Courier-Regular', size: 18 } }));
    await expect.poll(async () => (await metrics(page)).size).toBe('18px');
    m = await metrics(page);
    expect(m.family).toMatch(/Courier/);
    await page.evaluate(() => (window as any).macdownPrefs.set({ editorBaseFontInfo: { name: 'Monaco', size: 11 } }));
    await expect.poll(async () => (await metrics(page)).size).toBe('11px');
    expect((await metrics(page)).family).toMatch(/Monaco/);
  });

  test('F-75 the base font also scales the + theme header sizes relative to nothing: headers keep their absolute sizes', async ({ page }) => {
    await open(page, q({ editorStyleName: 'Tomorrow+', editorBaseFontInfo: { name: 'Menlo-Regular', size: 20 } }));
    await put(page, '# H\n\nplain');
    expect((await spanStyle(page, '# H', true))!.size).toBe('24px');
  });

  for (const spacing of [0, 3, 8, 20]) {
    test(`F-76 line spacing ${spacing}: the line pitch grows by exactly the spacing`, async ({ page }) => {
      await open(page, q({ ...NOTHEME, editorLineSpacing: spacing }));
      await put(page, 'a\nb\nc');
      await expect.poll(async () => Math.abs((await metrics(page)).pitch - (14 * 1.17 + spacing)) < 0.2).toBe(true);
    });
  }

  for (const [h, v] of [[0, 0], [35, 35], [15, 30], [5, 20]]) {
    test(`F-77 insets ${h} x ${v}: padding and text position`, async ({ page }) => {
      await open(page, q({ ...NOTHEME, editorHorizontalInset: h, editorVerticalInset: v }));
      await put(page, 'abc');
      await expect.poll(async () => (await metrics(page)).pl).toBe(h);
      const m = await metrics(page);
      expect([m.pr, m.pt]).toEqual([h, v]);
      expect(Math.abs(m.textX - h)).toBeLessThan(1.5);
      expect(Math.abs(m.textY - v)).toBeLessThan(1.5);
    });
  }

  test('F-78 width limit: inset (width - max) x 0.45 only when width > 2 x inset + max (checked on both sides of the boundary)', async ({ page }) => {
    await open(page, q({ ...NOTHEME, editorWidthLimited: true, editorMaximumWidth: 1000 }));
    const w = (await metrics(page)).width;
    for (const max of [300, 450, 600]) {
      await page.evaluate((m) => (window as any).macdownPrefs.set({ editorMaximumWidth: m }), max);
      await expect.poll(async () => Math.abs((await metrics(page)).pl - (w - max) * 0.45) < 0.6).toBe(true);
      const m = await metrics(page);
      expect(m.pl).toBe(m.pr);
    }
    await page.evaluate((m) => (window as any).macdownPrefs.set({ editorMaximumWidth: m }), w - 30); // width == 2 x 15 + max: not greater
    await expect.poll(async () => (await metrics(page)).pl).toBe(15);
    await page.evaluate((m) => (window as any).macdownPrefs.set({ editorMaximumWidth: m }), w - 31); // just greater
    await expect.poll(async () => Math.abs((await metrics(page)).pl - 31 * 0.45) < 0.6).toBe(true);
  });

  test('F-78 width limit is re-evaluated when the window is resized and when the width limit is switched off', async ({ page }) => {
    await open(page, q({ ...NOTHEME, editorWidthLimited: true, editorMaximumWidth: 400 }));
    const read = async () => { const m = await metrics(page); return { pl: m.pl, w: m.width }; };
    await page.setViewportSize({ width: 1000, height: 800 });
    await expect.poll(async () => { const r = await read(); return Math.abs(r.pl - (r.w - 400) * 0.45) < 0.6; }).toBe(true);
    await page.setViewportSize({ width: 1600, height: 800 });
    await expect.poll(async () => { const r = await read(); return Math.abs(r.pl - (r.w - 400) * 0.45) < 0.6; }).toBe(true);
    await page.evaluate(() => (window as any).macdownPrefs.set({ editorWidthLimited: false }));
    await expect.poll(async () => (await read()).pl).toBe(15);
  });

  test('F-79 scroll past end: short document gets padding of its own height; a long one of the visible height minus 2 x inset; off adds nothing', async ({ page }) => {
    await open(page, q({ ...NOTHEME, editorScrollsPastEnd: true }));
    await put(page, 'a\nb\nc');
    const pitch = 14 * 1.17 + 3;
    // SD-09 (CoS decision, M4 fixes): with nothing trailing, AppKit's trailingHeight is one
    // line of the font without spacing (16 pt at Menlo 14, AppKit probe), so it is subtracted.
    const oneLine = 14 * 1.17;
    await expect.poll(async () => Math.abs((await metrics(page)).pb - (30 + 3 * pitch - oneLine)) < 1).toBe(true);
    await put(page, Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n'));
    await expect.poll(async () => { const m = await metrics(page); return Math.abs(m.pb - (30 + m.height - 60 - oneLine)) < 1; }).toBe(true);
    await page.evaluate(() => (window as any).macdownPrefs.set({ editorScrollsPastEnd: false }));
    await expect.poll(async () => (await metrics(page)).pb).toBe(30);
  });

  test('F-79 with scroll past end the last line can be scrolled to the top area; without it the last line stays at the bottom', async ({ page }) => {
    const lastTop = async () =>
      page.evaluate(() => {
        const sc = document.querySelector('[data-testid="editor"] .cm-scroller') as HTMLElement;
        sc.scrollTop = sc.scrollHeight;
        const lines = document.querySelectorAll('[data-testid="editor"] .cm-line');
        return lines[lines.length - 1].getBoundingClientRect().top - sc.getBoundingClientRect().top;
      });
    const doc = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    await open(page, q({ ...NOTHEME, editorScrollsPastEnd: true }));
    await put(page, doc);
    await page.waitForTimeout(300);
    expect(await lastTop()).toBeLessThan(80);
    await open(page, q(NOTHEME));
    await put(page, doc);
    await page.waitForTimeout(300);
    expect(await lastTop()).toBeGreaterThan(300);
  });
});

// ---------------------------------------------------------------------------
// Edit menu (section 2.6, section 3)
// ---------------------------------------------------------------------------
test.describe('F-81 to F-107 Edit menu', () => {
  const edit = async (page: Page, id: string) => {
    await page.getByTestId('menu-edit').click();
    await page.getByTestId(`menuitem-${id}`).click();
  };

  test('section 3 the Edit menu has the in-scope items in order with the spec shortcuts', async ({ page }) => {
    await open(page);
    await page.getByTestId('menu-edit').click();
    const items = await page.getByTestId('menu-edit-dropdown').locator('[role^="menuitem"]').evaluateAll((es) => es.map((e) => (e.textContent ?? '').trim()));
    expect(items).toEqual([
      'Undo⌘Z', 'Redo⇧⌘Z', 'Cut⌘X', 'Copy⌘C', 'Paste⌘V', 'Delete', 'Select All⌘A', 'Find…⌘F', 'Find and Replace…⌥⌘F', 'Find Next⌘G', 'Find Previous⇧⌘G',
      'Use Selection for Find⌘E', 'Jump to Selection⌘J', 'Check Spelling While Typing', 'Make Upper Case', 'Make Lower Case', 'Capitalize',
    ]);
  });

  test('F-96 Check Spelling While Typing: checkable item, off by default, toggles spellcheck both ways, state shown each time the menu opens', async ({ page }) => {
    await open(page);
    const cm = page.locator('[data-testid="editor"] .cm-content');
    for (const want of [true, false, true]) {
      await page.getByTestId('menu-edit').click();
      const item = page.getByTestId('menuitem-check-spelling');
      await expect(item).toHaveAttribute('role', 'menuitemcheckbox');
      await expect(item).toHaveAttribute('aria-checked', String(!want));
      await item.click();
      await expect(cm).toHaveAttribute('spellcheck', String(want));
    }
    expect(await page.evaluate(() => (window as any).macdownPrefs.get().editorContinuousSpellCheckingEnabled)).toBe(true);
  });

  test('F-96 P-46 on at start: the item is checked and spellcheck is on', async ({ page }) => {
    await open(page, q({ editorContinuousSpellCheckingEnabled: true }));
    await page.getByTestId('menu-edit').click();
    await expect(page.getByTestId('menuitem-check-spelling')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-testid="editor"] .cm-content')).toHaveAttribute('spellcheck', 'true');
  });

  test('F-81 / F-82 Undo and Redo from the menu step through typing and commands', async ({ page }) => {
    await open(page);
    await put(page, '|');
    await page.waitForTimeout(600);
    await page.keyboard.type('abc');
    await page.waitForTimeout(600);
    await press(page, 'M+b');
    expect(await docText(page)).toBe('abc****'); // empty selection: markup inserted, cursor between
    await edit(page, 'undo');
    expect(await docText(page)).toBe('abc');
    await edit(page, 'undo');
    expect(await docText(page)).toBe('');
    await edit(page, 'redo');
    expect(await docText(page)).toBe('abc');
  });

  test('F-87 Select All from the menu selects the whole editor text, also when the focus was in the preview', async ({ page }) => {
    await open(page);
    await put(page, 'one\ntwo|');
    await page.frameLocator('[data-testid="preview-iframe"]').locator('body').click();
    await edit(page, 'select-all');
    expect(await got(page)).toBe('«one\ntwo»');
  });

  test('F-83 / F-84 / F-85 Cut, Copy and Paste from the menu, multi-line text, replacing a selection, one undo step for Cut and Paste', async ({ page }) => {
    await open(page);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await put(page, 'a«b\nc»d');
    await edit(page, 'copy');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('b\nc');
    expect(await docText(page)).toBe('ab\ncd');
    await edit(page, 'cut');
    expect(await got(page)).toBe('a|d');
    await put(page, 'X«Y»Z');
    await edit(page, 'paste');
    await expect.poll(() => got(page)).toBe('Xb\nc|Z');
    await press(page, 'M+z');
    expect(await docText(page)).toBe('XYZ');
  });

  test('F-83 / F-84 Cut and Copy with an empty selection do nothing and keep the clipboard', async ({ page }) => {
    await open(page);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(() => navigator.clipboard.writeText('keep'));
    await put(page, 'abc|');
    await edit(page, 'copy');
    await edit(page, 'cut');
    expect(await docText(page)).toBe('abc');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('keep');
  });

  test('F-85 Paste without clipboard permission does nothing and raises no error', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await open(page);
    await put(page, 'a|b');
    await edit(page, 'paste');
    await page.waitForTimeout(200);
    expect(await docText(page)).toBe('ab');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('F-86 Delete removes the selection (one undo step), does nothing with an empty selection', async ({ page }) => {
    await open(page);
    await put(page, 'a«bc»d');
    await page.waitForTimeout(700); // not joined with the programmatic set
    await edit(page, 'delete');
    expect(await got(page)).toBe('a|d');
    await press(page, 'M+z');
    expect(await docText(page)).toBe('abcd');
    await put(page, 'a|bcd');
    await edit(page, 'delete');
    expect(await docText(page)).toBe('abcd');
  });

  test('F-88 to F-93 Find items: Find focuses the field, Find Next / Previous move between matches, Use Selection for Find fills the field, Jump to Selection scrolls', async ({ page }) => {
    await open(page);
    await put(page, '«one» two one two one');
    await edit(page, 'use-selection-for-find');
    await edit(page, 'find');
    await expect(page.locator('.cm-search input[main-field]')).toHaveValue('one');
    await page.locator('[data-testid="editor"] .cm-content').click();
    await page.evaluate(() => (window as any).macdownEditor.select(0));
    await edit(page, 'find-next');
    expect(await got(page)).toBe('«one» two one two one');
    await edit(page, 'find-next');
    expect(await got(page)).toBe('one two «one» two one');
    await edit(page, 'find-previous');
    expect(await got(page)).toBe('«one» two one two one');
    await edit(page, 'find-replace');
    await expect(page.locator('.cm-search input[name=replace]')).toBeFocused();
    const doc = Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n');
    await put(page, doc);
    const pos = doc.indexOf('line 150');
    await page.evaluate((p) => (window as any).macdownEditor.select(p, p + 8), pos);
    await page.evaluate(() => ((document.querySelector('[data-testid="editor"] .cm-scroller') as HTMLElement).scrollTop = 0));
    await edit(page, 'jump-to-selection');
    await expect.poll(() => page.evaluate(() => (document.querySelector('[data-testid="editor"] .cm-scroller') as HTMLElement).scrollTop)).toBeGreaterThan(1000);
  });

  const tf: [string, string, string][] = [
    ['make-upper-case', '«hello wörld\nsecond»', '«HELLO WÖRLD\nSECOND»'],
    ['make-lower-case', '«HeLLo WORLD»', '«hello world»'],
    ['capitalize', '«hELLO wORLD\nsEcond»', '«Hello World\nSecond»'],
  ];
  for (const [id, before, after] of tf) {
    test(`F-105 to F-107 ${id}: ${JSON.stringify(before)} (one undo step, selection kept)`, async ({ page }) => {
      await open(page);
      await put(page, before);
      await edit(page, id);
      expect(await got(page)).toBe(after);
      await press(page, 'M+z');
      expect(await got(page).then((s) => s.replace(/[«»]/g, ''))).toBe(before.replace(/[«»]/g, ''));
    });
  }
});
