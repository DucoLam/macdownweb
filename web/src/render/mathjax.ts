/**
 * F-130 / F-131 MathJax (spec §6.9). Loaded lazily (dynamic import) only when
 * P-18 is on. MathJax 3 comes from the local `mathjax-full` package; nothing
 * is fetched from a CDN.
 *
 * MathJax runs in the app window and typesets the preview iframe document
 * (the iframe itself never runs scripts).
 *
 * D-04: the configuration is the original's. MacDown loads MathJax 2.7.3 with
 * `config=TeX-AMS-MML_HTMLorMML` and its `MathJax/init.js` only sets
 * `showProcessingMessages` and `messageStyle`
 * [vendor/macdown/MacDown/Code/Document/MPRenderer.m:26-27;
 * vendor/macdown/MacDown/Resources/MathJax/init.js], so the tex2jax defaults
 * apply: inline `\( … \)` only (no `$`, whatever P-19 says: Hoedown already
 * turned `$…$` into `\(…\)` when P-19 is on), display `$$ … $$` and
 * `\[ … \]`, `processEscapes: false`, and the default skipped tags (script,
 * noscript, style, textarea, pre, code, annotation, annotation-xml). So a
 * `\$` (Hoedown output `$`) and `$x$` inside raw HTML stay literal.
 * Raw `<math>` MathML is typeset too (MML input, as `TeX-AMS-MML_HTMLorMML`).
 * Output is SVG so that no font files are needed.
 */
import { HTMLAdaptor } from 'mathjax-full/js/adaptors/HTMLAdaptor.js';
import { HTMLHandler } from 'mathjax-full/js/handlers/html/HTMLHandler.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { MathML } from 'mathjax-full/js/input/mathml.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

type Win = Window & typeof globalThis;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MathJax's DOM generics do not match lib.dom exactly.
type Handler = HTMLHandler<any, any, any>;
const handlers = new WeakMap<object, Handler>();

function handlerFor(doc: Document): Handler {
  // Use the preview's own window so that `instanceof` checks match its realm;
  // fall back to the app window if the frame's constructors are unavailable.
  const frameWin = doc.defaultView as Win | null;
  const win: Win = frameWin && typeof frameWin.DOMParser === 'function' ? frameWin : (window as Win);
  let h = handlers.get(win);
  if (!h) {
    // The adaptor's window type is the DOM's `Window`; MathJax types it loosely.
    h = new HTMLHandler(new HTMLAdaptor(win as never)) as Handler;
    handlers.set(win, h);
  }
  return h;
}

/** MathJax 2.7 tex2jax defaults (the original's effective configuration). */
export const TEX_CONFIG = {
  inlineMath: [['\\(', '\\)']],
  displayMath: [
    ['$$', '$$'],
    ['\\[', '\\]'],
  ],
  processEscapes: false,
  processEnvironments: true,
} as const;

/** MathJax 2.7 tex2jax default `skipTags`. */
export const SKIP_HTML_TAGS = ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'annotation', 'annotation-xml'];

/** Typesets every math expression in `doc` (synchronous once loaded). */
export function typesetDocument(doc: Document): void {
  const tex = new TeX({
    packages: AllPackages,
    inlineMath: TEX_CONFIG.inlineMath.map((d) => [...d]),
    displayMath: TEX_CONFIG.displayMath.map((d) => [...d]),
    processEscapes: TEX_CONFIG.processEscapes,
    processEnvironments: TEX_CONFIG.processEnvironments,
  });
  const html = handlerFor(doc).create(doc, {
    skipHtmlTags: SKIP_HTML_TAGS,
    InputJax: [tex, new MathML()],
    OutputJax: new SVG({ fontCache: 'local' }),
  });
  html.render();
}
