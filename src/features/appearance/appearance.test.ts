import { afterEach, describe, expect, it, vi } from "vitest";

import {
  APPEARANCE_ATTRIBUTE,
  APPEARANCE_SCRIPT,
  APPEARANCE_STORAGE_KEY,
  appearanceAttributeValue,
  appearanceChoices,
  applyAppearanceChoice,
  explicitAppearanceChoices,
  parseAppearanceChoice,
  type AppearanceChoice,
} from "./contracts";

/**
 * `2O-PREF-014` and `T-16`.
 *
 * The subject of most of this file is **the shipped script's own source**, not a
 * re-implementation of it. `APPEARANCE_SCRIPT` is a string that runs in the
 * browser before React exists, so the only way to test what it actually does is
 * to execute that exact string against a document — which is what `run()` does.
 * A test that re-stated the logic in TypeScript would pass while the shipped
 * string did something else entirely, which is the failure mode this repository
 * has paid for before.
 */

/** Values that are **not** the closed set. The hostile ones are deliberate. */
const REJECTED = [
  null,
  undefined,
  "",
  "SYSTEM",
  "Light",
  "dark ",
  "lightdark",
  "true",
  "0",
  "system,dark",
  '"><script>alert(1)</script>',
  "light\" onload=\"alert(1)",
  "javascript:alert(1)",
  { toString: () => "dark" },
  ["dark"],
  0,
  1,
  true,
] as const;

function run(stored: unknown) {
  const getItem = vi.spyOn(Storage.prototype, "getItem");
  if (stored instanceof Error) getItem.mockImplementation(() => { throw stored; });
  else getItem.mockImplementation(() => stored as string | null);
  new Function(APPEARANCE_SCRIPT)();
  return document.documentElement.getAttribute(APPEARANCE_ATTRIBUTE);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute(APPEARANCE_ATTRIBUTE);
});

describe("the closed set", () => {
  it("is exactly three, and `system` is one of them", () => {
    expect(appearanceChoices).toEqual(["system", "light", "dark"]);
  });

  it("derives the explicit choices rather than listing them twice", () => {
    expect(explicitAppearanceChoices).toEqual(["light", "dark"]);
    // Non-vacuity: the derivation actually removed something.
    expect(explicitAppearanceChoices.length).toBe(appearanceChoices.length - 1);
  });
});

describe("parseAppearanceChoice — the boundary `localStorage` never had", () => {
  it("accepts each of the three unchanged", () => {
    for (const choice of appearanceChoices) {
      expect(parseAppearanceChoice(choice), choice).toBe(choice);
    }
  });

  it("turns everything else into `system`, including hostile strings", () => {
    for (const value of REJECTED) {
      expect(parseAppearanceChoice(value), JSON.stringify(String(value))).toBe("system");
    }
    // Non-vacuity: the corpus is not empty and does not accidentally contain a
    // member of the closed set, which would make every assertion above trivial.
    expect(REJECTED.length).toBeGreaterThan(10);
    expect(REJECTED.some((value) => (appearanceChoices as readonly unknown[]).includes(value))).toBe(false);
  });
});

describe("the DOM rule: `system` is the absence of the attribute", () => {
  it("maps each choice to its attribute value", () => {
    expect(appearanceAttributeValue("system")).toBeNull();
    expect(appearanceAttributeValue("light")).toBe("light");
    expect(appearanceAttributeValue("dark")).toBe("dark");
  });

  it("never writes `data-theme=\"system\"`, which would work by accident", () => {
    /*
     * `:root:not([data-theme="light"])` inside the dark media block means *any*
     * non-`light` value leaves the machine in charge — so `"system"` would
     * render correctly today. It is refused anyway: the attribute names a
     * rendered theme, and a reader who finds `system` there would reasonably
     * conclude the product has a third theme.
     */
    for (const choice of appearanceChoices) {
      expect(appearanceAttributeValue(choice)).not.toBe("system");
    }
  });

  it("applies and removes on a real element", () => {
    const root = document.createElement("html");
    applyAppearanceChoice(root, "dark");
    expect(root.getAttribute(APPEARANCE_ATTRIBUTE)).toBe("dark");
    applyAppearanceChoice(root, "light");
    expect(root.getAttribute(APPEARANCE_ATTRIBUTE)).toBe("light");
    applyAppearanceChoice(root, "system");
    expect(root.hasAttribute(APPEARANCE_ATTRIBUTE)).toBe(false);
  });
});

describe("the shipped script, executed", () => {
  it("writes the attribute for an explicit choice", () => {
    expect(run("dark")).toBe("dark");
    expect(run("light")).toBe("light");
  });

  it("removes the attribute for `system`", () => {
    document.documentElement.setAttribute(APPEARANCE_ATTRIBUTE, "dark");
    expect(run("system")).toBeNull();
  });

  it("removes the attribute for every rejected value, hostile ones included", () => {
    for (const value of REJECTED) {
      document.documentElement.setAttribute(APPEARANCE_ATTRIBUTE, "dark");
      expect(run(value), JSON.stringify(String(value))).toBeNull();
    }
  });

  it("agrees with `parseAppearanceChoice` on every case, which is the real property", () => {
    /*
     * The script and the module are two implementations of one rule — one in a
     * string that runs before React, one in TypeScript that runs after. This is
     * the assertion that stops them drifting, and it is stated over the union of
     * the closed set and the rejected corpus rather than over either alone.
     */
    for (const value of [...appearanceChoices, ...REJECTED]) {
      document.documentElement.setAttribute(APPEARANCE_ATTRIBUTE, "dark");
      const scripted = run(value);
      const parsed = appearanceAttributeValue(parseAppearanceChoice(value));
      expect(scripted, JSON.stringify(String(value))).toBe(parsed);
    }
  });

  it("survives a `localStorage` that throws, which private mode really does", () => {
    document.documentElement.setAttribute(APPEARANCE_ATTRIBUTE, "dark");
    expect(() => run(new Error("SecurityError: access denied"))).not.toThrow();
    // The attribute is left exactly as the server sent it. The catch cannot
    // reach the removal, and inventing a theme from a failed read would be
    // worse than leaving the machine in charge of a page it was already
    // rendering.
    expect(document.documentElement.getAttribute(APPEARANCE_ATTRIBUTE)).toBe("dark");
  });
});

describe("the script's source, structurally", () => {
  it("reads the key at runtime and interpolates no stored value", () => {
    /*
     * `T-16`: *"the inline script must not interpolate the stored value into its
     * own source."* It structurally cannot — the read happens in the browser,
     * long after this string was built — and this asserts the shape that makes
     * that true: the value arrives from `getItem`, and the only literals in the
     * source are the key, the attribute and the closed set.
     */
    expect(APPEARANCE_SCRIPT).toContain(`var k=${JSON.stringify(APPEARANCE_STORAGE_KEY)}`);
    expect(APPEARANCE_SCRIPT).toContain("localStorage.getItem(k)");
    expect(APPEARANCE_SCRIPT).toContain(JSON.stringify(explicitAppearanceChoices));
    for (const choice of explicitAppearanceChoices) {
      // Each appears only inside the interpolated closed set, never as a bare
      // comparison a reordering could invalidate.
      expect(APPEARANCE_SCRIPT.split(`"${choice}"`).length - 1).toBe(1);
    }
  });

  it("wraps everything in a catch, because a head script that throws is silent", () => {
    expect(APPEARANCE_SCRIPT).toMatch(/^\(function\(\)\{try\{/);
    expect(APPEARANCE_SCRIPT).toMatch(/\}catch\(e\)\{\}\}\)\(\)$/);
  });

  it("does not depend on where `system` sits in the closed set", () => {
    // The bug this replaced: `indexOf(v) > 0` is correct only while `system` is
    // at index zero, and a reordering would have started writing
    // `data-theme="system"` onto the document with no test failing.
    expect(APPEARANCE_SCRIPT).not.toContain("indexOf(v)>0");
    expect(APPEARANCE_SCRIPT).not.toContain('"system"');
  });
});

describe("`2O-PREF-015` — an explicit choice beats the machine in both directions", () => {
  /*
   * The stylesheet is what actually decides this, and it already ships. What is
   * asserted here is the **contract between the script and those selectors**:
   * which attribute state each choice produces, and therefore which rule set
   * wins. `phase-2o-appearance-guard.test.ts` closes the other half by reading
   * `tokens.css` itself, so neither half can be true alone.
   */
  const cases: Array<{ choice: AppearanceChoice; attribute: string | null; wins: string }> = [
    { choice: "light", attribute: "light", wins: "the choice, on a dark machine" },
    { choice: "dark", attribute: "dark", wins: "the choice, on a light machine" },
    { choice: "system", attribute: null, wins: "prefers-color-scheme" },
  ];

  for (const { choice, attribute, wins } of cases) {
    it(`${choice}: ${wins}`, () => {
      expect(run(choice)).toBe(attribute);
    });
  }
});
