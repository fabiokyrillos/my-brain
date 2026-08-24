import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { scrollLockHolders, useScrollLock } from "./use-scroll-lock";

/**
 * *"Com o modal aberto, ainda consigo rolar a página atrás dele."* — the second
 * device checkpoint, on an iPhone.
 *
 * These assert the properties the checkpoint's contract names, on the document
 * itself: that the body is taken out of flow rather than merely given
 * `overflow: hidden` (which iOS ignores for touch), that the offset comes back,
 * that the layout does not jump when the scrollbar goes, that a stacked dialog
 * cannot release someone else's lock, and that an unmount nobody planned for
 * still unlocks.
 */

/**
 * jsdom performs no layout, so `documentElement.clientWidth` is **0** and the
 * gutter would measure the whole viewport in every test. Every case that cares
 * about the gutter therefore states the width it is testing against, and the
 * ones that do not are simply not asserting on padding.
 */
const widthOfViewportMinus = (scrollbar: number) => {
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: window.innerWidth - scrollbar,
  });
};

afterEach(() => {
  cleanup();
  // A leaked lock would make every later test pass for the wrong reason.
  expect(scrollLockHolders(), "a lock outlived its test").toBe(0);
  document.body.setAttribute("style", "");
  Reflect.deleteProperty(document.documentElement, "clientWidth");
});

describe("the document is held still while a modal is open", () => {
  it("takes the body out of flow rather than only hiding its overflow", () => {
    /*
      The distinction is the whole defect. `overflow: hidden` on the body is the
      obvious answer and iOS Safari keeps scrolling straight through it — touch
      drag and rubber-band both. Only a body that is not in flow has nothing
      left to scroll.
    */
    renderHook(() => useScrollLock(true));
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.width).toBe("100%");
    expect(document.body.style.overscrollBehavior).toBe("none");
  });

  it("does nothing at all until the dialog is open", () => {
    renderHook(() => useScrollLock(false));
    expect(document.body.style.position).toBe("");
    expect(scrollLockHolders()).toBe(0);
  });

  it("carries the scroll offset in `top` and gives it back on release", () => {
    window.scrollY = 640;
    const { unmount } = renderHook(() => useScrollLock(true));
    expect(document.body.style.top).toBe("-640px");

    act(() => unmount());
    // Restored to what it was, rather than to a hard-coded zero -- the page has
    // to come back exactly where the owner left it.
    expect(document.body.style.top).toBe("");
    expect(document.body.style.position).toBe("");
    window.scrollY = 0;
  });

  it("adds the scrollbar's width to the padding the stylesheet resolved", () => {
    /*
      Assigning over `padding-right` rather than adding to it is how a fix for
      the layout jump becomes a regression on a notched phone in landscape:
      `env(safe-area-inset-right)` resolves into that same property.
    */
    document.body.style.paddingRight = "24px";
    widthOfViewportMinus(15);

    const { unmount } = renderHook(() => useScrollLock(true));
    expect(document.body.style.paddingRight).toBe("39px");

    act(() => unmount());
    expect(document.body.style.paddingRight).toBe("24px");
  });

  it("leaves the padding alone where the scrollbar takes no width", () => {
    // Overlay scrollbars -- every phone, and most desktops now. Measured, not
    // assumed, so there is no gutter invented where none was lost.
    document.body.style.paddingRight = "24px";
    widthOfViewportMinus(0);
    const { unmount } = renderHook(() => useScrollLock(true));
    expect(document.body.style.paddingRight).toBe("24px");
    act(() => unmount());
  });
});

describe("stacked dialogs share one lock", () => {
  it("does not release the outer lock when the inner one closes", () => {
    // The failure that matters: a confirmation opened over a composer closes,
    // and the page behind the composer starts scrolling again.
    const outer = renderHook(() => useScrollLock(true));
    const inner = renderHook(() => useScrollLock(true));
    expect(scrollLockHolders()).toBe(2);

    act(() => inner.unmount());
    expect(scrollLockHolders()).toBe(1);
    expect(document.body.style.position, "the inner dialog released a lock it did not own")
      .toBe("fixed");

    act(() => outer.unmount());
    expect(document.body.style.position).toBe("");
  });

  it("restores what the first lock saw, not what the second did", () => {
    window.scrollY = 200;
    const outer = renderHook(() => useScrollLock(true));
    window.scrollY = 0; // the body is fixed now, so the document reads zero
    const inner = renderHook(() => useScrollLock(true));

    expect(document.body.style.top).toBe("-200px");
    act(() => inner.unmount());
    expect(document.body.style.top).toBe("-200px");
    act(() => outer.unmount());
    expect(document.body.style.top).toBe("");
  });
});

describe("an unmount nobody planned for still unlocks", () => {
  it("releases from cleanup rather than from a close handler", () => {
    // A route change under an open dialog never calls anyone's `onClose`. A lock
    // that outlives its dialog is a page that can never scroll again.
    const { unmount } = renderHook(() => useScrollLock(true));
    expect(document.body.style.position).toBe("fixed");
    act(() => unmount());
    expect(document.body.style.position).toBe("");
    expect(scrollLockHolders()).toBe(0);
  });

  it("releases when the flag goes false without unmounting", () => {
    const { rerender } = renderHook(({ open }) => useScrollLock(open), {
      initialProps: { open: true },
    });
    expect(document.body.style.position).toBe("fixed");
    act(() => rerender({ open: false }));
    expect(document.body.style.position).toBe("");
  });
});
