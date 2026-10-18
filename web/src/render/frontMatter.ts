/**
 * F-133 Jekyll front matter (P-28), spec §6.1 step 1 and §6.8.
 * Ports `-[NSString frontMatter:]` [vendor/macdown/MacDown/Code/Extension/NSString+Lookup.m:55-87]
 * and `HTMLTable` [NSObject+HTMLTabularize.m].
 */
import { parseAllDocuments } from 'yaml';

// `^-{3}[\r\n]+(.*?[\r\n]+)((?:-{3})|(?:\.{3}))` with
// NSRegularExpressionDotMatchesLineSeparators; `^` is the start of the text.
const FRONT_MATTER = /^-{3}[\r\n]+([\s\S]*?[\r\n]+)((?:-{3})|(?:\.{3}))/;

export interface FrontMatter {
  /** The first YAML document (all scalars are strings, maps are ordered). */
  value: unknown;
  /** Length of the matched front matter, removed from the Markdown. */
  length: number;
}

/**
 * Returns the front matter at the start of `markdown`, or null. As in the
 * original, the block is removed only when YAML yields at least one document
 * (a YAML error yields none).
 */
export function detectFrontMatter(markdown: string): FrontMatter | null {
  const m = FRONT_MATTER.exec(markdown);
  if (!m) return null;
  let docs;
  try {
    // failsafe schema = kYAMLReadOptionStringScalars (every scalar is a string).
    docs = parseAllDocuments(m[1], { schema: 'failsafe' });
  } catch {
    return null;
  }
  if (!Array.isArray(docs) || docs.length === 0 || docs.some((d) => d.errors.length > 0)) return null;
  const value = docs[0].toJS({ mapAsMap: true });
  return { value, length: m[0].length };
}

// Handlebars' htmlEscapingFunction.
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '`': '&#x60;', '=': '&#x3D;' };
const escape = (s: string) => s.replace(/[&<>"'`=]/g, (c) => ESC[c]);

/** `-[NSObject HTMLTable]` and its NSArray / NSDictionary overrides. */
export function htmlTable(value: unknown): string {
  if (value === null || value === undefined) return ''; // NSNull
  if (Array.isArray(value)) {
    return `<table><tbody><tr>${value.map((v) => `<td>${htmlTable(v)}</td>`).join('')}</tr></tbody></table>`;
  }
  if (value instanceof Map) {
    const keys = [...value.keys()];
    return (
      `<table><thead><tr>${keys.map((k) => `<th>${htmlTable(k)}</th>`).join('')}</tr></thead>` +
      `<tbody><tr>${keys.map((k) => `<td>${htmlTable(value.get(k))}</td>`).join('')}</tr></tbody></table>`
    );
  }
  return escape(String(value));
}

/** Front-matter `title` (used by the presumed file name, F-31). */
export function frontMatterTitle(value: unknown): string | undefined {
  if (value instanceof Map && typeof value.get('title') === 'string') return value.get('title') as string;
  return undefined;
}
