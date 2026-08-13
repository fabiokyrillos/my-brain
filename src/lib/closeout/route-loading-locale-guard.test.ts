/**
 * `2N-ACCESS-003`, `2N-ACCESS-005`, ADR-112 Decision 7a — the loading state's
 * locale mechanism, held together across three files that cannot see each other.
 *
 * The announcement is chosen by CSS, which means the proof is split across a
 * component (renders both), a stylesheet (hides one) and a layout (declares
 * `lang`). Each of the three type-checks and tests perfectly well while the
 * mechanism is broken, because none of them is wrong on its own — the failure
 * mode is a **missing pairing**, and jsdom cannot see it because it applies no
 * external stylesheet.
 *
 * So this asserts the pairing itself, structurally. `e2e/phase-2n-foundations.spec.ts`
 * then proves it rendering in a real browser, which is the only place the
 * accessibility tree is real.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { locales } from "@/lib/preferences";

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");
/**
 * Source with comments removed, the `sensitivity-convergence.test.ts` helper.
 *
 * Needed here for a reason worth naming: `loading.tsx`'s header explains that
 * `await headers()` would make the fallback dynamic, so a guard searching the
 * raw file for `await` matches the sentence forbidding it. A guard that fails on
 * a correct file gets weakened by the next person to touch it.
 */
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const LOADING = "src/app/[locale]/app/loading.tsx";
const STYLESHEET = "src/app/navigation-performance.css";
const SHELL = "src/features/shell/app-shell.tsx";
const LAYOUT = "src/app/[locale]/app/layout.tsx";

describe("2N-ACCESS-005: every locale the product has is selectable", () => {
  /*
   * The stylesheet with its comments removed, for the same reason `code()`
   * exists above: the comment beside these rules *quotes the selector form it
   * bans*, so a guard reading the raw file would fail on a correct stylesheet
   * and get weakened by the next person to touch it. Rules are matched against
   * the stripped text; only the `:lang()` containment checks, which cannot
   * collide with prose, read either.
   */
  const css = read(STYLESHEET).replace(/\/\*[\s\S]*?\*\//g, "");

  it("has a rule hiding every OTHER locale, for each locale", () => {
    /*
     * For two locales that is two rules. The assertion is generated from
     * `locales` rather than written out, so adding a third locale fails here
     * instead of silently announcing two languages at once on the new one.
     */
    for (const shown of locales) {
      for (const hidden of locales) {
        if (shown === hidden) continue;
        const rule = `.route-loading [data-route-loading-locale="${hidden}"]:lang(${shown})`;
        expect(css, `missing rule to hide ${hidden} when the document is ${shown}`).toContain(rule);
      }
    }
  });

  it("selects on the NEAREST `lang`, not on any ancestor carrying one", () => {
    /*
     * The defect this guard could not previously see, and the reason it is
     * phrased as a ban rather than as a preference.
     *
     * The rules used to read `[lang="pt-BR"] .route-loading [data-…="en"]`. A
     * descendant combinator matches an ancestor at ANY depth, and there are
     * always two `lang` declarations above these spans: `src/app/layout.tsx`
     * hardcodes `lang="pt-BR"` on `<html>` because it sits above `[locale]`, and
     * `.app-frame` carries the real one. On `en` they disagree, so BOTH rules
     * matched and BOTH announcements were hidden — a silent loading state, which
     * is precisely what the "hide what does not match" direction exists to
     * prevent. It reached production because every unit test passes: jsdom
     * applies no external stylesheet, so nothing below a real browser evaluates
     * this cascade.
     *
     * `:lang()` resolves against the nearest declaration, so the outer `<html>`
     * cannot participate. Anyone reintroducing the ancestor form fails here.
     */
    expect(
      css.match(/\[lang="[^"]*"\]\s+\.route-loading/g),
      "an ancestor [lang=…] selector is back; two disagreeing `lang` ancestors hide every announcement",
    ).toBeNull();
  });

  it("hides what does not match rather than showing what does", () => {
    /*
     * The failure direction, asserted as a property of the rule set.
     *
     * "Hide the non-matching" degrades to announcing BOTH when the stylesheet
     * fails to load or `lang` is missing. "Show the matching" would degrade to
     * announcing NOTHING — a silent loading state for a screen reader user,
     * which is worse than a redundant one and is invisible in every test that
     * does not run a real browser.
     */
    for (const locale of locales) {
      const selfRule = `.route-loading [data-route-loading-locale="${locale}"]:lang(${locale})`;
      expect(css, `${locale} must not depend on a rule to become visible`).not.toContain(selfRule);
    }
    const rules = css.match(/\.route-loading \[data-route-loading-locale="[^"]+"\]:lang\([^)]+\)\{[^}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(rule).toContain("display:none");
  });

  it("marks the announcements with the attribute the stylesheet selects", () => {
    // The pairing itself: the component's attribute name and the stylesheet's
    // must be the same string, and neither file imports the other.
    expect(read(LOADING)).toContain("data-route-loading-locale");
  });

  it("declares `lang` on an ancestor of the fallback, from the locale", () => {
    /*
     * Without this the selectors above match nothing and both announcements are
     * read out. `app-shell.tsx` is the first element below the root layout that
     * knows the locale — `src/app/layout.tsx` sits above `[locale]` and hardcodes
     * `lang="pt-BR"`, which is the reason this is needed at all.
     */
    expect(read(SHELL)).toMatch(/className="app-frame" lang=\{locale\}/);
  });

  it("keeps the fallback propless, so nobody 'fixes' it by adding params", () => {
    /*
     * An App Router `loading.tsx` receives no parameters — the local Next.js
     * docs say so outright. A future edit that gave it a signature would be
     * building on an API that does not exist, and the symptom would be an
     * undefined locale rather than a type error, because the file is only ever
     * called by the framework.
     */
    const source = code(LOADING);
    expect(source).toMatch(/export default function AuthenticatedLoading\(\)/);
    expect(source).not.toMatch(/AuthenticatedLoading\(\s*\{/);
  });
});

describe("2N-SEC-002: the loading fallback cannot outrun the authenticated gate", () => {
  it("reads no data, holds no client and awaits nothing", () => {
    /*
     * The defect this must not reintroduce: a fallback that renders before the
     * user is validated ships the shell under a 200 and turns a server refusal
     * into a client-side navigation. `loading.tsx` creates the Suspense boundary
     * the gate sits above, so anything it awaited would run for a request that
     * has not been authorised yet.
     */
    const source = code(LOADING);
    expect(source).not.toMatch(/\bawait\b/);
    expect(source).not.toMatch(/createClient|requireUser|headers\(\)|cookies\(\)/);
    expect(source).not.toMatch(/"use client"/);
  });

  it("keeps the gate above the boundary, where SH-LIFECYCLE-008 put it", () => {
    // Paired with `server-side-gate-guard.test.ts` rather than replacing it:
    // that guard owns the rule, this asserts the specific layout this slice's
    // four routes stream through still carries it.
    expect(read(LAYOUT)).toMatch(/await requireUser\(locale\)/);
  });
});
