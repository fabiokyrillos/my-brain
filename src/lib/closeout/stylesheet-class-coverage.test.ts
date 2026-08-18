import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A rendered element with no styled class at all — slice 2O.7.
 *
 * ## What this exists because of
 *
 * §85 recorded the owner reporting two surfaces that "looked like raw HTML
 * forms". They were. `.notification-settings`, `.push-controls`,
 * `.push-preferences`, `.settings-section` and **every** `.byok-*` class had no
 * rule in any of the twenty-six stylesheets, so both surfaces were drawn
 * entirely by the user-agent default — and every symptom the owner listed
 * (checkboxes touching their labels, time fields with no shape, a save button
 * with no more weight than the sentence beside it) was one consequence of that
 * single fact.
 *
 * Nothing catches this. TypeScript does not know what a class is, the linter
 * does not read CSS, the component tests assert on class names rather than on
 * rules, and the Playwright fixture lanes inline the stylesheets by hand — so a
 * class that matches nothing renders, passes and looks finished in a diff.
 *
 * ## The question this asks, and the one it deliberately does not
 *
 * **Not** *"does every class have a rule?"* — 61 classes do not, and most are
 * harmless: `credential-panel.tsx` renders `className="field-hint byok-hint"`
 * where the second is styled and the first is a naming convention, and a
 * wrapper `<div>` needing no styling is not a defect.
 *
 * The question is *"is there an element whose **every** class matches nothing?"*
 * That is the precise shape of what the owner saw: an element the author
 * believed was styled, drawn by the browser's defaults.
 *
 * ## Why a ratchet rather than a green build
 *
 * Forty-nine elements are in that state today, across twenty-odd surfaces and
 * six phases. Styling them is a redesign, and slice 2O.7 is mobile and
 * accessibility — the owner's instruction for the surfaces §85 touched was
 * explicit: audit the result, correct proven defects, **do not redesign again by
 * preference**. Measured on the rendered page, these forty-nine pass contrast,
 * reflow and target size; they are plain, not broken.
 *
 * So the census is recorded with a destination and the count may not grow. A
 * new unstyled element fails here, on the commit that adds it, which is the
 * only moment it is cheap to fix. The baseline is a debt this repository can
 * see rather than one it rediscovers when someone opens the page.
 */

const REPO = process.cwd();
const APP_CSS = join(REPO, "src/app");

/**
 * The three Tailwind utilities this product actually uses, all in `layout.tsx`.
 *
 * Tailwind generates them at build time, so they legitimately match nothing in
 * `src/app/*.css`. Listed rather than pattern-matched: a grammar for "looks
 * like a Tailwind utility" would also swallow `min-h-full`-shaped product
 * classes, and the list is three items long because this codebase writes its
 * own CSS. The liveness check below fails if it ever stops being true.
 */
const TAILWIND_UTILITIES = ["min-h-full", "flex", "flex-col", "h-full", "antialiased"] as const;

function stylesheets(): string {
  return readdirSync(APP_CSS)
    .filter((name) => name.endsWith(".css"))
    .map((name) => readFileSync(join(APP_CSS, name), "utf8"))
    .join("\n");
}

/** Every class name any stylesheet mentions in a selector. */
function definedClasses(): ReadonlySet<string> {
  return new Set([...stylesheets().matchAll(/\.(-?[a-zA-Z_][a-zA-Z0-9_-]*)/g)].map((match) => match[1]));
}

function componentSources(): { path: string; source: string }[] {
  const files: { path: string; source: string }[] = [];
  const walk = (absolute: string, relative: string) => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const nextAbsolute = join(absolute, entry.name);
      const nextRelative = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(nextAbsolute, nextRelative);
        continue;
      }
      if (!entry.name.endsWith(".tsx")) continue;
      // A fixture's markup is not rendered to anyone, and counting it would let
      // a component acquire a defect by being tested.
      if (entry.name.endsWith(".test.tsx")) continue;
      files.push({ path: nextRelative, source: readFileSync(nextAbsolute, "utf8") });
    }
  };
  walk(join(REPO, "src"), "src");
  return files;
}

/**
 * Every `className` with a statically readable value, classified.
 *
 * Comments are stripped first — this file's own prose names half a dozen
 * classes, and `credential-panel.tsx` documents the reveal control it
 * deliberately does not have. A census that counted prose would report defects
 * in the explanations of why there are none.
 *
 * Only literal and untemplated values are read. `className={`x ${y}`}` is
 * skipped rather than guessed at, and skipping is the safe direction: this
 * under-reports and never invents.
 */
export function unstyledElements(source: string, defined: ReadonlySet<string>): string[] {
  const markup = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const found: string[] = [];
  for (const match of markup.matchAll(/className=(?:"([^"]*)"|\{`([^`$]*)`\})/g)) {
    const tokens = (match[1] ?? match[2] ?? "").split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    if (tokens.some((token) => defined.has(token) || (TAILWIND_UTILITIES as readonly string[]).includes(token))) {
      continue;
    }
    found.push(tokens.join(" "));
  }
  return found;
}

/**
 * The recorded debt, as of slice 2O.7, measured against `main` at `a58af08`.
 *
 * Every entry is an element drawn by the user-agent default. **Eight belong to
 * slice 2O.5's privacy block** — `privacy-census`, `privacy-retention`,
 * `privacy-withheld`, `privacy-unenforced`, `privacy-unreadable`,
 * `privacy-retained-fields`, `privacy-census-nosurface` and `privacy-consent` —
 * which is the same finding §85 made about notifications and BYOK, on a third
 * surface this phase built. It is stated here and in the acceptance record
 * rather than repaired, because repairing it is a redesign and this slice is
 * mobile and accessibility.
 *
 * **Destination: the owner**, in the 2O.7 acceptance record. Raising this
 * number requires a reason in the same commit; lowering it is always welcome
 * and the liveness check below insists the number be corrected when it happens.
 */
const RECORDED_UNSTYLED = 49;

describe("no surface is drawn entirely by the user-agent default", () => {
  const defined = definedClasses();
  const sources = componentSources();
  const census = sources.flatMap((file) =>
    unstyledElements(file.source, defined).map((classes) => `${file.path}: ${classes}`),
  );

  it("reads a real corpus and a real stylesheet, so the count below means something", () => {
    // Non-vacuity in both directions. A walk that found no components, or a
    // stylesheet parse that found no classes, would make every assertion here
    // pass over nothing — which is the failure this whole file is about.
    expect(sources.length, "no component sources were read").toBeGreaterThan(150);
    expect(defined.size, "no classes were extracted from the stylesheets").toBeGreaterThan(500);
    expect(defined.has("byok-badge"), "the stylesheet parse missed a class known to be defined").toBe(true);
  });

  it("does not grow the number of elements no stylesheet reaches", () => {
    expect(
      [...new Set(census)].length,
      `elements with no styled class at all:\n${[...new Set(census)].join("\n")}`,
    ).toBeLessThanOrEqual(RECORDED_UNSTYLED);
  });

  it("keeps the recorded number honest when it falls", () => {
    // A ceiling nobody lowers becomes a licence. When the debt is paid down the
    // constant has to follow it on the same commit, so the number in this file
    // is always the truth rather than the high-water mark.
    expect(
      [...new Set(census)].length,
      `the debt is smaller than recorded — set RECORDED_UNSTYLED to ${[...new Set(census)].length}`,
    ).toBeGreaterThanOrEqual(RECORDED_UNSTYLED);
  });

  it("still finds the eight privacy elements this slice declined to restyle", () => {
    // The named half of the census. If these are styled later, the count falls
    // and the test above says so; if they silently disappear from the scan
    // because the extractor broke, this says so first.
    const privacy = census.filter((entry) => entry.includes("privacy-section.tsx") || entry.includes("consent-section.tsx"));
    expect(privacy.length, "the privacy block's unstyled elements are no longer visible to this census").toBe(8);
  });

  describe("the planted divergences", () => {
    it("fails an element whose every class matches nothing", () => {
      const planted = unstyledElements('<div className="totally-unstyled-2o7" />', defined);
      expect(planted).toEqual(["totally-unstyled-2o7"]);
    });

    it("passes an element carrying one styled class beside an unstyled one", () => {
      // The distinction that makes this a defect census rather than a naming
      // audit: `field-hint byok-hint` is fine, because the second one styles it.
      const mixed = unstyledElements('<p className="field-hint byok-hint" />', defined);
      expect(mixed).toEqual([]);
    });

    it("passes the three Tailwind utilities the root layout uses", () => {
      expect(unstyledElements('<body className="min-h-full flex flex-col" />', defined)).toEqual([]);
    });

    it("does not count a class named only in a comment", () => {
      const commented = unstyledElements('/* className="ghost-class-2o7" */<span className="byok-badge" />', defined);
      expect(commented).toEqual([]);
    });

    it("skips an interpolated className rather than guessing at it", () => {
      // Under-reporting is the safe direction. Splitting on `${` and hoping
      // would invent classes that never render.
      expect(unstyledElements("<div className={`row ${state}`} />", defined)).toEqual([]);
    });

    it("keeps the Tailwind list honest: each entry really is absent from the stylesheets", () => {
      // If one of these ever acquires a real rule, it stops needing to be here —
      // and an entry nobody re-derives is how an exemption list starts growing.
      for (const utility of TAILWIND_UTILITIES) {
        expect(defined.has(utility), `\`${utility}\` now has a rule; remove it from TAILWIND_UTILITIES`).toBe(false);
      }
    });
  });
});
