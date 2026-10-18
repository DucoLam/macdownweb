/**
 * F-12 word count over the rendered preview DOM, a port of
 * `DOMNode+Text.m` [vendor/macdown/MacDown/Code/Extension/DOMNode+Text.m]:
 * - SCRIPT, STYLE and HEAD subtrees are ignored.
 * - Words: a `<pre><code>` block is excluded; inline `<code>` with content
 *   counts as one word. Words in text are counted with Intl.Segmenter
 *   (`isWordLike`), the closest web equivalent of NSString word
 *   enumeration (U-17).
 * - Characters: text length without newlines (UTF-16 units, like NSString).
 * - Characters (no spaces): text length without any whitespace or newline.
 */

export interface TextCount {
  words: number;
  characters: number;
  charactersNoSpaces: number;
}

type Option = 'words' | 'characters' | 'charactersNoSpaces';

const segmenter: Intl.Segmenter | null =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;

function numberOfWords(s: string): number {
  if (segmenter) {
    let n = 0;
    for (const seg of segmenter.segment(s)) if (seg.isWordLike) n++;
    return n;
  }
  return (s.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []).length;
}

// NSCharacterSet newlineCharacterSet: U+000A–U+000D, U+0085, U+2028, U+2029.
const NEWLINES = /[\n\v\f\r\u0085\u2028\u2029]/g;
// whitespaceAndNewlineCharacterSet: Unicode Zs, tab, plus the newlines above.
const WHITESPACE = /[\t\n\v\f\r\u0085\u2028\u2029\p{Zs}]/gu;

function children(node: Node, opt: Option): number {
  let n = 0;
  for (let c = node.firstChild; c; c = c.nextSibling) n += count(c, opt);
  return n;
}

function count(node: Node, opt: Option): number {
  switch (node.nodeType) {
    case 1: // element
    case 9: // document
    case 11: // fragment
      if (node.nodeType === 1) {
        const tag = (node as Element).tagName.toUpperCase();
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'HEAD') return 0;
        if (opt === 'words' && tag === 'CODE') {
          if (node.parentElement?.tagName.toUpperCase() === 'PRE') return 0;
          return children(node, opt) ? 1 : 0;
        }
      }
      return children(node, opt);
    case 3: // text
    case 4: {
      // CDATA
      const v = node.nodeValue ?? '';
      if (opt === 'words') return numberOfWords(v);
      if (opt === 'characters') return v.replace(NEWLINES, '').length;
      return v.replace(WHITESPACE, '').length;
    }
    default:
      return 0;
  }
}

export function countText(node: Node): TextCount {
  return {
    words: count(node, 'words'),
    characters: count(node, 'characters'),
    charactersNoSpaces: count(node, 'charactersNoSpaces'),
  };
}

/** Labels from en.lproj/Localizable.strings (`%@ word` / `%@ words`, …). */
export function wordCountLabel(type: 0 | 1 | 2, c: TextCount): string {
  // JJPluralForm with localizeNumeral:NO → plain digits, no grouping
  // [MPDocument.m setTotalWords:].
  const fmt = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  switch (type) {
    case 1:
      return fmt(c.characters, 'character', 'characters');
    case 2:
      return fmt(c.charactersNoSpaces, 'character (no spaces)', 'characters (no spaces)');
    default:
      return fmt(c.words, 'word', 'words');
  }
}
