/**
 * `2J-ACCESS-001`'s honesty guard.
 *
 * `e2e/accessibility.spec.ts` cannot navigate to the palette, search or Library:
 * those routes are behind `src/proxy.ts` and CI has no Supabase session. So it
 * mirrors their DOM, exactly as `e2e/layout-contracts.spec.ts` has done since
 * Slice A — and inherits that approach's one real cost: **a mirror can drift.**
 *
 * A drifted mirror is worse than no lane at all. It reports green about markup
 * the product no longer emits, which is the "harness that tests a different
 * artifact" failure this repository has now recorded seven times.
 *
 * This guard bounds that cost by re-deriving every load-bearing attribute from
 * the **component source** on each run. It deliberately does not compare whole
 * strings — that would fail on every cosmetic edit and be disabled within a
 * month. It pins the attributes the accessibility assertions actually depend
 * on, so dropping `aria-modal` from the palette breaks this test rather than
 * silently invalidating a passing lane.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

const PALETTE = "src/features/palette/command-palette.tsx";
const SEARCH = "src/features/search/search-surface.tsx";
const LIBRARY = "src/app/[locale]/app/library/page.tsx";
const MIRROR = "e2e/accessibility.spec.ts";

describe("2J-ACCESS-001: the accessibility mirror tracks the components it claims to represent", () => {
  const mirror = read(MIRROR);

  it("pins the palette's dialog semantics to the component's own", () => {
    const palette = read(PALETTE);
    // Each of these is asserted by the lane. If the component stops emitting
    // one, the lane would keep passing against markup that no longer exists.
    for (const attribute of [
      'role="dialog"',
      'aria-modal="true"',
      'role="combobox"',
      'aria-autocomplete="list"',
      'role="listbox"',
      'role="option"',
      'aria-live="polite"',
    ]) {
      const inSource = palette.includes(attribute) || palette.includes(attribute.replace(/"/g, "{\""));
      expect(inSource, `${PALETTE} no longer emits ${attribute}`).toBe(true);
      expect(mirror.includes(attribute), `${MIRROR} no longer mirrors ${attribute}`).toBe(true);
    }
  });

  it("pins the palette's focusable class names, which the tab-order assertion walks", () => {
    const palette = read(PALETTE);
    for (const className of ["palette-trigger", "palette-input", "palette-close", "palette-option"]) {
      expect(palette, `${PALETTE} no longer uses .${className}`).toContain(className);
      expect(mirror, `${MIRROR} no longer mirrors .${className}`).toContain(className);
    }
  });

  it("pins search's landmark and its labelled controls", () => {
    const search = read(SEARCH);
    for (const token of ['role="search"', "search-input", "search-sensitive", 'aria-live="polite"']) {
      expect(search, `${SEARCH} no longer emits ${token}`).toContain(token);
      expect(mirror, `${MIRROR} no longer mirrors ${token}`).toContain(token);
    }
    // Every `<label>` in the real surface resolves to a control. The mirror is
    // only useful if it carries the same property, so both are checked.
    expect(search).toContain("htmlFor");
    expect(mirror).toContain("for=");
  });

  it("pins Library's card structure, which the touch-target assertion measures", () => {
    const library = read(LIBRARY);
    for (const className of ["library-card", "library-grid", "library-card-name"]) {
      expect(library, `${LIBRARY} no longer uses .${className}`).toContain(className);
      expect(mirror, `${MIRROR} no longer mirrors .${className}`).toContain(className);
    }
  });

  it("states its own limits, so a green lane is never read as more than it is", () => {
    // The three sentences below are the difference between an honest partial
    // and the over-claim `2I-CLOSE-002` exists to prevent. They are asserted
    // because a future edit that quietly deletes them would turn this lane into
    // a claim nobody checked.
    expect(mirror).toMatch(/NOT PROVEN HERE: hydrated interactivity/);
    expect(mirror).toMatch(/NOT PROVEN ANYWHERE: a real screen-reader session/);
    expect(mirror).toMatch(/never be cited as discharging it/);
  });

  it("keeps axe-core a declared dependency rather than a borrowed transitive one", () => {
    const manifest = JSON.parse(read("package.json")) as {
      devDependencies?: Record<string, string>;
    };
    expect(
      manifest.devDependencies?.["axe-core"],
      "axe-core must be declared: a scanner that arrives by someone else's hoisting can vanish on an unrelated update",
    ).toBeTruthy();
  });

  it("keeps the lane wired into CI, because a spec nothing runs proves nothing", () => {
    const workflow = read(".github/workflows/ci.yml");
    expect(workflow).toContain("e2e/accessibility.spec.ts");
    // Both viewports, or the mobile-only touch-target contract never executes.
    const step = workflow.slice(workflow.indexOf("e2e/accessibility.spec.ts"));
    expect(step.slice(0, 200)).toContain("--project=desktop");
    expect(step.slice(0, 200)).toContain("--project=mobile");
  });
});
