/**
 * D-13 / SD-11 (F-22, F-26, F-34): the document keeps its line breaks as
 * read, like NSTextView, which stores the string as is.
 *
 * CodeMirror splits a document on `\r\n`, `\r` and `\n` and works with one
 * internal separator ("\n"), which is what the editor shows and what editing
 * commands see. This extension remembers, for each line break, the separator
 * it had when it was read (only the breaks that were not "\n"), maps them
 * through every change, and rebuilds the text with them (`fileText`).
 *
 * Behaviour, checked against an AppKit probe (NSTextView, macOS):
 * - CRLF, lone CR and mixed line endings are kept exactly when untouched.
 * - A newly typed or inserted line break is "\n" (`insertNewline:` inserts
 *   LF even in a CRLF document), so editing a CRLF file can give mixed
 *   line endings, as in MacDown.
 * - Deleting a break deletes it whole (Backspace after CRLF removes both
 *   characters in NSTextView too); undo and redo bring its separator back.
 * - Deviation: text pasted or dropped into the editor has its breaks turned
 *   into "\n" (NSTextView would keep a pasted CRLF).
 */
import { MapMode, StateEffect, StateField, type EditorState, type Extension, type Text, type Transaction } from '@codemirror/state';
import { invertedEffects } from '@codemirror/commands';

/** A line break that is not "\n": `pos` is the offset of the break in the editor document. */
interface Sep {
  pos: number;
  sep: '\r\n' | '\r';
}

/** Puts a separator back on the break at `pos` (undo / redo of its deletion). */
const restoreSep = StateEffect.define<Sep>({
  map: (v, m) => {
    const pos = m.mapPos(v.pos, 1, MapMode.TrackDel);
    return pos === null ? undefined : { pos, sep: v.sep };
  },
});

/** Replaces every separator from a raw text that is the whole new document (test hook `set`). */
export const resetLineBreaks = StateEffect.define<string>();

/** Breaks of a raw string as CodeMirror splits it (`/\r\n?|\n/`), positions in editor coordinates. */
export function scanLineBreaks(raw: string): Sep[] {
  const out: Sep[] = [];
  if (!raw.includes('\r')) return out;
  const re = /\r\n?|\n/g;
  let extra = 0; // characters removed so far (one per CRLF)
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    const pos = m.index - extra;
    if (m[0] === '\r\n') {
      out.push({ pos, sep: '\r\n' });
      extra++;
    } else if (m[0] === '\r') out.push({ pos, sep: '\r' });
  }
  return out;
}

const isBreak = (doc: Text, pos: number) => pos >= 0 && pos < doc.length && doc.lineAt(pos).to === pos;

function update(seps: readonly Sep[], tr: Transaction): readonly Sep[] {
  let next: Sep[] | readonly Sep[] = seps;
  if (tr.docChanged && seps.length) {
    const deleted: [number, number][] = [];
    tr.changes.iterChangedRanges((fromA, toA) => {
      if (toA > fromA) deleted.push([fromA, toA]);
    });
    const mapped: Sep[] = [];
    let d = 0;
    for (const s of seps) {
      while (d < deleted.length && deleted[d][1] <= s.pos) d++;
      if (d < deleted.length && deleted[d][0] <= s.pos) continue; // the break itself was deleted
      // assoc 1: text inserted just before the break stays before it.
      mapped.push({ pos: tr.changes.mapPos(s.pos, 1), sep: s.sep });
    }
    next = mapped;
  }
  let reset: string | null = null;
  const restored: Sep[] = [];
  for (const e of tr.effects) {
    if (e.is(resetLineBreaks)) reset = e.value;
    else if (e.is(restoreSep)) restored.push(e.value);
  }
  if (reset !== null) next = scanLineBreaks(reset);
  if (restored.length) {
    const byPos = new Map(next.map((s) => [s.pos, s] as const));
    for (const r of restored) if (isBreak(tr.newDoc, r.pos)) byPos.set(r.pos, r);
    next = [...byPos.values()].sort((a, b) => a.pos - b.pos);
  }
  return next;
}

const lineBreakField = StateField.define<readonly Sep[]>({
  create: () => [],
  update,
});

/** Undo / redo: the separators a transaction deleted come back with the inverse change. */
const invertDeletedSeps = invertedEffects.of((tr) => {
  const seps = tr.startState.field(lineBreakField, false);
  if (!seps?.length || !tr.docChanged) return [];
  const out: StateEffect<Sep>[] = [];
  tr.changes.iterChangedRanges((fromA, toA) => {
    if (toA <= fromA) return;
    for (const s of seps) if (s.pos >= fromA && s.pos < toA) out.push(restoreSep.of(s));
  });
  return out;
});

/** The extension for a document read from `raw` (the text as opened, saved or restored). */
export function lineBreaks(raw: string): Extension {
  return [lineBreakField.init(() => scanLineBreaks(raw)), invertDeletedSeps];
}

/** The document text with its own line breaks: what Save writes and what F-34 compares (D-13). */
export function fileText(state: EditorState): string {
  const doc = state.doc;
  const seps = state.field(lineBreakField, false);
  if (!seps?.length) return doc.toString();
  let out = '';
  let at = 0;
  for (const s of seps) {
    out += doc.sliceString(at, s.pos) + s.sep;
    at = s.pos + 1;
  }
  return out + doc.sliceString(at);
}

/** Line breaks as the renderer sees them: Hoedown turns CR and CRLF into "\n" in its first pass. */
export function normalizeLineBreaks(text: string): string {
  return text.includes('\r') ? text.replace(/\r\n?/g, '\n') : text;
}
