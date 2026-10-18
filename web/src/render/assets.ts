/**
 * Preview assets and their inclusion order (spec §6.10, §7.3), copied from
 * MacDown.app `Contents/Resources` (MIT):
 * - Prism themes and plugin CSS, `show-information.css` and
 *   `mermaid.forest.css` are small and inlined into the page as `<style>`.
 * - Scripts (Prism core/components/plugins, Mermaid, Viz.js, tasklist.js)
 *   are served from `public/macdown/` and run by the app in the parent
 *   window against the preview document (see postprocess.ts). They are never
 *   loaded inside the sandboxed preview.
 */
import type { MacDownPreferences } from '../prefs/defaults';

const themeModules = import.meta.glob('./assets/prism-themes/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const extensionModules = import.meta.glob('./assets/extensions/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const byFile = (mods: Record<string, string>) =>
  Object.fromEntries(Object.entries(mods).map(([p, css]) => [p.replace(/^.*\//, ''), css]));

const THEMES = byFile(themeModules);
const EXTENSION_CSS = byFile(extensionModules);

/** P-21 pop-up titles: file names without `prism-`/`.css`, capitalised; '' = (Default). */
export const PRISM_THEME_NAMES: string[] = [
  '',
  ...Object.keys(THEMES)
    .filter((f) => f !== 'prism.css')
    .map((f) => f.replace(/^prism-/, '').replace(/\.css$/, ''))
    .sort()
    .map((n) => n.charAt(0).toUpperCase() + n.slice(1)),
];

/**
 * `MPHighlightingThemeURLForName` [MPUtilities.m:128-145]:
 * `prism-<lower-cased name>.css`, falling back to `prism.css`.
 */
export function prismThemeFile(name: string): string {
  let file = `prism-${(name ?? '').toLowerCase()}`;
  if (file.endsWith('.css')) file = file.slice(0, -4);
  file += '.css';
  return THEMES[file] !== undefined ? file : 'prism.css';
}

export interface StyleAsset {
  /** Asset id, e.g. `style:GitHub2`, `prism-theme:prism-okaidia.css`. */
  id: string;
  css: string;
}

export type ScriptId =
  | 'tasklist'
  | 'prism-core'
  | `prism-language:${string}`
  | 'prism-plugin:line-numbers'
  | 'prism-plugin:show-language'
  | 'mermaid'
  | 'mermaid-init'
  | 'viz'
  | 'viz-init'
  | 'mathjax-config'
  | 'mathjax';

type AssetPrefs = Pick<
  MacDownPreferences,
  | 'htmlSyntaxHighlighting'
  | 'htmlHighlightingThemeName'
  | 'htmlLineNumbers'
  | 'htmlCodeBlockAccessory'
  | 'htmlMermaid'
  | 'htmlGraphviz'
  | 'htmlMathJax'
  | 'htmlTaskList'
>;

/**
 * Style sheets after the base style, in §6.10 order [MPRenderer.m:423-453]:
 * Prism theme, line-numbers CSS (P-22), show-language CSS (P-23 = 1) — all
 * only with P-20 — then Mermaid CSS (P-20 and P-24), then
 * `show-information.css` (P-23 = 2, regardless of P-20).
 */
export function extraStyles(prefs: AssetPrefs): StyleAsset[] {
  const out: StyleAsset[] = [];
  if (prefs.htmlSyntaxHighlighting) {
    const theme = prismThemeFile(prefs.htmlHighlightingThemeName);
    out.push({ id: `prism-theme:${theme}`, css: THEMES[theme] });
    if (prefs.htmlLineNumbers) out.push({ id: 'prism-plugin:line-numbers', css: EXTENSION_CSS['prism-line-numbers.css'] });
    if (prefs.htmlCodeBlockAccessory === 1)
      out.push({ id: 'prism-plugin:show-language', css: EXTENSION_CSS['prism-show-language.css'] });
    if (prefs.htmlMermaid) out.push({ id: 'mermaid', css: EXTENSION_CSS['mermaid.forest.css'] });
  }
  if (prefs.htmlCodeBlockAccessory === 2) out.push({ id: 'show-information', css: EXTENSION_CSS['show-information.css'] });
  return out;
}

/**
 * Scripts in §6.10 order [MPRenderer.m:455-480]: tasklist.js (P-26), Prism
 * core + languages (+ `-extras`) + plugins (P-20), Mermaid (P-20 and P-24),
 * Graphviz (P-20 and P-25), MathJax config + MathJax (P-18).
 * `languages` is the parse's `currentLanguages` (dependencies first).
 */
export function scriptIds(prefs: AssetPrefs, languages: string[]): ScriptId[] {
  const out: ScriptId[] = [];
  if (prefs.htmlTaskList) out.push('tasklist');
  if (prefs.htmlSyntaxHighlighting) {
    out.push('prism-core');
    for (const lang of languages) for (const file of prismFilesForLanguage(lang)) out.push(`prism-language:${file}`);
    if (prefs.htmlLineNumbers) out.push('prism-plugin:line-numbers');
    if (prefs.htmlCodeBlockAccessory === 1) out.push('prism-plugin:show-language');
    if (prefs.htmlMermaid) out.push('mermaid', 'mermaid-init');
    if (prefs.htmlGraphviz) out.push('viz', 'viz-init');
  }
  if (prefs.htmlMathJax) out.push('mathjax-config', 'mathjax');
  return out;
}

/**
 * Bundled Prism component files (`public/macdown/prism/components/prism-<id>.min.js`,
 * spec §6.4 "Bundled Prism languages"). A unit test checks this list against
 * the directory.
 */
export const PRISM_COMPONENT_FILES: ReadonlySet<string> = new Set(
  (
    'abap actionscript apacheconf apl applescript asciidoc aspnet autohotkey autoit bash basic batch bison ' +
    'brainfuck c clike coffeescript cpp crystal csharp css-extras css d dart diff docker eiffel elixir erlang ' +
    'fortran fsharp gherkin git glsl go groovy haml handlebars haskell haxe http icon inform7 ini j jade java ' +
    'javascript json jsx julia keyman kotlin latex less lolcode lua makefile markdown markup matlab mel mizar ' +
    'monkey nasm nginx nim nix nsis objectivec ocaml oz parigp parser pascal perl php-extras php powershell ' +
    'processing prolog puppet pure python q qore r rest rip roboconf ruby rust sas sass scala scheme scss ' +
    'smalltalk smarty sql stylus swift tcl textile twig typescript verilog vhdl vim wiki yaml'
  ).split(' '),
);

/**
 * `MPPrismScriptURLsForLanguage` [MPRenderer.m:62-94]: `prism-<lower>` and
 * `prism-<lower>-extras`, when the files exist.
 */
export function prismFilesForLanguage(language: string): string[] {
  const lang = language.toLowerCase();
  return [lang, `${lang}-extras`].filter((f) => PRISM_COMPONENT_FILES.has(f));
}

/** URL of a bundled asset under public/macdown/. */
export function assetUrl(path: string): string {
  const base = typeof import.meta.env !== 'undefined' ? (import.meta.env.BASE_URL ?? '/') : '/';
  return `${base}macdown/${path}`;
}

/** Path (relative to public/macdown/) of each script asset. */
export function scriptPath(id: ScriptId): string | null {
  if (id === 'tasklist') return 'extensions/tasklist.js';
  if (id === 'prism-core') return 'prism/components/prism-core.min.js';
  if (id.startsWith('prism-language:')) return `prism/components/prism-${id.slice(15)}.min.js`;
  if (id === 'prism-plugin:line-numbers') return 'prism/plugins/line-numbers/prism-line-numbers.min.js';
  if (id === 'prism-plugin:show-language') return 'prism/plugins/show-language/prism-show-language.min.js';
  if (id === 'mermaid') return 'extensions/mermaid.min.js';
  if (id === 'mermaid-init') return 'extensions/mermaid.init.js';
  if (id === 'viz') return 'extensions/viz.js';
  if (id === 'viz-init') return 'extensions/viz.init.js';
  if (id === 'mathjax-config') return 'mathjax/init.js';
  return null; // MathJax itself is the bundled mathjax-full package (mathjax.ts).
}

type Loader = (path: string) => Promise<string>;

let loader: Loader = async (path) => {
  const res = await fetch(assetUrl(path));
  if (!res.ok) throw new Error(`Cannot load ${path}: ${res.status}`);
  return res.text();
};
const textCache = new Map<string, Promise<string>>();

/** Loads the text of an asset under public/macdown/ (cached). */
export function loadAssetText(path: string): Promise<string> {
  let p = textCache.get(path);
  if (!p) {
    p = loader(path);
    textCache.set(path, p);
    p.catch(() => textCache.delete(path));
  }
  return p;
}

/** Tests: replace the network loader (for example with a file-system reader). */
export function setAssetLoader(fn: Loader): void {
  loader = fn;
  textCache.clear();
}

/** Inlined CSS of `Extensions/` and the Prism plugins, by file name. */
export function extensionCss(file: string): string {
  return EXTENSION_CSS[file] ?? '';
}
