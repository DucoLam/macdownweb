/** Keyboard focus movement inside a menu (D-02). Disabled items are skipped. */
export function focusMenuItem(menu: HTMLElement, where: 'first' | 'last' | 'next' | 'previous'): void {
  const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled)'));
  if (!items.length) return;
  const current = items.indexOf(document.activeElement as HTMLButtonElement);
  let i: number;
  switch (where) {
    case 'first':
      i = 0;
      break;
    case 'last':
      i = items.length - 1;
      break;
    case 'next':
      i = current < 0 ? 0 : (current + 1) % items.length;
      break;
    default:
      i = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
  }
  items[i].focus();
}
