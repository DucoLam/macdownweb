/**
 * M3 independent test-engineer unit tests.
 *
 * 1. Golden parity against the ORIGINAL Hoedown 3.0.7 (the library MacDown
 *    links). The fixtures were produced by compiling the Hoedown sources and
 *    running its CLI (`hoedown` and `smartypants`) on each input, with the
 *    flag set that matches the preference set (spec §6.2). Only cases where
 *    the inputs exercise the Hoedown-specific extensions are included (core
 *    Markdown differences between Hoedown and markdown-it are accepted by
 *    spec §6.3, "tests compare structure").
 * 2. Defect repro tests (these fail until the defect is fixed): D-05..D-08.
 */
import { describe, expect, it } from 'vitest';
import { renderMarkdown, smartypants } from '../../src/render';
import { withDefaults } from '../../src/prefs';
import golden from './fixtures/hoedown-golden.json';
import smarty from './fixtures/hoedown-smartypants.json';

const norm = (h: string) =>
  h
    .replace(/\r/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .trim();
const render = (md: string, prefs: object = {}) => norm(renderMarkdown(md, withDefaults(prefs)));

describe('F-110..F-121, F-130, F-131 parity with Hoedown 3.0.7 (golden output)', () => {
  const bySet = new Map<string, typeof golden>();
  for (const g of golden) bySet.set(g.set, [...(bySet.get(g.set) ?? []), g]);
  for (const [set, cases] of bySet) {
    it(`F-1xx golden "${set}" preference set: ${cases.length} inputs equal Hoedown's HTML`, () => {
      const failures: string[] = [];
      for (const c of cases) {
        const got = norm(renderMarkdown(c.md + '\n', withDefaults(c.prefs)));
        if (got !== c.html) failures.push(`${JSON.stringify(c.md)}\n  expected ${c.html}\n  actual   ${got}`);
      }
      expect(failures, failures.slice(0, 5).join('\n')).toEqual([]);
    });
  }
});

describe('F-120 SmartyPants parity with Hoedown html_smartypants.c (random HTML fragments)', () => {
  it(`F-120 ${smarty.length} generated fragments give Hoedown's output`, () => {
    const failures: string[] = [];
    for (const c of smarty) {
      const got = smartypants(c.html + '\n').replace(/\s+/g, ' ').trim();
      if (got !== c.expected) failures.push(`${JSON.stringify(c.html)}\n  expected ${c.expected}\n  actual   ${got}`);
    }
    expect(failures, failures.slice(0, 5).join('\n')).toEqual([]);
  });
});

describe('F-113 autolink (spec 6.3: http://, https://, ftp://, www., e-mail)', () => {
  it('F-113 bare file names and domains are not linked (D-05)', () => {
    const html = render('see README.md and main.py or example.com, foo.io', { extensionAutolink: true });
    expect(html).not.toContain('<a ');
  });
});

describe('F-117 footnotes (Hoedown: a footnote is rendered at its first reference only)', () => {
  it('F-117 a repeated reference of the same footnote stays literal text (D-06)', () => {
    const html = render('A[^1] B[^1]\n\n[^1]: N');
    expect(html).toContain('A<sup id="fnref1"><a href="#fn1" rel="footnote">1</a></sup> B[^1]</p>');
    expect(html.match(/id="fnref1"/g)?.length).toBe(1);
  });
});

describe('F-110 block nesting is unlimited (spec 6.1 step 2: SIZE_MAX)', () => {
  it('F-110 60 nested lists give 60 list items (D-07)', () => {
    const md = Array.from({ length: 60 }, (_, i) => ' '.repeat(i * 2) + '- n' + i).join('\n');
    expect(renderMarkdown(md, withDefaults({})).match(/<li>/g)?.length).toBe(60);
  });
  it('F-110 120 nested blockquotes give 120 blockquotes (D-07)', () => {
    expect(renderMarkdown('>'.repeat(120) + ' deep', withDefaults({})).match(/<blockquote>/g)?.length).toBe(120);
  });
});

describe('F-121 intra-word emphasis OFF: emphasis at the start of nested content still works (D-08)', () => {
  const off = { extensionIntraEmphasis: false, extensionUnderline: true, extensionStrikethough: true, extensionHighlight: true, extensionQuote: true };
  const cases: [string, string][] = [
    ['**_a_**', '<p><strong><u>a</u></strong></p>'],
    ['[*a*](u)', '<p><a href="u"><em>a</em></a></p>'],
    ['[_a_](u)', '<p><a href="u"><u>a</u></a></p>'],
    ['"_a_"', '<p><q><u>a</u></q></p>'],
    ['~~_a_~~', '<p><del><u>a</u></del></p>'],
    ['==*a*==', '<p><mark><em>a</em></mark></p>'],
  ];
  for (const [md, html] of cases) it(`F-121 off: ${md}`, () => expect(render(md, off)).toBe(html));
  it('F-121 off: ~~~b~~~ and ===b=== stay literal', () => {
    expect(render('~~~b~~~ ===b===', off)).toBe('<p>~~~b~~~ ===b===</p>');
  });
});
