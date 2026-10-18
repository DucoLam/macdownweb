/**
 * M3 rendering parity in the real preview (reverse-engineer's tests):
 * Prism, MathJax, task lists, TOC, Mermaid, Graphviz, preview styles,
 * live extension toggles and preview script safety. Also the keyboard
 * behaviour added for D-02 and D-03.
 */
import { test, expect, type Page } from '@playwright/test';
import { open, setDoc, splitState } from './helpers';

const frame = (page: Page) => page.frames().find((f) => f !== page.mainFrame())!;

/** Waits until the preview's scripts (Prism, MathJax, diagrams) have run. */
async function scriptsDone(page: Page) {
  await expect
    .poll(() => frame(page).evaluate(() => document.documentElement.dataset.macdownScripts), { timeout: 20_000 })
    .toBe('done');
}

async function show(page: Page, md: string, waitFor: string) {
  await setDoc(page, md);
  await expect.poll(() => frame(page).evaluate((s) => !!document.querySelector(s), waitFor), { timeout: 10_000 }).toBe(true);
  await scriptsDone(page);
}

test.describe('F-124 to F-127 Prism in the preview', () => {
  test('P-20 on: tokens, line numbers (P-22), language label (P-23 = 1) and theme (P-21)', async ({ page }) => {
    await open(
      page,
      '?pref.htmlSyntaxHighlighting=true&pref.htmlLineNumbers=true&pref.htmlCodeBlockAccessory=1&pref.htmlHighlightingThemeName=Okaidia',
    );
    await show(page, '```js\nvar a = 1;\nvar b = 2;\n```', 'code.language-javascript');
    await expect.poll(() => frame(page).evaluate(() => document.querySelectorAll('.token.keyword').length)).toBe(2);
    const r = await frame(page).evaluate(() => ({
      rows: document.querySelectorAll('.line-numbers-rows > span').length,
      label: document.querySelector('.prism-show-language-label')?.textContent,
      bg: getComputedStyle(document.querySelector('pre')!).backgroundColor,
    }));
    expect(r.rows).toBe(2);
    expect(r.label).toBe('JavaScript');
    expect(r.bg).toBe('rgb(39, 40, 34)'); // prism-okaidia.css: #272822
  });

  test('P-20 off (default): no highlighting', async ({ page }) => {
    await open(page);
    await show(page, '```js\nvar a = 1;\n```', 'code.language-javascript');
    expect(await frame(page).evaluate(() => document.querySelectorAll('.token').length)).toBe(0);
  });

  test('toggling P-20 live re-renders with and without tokens (F-141)', async ({ page }) => {
    await open(page);
    await show(page, '```python\nprint(1)\n```', 'code.language-python');
    await page.evaluate(() => (window as any).macdownPrefs.set({ htmlSyntaxHighlighting: true }));
    await expect.poll(() => frame(page).evaluate(() => document.querySelectorAll('.token').length)).toBeGreaterThan(0);
    await page.evaluate(() => (window as any).macdownPrefs.set({ htmlSyntaxHighlighting: false }));
    await expect.poll(() => frame(page).evaluate(() => document.querySelectorAll('.token').length)).toBe(0);
  });

  // show-information.css matches pre[class*='language-'][data-information];
  // only Prism adds language-… to the <pre>, so (as in the original) the label
  // shows when P-20 is on as well.
  test('P-23 = Custom shows data-information in the corner (show-information.css)', async ({ page }) => {
    await open(page, '?pref.htmlCodeBlockAccessory=2&pref.htmlSyntaxHighlighting=true');
    await show(page, '```python:hello.py\nprint("hi")\n```', 'pre[data-information]');
    const content = await frame(page).evaluate(() => getComputedStyle(document.querySelector('pre')!, '::before').content);
    expect(content).toBe('"hello.py"');
  });
  test('P-23 = Custom without P-20: data-information is present but not shown', async ({ page }) => {
    await open(page, '?pref.htmlCodeBlockAccessory=2');
    await show(page, '```python:hello.py\nprint("hi")\n```', 'pre[data-information="hello.py"]');
    const content = await frame(page).evaluate(() => getComputedStyle(document.querySelector('pre')!, '::before').content);
    expect(content).toBe('none');
  });
});

test.describe('F-130 / F-131 MathJax', () => {
  test('S-10 typesets inline and display math locally, with no CDN request', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith('http://localhost') && !r.url().startsWith('data:') && !r.url().startsWith('about:')) external.push(r.url());
    });
    await open(page, '?pref.htmlMathJax=true');
    await show(page, 'Inline \\\\( 1 + 1 \\\\) and $x$.\n\n$$\nA^T_S = B\n$$', 'p');
    await expect.poll(() => frame(page).evaluate(() => document.querySelectorAll('mjx-container').length), { timeout: 20_000 }).toBe(2);
    const r = await frame(page).evaluate(() => ({
      display: document.querySelectorAll('mjx-container[display="true"]').length,
      text: document.body.textContent,
    }));
    expect(r.display).toBe(1);
    expect(r.text).toContain('$x$'); // P-19 off: `$` is not a delimiter
    expect(external).toEqual([]);
  });

  test('P-19 on: $x$ is typeset too', async ({ page }) => {
    await open(page, '?pref.htmlMathJax=true&pref.htmlMathJaxInlineDollar=true');
    await show(page, 'a $x$ b', 'p');
    await expect.poll(() => frame(page).evaluate(() => document.querySelectorAll('mjx-container').length), { timeout: 20_000 }).toBe(1);
  });

  test('P-18 off (default): the delimiters stay as text', async ({ page }) => {
    await open(page);
    await show(page, '\\\\( x \\\\)', 'p');
    expect(await frame(page).evaluate(() => document.querySelectorAll('mjx-container').length)).toBe(0);
  });
});

test.describe('F-132 / F-123 task lists and TOC in the preview', () => {
  test('S-07 checkboxes are rendered and disabled (tasklist.js)', async ({ page }) => {
    await open(page, '?pref.htmlTaskList=true');
    await show(page, '- [ ] todo\n- [x] done', 'li.task-list-item');
    const boxes = await frame(page).evaluate(() =>
      Array.from(document.querySelectorAll('li.task-list-item input')).map((i) => [(i as HTMLInputElement).checked, (i as HTMLInputElement).disabled]),
    );
    expect(boxes).toEqual([
      [false, true],
      [true, true],
    ]);
  });

  test('S-08 TOC links scroll to the headers', async ({ page }) => {
    await open(page, '?pref.htmlRendersTOC=true');
    await show(page, '[TOC]\n\n# A\n## B\n# C', 'ul.toc');
    const links = await frame(page).evaluate(() => Array.from(document.querySelectorAll('ul.toc a')).map((a) => a.getAttribute('href')));
    expect(links).toEqual(['#toc_0', '#toc_1', '#toc_2']);
  });
});

test.describe('F-128 / F-129 Mermaid and Graphviz', () => {
  test('Mermaid (P-20 + P-24) replaces the block with an SVG', async ({ page }) => {
    await open(page, '?pref.htmlSyntaxHighlighting=true&pref.htmlMermaid=true');
    await show(page, '```mermaid\ngraph TD;\nA-->B;\n```', 'code.language-mermaid, svg');
    await expect.poll(() => frame(page).evaluate(() => !!document.querySelector('body > div > svg')), { timeout: 20_000 }).toBe(true);
    expect(await frame(page).evaluate(() => document.querySelector('code.language-mermaid'))).toBeNull();
  });

  test('Graphviz (P-20 + P-25) renders dot and the gv alias', async ({ page }) => {
    await open(page, '?pref.htmlSyntaxHighlighting=true&pref.htmlGraphviz=true');
    await show(page, '```dot\ndigraph { a -> b }\n```\n\n```gv\ndigraph { c -> d }\n```', 'code.language-dot, svg');
    await expect.poll(() => frame(page).evaluate(() => document.querySelectorAll('body > div > svg').length), { timeout: 30_000 }).toBe(2);
    expect(await frame(page).evaluate(() => document.querySelectorAll('svg g.node').length)).toBe(4);
  });

  test('Mermaid needs P-20: with only P-24 the block stays code', async ({ page }) => {
    await open(page, '?pref.htmlMermaid=true');
    await show(page, '```mermaid\ngraph TD;\nA-->B;\n```', 'code.language-mermaid');
    expect(await frame(page).evaluate(() => document.querySelectorAll('svg').length)).toBe(0);
  });
});

test.describe('F-136 / F-166 preview styles', () => {
  for (const name of ['Clearness', 'Clearness Dark', 'GitHub', 'GitHub2', 'Solarized (Dark)', 'Solarized (Light)']) {
    test(`style "${name}" is applied`, async ({ page }) => {
      await open(page, `?pref.htmlStyleName=${encodeURIComponent(JSON.stringify(name))}`);
      await show(page, '# Styled', 'h1');
      const css = await frame(page).evaluate(() => Array.from(document.querySelectorAll('style')).map((s) => s.textContent!.length));
      expect(css.length).toBe(1);
      expect(css[0]).toBeGreaterThan(500);
    });
  }
  test('"no style" (empty) leaves the preview unstyled', async ({ page }) => {
    await open(page, '?pref.htmlStyleName=%22%22');
    await show(page, '# Plain', 'h1');
    expect(await frame(page).evaluate(() => document.querySelectorAll('style').length)).toBe(0);
  });
});

test.describe('§8.2 extension toggles change the preview', () => {
  const cases: [string, string, string][] = [
    ['extensionUnderline', '_u_', 'u'],
    ['extensionHighlight', '==m==', 'mark'],
    ['extensionSuperscript', '2^10', 'sup'],
    ['extensionQuote', '"q"', 'q'],
    ['extensionStrikethough', '~~d~~', 'del'],
  ];
  for (const [key, md, tag] of cases) {
    test(`${key} on/off`, async ({ page }) => {
      await open(page);
      await show(page, md, 'p');
      expect(await frame(page).evaluate((t) => document.querySelectorAll(t).length, tag)).toBe(0);
      await page.evaluate((k) => (window as any).macdownPrefs.set({ [k]: true }), key);
      await expect.poll(() => frame(page).evaluate((t) => document.querySelectorAll(t).length, tag)).toBe(1);
    });
  }
  test('extensionSmartyPants on/off', async ({ page }) => {
    await open(page);
    await show(page, 'a -- b', 'p');
    await page.evaluate(() => (window as any).macdownPrefs.set({ extensionSmartyPants: true }));
    await expect.poll(() => frame(page).evaluate(() => document.querySelector('p')!.textContent)).toBe('a – b');
  });
});

test.describe('preview safety (scripts in the Markdown never run)', () => {
  test('raw HTML handlers and scripts do not run, with every script feature on', async ({ page }) => {
    await open(
      page,
      '?pref.htmlSyntaxHighlighting=true&pref.htmlMathJax=true&pref.htmlMermaid=true&pref.htmlTaskList=true&pref.htmlCodeBlockAccessory=1',
    );
    await show(
      page,
      '<img src="x:" onerror="window.top.__pwned=1">\n\n<script>window.top.__pwned=2</script>\n\n' +
        '<div><pre data-language="&lt;img src=x: onerror=window.top.__pwned=3&gt;"><code class="language-js">var a</code></pre></div>\n\n' +
        '```mermaid\ngraph TD;\nA["<img src=x: onerror=top.__pwned=4>"]-->B;\n```\n\n\\\\( \\href{javascript:top.__pwned=5}{x} \\\\)',
      'img',
    );
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
    expect(await page.getByTestId('preview-iframe').getAttribute('sandbox')).not.toContain('allow-scripts');
  });
});

test.describe('D-02 / D-03 keyboard access', () => {
  test('D-02 arrow keys move through the View menu; Escape returns to the title', async ({ page }) => {
    await open(page);
    await page.getByTestId('menu-view').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('menuitem-render')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('menuitem-split-1-3')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp'); // wraps to the last item
    await expect(page.getByTestId('menuitem-full-screen')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('menu-view-dropdown')).toHaveCount(0);
    await expect(page.getByTestId('menu-view')).toBeFocused();
  });

  test('D-02 Right/Left switch menus, Space opens, Enter activates an item', async ({ page }) => {
    await open(page);
    await page.getByTestId('menu-edit').focus();
    await page.keyboard.press(' ');
    await expect(page.getByTestId('menu-edit-dropdown')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('menu-view-dropdown')).toBeVisible();
    await page.keyboard.press('ArrowDown'); // Left 1:3 Right
    await page.keyboard.press('Enter');
    expect((await splitState(page)).ratio).toBe(0.25);
    await expect(page.getByTestId('menu-view-dropdown')).toHaveCount(0);
  });

  test('D-02 Layout pull-down: Down opens, arrows move, Enter toggles the pane', async ({ page }) => {
    await open(page);
    await page.getByTestId('toolbar-layout').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('layout-toggle-editor')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('layout-toggle-preview')).toBeFocused();
    await page.keyboard.press('Enter');
    expect((await splitState(page)).preview).toBe(false);
    await expect(page.getByTestId('toolbar-layout')).toBeFocused();
  });

  test('D-03 the divider is focusable and Left/Right resize the panes', async ({ page }) => {
    await open(page);
    await page.getByTestId('split-divider').focus();
    await page.keyboard.press('ArrowLeft');
    expect((await splitState(page)).ratio).toBe(0.48);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect((await splitState(page)).ratio).toBe(0.52);
    await expect(page.getByTestId('split-divider')).toHaveAttribute('aria-valuenow', '52');
  });
});
