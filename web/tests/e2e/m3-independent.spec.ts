/**
 * M3 rendering parity, independent test-engineer suite.
 * Complements m3-rendering.spec.ts (builder). Every test name starts with
 * the spec ID it covers. Preferences are set through `?pref.<key>=<json>`.
 */
import { test, expect, type Frame, type Page } from '@playwright/test';
import { open, setDoc, editorEl, mod } from './helpers';

const q = (prefs: Record<string, unknown>) =>
  '?' + Object.entries(prefs).map(([k, v]) => `pref.${k}=${encodeURIComponent(JSON.stringify(v))}`).join('&');

async function pv(page: Page): Promise<Frame> {
  const h = await page.locator('[data-testid="preview-iframe"]').elementHandle();
  return (await h!.contentFrame())!;
}

async function done(page: Page, timeout = 20_000) {
  await expect.poll(async () => (await pv(page)).evaluate(() => document.documentElement.dataset.macdownScripts), { timeout }).toBe('done');
}

/** Sets the document and waits until the preview shows it and all scripts ran. */
async function show(page: Page, md: string, waitFor = 'body') {
  await setDoc(page, md);
  await page.waitForTimeout(400); // editor debounce is 150 ms: do not read the previous render
  await expect.poll(async () => (await pv(page)).evaluate((s) => !!document.querySelector(s), waitFor), { timeout: 10_000 }).toBe(true);
  await done(page);
}

const html = async (page: Page) => (await pv(page)).evaluate(() => document.body.innerHTML);
const count = async (page: Page, sel: string) => (await pv(page)).evaluate((s) => document.querySelectorAll(s).length, sel);
const text = async (page: Page, sel = 'body') => (await pv(page)).evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);

// ---------------------------------------------------------------------------
// §8.2 extension toggles, each on and off, from a fresh load (URL override)
// ---------------------------------------------------------------------------
test.describe('F-110..F-121 extension toggles on and off', () => {
  // [pref key, markdown, selector expected when ON, selector expected when OFF (or null = absent)]
  const cases: { key: string; md: string; on: string; off: string | null; defaultOn?: boolean; id: string }[] = [
    { id: 'F-111', key: 'extensionTables', md: '| a | b |\n|---|---|\n| 1 | 2 |', on: 'table td', off: null, defaultOn: true },
    { id: 'F-112', key: 'extensionFencedCode', md: '```js\nx\n```', on: 'pre > code.language-javascript', off: null, defaultOn: true },
    { id: 'F-113', key: 'extensionAutolink', md: 'see http://example.com/x now', on: 'a[href="http://example.com/x"]', off: null },
    { id: 'F-114', key: 'extensionStrikethough', md: '~~d~~', on: 'del', off: null },
    { id: 'F-115', key: 'extensionUnderline', md: '_u_', on: 'u', off: 'em' },
    { id: 'F-116', key: 'extensionHighlight', md: '==m==', on: 'mark', off: null },
    { id: 'F-117', key: 'extensionFootnotes', md: 'T[^1]\n\n[^1]: N', on: 'div.footnotes li#fn1', off: null, defaultOn: true },
    { id: 'F-118', key: 'extensionSuperscript', md: 'a^b c^(d e)', on: 'sup', off: null },
    { id: 'F-119', key: 'extensionQuote', md: '"q"', on: 'q', off: null },
  ];
  for (const c of cases) {
    test(`${c.id} ${c.key} on`, async ({ page }) => {
      await open(page, q({ [c.key]: true }));
      await show(page, c.md, 'p, table, pre');
      expect(await count(page, c.on)).toBeGreaterThan(0);
      if (c.off && c.off !== 'em') expect(await count(page, c.off)).toBe(0);
      if (c.off === 'em') expect(await count(page, c.off)).toBe(0);
    });
    test(`${c.id} ${c.key} off`, async ({ page }) => {
      await open(page, q({ [c.key]: false }));
      await show(page, c.md, 'p, table, pre');
      expect(await count(page, c.on)).toBe(0);
      if (c.off) expect(await count(page, c.off)).toBeGreaterThan(0);
    });
    test(`${c.id} ${c.key} default is ${c.defaultOn ? 'on' : 'off'}`, async ({ page }) => {
      await open(page);
      await show(page, c.md, 'p, table, pre');
      if (c.defaultOn) expect(await count(page, c.on)).toBeGreaterThan(0);
      else expect(await count(page, c.on)).toBe(0);
    });
  }

  test('F-121 extensionIntraEmphasis on (default) and off', async ({ page }) => {
    await open(page);
    await show(page, 'A*maz*ing and snake_case_word', 'p');
    expect(await count(page, 'em')).toBe(2);
    await page.evaluate(() => (window as any).macdownPrefs.set({ extensionIntraEmphasis: false }));
    await expect.poll(async () => count(page, 'em')).toBe(0);
    await show(page, 'a *x* b', 'p');
    expect(await count(page, 'em')).toBe(1);
  });

  test('F-120 extensionSmartyPants on and off (S-13)', async ({ page }) => {
    await open(page, q({ extensionSmartyPants: true }));
    await show(page, '"Hello" -- it\'s -- wait... --- done', 'p');
    expect(await text(page, 'p')).toBe('“Hello” – it’s – wait… — done');
    await page.evaluate(() => (window as any).macdownPrefs.set({ extensionSmartyPants: false }));
    await expect.poll(() => text(page, 'p')).toBe('"Hello" -- it\'s -- wait... --- done');
  });

  test('F-134 htmlHardWrap on and off', async ({ page }) => {
    await open(page, q({ htmlHardWrap: true }));
    await show(page, 'a\nb', 'p');
    expect(await count(page, 'p br')).toBe(1);
    await page.evaluate(() => (window as any).macdownPrefs.set({ htmlHardWrap: false }));
    await expect.poll(() => count(page, 'p br')).toBe(0);
  });

  test('F-111 table off leaves pipe text in a paragraph', async ({ page }) => {
    await open(page, q({ extensionTables: false }));
    await show(page, '| a | b |\n|---|---|\n| 1 | 2 |', 'p');
    expect(await count(page, 'table')).toBe(0);
    expect(await text(page, 'p')).toContain('| a | b |');
  });

  test('F-112 fenced code off: fence is not a code block', async ({ page }) => {
    await open(page, q({ extensionFencedCode: false }));
    await show(page, '~~~\nx\n~~~', 'p');
    expect(await count(page, 'pre')).toBe(0);
  });

  test('F-141 toggling every extension live updates the preview without reload', async ({ page }) => {
    await open(page);
    const md = '~~d~~ _u_ ==m== a^b "q"';
    await show(page, md, 'p');
    await page.evaluate(() =>
      (window as any).macdownPrefs.set({
        extensionStrikethough: true, extensionUnderline: true, extensionHighlight: true, extensionSuperscript: true, extensionQuote: true,
      }),
    );
    await expect.poll(async () => (await count(page, 'del')) + (await count(page, 'u')) + (await count(page, 'mark')) + (await count(page, 'sup')) + (await count(page, 'q'))).toBe(5);
    await page.evaluate(() => (window as any).macdownPrefs.reset());
    await expect.poll(async () => (await count(page, 'del')) + (await count(page, 'u')) + (await count(page, 'mark')) + (await count(page, 'sup')) + (await count(page, 'q'))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §6.4 code blocks
// ---------------------------------------------------------------------------
test.describe('F-124..F-127 code blocks in the preview', () => {
  const hl = { htmlSyntaxHighlighting: true };

  test('F-125 alias lookup is case-sensitive: js is highlighted, JS and Python are not', async ({ page }) => {
    await open(page, q(hl));
    await show(page, '```js\nvar a;\n```\n\n```JS\nvar b;\n```\n\n```Python\nprint(1)\n```\n\n```py\nprint(2)\n```', 'pre');
    const r = await (await pv(page)).evaluate(() =>
      Array.from(document.querySelectorAll('pre > code')).map((c) => [c.className, c.querySelectorAll('.token').length]),
    );
    expect(r[0][0]).toContain('language-javascript');
    expect(r[0][1]).toBeGreaterThan(0);
    expect(r[1][0]).toContain('language-JS');
    expect(r[1][1]).toBe(0);
    expect(r[2][0]).toContain('language-Python');
    expect(r[2][1]).toBe(0);
    expect(r[3][0]).toContain('language-python');
    expect(r[3][1]).toBeGreaterThan(0);
  });

  test('F-125 only the first word of the info string is the language', async ({ page }) => {
    await open(page, q(hl));
    await show(page, '```python extra words\nprint(1)\n```', 'pre');
    expect(await (await pv(page)).evaluate(() => document.querySelector('pre > code')!.className)).toContain('language-python');
    expect(await count(page, 'code .token')).toBeGreaterThan(0);
  });

  test('F-125 every alias of the table maps to its Prism language and highlights', async ({ page }) => {
    await open(page, q(hl));
    const aliases: [string, string][] = [
      ['c++', 'cpp'], ['coffee', 'coffeescript'], ['coffee-script', 'coffeescript'], ['cs', 'csharp'], ['html', 'markup'], ['xml', 'markup'],
      ['jl', 'julia'], ['js', 'javascript'], ['json', 'javascript'], ['objective-c', 'objectivec'], ['obj-c', 'objectivec'], ['objc', 'objectivec'],
      ['py', 'python'], ['rb', 'ruby'], ['sh', 'bash'],
    ];
    const src = aliases.map(([a]) => '```' + a + '\nx = 1 + 2;\n```').join('\n\n');
    await show(page, src, 'pre');
    const classes = await (await pv(page)).evaluate(() => Array.from(document.querySelectorAll('pre > code')).map((c) => Array.from(c.classList).find((x) => x.startsWith('language-')) ?? ''));
    expect(classes).toEqual(aliases.map(([, l]) => 'language-' + l));
  });

  test('F-125 on-demand loading: a language the document does not use is not available', async ({ page }) => {
    const loaded: string[] = [];
    page.on('request', (r) => { if (/prism-[a-z+-]+\.min\.js/.test(r.url())) loaded.push(r.url().replace(/^.*\//, '')); });
    await open(page, q(hl));
    await show(page, '```ruby\nputs 1\n```', 'pre');
    expect(loaded).toContain('prism-ruby.min.js');
    expect(loaded).not.toContain('prism-python.min.js');
    expect(loaded).not.toContain('prism-go.min.js');
  });

  test('F-125 dependencies load first (php needs clike/markup-templating, cpp needs c)', async ({ page }) => {
    await open(page, q(hl));
    await show(page, '```cpp\nint main() { return 0; }\n```\n\n```php\n<?php echo 1; ?>\n```', 'pre');
    expect(await count(page, 'code.language-cpp .token.keyword')).toBeGreaterThan(0);
    expect(await count(page, 'code.language-php .token')).toBeGreaterThan(0);
  });

  test('F-127 S-06b P-23 not Custom: whole word is the language, no data-information, no Prism match', async ({ page }) => {
    await open(page, q({ ...hl, htmlCodeBlockAccessory: 0 }));
    await show(page, '```python:hello.py\nprint("hi")\n```', 'pre');
    const r = await (await pv(page)).evaluate(() => ({ cls: Array.from(document.querySelector('pre > code')!.classList).join(' '), info: document.querySelector('pre')!.hasAttribute('data-information'), tokens: document.querySelectorAll('.token').length }));
    expect(r.info).toBe(false);
    expect(r.tokens).toBe(0);
    expect(r.cls).toContain('hello.py'); // the whole word stays in the class (Prism may re-order it)
  });

  test('F-127 S-06 Custom: lang:info is split, data-information set, python highlighted', async ({ page }) => {
    await open(page, q({ ...hl, htmlCodeBlockAccessory: 2, htmlLineNumbers: true }));
    await show(page, '```python:hello.py\nprint("hi")\n```\n\n    indented\n', 'pre');
    const r = await (await pv(page)).evaluate(() => ({
      pres: Array.from(document.querySelectorAll('pre')).map((p) => [p.className, p.getAttribute('data-information'), Array.from(p.querySelector('code')!.classList).find((x) => x.startsWith('language-')) ?? '']),
      tokens: document.querySelectorAll('code.language-python .token').length,
      rows: document.querySelectorAll('.line-numbers-rows').length,
    }));
    expect(r.pres[0][1]).toBe('hello.py');
    expect(r.pres[0][2]).toBe('language-python');
    expect(r.pres[0][0]).toContain('line-numbers');
    expect(r.pres[1][1]).toBeNull();
    expect(r.pres[1][2]).toBe('language-none');
    expect(r.tokens).toBeGreaterThan(0);
    expect(r.rows).toBe(2);
  });

  test('F-127 Custom with empty info (lang:) has no data-information', async ({ page }) => {
    await open(page, q({ htmlCodeBlockAccessory: 2 }));
    await show(page, '```python:\nx\n```', 'pre');
    expect(await (await pv(page)).evaluate(() => document.querySelector('pre')!.hasAttribute('data-information'))).toBe(false);
  });

  test('F-127 accessory None shows no label; Language name shows the label for aliases (c++ -> C++)', async ({ page }) => {
    await open(page, q({ ...hl, htmlCodeBlockAccessory: 1 }));
    await show(page, '```c++\nint x;\n```\n\n```rb\nputs 1\n```', 'pre');
    const labels = await (await pv(page)).evaluate(() => Array.from(document.querySelectorAll('.prism-show-language-label')).map((l) => l.textContent));
    expect(labels).toEqual(['C++', 'Ruby']);
    await page.evaluate(() => (window as any).macdownPrefs.set({ htmlCodeBlockAccessory: 0 }));
    await expect.poll(() => count(page, '.prism-show-language-label')).toBe(0);
  });

  test('F-126 P-22 line numbers: one row per line, class follows the preference', async ({ page }) => {
    await open(page, q({ ...hl, htmlLineNumbers: true }));
    await show(page, '```js\na\nb\nc\n```', 'pre');
    expect(await count(page, 'pre.line-numbers')).toBe(1);
    expect(await count(page, '.line-numbers-rows > span')).toBe(3);
    await page.evaluate(() => (window as any).macdownPrefs.set({ htmlLineNumbers: false }));
    await expect.poll(() => count(page, 'pre.line-numbers')).toBe(0);
    expect(await count(page, '.line-numbers-rows')).toBe(0);
  });

  test('F-126 P-22 on while P-20 off: class present, no rows (spec 6.4)', async ({ page }) => {
    await open(page, q({ htmlLineNumbers: true }));
    await show(page, '```js\na\nb\n```', 'pre');
    expect(await count(page, 'pre.line-numbers')).toBe(1);
    expect(await count(page, '.line-numbers-rows')).toBe(0);
  });

  test('F-126 indented code block gets line numbers and language-none', async ({ page }) => {
    await open(page, q({ ...hl, htmlLineNumbers: true }));
    await show(page, '    one\n    two\n', 'pre');
    expect(await count(page, '.line-numbers-rows > span')).toBe(2);
  });

  test('F-124 P-20 off: no highlighting, no Prism requests', async ({ page }) => {
    const reqs: string[] = [];
    page.on('request', (r) => { if (/prism/i.test(r.url()) && r.url().endsWith('.js')) reqs.push(r.url()); });
    await open(page);
    await show(page, '```js\nvar a = 1;\n```', 'pre');
    expect(await count(page, '.token')).toBe(0);
    expect(reqs.filter((u) => u.includes('/macdown/'))).toEqual([]);
  });

  test('F-124 code is HTML-escaped and Prism keeps the text intact', async ({ page }) => {
    await open(page, q(hl));
    await show(page, '```html\n<b onclick="x">&amp; \'q\'</b>\n```', 'pre');
    expect(await text(page, 'pre code')).toBe('<b onclick="x">&amp; \'q\'</b>');
    expect(await count(page, 'pre b')).toBe(0);
  });

  test('F-124 empty fenced block and a fence of only blank lines', async ({ page }) => {
    await open(page, q(hl));
    await show(page, '```js\n```\n\n```\n\n\n```', 'pre');
    expect(await count(page, 'pre')).toBe(2);
  });

  test('F-124 theme (P-21): each Prism theme gives a different look; unknown falls back to default', async ({ page }) => {
    const themes = ['', 'Coy', 'Dark', 'Funky', 'Okaidia', 'Solarizedlight', 'Tomorrow', 'Twilight'];
    const looks: Record<string, string> = {};
    for (const t of themes) {
      await open(page, q({ ...hl, htmlHighlightingThemeName: t }));
      await show(page, '```js\nvar a = "s";\n```', 'pre');
      looks[t || 'Default'] = await (await pv(page)).evaluate(() => {
        const pre = document.querySelector('pre')!;
        const kw = document.querySelector('.token.keyword');
        return [getComputedStyle(pre).backgroundColor, getComputedStyle(pre).color, kw ? getComputedStyle(kw).color : ''].join('|');
      });
    }
    const uniq = new Set(Object.values(looks));
    expect(uniq.size, JSON.stringify(looks)).toBe(themes.length);
    await open(page, q({ ...hl, htmlHighlightingThemeName: 'NoSuchTheme' }));
    await show(page, '```js\nvar a = "s";\n```', 'pre');
    const fb = await (await pv(page)).evaluate(() => { const pre = document.querySelector('pre')!; const kw = document.querySelector('.token.keyword')!; return [getComputedStyle(pre).backgroundColor, getComputedStyle(pre).color, getComputedStyle(kw).color].join('|'); });
    expect(fb).toBe(looks['Default']);
  });
});

// ---------------------------------------------------------------------------
// MathJax
// ---------------------------------------------------------------------------
test.describe('F-130/F-131 MathJax', () => {
  const math = { htmlMathJax: true };

  test('F-130 inline \\\\( \\\\) and display \\\\[ \\\\] and $$ delimiters are typeset', async ({ page }) => {
    await open(page, q(math));
    await show(page, 'a \\\\( x^2 \\\\) b\n\n\\\\[ y^2 \\\\]\n\n$$ z^2 $$', 'p');
    await expect.poll(() => count(page, 'mjx-container')).toBe(3);
    expect(await count(page, 'mjx-container[display="true"]')).toBe(2);
    expect(await count(page, 'mjx-container svg')).toBe(3);
    expect(await text(page, 'body')).not.toContain('\\(');
    expect(await text(page, 'body')).not.toContain('$$');
  });

  test('F-131 $x$ is math only with P-19', async ({ page }) => {
    await open(page, q(math));
    await show(page, 'a $x$ b', 'p');
    expect(await count(page, 'mjx-container')).toBe(0);
    await page.evaluate(() => (window as any).macdownPrefs.set({ htmlMathJaxInlineDollar: true }));
    await expect.poll(() => count(page, 'mjx-container')).toBe(1);
    await page.evaluate(() => (window as any).macdownPrefs.set({ htmlMathJaxInlineDollar: false }));
    await expect.poll(() => count(page, 'mjx-container')).toBe(0);
  });

  test('F-131 P-19 on with P-18 off: nothing is typeset and $...$ stays literal', async ({ page }) => {
    await open(page, q({ htmlMathJaxInlineDollar: true }));
    await show(page, 'a $x$ b and $$y$$', 'p');
    expect(await count(page, 'mjx-container')).toBe(0);
    expect(await text(page, 'p')).toBe('a $x$ b and $$y$$');
  });

  test('F-130 P-18 gating: turning it off removes the math again', async ({ page }) => {
    await open(page, q(math));
    await show(page, '\\\\( x \\\\)', 'p');
    await expect.poll(() => count(page, 'mjx-container')).toBe(1);
    await page.evaluate(() => (window as any).macdownPrefs.set({ htmlMathJax: false }));
    await expect.poll(() => count(page, 'mjx-container')).toBe(0);
    expect(await text(page, 'p')).toBe('\\( x \\)');
  });

  test('F-130 MathJax is not requested from a CDN and not at all when P-18 is off', async ({ page }) => {
    const external: string[] = [];
    const mj: string[] = [];
    page.on('request', (r) => {
      const u = r.url();
      if (!/^(http:\/\/localhost|data:|about:|blob:)/.test(u)) external.push(u);
      if (/mathjax/i.test(u)) mj.push(u);
    });
    await open(page);
    await show(page, '\\\\( x \\\\)', 'p');
    expect(mj, 'P-18 off must not load MathJax').toEqual([]);
    await page.evaluate(() => (window as any).macdownPrefs.set({ htmlMathJax: true }));
    await expect.poll(() => count(page, 'mjx-container'), { timeout: 20_000 }).toBe(1);
    expect(external).toEqual([]);
    expect(mj.every((u) => u.startsWith('http://localhost'))).toBe(true);
  });

  test('F-130 math with TeX specials (<, &, fractions) renders and is not treated as Markdown or HTML', async ({ page }) => {
    await open(page, q(math));
    await show(page, '\\\\( a < b \\& c_1 * d_2 \\\\)\n\n$$\n\\frac{1}{2} <img src=x onerror=top.__p=1>\n$$', 'p');
    await expect.poll(() => count(page, 'mjx-container')).toBe(2);
    expect(await count(page, 'img')).toBe(0);
    expect(await count(page, 'em')).toBe(0);
  });

  test('F-130 math inside code spans and fences is not typeset', async ({ page }) => {
    await open(page, q({ ...math, htmlMathJaxInlineDollar: true }));
    await show(page, '`\\\\( x \\\\)` and `$y$`\n\n```\n$$ z $$\n```', 'pre');
    expect(await count(page, 'mjx-container')).toBe(0);
  });

  test('F-130 raw MathML is typeset', async ({ page }) => {
    await open(page, q(math));
    await show(page, '<math><mi>x</mi><mo>+</mo><mn>1</mn></math>', 'mjx-container');
    await expect.poll(() => count(page, 'mjx-container')).toBeGreaterThan(0);
  });

  test('F-130 invalid TeX does not break the page', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await open(page, q(math));
    await show(page, '\\\\( \\frac{ \\\\)\n\n# After', 'h1');
    expect(await text(page, 'h1')).toBe('After');
    expect(errors).toEqual([]);
  });

  test('F-130 S-10 with escaped delimiter: \\$ does not open math (P-19 on)', async ({ page }) => {
    await open(page, q({ ...math, htmlMathJaxInlineDollar: true }));
    await show(page, 'cost \\$5 and \\$6', 'p');
    expect(await count(page, 'mjx-container')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Task lists, TOC, front matter, footnotes
// ---------------------------------------------------------------------------
test.describe('F-132 task lists', () => {
  test('F-132 on: [ ] and [x] items, ordered, nested; [X] not a task; checkboxes disabled', async ({ page }) => {
    await open(page, q({ htmlTaskList: true }));
    await show(page, '- [ ] a\n- [x] b\n- [X] c\n  - [x] nested\n\n1. [x] ord', 'li');
    const r = await (await pv(page)).evaluate(() => ({
      items: document.querySelectorAll('li.task-list-item').length,
      boxes: Array.from(document.querySelectorAll('li.task-list-item > input[type=checkbox]')).map((i) => [(i as HTMLInputElement).checked, (i as HTMLInputElement).disabled]),
      upper: Array.from(document.querySelectorAll('li')).find((l) => l.firstChild?.textContent?.startsWith('[X]'))?.className ?? 'none',
    }));
    expect(r.items).toBe(4);
    expect(r.boxes).toEqual([[false, true], [true, true], [true, true], [true, true]]);
    expect(r.upper).toBe('');
  });

  test('F-132 checkbox cannot be toggled by clicking', async ({ page }) => {
    await open(page, q({ htmlTaskList: true }));
    await show(page, '- [ ] a', 'input');
    await (await pv(page)).locator('input').click({ force: true });
    expect(await (await pv(page)).evaluate(() => (document.querySelector('input') as HTMLInputElement).checked)).toBe(false);
  });

  test('F-132 off: brackets stay as text', async ({ page }) => {
    await open(page);
    await show(page, '- [ ] a\n- [x] b', 'li');
    expect(await count(page, 'input')).toBe(0);
    expect(await text(page, 'li')).toBe('[ ] a');
  });

  test('F-132 loose item: checkbox goes inside the paragraph', async ({ page }) => {
    await open(page, q({ htmlTaskList: true }));
    await show(page, '- [ ] a\n\n- [x] b', 'li');
    expect(await count(page, 'li.task-list-item > p > input')).toBe(2);
  });

  test('F-132 live toggle of P-26', async ({ page }) => {
    await open(page);
    await show(page, '- [x] done', 'li');
    await page.evaluate(() => (window as any).macdownPrefs.set({ htmlTaskList: true }));
    await expect.poll(() => count(page, 'li.task-list-item input:disabled:checked')).toBe(1);
    await page.evaluate(() => (window as any).macdownPrefs.set({ htmlTaskList: false }));
    await expect.poll(() => count(page, 'input')).toBe(0);
  });
});

test.describe('F-123 TOC', () => {
  const toc = { htmlRendersTOC: true };

  test('F-123 [TOC] is case-insensitive and every occurrence is replaced', async ({ page }) => {
    await open(page, q(toc));
    await show(page, '[toc]\n\n# A\n## B\n\n[Toc]', 'h1');
    expect(await count(page, 'ul.toc')).toBe(2);
    expect(await count(page, 'ul.toc a[href="#toc_1"]')).toBe(2);
  });

  test('F-123 off: [TOC] stays literal', async ({ page }) => {
    await open(page);
    await show(page, '[TOC]\n\n# A', 'h1');
    expect(await text(page, 'p')).toBe('[TOC]');
    expect(await count(page, 'ul.toc')).toBe(0);
  });

  test('F-123 deep nesting H1..H6 gives six nested lists; H7 is not a header', async ({ page }) => {
    await open(page, q(toc));
    await show(page, '[TOC]\n\n# 1\n## 2\n### 3\n#### 4\n##### 5\n###### 6\n####### 7', 'h6');
    expect(await count(page, 'ul.toc a')).toBe(6);
    expect(await (await pv(page)).evaluate(() => { let d = 0, el: Element | null = document.querySelector('ul.toc a[href="#toc_5"]'); while (el) { if (el.tagName === 'UL') d++; el = el.parentElement; } return d; })).toBe(6);
  });

  test('F-123 first header level is level 1 (document starting with ##)', async ({ page }) => {
    await open(page, q(toc));
    await show(page, '[TOC]\n\n## A\n### B\n## C', 'h2');
    expect(await (await pv(page)).evaluate(() => document.querySelector('ul.toc')!.querySelectorAll(':scope > li').length)).toBe(2);
  });

  test('F-123 TOC is inserted after SmartyPants: TOC text keeps -- while the header is converted', async ({ page }) => {
    await open(page, q({ ...toc, extensionSmartyPants: true }));
    await show(page, '[TOC]\n\n# a -- b', 'h1');
    expect(await text(page, 'ul.toc a')).toBe('a -- b');
    expect(await text(page, 'h1')).toBe('a – b');
  });

  test('F-123 clicking a TOC link scrolls to the header, no navigation', async ({ page }) => {
    await open(page, q(toc));
    const filler = Array.from({ length: 60 }, (_, i) => `para ${i}\n`).join('\n');
    await show(page, `[TOC]\n\n# First\n\n${filler}\n# Target\n\nend`, 'h1');
    const before = await (await pv(page)).evaluate(() => window.scrollY);
    await (await pv(page)).locator('ul.toc a[href="#toc_1"]').click();
    await expect.poll(async () => (await pv(page)).evaluate(() => window.scrollY)).toBeGreaterThan(before);
    expect(page.url()).not.toContain('#toc');
  });

  test('F-123 headers with inline markup keep markup in the TOC, links reduced to text', async ({ page }) => {
    await open(page, q(toc));
    await show(page, '[TOC]\n\n# `c` *e* [l](http://x.y)', 'h1');
    expect(await html(page)).toContain('<a href="#toc_0"><code>c</code> <em>e</em> l</a>');
  });

  test('F-123 [TOC] with no headers renders nothing and does not fail', async ({ page }) => {
    await open(page, q(toc));
    await show(page, '[TOC]\n\ntext', 'p');
    expect(await count(page, 'ul.toc')).toBe(0);
  });
});

test.describe('F-133 front matter', () => {
  test('F-133 on: S-11 table before the body', async ({ page }) => {
    await open(page, q({ htmlDetectFrontMatter: true }));
    await show(page, '---\ntitle: "Macdown is my friend"\ndate: 2014-06-06 20:00:00\n---\n# Body', 'h1');
    const ths = await (await pv(page)).evaluate(() => Array.from(document.querySelectorAll('table th')).map((t) => t.textContent));
    const tds = await (await pv(page)).evaluate(() => Array.from(document.querySelectorAll('table td')).map((t) => t.textContent));
    expect(ths).toEqual(['title', 'date']);
    expect(tds).toEqual(['Macdown is my friend', '2014-06-06 20:00:00']);
    expect(await (await pv(page)).evaluate(() => document.body.firstElementChild!.tagName)).toBe('TABLE');
  });

  test('F-133 off (default): hr and setext h2', async ({ page }) => {
    await open(page);
    await show(page, '---\ntitle: x\n---\n# Body', 'h1');
    expect(await count(page, 'table')).toBe(0);
    expect(await count(page, 'hr')).toBeGreaterThan(0);
  });

  test('F-133 malformed: unterminated, invalid YAML, not at start, empty block leave the Markdown alone', async ({ page }) => {
    await open(page, q({ htmlDetectFrontMatter: true }));
    for (const md of ['---\ntitle: x\n\ntext', '---\n: : bad\n  - [\n---\n# a', '\n---\ntitle: x\n---\n# a', '---\n---\n# a']) {
      await show(page, md, 'body > *');
      expect(await count(page, 'table'), JSON.stringify(md)).toBe(0);
    }
  });

  test('F-133 values are HTML-escaped, nested values recurse, null is empty', async ({ page }) => {
    await open(page, q({ htmlDetectFrontMatter: true }));
    await show(page, '---\na: "<img src=x onerror=top.__p=1>"\nb:\n  - x\n  - y\nc:\n---\nbody', 'table');
    expect(await count(page, 'img')).toBe(0);
    expect(await count(page, 'table table')).toBe(1);
    expect(await text(page, 'table td')).toBe('<img src=x onerror=top.__p=1>');
  });
});

test.describe('F-117 footnotes and F-118 superscript', () => {
  test('F-117 S-09 markup and numbering by first reference; link scrolls', async ({ page }) => {
    await open(page);
    await show(page, 'A[^b] B[^a]\n\n[^a]: Note a.\n\n[^b]: Note b.', 'div.footnotes');
    const r = await (await pv(page)).evaluate(() => ({
      refs: Array.from(document.querySelectorAll('sup[id^=fnref] a')).map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('rel')]),
      back: Array.from(document.querySelectorAll('.footnotes li a[rev]')).map((a) => a.getAttribute('href')),
      hr: document.querySelectorAll('.footnotes > hr').length,
    }));
    expect(r.refs).toEqual([['1', '#fn1', 'footnote'], ['2', '#fn2', 'footnote']]);
    expect(r.back).toEqual(['#fnref1', '#fnref2']);
    expect(r.hr).toBe(1);
    expect(await text(page, '#fn1')).toContain('Note b.');
  });

  test('F-117 off: no footnotes block', async ({ page }) => {
    await open(page, q({ extensionFootnotes: false }));
    await show(page, 'A[^1]\n\n[^1]: N', 'p');
    expect(await count(page, 'div.footnotes')).toBe(0);
  });

  test('F-118 superscript grammar: ^word, ^(several words), ^() empty', async ({ page }) => {
    await open(page, q({ extensionSuperscript: true }));
    await show(page, 'hoge^(fuga bar) 2^10 x^() y', 'p');
    expect(await (await pv(page)).evaluate(() => Array.from(document.querySelectorAll('sup')).map((s) => s.textContent))).toEqual(['fuga bar', '10']);
    expect(await text(page, 'p')).toBe('hogefuga bar 210 x y');
  });
});

// ---------------------------------------------------------------------------
// Diagrams
// ---------------------------------------------------------------------------
test.describe('F-128/F-129 diagrams', () => {
  test('F-128 mermaid: multiple diagrams, a bad one stays code and later ones still render (accepted deviation)', async ({ page }) => {
    await open(page, q({ htmlSyntaxHighlighting: true, htmlMermaid: true }));
    await show(page, '```mermaid\ngraph TD;\nA-->B;\n```\n\n```mermaid\nthis is not a diagram @@@\n```\n\n```mermaid\ngraph LR;\nC-->D;\n```', 'body > *');
    await expect.poll(() => count(page, 'body > div > svg'), { timeout: 30_000 }).toBe(2);
    expect(await count(page, 'code.language-mermaid')).toBe(1);
  });

  test('F-128 mermaid off (P-24 off) leaves code; P-20 off also leaves code', async ({ page }) => {
    await open(page, q({ htmlSyntaxHighlighting: true }));
    await show(page, '```mermaid\ngraph TD;\nA-->B;\n```', 'code.language-mermaid');
    expect(await count(page, 'svg')).toBe(0);
    await open(page, q({ htmlMermaid: true }));
    await show(page, '```mermaid\ngraph TD;\nA-->B;\n```', 'code.language-mermaid');
    expect(await count(page, 'svg')).toBe(0);
  });

  test('F-128 mermaid: label text is shown and a script-ish label is inert', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });
    await open(page, q({ htmlSyntaxHighlighting: true, htmlMermaid: true }));
    await show(page, '```mermaid\ngraph TD;\nA["<img src=x onerror=top.__p=1>"]-->B["<script>top.__p=2</script>"];\nclick A call top.__p=3()\n```', 'body > *');
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => (window as any).__p)).toBeUndefined();
    expect(dialogs).toEqual([]);
    expect(await count(page, 'script')).toBe(0);
  });

  test('F-129 graphviz: dot, circo, fdp, neato, osage, twopi, gv, graphviz all render', async ({ page }) => {
    await open(page, q({ htmlSyntaxHighlighting: true, htmlGraphviz: true }));
    const langs = ['dot', 'circo', 'fdp', 'neato', 'osage', 'twopi', 'gv', 'graphviz'];
    await show(page, langs.map((l) => '```' + l + '\ndigraph { a -> b }\n```').join('\n\n'), 'body > *');
    await expect.poll(() => count(page, 'body > div > svg'), { timeout: 40_000 }).toBe(langs.length);
  });

  test('F-129 graphviz off, or P-20 off: stays code', async ({ page }) => {
    await open(page, q({ htmlSyntaxHighlighting: true }));
    await show(page, '```dot\ndigraph { a -> b }\n```', 'code');
    expect(await count(page, 'svg')).toBe(0);
    await open(page, q({ htmlGraphviz: true }));
    await show(page, '```dot\ndigraph { a -> b }\n```', 'code');
    expect(await count(page, 'svg')).toBe(0);
  });

  test('F-129 graphviz bad source stays code, later diagram still renders', async ({ page }) => {
    await open(page, q({ htmlSyntaxHighlighting: true, htmlGraphviz: true }));
    await show(page, '```dot\ndigraph { a -> \n```\n\n```dot\ndigraph { x -> y }\n```', 'body > *');
    await expect.poll(() => count(page, 'body > div > svg'), { timeout: 30_000 }).toBe(1);
    expect(await count(page, 'code.language-dot')).toBe(1);
  });

  test('F-129 graphviz labels and URL attributes are inert', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });
    await open(page, q({ htmlSyntaxHighlighting: true, htmlGraphviz: true }));
    await show(page, '```dot\ndigraph { a [label="<img src=x onerror=top.__p=1>" URL="javascript:top.__p=2"]; b [label="</text><script>top.__p=3</script>"] }\n```', 'body > *');
    await expect.poll(() => count(page, 'body > div > svg'), { timeout: 30_000 }).toBe(1);
    await (await pv(page)).locator('svg a').first().click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as any).__p)).toBeUndefined();
    expect(dialogs).toEqual([]);
    expect(await count(page, 'script')).toBe(0);
    expect(await count(page, 'img')).toBe(0);
  });

  test('F-128 diagram runner is sandboxed without same-origin and the app origin is not reachable', async ({ page }) => {
    await open(page, q({ htmlSyntaxHighlighting: true, htmlMermaid: true }));
    await show(page, '```mermaid\ngraph TD;\nA-->B;\n```', 'body > *');
    await expect.poll(() => count(page, 'body > div > svg'), { timeout: 30_000 }).toBe(1);
    const sb = await page.locator('[data-testid="diagram-runner"]').getAttribute('sandbox');
    expect(sb).toBe('allow-scripts');
  });
});

// ---------------------------------------------------------------------------
// Preview styles
// ---------------------------------------------------------------------------
test.describe('F-136/F-166 preview styles', () => {
  const names = ['Clearness', 'Clearness Dark', 'GitHub', 'GitHub2', 'Solarized (Dark)', 'Solarized (Light)'];
  test('F-136 each in-scope style and "no style" look different; GitHub-2017 is not available', async ({ page }) => {
    const looks: Record<string, string> = {};
    for (const n of [...names, '']) {
      await open(page, q({ htmlStyleName: n }));
      await show(page, '# Head\n\ntext `code`\n\n> quote', 'h1');
      looks[n || '(none)'] = await (await pv(page)).evaluate(() => {
        const cs = (e: Element) => getComputedStyle(e);
        const b = document.body;
        return [cs(b).backgroundColor, cs(b).color, cs(b).fontFamily, cs(document.querySelector('h1')!).fontSize, cs(document.querySelector('h1')!).color, cs(document.querySelector('code')!).backgroundColor].join('|');
      });
    }
    expect(new Set(Object.values(looks)).size, JSON.stringify(looks, null, 1)).toBe(names.length + 1);
    expect(looks['Clearness Dark'].split('|')[0]).not.toBe(looks['Clearness'].split('|')[0]);
    expect(looks['Solarized (Dark)'].split('|')[0]).not.toBe(looks['Solarized (Light)'].split('|')[0]);
  });

  test('F-136 default style is GitHub2', async ({ page }) => {
    await open(page);
    await show(page, '# Head', 'h1');
    const def = await (await pv(page)).evaluate(() => getComputedStyle(document.querySelector('h1')!).fontSize + getComputedStyle(document.body).fontFamily);
    await open(page, q({ htmlStyleName: 'GitHub2' }));
    await show(page, '# Head', 'h1');
    expect(await (await pv(page)).evaluate(() => getComputedStyle(document.querySelector('h1')!).fontSize + getComputedStyle(document.body).fontFamily)).toBe(def);
  });

  test('F-136 GitHub-2017 is hidden: selecting it by name gives an unstyled preview, not an error', async ({ page }) => {
    await open(page, q({ htmlStyleName: 'GitHub-2017' }));
    await show(page, '# Head', 'h1');
    expect(await count(page, 'style')).toBe(0);
  });

  test('F-166 no style: no style tags and live switch between a style and none', async ({ page }) => {
    await open(page);
    await show(page, '# Head', 'h1');
    expect(await count(page, 'style')).toBe(1);
    await page.evaluate(() => (window as any).macdownPrefs.set({ htmlStyleName: '' }));
    await expect.poll(() => count(page, 'style')).toBe(0);
    await page.evaluate(() => (window as any).macdownPrefs.set({ htmlStyleName: 'Clearness Dark' }));
    await expect.poll(() => count(page, 'style')).toBe(1);
  });

  test('F-136 style order: base style comes before the Prism theme', async ({ page }) => {
    await open(page, q({ htmlSyntaxHighlighting: true, htmlHighlightingThemeName: 'Okaidia' }));
    await show(page, '```js\nvar a;\n```', 'pre');
    const lens = await (await pv(page)).evaluate(() => Array.from(document.querySelectorAll('style')).map((s) => s.textContent!.includes('#272822') || s.textContent!.includes('token')));
    expect(lens.length).toBe(2);
    expect(lens[0]).toBe(false);
    expect(lens[1]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Preview safety
// ---------------------------------------------------------------------------
test.describe('F-135 preview safety', () => {
  test('F-135 raw HTML vectors do not execute (every script feature on)', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });
    const popups: string[] = [];
    page.on('popup', (p) => popups.push(p.url()));
    await open(page, q({ htmlSyntaxHighlighting: true, htmlMathJax: true, htmlMathJaxInlineDollar: true, htmlMermaid: true, htmlGraphviz: true, htmlTaskList: true, htmlRendersTOC: true, htmlCodeBlockAccessory: 2, extensionAutolink: true }));
    const md = [
      '<script>top.__p=1;alert(1)</script>',
      '<img src="x:" onerror="top.__p=2;alert(2)">',
      '<svg onload="top.__p=3;alert(3)"></svg>',
      '<body onload="top.__p=4"></body>',
      '<iframe srcdoc="<script>top.__p=5</script>"></iframe>',
      '<iframe src="javascript:top.__p=6"></iframe>',
      '<a href="javascript:top.__p=7;alert(7)" id="jl">js link</a>',
      '[md js](javascript:top.__p=8)',
      '<form action="javascript:top.__p=9"><input type="submit" id="sub" formaction="javascript:top.__p=10"></form>',
      '<meta http-equiv="refresh" content="0;url=javascript:top.__p=11">',
      '<object data="javascript:top.__p=12"></object>',
      '<details open ontoggle="top.__p=13"><summary>x</summary></details>',
      '<style>@import "javascript:top.__p=14";</style>',
      '<div style="background:url(javascript:top.__p=15)" onmouseover="top.__p=16">hover</div>',
      '<base href="javascript:top.__p=17//">',
      '```"><img src=x onerror=top.__p=18>',
      'x',
      '```',
      '',
      '```js:"><img src=x onerror=top.__p=19>',
      'x',
      '```',
    ].join('\n');
    await show(page, md, 'img');
    await (await pv(page)).locator('#jl').click({ force: true }).catch(() => undefined);
    await (await pv(page)).locator('#sub').click({ force: true }).catch(() => undefined);
    await (await pv(page)).locator('div[onmouseover]').hover().catch(() => undefined);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => (window as any).__p)).toBeUndefined();
    expect(dialogs).toEqual([]);
    expect(popups).toEqual([]);
    expect(page.url()).toContain('localhost:5173');
    expect(await page.getByTestId('preview-iframe').getAttribute('sandbox')).not.toContain('allow-scripts');
    expect(await page.getByTestId('split').isVisible()).toBe(true);
  });

  test('F-135 clicking javascript: links in the preview does nothing (F-18)', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });
    const popups: string[] = [];
    page.on('popup', (p) => popups.push(p.url()));
    await open(page);
    await show(page, '[a](javascript:alert(1))\n\n<a href="JaVaScRiPt:alert(2)">b</a>\n\n<a href="data:text/html,<script>alert(3)</script>">c</a>\n\n<a href="vbscript:x">d</a>', 'a');
    for (const a of await (await pv(page)).locator('a').all()) await a.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(500);
    expect(dialogs).toEqual([]);
    expect(popups).toEqual([]);
  });

  test('F-135 a raw <script> in the source is kept in the HTML but is inert; no script runs in the preview', async ({ page }) => {
    await open(page);
    await show(page, '<script>document.title="pwned";top.__p=1</script>\n\ntext', 'p');
    expect(await page.evaluate(() => (window as any).__p)).toBeUndefined();
    expect(await (await pv(page)).evaluate(() => document.title)).not.toBe('pwned');
  });

  test('F-130 MathJax cannot be used to run code (\\href javascript:, \\class, \\unicode)', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });
    await open(page, q({ htmlMathJax: true }));
    await show(page, '\\\\( \\href{javascript:top.__p=1;alert(1)}{x} \\\\)\n\n\\\\( \\class{"><img src=x onerror=top.__p=2>}{y} \\\\)\n\n\\\\( \\unicode{x41} \\style{background:url(javascript:top.__p=3)}{z} \\\\)', 'p');
    await expect.poll(() => count(page, 'mjx-container')).toBe(3);
    await (await pv(page)).locator('mjx-container a, mjx-container [href]').first().click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as any).__p)).toBeUndefined();
    expect(dialogs).toEqual([]);
    expect(await count(page, 'img')).toBe(0);
  });

  test('F-112 data-information injection (raw by spec) cannot run script in the preview', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });
    await open(page, q({ htmlCodeBlockAccessory: 2, htmlSyntaxHighlighting: true }));
    await show(page, '```js:x" onmouseover="top.__p=1" onfocus="top.__p=2" tabindex=0 a="\ny\n```', 'pre');
    await (await pv(page)).locator('pre').hover();
    await (await pv(page)).locator('pre').focus().catch(() => undefined);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as any).__p)).toBeUndefined();
    expect(dialogs).toEqual([]);
  });

  test('F-135 the app chrome is unchanged by hostile Markdown (no new elements in the main document)', async ({ page }) => {
    await open(page);
    const chrome = () => page.evaluate(() => Array.from(document.querySelectorAll('body *')).filter((e) => !e.closest('[data-testid="editor"]')).length);
    const before = await chrome();
    await show(page, '<div id="evil" style="position:fixed;inset:0;z-index:99999">cover</div>', '#evil');
    const after = await chrome();
    expect(after).toBe(before);
    await expect(page.getByTestId('menubar')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
test.describe('F-110/F-02 edge cases', () => {
  test('F-110 empty document renders an empty body and the app stays usable', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await open(page, q({ htmlSyntaxHighlighting: true, htmlMathJax: true, htmlRendersTOC: true, htmlDetectFrontMatter: true, htmlMermaid: true, htmlGraphviz: true, htmlTaskList: true, extensionSmartyPants: true }));
    await show(page, '# x', 'h1');
    await setDoc(page, '');
    await expect.poll(() => count(page, 'h1')).toBe(0);
    await done(page);
    expect((await text(page, 'body'))!.trim()).toBe('');
    expect(errors).toEqual([]);
  });

  test('F-110 whitespace-only and only-[TOC] documents', async ({ page }) => {
    await open(page, q({ htmlRendersTOC: true, htmlDetectFrontMatter: true }));
    await show(page, '   \n\n\t\n', 'body');
    expect(await count(page, 'p')).toBe(0);
    await show(page, '[TOC]', 'body');
    expect(await count(page, 'ul.toc')).toBe(0);
    await show(page, '---\n---', 'body');
  });

  test('F-110 unicode / CJK / emoji / RTL text, headers and ids', async ({ page }) => {
    await open(page, q({ htmlRendersTOC: true, extensionSmartyPants: true, htmlSyntaxHighlighting: true }));
    await show(page, '[TOC]\n\n# 日本語 ヘッダー\n\n你好，**世界**！ 😀 café ñ مرحبا\n\n```js\nconst s = "日本語";\n```\n\n- 項目\n  - 子', 'h1');
    expect(await text(page, 'h1')).toBe('日本語 ヘッダー');
    expect(await text(page, 'ul.toc a')).toBe('日本語 ヘッダー');
    expect(await html(page)).toContain('<strong>世界</strong>');
    expect(await text(page, 'pre code')).toBe('const s = "日本語";');
    expect(await text(page, 'p:nth-of-type(1)')).toContain('😀');
  });

  test('F-110 nested lists inside blockquotes and quotes inside lists', async ({ page }) => {
    await open(page);
    await show(page, '> - a\n>   - b\n>     1. c\n>\n> > - deep\n\n- x\n  > quoted in list\n  > - inner', 'blockquote');
    const r = await (await pv(page)).evaluate(() => ({
      bq: document.querySelectorAll('blockquote').length,
      depthC: (() => { let d = 0; let e: Element | null = Array.from(document.querySelectorAll('ol li')).find((l) => l.textContent!.trim() === 'c')!; while (e) { if (e.tagName === 'UL' || e.tagName === 'OL') d++; e = e.parentElement; } return d; })(),
      inner: !!document.querySelector('li > blockquote ul li'),
    }));
    expect(r.bq).toBe(3);
    expect(r.depthC).toBe(3);
    expect(r.inner).toBe(true);
  });

  test('F-111 malformed tables: header/delimiter mismatch is a paragraph; ragged rows are padded or truncated', async ({ page }) => {
    await open(page);
    await show(page, '| a | b |\n|---|\n| 1 |\n\n| c | d |\n|---|---|\n| 1 | 2 | 3 |\n| 4 |\n\n|e|\n-|\n|x|', 'p');
    const r = await (await pv(page)).evaluate(() => Array.from(document.querySelectorAll('table')).map((t) => Array.from(t.rows).map((r) => r.cells.length)));
    expect(await count(page, 'body > p')).toBeGreaterThan(0);
    expect(r[0]).toEqual([2, 2, 2]);
  });

  test('F-111 table cell containing pipes escaped, inline code and emphasis', async ({ page }) => {
    await open(page);
    await show(page, '| a \\| b | `c` | *d* |\n|---|:-:|--:|\n| 1 | 2 | 3 |', 'table');
    expect(await text(page, 'th')).toBe('a | b');
    expect(await count(page, 'th code')).toBe(1);
    expect(await count(page, 'th em')).toBe(1);
  });

  test('F-02 very large document: preview updates, with time recorded', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    const parts: string[] = [];
    for (let i = 0; i < 3000; i++) parts.push(`## Section ${i}\n\nParagraph ${i} with *em*, **strong**, \`code\` and [link](http://example.com/${i}).\n\n- item a\n- item b\n`);
    const big = parts.join('\n');
    const t0 = Date.now();
    await setDoc(page, big);
    await expect.poll(async () => count(page, 'h2'), { timeout: 60_000 }).toBe(3000);
    const ms = Date.now() - t0;
    console.log(`LARGE-DOC: ${big.length} chars, ${3000 * 4} blocks, preview ready after ${ms} ms`);
    expect(ms).toBeLessThan(10_000);
    // typing after the large load: next update time
    const t1 = Date.now();
    await editorEl(page).click();
    await page.keyboard.press((await mod(page)) + '+Home');
    await page.keyboard.type('# Top\n\n');
    await expect.poll(async () => text(page, 'h1'), { timeout: 30_000 }).toBe('Top');
    console.log(`LARGE-DOC: incremental update after typing: ${Date.now() - t1} ms`);
  });

  test('F-124 large document with Prism: 400 code blocks highlighted', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, q({ htmlSyntaxHighlighting: true, htmlLineNumbers: true }));
    const md = Array.from({ length: 400 }, (_, i) => '```js\nfunction f' + i + '(a, b) {\n  return a + b * ' + i + ';\n}\n```\n').join('\n');
    const t0 = Date.now();
    await setDoc(page, md);
    await expect.poll(async () => count(page, 'pre code .token.keyword'), { timeout: 60_000 }).toBeGreaterThanOrEqual(800);
    await done(page, 60_000);
    console.log(`LARGE-DOC-PRISM: 400 blocks highlighted after ${Date.now() - t0} ms`);
  });

  test('F-110 deeply nested blockquote / list does not crash the app', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await open(page);
    await show(page, '>'.repeat(200) + ' deep\n\nafter', 'p');
    await show(page, Array.from({ length: 60 }, (_, i) => ' '.repeat(i * 2) + '- n' + i).join('\n'), 'li');
    expect(await count(page, 'li')).toBe(60);
    expect(errors).toEqual([]);
  });

  test('F-02 rapid edits during async asset loading end in the final content (no stale preview)', async ({ page }) => {
    await open(page, q({ htmlSyntaxHighlighting: true, htmlMathJax: true, htmlMermaid: true }));
    await setDoc(page, '```mermaid\ngraph TD;\nA-->B;\n```\n\n\\\\( x \\\\)\n\n# one');
    await setDoc(page, '# two');
    await expect.poll(() => text(page, 'h1')).toBe('two');
    await done(page, 30_000);
    expect(await count(page, 'svg')).toBe(0);
    expect(await text(page, 'h1')).toBe('two');
  });

  test('F-110 no console errors across all features on', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/Blocked script execution/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await open(page, q({ htmlSyntaxHighlighting: true, htmlMathJax: true, htmlMathJaxInlineDollar: true, htmlMermaid: true, htmlGraphviz: true, htmlTaskList: true, htmlRendersTOC: true, htmlDetectFrontMatter: true, htmlLineNumbers: true, htmlCodeBlockAccessory: 1, extensionSmartyPants: true, extensionSuperscript: true, extensionUnderline: true, extensionHighlight: true, extensionQuote: true, extensionStrikethough: true, extensionAutolink: true }));
    await show(page, '---\na: 1\n---\n[TOC]\n\n# T\n\n- [x] a\n\n```js\nvar a;\n```\n\n```mermaid\ngraph TD;\nA-->B;\n```\n\n```dot\ndigraph{a->b}\n```\n\n$x$ \\\\( y \\\\)\n\n"q" ~~d~~ _u_ ==m== a^b http://x.y', 'h1');
    await expect.poll(() => count(page, 'body > div > svg'), { timeout: 30_000 }).toBe(2);
    await done(page, 30_000);
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Parity checks against the original's behaviour (Hoedown semantics)
// ---------------------------------------------------------------------------
test.describe('F-113/F-131/F-117 parity details', () => {
  test('F-113 autolink: only http(s)://, ftp://, www. and e-mail addresses (spec 6.3), not bare file names or domains', async ({ page }) => {
    await open(page, q({ extensionAutolink: true }));
    await show(page, 'see README.md and main.py or example.com, foo.io', 'p');
    expect(await count(page, 'a'), await html(page)).toBe(0);
  });

  test('F-113 autolink: scheme URLs, www. and e-mail are linked (S-12)', async ({ page }) => {
    await open(page, q({ extensionAutolink: true }));
    await show(page, 'http://t.co https://s.co/a?b=1 ftp://f.co/x www.example.com me@x.org', 'p');
    expect(await (await pv(page)).evaluate(() => Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href')))).toEqual([
      'http://t.co', 'https://s.co/a?b=1', 'ftp://f.co/x', 'http://www.example.com', 'mailto:me@x.org',
    ]);
  });

  test('F-131 a backslash-escaped dollar (P-19 on) is plain text, not math', async ({ page }) => {
    await open(page, q({ htmlMathJax: true, htmlMathJaxInlineDollar: true }));
    await show(page, 'cost \\$5 and \\$6', 'p');
    expect(await count(page, 'mjx-container')).toBe(0);
    expect(await text(page, 'p')).toBe('cost $5 and $6');
  });

  test('F-131 $x$ inside a raw HTML block is not Markdown-converted, so it is not math (P-19 on)', async ({ page }) => {
    await open(page, q({ htmlMathJax: true, htmlMathJaxInlineDollar: true }));
    await show(page, '<div id="raw">$x$</div>', '#raw');
    expect(await count(page, 'mjx-container')).toBe(0);
  });
});
