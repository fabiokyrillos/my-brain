import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { locales, type Locale } from "@/lib/preferences";

import { AccountDataSection } from "./account-data-section";
import { AccountDataStrip } from "./account-data-strip";
import {
  ACCOUNT_CENTRE_DESTINATIONS,
  ACCOUNT_CENTRE_STRIP_ROUTES,
  accountCentreLinks,
} from "./contracts";
import { getAccountCentreCopy } from "./copy";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

afterEach(cleanup);

describe("`2O-PREF-002`: the three destinations the requirement names", () => {
  it("names exactly three, and resolves four routes", () => {
    expect([...ACCOUNT_CENTRE_DESTINATIONS]).toEqual(["notifications", "consent", "deletion"]);
    const hrefs = ACCOUNT_CENTRE_DESTINATIONS.flatMap((destination) =>
      accountCentreLinks("pt-BR", destination).map((link) => link.href),
    );
    expect(hrefs).toEqual([
      "/pt-BR/app/notifications",
      "/pt-BR/legal/terms",
      "/pt-BR/legal/privacy",
      "/pt-BR/account/delete",
    ]);
  });

  it("localizes every route, with no locale left hardcoded", () => {
    for (const locale of locales) {
      for (const destination of ACCOUNT_CENTRE_DESTINATIONS) {
        for (const link of accountCentreLinks(locale, destination)) {
          expect(link.href, `${destination}/${link.key}`).toMatch(new RegExp(`^/${locale}/`));
        }
      }
    }
  });

  /**
   * The consent documents are **derived** from `POLICY_DOCUMENTS`, so a third
   * policy document cannot be reachable from the acceptance gate and invisible
   * here. Asserted by comparing against the closed set rather than by naming the
   * two, which would be the second list this derivation exists to avoid.
   */
  it("derives the policy documents from the same closed set the gate uses", async () => {
    const { POLICY_DOCUMENTS } = await import("@/features/legal/versions");
    const keys = accountCentreLinks("en", "consent").map((link) => link.key);
    expect(keys).toEqual([...POLICY_DOCUMENTS]);
    expect(keys.length).toBeGreaterThan(1);
  });
});

describe("the section renders every door, in both locales", () => {
  for (const locale of locales) {
    it(`renders four labelled links with distinct descriptions (${locale})`, () => {
      render(<AccountDataSection locale={locale as Locale} />);
      const copy = getAccountCentreCopy(locale as Locale);

      const links = screen.getAllByRole("link");
      expect(links).toHaveLength(4);

      const descriptions = new Set<string>();
      for (const destination of ACCOUNT_CENTRE_DESTINATIONS) {
        for (const link of accountCentreLinks(locale as Locale, destination)) {
          const entry = copy.entries[destination].links[link.key];
          const anchor = screen.getByRole("link", { name: new RegExp(entry.label, "i") });
          expect(anchor).toHaveAttribute("href", link.href);
          descriptions.add(entry.description);
        }
      }
      // Each door says something different. A shared description was the first
      // shape of this section and told a reader nothing about which to open.
      expect(descriptions.size).toBe(4);
    });
  }
});

describe("`2O-PREF-002`: no route is redirected and no route ends", () => {
  const REACHED = [
    "src/app/[locale]/app/notifications/page.tsx",
    "src/app/[locale]/account/delete/page.tsx",
    "src/app/[locale]/legal/[document]/page.tsx",
  ] as const;

  it("every reached route still exists and still renders", () => {
    for (const path of REACHED) {
      const source = read(path);
      expect(source.length, path).toBeGreaterThan(500);
      expect(source, `${path} stopped exporting a page`).toMatch(/export default/);
    }
  });

  /**
   * The failure this prevents is the one `transparency/contracts.ts` refused
   * when the handoff asked for tabs: a consolidated section that works by
   * redirecting the routes it consolidates, taking their filters, their
   * pagination and their deep links with them.
   *
   * The notifications page keeps its `?page` deep link, and the check is
   * specific — `redirect(` appears legitimately in the deletion page, which
   * bounces an unauthenticated or non-active account, and that is a **guard**
   * rather than a consolidation redirect.
   */
  it("notifications keeps its pagination and redirects nobody", () => {
    const source = read("src/app/[locale]/app/notifications/page.tsx");
    expect(source).toContain("PaginationLinks");
    expect(source).toContain("parsePage");
    expect(source).not.toContain("redirect(");
  });

  it("the deletion page redirects only for authentication and lifecycle", () => {
    const source = read("src/app/[locale]/account/delete/page.tsx");
    // Both pre-existing, and neither is about this section.
    expect(source).toContain("auth/login");
    expect(source).toContain("assertActiveAccount");
    // Its own properties, untouched by the strip.
    expect(source).toContain("TurnstileWidget");
    expect(source).toContain("DeletionSurface");
  });
});

describe("`2O-PREF-002`: the strip, and the two routes that deliberately lack one", () => {
  it("names exactly the authenticated destinations", () => {
    expect([...ACCOUNT_CENTRE_STRIP_ROUTES]).toEqual(["notifications", "deletion"]);
  });

  for (const route of ACCOUNT_CENTRE_STRIP_ROUTES) {
    it(`${route} wears it, and it leads back to Ajustes`, () => {
      render(<AccountDataStrip locale="pt-BR" route={route} />);
      expect(screen.getByRole("link", { name: /Voltar para Ajustes/ })).toHaveAttribute(
        "href",
        "/pt-BR/app/settings",
      );
      // The page names itself without promising a destination.
      const current = screen.getByText(getAccountCentreCopy("pt-BR").stripLabel[route]);
      expect(current).toHaveAttribute("aria-current", "page");
      expect(current.tagName).not.toBe("A");
    });
  }

  it("is actually mounted on both, which a contract alone would not prove", () => {
    expect(read("src/app/[locale]/app/notifications/page.tsx")).toContain(
      '<AccountDataStrip locale={locale} route="notifications" />',
    );
    expect(read("src/app/[locale]/account/delete/page.tsx")).toContain(
      '<AccountDataStrip locale={locale} route="deletion" />',
    );
  });

  it("is absent from the public legal documents, because they outlive the session", () => {
    /*
     * Not an omission. `SH-LEGAL-001` makes these public and the register form
     * links to them before an account exists, so "back to Ajustes" would point
     * a signed-out reader at a page they cannot open.
     */
    const source = read("src/app/[locale]/legal/[document]/page.tsx");
    expect(source).not.toContain("AccountDataStrip");
    expect(read("src/features/legal/legal-document-view.tsx")).not.toContain("AccountDataStrip");
  });
});

describe("`R-2O-12` and ADR-114 Decision 7: the section navigates and nothing else", () => {
  it("renders no control that is not a link", () => {
    render(<AccountDataSection locale="pt-BR" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    // Non-vacuous: it really did render.
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  it("reads nothing and writes nothing", () => {
    /*
     * Ajustes already performs four reads before it renders. A fifth to show a
     * consent date would be paid by every visit to a page most people open for
     * something else — and the acceptance record is `2O-CONSENT-001`'s, in
     * slice 2O.5.
     */
    const source = read("src/features/account-centre/account-data-section.tsx");
    expect(source).not.toMatch(/\.from\(|\.rpc\(|createClient|requireUser|supabase/);
    expect(source).not.toMatch(/"use server"|useActionState/);
  });
});
