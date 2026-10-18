import { useEffect, useRef, useState } from 'react';
import { focusMenuItem } from './menuKeys';
import { Modal } from './Modal';

/**
 * Toolbar (spec §4, F-09, F-13, F-14). The 13 allowed items use the
 * NSToolbar identifiers of MPToolbarController.m; groups are segmented
 * controls with one segment per sub-item and the sub-item label as tooltip.
 * The item list comes from the `toolbarItemIdentifiers` preference; `null`
 * (unset) means the default set (U-08) and an empty list an empty toolbar
 * (D-12).
 */

export interface ToolButton {
  id: string; // sub-item identifier (§4), also the testid suffix
  label: string;
  icon: string;
  /** Command id passed to `onCommand` (App maps it to the Format command). */
  command: string;
}

export interface ToolItem {
  id: string; // §4 item identifier
  label: string; // palette label
  /** `separated` and `joined` groups (MPToolbarController.m:201-264), single buttons have one entry. */
  look: 'separated' | 'joined' | 'single' | 'layout';
  buttons: ToolButton[];
}

const b = (id: string, label: string, icon: string, command: string): ToolButton => ({ id, label, icon, command });

/** §4 allowed items, in the original order. */
export const TOOLBAR_ITEMS: readonly ToolItem[] = [
  { id: 'indent-group', label: 'Shift Left/Right', look: 'separated', buttons: [b('shift-left', 'Shift Left', 'ShiftLeft', 'shift-left'), b('shift-right', 'Shift Right', 'ShiftRight', 'shift-right')] },
  { id: 'text-formatting-group', label: 'Text Styles', look: 'joined', buttons: [b('bold', 'Strong', 'Bold', 'strong'), b('italic', 'Emphasize', 'Italic', 'emphasize'), b('underline', 'Underline', 'Underlined', 'underline')] },
  { id: 'heading-group', label: 'Headings', look: 'joined', buttons: [b('heading1', 'Heading 1', 'Heading1', 'header-1'), b('heading2', 'Heading 2', 'Heading2', 'header-2'), b('heading3', 'Heading 3', 'Heading3', 'header-3')] },
  { id: 'list-group', label: 'Ordered/Unordered List', look: 'separated', buttons: [b('unordered-list', 'Unordered List', 'UnorderedList', 'unordered-list'), b('ordered-list', 'Ordered List', 'OrderedList', 'ordered-list')] },
  { id: 'blockquote', label: 'Blockquote', look: 'single', buttons: [b('blockquote', 'Blockquote', 'Blockquote', 'blockquote')] },
  { id: 'code', label: 'Inline Code', look: 'single', buttons: [b('code', 'Inline Code', 'InlineCode', 'inline-code')] },
  { id: 'link', label: 'Link', look: 'single', buttons: [b('link', 'Link', 'Link', 'link')] },
  { id: 'image', label: 'Image', look: 'single', buttons: [b('image', 'Image', 'Image', 'image')] },
  { id: 'copy-html', label: 'Copy HTML', look: 'single', buttons: [b('copy-html', 'Copy HTML', 'CopyHTML', 'copy-html')] },
  { id: 'comment', label: 'Comment', look: 'single', buttons: [b('comment', 'Comment', 'Comment', 'comment')] },
  { id: 'highlight', label: 'Highlight', look: 'single', buttons: [b('highlight', 'Highlight', 'Highlight', 'highlight')] },
  { id: 'strikethrough', label: 'Strikethrough', look: 'single', buttons: [b('strikethrough', 'Strikethrough', 'Strikethrough', 'strikethrough')] },
  { id: 'layout', label: 'Layout', look: 'layout', buttons: [] },
];

export const FLEXIBLE_SPACE = 'flexible-space';
export const SPACE = 'space';

/** Items left out of the default set [MPToolbarController.m:126-169]. */
const NOT_DEFAULT = new Set(['comment', 'highlight', 'strikethrough']);
/** Flexible spaces follow these indices of the full list (none are fixed spaces). */
const FLEXIBLE_AFTER = new Set([2, 3, 5, 7, 11]);

/**
 * `toolbarDefaultItemIdentifiers:`: the allowed items without the excluded
 * ones, with a flexible space after indices 2, 3, 5, 7 and 11 of the full
 * list (index 11 is the skipped Strikethrough, so a space follows Copy HTML).
 * `include` lets the customisation dialog build a list the same way.
 */
export function toolbarItemsFor(include: (id: string) => boolean = (id) => !NOT_DEFAULT.has(id)): string[] {
  const out: string[] = [];
  TOOLBAR_ITEMS.forEach((it, i) => {
    if (include(it.id)) out.push(it.id);
    if (FLEXIBLE_AFTER.has(i) && out.length && out[out.length - 1] !== FLEXIBLE_SPACE) out.push(FLEXIBLE_SPACE);
  });
  return out;
}

export const DEFAULT_TOOLBAR_ITEMS: readonly string[] = toolbarItemsFor();

function Icon({ name }: { name: string }) {
  const base = `${import.meta.env.BASE_URL}icons/ToolbarIcon${name}`;
  return <img src={`${base}.png`} srcSet={`${base}.png 1x, ${base}@2x.png 2x`} alt="" width={19} height={19} draggable={false} />;
}

export interface ToolbarProps {
  /** `toolbarItemIdentifiers` (`null` = default set, `[]` = no items). */
  items: readonly string[] | null;
  onCommand: (command: string) => void;
  /** F-14: right-click on the toolbar opens the customisation dialog. */
  onCustomize?: () => void;
  editorVisible: boolean;
  previewVisible: boolean;
  /** Validation rule: hidden when the preview is collapsed and no previous ratio exists. */
  previewToggleHidden: boolean;
  onToggleEditor: () => void;
  onTogglePreview: () => void;
}

export function Toolbar(props: ToolbarProps) {
  const ids = props.items ?? DEFAULT_TOOLBAR_ITEMS;
  return (
    <div className="toolbar" role="toolbar" aria-label="Toolbar" data-testid="toolbar" data-items={ids.join(' ')}
      onContextMenu={(e) => {
        if (!props.onCustomize) return;
        e.preventDefault();
        props.onCustomize();
      }}
    >
      {ids.map((id, i) => {
        if (id === FLEXIBLE_SPACE) return <div className="toolbar-flex" key={`f${i}`} data-testid="toolbar-flexible-space" />;
        if (id === SPACE) return <div className="toolbar-space" key={`s${i}`} data-testid="toolbar-space" />;
        const item = TOOLBAR_ITEMS.find((t) => t.id === id);
        if (!item) return null;
        if (item.look === 'layout') return <LayoutPullDown key={id} {...props} />;
        return (
          <div className={`toolbar-group toolbar-group-${item.look}`} key={id} role="group" aria-label={item.label} data-testid={`toolbar-item-${item.id}`}>
            {item.buttons.map((bt) => (
              <button
                type="button"
                key={bt.id}
                className="toolbar-button"
                title={bt.label}
                data-command={bt.command}
                aria-label={bt.label}
                data-testid={`toolbar-${bt.id}`}
                // Keep the editor focus and selection (NSToolbar items do not take focus).
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => props.onCommand(bt.command)}
              >
                <Icon name={bt.icon} />
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** T-13 Layout pull-down (F-09). */
function LayoutPullDown(props: ToolbarProps) {
  const [open, setOpen] = useState(false);
  const [focusOnOpen, setFocusOnOpen] = useState<'first' | 'last' | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // D-02: opened from the keyboard, the first (or last) item gets the focus.
  useEffect(() => {
    if (!open || !focusOnOpen || !menu.current) return;
    focusMenuItem(menu.current, focusOnOpen);
    setFocusOnOpen(null);
  }, [open, focusOnOpen]);

  const choose = (fromKeyboard: boolean, fn: () => void) => {
    setOpen(false);
    fn();
    if (fromKeyboard) button.current?.focus();
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (!menu.current) return;
    const where = { ArrowDown: 'next', ArrowUp: 'previous', Home: 'first', End: 'last' } as const;
    if (e.key in where) {
      e.preventDefault();
      focusMenuItem(menu.current, where[e.key as keyof typeof where]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const blur = () => setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', blur);
    };
  }, [open]);

  return (
    <div className="toolbar-layout" ref={ref} data-testid="toolbar-item-layout">
      <button
        type="button"
        className={`toolbar-button toolbar-layout-button${open ? ' open' : ''}`}
        title="Layout"
        aria-label="Layout"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="toolbar-layout"
        ref={button}
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen(!open);
        }}
        onClick={(e) => {
          // Mouse is handled on mousedown; detail 0 = Enter or Space.
          if (e.detail !== 0) return;
          if (open) setOpen(false);
          else {
            setOpen(true);
            setFocusOnOpen('first');
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
            setFocusOnOpen(e.key === 'ArrowUp' ? 'last' : 'first');
          }
        }}
      >
        <Icon name="EditorAndPreview" />
        <span className="toolbar-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="menu-dropdown toolbar-layout-menu" role="menu" aria-label="Layout" ref={menu} onKeyDown={onMenuKeyDown}>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            data-testid="layout-toggle-editor"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => choose(e.detail === 0, props.onToggleEditor)}
          >
            <span className="menu-item-label">{props.editorVisible ? 'Hide Editor Pane' : 'Restore Editor Pane'}</span>
          </button>
          {!props.previewToggleHidden && (
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              data-testid="layout-toggle-preview"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => choose(e.detail === 0, props.onTogglePreview)}
            >
              <span className="menu-item-label">{props.previewVisible ? 'Hide Preview Pane' : 'Restore Preview Pane'}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * F-14 Customize Toolbar (simplified NSToolbar customisation): one checkbox
 * per allowed item, in the original order; spaces are placed as in the
 * default set. "Use Default Set" restores the default.
 */
export function CustomizeToolbarDialog({
  items,
  onChange,
  onClose,
}: {
  items: readonly string[] | null;
  /** The new item list; `null` = Use Default Set. */
  onChange: (items: string[] | null) => void;
  onClose: () => void;
}) {
  const current = new Set(items ?? DEFAULT_TOOLBAR_ITEMS);
  const done = useRef<HTMLButtonElement>(null);
  const toggle = (id: string, on: boolean) => {
    const next = new Set(current);
    if (on) next.add(id);
    else next.delete(id);
    // D-12: unchecking the last item stores [] (an empty toolbar), never "unset".
    onChange(toolbarItemsFor((x) => next.has(x)));
  };
  return (
    <Modal label="Customize Toolbar" testId="toolbar-customize" onClose={onClose} initialFocus={done} restoreFocus={false}>
      <h2 className="dialog-title">Customize Toolbar</h2>
      <ul className="dialog-list">
        {TOOLBAR_ITEMS.map((it) => (
          <li key={it.id}>
            <label>
              <input
                type="checkbox"
                checked={current.has(it.id)}
                data-testid={`toolbar-customize-${it.id}`}
                onChange={(e) => toggle(it.id, e.target.checked)}
              />
              {it.label}
            </label>
          </li>
        ))}
      </ul>
      <div className="dialog-buttons">
        <button type="button" data-testid="toolbar-customize-default" onClick={() => onChange(null)}>
          Use Default Set
        </button>
        <button type="button" ref={done} data-testid="toolbar-customize-done" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
