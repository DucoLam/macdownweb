/**
 * markdown-it rules that reproduce MacDown's Hoedown 3.0.7 extensions
 * (spec §6.2, §6.3). Each function is a markdown-it plugin; `createMarkdownIt`
 * (markdown.ts) enables them from the preferences.
 *
 * Hoedown references are to src/document.c and src/html.c of 3.0.7; MacDown
 * references to vendor/macdown/MacDown/Code/Extension/hoedown_html_patch.c.
 */
import type { Delimiter, MarkdownIt, StateCore, StateInline, Token } from 'markdown-it';
import { cIsAlnum, cIsAlpha, cIsPunct, cIsSpace, escapeHref, escapeHtml, findEmphChar, isEscaped, isSpaceCode } from './hoedown';

type InlineRule = (state: StateInline, silent: boolean) => boolean;

function ruleFn(md: MarkdownIt, name: string): InlineRule {
  const rule = md.inline.ruler.__rules__.find((r) => r.name === name);
  if (!rule) throw new Error(`markdown-it inline rule ${name} not found`);
  return rule.fn as InlineRule;
}

// ---------------------------------------------------------------------------
// F-121 intra-word emphasis (P-17), applies to *, _, ~~ and ==.
// ---------------------------------------------------------------------------

/**
 * Delimiter entry with the extra D-08 condition: the opener is valid only if
 * the delimiter at index `requires` (same list) ends up matched.
 */
type HoedownDelimiter = Delimiter & { requires?: number };

/**
 * Hoedown `HOEDOWN_EXT_NO_INTRA_EMPHASIS` opener rule [document.c:777-780]:
 *
 *     if (offset > 0 && !_isspace(data[-1]) && data[-1] != '>' && data[-1] != '(') return 0;
 *
 * `offset` counts the characters since the end of the last *successful*
 * inline construct of the current (possibly nested) span [document.c:500].
 * So an opener is rejected only when plain text precedes it; one that follows
 * a construct, or starts nested content (`[*a*](u)`, `**_a_**`, `"_a_"`,
 * `~~_a_~~`), is allowed (D-08).
 *
 * Returns true (allowed), false (rejected), or the index of the preceding
 * delimiter in `state.delimiters` when the preceding character is the last
 * character of a delimiter run whose fate is not known yet: the opener is
 * then allowed only if that delimiter gets matched (Hoedown parsed it as a
 * construct), which `balanceWithConditions` resolves.
 */
function precedingStatus(state: StateInline, start: number): boolean | number {
  if (start === 0) return true;
  const prev = state.src.charCodeAt(start - 1);
  const plainOk = isSpaceCode(prev) || prev === 0x3e || prev === 0x28;
  if (state.pending.length > 0) return plainOk; // plain text since the last construct
  const n = state.tokens.length;
  if (n === 0) return true; // e.g. after `^()`, which outputs nothing
  const lastDelim = state.delimiters.length - 1;
  if (lastDelim >= 0 && state.delimiters[lastDelim].token === n - 1) return lastDelim;
  // A text token that is not a delimiter is a failed construct's text (a lone
  // `~` or `=` of an odd run), i.e. plain text in Hoedown.
  if (state.tokens[n - 1].type === 'text') return plainOk;
  // link_open/close, code, html, escapes, entities, sup, q, math, breaks…
  return true;
}

function applyStatus(d: HoedownDelimiter, status: boolean | number): void {
  if (status === false) d.open = false;
  else if (typeof status === 'number' && d.open) d.requires = status;
}

/** markdown-it 15 `processDelimiters` (rules_inline/balance_pairs), unchanged. */
function processDelimiters(delimiters: Delimiter[]): void {
  const openersBottom: Record<number, number[]> = {};
  const max = delimiters.length;
  if (!max) return;
  let headerIdx = 0;
  let lastTokenIdx = -2;
  const jumps: number[] = [];
  for (let closerIdx = 0; closerIdx < max; closerIdx++) {
    const closer = delimiters[closerIdx];
    jumps.push(0);
    if (delimiters[headerIdx].marker !== closer.marker || lastTokenIdx !== closer.token - 1) headerIdx = closerIdx;
    lastTokenIdx = closer.token;
    closer.length = closer.length || 0;
    if (!closer.close) continue;
    if (!Object.prototype.hasOwnProperty.call(openersBottom, closer.marker)) openersBottom[closer.marker] = [-1, -1, -1, -1, -1, -1];
    const minOpenerIdx = openersBottom[closer.marker][(closer.open ? 3 : 0) + (closer.length % 3)];
    let openerIdx = headerIdx - jumps[headerIdx] - 1;
    let newMinOpenerIdx = openerIdx;
    for (; openerIdx > minOpenerIdx; openerIdx -= jumps[openerIdx] + 1) {
      const opener = delimiters[openerIdx];
      if (opener.marker !== closer.marker) continue;
      if (opener.open && opener.end < 0) {
        let isOddMatch = false;
        if (opener.close || closer.open) {
          if (((opener.length ?? 0) + closer.length) % 3 === 0) {
            if ((opener.length ?? 0) % 3 !== 0 || closer.length % 3 !== 0) isOddMatch = true;
          }
        }
        if (!isOddMatch) {
          const lastJump = openerIdx > 0 && !delimiters[openerIdx - 1].open ? jumps[openerIdx - 1] + 1 : 0;
          jumps[closerIdx] = closerIdx - openerIdx + lastJump;
          jumps[openerIdx] = lastJump;
          closer.open = false;
          opener.end = closerIdx;
          opener.close = false;
          newMinOpenerIdx = -1;
          lastTokenIdx = -2;
          break;
        }
      }
    }
    if (newMinOpenerIdx !== -1) openersBottom[closer.marker][(closer.open ? 3 : 0) + ((closer.length || 0) % 3)] = newMinOpenerIdx;
  }
}

/**
 * `balance_pairs` with the D-08 conditions: pairs are matched, then every
 * conditional opener whose preceding delimiter stayed unmatched is disabled
 * and the list is matched again, until nothing changes.
 */
function balanceWithConditions(list: HoedownDelimiter[]): void {
  if (!list.some((d) => d.requires !== undefined)) {
    processDelimiters(list);
    return;
  }
  const initial = list.map((d) => ({ open: d.open, close: d.close }));
  for (let pass = 0; pass <= list.length; pass++) {
    list.forEach((d, i) => {
      d.open = initial[i].open;
      d.close = initial[i].close;
      d.end = -1;
    });
    processDelimiters(list);
    const matched = new Set<number>();
    list.forEach((d, i) => {
      if (d.end >= 0) {
        matched.add(i);
        matched.add(d.end);
      }
    });
    let changed = false;
    list.forEach((d, i) => {
      if (d.requires !== undefined && initial[i].open && !matched.has(d.requires)) {
        initial[i].open = false;
        changed = true;
      }
    });
    if (!changed) return;
  }
}

/** Length of the run of `marker` characters at `start`. */
function runLength(src: string, start: number, max: number, marker: number): number {
  let i = start;
  while (i < max && src.charCodeAt(i) === marker) i++;
  return i - start;
}

/**
 * Replacement for markdown-it's `emphasis` tokenizer. With P-17 on, `_`
 * splits words like `*` (Hoedown treats both markers the same:
 * `snake_case_word` → `snake<em>case</em>word`). With P-17 off the Hoedown
 * conditions apply to `*`, `_`, `~~` and `==`:
 * - an opener follows the rule of `precedingStatus` (D-08);
 * - a closing *single* `*`/`_` is rejected when followed by a letter or digit
 *   [document.c parse_emph1];
 * - a `*`/`_` run of 4 or more never opens (char_emphasis has no case for it,
 *   and the later characters of the run follow plain text);
 * - a `~`/`=` run opens only when it is exactly 2 long (`~~~b~~~` stays
 *   literal: the triple case returns 0 for `~` and `=`, and the rest of the
 *   run follows plain text).
 */
export function intraEmphasisPlugin(md: MarkdownIt, intra: boolean): void {
  const tokenize: InlineRule = (state, silent) => {
    const start = state.pos;
    const marker = state.src.charCodeAt(start);
    if (silent) return false;
    if (marker !== 0x5f && marker !== 0x2a) return false;
    const scanned = state.scanDelims(start, intra || marker === 0x2a);
    let open = scanned.can_open;
    let close = scanned.can_close;
    let status: boolean | number = true;
    if (!intra) {
      status = scanned.length >= 4 ? false : precedingStatus(state, start);
      if (scanned.length === 1) {
        const next = start + 1 < state.posMax ? state.src.charCodeAt(start + 1) : 0;
        if (cIsAlnum(next)) close = false;
      }
      if (status === false) open = false;
    }
    for (let i = 0; i < scanned.length; i++) {
      const token = state.push('text', '', 0);
      token.content = String.fromCharCode(marker);
      const d: HoedownDelimiter = { marker, length: scanned.length, token: state.tokens.length - 1, end: -1, open, close };
      applyStatus(d, status);
      state.delimiters.push(d);
    }
    state.pos += scanned.length;
    return true;
  };
  md.inline.ruler.at('emphasis', tokenize);

  if (intra) return;
  // ~~ and == (two-character delimiters, Hoedown parse_emph2: no closer check).
  for (const name of ['strikethrough', 'mark']) {
    if (!md.inline.ruler.__rules__.some((r) => r.name === name)) continue;
    const orig = ruleFn(md, name);
    md.inline.ruler.at(name, (state, silent) => {
      const start = state.pos;
      const marker = state.src.charCodeAt(start);
      const status = silent ? true : runLength(state.src, start, state.posMax, marker) === 2 ? precedingStatus(state, start) : false;
      const before = state.delimiters.length;
      const ok = orig(state, silent);
      if (ok && !silent) {
        for (let i = before; i < state.delimiters.length; i++) applyStatus(state.delimiters[i] as HoedownDelimiter, status);
      }
      return ok;
    });
  }
  md.inline.ruler2.at('balance_pairs', (state) => {
    balanceWithConditions(state.delimiters);
    for (const meta of state.tokens_meta) if (meta?.delimiters) balanceWithConditions(meta.delimiters);
    return false;
  });
}

// ---------------------------------------------------------------------------
// F-115 underline (P-11): `_x_` → <u>x</u>; `*x*` stays <em>, `__x__` <strong>.
// ---------------------------------------------------------------------------

export function underlinePlugin(md: MarkdownIt): void {
  md.renderer.rules.em_open = (tokens, idx, options, _env, self) =>
    tokens[idx].markup === '_' ? '<u>' : self.renderToken(tokens, idx, options);
  md.renderer.rules.em_close = (tokens, idx, options, _env, self) =>
    tokens[idx].markup === '_' ? '</u>' : self.renderToken(tokens, idx, options);
}

// ---------------------------------------------------------------------------
// Text rule: markdown-it's text rule plus extra terminators, so that rules
// for characters markdown-it does not stop at can see them: `"` for the quote
// rule (F-119) and `w` for `www.` autolinks (F-113).
// ---------------------------------------------------------------------------

function isTerminator(ch: number): boolean {
  switch (ch) {
    case 0x0a: case 0x21: case 0x23: case 0x24: case 0x25: case 0x26:
    case 0x2a: case 0x2b: case 0x2d: case 0x3a: case 0x3c: case 0x3d: case 0x3e:
    case 0x40: case 0x5b: case 0x5c: case 0x5d: case 0x5e: case 0x5f: case 0x60:
    case 0x7b: case 0x7d: case 0x7e:
      return true;
    default:
      return false;
  }
}

const extraTerminators = new WeakMap<MarkdownIt, Set<number>>();

/** Makes the text rule also stop at `codes` (installs the rule once per instance). */
function addTextTerminators(md: MarkdownIt, ...codes: number[]): void {
  let extra = extraTerminators.get(md);
  if (!extra) {
    const set = new Set<number>();
    extra = set;
    extraTerminators.set(md, set);
    md.inline.ruler.at('text', (state, silent) => {
      let pos = state.pos;
      while (pos < state.posMax) {
        const ch = state.src.charCodeAt(pos);
        if (isTerminator(ch) || set.has(ch)) break;
        pos++;
      }
      if (pos === state.pos) return false;
      if (!silent) state.pending += state.src.slice(state.pos, pos);
      state.pos = pos;
      return true;
    });
  }
  for (const c of codes) extra.add(c);
}

/** Tokenizes `src[from, to)` as nested inline content between open/close tokens. */
function nested(state: StateInline, from: number, to: number, open: string, close: string, tag: string): void {
  const max = state.posMax;
  const o = state.push(open, tag, 1);
  o.markup = '';
  state.pos = from;
  state.posMax = to;
  state.md.inline.tokenize(state);
  state.push(close, tag, -1);
  state.posMax = max;
}


// ---------------------------------------------------------------------------
// F-113 autolink (P-09): port of Hoedown 3.0.7 src/autolink.c and the
// char_autolink_url / _email / _www triggers [document.c:1009-1095] (D-05).
// Only `scheme://` URLs with a safe scheme (http, https, ftp), `www.`
// addresses and e-mail addresses are linked; bare domains and file names
// (`example.com`, `README.md`) are not. linkify-it cannot express these rules
// (with `fuzzyLink: false` it also drops `www.`), so it is not used.
// ---------------------------------------------------------------------------

/** `autolink_delim`: trims trailing punctuation, entities and unbalanced closers. */
function autolinkDelim(data: string, linkEnd: number): number {
  const lt = data.indexOf('<');
  if (lt >= 0 && lt < linkEnd) linkEnd = lt;
  while (linkEnd > 0) {
    const c = data[linkEnd - 1];
    if ('?!.,:'.includes(c)) linkEnd--;
    else if (c === ';') {
      let newEnd = linkEnd - 2;
      while (newEnd > 0 && cIsAlpha(data.charCodeAt(newEnd))) newEnd--;
      if (newEnd < linkEnd - 2 && data[newEnd] === '&') linkEnd = newEnd;
      else linkEnd--;
    } else break;
  }
  if (linkEnd === 0) return 0;
  const cclose = data[linkEnd - 1];
  const copen = ({ '"': '"', "'": "'", ')': '(', ']': '[', '}': '{' } as Record<string, string>)[cclose];
  if (copen) {
    let opening = 0;
    let closing = 0;
    for (let i = 0; i < linkEnd; i++) {
      if (data[i] === copen) opening++;
      else if (data[i] === cclose) closing++;
    }
    if (closing !== opening) linkEnd--;
  }
  return linkEnd;
}

/** `check_domain` (allow_short = 0): needs a dot; returns the domain length or 0. */
function checkDomain(data: string): number {
  if (!data.length || !cIsAlnum(data.charCodeAt(0))) return 0;
  let np = 0;
  let i = 1;
  for (; i < data.length - 1; i++) {
    const c = data.charCodeAt(i);
    if (c === 0x2e || c === 0x3a) np++;
    else if (!cIsAlnum(c) && c !== 0x2d) break;
  }
  return np ? i : 0;
}

/** Extends `linkEnd` up to the next whitespace character. */
function toSpace(data: string, linkEnd: number): number {
  while (linkEnd < data.length && !cIsSpace(data.charCodeAt(linkEnd))) linkEnd++;
  return linkEnd;
}

/**
 * Plain text right before `state.pos` that a trigger may "rewind" into
 * (Hoedown's `max_rewind`: the text since the last successful construct).
 * That is the pending text, then plain text tokens and, for e-mail
 * addresses, `_` delimiters that can no longer be matched (no `_` follows),
 * which Hoedown would have output as plain text.
 */
function rewindable(state: StateInline, allowUnderscore: boolean): number {
  let n = state.pending.length;
  const tokens = state.tokens;
  const delims = state.delimiters;
  let d = delims.length - 1;
  const laterUnderscore = state.src.slice(state.pos, state.posMax).includes('_');
  for (let t = tokens.length - 1; t >= 0; t--) {
    const tok = tokens[t];
    if (tok.type !== 'text') break;
    if (d >= 0 && delims[d].token === t) {
      if (!allowUnderscore || delims[d].marker !== 0x5f || laterUnderscore) break;
      d--;
    }
    n += tok.content.length;
  }
  return n;
}

/** Removes the last `count` characters of plain output (pending, then text tokens). */
function rewindOutput(state: StateInline, count: number): void {
  const fromPending = Math.min(count, state.pending.length);
  state.pending = state.pending.slice(0, state.pending.length - fromPending);
  count -= fromPending;
  while (count > 0 && state.tokens.length) {
    const tok = state.tokens[state.tokens.length - 1];
    const d = state.delimiters.length - 1;
    if (tok.content.length <= count) {
      count -= tok.content.length;
      state.tokens.pop();
      if (d >= 0 && state.delimiters[d].token === state.tokens.length) state.delimiters.pop();
    } else {
      tok.content = tok.content.slice(0, tok.content.length - count);
      count = 0;
    }
  }
}

function pushAutolink(state: StateInline, url: string, text: string): boolean {
  const href = escapeHref(url); // rndr_autolink / rndr_link use escape_href
  if (!state.md.validateLink(href)) return false;
  const open = state.push('link_open', 'a', 1);
  open.attrs = [['href', href]];
  open.markup = 'linkify';
  open.info = 'auto';
  const t = state.push('text', '', 0);
  t.content = text;
  const close = state.push('link_close', 'a', -1);
  close.markup = 'linkify';
  close.info = 'auto';
  return true;
}

export function autolinkPlugin(md: MarkdownIt): void {
  // char_autolink_url, triggered by ':' (`hoedown_autolink__url`).
  const url: InlineRule = (state, silent) => {
    if (state.linkLevel > 0) return false; // `in_link_body`
    const src = state.src;
    const pos = state.pos;
    if (src.charCodeAt(pos) !== 0x3a) return false;
    const data = src.slice(pos, state.posMax);
    if (data.length < 4 || data[1] !== '/' || data[2] !== '/') return false;
    const maxRewind = rewindable(state, false);
    let rewind = 0;
    while (rewind < maxRewind && cIsAlpha(src.charCodeAt(pos - 1 - rewind))) rewind++;
    // hoedown_autolink_is_safe: http://, https://, ftp:// followed by an alnum.
    const full = src.slice(pos - rewind, state.posMax);
    const safe = ['http://', 'https://', 'ftp://'].some(
      (p) => full.length > p.length && full.slice(0, p.length).toLowerCase() === p && cIsAlnum(full.charCodeAt(p.length)),
    );
    if (!safe) return false;
    const domainLen = checkDomain(data.slice(3));
    if (!domainLen) return false;
    const linkEnd = autolinkDelim(data, toSpace(data, 3 + domainLen));
    if (!linkEnd) return false;
    const link = src.slice(pos - rewind, pos + linkEnd);
    if (!silent) {
      if (!state.md.validateLink(escapeHref(link))) return false;
      rewindOutput(state, rewind);
      pushAutolink(state, link, link);
    }
    state.pos = pos + linkEnd;
    return true;
  };

  // char_autolink_email, triggered by '@' (`hoedown_autolink__email`).
  const email: InlineRule = (state, silent) => {
    if (state.linkLevel > 0) return false;
    const src = state.src;
    const pos = state.pos;
    if (src.charCodeAt(pos) !== 0x40) return false;
    const maxRewind = rewindable(state, true);
    let rewind = 0;
    for (; rewind < maxRewind; rewind++) {
      const c = src.charCodeAt(pos - 1 - rewind);
      if (cIsAlnum(c) || c === 0x2e || c === 0x2b || c === 0x2d || c === 0x5f) continue;
      break;
    }
    if (rewind === 0) return false;
    const data = src.slice(pos, state.posMax);
    let linkEnd = 0;
    let nb = 0;
    let np = 0;
    for (; linkEnd < data.length; linkEnd++) {
      const c = data.charCodeAt(linkEnd);
      if (cIsAlnum(c)) continue;
      if (c === 0x40) nb++;
      else if (c === 0x2e && linkEnd < data.length - 1) np++;
      else if (c !== 0x2d && c !== 0x5f) break;
    }
    if (linkEnd < 2 || nb !== 1 || np === 0 || !cIsAlpha(data.charCodeAt(linkEnd - 1))) return false;
    linkEnd = autolinkDelim(data, linkEnd);
    if (!linkEnd) return false;
    const link = src.slice(pos - rewind, pos + linkEnd);
    if (!silent) {
      rewindOutput(state, rewind);
      pushAutolink(state, `mailto:${link}`, link);
    }
    state.pos = pos + linkEnd;
    return true;
  };

  // char_autolink_www, triggered by 'w' (`hoedown_autolink__www`).
  const www: InlineRule = (state, silent) => {
    if (state.linkLevel > 0) return false;
    const src = state.src;
    const pos = state.pos;
    if (src.charCodeAt(pos) !== 0x77) return false;
    if (pos > 0) {
      const prev = src.charCodeAt(pos - 1);
      if (!cIsPunct(prev) && !cIsSpace(prev)) return false;
    }
    const data = src.slice(pos, state.posMax);
    if (data.length < 4 || !data.startsWith('www.')) return false;
    const domainLen = checkDomain(data);
    if (!domainLen) return false;
    const linkEnd = autolinkDelim(data, toSpace(data, domainLen));
    if (!linkEnd) return false;
    const link = data.slice(0, linkEnd);
    if (!silent && !pushAutolink(state, `http://${link}`, link)) return false;
    state.pos = pos + linkEnd;
    return true;
  };

  addTextTerminators(md, 0x77);
  md.inline.ruler.before('linkify', 'hoedown_autolink_url', url);
  md.inline.ruler.before('linkify', 'hoedown_autolink_email', email);
  md.inline.ruler.before('linkify', 'hoedown_autolink_www', www);
}

// ---------------------------------------------------------------------------
// F-118 superscript (P-14): `^word` and `^(several words)` [document.c:1320].
// ---------------------------------------------------------------------------

export function superscriptPlugin(md: MarkdownIt): void {
  const rule: InlineRule = (state, silent) => {
    const src = state.src;
    const start = state.pos;
    const max = state.posMax;
    if (src.charCodeAt(start) !== 0x5e) return false;
    const size = max - start;
    if (size < 2) return false;
    let supStart: number;
    let supLen: number;
    if (src.charCodeAt(start + 1) === 0x28) {
      supStart = 2;
      supLen = findEmphChar(src, start + 2, max, 0x29) + 2;
      if (supLen === size) return false;
    } else {
      supStart = supLen = 1;
      while (supLen < size && !isSpaceCode(src.charCodeAt(start + supLen))) supLen++;
    }
    if (supLen - supStart === 0) {
      if (supStart !== 2) return false;
      // `^()` (and the original's quirk for an unclosed `^(`): three
      // characters are consumed and nothing is output.
      state.pos = start + 3;
      return true;
    }
    if (!silent) nested(state, start + supStart, start + supLen, 'sup_open', 'sup_close', 'sup');
    state.pos = start + (supStart === 2 ? supLen + 1 : supLen);
    return true;
  };
  md.inline.ruler.after('emphasis', 'macdown_superscript', rule);
}

// ---------------------------------------------------------------------------
// F-119 quote (P-15): `"x"` → <q>x</q> [document.c char_quote].
// ---------------------------------------------------------------------------

export function quotePlugin(md: MarkdownIt): void {
  const rule: InlineRule = (state, silent) => {
    const src = state.src;
    const start = state.pos;
    const max = state.posMax;
    const size = max - start;
    if (src.charCodeAt(start) !== 0x22) return false;
    let nq = 0;
    while (nq < size && src.charCodeAt(start + nq) === 0x22) nq++;
    let end = nq;
    for (;;) {
      let i = end;
      end += findEmphChar(src, start + end, max, 0x22);
      if (end === i) return false; // no matching delimiter
      i = end;
      while (end < size && src.charCodeAt(start + end) === 0x22 && end - i < nq) end++;
      if (end - i >= nq) break;
    }
    let fBegin = nq;
    while (fBegin < end && src.charCodeAt(start + fBegin) === 0x20) fBegin++;
    let fEnd = end - nq;
    while (fEnd > nq && src.charCodeAt(start + fEnd - 1) === 0x20) fEnd--;
    // rndr_quote returns 0 for empty content, so the quotes stay literal.
    if (fBegin >= fEnd) return false;
    if (!silent) nested(state, start + fBegin, start + fEnd, 'quote_open', 'quote_close', 'q');
    state.pos = start + end;
    return true;
  };
  addTextTerminators(md, 0x22);
  md.inline.ruler.after('emphasis', 'macdown_quote', rule);
}

// ---------------------------------------------------------------------------
// F-130 / F-131 math (P-18, P-19) [document.c:733-772, 921-933, 1356-1367].
// ---------------------------------------------------------------------------

function parseMath(
  state: StateInline,
  silent: boolean,
  end: string,
  delimsz: number,
  display: boolean,
  explicit: boolean,
): boolean {
  const src = state.src;
  const start = state.pos;
  const size = state.posMax - start;
  let i = delimsz;
  for (;;) {
    while (i < size && src[start + i] !== end[0]) i++;
    if (i >= size) return false;
    if (!isEscaped(src, start + i, start) && !(i + delimsz > size) && src.substr(start + i, delimsz) === end) break;
    i++;
  }
  const text = src.slice(start + delimsz, start + i);
  i += delimsz;
  if (delimsz === 2 && !explicit) {
    // `$$` without MATH_EXPLICIT: display only when alone in its paragraph.
    const blank = (s: string) => /^[ \n]*$/.test(s);
    display = blank(src.slice(0, start)) && blank(src.slice(start + i, state.posMax));
  }
  if (!silent) {
    const t = state.push('macdown_math', 'math', 0);
    t.content = text;
    t.meta = { display };
    t.markup = src.slice(start, start + i);
  }
  state.pos = start + i;
  return true;
}

export function mathPlugin(md: MarkdownIt, explicit: boolean): void {
  const rule: InlineRule = (state, silent) => {
    const src = state.src;
    const start = state.pos;
    const size = state.posMax - start;
    const c = src.charCodeAt(start);
    if (c === 0x5c) {
      if (size > 2 && src.charCodeAt(start + 1) === 0x5c && (src[start + 2] === '(' || src[start + 2] === '[')) {
        const isDisplay = src[start + 2] === '[';
        return parseMath(state, silent, isDisplay ? '\\\\]' : '\\\\)', 3, isDisplay, explicit);
      }
      return false;
    }
    if (c === 0x24) {
      if (size > 1 && src.charCodeAt(start + 1) === 0x24) return parseMath(state, silent, '$$', 2, true, explicit);
      if (explicit) return parseMath(state, silent, '$', 1, false, explicit);
    }
    return false;
  };
  md.inline.ruler.before('escape', 'macdown_math', rule);
  // rndr_math [html.c:550-557]: the TeX is HTML-escaped, never parsed.
  md.renderer.rules.macdown_math = (tokens, idx) => {
    const t = tokens[idx];
    const d = (t.meta as { display: boolean }).display;
    return (d ? '\\[' : '\\(') + escapeHtml(t.content) + (d ? '\\]' : '\\)');
  };
}

// ---------------------------------------------------------------------------
// F-117 footnotes (P-13), Hoedown markup (§6.5) on top of markdown-it-footnote.
// ---------------------------------------------------------------------------

export function hoedownFootnotes(md: MarkdownIt): void {
  md.inline.ruler.disable('footnote_inline'); // Hoedown has no `^[inline]` notes.

  // D-06: Hoedown renders a footnote reference only while the footnote is
  // unused (`if (fr && !fr->is_used)` [document.c:1133]); a later `[^id]` to
  // the same footnote produces nothing and stays literal text. markdown-it-
  // footnote would emit another <sup> with the same id.
  const orig = ruleFn(md, 'footnote_ref');
  md.inline.ruler.at('footnote_ref', (state, silent) => {
    const src = state.src;
    const start = state.pos;
    if (src.charCodeAt(start) === 0x5b && src.charCodeAt(start + 1) === 0x5e) {
      const close = src.indexOf(']', start + 2);
      const refs = (state.env as { footnotes?: { refs?: Record<string, number> } }).footnotes?.refs;
      if (close > start + 2 && close < state.posMax && refs) {
        const id = refs[`:${src.slice(start + 2, close)}`];
        if (typeof id === 'number' && id >= 0) return false;
      }
    }
    return orig(state, silent);
  });

  const n = (t: Token) => (t.meta as { id: number }).id + 1;
  md.renderer.rules.footnote_ref = (tokens, idx) => {
    const k = n(tokens[idx]);
    return `<sup id="fnref${k}"><a href="#fn${k}" rel="footnote">${k}</a></sup>`;
  };
  md.renderer.rules.footnote_block_open = () => '\n<div class="footnotes">\n<hr>\n<ol>\n';
  md.renderer.rules.footnote_block_close = () => '\n</ol>\n</div>\n';
  md.renderer.rules.footnote_open = (tokens, idx) => `\n<li id="fn${n(tokens[idx])}">\n`;
  md.renderer.rules.footnote_close = () => '</li>\n';
  md.renderer.rules.footnote_anchor = (tokens, idx) =>
    `&nbsp;<a href="#fnref${n(tokens[idx])}" rev="footnote">&#8617;</a>`;

  // rndr_footnote_def: one back-link, before the first </p> of the
  // definition; none when the definition has no paragraph.
  md.core.ruler.after('footnote_tail', 'macdown_footnote_anchor', (state: StateCore) => {
    const result: Token[] = [];
    let anchor: Token | null = null;
    for (const t of state.tokens) {
      if (t.type === 'footnote_anchor') continue; // markdown-it puts them in the last paragraph
      if (t.type === 'footnote_open') {
        anchor = new state.Token('footnote_anchor', '', 0);
        anchor.meta = t.meta;
      } else if (t.type === 'footnote_close') {
        anchor = null;
      } else if (anchor && t.type === 'paragraph_close') {
        result.push(anchor);
        anchor = null;
      }
      result.push(t);
    }
    state.tokens = result;
  });
}

// ---------------------------------------------------------------------------
// F-132 task lists (P-26) [hoedown_html_patch.c:94-140].
// ---------------------------------------------------------------------------

export function taskListPlugin(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'macdown_task_list', (state: StateCore) => {
    const tokens = state.tokens;
    for (let i = 0; i + 2 < tokens.length; i++) {
      if (tokens[i].type !== 'list_item_open') continue;
      if (tokens[i + 1].type !== 'paragraph_open' || tokens[i + 2].type !== 'inline') continue;
      const inline = tokens[i + 2];
      const first = inline.children?.[0];
      if (!first || first.type !== 'text') continue;
      const mark = first.content.slice(0, 3);
      // strncmp with "[ ]" and "[x]" only: upper-case [X] is not a task (U-16).
      if (mark !== '[ ]' && mark !== '[x]') continue;
      tokens[i].attrJoin('class', 'task-list-item');
      first.content = first.content.slice(3);
      const box = new state.Token('html_inline', '', 0);
      box.content = mark === '[x]' ? '<input type="checkbox" checked>' : '<input type="checkbox">';
      inline.children!.unshift(box);
    }
  });
}
