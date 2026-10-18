/**
 * Renderer unit tests using the spec §10 samples covered by M2.
 * HTML is compared structurally: whitespace between tags is ignored and
 * `style="text-align:left"` is normalised to `style="text-align: left"`.
 */
import { describe, expect, it } from 'vitest';
import { renderMarkdown, renderDocument, renderTemplate, mapLanguage, STYLE_NAMES, getStyleCss } from '../../src/render';
import { DEFAULT_PREFERENCES, withDefaults } from '../../src/prefs';

const norm = (html: string) =>
  html
    .replace(/>\s*\n\s*</g, "><")
    .replace(/style="text-align:\s*(\w+)"/g, 'style="text-align: $1"')
    .trim();

const render = (md: string, overrides = {}) => norm(renderMarkdown(md, withDefaults(overrides)));

describe('S-01 headers and toc ids (F-110, F-122)', () => {
  it('renders ATX and setext headers with toc_N ids', () => {
    expect(render('# Title\nSub\n---\n### Third')).toBe(
      norm('<h1 id="toc_0">Title</h1><h2 id="toc_1">Sub</h2><h3 id="toc_2">Third</h3>'),
    );
  });
  it('numbers ids per render, starting from 0 each time', () => {
    render('# a\n# b');
    expect(render('# x')).toBe('<h1 id="toc_0">x</h1>');
  });
});

describe('S-02 emphasis and strong (F-110, F-121 default on)', () => {
  it('renders strong, emphasis and intra-word emphasis', () => {
    expect(render('**bold** *it* __b2__ _i2_ So A*maz*ing')).toBe(
      '<p><strong>bold</strong> <em>it</em> <strong>b2</strong> <em>i2</em> So A<em>maz</em>ing</p>',
    );
  });
});

describe('S-03 strikethrough (F-114, P-10)', () => {
  it('is literal by default (P-10 off)', () => {
    expect(render('~~gone~~')).toBe('<p>~~gone~~</p>');
  });
  it('renders <del> when P-10 is on', () => {
    expect(render('~~gone~~', { extensionStrikethough: true })).toBe('<p><del>gone</del></p>');
  });
});

describe('S-04 tables (F-111, P-07)', () => {
  const md = '| Left | Center | Right |\n|:-----|:------:|------:|\n| a    | b      | c     |';
  it('renders a table with alignment by default', () => {
    expect(render(md)).toBe(
      norm(`<table>
<thead><tr><th style="text-align: left">Left</th><th style="text-align: center">Center</th><th style="text-align: right">Right</th></tr></thead>
<tbody><tr><td style="text-align: left">a</td><td style="text-align: center">b</td><td style="text-align: right">c</td></tr></tbody>
</table>`),
    );
  });
  it('renders a single paragraph when P-07 is off', () => {
    const html = render(md, { extensionTables: false });
    expect(html.startsWith('<p>| Left')).toBe(true);
    expect(html).not.toContain('<table');
  });
});

describe('S-05 / §6.4 code blocks (F-112)', () => {
  it('wraps fenced code in div/pre/code and maps the js alias', () => {
    // Hoedown patch removes the trailing newline (hoedown_html_patch.c:74).
    expect(render('```js\nvar a = 1 < 2;\n```')).toBe(
      '<div><pre><code class="language-javascript">var a = 1 &lt; 2;</code></pre></div>',
    );
  });
  it('uses language-none for indented code and fences without a language', () => {
    expect(render('    indented')).toBe('<div><pre><code class="language-none">indented</code></pre></div>');
    expect(render('```\nx\n```')).toBe('<div><pre><code class="language-none">x</code></pre></div>');
  });
  it('supports ~~~ fences', () => {
    expect(render('~~~py\nprint(1)\n~~~')).toBe('<div><pre><code class="language-python">print(1)</code></pre></div>');
  });
  it('adds line-numbers and data-information (S-06 structure, without Prism)', () => {
    expect(render('```python:hello.py\nprint("hi")\n```', { htmlLineNumbers: true, htmlCodeBlockAccessory: 2 })).toBe(
      '<div><pre class="line-numbers" data-information="hello.py"><code class="language-python">print(&quot;hi&quot;)</code></pre></div>',
    );
  });
  it('does not split lang:info unless the accessory is Custom', () => {
    expect(render('```python:hello.py\nx\n```')).toBe(
      '<div><pre><code class="language-python:hello.py">x</code></pre></div>',
    );
  });
  it('does not parse fences when P-08 is off', () => {
    expect(render('```js\nx\n```', { extensionFencedCode: false })).not.toContain('<pre>');
  });
  it('maps every alias of syntax_highlighting.json', () => {
    expect(mapLanguage('c++')).toBe('cpp');
    expect(mapLanguage('objc')).toBe('objectivec');
    expect(mapLanguage('gv')).toBe('dot');
    expect(mapLanguage('rust')).toBe('rust');
  });
});

describe('S-12 autolink (F-113, P-09)', () => {
  const md = 'Visit http://t.co or www.example.com, mail <a@b.co>.';
  it('links bare URLs, www and e-mail when P-09 is on', () => {
    expect(render(md, { extensionAutolink: true })).toBe(
      '<p>Visit <a href="http://t.co">http://t.co</a> or <a href="http://www.example.com">www.example.com</a>, mail <a href="mailto:a@b.co">a@b.co</a>.</p>',
    );
  });
  it('links only <a@b.co> when P-09 is off (default)', () => {
    expect(render(md)).toBe(
      '<p>Visit http://t.co or www.example.com, mail <a href="mailto:a@b.co">a@b.co</a>.</p>',
    );
  });
});

describe('S-14 hard wrap (F-134) and raw HTML (F-135)', () => {
  const md = 'line one\nline two\n\n<div class="x">raw <b>html</b></div>';
  it('keeps soft breaks by default and passes raw HTML through', () => {
    expect(renderMarkdown(md, DEFAULT_PREFERENCES)).toBe('<p>line one\nline two</p>\n<div class="x">raw <b>html</b></div>');
  });
  it('emits <br> (no XHTML slash) when P-29b is on', () => {
    expect(render(md, { htmlHardWrap: true })).toBe(norm('<p>line one<br>\nline two</p><div class="x">raw <b>html</b></div>'));
  });
});

describe('S-15 lists and blockquote (F-110)', () => {
  it('renders nested lists and blockquotes', () => {
    const html = render('* a\n* b\n    1. one\n    2. two\n\n> quote\n> > nested');
    expect(html).toBe(
      norm(
        '<ul><li>a</li><li>b\n<ol><li>one</li><li>two</li></ol></li></ul>\n<blockquote><p>quote</p><blockquote><p>nested</p></blockquote></blockquote>',
      ),
    );
  });
});

describe('§7.4 template and default style (F-139, F-136)', () => {
  it('builds the Default.handlebars page structure', () => {
    const html = renderTemplate({ title: 'Doc', styleTags: ['<style>a{}</style>'], body: '<p>x</p>', scriptTags: [] });
    expect(html.startsWith('<!DOCTYPE html>\n<html>\n\n<head>\n\n<meta charset="utf-8">\n')).toBe(true);
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">');
    expect(html).toContain('<title>Doc</title>');
    expect(html.indexOf('<style>a{}</style>')).toBeLessThan(html.indexOf('</head>'));
    expect(html).toContain('<body>\n\n<p>x</p>\n\n');
  });
  it('omits the title tag for untitled documents', () => {
    expect(renderTemplate({ styleTags: [], body: '', scriptTags: [] })).not.toContain('<title>');
  });
  it('inlines GitHub2 by default', () => {
    const { html, body } = renderDocument('# Hi', DEFAULT_PREFERENCES);
    expect(body).toBe('<h1 id="toc_0">Hi</h1>\n');
    expect(html).toContain('<style type="text/css">');
    expect(html).toContain(getStyleCss('GitHub2')!.slice(0, 60));
  });
  it('lists the bundled styles, sorted, without the empty GitHub-2017', () => {
    expect(STYLE_NAMES).toEqual(['Clearness', 'Clearness Dark', 'GitHub', 'GitHub2', 'Solarized (Dark)', 'Solarized (Light)']);
  });
});
