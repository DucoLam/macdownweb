import { useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The focusable elements inside `root`, in DOM (Tab) order, visible only. */
export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('inert') && el.getClientRects().length > 0,
  );
}

/**
 * D-11: keeps Tab and Shift+Tab inside `root` (a modal sheet in the
 * original). Returns true when the key was handled.
 */
export function trapTab(e: KeyboardEvent | React.KeyboardEvent, root: HTMLElement | null): boolean {
  if (e.key !== 'Tab' || !root) return false;
  const items = focusableIn(root);
  if (!items.length) {
    e.preventDefault();
    return true;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement as HTMLElement | null;
  const inside = !!active && root.contains(active);
  if (e.shiftKey && (!inside || active === first)) {
    e.preventDefault();
    last.focus();
    return true;
  }
  if (!e.shiftKey && (!inside || active === last)) {
    e.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

export interface ModalProps {
  label: string;
  testId: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Element to focus first; otherwise the first focusable element. */
  initialFocus?: React.RefObject<HTMLElement | null>;
  /** Close when the backdrop is clicked (default true). */
  closeOnBackdrop?: boolean;
  /** Give the focus back to the element focused before the dialog opened (default true). */
  restoreFocus?: boolean;
}

/**
 * Modal dialog (sheet): `role="dialog"`, `aria-modal`, Escape closes, Tab is
 * trapped (D-11), the previously focused element gets the focus back.
 */
export function Modal({ label, testId, onClose, children, className, initialFocus, closeOnBackdrop = true, restoreFocus = true }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const target = initialFocus?.current ?? (ref.current ? focusableIn(ref.current)[0] : null);
    (target ?? ref.current)?.focus();
    return () => {
      if (!restoreFocus) return;
      if (previous && previous.isConnected && !ref.current?.contains(previous)) previous.focus?.();
    };
    // Focus once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="dialog-backdrop"
      data-modal-backdrop=""
      onMouseDown={(e) => closeOnBackdrop && e.target === e.currentTarget && close.current()}
    >
      <div
        className={`dialog${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-testid={testId}
        tabIndex={-1}
        ref={ref}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close.current();
            return;
          }
          trapTab(e, ref.current);
        }}
      >
        {children}
      </div>
    </div>
  );
}
