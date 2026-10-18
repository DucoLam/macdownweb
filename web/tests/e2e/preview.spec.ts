import { test, expect } from '@playwright/test';
import { open, mod, setDoc, typeText, editorEl, preview, editorText, viewMenu } from './helpers';

test.describe('F-02 live preview', () => {
  test('F-02 preview updates after typing', async ({ page }) => {
    await open(page);
    await typeText(page, '# Hello *world*');
    await expect(preview(page).locator('h1')).toHaveText('Hello world');
    await expect(preview(page).locator('h1 em')).toHaveText('world');
  });

  test('F-02 preview is updated within 300 ms after typing stops', async ({ page }) => {
    await open(page);
    await editorEl(page).click();
    await page.evaluate(() => {
      const w = window as any;
      w.__lastInput = 0;
      document.addEventListener('input', () => (w.__lastInput = performance.now()), true);
    });
    await page.keyboard.type('# Timing marker', { delay: 20 });
    const elapsed = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const w = window as any;
          const frame = document.querySelector('[data-testid="preview-iframe"]') as HTMLIFrameElement;
          const tick = () => {
            if (frame.contentDocument?.querySelector('h1')?.textContent === 'Timing marker') resolve(performance.now() - w.__lastInput);
            else setTimeout(tick, 5);
          };
          tick();
        }),
    );
    console.log(`F-02 render latency after last keystroke: ${elapsed.toFixed(0)} ms`);
    expect(elapsed).toBeLessThan(300);
  });

  test('F-02 rapid typing is coalesced and the final state is rendered', async ({ page }) => {
    await open(page);
    await typeText(page, 'one two three four five six seven eight', { delay: 5 });
    await expect(preview(page).locator('p')).toHaveText('one two three four five six seven eight');
  });

  test('F-02 deleting all text empties the preview', async ({ page }) => {
    await open(page);
    await typeText(page, '# Gone');
    await expect(preview(page).locator('h1')).toHaveCount(1);
    await page.keyboard.press((await mod(page)) + '+a');
    await page.keyboard.press('Backspace');
    await expect(preview(page).locator('h1')).toHaveCount(0);
    await expect(preview(page).locator('body')).toHaveText(/^\s*$/);
  });

  test('F-02 preview scroll position is kept across re-renders', async ({ page }) => {
    await open(page, '?pref.editorSyncScrolling=false');
    const body = Array.from({ length: 60 }, (_, i) => `## Section ${i}\n\ntext ${i}\n`).join('\n');
    await setDoc(page, body);
    const frame = page.frames().find((f) => f !== page.mainFrame())!;
    await expect.poll(() => frame.evaluate(() => document.body.scrollHeight)).toBeGreaterThan(2000);
    await frame.evaluate(() => window.scrollTo(0, 600));
    await editorEl(page).click();
    await page.keyboard.press((await mod(page)) + '+End');
    await page.keyboard.type(' more');
    await expect(preview(page).locator('p').last()).toContainText('more', { timeout: 2000 });
    expect(await frame.evaluate(() => window.scrollY)).toBeGreaterThan(400);
  });
});

test.describe('F-03 Render Markdown', () => {
  test('F-03 with auto-update off, typing does not update; View > Render Markdown does', async ({ page }) => {
    await open(page, '?pref.markdownManualRender=true');
    await typeText(page, '# Manual');
    await page.waitForTimeout(500);
    await expect(preview(page).locator('h1')).toHaveCount(0);
    await viewMenu(page, 'render');
    await expect(preview(page).locator('h1')).toHaveText('Manual');
  });

  test('F-03 Cmd+R renders in manual mode', async ({ page }) => {
    await open(page, '?pref.markdownManualRender=true');
    await typeText(page, '# Keys');
    await page.waitForTimeout(400);
    await expect(preview(page).locator('h1')).toHaveCount(0);
    await page.keyboard.press((await mod(page)) + '+r');
    await expect(preview(page).locator('h1')).toHaveText('Keys');
  });
});

test.describe('F-11 scroll sync', () => {
  const doc = Array.from({ length: 40 }, (_, i) => `# Heading ${i}\n\n${'Paragraph text for the section. '.repeat(12)}\n\n${'More text. '.repeat(30)}\n`).join('\n');

  test('F-11 scrolling the editor scrolls the preview proportionally', async ({ page }) => {
    await open(page);
    await setDoc(page, doc);
    const frame = page.frames().find((f) => f !== page.mainFrame())!;
    await expect.poll(() => frame.evaluate(() => document.body.scrollHeight)).toBeGreaterThan(3000);
    const scroller = page.locator('[data-testid="editor"] .cm-scroller');
    const max = await scroller.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(max).toBeGreaterThan(1000);
    // after typing/pasting the caret is at the end, so start from a known position: top
    await scroller.evaluate((el) => (el.scrollTop = 0));
    await expect.poll(() => frame.evaluate(() => window.scrollY)).toBe(0);
    await scroller.evaluate((el, y) => (el.scrollTop = y), max / 2);
    await expect.poll(() => frame.evaluate(() => window.scrollY)).toBeGreaterThan(200);
    await page.waitForTimeout(150);
    const mid = await frame.evaluate(() => ({ y: window.scrollY, max: document.documentElement.scrollHeight - window.innerHeight }));
    expect(mid.y / mid.max).toBeGreaterThan(0.3);
    expect(mid.y / mid.max).toBeLessThan(0.7);
    await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect
      .poll(() => frame.evaluate(() => (document.documentElement.scrollHeight - window.innerHeight - window.scrollY)))
      .toBeLessThan(5);
    await scroller.evaluate((el) => (el.scrollTop = 0));
    await expect.poll(() => frame.evaluate(() => window.scrollY)).toBe(0);
  });

  test('F-11 with sync disabled (P-04 off) the preview does not follow', async ({ page }) => {
    await open(page, '?pref.editorSyncScrolling=false');
    await setDoc(page, doc);
    const frame = page.frames().find((f) => f !== page.mainFrame())!;
    await expect.poll(() => frame.evaluate(() => document.body.scrollHeight)).toBeGreaterThan(3000);
    const scroller = page.locator('[data-testid="editor"] .cm-scroller');
    await scroller.evaluate((el) => (el.scrollTop = (el.scrollHeight - el.clientHeight) / 2));
    await page.waitForTimeout(300);
    expect(await frame.evaluate(() => window.scrollY)).toBe(0);
  });
});

test.describe('F-12 word count', () => {
  test('F-12 hidden by default (P-05 off)', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('word-count')).toHaveCount(0);
  });

  test('F-12 shows words / characters / characters (no spaces) from the rendered text', async ({ page }) => {
    await open(page, '?pref.editorShowWordCount=true');
    const wc = page.getByTestId('word-count');
    await expect(wc).toBeVisible();
    await typeText(page, 'hello big world');
    await expect(wc.locator('option:checked')).toHaveText('3 words');
    const opts = await wc.locator('option').allTextContents();
    expect(opts).toEqual(['3 words', '15 characters', '13 characters (no spaces)']);
    await wc.selectOption({ index: 1 });
    await expect(wc.locator('option:checked')).toHaveText('15 characters');
    await wc.selectOption({ index: 2 });
    await expect(wc.locator('option:checked')).toHaveText('13 characters (no spaces)');
  });

  test('F-12 counts the rendered text, not the Markdown source', async ({ page }) => {
    await open(page, '?pref.editorShowWordCount=true');
    await typeText(page, '# Title\n\n**bold** text');
    // rendered: "Title" "bold" " text" -> 3 words; the source has 5 tokens
    await expect(page.getByTestId('word-count').locator('option').first()).toHaveText('3 words');
  });

  test('F-12 singular label for one word', async ({ page }) => {
    await open(page, '?pref.editorShowWordCount=true');
    await typeText(page, 'x');
    await expect(page.getByTestId('word-count').locator('option').first()).toHaveText('1 word');
  });

  test('F-12 code blocks count zero words, inline code counts one', async ({ page }) => {
    await open(page, '?pref.editorShowWordCount=true');
    await setDoc(page, '```\nalpha beta gamma\n```\n\nhi `a b c`');
    await expect(page.getByTestId('word-count').locator('option').first()).toHaveText('2 words');
  });

  test('F-12 empty document shows 0 words', async ({ page }) => {
    await open(page, '?pref.editorShowWordCount=true');
    await expect(page.getByTestId('word-count').locator('option').first()).toHaveText('0 words');
  });

  test('F-12 selected count type persists across re-render', async ({ page }) => {
    await open(page, '?pref.editorShowWordCount=true&pref.editorWordCountType=1');
    await typeText(page, 'abc def');
    await expect(page.getByTestId('word-count').locator('option:checked')).toHaveText('7 characters');
  });
});

test.describe('F-136 / F-139 preview style and template', () => {
  test('F-136 default style GitHub2 is applied to the preview', async ({ page }) => {
    await open(page);
    await typeText(page, '# Styled\n\ntext');
    await expect(preview(page).locator('h1')).toHaveText('Styled');
    const info = await page.frames().find((f) => f !== page.mainFrame())!.evaluate(() => {
      const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent).join('\n');
      return { hasStyle: css.length > 500, fontFamily: getComputedStyle(document.body).fontFamily, h1: getComputedStyle(document.querySelector('h1')!).fontSize };
    });
    expect(info.hasStyle).toBe(true);
    // GitHub2.css sets a Helvetica-based body font; the unstyled default is a serif (Times).
    expect(info.fontFamily.toLowerCase()).toMatch(/helvetica|arial|sans/);
    expect(parseFloat(info.h1)).toBeGreaterThan(24);
  });

  test('F-136 a different style (Solarized (Dark)) changes the colours; empty style means unstyled', async ({ page }) => {
    await open(page, '?pref.htmlStyleName=Solarized%20(Dark)');
    await typeText(page, 'dark');
    await expect(preview(page).locator('p')).toHaveText('dark');
    const bg = await page.frames().find((f) => f !== page.mainFrame())!.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    expect(bg).not.toBe('rgb(255, 255, 255)');
    await page.evaluate(() => (window as any).macdownPrefs.set({ htmlStyleName: '' }));
    await expect(preview(page).locator('p')).toHaveText('dark');
    const bg2 = await page.frames().find((f) => f !== page.mainFrame())!.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg2).toBe('rgba(0, 0, 0, 0)');
  });

  test('F-139 preview document uses the template (utf-8 meta, viewport, no title when untitled)', async ({ page }) => {
    await open(page);
    await typeText(page, 'x');
    await expect(preview(page).locator('p')).toHaveText('x');
    const f = page.frames().find((f) => f !== page.mainFrame())!;
    expect(await f.evaluate(() => document.doctype?.name)).toBe('html');
    expect(await f.evaluate(() => document.characterSet)).toBe('UTF-8');
    expect(await f.evaluate(() => document.querySelector('meta[name=viewport]')?.getAttribute('content'))).toContain('initial-scale=1.0');
    expect(await f.evaluate(() => document.querySelectorAll('title').length)).toBe(0);
  });
});

test.describe('F-81 / F-82 / F-87 / F-88 edit menu', () => {
  test('F-81 undo via Cmd+Z and Edit menu reverts typing, preview follows', async ({ page }) => {
    await open(page);
    await typeText(page, 'first');
    await page.waitForTimeout(700); // separate history groups
    await page.keyboard.type(' second');
    await expect(preview(page).locator('p')).toHaveText('first second');
    await page.keyboard.press((await mod(page)) + '+z');
    await expect(preview(page).locator('p')).toHaveText('first');
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('menuitem-undo').click();
    await expect(preview(page).locator('p')).toHaveCount(0);
    expect((await editorText(page)).trim()).toBe('');
  });

  test('F-82 redo via Shift+Cmd+Z and Edit menu re-applies', async ({ page }) => {
    await open(page);
    await typeText(page, 'first');
    await page.waitForTimeout(700);
    await page.keyboard.type(' second');
    await page.keyboard.press((await mod(page)) + '+z');
    await page.keyboard.press((await mod(page)) + '+z');
    await expect(preview(page).locator('p')).toHaveCount(0);
    await page.keyboard.press((await mod(page)) + '+Shift+z');
    await expect(preview(page).locator('p')).toHaveText('first');
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('menuitem-redo').click();
    await expect(preview(page).locator('p')).toHaveText('first second');
  });

  test('F-81 undo with empty history is a no-op (boundary)', async ({ page }) => {
    await open(page);
    await editorEl(page).click();
    await page.keyboard.press((await mod(page)) + '+z');
    await page.keyboard.press((await mod(page)) + '+Shift+z');
    expect((await editorText(page)).trim()).toBe('');
  });

  test('F-87 Select All via Cmd+A and Edit menu selects the whole editor text', async ({ page }) => {
    await open(page);
    await setDoc(page, 'line one\nline two');
    await editorEl(page).click();
    await page.keyboard.press((await mod(page)) + '+a');
    expect(await page.evaluate(() => getSelection()!.toString())).toContain('line one');
    await page.keyboard.press('ArrowRight');
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('menuitem-select-all').click();
    const sel = await page.evaluate(() => getSelection()!.toString());
    expect(sel).toContain('line one');
    expect(sel).toContain('line two');
    await page.keyboard.press('Backspace');
    await expect(preview(page).locator('p')).toHaveCount(0);
  });

  test('F-88 Find opens the search panel via Cmd+F and the Edit menu, and finds text', async ({ page }) => {
    await open(page);
    await setDoc(page, 'apple banana apple');
    await editorEl(page).click();
    await page.keyboard.press((await mod(page)) + '+f');
    const panel = page.locator('.cm-search');
    await expect(panel).toBeVisible();
    await page.keyboard.type('apple');
    await expect(page.locator('.cm-searchMatch').first()).toBeVisible();
    expect(await page.locator('.cm-searchMatch').count()).toBe(2);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('menuitem-find').click();
    await expect(panel).toBeVisible();
  });

  test('F-88 Find focuses the search field (Cmd+F)', async ({ page }) => {
    await open(page);
    await editorEl(page).click();
    await page.keyboard.press((await mod(page)) + '+f');
    await expect(page.locator('.cm-search input[name=search]')).toBeFocused();
  });

  test('F-88 Edit > Find... focuses the search field', async ({ page }) => {
    await open(page);
    await editorEl(page).click();
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('menuitem-find').click();
    await expect(page.locator('.cm-search')).toBeVisible();
    await expect(page.locator('.cm-search input[name=search]')).toBeFocused();
  });

  test('F-88 Find with no match shows no highlights', async ({ page }) => {
    await open(page);
    await setDoc(page, 'apple');
    await editorEl(page).click();
    await page.keyboard.press((await mod(page)) + '+f');
    await page.keyboard.type('zzz');
    await expect(page.locator('.cm-searchMatch')).toHaveCount(0);
  });

  test('F-81 Edit menu lists Undo, Redo, Select All, Find with shortcuts', async ({ page }) => {
    await open(page);
    await page.getByTestId('menu-edit').click();
    await expect(page.getByTestId('menuitem-undo')).toContainText('Undo');
    await expect(page.getByTestId('menuitem-redo')).toContainText('Redo');
    await expect(page.getByTestId('menuitem-select-all')).toContainText('Select All');
    await expect(page.getByTestId('menuitem-find')).toContainText('Find');
  });
});

test.describe('F-18 preview link handling', () => {
  test('F-18 in-page anchor scrolls the preview and does not navigate', async ({ page }) => {
    await open(page, '?pref.editorSyncScrolling=false');
    const filler = Array.from({ length: 60 }, (_, i) => `para ${i}\n`).join('\n');
    await setDoc(page, `[jump](#toc_1)\n\n# One\n\n${filler}\n# Two\n\nend`);
    const frame = page.frames().find((f) => f !== page.mainFrame())!;
    await expect(preview(page).locator('h1')).toHaveCount(2);
    await preview(page).locator('a').click();
    await expect.poll(() => frame.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    expect(page.url()).not.toContain('toc_1');
    await expect(preview(page).locator('a')).toHaveText('jump'); // preview not replaced
  });

  test('F-18 external link opens a new tab and the preview stays', async ({ page, context }) => {
    await open(page);
    await setDoc(page, '[ext](http://localhost:5173/ext-link-target)');
    const popupPromise = context.waitForEvent('page', { timeout: 3000 });
    await preview(page).locator('a').click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");
    expect(popup.url()).toContain('ext-link-target');
    await expect(preview(page).locator('a')).toHaveText('ext');
  });

  test('F-18 relative / other-scheme links do nothing', async ({ page, context }) => {
    await open(page);
    await setDoc(page, '[rel](other.md) [tel](tel:123)');
    let opened = 0;
    context.on('page', () => opened++);
    for (const i of [0, 1]) await preview(page).locator('a').nth(i).click();
    await page.waitForTimeout(300);
    expect(opened).toBe(0);
    await expect(preview(page).locator('a')).toHaveCount(2);
  });
});
