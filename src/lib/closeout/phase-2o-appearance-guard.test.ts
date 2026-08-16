import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  APPEARANCE_ATTRIBUTE,
  APPEARANCE_SCRIPT,
  APPEARANCE_STORAGE_KEY,
} from "@/features/appearance/contracts";

/**
 * `2O-PREF-014` and `2O-PREF-015` — the halves that live outside TypeScript.
 *
 * `appearance.test.ts` proves what the script *does*, by executing it. This
 * proves the three things around it that no unit test can see:
 *
 *  1. **The stylesheet still resolves the choice in both directions.** The
 *     control writes an attribute and the CSS decides what that means; either
 *     half is worthless alone, and ADR-114 shipped the CSS with nothing writing
 *     the attribute for months precisely because nobody was checking the pair.
 *  2. **The script is mounted where it runs before paint**, with the hydration
 *     suppression it needs.
 *  3. **The CSP did not move.** `R-2O-27` makes that a stop condition.
 */

const REPO = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(join(REPO, path), "utf8");

/** Comments are stripped so an explanation of a selector never counts as one. */
const tokens = read("src/app/tokens.css").replace(/\/\*[\s\S]*?\*\//g, "");

describe("`2O-PREF-015`: an explicit choice beats `prefers-color-scheme` in both directions", () => {
  it("dark chosen on a light machine: an unqualified explicit selector exists", () => {
    /*
     * `:root[data-theme="dark"]` sits outside any media query, so it applies
     * whatever the machine says. Without it, choosing dark on a light machine
     * would do nothing at all.
     */
    expect(tokens).toMatch(/:root\[data-theme="dark"\]\s*\{/);
    const outsideMedia = tokens.split("@media")[0];
    expect(
      outsideMedia,
      "the explicit dark block moved inside a media query — the choice no longer wins",
    ).toMatch(/:root\[data-theme="dark"\]/);
  });

  it("light chosen on a dark machine: the media block yields to the attribute", () => {
    /*
     * The qualifier is the whole mechanism, and it is one `:not()` away from
     * being silently wrong: `@media (prefers-color-scheme: dark) { :root { … } }`
     * would override an explicit light choice, and the only symptom would be a
     * user on a dark phone unable to get a light page.
     */
    const darkMedia = tokens.slice(tokens.indexOf("prefers-color-scheme: dark"));
    expect(darkMedia.length, "no dark media block at all").toBeGreaterThan(200);
    expect(
      darkMedia,
      "the dark media block is unqualified — an explicit light choice loses",
    ).toMatch(/:root:not\(\[data-theme="light"\]\)/);
  });

  it("the machine decides when there is no attribute, which is what `system` means", () => {
    // `system` removes the attribute, so `:root:not([data-theme="light"])`
    // matches and `:root[data-theme="dark"]` does not. Both halves must exist
    // for that sentence to be true, and both are asserted above; this records
    // that the product ships **no** third selector that would break it.
    expect(tokens).not.toMatch(/\[data-theme="system"\]/);
    expect(tokens).not.toMatch(/\[data-theme="auto"\]/);
  });
});

describe("`2O-PREF-014`: the script runs before paint, and only there", () => {
  /*
   * Comments stripped, and it is not a nicety: the explanation above the root
   * layout's element says why React would otherwise see an attribute on
   * `<html>`, and the first version of this guard found *that* `<html>` instead
   * of the element. It failed rather than passed, which is the safer direction
   * of the mistake this repository keeps making — a check that can read its own
   * subject's commentary is reading the wrong thing either way.
   */
  const layout = read("src/app/layout.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  it("is inlined in `<head>` of the root layout", () => {
    expect(layout).toContain("APPEARANCE_SCRIPT");
    expect(layout).toMatch(/<head>[\s\S]*dangerouslySetInnerHTML[\s\S]*<\/head>/);
    // Before `<body>`, which is what "before first paint" rests on.
    expect(layout.indexOf("<head>")).toBeLessThan(layout.indexOf("<body"));
  });

  it("declares the hydration suppression the attribute needs", () => {
    /*
     * Without it React treats the script's attribute as a mismatch and recovers
     * by client-rendering from the nearest boundary — which discards the DOM the
     * script corrected and produces exactly the flash this prevents.
     */
    const html = layout.slice(layout.indexOf("<html"), layout.indexOf(">", layout.indexOf("<html")));
    expect(html).toContain("suppressHydrationWarning");
  });

  it("ships no `data-theme` on the server, so the machine decides by default", () => {
    // A server-rendered `data-theme="light"` — which the framework guide's own
    // example uses — would make every first paint light for a reader whose
    // machine is dark and who has chosen nothing.
    const html = layout.slice(layout.indexOf("<html"), layout.indexOf("<body"));
    expect(html).not.toContain(APPEARANCE_ATTRIBUTE);
  });
});

describe("`R-2O-27`: the CSP did not move, and it did not need to", () => {
  const config = read("next.config.ts");

  it("still carries `'unsafe-inline'` in `script-src`, which is why no nonce exists", () => {
    expect(config).toMatch(/const script = \[[^\]]*'unsafe-inline'/);
    expect(config).toContain("script-src ${script.join(\" \")}");
  });

  it("gained no nonce, no hash and no new source for this slice", () => {
    expect(config).not.toMatch(/nonce-/);
    expect(config).not.toMatch(/sha256-/);
    // The header shape `csp.test.ts` holds is what a change would break; this is
    // the narrower statement that nothing was added *for the appearance script*.
    expect(config).not.toContain("appearance");
  });
});

describe("`T-16`: the first `localStorage` boundary this repository has had", () => {
  function sources(): readonly string[] {
    const found: string[] = [];
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(full);
      }
    };
    walk(join(REPO, "src"));
    return found;
  }

  it("is reached from exactly one feature, and every read goes through the parser", () => {
    const readers = sources().filter((path) => {
      const code = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      return /localStorage\s*\.\s*(getItem|setItem)/.test(code);
    });
    const relatives = readers.map((path) => relative(REPO, path).replace(/\\/g, "/"));
    /*
     * **Two** files, and both are the boundary itself: the contract, whose
     * `APPEARANCE_SCRIPT` reads the key before React exists, and the control,
     * whose lazy initializer reads it after. They are two implementations of one
     * rule on purpose — nothing else in the repository may become a third.
     */
    expect(
      relatives.sort(),
      "something outside `features/appearance` now touches localStorage",
    ).toEqual([
      "src/features/appearance/appearance-control.tsx",
      "src/features/appearance/contracts.ts",
    ]);
  });

  it("validates before the attribute in both implementations", () => {
    // The script's own source, and the control's initializer. Comments are
    // stripped from the control first, because this file's subject is code —
    // and a check that can pass by containing its own explanation is no check.
    expect(APPEARANCE_SCRIPT).toContain("indexOf(v)>=0");
    const control = read("src/features/appearance/appearance-control.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(control).toContain("parseAppearanceChoice(window.localStorage.getItem(");
    expect(control).not.toMatch(/setAttribute\(\s*["']data-theme/);
  });

  it("namespaces the key, and does not squat on the one every snippet reaches for", () => {
    expect(APPEARANCE_STORAGE_KEY).toContain(".");
    expect(APPEARANCE_STORAGE_KEY).not.toBe("theme");
  });
});
