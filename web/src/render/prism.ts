/**
 * F-124 to F-127 Prism highlighting in the preview, using the Prism 1.4.1
 * files bundled with MacDown (core, components, line-numbers and
 * show-language plugins).
 *
 * The original page loads `prism-core.min.js`, the components for the
 * languages used in the document and the plugins as `<script>` tags, and
 * Prism highlights on DOMContentLoaded [MPRenderer.m:395-420]. The preview
 * iframe here does not run scripts, so the app builds a Prism instance from
 * the same files in its own window, one instance per distinct script list
 * (so a document only gets the grammars the original would load for it), and
 * runs Prism's `highlightAll` loop over the preview document.
 */
import { loadAssetText, scriptPath, type ScriptId } from './assets';

interface PrismLike {
  highlightElement(el: Element, async?: boolean): void;
  languages: Record<string, unknown>;
}

type Scope = Record<string, unknown>;

function run(code: string, scope: Scope, returnExpr = ''): unknown {
  const names = Object.keys(scope);
  const fn = new Function(...names, `${code}\n;${returnExpr ? `return ${returnExpr};` : ''}`);
  return fn(...names.map((n) => scope[n]));
}

/** The DOM document Prism's core sees: it must not hook the app page. */
const inertDocument = {
  currentScript: null,
  getElementsByTagName: () => [],
  addEventListener: () => undefined,
  querySelectorAll: () => [],
};

function buildInstance(ids: ScriptId[], sources: Map<ScriptId, string>): PrismLike {
  const fakeWindow: Scope = { document: inertDocument };
  const prism = run(
    sources.get('prism-core')!,
    { window: fakeWindow, self: fakeWindow, document: inertDocument, global: undefined, module: undefined, WorkerGlobalScope: undefined },
    'Prism',
  ) as PrismLike;
  // Plugins check `self.Prism` and `self.document`, and create nodes with `document`.
  const pluginSelf: Scope = { Prism: prism, document };
  for (const id of ids) {
    if (id === 'prism-core') continue;
    try {
      if (id.startsWith('prism-language:')) run(sources.get(id)!, { Prism: prism });
      else run(sources.get(id)!, { Prism: prism, self: pluginSelf, document });
    } catch (e) {
      // A failing <script> does not stop the others.
      console.warn(`Prism asset ${id} failed`, e);
    }
  }
  return prism;
}

const instances = new Map<string, PrismLike>();
const pending = new Map<string, Promise<PrismLike>>();

const prismIds = (scripts: ScriptId[]) => scripts.filter((s) => s.startsWith('prism-'));

/** The ready Prism instance for this script list, or null if it still has to load. */
export function peekPrism(scripts: ScriptId[]): PrismLike | null {
  return instances.get(prismIds(scripts).join(' ')) ?? null;
}

export function loadPrism(scripts: ScriptId[]): Promise<PrismLike> {
  const ids = prismIds(scripts);
  const key = ids.join(' ');
  const ready = instances.get(key);
  if (ready) return Promise.resolve(ready);
  let p = pending.get(key);
  if (!p) {
    p = Promise.all(ids.map(async (id) => [id, await loadAssetText(scriptPath(id)!)] as const)).then((pairs) => {
      const inst = buildInstance(ids, new Map(pairs));
      instances.set(key, inst);
      pending.delete(key);
      return inst;
    });
    p.catch(() => pending.delete(key));
    pending.set(key, p);
  }
  return p;
}

/** `Prism.highlightAll()` against the preview document (synchronous). */
export function highlightAll(prism: PrismLike, doc: Document): void {
  const selector = 'code[class*="language-"], [class*="language-"] code, code[class*="lang-"], [class*="lang-"] code';
  doc.querySelectorAll(selector).forEach((el) => prism.highlightElement(el, false));
}
