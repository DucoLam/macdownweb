/**
 * Small ports of Hoedown 3.0.7 helpers (src/document.c, src/escape.c) used by
 * the custom markdown-it rules so that delimiter matching follows the
 * original parser (spec §6.3).
 */

/** `_isspace` in document.c: space or newline. */
export function isSpaceCode(c: number): boolean {
  return c === 0x20 || c === 0x0a;
}

/** C `isspace` in the "C" locale. */
export function cIsSpace(c: number): boolean {
  return c === 0x20 || (c >= 0x09 && c <= 0x0d);
}

/** C `ispunct` in the "C" locale (ASCII punctuation only). */
export function cIsPunct(c: number): boolean {
  return (c >= 0x21 && c <= 0x2f) || (c >= 0x3a && c <= 0x40) || (c >= 0x5b && c <= 0x60) || (c >= 0x7b && c <= 0x7e);
}

/** C `isalpha` in the "C" locale. */
export function cIsAlpha(c: number): boolean {
  return (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
}

/** C `isalnum` in the "C" locale. */
export function cIsAlnum(c: number): boolean {
  return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
}

/** `is_escaped`: an odd number of backslashes before `loc` escapes it. */
export function isEscaped(src: string, loc: number, start = 0): boolean {
  let i = loc;
  while (i >= start + 1 && src.charCodeAt(i - 1) === 0x5c) i--;
  return (loc - i) % 2 === 1;
}

/**
 * `find_emph_char`: index (relative to `start`) of the next `c` in
 * `src[start, end)`, skipping escaped characters, code spans and links.
 * Returns 0 when not found (as the C code does).
 */
export function findEmphChar(src: string, start: number, end: number, c: number): number {
  const size = end - start;
  const at = (k: number) => src.charCodeAt(start + k);
  let i = 0;
  while (i < size) {
    while (i < size && at(i) !== c && at(i) !== 0x5b && at(i) !== 0x60) i++;
    if (i === size) return 0;
    if (isEscaped(src, start + i, start)) {
      i++;
      continue;
    }
    if (at(i) === c) return i;

    if (at(i) === 0x60) {
      // skipping a code span
      let spanNb = 0;
      let tmpI = 0;
      while (i < size && at(i) === 0x60) {
        i++;
        spanNb++;
      }
      if (i >= size) return 0;
      let bt = 0;
      while (i < size && bt < spanNb) {
        if (!tmpI && at(i) === c) tmpI = i;
        if (at(i) === 0x60) bt++;
        else bt = 0;
        i++;
      }
      if (bt < spanNb && i >= size) return tmpI;
    } else if (at(i) === 0x5b) {
      // skipping a link
      let tmpI = 0;
      i++;
      while (i < size && at(i) !== 0x5d) {
        if (!tmpI && at(i) === c) tmpI = i;
        i++;
      }
      i++;
      while (i < size && isSpaceCode(at(i))) i++;
      if (i >= size) return tmpI;
      let cc: number;
      switch (at(i)) {
        case 0x5b:
          cc = 0x5d;
          break;
        case 0x28:
          cc = 0x29;
          break;
        default:
          if (tmpI) return tmpI;
          continue;
      }
      i++;
      while (i < size && at(i) !== cc) {
        if (!tmpI && at(i) === c) tmpI = i;
        i++;
      }
      if (i >= size) return tmpI;
      i++;
    }
  }
  return 0;
}

/** `hoedown_escape_html(…, secure = 0)`: & < > " ' are escaped. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;',
  );
}

/** Characters `HREF_SAFE` in escape.c leaves alone (besides alphanumerics). */
const HREF_SAFE_PUNCT = new Set("!#$%()*+,-./:;=?@_".split('').map((c) => c.charCodeAt(0)));

/**
 * `hoedown_escape_href` for an href that markdown-it's renderer will
 * HTML-escape afterwards: unsafe bytes become `%XX` (UTF-8), `&` and `'` stay
 * as they are (Hoedown writes `&amp;` and `&#x27;`, which is what the
 * attribute escaping gives back).
 */
export function escapeHref(url: string): string {
  let out = '';
  for (const ch of url) {
    const c = ch.charCodeAt(0);
    if (cIsAlnum(c) || HREF_SAFE_PUNCT.has(c) || ch === '&' || ch === "'") out += ch;
    else for (const b of new TextEncoder().encode(ch)) out += '%' + b.toString(16).toUpperCase().padStart(2, '0');
  }
  return out;
}
