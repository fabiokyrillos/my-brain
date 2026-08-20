/**
 * `reviews.css` may only restyle classes the Revisões surfaces render.
 *
 * ## The defect this exists to catch, which it did not catch in time
 *
 * The review detail page was written with `<dl className="review-facts">`. That
 * name was **already taken**: `src/features/daily-cycle/entry-review.tsx`
 * renders it and `operations.css` draws it as a row of monospace pills.
 *
 * Two things went wrong at once, and only one of them was visible:
 *
 *  1. The new section inherited the pill treatment and looked like debug output
 *     — caught by looking at a screenshot, not by any test.
 *  2. **`reviews.css` loads after `operations.css`, so the new rules silently
 *     restyled the entry review's own facts** — on `/app/inbox/[entryId]`, a
 *     page this work never touched and never rendered. Nothing failed. Nothing
 *     would have failed until somebody opened that page and noticed.
 *
 * A class name is an interface. This asserts that `reviews.css` claims only the
 * names its own surfaces render, so taking one that belongs elsewhere fails the
 * build instead of quietly redecorating another page.
 *
 * ## Why the check is "rendered by a reviews surface" rather than a prefix
 *
 * A prefix rule would be easier and wrong: the sheet legitimately restyles
 * `.day-review-page` and `.review-buttons`, which are rendered by the day review
 * and by `ReviewButton` and which this redesign deliberately supersedes. The
 * question is not what a class is called, it is **who renders it** — so the
 * corpus is the markup, and a class is admissible exactly when every file that
 * renders it is a reviews surface.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO = process.cwd();

/** The surfaces `reviews.css` is allowed to dress. */
const OWNED = [
  "src/app/[locale]/app/reviews",
  "src/features/reviews",
  "src/features/day-review",
  // `ReviewButton` lives here and is rendered only by the two reviews surfaces.
  "src/features/agent/forms.tsx",
];

function walk(target: string): string[] {
  const absolute = path.resolve(REPO, target);
  if (statSync(absolute).isFile()) return [absolute];
  return readdirSync(absolute).flatMap((entry) => {
    const next = path.join(absolute, entry);
    return statSync(next).isDirectory() ? walk(next) : /\.tsx?$/.test(entry) ? [next] : [];
  });
}

function sourcesUnder(roots: readonly string[]): string[] {
  return roots.flatMap((root) => walk(root)).filter((file) => !/\.test\.tsx?$/.test(file));
}

/** Every `className="…"` / `className={\`…\`}` token in a file. */
function classNamesIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    for (const token of (match[1] ?? match[2] ?? "").split(/\s+/)) {
      if (/^[a-z][a-z0-9-]*$/.test(token)) found.add(token);
    }
  }
  return found;
}

const REVIEWS_CSS = readFileSync(path.join(REPO, "src/app/reviews.css"), "utf8");

/** The classes `reviews.css` writes rules for. */
const STYLED = new Set(
  [...REVIEWS_CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1]),
);

const OWNED_FILES = sourcesUnder(OWNED);
const OWNED_CLASSES = new Set(OWNED_FILES.flatMap((file) => [...classNamesIn(readFileSync(file, "utf8"))]));

/** Every other component in the product, and what it renders. */
const FOREIGN_FILES = sourcesUnder(["src/app", "src/features"]).filter(
  (file) => !OWNED_FILES.includes(file),
);

describe("the guard has a corpus", () => {
  it("reads rules out of reviews.css", () => {
    // Non-vacuity: with nothing parsed, every check below passes over nothing.
    expect(STYLED.size, "no class was parsed from reviews.css").toBeGreaterThan(20);
  });

  it("reads markup out of the reviews surfaces and out of the rest of the product", () => {
    expect(OWNED_CLASSES.size, "no class was parsed from the reviews surfaces").toBeGreaterThan(20);
    expect(FOREIGN_FILES.length, "no other component was found to compare against").toBeGreaterThan(50);
  });
});

describe("reviews.css claims no class name that belongs to another surface", () => {
  it("styles nothing rendered outside the reviews surfaces", () => {
    const trespass: string[] = [];
    for (const file of FOREIGN_FILES) {
      const rendered = classNamesIn(readFileSync(file, "utf8"));
      for (const token of rendered) {
        // A class the reviews surfaces ALSO render is shared on purpose —
        // `status-badge` and `eyebrow` are the product's own vocabulary, and
        // `reviews.css` does not restyle them. Only a class this sheet styles
        // and the reviews surfaces never render is a name taken from elsewhere.
        if (STYLED.has(token) && !OWNED_CLASSES.has(token)) {
          trespass.push(`${path.relative(REPO, file).replace(/\\/g, "/")} renders .${token}`);
        }
      }
    }
    expect(
      [...new Set(trespass)].sort(),
      "reviews.css styles class names rendered by surfaces it does not own. It loads "
        + "late, so its rules WIN there — which is how `.review-facts` silently "
        + "restyled the entry review on /app/inbox/[entryId]. Rename the class.",
    ).toEqual([]);
  });

  it("detects a planted trespass, so the scan is not blind", () => {
    /*
      Two-sided control, planted with **the class that actually caused this**:
      `review-facts` is rendered by `entry-review.tsx` and by nothing under the
      reviews surfaces, so a `reviews.css` that styled it must be reported.

      Asserted first that the corpus really contains it — a control planted with
      a name nobody renders cannot fire, and would report the scan as working
      while proving nothing. That is exactly what the first draft of this test
      did.
    */
    const foreign = FOREIGN_FILES.map((file) => classNamesIn(readFileSync(file, "utf8")));
    expect(
      foreign.some((rendered) => rendered.has("review-facts")),
      "no foreign component renders .review-facts, so this control proves nothing",
    ).toBe(true);
    expect(OWNED_CLASSES.has("review-facts"), "a reviews surface still renders .review-facts").toBe(false);

    const planted = new Set([...STYLED, "review-facts"]);
    const wouldFire = foreign.some((rendered) =>
      [...rendered].some((token) => planted.has(token) && !OWNED_CLASSES.has(token)));
    expect(wouldFire, "the scan cannot see a class rendered outside the reviews surfaces").toBe(true);

    // …and without the plant it stays silent, so the check above is not matching
    // everything.
    const quiet = foreign.some((rendered) =>
      [...rendered].some((token) => STYLED.has(token) && !OWNED_CLASSES.has(token)));
    expect(quiet, "the scan fires on the real sheet, which should be clean").toBe(false);
  });
});
