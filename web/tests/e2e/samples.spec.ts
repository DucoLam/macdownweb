import { test, expect, type Page } from '@playwright/test';
import { open, setDoc } from './helpers';

/** Parsed structural view of the preview body: normalised, whitespace-insensitive. */
async function body(page: Page, waitFor: string): Promise<string> {
  const frame = () => page.frames().find((f) => f !== page.mainFrame())!;
  await expect.poll(() => frame().evaluate((sel) => !!document.querySelector(sel), waitFor), { timeout: 3000 }).toBe(true);
  return frame().evaluate(() => document.body.innerHTML);
}

/** Runs `fn` against a DOM built from the preview HTML (the iframe's own document). */
async function inFrame<T>(page: Page, fn: () => T): Promise<T> {
  return page.frames().find((f) => f !== page.mainFrame())!.evaluate(fn);
}

test.describe('Spec samples rendered in the preview iframe', () => {
  test('S-01 headers (ATX + setext) get toc_N ids (F-110, F-122)', async ({ page }) => {
    await open(page);
    await setDoc(page, '# Title\nSub\n---\n### Third');
    await body(page, 'h3');
    const hs = await inFrame(page, () => Array.from(document.body.children).map((e) => ({ tag: e.tagName, id: e.id, text: e.textContent })));
    expect(hs).toEqual([
      { tag: 'H1', id: 'toc_0', text: 'Title' },
      { tag: 'H2', id: 'toc_1', text: 'Sub' },
      { tag: 'H3', id: 'toc_2', text: 'Third' },
    ]);
  });

  test('S-01 header ids restart from toc_0 on each render and edits renumber them (F-122)', async ({ page }) => {
    await open(page);
    await setDoc(page, '# A\n## B\n');
    await body(page, 'h2');
    await setDoc(page, '## X\n# Y\n#### Z');
    await expect
      .poll(() => inFrame(page, () => Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => h.id).join(',')))
      .toBe('toc_0,toc_1,toc_2');
  });

  test('S-02 emphasis, strong and intra-word emphasis (F-110)', async ({ page }) => {
    await open(page);
    await setDoc(page, '**bold** *it* __b2__ _i2_ So A*maz*ing');
    await body(page, 'p');
    const p = await inFrame(page, () => {
      const el = document.querySelector('p')!;
      return {
        strong: Array.from(el.querySelectorAll('strong')).map((e) => e.textContent),
        em: Array.from(el.querySelectorAll('em')).map((e) => e.textContent),
        text: el.textContent,
        ambig: el.querySelector('em')!.nextSibling?.textContent,
      };
    });
    expect(p.strong).toEqual(['bold', 'b2']);
    expect(p.em).toEqual(['it', 'i2', 'maz']);
    expect(p.text).toBe('bold it b2 i2 So Amazing');
  });

  test('S-04 table with alignment (F-111)', async ({ page }) => {
    await open(page);
    await setDoc(page, '| Left | Center | Right |\n|:-----|:------:|------:|\n| a    | b      | c     |');
    await body(page, 'table');
    const t = await inFrame(page, () => {
      const cells = (sel: string) => Array.from(document.querySelectorAll(sel)).map((c) => [c.textContent, (c as HTMLElement).style.textAlign || c.getAttribute('align') || (c as HTMLElement).getAttribute('style')]);
      return { th: cells('thead tr th'), td: cells('tbody tr td'), tables: document.querySelectorAll('table').length };
    });
    expect(t.tables).toBe(1);
    expect(t.th.map((c) => c[0])).toEqual(['Left', 'Center', 'Right']);
    expect(t.td.map((c) => c[0])).toEqual(['a', 'b', 'c']);
    expect(t.th.map((c) => String(c[1]))).toEqual([expect.stringMatching(/left/), expect.stringMatching(/center/), expect.stringMatching(/right/)]);
    expect(t.td.map((c) => String(c[1]))).toEqual([expect.stringMatching(/left/), expect.stringMatching(/center/), expect.stringMatching(/right/)]);
  });

  test('S-05 fenced code with alias (F-112): div > pre > code.language-javascript', async ({ page }) => {
    await open(page);
    await setDoc(page, '```js\nvar a = 1 < 2;\n```');
    await body(page, 'pre');
    const c = await inFrame(page, () => {
      const code = document.querySelector('div > pre > code')!;
      return { cls: code.className, text: code.textContent, html: code.innerHTML };
    });
    expect(c.cls).toBe('language-javascript');
    expect(c.html).toContain('1 &lt; 2');
    // one trailing newline is stripped (hoedown_html_patch.c); spec S-05 shows the same
    expect(c.text).toBe('var a = 1 < 2;');
  });

  test('S-06 indented code uses language-none (F-112)', async ({ page }) => {
    await open(page);
    await setDoc(page, '    indented');
    await body(page, 'pre');
    expect(await inFrame(page, () => document.querySelector('div > pre > code')!.className)).toBe('language-none');
  });

  test('S-12 autolinks (F-113): on', async ({ page }) => {
    await open(page, '?pref.extensionAutolink=true');
    await setDoc(page, 'Visit http://t.co or www.example.com, mail <a@b.co>.');
    await body(page, 'a');
    const links = await inFrame(page, () => Array.from(document.querySelectorAll('a')).map((a) => [a.getAttribute('href'), a.textContent]));
    expect(links).toEqual([
      ['http://t.co', 'http://t.co'],
      ['http://www.example.com', 'www.example.com'],
      ['mailto:a@b.co', 'a@b.co'],
    ]);
    expect(await inFrame(page, () => document.querySelector('p')!.textContent)).toBe('Visit http://t.co or www.example.com, mail a@b.co.');
  });

  test('S-12 autolinks (F-113): default off links only <a@b.co>', async ({ page }) => {
    await open(page);
    await setDoc(page, 'Visit http://t.co or www.example.com, mail <a@b.co>.');
    await body(page, 'a');
    const links = await inFrame(page, () => Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href')));
    expect(links).toEqual(['mailto:a@b.co']);
  });

  test('S-14 hard wrap and raw HTML (F-134, F-135): P-29b on', async ({ page }) => {
    await open(page, '?pref.htmlHardWrap=true');
    await setDoc(page, 'line one\nline two\n\n<div class="x">raw <b>html</b></div>');
    await body(page, 'div.x');
    const r = await inFrame(page, () => ({
      br: document.querySelectorAll('p br').length,
      p: document.querySelector('p')!.textContent,
      div: document.querySelector('div.x')!.innerHTML,
      divParent: document.querySelector('div.x')!.parentElement!.tagName,
    }));
    expect(r.br).toBe(1);
    expect(r.p).toBe('line one\nline two');
    expect(r.div).toBe('raw <b>html</b>');
    expect(r.divParent).toBe('BODY');
  });

  test('S-14 hard wrap off (default): soft break, no <br>', async ({ page }) => {
    await open(page);
    await setDoc(page, 'line one\nline two\n\n<div class="x">raw <b>html</b></div>');
    await body(page, 'div.x');
    expect(await inFrame(page, () => document.querySelectorAll('p br').length)).toBe(0);
    expect(await inFrame(page, () => document.querySelector('p')!.textContent)).toBe('line one\nline two');
  });

  test('F-135 raw HTML is not escaped or sanitised (script tag present in source, not executed)', async ({ page }) => {
    await open(page);
    await setDoc(page, '<span id="raw" style="color:red" onclick="1">x</span>\n\n<script>window.top.__pwned=1</script>');
    await body(page, '#raw');
    expect(await inFrame(page, () => document.querySelector('#raw')!.getAttribute('style'))).toBe('color:red');
    expect(await inFrame(page, () => document.querySelectorAll('script').length)).toBeGreaterThanOrEqual(1);
    expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
  });

  test('S-15 lists and blockquote (F-110)', async ({ page }) => {
    await open(page);
    await setDoc(page, '* a\n* b\n    1. one\n    2. two\n\n> quote\n> > nested');
    await body(page, 'blockquote blockquote');
    const r = await inFrame(page, () => {
      const li = Array.from(document.querySelectorAll('body > ul > li'));
      return {
        top: li.map((l) => (l.firstChild?.textContent || '').trim()),
        nested: Array.from(document.querySelectorAll('body > ul > li:nth-child(2) > ol > li')).map((l) => l.textContent!.trim()),
        bq: document.querySelector('body > blockquote > p')!.textContent,
        bq2: document.querySelector('body > blockquote > blockquote > p')!.textContent,
      };
    });
    expect(r.top).toEqual(['a', 'b']);
    expect(r.nested).toEqual(['one', 'two']);
    expect(r.bq).toBe('quote');
    expect(r.bq2).toBe('nested');
  });

  test('F-114 strikethrough only when P-10 is on', async ({ page }) => {
    await open(page, '?pref.extensionStrikethough=true');
    await setDoc(page, '~~gone~~');
    await body(page, 'del');
    expect(await inFrame(page, () => document.querySelector('p > del')!.textContent)).toBe('gone');
  });

  test('F-110 inline HTML entities, hr, images, reference links, hard break with two spaces', async ({ page }) => {
    await open(page);
    await setDoc(page, 'a  \nb\n\n---\n\n![alt](http://x/y.png)\n\n[ref][1]\n\n[1]: http://x.test/ "T"');
    await body(page, 'hr');
    const r = await inFrame(page, () => ({
      br: document.querySelectorAll('p br').length,
      hr: document.querySelectorAll('hr').length,
      img: document.querySelector('img')?.getAttribute('alt'),
      a: document.querySelector('a')?.getAttribute('href'),
      title: document.querySelector('a')?.getAttribute('title'),
    }));
    expect(r).toEqual({ br: 1, hr: 1, img: 'alt', a: 'http://x.test/', title: 'T' });
  });
});
