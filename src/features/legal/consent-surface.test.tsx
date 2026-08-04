import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConsentSurface } from "./consent-surface";
import { getLegalCopy } from "./copy";
import { locales } from "@/lib/preferences";

/**
 * The decline path has to lead somewhere the declining user can actually go
 * (SH-LEGAL-010).
 *
 * This exists because it did not. The deployed SH.4 journey found the "delete
 * the account" link pointing at `/app/settings` — a route behind the very
 * consent gate the user is declining, so the one caller the link is for was
 * bounced straight back to the consent screen. The deletion surface was placed
 * outside `app/` precisely to be reachable here, and nothing pinned the link to
 * it.
 *
 * So the assertion is not "the href is this string" for its own sake: it is
 * that the decline targets stay OUT of `app/`. A future refactor that moves the
 * deletion surface may change the path, and this test should fail if the new
 * path is gated.
 */

vi.mock("./actions", () => ({ acceptPolicies: vi.fn() }));
vi.mock("@/features/auth/actions", () => ({ signOut: vi.fn() }));

describe("consent decline path (SH-LEGAL-010)", () => {
  for (const locale of locales) {
    const copy = getLegalCopy(locale).interposition;

    it(`offers a deletion route outside the consent-gated area (${locale})`, () => {
      render(<ConsentSurface hasAcceptedBefore={false} locale={locale} />);

      const deleteLink = screen.getByRole("link", { name: copy.declineDelete });
      const href = deleteLink.getAttribute("href") ?? "";

      expect(href).toBe(`/${locale}/account/delete`);
      // The load-bearing half: anything under `app/` runs the consent gate.
      expect(href.startsWith(`/${locale}/app/`)).toBe(false);
    });

    it(`offers sign-out as a real control, not a link (${locale})`, () => {
      render(<ConsentSurface hasAcceptedBefore={false} locale={locale} />);

      // Sign-out is a Server Action submit, so it must be a button in a form —
      // a link would be a GET and would not clear the session.
      expect(screen.getByRole("button", { name: copy.declineSignOut })).toBeInTheDocument();
    });
  }
});
