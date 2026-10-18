/**
 * Final sign-off (test engineer): D-17 against a Foundation probe, and the
 * linear-time LinkEnd wrapper (src/editor/linearLinkEnd.ts) against the stock
 * @lezer/markdown parser.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const rel = (p: string) => resolve(process.cwd(), 'tests/unit', p);
import { commonmarkLanguage, markdownLanguage } from '@codemirror/lang-markdown';
import type { MarkdownParser } from '@lezer/markdown';
import { linearLinkEnd } from '../../src/editor/linearLinkEnd';
import { pathExtension, stripExtension } from '../../src/document/document';

// Foundation (macOS) output of -pathExtension and -stringByDeletingPathExtension, tests/unit/fixtures/foundation-pathext.json
const pe = JSON.parse(readFileSync(rel('fixtures/foundation-pathext.json'), 'utf8')) as [string, string, string][];

describe('F-31 D-17 Foundation rules for stripping an extension', () => {
  for (const [name, ext, stripped] of pe) {
    // Names that end in "/" cannot be file names (lastPathComponent never has one).
    if (name.endsWith('/')) continue;
    it(`F-31 pathExtension / stripExtension of ${JSON.stringify(name)} = ${JSON.stringify(ext)} / ${JSON.stringify(stripped)}`, () => {
      expect(pathExtension(name)).toBe(ext);
      expect(stripExtension(name)).toBe(stripped);
    });
  }
});

type P = MarkdownParser;
const stock = commonmarkLanguage.parser as P;
const fast = stock.configure(linearLinkEnd(stock));
const dump = (p: P, s: string) => {
  const out: string[] = [];
  p.parse(s).iterate({ enter: (n) => void out.push(`${n.name}:${n.from}-${n.to}`) });
  return out.join(' ');
};
const same = (s: string, a: P = fast, b: P = stock) => expect(dump(a, s), JSON.stringify(s.slice(0, 200))).toBe(dump(b, s));

describe('F-22 linearLinkEnd gives the stock tree (node names and positions)', () => {
  const fixedCases = [
    '[a](b "t") ![i](u) [r][ref] [ref] ![img][ref] [col][] [x]: not a def',
    '[a]\n[a]: /u\n[b]: <x y> "t"\n',
    '[[[[a]]]](b) [[[a](b)]] ![[a](b)](c) ![![a](b)](c) [![a](b)]',
    '[a](b(c)d) [a](b\\)c) [a](<b>) [a](<b) [a]( b ) [a](b "x\\"y") [a](b \'z\') [a](b (w))',
    '[a *b](c) d*  [a _b_ **c** `d](e)` f](g)',
    '[a <b](c)> [a <http://x](y)> [a http://x.y](z) <a href="x">[l](m)</a>',
    '[a](b)[c](d)[e](f)![g](h)[i](j)',
    '[a][b][c] [a][][b] [a] [b] [c]\n\n[b]: /b\n[c]: /c',
    '[] [](x) ![]() [ ](x) [\\]](x) [a\\](b) \\[a](b) \\![a](b)',
    '* [a](b)\n* [c [d](e)](f)\n  * ![g](h) [i]\n\n1. [j][k]\n\n[k]: /k\n\n    [code](x)\n\n```\n[x](y)\n```\n> [q](r)',
    '# [h](x)\n\n[a](b)\n===\n\n| [a](b) | ![c](d) |\n|---|---|\n',
    '[a](b)\n[c](d)\n\n[e](f "multi\nline")',
    '[a&amp;b](c&amp;d) [&lt;](&gt;) [a](b#c?d=e&f=g)',
    '[' + '['.repeat(500) + 'a' + ']'.repeat(500) + '(x)',
    '['.repeat(3000) + 'x' + '](y)'.repeat(3000),
    '![' .repeat(500) + 'x' + '](y)'.repeat(500),
    '[a](b) '.repeat(3000),
    '[a [b](c) '.repeat(500) + ']'.repeat(500),
    'x'.repeat(100000) + '[a](b)' + 'y'.repeat(100000),
    '[' + 'a'.repeat(50000) + '](' + 'b'.repeat(50000) + ')',
    '[a](b)'.repeat(5000) + '\n\n' + '![a](b)[c]'.repeat(5000),
    '\t[a](b)\r\n[c](d)\r[e](f)',
    '[日本語](http://例.jp/パス) [😀](x) ![é](ü)',
    '',
    '[',
    ']',
    '![',
    '[]',
    '[](',
    '](',
  ];
  fixedCases.forEach((s, i) => it(`F-22 fixed case ${i}: ${JSON.stringify(s.slice(0, 40))}`, () => same(s)));

  it('F-22 the bundled and original Markdown documents parse identically', () => {
    const files = [
      '../../src/document/assets/help.md',
      '../../src/document/assets/contribute.md',
      '../../../vendor/macdown/demo.md',
      '../../../vendor/macdown/README.md',
      '../../../vendor/macdown/CONTRIBUTING.md',
      '../../../vendor/macdown/Dependency/prism/README.md',
      '../../../vendor/macdown/Dependency/prism/CHANGELOG.md',
      '../../README.md',
      '../../../docs/spec.md',
      '../../../docs/test-report.md',
    ];
    let n = 0;
    for (const f of files) {
      const s = readFileSync(rel(f), 'utf8');
      same(s);
      n++;
    }
    expect(n).toBe(files.length);
  });

  it('F-22 every Markdown file of the Prism and MacDown sources parses identically (paragraph by paragraph)', () => {
    const dir = rel('../../../vendor/macdown/Dependency/prism');
    const names = readdirSync(dir).filter((f) => f.endsWith('.md'));
    for (const f of names) for (const para of readFileSync(resolve(dir, f), 'utf8').split(/\n\n+/)) same(para);
  });

  it('F-22 random markdown-like inputs (30000 cases, three alphabets)', () => {
    let seed = 987654321;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff);
    const alphabets = [
      ['[', ']', '(', ')', '!', 'a', ' ', '\n'],
      ['[', ']', '(', ')', '!', '*', '_', '`', '<', '>', '"', "'", '\\', '&', '#', ':', '/', 'x', ' ', '\n', '>', '-', '~', '|'],
      ['[', ']', '[', ']', '(', ')', '![', '](', ']: ', '[a]', '[a](b)', '*', '**', ' ', '\n', '\n\n', 'a', '<a>', '</a>', '`', '\\'],
    ];
    for (let n = 0; n < 30000; n++) {
      const alpha = alphabets[n % 3];
      const len = 1 + Math.floor(rnd() * (n % 7 === 0 ? 200 : 40));
      let s = '';
      for (let i = 0; i < len; i++) s += alpha[Math.floor(rnd() * alpha.length)];
      same(s);
    }
  });

  it('F-22 also identical when layered on the GFM base parser (a different base, same internals)', () => {
    const gfm = markdownLanguage.parser as P;
    const gfmFast = gfm.configure(linearLinkEnd(gfm));
    for (const s of ['[a](b) ~~[c [d](e)](f)~~', '| [a](b) |\n|---|\n| ![c [d](e)](f) |', '- [ ] [a](b)\n- [x] ![c](d)', '[a](b) https://x.y [c]']) same(s, gfmFast, gfm);
  });

  it('F-22 the tree of a 2 MB document with one 40,000-link paragraph equals the stock tree on its first 60 KB and is linear', () => {
    const para = Array.from({ length: 40000 }, (_, i) => `l${i} [link ${i}](http://e.x/${i} "t")`).join(' ');
    const t0 = performance.now();
    const tree = fast.parse(para);
    const ms = performance.now() - t0;
    expect(tree.length).toBe(para.length);
    expect(ms).toBeLessThan(3000);
    same(para.slice(0, 60000));
  });
});

describe('F-22 linearLinkEnd falls back to Lezer when the internals are missing', () => {
  const names = ['Escape', 'Entity', 'InlineCode', 'HTMLTag', 'Emphasis', 'Link', 'Image', 'LinkEnd', 'Autolink'];
  const noop = () => -1;
  it('no inlineNames / inlineParsers (an object without internals): no override at all', () => {
    expect(linearLinkEnd({})).toEqual({});
  });
  it('a different shape (not arrays): no override', () => {
    expect(linearLinkEnd({ inlineNames: 'x', inlineParsers: 5 })).toEqual({});
    expect(linearLinkEnd({ inlineNames: new Set(names), inlineParsers: new Map() })).toEqual({});
  });
  it('LinkEnd, Link or Image missing from the names: no override', () => {
    for (const drop of ['Link', 'Image', 'LinkEnd']) {
      const n = names.filter((x) => x !== drop);
      expect(linearLinkEnd({ inlineNames: n, inlineParsers: n.map(() => noop) })).toEqual({});
    }
  });
  it('names present but their parsers are undefined: no override', () => {
    expect(linearLinkEnd({ inlineNames: names, inlineParsers: names.map(() => undefined) })).toEqual({});
  });
  it('a fallback config leaves the parser unchanged (configure with {} gives the stock tree)', () => {
    const p = stock.configure(linearLinkEnd({}));
    for (const s of ['[a](b) [c [d](e)](f)', '![a][b]\n\n[b]: /x']) same(s, p, stock);
  });
  it('real internals are found on the installed @lezer/markdown (so the override is active)', () => {
    expect(linearLinkEnd(stock).parseInline?.length).toBe(3);
  });
});
