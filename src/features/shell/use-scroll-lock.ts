"use client";

/**
 * The document does not scroll while a modal is open — the second device
 * checkpoint's second finding.
 *
 * *"Com o modal aberto, ainda consigo rolar a página atrás dele."*
 *
 * There was no scroll lock **anywhere in this repository** before this file: a
 * census of `overflow: hidden`, `body.style.overflow` and `overscroll` turned up
 * three horizontal-scroll containers and nothing that touched the document. So
 * every modal the product has ever shown — six `ConfirmDialog` consumers, the
 * command palette, the trust panel — let the page move behind it.
 *
 * ## Why `position: fixed` on the body rather than `overflow: hidden`
 *
 * `overflow: hidden` on `<body>` or `<html>` is the answer everyone writes down
 * first and it **does not hold on iOS Safari**, which is precisely the device the
 * checkpoint was performed on: touch scrolling continues to move the document,
 * and rubber-band overscroll continues past it. Taking the body out of flow is
 * the only technique that stops a touch drag, a wheel, a trackpad gesture, the
 * arrow keys and the space bar together, because there is no scrollable document
 * left to move.
 *
 * The cost is that the body snaps to the top, so the offset it was scrolled to
 * is carried in `top` and given back on release. *"Ao fechar, a página retorna
 * exatamente à posição anterior"* is that pair, and it is the half of this
 * technique that is easiest to leave out.
 *
 * ## The gutter, and why it is added rather than assigned
 *
 * Fixing the body removes the document scrollbar, and on a desktop that is a
 * ~15px jump of the whole layout at the moment the dialog opens. The width it
 * occupied is measured and added back as padding.
 *
 * **Added to the computed value, not assigned over it.** An inline
 * `padding-right` would otherwise overwrite whatever the stylesheet had already
 * resolved there — including `env(safe-area-inset-right)`, which is how a phone
 * in landscape keeps content clear of the notch. Reading the computed value
 * first is what keeps the safe area intact.
 *
 * ## One lock, however many dialogs
 *
 * The counter is module scope, so a dialog opened over a dialog does not lock
 * twice and — the failure that actually matters — closing the inner one does not
 * release the outer one's lock. *"Modais empilhados não liberam o scroll
 * prematuramente."* Only the last release restores, and it restores the values
 * the **first** lock saw, which is why the snapshot lives beside the counter
 * rather than inside the hook.
 *
 * Release runs from the effect's cleanup, so an unmount nobody planned for —
 * a route change under an open dialog, a parent that threw — still unlocks. A
 * lock that outlives its dialog is a page that can never scroll again.
 */

import { useEffect } from "react";

/**
 * How many surfaces currently want the document still, and how to undo the one
 * lock they share.
 *
 * Module scope on purpose: this is a property of the document, and the document
 * is not per-component.
 */
let holders = 0;
let release: (() => void) | null = null;

function engage(): void {
  const body = document.body;
  const offset = window.scrollY;
  // The scrollbar's own width — zero on any overlay-scrollbar platform, which
  // is why it is measured rather than assumed.
  const gutter = window.innerWidth - document.documentElement.clientWidth;
  const previous = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    paddingRight: body.style.paddingRight,
    overscrollBehavior: body.style.overscrollBehavior,
  };
  const resolvedPadding = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;

  body.style.position = "fixed";
  body.style.top = `-${offset}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  // Belt and braces for the overscroll chain on a browser that would otherwise
  // rubber-band the viewport itself.
  body.style.overscrollBehavior = "none";
  if (gutter > 0) body.style.paddingRight = `${resolvedPadding + gutter}px`;

  release = () => {
    body.style.position = previous.position;
    body.style.top = previous.top;
    body.style.left = previous.left;
    body.style.right = previous.right;
    body.style.width = previous.width;
    body.style.paddingRight = previous.paddingRight;
    body.style.overscrollBehavior = previous.overscrollBehavior;
    // Guarded, because a document that never moved does not need moving back —
    // and jsdom's `scrollTo` is a stub that reports itself as unimplemented.
    if (offset > 0) window.scrollTo(0, offset);
  };
}

/**
 * Holds the document still for as long as `active` is true.
 *
 * @param active whether this surface currently wants the lock. Passing the
 * dialog's own `open` is the intended use: the hook is a no-op until it turns
 * true and releases itself when it turns false or the component goes away.
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    holders += 1;
    if (holders === 1) engage();
    return () => {
      holders -= 1;
      if (holders > 0) return;
      release?.();
      release = null;
    };
  }, [active]);
}

/**
 * Whether the document is currently held — for tests, which otherwise have to
 * assert against inline styles and would pass on a lock that never released.
 */
export function scrollLockHolders(): number {
  return holders;
}
