/**
 * Keyboard shortcuts in spec notation. `cmd` is ⌘ on macOS and Ctrl elsewhere
 * (spec §0). `ctrl` is a literal Control key (only meaningful on macOS, where
 * it is distinct from ⌘).
 */
export interface Shortcut {
  key: string; // KeyboardEvent.key, compared case-insensitively ('0', 'h', 'Enter')
  code?: string; // optional KeyboardEvent.code for keys whose `key` changes with Shift/Opt
  cmd?: boolean;
  shift?: boolean;
  alt?: boolean;
  ctrl?: boolean;
}

export const isMac: boolean =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function matchesShortcut(e: KeyboardEvent, s: Shortcut): boolean {
  const cmdDown = isMac ? e.metaKey : e.ctrlKey;
  const ctrlDown = isMac ? e.ctrlKey : false;
  if (!!s.cmd !== cmdDown) return false;
  if (!!s.shift !== e.shiftKey) return false;
  if (!!s.alt !== e.altKey) return false;
  if (isMac && !!s.ctrl !== ctrlDown) return false;
  if (!isMac && s.ctrl) return false; // Ctrl+Cmd combos have no non-Mac equivalent
  if (s.code && e.code === s.code) return true;
  return e.key.toLowerCase() === s.key.toLowerCase();
}

export function formatShortcut(s: Shortcut): string {
  if (isMac) {
    const key = s.key === 'Enter' ? '↩' : s.key.toUpperCase();
    return `${s.ctrl ? '⌃' : ''}${s.alt ? '⌥' : ''}${s.shift ? '⇧' : ''}${s.cmd ? '⌘' : ''}${key}`;
  }
  const parts: string[] = [];
  if (s.cmd) parts.push('Ctrl');
  if (s.alt) parts.push('Alt');
  if (s.shift) parts.push('Shift');
  parts.push(s.key.toUpperCase());
  return parts.join('+');
}
