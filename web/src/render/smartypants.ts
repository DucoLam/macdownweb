/**
 * F-120 SmartyPants (P-16): a port of Hoedown 3.0.7 `hoedown_html_smartypants`
 * [hoedown:src/html_smartypants.c]. It runs on the rendered body HTML, as the
 * original does [MPRenderer.m:105-111], and outputs the same named entities.
 * Text inside pre, code, var, samp, kbd, math, script and style is skipped;
 * HTML comments are copied verbatim.
 */
import { cIsPunct, cIsSpace } from './hoedown';

interface State {
  inSquote: boolean;
  inDquote: boolean;
}

/** `word_boundary`: NUL, C whitespace or ASCII punctuation. */
function boundary(c: number): boolean {
  return c === 0 || cIsSpace(c) || cIsPunct(c);
}

const lower = (c: number) => (c >= 0x41 && c <= 0x5a ? c + 32 : c);

const SINGLE_QUOTES = ["'", '&#39;', '&#x27;', '&apos;'];

function squoteLen(t: string, p: number): number {
  for (const q of SINGLE_QUOTES) if (t.startsWith(q, p)) return q.length;
  return 0;
}

class Out {
  s = '';
}

function quotes(ob: Out, prev: number, next: number, quote: 'd' | 's', st: State, key: 'inSquote' | 'inDquote'): boolean {
  const open = st[key];
  if (open && !boundary(next)) return false;
  if (!open && !boundary(prev)) return false;
  ob.s += `&${open ? 'r' : 'l'}${quote}quo;`;
  st[key] = !open;
  return true;
}

export function smartypants(text: string): string {
  const ob = new Out();
  const st: State = { inSquote: false, inDquote: false };
  const size = text.length;
  const c = (i: number) => (i < size ? text.charCodeAt(i) : 0);

  // Each callback gets the position `p` of the trigger character and returns
  // how many *extra* characters it consumed (like the C callbacks).
  const squote = (prev: number, p: number, sqStart: number, sqSize: number): number => {
    const rem = size - p;
    if (rem >= 2) {
      const t1 = lower(c(p + 1));
      const next = squoteLen(text, p + 1);
      if (next > 0) {
        const nextChar = rem > 1 + next ? c(p + 1 + next) : 0;
        if (quotes(ob, prev, nextChar, 'd', st, 'inDquote')) return next;
      }
      if ((t1 === 0x73 || t1 === 0x74 || t1 === 0x6d || t1 === 0x64) && (rem === 3 || boundary(c(p + 2)))) {
        ob.s += '&rsquo;';
        return 0;
      }
      if (rem >= 3) {
        const t2 = lower(c(p + 2));
        if (
          ((t1 === 0x72 && t2 === 0x65) || (t1 === 0x6c && t2 === 0x6c) || (t1 === 0x76 && t2 === 0x65)) &&
          (rem === 4 || boundary(c(p + 3)))
        ) {
          ob.s += '&rsquo;';
          return 0;
        }
      }
    }
    if (quotes(ob, prev, rem > 0 ? c(p + 1) : 0, 's', st, 'inSquote')) return 0;
    ob.s += text.substr(sqStart, sqSize);
    return 0;
  };

  const SKIP = ['pre', 'code', 'var', 'samp', 'kbd', 'math', 'script', 'style'];
  /** hoedown_html_is_tag: 1 = open, 2 = close, 0 = none. */
  const isTag = (p: number, name: string): number => {
    if (size - p < 3 || text[p] !== '<') return 0;
    let i = p + 1;
    let closed = false;
    if (text[i] === '/') {
      closed = true;
      i++;
    }
    for (let k = 0; k < name.length; k++, i++) {
      if (i >= size) return 0;
      if (text[i] !== name[k]) return 0;
    }
    if (i >= size) return 0;
    const ch = text.charCodeAt(i);
    if (cIsSpace(ch) || ch === 0x3e) return closed ? 2 : 1;
    return 0;
  };

  const actions: Record<string, (prev: number, p: number) => number> = {
    '-': (_prev, p) => {
      const rem = size - p;
      if (rem >= 3 && text[p + 1] === '-' && text[p + 2] === '-') {
        ob.s += '&mdash;';
        return 2;
      }
      if (rem >= 2 && text[p + 1] === '-') {
        ob.s += '&ndash;';
        return 1;
      }
      ob.s += '-';
      return 0;
    },
    '(': (_prev, p) => {
      const rem = size - p;
      if (rem >= 3) {
        const t1 = lower(c(p + 1));
        const t2 = lower(c(p + 2));
        if (t1 === 0x63 && t2 === 0x29) {
          ob.s += '&copy;';
          return 2;
        }
        if (t1 === 0x72 && t2 === 0x29) {
          ob.s += '&reg;';
          return 2;
        }
        if (rem >= 4 && t1 === 0x74 && t2 === 0x6d && text[p + 3] === ')') {
          ob.s += '&trade;';
          return 3;
        }
      }
      ob.s += '(';
      return 0;
    },
    "'": (prev, p) => squote(prev, p, p, 1),
    '"': (prev, p) => {
      if (!quotes(ob, prev, size - p > 0 ? c(p + 1) : 0, 'd', st, 'inDquote')) ob.s += '&quot;';
      return 0;
    },
    '&': (prev, p) => {
      const rem = size - p;
      if (rem >= 6 && text.startsWith('&quot;', p)) {
        if (quotes(ob, prev, rem >= 7 ? c(p + 6) : 0, 'd', st, 'inDquote')) return 5;
      }
      const len = squoteLen(text, p);
      if (len > 0) return len - 1 + squote(prev, p + len - 1, p, len);
      if (rem >= 4 && text.startsWith('&#0;', p)) return 3;
      ob.s += '&';
      return 0;
    },
    '.': (_prev, p) => {
      const rem = size - p;
      if (rem >= 3 && text[p + 1] === '.' && text[p + 2] === '.') {
        ob.s += '&hellip;';
        return 2;
      }
      if (rem >= 5 && text[p + 1] === ' ' && text[p + 2] === '.' && text[p + 3] === ' ' && text[p + 4] === '.') {
        ob.s += '&hellip;';
        return 4;
      }
      ob.s += '.';
      return 0;
    },
    '1': (prev, p) => number(prev, p),
    '3': (prev, p) => number(prev, p),
    '<': (_prev, p) => {
      let i = 0;
      const rem = size - p;
      if (i + 4 < rem && text.startsWith('<!--', p)) {
        i += 4;
        while (i + 3 < rem && !text.startsWith('-->', p + i)) i++;
        i += 3;
        ob.s += text.substr(p, i + 1);
        return i;
      }
      while (i < rem && text[p + i] !== '>') i++;
      const tag = SKIP.find((name) => isTag(p, name) === 1);
      if (tag) {
        for (;;) {
          while (i < rem && text[p + i] !== '<') i++;
          if (i === rem) break;
          if (isTag(p + i, tag) === 2) break;
          i++;
        }
        while (i < rem && text[p + i] !== '>') i++;
      }
      ob.s += text.substr(p, i + 1);
      return i;
    },
    '`': (prev, p) => {
      const rem = size - p;
      if (rem >= 2 && text[p + 1] === '`') {
        if (quotes(ob, prev, rem >= 3 ? c(p + 2) : 0, 'd', st, 'inDquote')) return 1;
      }
      ob.s += '`';
      return 0;
    },
    '\\': (_prev, p) => {
      if (size - p < 2) return 0;
      switch (text[p + 1]) {
        case '\\':
        case '"':
        case "'":
        case '.':
        case '-':
        case '`':
          ob.s += text[p + 1];
          return 1;
        default:
          ob.s += '\\';
          return 0;
      }
    },
  };

  function number(prev: number, p: number): number {
    const rem = size - p;
    if (boundary(prev) && rem >= 3) {
      const [a, b, d] = [text[p], text[p + 1], text[p + 2]];
      if (a === '1' && b === '/' && d === '2' && (rem === 3 || boundary(c(p + 3)))) {
        ob.s += '&frac12;';
        return 2;
      }
      if (
        a === '1' && b === '/' && d === '4' &&
        (rem === 3 || boundary(c(p + 3)) || (rem >= 5 && lower(c(p + 3)) === 0x74 && lower(c(p + 4)) === 0x68))
      ) {
        ob.s += '&frac14;';
        return 2;
      }
      if (
        a === '3' && b === '/' && d === '4' &&
        (rem === 3 || boundary(c(p + 3)) ||
          (rem >= 6 && lower(c(p + 3)) === 0x74 && lower(c(p + 4)) === 0x68 && lower(c(p + 5)) === 0x73))
      ) {
        ob.s += '&frac34;';
        return 2;
      }
    }
    ob.s += text[p];
    return 0;
  }

  for (let i = 0; i < size; i++) {
    const org = i;
    while (i < size && !(text[i] in actions)) i++;
    if (i > org) ob.s += text.slice(org, i);
    if (i < size) {
      // The C code passes the previous byte; for non-ASCII characters any
      // value > 127 behaves the same (neither space nor punctuation).
      const prev = i ? Math.min(text.charCodeAt(i - 1), 0xff) : 0;
      i += actions[text[i]](prev, i);
    }
  }
  return ob.s;
}
