"use client";

/**
 * The destructive-confirmation dialog (PRD 2E-A11Y-004, 2E-DESTRUCTIVE-005).
 *
 * **Hand-rolled `role="dialog" aria-modal="true"`, not `<dialog>` +
 * `showModal()`.** That is not a preference. jsdom 29.1.1 — the version this
 * repository runs — implements `HTMLDialogElement` with **no** `showModal`,
 * `show` or `close` method: calling `showModal()` throws `TypeError`. The only
 * accessibility gate CI runs is Vitest with jsdom, so a native dialog would
 * make 2E-A11Y-004 literally unassertable in the one place it is checked, and
 * the requirement would ship on a manual read of the source. Verified by
 * execution, not by reading the version number.
 *
 * The three behaviours `showModal()` would have supplied are therefore
 * implemented here, and each has a test:
 *
 *   * initial focus moves into the dialog (2E-A11Y-002),
 *   * Tab cycles within it and cannot reach the page behind,
 *   * Escape closes it and focus returns to the control that opened it.
 *
 * Inert-ing the background is done with `aria-hidden` on the console body plus
 * the focus cycle above, rather than with the `inert` attribute, which React
 * 19 supports but jsdom does not reflect — the same reason the dialog itself is
 * hand-rolled.
 */

import { useCallback, useEffect, useRef } from "react";

/**
 * `type="hidden"` is excluded, and that exclusion is load-bearing rather than
 * tidy.
 *
 * Every form inside this dialog carries hidden fields — the locale, the origin
 * and the session envelope — and a hidden input matches `input:not([disabled])`
 * perfectly well. Without the exclusion, "the first focusable element" resolves
 * to a hidden field, `.focus()` on it is a silent no-op, and the dialog opens
 * with focus still on the page behind it. The Tab cycle fails the same way: the
 * wrap-to-first jump lands on nothing and focus never moves. Both were real,
 * and both were caught by the tests in `command-console.test.tsx` rather than
 * by reading this line.
 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function ConfirmDialog({
  open,
  title,
  description,
  cancelLabel,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  cancelLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement | null>(null);
  const opener = useRef<Element | null>(null);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    // Remembered before focus moves, so Escape can put it back exactly where
    // the user left it. 2E-A11Y-002: focus is never lost.
    opener.current = document.activeElement;
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => {
      const previous = opener.current;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      // The cycle is what keeps focus inside a dialog the browser is not
      // treating as modal, because nothing here called `showModal()`.
      if (event.shiftKey && (active === first || !panel.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="task-command-dialog-backdrop">
      <div
        aria-describedby="task-command-dialog-description"
        aria-labelledby="task-command-dialog-title"
        aria-modal="true"
        className="task-command-dialog"
        ref={panel}
        role="dialog"
      >
        <h3 id="task-command-dialog-title">{title}</h3>
        <p id="task-command-dialog-description">{description}</p>
        {children}
        <button className="task-command-dialog-cancel" onClick={close} type="button">
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
