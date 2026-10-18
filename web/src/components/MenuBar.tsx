import { useEffect, useRef, useState } from 'react';
import { formatShortcut, type Shortcut } from './shortcuts';
import { focusMenuItem } from './menuKeys';

export interface MenuItem {
  id: string;
  label: string;
  shortcut?: Shortcut;
  action?: () => void;
  /** Not yet implemented, or not applicable: shown greyed out. */
  disabled?: boolean;
  hidden?: boolean;
  separatorBefore?: boolean;
  /** Checkable item (role menuitemcheckbox), e.g. Check Spelling While Typing. */
  checked?: boolean;
  /** The shortcut is shown but reserved by the browser, so only the menu runs the command (Cmd+N, Cmd+W). */
  menuOnly?: boolean;
}

export interface Menu {
  id: string;
  label: string;
  items: MenuItem[];
}

/**
 * In-app menu bar. Browsers reserve Cmd/Ctrl+N, W, T (spec §3 web note), so
 * every command is reachable from here. Later milestones add items.
 *
 * Keyboard (D-02), like a native menu: Enter, Space or Down on a title opens
 * its menu and focuses the first enabled item; Up/Down move between items,
 * Home/End jump to the first/last; Left/Right move to the neighbouring menu;
 * Escape closes the menu and returns to its title.
 */
export function MenuBar({ menus }: { menus: Menu[] }) {
  const [open, setOpen] = useState<string | null>(null);
  /** Which item to focus after opening from the keyboard. */
  const [focusOnOpen, setFocusOnOpen] = useState<'first' | 'last' | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const titles = useRef(new Map<string, HTMLButtonElement>());
  const dropdown = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    const blur = () => setOpen(null);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('blur', blur);
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !focusOnOpen || !dropdown.current) return;
    focusMenuItem(dropdown.current, focusOnOpen);
    setFocusOnOpen(null);
  }, [open, focusOnOpen]);

  const openFromKeyboard = (id: string, where: 'first' | 'last' = 'first') => {
    setOpen(id);
    setFocusOnOpen(where);
  };

  const neighbour = (id: string, delta: number) => {
    const i = menus.findIndex((m) => m.id === id);
    return menus[(i + delta + menus.length) % menus.length].id;
  };

  const onTitleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openFromKeyboard(id, e.key === 'ArrowUp' ? 'last' : 'first');
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = neighbour(id, e.key === 'ArrowRight' ? 1 : -1);
      titles.current.get(next)?.focus();
      if (open) openFromKeyboard(next);
    }
  };

  const onMenuKeyDown = (e: React.KeyboardEvent, id: string) => {
    const box = dropdown.current;
    if (!box) return;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End':
        e.preventDefault();
        focusMenuItem(
          box,
          e.key === 'ArrowDown' ? 'next' : e.key === 'ArrowUp' ? 'previous' : e.key === 'Home' ? 'first' : 'last',
        );
        break;
      case 'ArrowRight':
      case 'ArrowLeft': {
        e.preventDefault();
        const next = neighbour(id, e.key === 'ArrowRight' ? 1 : -1);
        titles.current.get(next)?.focus();
        openFromKeyboard(next);
        break;
      }
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        setOpen(null);
        titles.current.get(id)?.focus();
        break;
      case 'Tab':
        setOpen(null);
        break;
    }
  };

  return (
    <div className="menubar" role="menubar" ref={ref} data-testid="menubar">
      {menus.map((menu) => (
        <div key={menu.id} className="menubar-menu">
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === menu.id}
            className={`menubar-title${open === menu.id ? ' open' : ''}`}
            data-testid={`menu-${menu.id}`}
            ref={(el) => {
              if (el) titles.current.set(menu.id, el);
              else titles.current.delete(menu.id);
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              setOpen(open === menu.id ? null : menu.id);
            }}
            onClick={(e) => {
              // Mouse clicks are handled on mousedown; a click with detail 0
              // comes from Enter or Space.
              if (e.detail !== 0) return;
              if (open === menu.id) setOpen(null);
              else openFromKeyboard(menu.id);
            }}
            onKeyDown={(e) => onTitleKeyDown(e, menu.id)}
            onMouseEnter={() => open && open !== menu.id && setOpen(menu.id)}
          >
            {menu.label}
          </button>
          {open === menu.id && (
            <div
              className="menu-dropdown"
              role="menu"
              aria-label={menu.label}
              data-testid={`menu-${menu.id}-dropdown`}
              ref={dropdown}
              onKeyDown={(e) => onMenuKeyDown(e, menu.id)}
            >
              {menu.items
                .filter((it) => !it.hidden)
                .map((it) => (
                  <div key={it.id} role="none">
                    {it.separatorBefore && <div className="menu-separator" role="separator" />}
                    <button
                      type="button"
                      role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                      aria-checked={it.checked === undefined ? undefined : it.checked}
                      className="menu-item"
                      disabled={it.disabled || !it.action}
                      data-testid={`menuitem-${it.id}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        const fromKeyboard = e.detail === 0;
                        setOpen(null);
                        it.action?.();
                        // Keyboard activation: return to the title unless the
                        // command moved the focus somewhere else.
                        if (fromKeyboard && (!document.activeElement || document.activeElement === document.body))
                          titles.current.get(menu.id)?.focus();
                      }}
                    >
                      <span className="menu-item-check" aria-hidden>
                        {it.checked ? '✓' : ''}
                      </span>
                      <span className="menu-item-label">{it.label}</span>
                      {it.shortcut && (
                        <span className="menu-item-shortcut" title={it.menuOnly ? 'Reserved by the browser: use the menu' : undefined}>
                          {formatShortcut(it.shortcut)}
                        </span>
                      )}
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
