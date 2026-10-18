/**
 * Preview styles (spec §7.1, F-136), copied from MacDown.app
 * `Contents/Resources/Styles` (MIT).
 *
 * `GitHub-2017.css` is 0 bytes in the 0.7.3 bundle and absent from the source
 * repository, so it is hidden (decision on U-07 in docs/status.md).
 */
import { userStyle, userStyleNames } from '../prefs/userAssets';

const modules = import.meta.glob('./styles/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const STYLES: Record<string, string> = {};
for (const [path, css] of Object.entries(modules)) {
  const name = path.replace(/^.*\//, '').replace(/\.css$/, '');
  STYLES[name] = css;
}

/** Style names, sorted by name as in the original popup. */
export const STYLE_NAMES: string[] = Object.keys(STYLES).sort((a, b) => a.localeCompare(b));

/** Built-in plus user-imported style names (F-138), sorted. */
export function styleNames(): string[] {
  return [...new Set([...STYLE_NAMES, ...userStyleNames()])].sort((a, b) => a.localeCompare(b));
}

/** CSS text for a style name (a user-imported file first, F-138), or undefined when it does not exist. */
export function getStyleCss(name: string): string | undefined {
  return userStyle(name) ?? STYLES[name];
}
