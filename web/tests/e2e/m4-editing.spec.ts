/**
 * M4 editing features, end to end: toolbar (§4, F-13, F-14), Format menu and
 * shortcuts (§2.4, F-40 to F-61, F-162), editor behaviours (§2.5, §5,
 * F-62 to F-73), appearance (§8.4, F-74 to F-79), Edit menu (§2.6) and the
 * editor themes (§7.2, F-166). Every test name starts with the spec ID(s).
 *
 * Exact document and selection state is read and set through the
 * `window.macdownEditor` testing hook (one transaction, no input rules);
 * keystrokes go through Playwright's keyboard so the real handlers run.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { open, mod, setDoc } from './helpers';

const q = (prefs: Record<string, unknown>) =>
  '?' + Object.entries(prefs).map(([k, v]) => `pref.${k}=${encodeURIComponent(JSON.stringify(v))}`).join('&');

interface EdState {
  text: string;
  from: number;
  to: number;
}

/** Sets the document and selection; `|` marks the cursor, `[`…`]` a selection when given as markers. */
async function set(page: Page, marked: string) {
  let doc = marked;
  let from: number;
  let to: number;
  const a = doc.indexOf('«');
  if (a >= 0) {
    doc = doc.replace('«', '');
    const b = doc.indexOf('»');
    doc = doc.replace('»', '');
    from = a;
    to = b;
  } else {
    const c = doc.indexOf('|');
    if (c >= 0) doc = doc.slice(0, c) + doc.slice(c + 1);
    from = to = c >= 0 ? c : doc.length;
  }
  await page.evaluate(([d, f, t]) => (window as any).macdownEditor.set(d, f, t), [doc, from, to] as const);
}

async function state(page: Page): Promise<EdState> {
  return page.evaluate(() => {
    const e = (window as any).macdownEditor;
    return { text: e.text(), ...e.selection() };
  });
}

/** Document with `|` at the cursor, or `«…»` around the selection. */
async function marked(page: Page): Promise<string> {
  const s = await state(page);
  if (s.from === s.to) return s.text.slice(0, s.from) + '|' + s.text.slice(s.from);
  return s.text.slice(0, s.from) + '«' + s.text.slice(s.from, s.to) + '»' + s.text.slice(s.to);
}

async function menu(page: Page, menuId: string, item: string) {
  await page.getByTestId(`menu-${menuId}`).click();
  await page.getByTestId(`menuitem-${item}`).click();
}

async function setClipboard(page: Page, text: string) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
}

const RESOLVED_DEFAULT =
  'indent-group text-formatting-group heading-group flexible-space list-group flexible-space blockquote code flexible-space link image flexible-space copy-html flexible-space layout';

// ---------------------------------------------------------------------------
// Toolbar (§4, F-13, F-14)
// ---------------------------------------------------------------------------
test.describe('§4 toolbar', () => {
  test('U-08 default items in the resolved order, with flexible spaces; Comment, Highlight, Strikethrough absent', async ({ page }) => {
    await open(page);
    const tb = page.getByTestId('toolbar');
    await expect(tb).toHaveAttribute('data-items', RESOLVED_DEFAULT);
    const order = await tb.evaluate((el) =>
      Array.from(el.children).map((c) => (c as HTMLElement).dataset.testid!.replace(/^toolbar-(item-)?/, '')),
    );
    expect(order.join(' ')).toBe(RESOLVED_DEFAULT);
    for (const id of ['comment', 'highlight', 'strikethrough']) await expect(page.getByTestId(`toolbar-${id}`)).toHaveCount(0);
    // Text Styles has exactly Strong, Emphasize, Underline.
    const styles = await page.getByTestId('toolbar-item-text-formatting-group').locator('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('title')));
    expect(styles).toEqual(['Strong', 'Emphasize', 'Underline']);
    // Tooltips equal the sub-item labels.
    await expect(page.getByTestId('toolbar-heading2')).toHaveAttribute('title', 'Heading 2');
  });

  const buttons: [string, string, string][] = [
    ['shift-right', 'a|', '\ta'],
    ['shift-left', '\ta|', 'a'],
    ['bold', '«x»', '**x**'],
    ['italic', '«x»', '*x*'],
    ['underline', '«x»', '_x_'],
    ['heading1', 'x|', '# x'],
    ['heading2', 'x|', '## x'],
    ['heading3', 'x|', '### x'],
    ['unordered-list', 'x|', '* x'],
    ['ordered-list', 'x|', '1. x'],
    ['blockquote', 'x|', '> x'],
    ['code', '«x»', '`x`'],
    ['link', '«x»', '[x]()'],
    ['image', '«x»', '![x]()'],
  ];
  for (const [id, before, after] of buttons) {
    test(`T-${id} toolbar ${id} runs its Format command`, async ({ page }) => {
      await open(page);
      await set(page, before);
      await page.getByTestId(`toolbar-${id}`).click();
      await expect.poll(async () => (await state(page)).text).toBe(after);
      // The editor keeps the focus (NSToolbar items do not take it).
      expect(await page.evaluate(() => document.activeElement?.classList.contains('cm-content'))).toBe(true);
    });
  }

  test('F-42 toolbar Underline works even while Format > Underline is hidden (P-11 off)', async ({ page }) => {
    await open(page);
    await page.getByTestId('menu-format').click();
    await expect(page.getByTestId('menuitem-underline')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await set(page, '«u»');
    await page.getByTestId('toolbar-underline').click();
    expect((await state(page)).text).toBe('_u_');
  });

  test('F-14 T-10..T-12 Comment, Highlight, Strikethrough through toolbarItemIdentifiers', async ({ page }) => {
    await open(page, q({ toolbarItemIdentifiers: ['comment', 'highlight', 'strikethrough', 'layout'] }));
    await expect(page.getByTestId('toolbar')).toHaveAttribute('data-items', 'comment highlight strikethrough layout');
    for (const [id, out] of [['comment', '<!--x-->'], ['highlight', '==x=='], ['strikethrough', '~~x~~']]) {
      await set(page, '«x»');
      await page.getByTestId(`toolbar-${id}`).click();
      expect((await state(page)).text).toBe(out);
    }
  });

  test('F-14 Customize Toolbar adds Comment in its original place; Use Default Set restores', async ({ page }) => {
    await open(page);
    await menu(page, 'view', 'customize-toolbar');
    await page.getByTestId('toolbar-customize-comment').check();
    await expect(page.getByTestId('toolbar')).toHaveAttribute('data-items', RESOLVED_DEFAULT.replace('copy-html', 'copy-html comment'));
    await page.getByTestId('toolbar-customize-default').click();
    await expect(page.getByTestId('toolbar')).toHaveAttribute('data-items', RESOLVED_DEFAULT);
    await page.getByTestId('toolbar-customize-done').click();
    await expect(page.getByTestId('toolbar-customize')).toHaveCount(0);
  });

  test('F-13 View > Hide Toolbar / Show Toolbar and Opt+Cmd+T', async ({ page }) => {
    await open(page);
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('menuitem-toggle-toolbar')).toContainText('Hide Toolbar');
    await page.getByTestId('menuitem-toggle-toolbar').click();
    await expect(page.getByTestId('toolbar')).toHaveCount(0);
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('menuitem-toggle-toolbar')).toContainText('Show Toolbar');
    await page.keyboard.press('Escape');
    await page.locator('[data-testid="editor"] .cm-content').click();
    await page.keyboard.press(`Alt+${await mod(page)}+KeyT`);
    await expect(page.getByTestId('toolbar')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Format menu shortcuts (§2.4, §3 Format)
// ---------------------------------------------------------------------------
test.describe('§2.4 Format shortcuts', () => {
  // [F-ID, keys (M = Cmd), before, after]
  const cases: [string, string, string, string][] = [
    ['F-40', 'M+b', 'a «b» c', 'a **«b»** c'],
    ['F-40', 'M+b', 'a **«b»** c', 'a «b» c'],
    ['F-40', 'M+b', '|', '**|**'],
    ['F-41', 'M+i', '«b»', '*«b»*'],
    ['F-41', 'M+i', '**«b»**', '***«b»***'],
    ['F-41', 'M+i', '***«b»***', '**«b»**'],
    ['F-45', 'M+k', '«c»', '`«c»`'],
    ['F-46', 'M+Slash', '«c»', '<!--«c»-->'],
    ['F-47', 'M+Digit1', 'ti|tle', '# ti|tle'],
    ['F-48', 'M+Digit2', '# ti|tle', '## ti|tle'],
    ['F-49', 'M+Digit3', 'a|', '### a|'],
    ['F-50', 'M+Digit4', 'a|', '#### a|'],
    ['F-51', 'M+Digit5', 'a|', '##### a|'],
    ['F-52', 'M+Digit6', 'a|', '###### a|'],
    ['F-53', 'M+Digit0', '## # a|', 'a|'],
    ['F-54', 'Shift+M+KeyO', '«a\nb»', '1. «a\n1. b»'], // selection shifted as toggleBlockWithPattern does
    ['F-54', 'Shift+M+KeyO', '«1. a\n12. b»', '«a\nb»'], // U-05 deviation
    ['F-55', 'Shift+M+KeyU', '«a\nb»', '* «a\n* b»'],
    ['F-55', 'Shift+M+KeyU', '«- a\n+ b»', '«a\nb»'],
    ['F-56', 'Shift+M+KeyB', '«a\n\nb»', '> «a\n> \n>» b'], // empty lines get the prefix but not the selection shift
    ['F-57', 'M+BracketRight', '«a\nb»', '\t«a\n\tb»'],
    ['F-58', 'M+BracketLeft', '«    a\n  \tb\n\tc»', '«a\nb\nc»'],
    ['F-59', 'Shift+M+KeyK', '«x»', '[x](|)'],
    ['F-59', 'Shift+M+KeyK', '[«x»]()', '«x»'],
    ['F-60', 'Shift+M+KeyI', '«x»', '![x](|)'],
    ['F-61', 'M+Enter', 'ab|cd', 'ab\n\n|cd'],
    ['F-61', 'M+Enter', 'a«b»c', 'a\n\n|c'],
    ['F-61', 'M+Enter', '* a\n|', '* a\n\n|'],
    ['F-61', 'M+Enter', '* item|', '* item\n\n|'],
  ];
  for (const [id, keys, before, after] of cases) {
    test(`${id} ${keys.replace('M', 'Cmd')}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`, async ({ page }) => {
      await open(page);
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.evaluate(() => navigator.clipboard.writeText('not a url'));
      await set(page, before);
      await page.keyboard.press(keys.replace('M', await mod(page)));
      await expect.poll(() => marked(page)).toBe(after);
    });
  }

  test('F-40 each Format command is a single undo step', async ({ page }) => {
    await open(page);
    await set(page, 'a «b» c');
    const m = await mod(page);
    await page.keyboard.press(`${m}+b`);
    await page.keyboard.press(`${m}+z`);
    expect((await state(page)).text).toBe('a b c');
  });

  test('F-162 Underline, Strikethrough, Highlight: hidden and inert unless their extension is on', async ({ page }) => {
    await open(page);
    const m = await mod(page);
    await page.getByTestId('menu-format').click();
    for (const id of ['underline', 'strikethrough', 'highlight']) await expect(page.getByTestId(`menuitem-${id}`)).toHaveCount(0);
    await page.keyboard.press('Escape');
    for (const k of ['KeyU', 'Minus', 'Equal']) {
      await set(page, '«x»');
      await page.keyboard.press(`${m}+${k}`);
      expect((await state(page)).text).toBe('x');
    }
  });

  test('F-162 with P-10, P-11, P-12 on the items show and the shortcuts work', async ({ page }) => {
    await open(page, q({ extensionUnderline: true, extensionStrikethough: true, extensionHighlight: true }));
    const m = await mod(page);
    for (const [k, out] of [['KeyU', '_x_'], ['Minus', '~~x~~'], ['Equal', '==x==']]) {
      await set(page, '«x»');
      await page.keyboard.press(`${m}+${k}`);
      expect((await state(page)).text).toBe(out);
    }
    // Live: switching the extension off hides the item again.
    await page.evaluate(() => (window as any).macdownPrefs.set({ extensionHighlight: false }));
    await page.getByTestId('menu-format').click();
    await expect(page.getByTestId('menuitem-underline')).toBeVisible();
    await expect(page.getByTestId('menuitem-highlight')).toHaveCount(0);
  });

  test('§3 Format menu items run their commands and show their shortcuts', async ({ page }) => {
    await open(page);
    const items: [string, string, string][] = [
      ['strong', '«x»', '**x**'],
      ['emphasize', '«x»', '*x*'],
      ['inline-code', '«x»', '`x`'],
      ['comment', '«x»', '<!--x-->'],
      ['header-4', 'x|', '#### x'],
      ['paragraph', '### x|', 'x'],
      ['ordered-list', 'x|', '1. x'],
      ['unordered-list', 'x|', '* x'],
      ['blockquote', 'x|', '> x'],
      ['shift-right', 'x|', '\tx'],
      ['shift-left', '\tx|', 'x'],
      ['new-paragraph', 'a|b', 'a\n\nb'],
    ];
    for (const [id, before, after] of items) {
      await set(page, before);
      await menu(page, 'format', id);
      expect((await state(page)).text, id).toBe(after);
    }
    await page.getByTestId('menu-format').click();
    const labels = await page.getByTestId('menu-format-dropdown').locator('[role^="menuitem"]').allInnerTexts();
    const flat = labels.map((l) => l.replace(/\s+/g, ' ').trim());
    expect(flat.some((l) => l.startsWith('New Paragraph'))).toBe(true);
    expect(flat.some((l) => l.startsWith('Header 1'))).toBe(true);
  });

  test('F-55 / F-80 Unordered List uses the P-45 marker', async ({ page }) => {
    await open(page, q({ editorUnorderedListMarkerType: 2 }));
    await set(page, '«a\nb»');
    await page.keyboard.press(`Shift+${await mod(page)}+KeyU`);
    expect((await state(page)).text).toBe('- a\n- b');
  });

  test('F-57 Shift Right with P-37 uses four spaces', async ({ page }) => {
    await open(page, q({ editorConvertTabs: true }));
    await set(page, '«a\n\nb»');
    await page.keyboard.press(`${await mod(page)}+BracketRight`);
    expect((await state(page)).text).toBe('    a\n    \n    b');
  });
});

// ---------------------------------------------------------------------------
// F-59 / F-60 clipboard URLs (U-06)
// ---------------------------------------------------------------------------
test.describe('F-59/F-60 Link and Image with a clipboard URL', () => {
  const urls: [string, boolean][] = [
    ['https://example.com/a?b=1', true],
    ['HTTP://EXAMPLE.COM', true],
    ['file:///Users/me/pic.png', true],
    ['ftp://example.com/x', false],
    ['mailto:a@b.c', false],
    ['example.com', false],
    ['just text', false],
  ];
  for (const [url, used] of urls) {
    test(`F-59 clipboard ${JSON.stringify(url)} is ${used ? 'inserted and selected' : 'ignored'}`, async ({ page }) => {
      await open(page);
      await setClipboard(page, url);
      await set(page, 'see «docs» now');
      await page.keyboard.press(`Shift+${await mod(page)}+KeyK`);
      if (used) await expect.poll(() => marked(page)).toBe(`see [docs](«${url}») now`);
      else await expect.poll(() => marked(page)).toBe('see [docs](|) now');
    });
  }

  test('F-60 Image with an https clipboard URL, from the toolbar', async ({ page }) => {
    await open(page);
    await setClipboard(page, 'https://example.com/i.png');
    await set(page, '«alt»');
    await page.getByTestId('toolbar-image').click();
    await expect.poll(() => marked(page)).toBe('![alt](«https://example.com/i.png»)');
  });

  test('F-59 removing the link ignores the clipboard', async ({ page }) => {
    await open(page);
    await setClipboard(page, 'https://example.com');
    await set(page, '[«x»]()');
    await page.keyboard.press(`Shift+${await mod(page)}+KeyK`);
    await expect.poll(() => marked(page)).toBe('«x»');
  });
});

// ---------------------------------------------------------------------------
// Editor behaviours (§5)
// ---------------------------------------------------------------------------
test.describe('§5.2 Return key', () => {
  const cases: [string, string, string, Record<string, unknown>?][] = [
    ['F-66', '* item|', '* item\n* |'],
    ['F-66', '- [ ] task|', '- [ ] task\n- |'],
    ['F-66', '  + nested|', '  + nested\n  + |'],
    ['F-80', '- a|', '- a\n- |', { editorUnorderedListMarkerType: 0 }],
    ['F-67', '1. one|', '1. one\n2. |'],
    ['F-67', '09. x|', '09. x\n10. |'],
    ['F-67 P-39 off', '3. x|', '3. x\n3. |', { editorAutoIncrementNumberedLists: false }],
    ['F-66 empty item', 'a\n* |', 'a\n\n|'],
    ['F-66 empty indented item', '  * |', '\n  |'],
    ['F-66 empty number', '1. |', '\n|'],
    ['F-68', '> quote|', '> quote\n> |'],
    ['F-68 empty quote is not ended', '> |', '> \n> |'],
    ['F-68 nested', '> > q|', '> > q\n> > |'],
    ['F-68 split', '> ab|cd', '> ab\n> |cd'],
    ['F-69', '    code|', '    code\n    |'],
    ['F-69 P-38 off', '\tx|', '\tx\n\t|', { editorInsertPrefixInBlock: false }],
    ['F-66 P-38 off', '* x|', '* x\n|', { editorInsertPrefixInBlock: false }],
    ['§5.2 plain', 'text|', 'text\n|'],
    ['§5.2 selection', '* «ab»', '* \n|'],
  ];
  for (const [id, before, after, prefs] of cases) {
    test(`${id}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`, async ({ page }) => {
      await open(page, prefs ? q(prefs) : '');
      await set(page, before);
      await page.keyboard.press('Enter');
      expect(await marked(page)).toBe(after);
    });
  }

  test('F-66 typing a list continues it, and Return on the empty item ends it', async ({ page }) => {
    await open(page);
    await set(page, '|');
    await page.keyboard.type('* a');
    await page.keyboard.press('Enter');
    await page.keyboard.type('b');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('after');
    expect(await marked(page)).toBe('* a\n* b\n\nafter|');
  });
});

test.describe('§5.3 Tab, Shift+Tab, Backspace, Home', () => {
  test('F-70 Tab inserts a tab; with P-37 spaces to the next 4-column stop; with a selection it indents', async ({ page }) => {
    await open(page);
    await set(page, 'ab|');
    await page.keyboard.press('Tab');
    expect(await marked(page)).toBe('ab\t|');
    await set(page, '«a\nb»');
    await page.keyboard.press('Tab');
    expect((await state(page)).text).toBe('\ta\n\tb');
  });

  test('F-70 P-37: ab + Tab gives two spaces; Tab at a stop gives four', async ({ page }) => {
    await open(page, q({ editorConvertTabs: true }));
    await set(page, 'ab|');
    await page.keyboard.press('Tab');
    expect(await marked(page)).toBe('ab  |');
    await page.keyboard.press('Tab');
    expect(await marked(page)).toBe('ab      |');
  });

  test('F-71 Shift+Tab unindents with and without a selection', async ({ page }) => {
    await open(page);
    await set(page, '\tab|');
    await page.keyboard.press('Shift+Tab');
    expect((await state(page)).text).toBe('ab');
    await set(page, '«    a\n\tb»');
    await page.keyboard.press('Shift+Tab');
    expect((await state(page)).text).toBe('a\nb');
  });

  test('F-72 P-37 Backspace deletes back to the previous 4-column stop; one space is a normal Backspace', async ({ page }) => {
    await open(page, q({ editorConvertTabs: true }));
    await set(page, 'x       |');
    await page.keyboard.press('Backspace');
    expect(await marked(page)).toBe('x   |');
    await set(page, 'ab |');
    await page.keyboard.press('Backspace');
    expect(await marked(page)).toBe('ab|');
  });

  test('F-72 P-37 off: Backspace deletes one space', async ({ page }) => {
    await open(page);
    await set(page, '        |');
    await page.keyboard.press('Backspace');
    expect(await marked(page)).toBe('       |');
  });

  test('F-73 P-40 smart Home: first non-whitespace, then line start', async ({ page }) => {
    await open(page, q({ editorSmartHome: true }));
    const home = (await mod(page)) === 'Meta' ? 'Meta+ArrowLeft' : 'Home';
    await set(page, 'x\n    abc|');
    await page.keyboard.press(home);
    expect(await marked(page)).toBe('x\n    |abc');
    await page.keyboard.press(home);
    expect(await marked(page)).toBe('x\n|    abc');
  });

  test('F-73 P-40 off: Cmd+Left goes to the line start', async ({ page }) => {
    await open(page);
    const home = (await mod(page)) === 'Meta' ? 'Meta+ArrowLeft' : 'Home';
    await set(page, 'x\n    abc|');
    await page.keyboard.press(home);
    expect(await marked(page)).toBe('x\n|    abc');
  });
});

test.describe('§5.1 auto-pair (P-36)', () => {
  test('F-62 off by default: typing ( inserts only (', async ({ page }) => {
    await open(page);
    await set(page, '|');
    await page.keyboard.type('(');
    expect(await marked(page)).toBe('(|');
  });

  const on = q({ editorCompleteMatchingCharacters: true });
  const typing: [string, string, string, string][] = [
    ['F-62 pair before a boundary', 'a |', '(', 'a (|)'],
    ['F-62 no pair before a letter', '|b', '(', '(|b'],
    ['F-62 quote needs a boundary before it (don\'t)', 'don|', "'", "don'|"],
    ['F-62 quote after a space', 'a |', '"', 'a "|"'],
    ['F-62 CJK bracket', '|', '「', '「|」'],
    ['F-64 skip the closing bracket', '(|)', ')', '()|'],
    ['F-62 quote inside an empty pair inserts a new pair (original quirk)', '"|"', '"', '""|""'],
    ['F-63 wrap with a bracket', 'a «b» c', '[', 'a [«b»] c'],
    ['F-63 wrap with markup', '«b»', '*', '*«b»*'],
    ['F-63 ~ does not wrap without P-10', '«b»', '~', '~|'],
    ['F-63 a closer replaces the selection', '«b»', ')', ')|'],
  ];
  for (const [id, before, ch, after] of typing) {
    test(`${id}: ${JSON.stringify(before)} + ${ch}`, async ({ page }) => {
      await open(page, on);
      await set(page, before);
      await page.keyboard.type(ch);
      expect(await marked(page)).toBe(after);
    });
  }

  test('F-63 ~ wraps with P-10 on', async ({ page }) => {
    await open(page, q({ editorCompleteMatchingCharacters: true, extensionStrikethough: true }));
    await set(page, '«b»');
    await page.keyboard.type('~');
    expect(await marked(page)).toBe('~«b»~');
  });

  test('F-65 Backspace between an empty pair deletes both; off without P-36', async ({ page }) => {
    await open(page, on);
    await set(page, 'x(|)');
    await page.keyboard.press('Backspace');
    expect(await marked(page)).toBe('x|');
    await open(page);
    await set(page, 'x(|)');
    await page.keyboard.press('Backspace');
    expect(await marked(page)).toBe('x|)');
  });

  test('§5.1 programmatic text (paste, setDoc helper) is never changed by the input rules', async ({ page }) => {
    await open(page, q({ editorCompleteMatchingCharacters: true }));
    const text = '* a\n(b "c\n> q\n1. x\n\tz';
    await setDoc(page, text);
    expect((await state(page)).text).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// Appearance (§8.4, F-75 to F-79)
// ---------------------------------------------------------------------------
test.describe('§8.4 appearance', () => {
  const content = (page: Page) => page.locator('[data-testid="editor"] .cm-content');

  test('F-75 / F-76 base font and line spacing: default Menlo 14 with 3 pt; preferences apply live', async ({ page }) => {
    await open(page);
    const css = () =>
      page.evaluate(() => {
        const s = getComputedStyle(document.querySelector('[data-testid="editor"] .cm-scroller')!);
        const ed = getComputedStyle(document.querySelector('[data-testid="editor"] .cm-editor')!);
        return { family: s.fontFamily, size: ed.fontSize, line: parseFloat(s.lineHeight), fs: parseFloat(ed.fontSize) };
      });
    const d = await css();
    expect(d.family).toContain('Menlo');
    expect(d.size).toBe('14px');
    expect(d.line).toBeCloseTo(14 * 1.17 + 3, 0);
    await page.evaluate(() => (window as any).macdownPrefs.set({ editorBaseFontInfo: { name: 'Courier-Regular', size: 20 }, editorLineSpacing: 10 }));
    await expect.poll(async () => (await css()).size).toBe('20px');
    const c = await css();
    expect(c.family).toMatch(/^"?Courier"?,/);
    expect(c.line).toBeCloseTo(20 * 1.17 + 10, 0);
  });

  test('F-77 text insets: default 15 x 30, preferences apply', async ({ page }) => {
    await open(page);
    await expect.poll(() => content(page).evaluate((el) => [getComputedStyle(el).paddingLeft, getComputedStyle(el).paddingTop])).toEqual(['15px', '30px']);
    await page.evaluate(() => (window as any).macdownPrefs.set({ editorHorizontalInset: 30, editorVerticalInset: 5 }));
    await expect.poll(() => content(page).evaluate((el) => [getComputedStyle(el).paddingLeft, getComputedStyle(el).paddingRight, getComputedStyle(el).paddingTop])).toEqual(['30px', '30px', '5px']);
  });

  test('F-78 P-35 width limit: inset = (width - max) x 0.45 when wider than 2 x inset + max, else the inset', async ({ page }) => {
    await open(page, q({ editorWidthLimited: true, editorMaximumWidth: 300 }));
    const read = () =>
      page.evaluate(() => {
        const sc = document.querySelector('[data-testid="editor"] .cm-scroller') as HTMLElement;
        const ct = document.querySelector('[data-testid="editor"] .cm-content') as HTMLElement;
        return { width: sc.clientWidth, left: parseFloat(getComputedStyle(ct).paddingLeft), right: parseFloat(getComputedStyle(ct).paddingRight) };
      });
    await expect.poll(async () => {
      const r = await read();
      return Math.abs(r.left - (r.width - 300) * 0.45) < 0.6 && r.left === r.right;
    }).toBe(true);
    // Narrower than 2 x 15 + max: the normal inset.
    await page.evaluate(() => (window as any).macdownPrefs.set({ editorMaximumWidth: 5000 }));
    await expect.poll(async () => (await read()).left).toBe(15);
    // Re-applied when the editor frame changes (drag the split to 3:1).
    await page.evaluate(() => (window as any).macdownPrefs.set({ editorMaximumWidth: 300 }));
    await page.getByTestId('menu-view').click();
    await page.getByTestId('menuitem-split-3-1').click();
    await expect.poll(async () => {
      const r = await read();
      return Math.abs(r.left - (r.width - 300) * 0.45) < 0.6;
    }).toBe(true);
  });

  test('F-78 / F-79 layout settles: no measure loop with the width limit and scroll past end on', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__raf = 0;
      const o = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => {
        (window as any).__raf++;
        return o(cb);
      };
    });
    await open(page, q({ editorWidthLimited: true, editorMaximumWidth: 300, editorScrollsPastEnd: true }));
    await set(page, Array.from({ length: 80 }, (_, i) => `line ${i} `.repeat(8)).join('\n'));
    await page.waitForTimeout(500);
    const a = await page.evaluate(() => (window as any).__raf);
    await page.waitForTimeout(1000);
    const b = await page.evaluate(() => (window as any).__raf);
    expect(b - a).toBeLessThan(5);
  });

  test('F-79 P-42 scroll past end adds bottom padding; off by default', async ({ page }) => {
    await open(page);
    const bottom = () => content(page).evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
    await set(page, Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n'));
    await expect.poll(bottom).toBe(30);
    await page.evaluate(() => (window as any).macdownPrefs.set({ editorScrollsPastEnd: true }));
    // Long document: min(content, visible) is the visible height, so the last line can reach the top.
    const visible = await page.evaluate(() => (document.querySelector('[data-testid="editor"] .cm-scroller') as HTMLElement).clientHeight);
    await expect.poll(bottom).toBeGreaterThan(visible - 120);
    // Trailing blank lines are subtracted.
    const before = await bottom();
    await set(page, Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n') + '\n\n\n\n\n');
    await expect.poll(bottom).toBeLessThan(before);
  });
});

// ---------------------------------------------------------------------------
// Edit menu (§2.6)
// ---------------------------------------------------------------------------
test.describe('§2.6 Edit menu', () => {
  test('F-96 Check Spelling While Typing is a checkable item, off by default, and drives spellcheck', async ({ page }) => {
    await open(page);
    const item = page.getByTestId('menuitem-check-spelling');
    const cm = page.locator('[data-testid="editor"] .cm-content');
    await expect(cm).toHaveAttribute('spellcheck', 'false');
    await page.getByTestId('menu-edit').click();
    await expect(item).toHaveAttribute('role', 'menuitemcheckbox');
    await expect(item).toHaveAttribute('aria-checked', 'false');
    await item.click();
    await expect(cm).toHaveAttribute('spellcheck', 'true');
    expect(await page.evaluate(() => (window as any).macdownPrefs.get().editorContinuousSpellCheckingEnabled)).toBe(true);
    await page.getByTestId('menu-edit').click();
    await expect(item).toHaveAttribute('aria-checked', 'true');
    await item.click();
    await expect(cm).toHaveAttribute('spellcheck', 'false');
  });

  test('F-105 to F-107 Transformations', async ({ page }) => {
    await open(page);
    for (const [id, out] of [['make-upper-case', 'HELLO WORLD'], ['make-lower-case', 'hello world'], ['capitalize', 'Hello World']]) {
      await set(page, '«hELLO wORLD»');
      await menu(page, 'edit', id);
      expect(await marked(page)).toBe(`«${out}»`);
    }
  });

  test('F-86 Delete removes the selection', async ({ page }) => {
    await open(page);
    await set(page, 'a«bc»d');
    await menu(page, 'edit', 'delete');
    expect(await marked(page)).toBe('a|d');
  });

  test('F-83 / F-84 / F-85 Cut, Copy and Paste from the menu', async ({ page }) => {
    await open(page);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await set(page, 'a«bc»d');
    await menu(page, 'edit', 'copy');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('bc');
    await menu(page, 'edit', 'cut');
    expect(await marked(page)).toBe('a|d');
    await menu(page, 'edit', 'paste');
    await expect.poll(() => marked(page)).toBe('abc|d');
  });

  test('F-89 Find and Replace (Opt+Cmd+F) opens the panel with the replace field focused; F-90 / F-91 Cmd+G / Shift+Cmd+G', async ({ page }) => {
    await open(page);
    await set(page, 'one two one two one|');
    const m = await mod(page);
    await page.keyboard.press(`Alt+${m}+KeyF`);
    await expect(page.locator('.cm-search input[name=replace]')).toBeFocused();
    await page.locator('.cm-search input[main-field]').fill('one');
    await page.locator('[data-testid="editor"] .cm-content').click();
    await page.evaluate(() => (window as any).macdownEditor.select(0));
    await page.keyboard.press(`${m}+g`);
    expect(await state(page)).toMatchObject({ from: 0, to: 3 });
    await page.keyboard.press(`${m}+g`);
    expect(await state(page)).toMatchObject({ from: 8, to: 11 });
    await page.keyboard.press(`Shift+${m}+g`);
    expect(await state(page)).toMatchObject({ from: 0, to: 3 });
  });

  test('F-92 Use Selection for Find (Cmd+E) then Find Next', async ({ page }) => {
    await open(page);
    await set(page, '«two» one two');
    const m = await mod(page);
    await page.keyboard.press(`${m}+e`);
    await page.keyboard.press(`${m}+g`);
    expect(await state(page)).toMatchObject({ from: 8, to: 11 });
  });

  test('F-93 Jump to Selection (Cmd+J) scrolls the selection into view without changing it', async ({ page }) => {
    await open(page);
    const doc = Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n');
    await set(page, doc);
    const pos = doc.indexOf('line 150');
    await page.evaluate((p) => (window as any).macdownEditor.select(p, p + 8), pos);
    await page.evaluate(() => (document.querySelector('[data-testid="editor"] .cm-scroller') as HTMLElement).scrollTop = 0);
    await page.keyboard.press(`${await mod(page)}+j`);
    await expect.poll(() => page.evaluate(() => (document.querySelector('[data-testid="editor"] .cm-scroller') as HTMLElement).scrollTop)).toBeGreaterThan(1000);
    expect(await state(page)).toMatchObject({ from: pos, to: pos + 8 });
  });
});

// ---------------------------------------------------------------------------
// Editor themes (§7.2, F-74, F-166)
// ---------------------------------------------------------------------------
const THEMES = [
  'Mou Fresh Air', 'Mou Fresh Air+', 'Mou Night', 'Mou Night+', 'Mou Paper', 'Mou Paper+',
  'Solarized (Dark)', 'Solarized (Dark)+', 'Solarized (Light)', 'Solarized (Light)+',
  'Tomorrow', 'Tomorrow Blue', 'Tomorrow+', 'Writer', 'Writer+',
];
const themeDir = fileURLToPath(new URL('../../src/editor/themes/', import.meta.url));
function themeBackground(name: string): string {
  const src = readFileSync(themeDir + name + '.style', 'utf8');
  const m = /^editor\s*\n(?:.*\n)*?background:\s*([0-9a-f]{6})/im.exec(src);
  return m ? '#' + m[1].toLowerCase() : '';
}
const rgbToHex = (rgb: string) => {
  const m = /rgba?\((\d+), (\d+), (\d+)/.exec(rgb);
  return m ? '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('') : rgb;
};

async function look(page: Page) {
  return page.evaluate(() => {
    const ed = document.querySelector('[data-testid="editor"] .cm-editor')!;
    const line = document.querySelector('[data-testid="editor"] .cm-line')!;
    const h1 = line.querySelector('span') ?? line;
    const cs = getComputedStyle(ed);
    return { bg: cs.backgroundColor, fg: cs.color, h1Size: getComputedStyle(h1).fontSize, h1Color: getComputedStyle(h1).color, theme: document.querySelector('[data-testid="editor"]')!.getAttribute('data-theme') };
  });
}

test.describe('§7.2 editor themes', () => {
  test('F-74 default theme is Tomorrow+ (dark background #2d2d2d, H1 24px)', async ({ page }) => {
    await open(page);
    await set(page, '# Head\n\ntext');
    const l = await look(page);
    expect(l.theme).toBe('Tomorrow+');
    expect(rgbToHex(l.bg)).toBe('#2d2d2d');
    expect(l.h1Size).toBe('24px');
  });

  test('F-74 / F-166 all 15 themes and "no theme" apply, with the file background and distinct looks', async ({ page }) => {
    const looks = new Map<string, string>();
    for (const name of [...THEMES, '']) {
      await open(page, q({ editorStyleName: name }));
      await set(page, '# Head\n\ntext');
      const l = await look(page);
      expect(l.theme).toBe(name);
      if (name) expect(rgbToHex(l.bg), name).toBe(themeBackground(name));
      else expect(rgbToHex(l.bg)).toBe('#ffffff');
      if (name.endsWith('+')) expect(l.h1Size, name).toBe('24px');
      looks.set(name || '(none)', [l.bg, l.fg, l.h1Size, l.h1Color].join('|'));
    }
    expect(new Set(looks.values()).size, JSON.stringify(Object.fromEntries(looks), null, 1)).toBe(THEMES.length + 1);
  });

  test('F-74 a theme switch applies live without losing the text or the selection', async ({ page }) => {
    await open(page);
    await set(page, '# a\n«b»');
    await page.evaluate(() => (window as any).macdownPrefs.set({ editorStyleName: 'Solarized (Light)' }));
    await expect.poll(async () => rgbToHex((await look(page)).bg)).toBe('#fdf6e3');
    expect(await marked(page)).toBe('# a\n«b»');
  });

  test('F-74 an unknown theme name falls back to the default styles', async ({ page }) => {
    await open(page, q({ editorStyleName: 'Nope' }));
    expect(rgbToHex((await look(page)).bg)).toBe('#ffffff');
  });
});
