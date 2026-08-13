import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AuthenticatedLoading from "./loading";
import { routeLoadingAnnouncements } from "@/features/shell/route-loading-copy";
import { locales } from "@/lib/preferences";

/**
 * `2N-ACCESS-003`, `2N-ACCESS-005`, ADR-112 Decision 7a.
 *
 * This file previously asserted `getByRole("status", { name: "Carregando página" })`
 * — which is to say, it asserted the defect: a hardcoded Portuguese accessible
 * name served to every reader in both locales. The assertion passed for as long
 * as the bug existed, which is worth recording, because the test looked like
 * coverage of the loading state and was in fact coverage of one locale's copy.
 *
 * What replaces it proves the three things that actually have to be true, and
 * separates what jsdom can see from what only a browser can. The **selection**
 * is CSS-driven and external stylesheets are not applied here, so the
 * `[lang]`-to-marker pairing is proved structurally in
 * `src/lib/closeout/route-loading-locale-guard.test.ts` and rendered for real in
 * `e2e/phase-2n-foundations.spec.ts`.
 */
describe("authenticated route loading shell", () => {
  it("is a live region whose announcement comes from its content", () => {
    render(<AuthenticatedLoading />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    // No `aria-label`: it would override the content for the accessible name and
    // could not be localised by the mechanism below, which is precisely how the
    // Portuguese-for-everyone defect survived.
    expect(region).not.toHaveAttribute("aria-label");
  });

  it("preserves the page skeleton", () => {
    const { container } = render(<AuthenticatedLoading />);
    expect(container.querySelectorAll("[data-loading-block]")).toHaveLength(4);
  });

  it("renders an announcement for every locale the product has", () => {
    render(<AuthenticatedLoading />);
    for (const { locale, text } of routeLoadingAnnouncements) {
      const node = document.querySelector(`[data-route-loading-locale="${locale}"]`);
      expect(node, `no announcement for ${locale}`).not.toBeNull();
      expect(node?.textContent).toBe(text);
    }
    expect(document.querySelectorAll("[data-route-loading-locale]")).toHaveLength(locales.length);
  });

  it("says something different in each locale, so neither is a placeholder", () => {
    const texts = routeLoadingAnnouncements.map((entry) => entry.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("marks every announcement so the stylesheet can select exactly one", () => {
    render(<AuthenticatedLoading />);
    for (const node of document.querySelectorAll("[data-route-loading-locale]")) {
      const marker = node.getAttribute("data-route-loading-locale");
      expect(locales as readonly string[]).toContain(marker);
      // Visually hidden but present in the accessibility tree — announced, not
      // merely styled (`2N-ACCESS-003`).
      expect(node.className).toContain("sr-only");
    }
  });
});
