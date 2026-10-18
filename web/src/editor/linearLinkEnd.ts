/**
 * Editor performance (F-22 large files, M5): a linear-time `LinkEnd` for the
 * editor's Markdown parser (@lezer/markdown).
 *
 * Lezer's `LinkEnd`, after it closes a link, marks every earlier `[` of the
 * paragraph as "not a link start" (CommonMark: no links inside links) by
 * walking all earlier inline parts. With one paragraph of n links that is
 * O(n^2): a 2 MB paragraph with 40,000 links took 7 to 20 s to parse, and the
 * editor parses a new document synchronously when it is created (Open).
 *
 * This wrapper gives the same parse tree. It keeps Lezer's own `LinkEnd`
 * (link destination, title, reference parsing) but runs it on the tail of the
 * parts list that starts at the matching `[` / `![`, so its "invalidate the
 * earlier `[`" loop has nothing to walk. The rule is applied lazily instead:
 * every `[` before the index of the last closed link is invalid (an image
 * does not invalidate, and the parts it swallows are gone).
 *
 * The original parsers come from the base parser (`inlineParsers` is not in
 * the typings); if they are not found (a different @lezer/markdown version),
 * no override is installed and Lezer's own parser is used unchanged.
 */
import { Element, type InlineContext, type MarkdownConfig } from '@lezer/markdown';

type InlineParse = (cx: InlineContext, next: number, pos: number) => number;
/** Lezer's internal InlineDelimiter, as far as this module uses it. */
interface Delimiter {
  type: unknown;
  side: number;
}
type Part = Delimiter | Element | null;
interface Internals {
  inlineParsers: readonly (InlineParse | undefined)[];
  inlineNames: readonly string[];
}

const partsOf = (cx: InlineContext) => (cx as unknown as { parts: Part[] }).parts;
const setParts = (cx: InlineContext, parts: Part[]) => ((cx as unknown as { parts: Part[] }).parts = parts);

/** `base`: the Markdown parser whose original inline parsers are wrapped (`commonmarkLanguage.parser`). */
export function linearLinkEnd(base: object): MarkdownConfig {
  const internals = base as unknown as Partial<Internals>;
  const names = internals.inlineNames;
  const parsers = internals.inlineParsers;
  if (!Array.isArray(names) || !Array.isArray(parsers)) return {};
  const original = (name: string) => parsers[names.indexOf(name)];
  const link = original('Link');
  const image = original('Image');
  const linkEnd = original('LinkEnd');
  if (!link || !image || !linkEnd) return {};

  // The delimiter types (module constants of @lezer/markdown), captured from
  // the first delimiter each start parser adds.
  let linkStart: unknown = null;
  let imageStart: unknown = null;
  const capture = (cx: InlineContext): unknown => {
    const parts = partsOf(cx);
    const last = parts[parts.length - 1];
    return last && !(last instanceof Element) ? last.type : null;
  };
  /** Index before which every link start of the context is invalid. */
  const barrier = new WeakMap<InlineContext, number>();

  return {
    parseInline: [
      {
        name: 'Link',
        parse(cx, next, pos) {
          const r = link(cx, next, pos);
          if (r >= 0 && linkStart === null) linkStart = capture(cx);
          return r;
        },
      },
      {
        name: 'Image',
        parse(cx, next, pos) {
          const r = image(cx, next, pos);
          if (r >= 0 && imageStart === null) imageStart = capture(cx);
          return r;
        },
      },
      {
        name: 'LinkEnd',
        parse(cx, next, pos) {
          if (next !== 93 /* ']' */) return -1;
          const parts = partsOf(cx);
          // The nearest link or image start, as Lezer's own scan finds it.
          let i = parts.length - 1;
          for (; i >= 0; i--) {
            const p = parts[i];
            if (p && !(p instanceof Element) && p.type !== null && (p.type === linkStart || p.type === imageStart)) break;
          }
          if (i < 0) return -1;
          const start = parts[i] as Delimiter;
          const isLink = start.type === linkStart;
          // Apply the deferred invalidation to this one start.
          if (isLink && i < (barrier.get(cx) ?? 0)) start.side = 0;
          const tail = parts.splice(i);
          setParts(cx, tail);
          let r: number;
          try {
            r = linkEnd(cx, next, pos);
          } finally {
            const rest = partsOf(cx);
            setParts(cx, parts);
            for (const p of rest) parts.push(p);
          }
          if (r >= 0) {
            // The link or image is now `parts[i]`; everything after it was swallowed.
            if (isLink) barrier.set(cx, i);
            else barrier.set(cx, Math.min(barrier.get(cx) ?? 0, i));
          }
          return r;
        },
      },
    ],
  };
}
