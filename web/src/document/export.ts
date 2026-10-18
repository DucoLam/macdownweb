/**
 * F-35 Export HTML, a port of `-[MPRenderer HTMLForExportWithStyles:highlighting:]`
 * [MPRenderer.m:660-702] with the asset rules of spec §9 (E-01 to E-04, U-11):
 * - Include styles (E-01): the base style (§7.1) embedded. `show-information.css`
 *   is never exported.
 * - Include syntax highlighting (E-02): the Prism theme, line-numbers CSS
 *   (P-22) and show-language CSS (P-23 = 1), the Prism core, the used
 *   languages and plugins, and, only with this box, Mermaid (P-24: CSS + JS)
 *   and Graphviz (P-25: JS). Works even when P-20 is off. Prism CSS is
 *   embedded even without "Include styles".
 * - MathJax (E-03, P-18): the config embedded as `text/x-mathjax-config`, and
 *   MathJax 2.7.3 linked from the CDN (a non-file URL is never embedded).
 * - `tasklist.js` is not exported.
 * Embedded assets lose one trailing newline [MPAsset.m:78-89].
 */
import type { MacDownPreferences } from '../prefs/defaults';
import { parseMarkdown } from '../render/markdown';
import { getStyleCss } from '../render/styles';
import { extensionCss, loadAssetText, prismFilesForLanguage, prismThemeFile } from '../render/assets';
import { linkScriptTag, renderTemplate } from '../render/template';

const prismThemes = import.meta.glob('../render/assets/prism-themes/*.css', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const THEME_CSS = Object.fromEntries(Object.entries(prismThemes).map(([p, css]) => [p.replace(/^.*\//, ''), css]));

/** `kMPMathJaxCDN` [MPRenderer.m:26-28]. */
export const MATHJAX_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.3/MathJax.js?config=TeX-AMS-MML_HTMLorMML';

export interface ExportOptions {
  /** "Include styles" (default: `htmlStyleName` is set, F-35). */
  styles: boolean;
  /** "Include syntax highlighting" (default: P-20). */
  highlighting: boolean;
  /** Document file name without extension; empty for an unsaved document (E-04). */
  title: string;
}

export type ExportAsset =
  | { kind: 'style'; id: string; css: string }
  | { kind: 'script'; id: string; path: string; type?: string }
  | { kind: 'script-link'; id: string; url: string };

/** Export dialog defaults [MPDocument.m:1255-1258]. */
export function exportDefaults(prefs: Pick<MacDownPreferences, 'htmlStyleName' | 'htmlSyntaxHighlighting'>): { styles: boolean; highlighting: boolean } {
  return { styles: !!prefs.htmlStyleName, highlighting: prefs.htmlSyntaxHighlighting };
}

/** The assets of an export, in order (styles first, then scripts). */
export function exportAssets(prefs: MacDownPreferences, languages: string[], o: Pick<ExportOptions, 'styles' | 'highlighting'>): ExportAsset[] {
  const out: ExportAsset[] = [];
  if (o.styles) {
    const css = getStyleCss(prefs.htmlStyleName);
    if (prefs.htmlStyleName && css !== undefined) out.push({ kind: 'style', id: `style:${prefs.htmlStyleName}`, css });
  }
  const scripts: ExportAsset[] = [];
  if (o.highlighting) {
    const theme = prismThemeFile(prefs.htmlHighlightingThemeName);
    out.push({ kind: 'style', id: `prism-theme:${theme}`, css: THEME_CSS[theme] ?? '' });
    if (prefs.htmlLineNumbers) out.push({ kind: 'style', id: 'prism-plugin:line-numbers', css: extensionCss('prism-line-numbers.css') });
    if (prefs.htmlCodeBlockAccessory === 1) out.push({ kind: 'style', id: 'prism-plugin:show-language', css: extensionCss('prism-show-language.css') });
    scripts.push({ kind: 'script', id: 'prism-core', path: 'prism/components/prism-core.min.js' });
    for (const lang of languages)
      for (const f of prismFilesForLanguage(lang)) scripts.push({ kind: 'script', id: `prism-language:${f}`, path: `prism/components/prism-${f}.min.js` });
    if (prefs.htmlLineNumbers) scripts.push({ kind: 'script', id: 'prism-plugin:line-numbers', path: 'prism/plugins/line-numbers/prism-line-numbers.min.js' });
    if (prefs.htmlCodeBlockAccessory === 1)
      scripts.push({ kind: 'script', id: 'prism-plugin:show-language', path: 'prism/plugins/show-language/prism-show-language.min.js' });
    if (prefs.htmlMermaid) {
      out.push({ kind: 'style', id: 'mermaid', css: extensionCss('mermaid.forest.css') });
      scripts.push({ kind: 'script', id: 'mermaid', path: 'extensions/mermaid.min.js' }, { kind: 'script', id: 'mermaid-init', path: 'extensions/mermaid.init.js' });
    }
    if (prefs.htmlGraphviz)
      scripts.push({ kind: 'script', id: 'viz', path: 'extensions/viz.js' }, { kind: 'script', id: 'viz-init', path: 'extensions/viz.init.js' });
  }
  if (prefs.htmlMathJax) {
    scripts.push({ kind: 'script', id: 'mathjax-config', path: 'mathjax/init.js', type: 'text/x-mathjax-config' });
    scripts.push({ kind: 'script-link', id: 'mathjax', url: MATHJAX_CDN });
  }
  return [...out, ...scripts];
}

const dropOneNewline = (s: string) => (s.endsWith('\n') ? s.slice(0, -1) : s);

/** `<style type="text/css">\nCONTENT\n</style>` with one trailing newline removed. */
export const embeddedStyle = (css: string) => `<style type="text/css">\n${dropOneNewline(css)}\n</style>`;
export const embeddedScript = (js: string, type = 'text/javascript') => `<script type="${type}">\n${dropOneNewline(js)}\n</script>`;

export type AssetLoader = (path: string) => Promise<string>;

/** The exported HTML page (UTF-8 text). */
export async function buildExportHtml(markdown: string, prefs: MacDownPreferences, o: ExportOptions, load: AssetLoader = loadAssetText): Promise<string> {
  const parsed = parseMarkdown(markdown, prefs);
  const assets = exportAssets(prefs, parsed.languages, o);
  const styleTags: string[] = [];
  const scriptTags: string[] = [];
  for (const a of assets) {
    if (a.kind === 'style') styleTags.push(embeddedStyle(a.css));
    else if (a.kind === 'script') scriptTags.push(embeddedScript(await load(a.path), a.type));
    else scriptTags.push(linkScriptTag(a.url));
  }
  return renderTemplate({ title: o.title, styleTags, body: parsed.body, scriptTags });
}
