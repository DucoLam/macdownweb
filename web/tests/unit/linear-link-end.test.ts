/**
 * The editor's linear-time LinkEnd (src/editor/linearLinkEnd.ts) must give
 * exactly the tree of Lezer's own Markdown parser.
 */
import { describe, expect, it } from 'vitest';
import { commonmarkLanguage } from '@codemirror/lang-markdown';
import type { MarkdownParser } from '@lezer/markdown';
import { linearLinkEnd } from '../../src/editor/linearLinkEnd';

const stock = commonmarkLanguage.parser as MarkdownParser;
const fast = stock.configure(linearLinkEnd(stock));
const tree = (p: MarkdownParser, s: string) => p.parse(s).toString();

const CASES = [
  '[a](b)',
  '[a](b) [c](d) [e]',
  '[a [b](c) d](e)',
  '[[a](b)](c)',
  '![a [b](c) d](e)',
  '![a ![b](c) d](e)',
  '[a ![b](c) d](e)',
  '[![a](b)](c)',
  '[a [b] c](d)',
  '[a]\n\n[a]: http://x "t"',
  '[a][b] [b]\n\n[b]: /u',
  '[a] b] [c](d',
  '] [ ] [a](b) ]',
  '*[a](b)* _[c_](d) **[e**](f)',
  '[a `]` b](c) [d <]> e](f)',
  '[a](<b c>) [d](e "f") [g](h \'i\')',
  'x [a](b) [c [d](e) [f](g) h](i) [j](k)',
  '> [a](b)\n> [c [d](e)](f)\n\n- [g](h)\n- ![i [j](k)](l)',
  '[a\nb](c) [d\n\ne](f)',
];

describe('linearLinkEnd: same tree as @lezer/markdown', () => {
  it('installs its three inline parsers on this @lezer/markdown version', () => {
    expect((linearLinkEnd(stock).parseInline ?? []).map((p) => (p as { name: string }).name)).toEqual(['Link', 'Image', 'LinkEnd']);
  });
  for (const s of CASES) it(JSON.stringify(s), () => expect(tree(fast, s)).toBe(tree(stock, s)));

  it('random inputs over the link alphabet (2000 cases)', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const alphabet = ['[', ']', '(', ')', '!', '*', '_', 'a', ' ', '\n', '<', '>', '`', '"', '\\'];
    for (let n = 0; n < 2000; n++) {
      const len = 1 + Math.floor(rnd() * 40);
      let s = '';
      for (let i = 0; i < len; i++) s += alphabet[Math.floor(rnd() * alphabet.length)];
      expect(tree(fast, s), JSON.stringify(s)).toBe(tree(stock, s));
    }
  });

  it('one paragraph with 40,000 links parses in linear time', () => {
    const text = Array.from({ length: 40000 }, (_, i) => `line ${i} with *some* text and a [link](http://example.com/${i})`).join('\n');
    const t0 = performance.now();
    const t = fast.parse(text);
    const ms = performance.now() - t0;
    expect(t.length).toBe(text.length);
    expect(ms).toBeLessThan(3000);
    // Same tree as the stock parser on a smaller paragraph of the same shape.
    const small = text.slice(0, 20000);
    expect(tree(fast, small)).toBe(tree(stock, small));
  });
});
