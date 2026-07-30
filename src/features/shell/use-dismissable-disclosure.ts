"use client";

/**
 * The dismissal and focus behaviour a `<details>` disclosure needs and native
 * `<details>` does not supply.
 *
 * Extracted from `NavigationOverflow` when the account disclosure arrived
 * (Slice D3). Both surfaces need the identical two behaviours, and a second copy
 * would be two chances for them to diverge — the account menu is the one
 * disclosure whose contents change the session, so a stuck-open panel or a lost
 * focus ring there is worse than anywhere else in the shell.
 *
 * Neither behaviour is decoration:
 *
 *   * **Escape closes it and returns focus to the summary.** Native `<details>`
 *     does neither, so a keyboard user who opened it had no way back out
 *     (2E-A11Y-002's rule, applied to the shell).
 *   * **A pointer press anywhere outside closes it.** That is the gesture a
 *     phone user reaches for first, and the one the overflow had no answer to
 *     until UX-23.
 *
 * `pointerdown` rather than `click`: the panel must be gone before the tap
 * resolves, or the press lands on whatever the panel was covering.
 */

import { useEffect, useRef, type KeyboardEvent } from "react";

export type DismissableDisclosure = {
  readonly ref: React.RefObject<HTMLDetailsElement | null>;
  readonly onKeyDown: (event: KeyboardEvent<HTMLDetailsElement>) => void;
};

export function useDismissableDisclosure(): DismissableDisclosure {
  const ref = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      const element = ref.current;
      if (!element?.open) return;
      if (event.target instanceof Node && element.contains(event.target)) return;
      element.open = false;
    }

    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key !== "Escape" || !event.currentTarget.open) return;
    event.preventDefault();
    /*
     * One layer per Escape.
     *
     * On mobile the account disclosure is nested **inside** the overflow
     * disclosure, and without this the keydown bubbled to both: one Escape closed
     * the account panel *and* the panel containing it, so the summary the inner
     * handler had just focused was hidden by the time the press finished and focus
     * was lost. Closing the innermost layer first is also the conventional
     * behaviour, and it makes the two viewports behave identically — which for
     * the account surface is the whole point.
     */
    event.stopPropagation();
    event.currentTarget.open = false;
    // The summary, not `document.body`: focus must land back on the control the
    // user opened, or the next Tab starts from the top of the page.
    event.currentTarget.querySelector("summary")?.focus();
  }

  return { ref, onKeyDown };
}
