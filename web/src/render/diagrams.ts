/**
 * F-128 Mermaid (P-24) and F-129 Graphviz (P-25), using the bundled
 * `mermaid.min.js` / `mermaid.init.js` and `viz.js` / `viz.init.js`.
 *
 * Diagram sources are user input and these libraries build markup from them,
 * so they never run in the app window. They run in a hidden "runner" iframe
 * with `sandbox="allow-scripts"` and no `allow-same-origin` (an opaque
 * origin that cannot reach the app). The runner returns SVG text by
 * postMessage, and the app inserts it into the preview document, which does
 * not run scripts. Results are cached by source, so unchanged diagrams are
 * re-inserted synchronously on every re-render.
 */
import { loadAssetText } from './assets';

type Kind = 'mermaid' | 'viz';

interface Reply {
  id: number;
  ok: boolean;
  svg?: string;
  error?: string;
}

const RUNNER_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style id="css"></style></head><body><script>
window.addEventListener('message', function (e) {
  var m = e.data;
  if (!m || typeof m !== 'object' || e.source !== parent) return;
  function reply(r) { r.id = m.id; parent.postMessage(r, '*'); }
  try {
    if (m.type === 'load') { (0, eval)(m.code); reply({ ok: true }); }
    else if (m.type === 'css') { document.getElementById('css').textContent = m.css; reply({ ok: true }); }
    else if (m.type === 'mermaid') {
      var done = false;
      mermaidAPI.render('graphDiv' + m.index, m.source, function (svg) { done = true; reply({ ok: true, svg: svg }); });
      if (!done) reply({ ok: false, error: 'no output' });
    }
    else if (m.type === 'viz') { reply({ ok: true, svg: Viz(m.source, { engine: m.engine }) }); }
  } catch (err) { reply({ ok: false, error: String(err && err.message || err) }); }
});
parent.postMessage({ ready: true }, '*');
</script></body></html>`;

let frame: HTMLIFrameElement | null = null;
let ready: Promise<void> | null = null;
let nextId = 1;
const waiting = new Map<number, (r: Reply) => void>();
const libraries = new Map<Kind, Promise<void>>();

function runner(): Promise<void> {
  if (ready) return ready;
  ready = new Promise<void>((resolve) => {
    frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.setAttribute('title', 'Diagram renderer');
    frame.dataset.testid = 'diagram-runner';
    // Laid out (Mermaid measures text) but invisible and off-screen.
    frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:1200px;height:900px;border:0;visibility:hidden;';
    window.addEventListener('message', (e) => {
      if (!frame || e.source !== frame.contentWindow) return;
      const data = e.data as Partial<Reply> & { ready?: boolean };
      if (data.ready) return resolve();
      const cb = typeof data.id === 'number' ? waiting.get(data.id) : undefined;
      if (cb) {
        waiting.delete(data.id!);
        cb(data as Reply);
      }
    });
    frame.srcdoc = RUNNER_HTML;
    document.body.appendChild(frame);
  });
  return ready;
}

async function send(msg: Record<string, unknown>): Promise<Reply> {
  await runner();
  const id = nextId++;
  return new Promise<Reply>((resolve) => {
    waiting.set(id, resolve);
    frame!.contentWindow!.postMessage({ ...msg, id }, '*');
  });
}

async function loadInto(path: string): Promise<void> {
  const r = await send({ type: 'load', code: await loadAssetText(path) });
  if (!r.ok) throw new Error(r.error);
}

function library(kind: Kind, mermaidCss: string): Promise<void> {
  let p = libraries.get(kind);
  if (!p) {
    p =
      kind === 'mermaid'
        ? (async () => {
            await send({ type: 'css', css: mermaidCss });
            await loadInto('extensions/mermaid.min.js');
            // mermaid.init.js calls mermaid.initialize({startOnLoad:false,
            // flowchart:{htmlLabels:false,useMaxWidth:true}}); its window
            // "load" handler never fires in the runner, the app drives it.
            await loadInto('extensions/mermaid.init.js');
          })()
        : loadInto('extensions/viz.js');
    p.catch(() => libraries.delete(kind));
    libraries.set(kind, p);
  }
  return p;
}

/** `null` = failed (the block stays as code, like the original's console.error). */
const results = new Map<string, string | null>();
const inflight = new Map<string, Promise<void>>();

export interface DiagramJob {
  kind: Kind;
  engine: string;
  source: string;
  /** The element whose content the SVG replaces (the code block's `<div>`). */
  target: Element;
  index: number;
}

const key = (j: Pick<DiagramJob, 'kind' | 'engine' | 'source'>) => `${j.kind}\u0000${j.engine}\u0000${j.source}`;

const GRAPHVIZ_ENGINES = ['circo', 'dot', 'fdp', 'neato', 'osage', 'twopi'];

/**
 * Finds the blocks the original init scripts would replace:
 * - mermaid.init.js: every `.language-mermaid` → its `<div>` (pre's parent);
 * - viz.init.js: `code.language-<engine>` → `parentElement.parentElement`.
 */
export function findDiagrams(doc: Document, mermaid: boolean, graphviz: boolean): DiagramJob[] {
  const jobs: DiagramJob[] = [];
  const seen = new Set<Element>();
  if (mermaid) {
    doc.querySelectorAll('.language-mermaid').forEach((el, i) => {
      let target: Element | null = el.parentElement;
      if (target && target.tagName === 'PRE') target = target.parentElement;
      if (!target || seen.has(target)) return;
      seen.add(target);
      jobs.push({ kind: 'mermaid', engine: 'mermaid', source: (el as HTMLElement).innerText || el.textContent || '', target, index: i });
    });
  }
  if (graphviz) {
    for (const engine of GRAPHVIZ_ENGINES) {
      doc.querySelectorAll(`code.language-${engine}`).forEach((el, i) => {
        const target = el.parentElement?.parentElement;
        if (!target || seen.has(target)) return;
        seen.add(target);
        jobs.push({ kind: 'viz', engine, source: (el as HTMLElement).innerText || el.textContent || '', target, index: i });
      });
    }
  }
  return jobs;
}

/** Inserts every diagram whose SVG is cached; returns the jobs still missing. */
export function applyCachedDiagrams(jobs: DiagramJob[]): DiagramJob[] {
  const missing: DiagramJob[] = [];
  for (const j of jobs) {
    const k = key(j);
    if (!results.has(k)) {
      missing.push(j);
      continue;
    }
    const svg = results.get(k);
    if (svg != null) j.target.innerHTML = svg;
  }
  return missing;
}

/** Renders the missing diagrams in the runner and caches the SVG. */
export async function renderDiagrams(jobs: DiagramJob[], mermaidCss: string): Promise<void> {
  await Promise.all(
    jobs.map((j) => {
      const k = key(j);
      let p = inflight.get(k);
      if (!p) {
        p = (async () => {
          try {
            await library(j.kind, mermaidCss);
            const r = await send(
              j.kind === 'mermaid'
                ? { type: 'mermaid', source: j.source, index: j.index }
                : { type: 'viz', source: j.source, engine: j.engine },
            );
            results.set(k, r.ok && r.svg ? r.svg : null);
            if (!r.ok) console.error('Error when rendering diagram:', r.error);
          } catch (e) {
            results.set(k, null);
            console.error('Error when loading diagram library:', e);
          } finally {
            inflight.delete(k);
          }
        })();
        inflight.set(k, p);
      }
      return p;
    }),
  );
}
