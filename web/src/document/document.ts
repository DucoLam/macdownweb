/**
 * Document model (spec §2.2): file name, saved text and edited state, the
 * window title (F-16), the presumed file name (F-31) and the save rules
 * (F-26, F-30, F-34). Pure functions; the browser side is in files.ts and
 * useDocument.ts.
 */
import { detectFrontMatter } from '../render/frontMatter';

export type DocumentKind =
  /** New document, never saved (F-21). */
  | 'untitled'
  /** Opened from or saved to a file (F-22, F-26). */
  | 'file'
  /** Help > MacDown Help / Contributing (F-153, F-154): a copy that is not autosaved as the draft. */
  | 'help';

export interface DocumentInfo {
  kind: DocumentKind;
  /** File name with extension (`notes.md`), or null for an untitled document. */
  name: string | null;
  /** Text as last opened or saved; null for an untitled document. */
  savedText: string | null;
}

export const UNTITLED: DocumentInfo = Object.freeze({ kind: 'untitled', name: null, savedText: null }) as DocumentInfo;

/**
 * `-[NSString pathExtension]` (D-17), checked with a Foundation probe on
 * macOS: the text after the last dot of the last path component, but only
 * when that dot is not the component's first character, the component does
 * not start with "..", and the text is non-empty and has no space (U+0020).
 * So `a.md` -> `md`, `a..md` -> `md`, but `a.`, `.md`, `..md`, `a.m d` and
 * `Notes v1.5 final` have no extension. A tab or a no-break space is allowed.
 */
export function pathExtension(name: string): string {
  const comp = name.slice(name.lastIndexOf('/') + 1);
  const dot = comp.lastIndexOf('.');
  if (dot <= 0 || comp.startsWith('..')) return '';
  const ext = comp.slice(dot + 1);
  return ext && !ext.includes(' ') ? ext : '';
}

/** File name without its extension (`stringByDeletingPathExtension`, D-17). */
export function stripExtension(name: string): string {
  const ext = pathExtension(name);
  return ext ? name.slice(0, name.length - ext.length - 1) : name;
}

/**
 * `-[NSString hasExtension:]` [NSString+Lookup.m:114-117]: the path
 * extension (as above) equals `ext`. The original compares case-sensitively
 * (`isEqualToString:`); the web app keeps its case-insensitive test (see the
 * M5 report: `Notes.MD` would get `Untitled.md` here, `Notes.MD.md` in
 * MacDown).
 */
export function hasExtension(name: string, ext: string): boolean {
  return pathExtension(name).toLowerCase() === ext.toLowerCase();
}

/**
 * F-34 `isDocumentEdited`: an unnamed, empty document is never "edited"
 * (no save prompt); otherwise the text differs from the saved text.
 * (NSDocument counts changes; comparing the text gives the same answer after
 * undoing back to the saved state.)
 */
export function isEdited(info: DocumentInfo, text: string): boolean {
  if (info.savedText === null) return text.length > 0;
  return text !== info.savedText;
}

/** The name shown in the title and the save prompt: the file name, or "Untitled". */
export function displayName(info: DocumentInfo): string {
  return info.name ?? 'Untitled';
}

/**
 * F-16 window title: the file name or "Untitled", with " — Edited" while
 * the document has unsaved changes (the macOS 10.8+ NSDocument title).
 */
export function windowTitle(info: DocumentInfo, text: string): string {
  return displayName(info) + (isEdited(info, text) ? ' — Edited' : '');
}

/**
 * `-[NSString titleString]` [NSString+Lookup.m:89-112]: the highest-level
 * ATX header. The first line matching `^#\s+(\S.*)$` anywhere in the text,
 * else `^##\s+(\S.*)$`, and so on to six `#`. `^`/`$` match at lines
 * (NSRegularExpressionAnchorsMatchLines); `\s+` may span a newline, as in the
 * original. Setext headers are ignored.
 */
export function titleString(text: string): string | null {
  for (let level = 1; level <= 6; level++) {
    const m = new RegExp(`^${'#'.repeat(level)}\\s+(\\S.*)$`, 'm').exec(text);
    if (m) return m[1];
  }
  return null;
}

/**
 * `[[frontMatter objectForKey:@"title"] description]`, or null.
 * With `kYAMLReadOptionStringScalars` every scalar is an NSString
 * [YAMLSerialization.m:80-82], so an empty value is "" (never NSNull). A
 * front matter that is not a mapping would raise in the original
 * (`objectForKey:` on an array or string); the web app treats it as no title.
 */
export function frontMatterTitle(text: string): string | null {
  const fm = detectFrontMatter(text);
  const v = fm?.value;
  if (!(v instanceof Map)) return null;
  const title = v.get('title');
  if (title === undefined || title === null) return null;
  return typeof title === 'string' ? title : String(title);
}

/**
 * F-31 `presumedFileName` [MPDocument.m:1865-1892], in the source order:
 * (1) a saved document uses its file name without extension; (2) the
 * front-matter `title` when P-28 is on, as is; (3) the highest-level header,
 * with `/`, `|` and `:` replaced by `-`; (4) "Untitled".
 */
export function presumedFileName(info: DocumentInfo, text: string, detectFrontMatter: boolean): string {
  if (info.name) return stripExtension(info.name);
  if (detectFrontMatter) {
    // SD-13: `if (title) return title;` tests for nil only, so an empty
    // title (`title:` or `title: ""`, a string scalar "") is returned as is.
    const title = frontMatterTitle(text);
    if (title !== null) return title;
  }
  const title = titleString(text);
  if (!title) return 'Untitled';
  return title.replace(/[/|:]/g, '-');
}

/**
 * F-26 `prepareSavePanel:` name: suggested only for a document that was
 * never saved, with `.md` added. A presumed name that already ends in `.md`
 * is not set, so the panel keeps its default ("Untitled"); the web app then
 * suggests `Untitled.md`. A saved document (Save As) gets its current name.
 */
export function suggestedSaveName(info: DocumentInfo, text: string, detectFrontMatter: boolean): string {
  if (info.name) return info.name;
  const name = presumedFileName(info, text, detectFrontMatter);
  // SD-13: for an empty presumed name `stringByAppendingPathExtension:`
  // returns nil and `nameFieldStringValue = nil` raises
  // NSInternalInconsistencyException in the original (AppKit probe), so
  // Save of such a document fails there. Deviation: the web app keeps the
  // panel's default name, "Untitled.md".
  if (name === '' || hasExtension(name, 'md')) return 'Untitled.md';
  return `${name}.md`;
}

/**
 * F-30 (P-41): position where "\n" is inserted before saving, or null when
 * the text is empty or already ends with a newline character
 * (`newlineCharacterSet`: LF, CR, NEL, LS, PS and the other vertical breaks).
 */
export function newlineInsertionPoint(text: string): number | null {
  if (!text.length) return null;
  return /[\n\r\u000b\u000c\u0085\u2028\u2029]$/.test(text) ? null : text.length;
}

/** Title of the preview/export page (F-139, E-04): file name without extension, empty when untitled. */
export function htmlTitle(info: DocumentInfo): string {
  return info.name ? stripExtension(info.name) : '';
}

/** Is this file name one MacDown opens as a document (`md`, `markdown`, plain text)? */
export function isMarkdownFileName(name: string): boolean {
  return /\.(md|markdown|mdown|mkd|mkdn|txt|text)$/i.test(name);
}
