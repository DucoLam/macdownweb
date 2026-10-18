/**
 * M3 rendering parity: spec §10 samples S-01 to S-15 and S-06b, every
 * Markdown extension on and off (§8.2, §8.3), code blocks (§6.4), footnotes
 * (§6.5), TOC (§6.6), task lists (§6.7), front matter (§6.8), math (§6.9),
 * SmartyPants (U-14) and the §6.10 asset order.
 *
 * HTML is compared structurally: whitespace between tags is ignored and
 * `style="text-align:left"` is normalised.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  renderMarkdown,
  renderDocument,
  parseMarkdown,
  smartypants,
  mapLanguage,
  prismThemeFile,
  PRISM_THEME_NAMES,
  STYLE_NAMES,
  getStyleCss,
} from '../../src/render';
import { PRISM_COMPONENT_FILES, setAssetLoader, scriptIds } from '../../src/render/assets';
import { loadPrism, highlightAll } from '../../src/render/prism';
import { disableTaskCheckboxes, runPreviewScripts } from '../../src/render/postprocess';
import { renderToc } from '../../src/render/toc';
import { detectFrontMatter, frontMatterTitle } from '../../src/render/frontMatter';
import { withDefaults, parsePrefOverrides, type MacDownPreferences } from '../../src/prefs';

const PUBLIC = resolve(__dirname, '../../public/macdown');

const norm = (html: string) =>
  html
    .replace(/>\s*\n\s*</g, '><')
    .replace(/style="text-align:\s*(\w+)"/g, 'style="text-align: $1"')
    .trim();

const render = (md: string, overrides: Partial<MacDownPreferences> = {}) => norm(renderMarkdown(md, withDefaults(overrides)));

// ---------------------------------------------------------------------------
// §10 samples
// ---------------------------------------------------------------------------

describe('§10 samples S-01 to S-15', () => {
  it('S-01 headers (ATX + setext) with toc ids (F-110, F-122)', () => {
    expect(render('# Title\nSub\n---\n### Third')).toBe(
      '<h1 id="toc_0">Title</h1><h2 id="toc_1">Sub</h2><h3 id="toc_2">Third</h3>',
    );
  });

  it('S-02 emphasis, strong and intra-word emphasis (F-110, F-121)', () => {
    expect(render('**bold** *it* __b2__ _i2_ So A*maz*ing')).toBe(
      '<p><strong>bold</strong> <em>it</em> <strong>b2</strong> <em>i2</em> So A<em>maz</em>ing</p>',
    );
  });

  const s03 = '~~gone~~ _under_ ==mark== hoge^(fuga) 2^10 "Such editor"';
  it('S-03 optional inline extensions on (P-10, P-11, P-12, P-14, P-15)', () => {
    expect(
      render(s03, {
        extensionStrikethough: true,
        extensionUnderline: true,
        extensionHighlight: true,
        extensionSuperscript: true,
        extensionQuote: true,
      }),
    ).toBe('<p><del>gone</del> <u>under</u> <mark>mark</mark> hoge<sup>fuga</sup> 2<sup>10</sup> <q>Such editor</q></p>');
  });
  it('S-03 the same extensions off', () => {
    expect(render(s03)).toBe('<p>~~gone~~ <em>under</em> ==mark== hoge^(fuga) 2^10 &quot;Such editor&quot;</p>');
  });

  const s04 = '| Left | Center | Right |\n|:-----|:------:|------:|\n| a    | b      | c     |';
  it('S-04 table with alignment (P-07 on)', () => {
    expect(render(s04)).toBe(
      norm(`<table><thead><tr><th style="text-align: left">Left</th><th style="text-align: center">Center</th><th style="text-align: right">Right</th></tr></thead>
<tbody><tr><td style="text-align: left">a</td><td style="text-align: center">b</td><td style="text-align: right">c</td></tr></tbody></table>`),
    );
  });
  it('S-04 P-07 off gives a single paragraph', () => {
    const h = render(s04, { extensionTables: false });
    expect(h.match(/<p>/g)).toHaveLength(1);
    expect(h).not.toContain('<table');
  });

  it('S-05 fenced code with alias, highlighting off', () => {
    expect(render('```js\nvar a = 1 < 2;\n```')).toBe(
      '<div><pre><code class="language-javascript">var a = 1 &lt; 2;</code></pre></div>',
    );
  });

  it('S-06 line numbers and info (P-20, P-22 on, P-23 = Custom)', () => {
    expect(
      render('```python:hello.py\nprint("hi")\n```\n\n    indented', {
        htmlSyntaxHighlighting: true,
        htmlLineNumbers: true,
        htmlCodeBlockAccessory: 2,
      }),
    ).toBe(
      '<div><pre class="line-numbers" data-information="hello.py"><code class="language-python">print(&quot;hi&quot;)</code></pre></div>' +
        '<div><pre class="line-numbers"><code class="language-none">indented</code></pre></div>',
    );
  });

  it('S-06b info string without Custom accessory', () => {
    expect(render('```python:hello.py\nprint("hi")\n```')).toBe(
      '<div><pre><code class="language-python:hello.py">print(&quot;hi&quot;)</code></pre></div>',
    );
    expect(render('```Python\nx\n```')).toContain('class="language-Python"');
    expect(render('```JS\nx\n```')).toContain('class="language-JS"');
    expect(render('```python extra words\nx\n```')).toContain('class="language-python"');
  });

  const s07 = '- [ ] todo\n- [x] done\n1. [x] ordered';
  it('S-07 task list (P-26 on), checkboxes disabled by tasklist.js', () => {
    const html = render(s07, { htmlTaskList: true });
    expect(html).toBe(
      '<ul><li class="task-list-item"><input type="checkbox"> todo</li><li class="task-list-item"><input type="checkbox" checked> done</li></ul>' +
        '<ol><li class="task-list-item"><input type="checkbox" checked> ordered</li></ol>',
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    disableTaskCheckboxes(doc);
    expect(Array.from(doc.querySelectorAll('input')).map((i) => i.disabled)).toEqual([true, true, true]);
  });
  it('S-07 P-26 off leaves the brackets', () => {
    expect(render(s07)).toBe('<ul><li>[ ] todo</li><li>[x] done</li></ul><ol><li>[x] ordered</li></ol>');
  });

  const s08 = '[TOC]\n\n# A\n## B\n# C';
  it('S-08 TOC (P-27 on)', () => {
    expect(render(s08, { htmlRendersTOC: true })).toBe(
      '<ul class="toc"><li><a href="#toc_0">A</a><ul><li><a href="#toc_1">B</a></li></ul></li><li><a href="#toc_2">C</a></li></ul>' +
        '<h1 id="toc_0">A</h1><h2 id="toc_1">B</h2><h1 id="toc_2">C</h1>',
    );
  });
  it('S-08 P-27 off renders [TOC] literally', () => {
    expect(render(s08)).toBe('<p>[TOC]</p><h1 id="toc_0">A</h1><h2 id="toc_1">B</h2><h1 id="toc_2">C</h1>');
  });

  it('S-09 footnotes (P-13 on, the default)', () => {
    expect(render('Text[^n].\n\n[^n]: Note.\n')).toBe(
      norm(`<p>Text<sup id="fnref1"><a href="#fn1" rel="footnote">1</a></sup>.</p>
<div class="footnotes"><hr><ol>
<li id="fn1"><p>Note.&nbsp;<a href="#fnref1" rev="footnote">&#8617;</a></p></li>
</ol></div>`),
    );
  });

  const s10 = 'Inline \\\\( 1 + 1 \\\\) and $x$.\n\n$$\nA^T_S = B\n$$';
  it('S-10 math, P-18 on and P-19 off', () => {
    expect(render(s10, { htmlMathJax: true })).toBe('<p>Inline \\( 1 + 1 \\) and $x$.</p><p>\\[\nA^T_S = B\n\\]</p>');
  });
  it('S-10 math, P-19 on: $x$ becomes \\(x\\)', () => {
    expect(render(s10, { htmlMathJax: true, htmlMathJaxInlineDollar: true })).toContain('and \\(x\\).');
  });

  const s11 = '---\ntitle: "Macdown is my friend"\ndate: 2014-06-06 20:00:00\n---\n# Body';
  it('S-11 front matter (P-28 on)', () => {
    expect(render(s11, { htmlDetectFrontMatter: true })).toBe(
      '<table><thead><tr><th>title</th><th>date</th></tr></thead><tbody><tr><td>Macdown is my friend</td><td>2014-06-06 20:00:00</td></tr></tbody></table>' +
        '<h1 id="toc_0">Body</h1>',
    );
    const fm = detectFrontMatter(s11);
    expect(frontMatterTitle(fm!.value)).toBe('Macdown is my friend');
  });
  it('S-11 P-28 off renders the block as Markdown (hr, then setext h2)', () => {
    const h = render(s11);
    expect(h.startsWith('<hr>')).toBe(true);
    expect(h).toContain('<h2 id="toc_0">');
    expect(h).not.toContain('<table');
  });

  const s12 = 'Visit http://t.co or www.example.com, mail <a@b.co>.';
  it('S-12 autolink on (P-09)', () => {
    expect(render(s12, { extensionAutolink: true })).toBe(
      '<p>Visit <a href="http://t.co">http://t.co</a> or <a href="http://www.example.com">www.example.com</a>, mail <a href="mailto:a@b.co">a@b.co</a>.</p>',
    );
  });
  it('S-12 autolink off: only <a@b.co> is a link', () => {
    expect(render(s12).match(/<a /g)).toHaveLength(1);
  });

  it('S-13 SmartyPants (P-16 on, P-15 off)', () => {
    expect(render('"Hello" -- it\'s -- wait... --- done', { extensionSmartyPants: true })).toBe(
      '<p>&ldquo;Hello&rdquo; &ndash; it&rsquo;s &ndash; wait&hellip; &mdash; done</p>',
    );
  });

  const s14 = 'line one\nline two\n\n<div class="x">raw <b>html</b></div>';
  it('S-14 hard wrap on (P-29b) and raw HTML', () => {
    expect(render(s14, { htmlHardWrap: true })).toBe('<p>line one<br>\nline two</p><div class="x">raw <b>html</b></div>');
  });
  it('S-14 hard wrap off', () => {
    expect(render(s14)).toBe('<p>line one\nline two</p><div class="x">raw <b>html</b></div>');
  });

  it('S-15 lists and blockquote', () => {
    expect(render('* a\n* b\n    1. one\n    2. two\n\n> quote\n> > nested')).toBe(
      norm('<ul><li>a</li><li>b\n<ol><li>one</li><li>two</li></ol></li></ul><blockquote><p>quote</p><blockquote><p>nested</p></blockquote></blockquote>'),
    );
  });
});

// ---------------------------------------------------------------------------
// Each extension on and off (§8.2, §8.3)
// ---------------------------------------------------------------------------

describe('extension toggles (each on and off)', () => {
  const cases: [string, keyof MacDownPreferences, string, string, string][] = [
    // [name, key, markdown, expected fragment on, expected fragment off]
    ['P-07 tables', 'extensionTables', '|a|\n|-|\n|b|', '<table>', '<p>|a|'],
    ['P-08 fenced code', 'extensionFencedCode', '```\nx\n```', '<pre><code class="language-none">x</code>', '<p><code>'],
    ['P-09 autolink', 'extensionAutolink', 'see http://x.co', '<a href="http://x.co">', 'see http://x.co</p>'],
    ['P-10 strikethrough', 'extensionStrikethough', '~~a~~', '<del>a</del>', '<p>~~a~~</p>'],
    ['P-11 underline', 'extensionUnderline', '_a_', '<u>a</u>', '<em>a</em>'],
    ['P-12 highlight', 'extensionHighlight', '==a==', '<mark>a</mark>', '<p>==a==</p>'],
    ['P-13 footnotes', 'extensionFootnotes', 'x[^1]\n\n[^1]: n', '<div class="footnotes">', '<a href="n">^1</a>'],
    ['P-14 superscript', 'extensionSuperscript', '2^10', '2<sup>10</sup>', '<p>2^10</p>'],
    ['P-15 quote', 'extensionQuote', '"a"', '<q>a</q>', '&quot;a&quot;'],
    ['P-16 smartypants', 'extensionSmartyPants', 'a -- b', 'a &ndash; b', 'a -- b'],
    ['P-17 intra-word emphasis', 'extensionIntraEmphasis', 'A*maz*ing', 'A<em>maz</em>ing', 'A*maz*ing'],
    ['P-18 math', 'htmlMathJax', '\\\\(a<b\\\\)', '\\(a&lt;b\\)', '<p>\\(a&lt;b\\)</p>'],
    ['P-26 task list', 'htmlTaskList', '- [ ] a', '<input type="checkbox">', '<li>[ ] a</li>'],
    ['P-27 TOC', 'htmlRendersTOC', '[TOC]\n\n# h', '<ul class="toc">', '<p>[TOC]</p>'],
    ['P-28 front matter', 'htmlDetectFrontMatter', '---\na: b\n---\n', '<th>a</th>', '<hr>'],
    ['P-29b hard wrap', 'htmlHardWrap', 'a\nb', 'a<br>', 'a\nb'],
    ['P-22 line numbers', 'htmlLineNumbers', '    x', '<pre class="line-numbers">', '<div><pre><code'],
  ];
  for (const [name, key, md, on, off] of cases) {
    it(`${name}: on`, () => expect(render(md, { [key]: true })).toContain(norm(on)));
    it(`${name}: off`, () => expect(render(md, { [key]: false })).toContain(norm(off)));
  }

  it('P-18 off: $$ and \\\\( stay literal Markdown', () => {
    expect(render('$$a$$ \\\\(b\\\\)')).toBe('<p>$$a$$ \\(b\\)</p>');
  });
  it('P-19 on/off ($ … $ inline only with P-19, requires P-18)', () => {
    expect(render('$a$', { htmlMathJax: true, htmlMathJaxInlineDollar: true })).toBe('<p>\\(a\\)</p>');
    expect(render('$a$', { htmlMathJax: true })).toBe('<p>$a$</p>');
    expect(render('$a$', { htmlMathJaxInlineDollar: true })).toBe('<p>$a$</p>');
  });
  it('P-23 accessory: 0 and 1 keep the info word, 2 splits it', () => {
    for (const a of [0, 1] as const) expect(render('```a:b\nx\n```', { htmlCodeBlockAccessory: a })).toContain('language-a:b');
    expect(render('```a:b\nx\n```', { htmlCodeBlockAccessory: 2 })).toContain('data-information="b"><code class="language-a"');
  });
});

// ---------------------------------------------------------------------------
// Intra-word emphasis and underline details (F-115, F-121, U-03)
// ---------------------------------------------------------------------------

describe('F-121 intra-word emphasis and the underscore rule', () => {
  it('on: snake_case_word becomes emphasis (like *)', () => {
    expect(render('snake_case_word')).toBe('<p>snake<em>case</em>word</p>');
    expect(render('snake_case_word', { extensionUnderline: true })).toBe('<p>snake<u>case</u>word</p>');
  });
  it('off: an opener after a letter is rejected, after space, > or ( is allowed', () => {
    expect(render('snake_case_word', { extensionIntraEmphasis: false })).toBe('<p>snake_case_word</p>');
    expect(render('(*a*) x', { extensionIntraEmphasis: false })).toBe('<p>(<em>a</em>) x</p>');
  });
  it('off: a single closer followed by a letter or digit is rejected', () => {
    expect(render('*a*b', { extensionIntraEmphasis: false })).toBe('<p>*a*b</p>');
    expect(render('*a*b')).toBe('<p><em>a</em>b</p>');
  });
  it('off also applies to ~~ and ==', () => {
    const p = { extensionIntraEmphasis: false, extensionStrikethough: true, extensionHighlight: true };
    expect(render('x~~a~~ x==b==', p)).toBe('<p>x~~a~~ x==b==</p>');
    expect(render('x ~~a~~ x ==b==', p)).toBe('<p>x <del>a</del> x <mark>b</mark></p>');
  });
  it('underline only changes single underscores: *x* stays <em>, __x__ stays <strong>', () => {
    expect(render('*a* __b__ _c_', { extensionUnderline: true })).toBe('<p><em>a</em> <strong>b</strong> <u>c</u></p>');
  });
});

describe('F-118 superscript grammar (U-13)', () => {
  const p = { extensionSuperscript: true };
  it('^word runs to the next whitespace', () => expect(render('a^bc d', p)).toBe('<p>a<sup>bc</sup> d</p>'));
  it('^(…) runs to the first ) and parses inline Markdown', () =>
    expect(render('x^(a *b*) y', p)).toBe('<p>x<sup>a <em>b</em></sup> y</p>'));
  it('^() produces nothing', () => expect(render('a^()b', p)).toBe('<p>ab</p>'));
});

describe('F-119 quote', () => {
  it('takes precedence over SmartyPants', () => {
    expect(render('"a" b', { extensionQuote: true, extensionSmartyPants: true })).toBe('<p><q>a</q> b</p>');
  });
  it('parses inline Markdown and leaves empty quotes alone', () => {
    expect(render('"*a*" ""', { extensionQuote: true })).toBe('<p><q><em>a</em></q> &quot;&quot;</p>');
  });
});

// ---------------------------------------------------------------------------
// SmartyPants (U-14)
// ---------------------------------------------------------------------------

describe('F-120 SmartyPants rules (U-14)', () => {
  const sp = (md: string) => render(md, { extensionSmartyPants: true });
  it('dashes, ellipses and symbols', () => {
    expect(sp('a -- b --- c ... d . . . e')).toBe('<p>a &ndash; b &mdash; c &hellip; d &hellip; e</p>');
    expect(sp('(c) (R) (tm) (TM)')).toBe('<p>&copy; &reg; &trade; &trade;</p>');
  });
  it('fractions at word boundaries, including 1/4th and 3/4ths', () => {
    expect(sp('1/2 1/4 3/4 1/4th 3/4ths 11/2')).toBe('<p>&frac12; &frac14; &frac34; &frac14;th &frac34;ths 11/2</p>');
  });
  it('quotes by context, `` and contractions', () => {
    expect(smartypants("``a'' 'b' I'm you're")).toBe('&ldquo;a&rdquo; &lsquo;b&rsquo; I&rsquo;m you&rsquo;re');
  });
  it('skips pre, code, kbd and similar elements', () => {
    expect(sp('`a--b` and\n\n    c--d')).toContain('<code>a--b</code>');
    expect(sp('    c--d')).toContain('c--d');
    expect(smartypants('<kbd>--</kbd> <var>...</var> <!-- -- --> --')).toBe('<kbd>--</kbd> <var>...</var> <!-- -- --> &ndash;');
  });
  it('the TOC is inserted after SmartyPants (TOC text keeps -- )', () => {
    const h = render('[TOC]\n\n# a -- b', { extensionSmartyPants: true, htmlRendersTOC: true });
    expect(h).toContain('<a href="#toc_0">a -- b</a>');
    expect(h).toContain('<h1 id="toc_0">a &ndash; b</h1>');
  });
});

// ---------------------------------------------------------------------------
// TOC details (§6.6)
// ---------------------------------------------------------------------------

describe('F-123 TOC details', () => {
  const p = { htmlRendersTOC: true };
  it('[TOC] is matched case-insensitively and every match is replaced', () => {
    const h = render('[toc]\n\n# a\n\n[ToC]', p);
    expect(h.match(/<ul class="toc">/g)).toHaveLength(2);
  });
  it('no depth limit: H1 to H6 are all listed', () => {
    const h = render('[TOC]\n\n# 1\n## 2\n### 3\n#### 4\n##### 5\n###### 6', p);
    for (let i = 0; i < 6; i++) expect(h).toContain(`<a href="#toc_${i}">${i + 1}</a>`);
    expect(h.match(/<ul/g)).toHaveLength(6 + 0);
  });
  it('the first header level becomes level 1', () => {
    expect(renderToc([{ level: 2, html: 'a' }, { level: 2, html: 'b' }])).toBe(
      '<ul class="toc">\n<li>\n<a href="#toc_0">a</a>\n</li>\n<li>\n<a href="#toc_1">b</a>\n</li>\n</ul>\n',
    );
  });
  it('entries keep inline formatting but links are reduced to text', () => {
    const h = render('[TOC]\n\n# *a* `b` [c](http://x)', p);
    expect(h).toContain('<a href="#toc_0"><em>a</em> <code>b</code> c</a>');
  });
  it('a document without headers removes the [TOC] paragraph', () => {
    expect(render('[TOC]', p)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Task lists (§6.7), footnotes (§6.5), front matter (§6.8), math (§6.9)
// ---------------------------------------------------------------------------

describe('F-132 task list details', () => {
  const p = { htmlTaskList: true };
  it('upper-case [X] is not a task (U-16)', () => expect(render('- [X] a', p)).toBe('<ul><li>[X] a</li></ul>'));
  it('loose items get the checkbox inside the <p>', () =>
    expect(render('- [ ] a\n\n- [x] b', p)).toBe(
      '<ul><li class="task-list-item"><p><input type="checkbox"> a</p></li><li class="task-list-item"><p><input type="checkbox" checked> b</p></li></ul>',
    ));
  it('works nested and with [ ]text (no space)', () => {
    expect(render('- a\n  - [ ]b', p)).toContain('<li class="task-list-item"><input type="checkbox">b</li>');
  });
});

describe('F-117 footnote details', () => {
  it('numbers by first reference, drops unused definitions, one back-link in the first paragraph', () => {
    const h = render('b[^b] a[^a] b[^b]\n\n[^a]: A\n[^b]: B1\n\n    B2\n[^c]: unused');
    expect(h).toContain('b<sup id="fnref1"><a href="#fn1" rel="footnote">1</a></sup> a<sup id="fnref2"><a href="#fn2" rel="footnote">2</a></sup>');
    expect(h.match(/rev="footnote"/g)).toHaveLength(2);
    expect(h).toContain('<li id="fn1"><p>B1&nbsp;<a href="#fnref1" rev="footnote">&#8617;</a></p><p>B2</p></li>');
    expect(h).not.toContain('unused');
  });
});

describe('F-133 front matter details', () => {
  const p = { htmlDetectFrontMatter: true };
  it('arrays, nested maps, null and escaping', () => {
    expect(render('---\na:\n  - 1\n  - <2>\nb:\nc:\n  d: e\n---\nx', p)).toBe(
      '<table><thead><tr><th>a</th><th>b</th><th>c</th></tr></thead><tbody><tr>' +
        '<td><table><tbody><tr><td>1</td><td>&lt;2&gt;</td></tr></tbody></table></td><td></td>' +
        '<td><table><thead><tr><th>d</th></tr></thead><tbody><tr><td>e</td></tr></tbody></table></td>' +
        '</tr></tbody></table><p>x</p>',
    );
  });
  it('keeps key order and every scalar as a string', () => {
    expect(render('---\nz: 1\n2: true\na: null\n---\n', p)).toContain('<th>z</th><th>2</th><th>a</th>');
    expect(render('---\nn: 007\n---\n', p)).toContain('<td>007</td>');
  });
  it('a scalar document is placed as escaped text', () => {
    expect(render('---\nhello & bye\n---\nx', p)).toBe('hello &amp; bye\n<p>x</p>');
  });
  it('closing with ... works; invalid YAML removes nothing', () => {
    expect(render('---\na: b\n...\nx', p)).toContain('<th>a</th>');
    expect(render('---\na: [\n---\nx', p)).not.toContain('<table');
  });
  it('only at the very start of the text', () => {
    expect(render('\n---\na: b\n---\n', p)).not.toContain('<table');
  });
});

describe('F-130 math details', () => {
  const p = { htmlMathJax: true };
  it('$$ inside text is inline without P-19, display with P-19', () => {
    expect(render('a $$x$$ b', p)).toBe('<p>a \\(x\\) b</p>');
    expect(render('a $$x$$ b', { ...p, htmlMathJaxInlineDollar: true })).toBe('<p>a \\[x\\] b</p>');
  });
  it('the TeX text is escaped and not processed as Markdown', () => {
    expect(render('$$a_b_c < *d*$$', p)).toBe('<p>\\[a_b_c &lt; *d*\\]</p>');
  });
  it('an escaped delimiter does not close', () => {
    expect(render('$a\\$b$', { ...p, htmlMathJaxInlineDollar: true })).toBe('<p>\\(a\\$b\\)</p>');
  });
  it('\\\\[ … \\\\] is display math', () => {
    expect(render('\\\\[x\\\\]', p)).toBe('<p>\\[x\\]</p>');
  });
});

// ---------------------------------------------------------------------------
// Code blocks and Prism (§6.4)
// ---------------------------------------------------------------------------

describe('F-124 to F-127 code blocks and Prism', () => {
  beforeAll(() => setAssetLoader(async (path) => readFileSync(resolve(PUBLIC, path), 'utf8')));

  it('alias lookup is case-sensitive and only uses the first word', () => {
    expect(mapLanguage('js')).toBe('javascript');
    expect(mapLanguage('JS')).toBe('JS');
    expect(mapLanguage('json')).toBe('javascript');
    expect(mapLanguage('graphviz')).toBe('dot');
  });

  it('collects languages with dependencies first (add_to_languages)', () => {
    expect(parseMarkdown('```php\nx\n```\n```js\ny\n```', withDefaults()).languages).toEqual(['clike', 'javascript', 'php']);
    expect(parseMarkdown('```c++\nx\n```', withDefaults()).languages).toEqual(['clike', 'c', 'cpp']);
  });

  it('the bundled component list matches public/macdown/prism/components', () => {
    const files = readdirSync(resolve(PUBLIC, 'prism/components'))
      .filter((f) => f.endsWith('.min.js') && f !== 'prism-core.min.js')
      .map((f) => f.slice(6, -7));
    expect([...PRISM_COMPONENT_FILES].sort()).toEqual(files.sort());
  });

  it('Prism highlights used languages, adds line numbers and the language label', async () => {
    const prefs = withDefaults({ htmlSyntaxHighlighting: true, htmlLineNumbers: true, htmlCodeBlockAccessory: 1 });
    const r = renderDocument('```js\nvar a = 1;\nb\n```\n\n    plain', prefs);
    expect(r.scripts).toEqual(['prism-core', 'prism-language:clike', 'prism-language:javascript', 'prism-plugin:line-numbers', 'prism-plugin:show-language']);
    const doc = new DOMParser().parseFromString(r.html, 'text/html');
    highlightAll(await loadPrism(r.scripts), doc);
    const code = doc.querySelector('code.language-javascript')!;
    expect(code.querySelector('.token.keyword')?.textContent).toBe('var');
    expect(code.querySelectorAll('.line-numbers-rows > span')).toHaveLength(2);
    expect(doc.querySelector('.prism-show-language-label')?.textContent).toBe('JavaScript');
    // language-none has no grammar: no tokens, but line numbers (complete hook).
    const none = doc.querySelectorAll('code')[1];
    expect(none.querySelector('.token')).toBeNull();
    expect(none.querySelector('.line-numbers-rows')).not.toBeNull();
  });

  it('a language that is only in the class but not loaded for this document is not highlighted', async () => {
    const prefs = withDefaults({ htmlSyntaxHighlighting: true });
    // `python:x` (accessory not Custom) loads no file.
    const a = renderDocument('```python:x\nprint(1)\n```', prefs);
    expect(a.scripts).toEqual(['prism-core']);
    // `Python` loads prism-python (file names are lower-cased), but Prism
    // looks up the grammar "Python", which does not exist.
    const b = renderDocument('```Python\nprint(2)\n```', prefs);
    expect(b.scripts).toEqual(['prism-core', 'prism-language:python']);
    for (const r of [a, b]) {
      const doc = new DOMParser().parseFromString(r.html, 'text/html');
      highlightAll(await loadPrism(r.scripts), doc);
      expect(doc.querySelectorAll('.token')).toHaveLength(0);
    }
  });

  it('runPreviewScripts runs synchronously once Prism is loaded', async () => {
    const prefs = withDefaults({ htmlSyntaxHighlighting: true });
    const r = renderDocument('```js\nvar a\n```', prefs);
    await loadPrism(r.scripts);
    const doc = new DOMParser().parseFromString(r.html, 'text/html');
    expect(runPreviewScripts(doc, r.scripts, prefs, () => true)).toBeNull();
    expect(doc.querySelector('.token.keyword')).not.toBeNull();
  });

  it('P-20 off: no Prism scripts or styles, but line-numbers class follows P-22', () => {
    const r = renderDocument('```js\nx\n```', withDefaults({ htmlLineNumbers: true }));
    expect(r.scripts).toEqual([]);
    expect(r.styles).toEqual(['style:GitHub2']);
    expect(r.body).toContain('<pre class="line-numbers">');
  });

  it('Prism theme: lower-cased file name, falling back to prism.css', () => {
    expect(PRISM_THEME_NAMES).toEqual(['', 'Coy', 'Dark', 'Funky', 'Okaidia', 'Solarizedlight', 'Tomorrow', 'Twilight']);
    expect(prismThemeFile('Okaidia')).toBe('prism-okaidia.css');
    expect(prismThemeFile('')).toBe('prism.css');
    expect(prismThemeFile('Nope')).toBe('prism.css');
  });
});

// ---------------------------------------------------------------------------
// §6.10 inclusion order and §7.1 styles
// ---------------------------------------------------------------------------

describe('§6.10 style and script inclusion order', () => {
  it('everything on', () => {
    const prefs = withDefaults({
      htmlSyntaxHighlighting: true,
      htmlHighlightingThemeName: 'Okaidia',
      htmlLineNumbers: true,
      htmlCodeBlockAccessory: 1,
      htmlMermaid: true,
      htmlGraphviz: true,
      htmlMathJax: true,
      htmlTaskList: true,
    });
    const r = renderDocument('```dot\nx\n```', prefs);
    expect(r.styles).toEqual([
      'style:GitHub2',
      'prism-theme:prism-okaidia.css',
      'prism-plugin:line-numbers',
      'prism-plugin:show-language',
      'mermaid',
    ]);
    expect(r.scripts).toEqual([
      'tasklist',
      'prism-core',
      'prism-plugin:line-numbers',
      'prism-plugin:show-language',
      'mermaid',
      'mermaid-init',
      'viz',
      'viz-init',
      'mathjax-config',
      'mathjax',
    ]);
  });
  it('show-information.css with accessory Custom, regardless of P-20', () => {
    expect(renderDocument('', withDefaults({ htmlCodeBlockAccessory: 2 })).styles).toEqual(['style:GitHub2', 'show-information']);
  });
  it('Mermaid and Graphviz need P-20 as well', () => {
    expect(scriptIds(withDefaults({ htmlMermaid: true, htmlGraphviz: true }), [])).toEqual([]);
  });
  it('the style CSS is in the page in that order', () => {
    const r = renderDocument('', withDefaults({ htmlSyntaxHighlighting: true, htmlCodeBlockAccessory: 2 }));
    const iBase = r.html.indexOf(getStyleCss('GitHub2')!.slice(0, 80));
    const iPrism = r.html.indexOf('code[class*="language-"]');
    const iInfo = r.html.indexOf('data-information]::before');
    expect(iBase).toBeGreaterThan(0);
    expect(iPrism).toBeGreaterThan(iBase);
    expect(iInfo).toBeGreaterThan(iPrism);
    expect(r.html).not.toContain('<script');
  });
});

describe('F-136 / F-166 preview styles', () => {
  it('every in-scope style renders with its CSS; GitHub-2017 is hidden', () => {
    expect(STYLE_NAMES).not.toContain('GitHub-2017');
    for (const name of STYLE_NAMES) {
      const r = renderDocument('x', withDefaults({ htmlStyleName: name }));
      expect(r.styles[0]).toBe(`style:${name}`);
      expect(r.html).toContain(getStyleCss(name)!.slice(0, 50));
    }
  });
  it('the empty "no style" option renders no style tag', () => {
    const r = renderDocument('x', withDefaults({ htmlStyleName: '' }));
    expect(r.styles).toEqual([]);
    expect(r.html).not.toContain('<style');
  });
  it('every M3 option can be set through ?pref.<key>=<json>', () => {
    expect(
      parsePrefOverrides(
        '?pref.htmlSyntaxHighlighting=true&pref.htmlHighlightingThemeName=Okaidia&pref.htmlCodeBlockAccessory=2&pref.htmlStyleName=%22%22',
      ),
    ).toEqual({ htmlSyntaxHighlighting: true, htmlHighlightingThemeName: 'Okaidia', htmlCodeBlockAccessory: 2, htmlStyleName: '' });
  });
});
