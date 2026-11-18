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

    it(`says what cannot be undone first, then the rest as rows, all above the first field (${locale})`, () => {
      // Editorial calmo (ADR-180). The recomposition may place the four claims;
      // it may not drop one or let a control come ahead of them.
      const { container } = render(<DeletionSurface captcha={marker} locale={locale} />);
      const column = container.querySelector(".auth-column")!;
      expect(container.querySelector(".auth-card")).toBeNull();

      const warning = column.querySelector("p.auth-warning")!;
      expect(warning.textContent).toBe(copy.irreversible);
      const rows = [...column.querySelectorAll(".auth-facts > li")].map((row) => row.textContent);
      expect(rows).toEqual([copy.removes, copy.retains, copy.timeline]);

      const firstControl = column.querySelector("input:not([type=hidden]), button")!;
      const following = (a: Element, b: Element) =>
        Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      expect(following(column.querySelector("h1")!, warning)).toBe(true);
      expect(following(warning, column.querySelector(".auth-facts")!)).toBe(true);
      expect(following(column.querySelector(".auth-facts")!, firstControl)).toBe(true);
    });

    it(`sends exactly what it sent: the word, the password, the locale, one submit (${locale})`, () => {
      const { container } = render(<DeletionSurface captcha={marker} locale={locale} />);
      const form = container.querySelector("form.auth-form")!;
      const attributes = (name: string) => {
        const input = form.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
        return Object.fromEntries([...input.attributes].map((attribute) => [attribute.name, attribute.value]));
      };
      expect([...form.querySelectorAll("input")].map((input) => input.name)).toEqual(["locale", "confirmation", "password"]);
      expect(attributes("locale")).toEqual({ type: "hidden", name: "locale", value: locale });
      expect(attributes("confirmation")).toEqual({ autocomplete: "off", maxlength: "64", name: "confirmation", required: "" });
      expect(attributes("password")).toEqual({
        autocomplete: "current-password", maxlength: "256", name: "password", required: "", type: "password",
      });
      const buttons = form.querySelectorAll("button");
      expect(buttons).toHaveLength(1);
      expect(buttons[0].getAttribute("type")).toBe("submit");
      // The one filled risk button: it is marked as such, and it is the only one.
      expect(buttons[0].classList.contains("auth-danger-action")).toBe(true);
      expect(screen.getByLabelText(copy.confirmationLabel).getAttribute("name")).toBe("confirmation");
      expect(screen.getByLabelText(copy.passwordLabel).getAttribute("name")).toBe("password");
    });
  }
});
