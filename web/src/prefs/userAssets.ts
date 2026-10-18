import { useSyncExternalStore } from 'react';

/**
 * F-138 / F-161 (web): user-imported preview styles (`.css`) and editor
 * themes (`.style`). The original lists the files of
 * `~/Library/Application Support/MacDown/{Styles,Themes}`, where users can add
 * or edit files, and "Reload" re-reads the folder. The web app keeps the
 * imported files in localStorage; a user file with a built-in name replaces
 * the built-in one, as an edited copy in the folder does. "Reload" re-reads
 * the stored files (for example after an import in another tab).
 *
 * Keys: `macdown.userStyles`, `macdown.userThemes` ({ name: file text }).
 */
export const USER_STYLES_KEY = 'macdown.userStyles';
export const USER_THEMES_KEY = 'macdown.userThemes';

type Files = Record<string, string>;

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function read(key: string): Files {
  try {
    const raw = storage()?.getItem(key);
    const v = raw ? (JSON.parse(raw) as unknown) : {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k, t]) => k && typeof t === 'string')) as Files;
  } catch {
    return {};
  }
}

let styles: Files = read(USER_STYLES_KEY);
let themes: Files = read(USER_THEMES_KEY);
let version = 0;
const listeners = new Set<() => void>();
const notify = () => {
  version++;
  listeners.forEach((l) => l());
};

export const userStyle = (name: string): string | undefined => (Object.hasOwn(styles, name) ? styles[name] : undefined);
export const userTheme = (name: string): string | undefined => (Object.hasOwn(themes, name) ? themes[name] : undefined);
export const userStyleNames = () => Object.keys(styles);
export const userThemeNames = () => Object.keys(themes);

function write(key: string, files: Files) {
  try {
    storage()?.setItem(key, JSON.stringify(files));
  } catch {
    /* quota: keep in memory */
  }
}

/** Adds or replaces a user style (`name` without `.css`). */
export function addUserStyle(name: string, css: string): void {
  styles = { ...styles, [name]: css };
  write(USER_STYLES_KEY, styles);
  notify();
}

/** Adds or replaces a user theme (`name` without `.style`). */
export function addUserTheme(name: string, source: string): void {
  themes = { ...themes, [name]: source };
  write(USER_THEMES_KEY, themes);
  notify();
}

/** "Reload" (F-138, §7.2): re-reads the stored files and re-applies styles and themes. */
export function reloadUserAssets(): void {
  styles = read(USER_STYLES_KEY);
  themes = read(USER_THEMES_KEY);
  notify();
}

export function useUserAssetsVersion(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => version,
  );
}
