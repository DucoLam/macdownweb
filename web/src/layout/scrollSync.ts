/**
 * F-11 editor → preview scroll sync, a port of `-[MPDocument
 * updateHeaderLocations]` and `-[MPDocument syncScrollers]`
 * [vendor/macdown/MacDown/Code/Document/MPDocument.m:1717–1835].
 */
import type { EditorView } from '@codemirror/view';

const DASH = /^([-]+)$/;
const HEADER = /^(#+)\s/;
const IMAGE = /^!\[[^\]]*\]\([^)]*\)$/;

/** Selector of the preview reference nodes (same as the original JS). */
export const PREVIEW_ANCHOR_SELECTOR = 'h1, h2, h3, h4, h5, h6, img:only-child';

/**
 * Indices (0-based) of the editor lines that are reference nodes: ATX header
 * lines, setext `---` underlines that follow a non-empty line, and lines that
 * consist of a single image.
 */
export function editorAnchorLines(lines: string[]): number[] {
  const out: number[] = [];
  let previousLineHadContent = false;
  lines.forEach((line, i) => {
    const isDash = DASH.test(line);
    if ((previousLineHadContent && isDash) || IMAGE.test(line) || HEADER.test(line)) out.push(i);
    previousLineHadContent = line.length > 0 && !isDash;
  });
  return out;
}

/** Vertical midpoints (scroll coordinates) of the editor reference lines. */
export function editorAnchorLocations(view: EditorView): number[] {
  const doc = view.state.doc;
  const lines: string[] = [];
  for (let i = 1; i <= doc.lines; i++) lines.push(doc.line(i).text);
  const scroller = view.scrollDOM;
  const maxScroll = Math.ceil(scroller.scrollHeight) - Math.ceil(scroller.clientHeight);
  const offset = view.documentPadding.top;
  const out: number[] = [];
  for (const idx of editorAnchorLines(lines)) {
    const block = view.lineBlockAt(doc.line(idx + 1).from);
    const y = offset + (block.top + block.bottom) / 2;
    if (y <= maxScroll) out.push(y);
  }
  return out;
}

/** Document-relative tops of the preview reference nodes. */
export function previewAnchorLocations(doc: Document): number[] {
  const offset = doc.defaultView?.scrollY ?? 0;
  return Array.from(doc.querySelectorAll(PREVIEW_ANCHOR_SELECTOR)).map((n) => n.getBoundingClientRect().top + offset);
}

export interface SyncInput {
  editorScrollTop: number;
  editorContentHeight: number;
  editorVisibleHeight: number;
  editorLocations: number[];
  previewContentHeight: number;
  previewVisibleHeight: number;
  previewLocations: number[];
}

/** Returns the preview scrollTop that matches the editor position. */
export function computePreviewScrollTop(i: SyncInput): number {
  const editorContentHeight = Math.ceil(i.editorContentHeight);
  const editorVisibleHeight = Math.ceil(i.editorVisibleHeight);
  const previewContentHeight = Math.ceil(i.previewContentHeight);
  const previewVisibleHeight = Math.ceil(i.previewVisibleHeight);
  let relativeHeaderIndex = -1; // -1 = start of document, before any header
  let currY = i.editorScrollTop;
  let minY = 0;
  let maxY = 0;

  // Align at the middle of the screen, except at the top/bottom of the document.
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const topTaper = clamp01(currY / editorVisibleHeight);
  const bottomTaper = 1 - clamp01((currY - editorContentHeight + 2 * editorVisibleHeight) / editorVisibleHeight);
  const adjustmentForScroll = (topTaper * bottomTaper * editorVisibleHeight) / 2;

  for (const loc of i.editorLocations) {
    const headerY = loc - adjustmentForScroll;
    if (headerY < currY) {
      relativeHeaderIndex += 1;
      minY = headerY;
    } else if (maxY === 0 && headerY < editorContentHeight - editorVisibleHeight) {
      maxY = headerY;
    }
  }

  let interpolateToEndOfDocument = false;
  if (maxY === 0) {
    maxY = editorContentHeight - editorVisibleHeight + adjustmentForScroll;
    interpolateToEndOfDocument = true;
  }

  currY = Math.max(0, currY - minY);
  maxY -= minY;
  const percent = maxY > 0 ? clamp01(currY / maxY) : currY > 0 ? 1 : 0;

  let topHeaderY = 0;
  let bottomHeaderY = previewContentHeight - previewVisibleHeight;
  const locs = i.previewLocations;
  if (relativeHeaderIndex >= 0 && relativeHeaderIndex < locs.length) {
    topHeaderY = Math.floor(locs[relativeHeaderIndex]) - adjustmentForScroll;
  }
  if (!interpolateToEndOfDocument && relativeHeaderIndex + 1 < locs.length) {
    bottomHeaderY = Math.ceil(locs[relativeHeaderIndex + 1]) - adjustmentForScroll;
  }
  return topHeaderY + (bottomHeaderY - topHeaderY) * percent;
}

/** Scrolls the preview document to follow the editor. */
export function syncScroll(view: EditorView, previewDoc: Document): void {
  const win = previewDoc.defaultView;
  if (!win) return;
  const scroller = view.scrollDOM;
  const root = previewDoc.scrollingElement ?? previewDoc.documentElement;
  const y = computePreviewScrollTop({
    editorScrollTop: scroller.scrollTop,
    editorContentHeight: scroller.scrollHeight,
    editorVisibleHeight: scroller.clientHeight,
    editorLocations: editorAnchorLocations(view),
    previewContentHeight: root.scrollHeight,
    previewVisibleHeight: win.innerHeight,
    previewLocations: previewAnchorLocations(previewDoc),
  });
  win.scrollTo(0, y);
}
