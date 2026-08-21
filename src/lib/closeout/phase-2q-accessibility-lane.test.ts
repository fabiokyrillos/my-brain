/**
 * Phase 2Q slice 2Q.4 — **controls 4 and 5: nothing was disabled, and no
 * product colour was changed.**
 *
 * ## Why these are asserted in a unit test rather than in the browser
 *
 * They are properties of the **source**, not of a render. A browser run proving
 * "the lane is green" cannot distinguish a lane made green by fixing a fixture
 * from one made green by switching off the scanner or by repainting the product
 * — and those are exactly the two ways this slice could have cheated.
 *
 * `A11Y-WEBKIT-DARK-CONTRAST` was a **lane** defect: the fixture stripped
 * Tailwind's preflight, so a `<select>` stopped inheriting its colour and fell
 * back to the UA's `FieldText` — white in Chromium, **black** in WebKit, 1.13:1
 * on the dark canvas. The product was never affected, which the online fidelity
 * proof measures against the real running app.
 *
 * The owner's decision (ADR-129) was explicit: **change no product colour,
 * token, CSS or component.** This file is where that is checkable without
 * running anything.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8").replace(/\r\n/g, "\n");

const LANE = "e2e/accessibility.spec.ts";

describe("2Q-ACCESS-004 control 4: no rule, threshold or control was switched off", () => {
  const lane = () => read(LANE);

  it("keeps axe's own configuration byte-unchanged", () => {
    /*
     * The single `rules` entry is `region`, disabled long before this phase
     * because a mirrored fixture has no page chrome to put a landmark on. A
     * second entry appearing here is a rule someone turned off, and it fails.
     */
    const source = lane();
    const at = source.indexOf("async function axeViolations");
    expect(at, "the axe harness is gone").toBeGreaterThan(-1);
    const harness = source.slice(at, source.indexOf("\n}", at));
    expect(harness).toContain('rules: { region: { enabled: false } }');
    expect([...harness.matchAll(/enabled:\s*false/g)], "a second axe rule was disabled")
      .toHaveLength(1);
    expect(harness, "the resultTypes filter moved").toContain('resultTypes: ["violations"]');
  });

  it("keeps the severity threshold at serious and critical", () => {
    const source = lane();
    const harness = source.slice(source.indexOf("async function axeViolations"));
    expect(harness, "the impact threshold was relaxed")
      .toContain('violation.impact === "serious" || violation.impact === "critical"');
  });

  it("adds no skip, no fixme and no conditional exclusion to the contrast scans", () => {
    const source = lane();
    const darkScan = source.slice(source.indexOf("ADR-114 — the same scan in dark"));
    expect(darkScan.slice(0, 1200), "the dark scan grew a skip").not.toMatch(/test\.(skip|fixme)/);
    expect(darkScan.slice(0, 1200), "a surface was excluded from the dark scan")
      .not.toMatch(/SURFACES\.filter/);
  });

  it("scans the same surface list in light and in dark", () => {
    // A slice that quietly dropped `global search` from the dark loop would go
    // green with nothing disabled. The two loops must iterate the same list.
    const source = lane();
    const loops = [...source.matchAll(/for \(const surface of (SURFACES)\)/g)].map((m) => m[1]);
    expect(loops, "the light and dark scans no longer share one surface list")
      .toEqual(["SURFACES", "SURFACES"]);
    // Bounded from the declaration, not from the file: `] as const` occurs
    // earlier for other constants, and searching from zero returned an empty
    // slice that made this assertion pass on nothing.
    const start = source.indexOf("const SURFACES = [");
    const list = source.slice(start, source.indexOf("] as const", start));
    expect(list, "the surface list could not be read").toContain("{ name:");
    for (const named of ["global search", "Work bulk bar"]) {
      expect(list, `${named} left the scanned surfaces`).toContain(`"${named}"`);
    }
  });
});

describe("2Q-ACCESS-002/-003 control 5: no product colour was changed", () => {
  /*
   * The two surfaces the false positive named are classed **baseline**, which is
   * a claim that they were *already* correct. That claim is only honest if this
   * slice changed nothing about them — so the exact declarations are pinned.
   */
  it("leaves the search filter select's rule exactly as it was", () => {
    const palette = read("src/app/palette.css");
    const rule = palette.slice(palette.indexOf(".search-filters select {"));
    expect(rule.slice(0, rule.indexOf("}")))
      .toContain("color: var(--text-primary)");
    expect(rule.slice(0, rule.indexOf("}")))
      .toContain("background: var(--background-surface)");
  });

  it("leaves the Work bulk bar's rules exactly as they were", () => {
    const operations = read("src/app/operations.css");
    expect(operations).toContain(
      ".work-bulk-bar{margin-top:16px;padding:16px;border:1px solid var(--border-default);"
        + "border-radius: var(--radius-lg);background:var(--background-canvas)}",
    );
    expect(operations).toContain(
      ".work-bulk-form select,.work-bulk-form input{min-height:44px;border:1px solid var(--border-default);"
        + "border-radius: var(--radius-md);padding:0 12px;background:var(--background-surface)}",
    );
  });

  it("leaves the dark palette's text and surface tokens exactly as they were", () => {
    /*
     * The values the false positive's ratios were computed against. If a token
     * had been nudged to make a scan pass, it would fail here — which is the
     * cheat ADR-129 forbids by name.
     */
    const tokens = read("src/app/tokens.css");
    const dark = tokens.slice(tokens.indexOf(':root[data-theme="dark"]'));
    const block = dark.slice(0, dark.indexOf("}"));
    for (const declaration of [
      "--background-canvas: #141311",
      "--text-primary: #f0ede7",
    ]) {
      expect(block, `${declaration} moved`).toContain(declaration);
    }
  });

  it("changed no product file at all in this slice's subject area", () => {
    /*
     * The broadest form of the claim, and the one that catches a change nobody
     * thought to pin: the lane's fix lives in `e2e/`, and the product's own
     * appearance mechanism is **imported** rather than copied — so the lane
     * cannot drift from it, and the product cannot have been edited to suit the
     * lane without that import breaking.
     */
    const lane = read(LANE);
    expect(lane, "the lane copied the theme script instead of importing it")
      .toContain('import { APPEARANCE_SCRIPT, APPEARANCE_STORAGE_KEY } from "../src/features/appearance/contracts"');
    expect(lane, "the lane hardcodes a theme attribute again")
      .not.toContain('<html lang="pt-BR"${themeAttribute}>');
  });

  it("restores Tailwind's preflight rule rather than inventing a colour", () => {
    // The fix, stated as itself: the fixture strips `@import "tailwindcss"`, so
    // the one preflight declaration the scan depends on is put back verbatim.
    // Inventing `select{color:var(--text-primary)}` instead would have made the
    // lane green while still measuring something the product does not do.
    const lane = read(LANE);
    expect(lane).toContain("button,input,optgroup,select,textarea{font:inherit;color:inherit}");
    expect(lane, "the preflight restoration lost its explanation")
      .toContain("FieldText");
  });
});

describe("2Q-ACCESS-005: this slice claims no screen-reader evidence", () => {
  it("says so where a reader would look for the claim", () => {
    /*
     * `2P-ACCESS-005` is **WAIVED, NOT PASSED**, and nothing in Phase 2Q earns
     * it. A lane that started running on a third engine is exactly the kind of
     * change a later reader might mistake for coverage, so the disclaimer is
     * asserted rather than trusted.
     */
    // Flattened: the disclaimer is a wrapped doc comment, and a property of the
    // sentence is not a property of its line breaks.
    const fidelity = read("e2e/online-phase-2q-accessibility-fidelity.spec.ts")
      .replace(/\s+\*\s+/g, " ");
    expect(fidelity).toContain("WAIVED, NOT PASSED");
    expect(fidelity, "the lane must not claim screen-reader evidence")
      .toContain("Nothing here is screen-reader evidence");
  });

  it("introduces no VoiceOver or screen-reader assertion anywhere in the lane", () => {
    for (const file of [LANE, "e2e/online-phase-2q-accessibility-fidelity.spec.ts"]) {
      const source = read(file).toLowerCase();
      for (const forbidden of ["voiceover", "nvda", "jaws", "screen reader passes"]) {
        expect(source.includes(forbidden) && !source.includes("not screen-reader"), `${file} claims ${forbidden}`)
          .toBe(false);
      }
    }
  });
});
