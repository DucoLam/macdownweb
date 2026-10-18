/**
 * F-29 autosave (web: a draft in localStorage) and the launch state of
 * F-32 / U-12 and F-155. Keys:
 * - `macdown.draft`: the current document (kind, name, saved text, text).
 * - `macdown.firstVersionInstalled`: set on the first visit (F-155, the
 *   original's `firstVersionInstalled` default).
 * - `macdown.splitRatios`: split ratio per named document (F-16).
 */
import type { DocumentInfo } from './document';

export const DRAFT_KEY = 'macdown.draft';
export const FIRST_VERSION_KEY = 'macdown.firstVersionInstalled';
export const SPLIT_RATIOS_KEY = 'macdown.splitRatios';
export const APP_VERSION = '0.7.3';
export const APP_BUILD = '1008.4';

export interface Draft {
  version: 1;
  kind: 'untitled' | 'file';
  name: string | null;
  savedText: string | null;
  text: string;
}

export function browserStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Reads the draft; anything malformed counts as no draft. */
export function loadDraft(storage: Storage | null = browserStorage()): Draft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft>;
    if (d?.version !== 1 || typeof d.text !== 'string') return null;
    if (d.kind !== 'untitled' && d.kind !== 'file') return null;
    const name = typeof d.name === 'string' && d.name ? d.name : null;
    const savedText = typeof d.savedText === 'string' ? d.savedText : null;
    if (d.kind === 'file' && !name) return null;
    return { version: 1, kind: d.kind, name: d.kind === 'file' ? name : null, savedText: d.kind === 'file' ? savedText : null, text: d.text };
  } catch {
    return null;
  }
}

export function saveDraft(info: DocumentInfo, text: string, storage: Storage | null = browserStorage()): void {
  if (!storage || info.kind === 'help') return; // F-153: help copies never replace the draft
  const d: Draft = { version: 1, kind: info.kind, name: info.name, savedText: info.savedText, text };
  try {
    storage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    // D-18: quota exceeded (or privacy mode). An older draft must not stay
    // behind to be restored later in place of the newer text.
    try {
      storage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function clearDraft(storage: Storage | null = browserStorage()): void {
  try {
    storage?.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function draftToInfo(d: Draft): DocumentInfo {
  return { kind: d.kind, name: d.name, savedText: d.savedText };
}

/**
 * F-155: true on the first visit (no `firstVersionInstalled`); records the
 * version so later visits are not "fresh installs".
 */
export function detectFreshInstall(storage: Storage | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    if (storage.getItem(FIRST_VERSION_KEY)) return false;
    storage.setItem(FIRST_VERSION_KEY, APP_VERSION);
    return true;
  } catch {
    return false;
  }
}

/** F-16: split ratio remembered per named document (`NSSplitView Subview Frames <url>`). */
export function loadSplitRatio(name: string, storage: Storage | null = browserStorage()): number | null {
  try {
    const all = JSON.parse(storage?.getItem(SPLIT_RATIOS_KEY) ?? '{}') as Record<string, unknown>;
    const r = all[name];
    return typeof r === 'number' && r >= 0 && r <= 1 ? r : null;
  } catch {
    return null;
  }
}

export function saveSplitRatio(name: string, ratio: number, storage: Storage | null = browserStorage()): void {
  if (!storage) return;
  try {
    const all = JSON.parse(storage.getItem(SPLIT_RATIOS_KEY) ?? '{}') as Record<string, number>;
    all[name] = ratio;
    storage.setItem(SPLIT_RATIOS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}
