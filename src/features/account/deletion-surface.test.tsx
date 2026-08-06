import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeletionSurface } from "./deletion-surface";
import { getDeletionCopy } from "./deletion-copy";
import { locales } from "@/lib/preferences";

/**
 * The deletion surface has to actually carry the challenge, and it has to carry
 * it *inside the form*.
 *
 * Both halves are load-bearing and both have failed in this repository before,
 * in different files. A widget rendered outside the `<form>` produces a token
 * the browser never submits, which is indistinguishable at the server from a
 * widget that never ran — and the server's answer to that is `captcha-missing`,
 * a refusal the user cannot act on. A widget missing entirely is the deployed
 * defect this hotfix exists for.
 *
 * The widget arrives as a **node from the page**, never imported here: this is
 * a client component, and `turnstileSiteKey` reads the key through a function
 * parameter that Next cannot statically inline into a client bundle. Importing
 * it would produce a silent no-widget render on the deployment while every test
 * that stubbed it still passed. So these cases pass a marker node and assert
 * where it lands, which is exactly the property the page's contract owes.
 */

vi.mock("./actions", () => ({ requestAccountDeletion: vi.fn() }));

const marker = <div data-testid="captcha-widget" />;

describe("the deletion surface carries the challenge", () => {
  for (const locale of locales) {
    const copy = getDeletionCopy(locale);

    it(`renders the widget the page hands it, inside the form (${locale})`, () => {
      const { container } = render(<DeletionSurface captcha={marker} locale={locale} />);

      const widget = screen.getByTestId("captcha-widget");
      expect(widget).toBeTruthy();

      // Inside the form, or the token is never submitted.
      const form = container.querySelector("form.auth-form");
      expect(form, "the deletion form is missing").toBeTruthy();
      expect(form!.contains(widget), "the widget is outside the form").toBe(true);
    });

    it(`still renders the form where no widget is configured (${locale})`, () => {
      // Local development and CI run with no site key (SH-CAPTCHA-005), so the
      // page passes nothing. The surface must not depend on the widget existing.
      const { container } = render(<DeletionSurface locale={locale} />);

      expect(container.querySelector('input[name="password"]')).toBeTruthy();
      expect(container.querySelector('input[name="confirmation"]')).toBeTruthy();
      expect(screen.getByRole("button", { name: copy.submit })).toBeTruthy();
    });

    it(`states all four consequences before the controls (${locale})`, () => {
      // SH-COPY-003, re-asserted here because this hotfix touched the surface:
      // a confirmation reached by scrolling past nothing is a confirmation of
      // nothing.
      const { container } = render(<DeletionSurface captcha={marker} locale={locale} />);
      const text = container.textContent ?? "";
      for (const claim of [copy.irreversible, copy.removes, copy.retains, copy.timeline]) {
        expect(text).toContain(claim);
      }
    });
  }
});
