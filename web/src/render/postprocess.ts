/**
 * Runs the page scripts of spec §6.10 against the preview document, in the
 * original order, from the app window:
 *   tasklist.js (P-26) → Prism + plugins (P-20) → Mermaid (P-20, P-24)
 *   → Graphviz (P-20, P-25) → MathJax (P-18).
 *
 * The preview iframe is sandboxed without `allow-scripts`, so raw HTML in the
 * user's Markdown can never run JavaScript; only this bundled code touches
 * the page. Every step runs synchronously when its assets are already loaded
 * (no flash on re-render); otherwise the remaining steps run after loading,
 * provided the document is still the current preview.
 */
import type { MacDownPreferences } from '../prefs/defaults';
import { extensionCss, type ScriptId } from './assets';
import { highlightAll, loadPrism, peekPrism } from './prism';
import { applyCachedDiagrams, findDiagrams, renderDiagrams } from './diagrams';

type PostPrefs = Pick<MacDownPreferences, 'htmlMathJaxInlineDollar'>;

type MathJaxModule = typeof import('./mathjax');
let mathjax: MathJaxModule | null = null;
let mathjaxLoading: Promise<MathJaxModule> | null = null;

function loadMathJax(): Promise<MathJaxModule> {
  if (!mathjaxLoading) {
    mathjaxLoading = import('./mathjax').then((m) => (mathjax = m));
    mathjaxLoading.catch(() => (mathjaxLoading = null));
  }
  return mathjaxLoading;
}

/** `Extensions/tasklist.js`: disable the first input of each `.task-list-item`. */
export function disableTaskCheckboxes(doc: Document): void {
  const items = doc.getElementsByClassName('task-list-item');
  for (let i = 0; i < items.length; i++) {
    const input = items[i].getElementsByTagName('input')[0];
    if (input) input.disabled = true;
  }
}

interface Step {
  /** Runs now and returns null, or returns a promise that loads what it needs. */
  run(doc: Document): Promise<void> | null;
}

// `prefs` is kept for API stability; MathJax's delimiters no longer depend on
// P-19 (D-04, see mathjax.ts).
function steps(scripts: ScriptId[], _prefs: PostPrefs): Step[] {
  const out: Step[] = [];
  if (scripts.includes('tasklist')) {
    out.push({ run: (doc) => (disableTaskCheckboxes(doc), null) });
  }
  if (scripts.includes('prism-core')) {
    out.push({
      run: (doc) => {
        const prism = peekPrism(scripts);
        if (prism) {
          highlightAll(prism, doc);
          return null;
        }
        return loadPrism(scripts).then(() => undefined);
      },
    });
  }
  const mermaid = scripts.includes('mermaid');
  const viz = scripts.includes('viz');
  if (mermaid || viz) {
    out.push({
      run: (doc) => {
        const missing = applyCachedDiagrams(findDiagrams(doc, mermaid, viz));
        return missing.length ? renderDiagrams(missing, extensionCss('mermaid.forest.css')) : null;
      },
    });
  }
  if (scripts.includes('mathjax')) {
    out.push({
      run: (doc) => {
        if (mathjax) {
          try {
            mathjax.typesetDocument(doc);
          } catch (e) {
            console.warn('MathJax failed', e);
          }
          return null;
        }
        return loadMathJax().then(() => undefined);
      },
    });
  }
  return out;
}

/**
 * Runs the scripts on `doc`. Returns null when everything ran synchronously,
 * or a promise that settles once the remaining steps ran (or were dropped
 * because `isCurrent()` became false).
 */
export function runPreviewScripts(
  doc: Document,
  scripts: ScriptId[],
  prefs: PostPrefs,
  isCurrent: () => boolean,
): Promise<void> | null {
  const list = steps(scripts, prefs);
  const go = (from: number): Promise<void> | null => {
    for (let i = from; i < list.length; i++) {
      const wait = list[i].run(doc);
      if (wait) {
        return wait.then(
          () => (isCurrent() ? (go(i) ?? undefined) : undefined),
          (e) => {
            console.warn('Preview asset failed to load', e);
            return isCurrent() ? (go(i + 1) ?? undefined) : undefined;
          },
        );
      }
    }
    return null;
  };
  return go(0);
}
