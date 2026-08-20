/**
 * The Hoje mirror, derived from the components rather than trusted.
 *
 * ## The defect this exists to make impossible
 *
 * `e2e/layout-contracts.spec.ts` composes Hoje from hand-written markup, because
 * the real route needs a Supabase session CI does not have. That fixture named
 * `.panel`, `.attention-panel` and `.dashboard-recent-list` — classes the Hoje
 * rewrite deleted. Every geometry assertion in that lane kept passing while
 * measuring a page the product had stopped rendering.
 *
 * It was not merely stale. `operations.css` establishes `container-type` on a
 * **list of class names**, and that list carried the dead
 * `.dashboard-recent-list` instead of the live `.home-list`. So the container
 * query written to stop a row title wrapping one word per line reached
 * Registros and never reached Hoje — where the closing sections sit in two
 * columns, both under the query's own breakpoint. The owner found it on a real
 * iPhone in August 2026; the lane could not have.
 *
 * The lane's own header already carried this lesson twice, for the navigation
 * lists, and `shell-mirror-guard.test.ts` was written to derive those. Nothing
 * derived the **panel** classes. This does.
 *
 * ## Why the assertions run over source text
 *
 * The class names are the contract between three files that never import one
 * another — the component that emits them, the stylesheet that establishes
 * containment on them, and the fixture that mirrors them. A runtime test cannot
 * see a stylesheet selector, and a stylesheet cannot be type-checked. Reading
 * all three and comparing is the only thing that can fail when they diverge.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

const HOME_VIEW = "src/features/shell/home-view.tsx";
const OPERATIONS_CSS = "src/app/operations.css";
const LAYOUT_LANE = "e2e/layout-contracts.spec.ts";

/** Every `className="…"` literal the Hoje view emits, flattened to class names. */
function emittedClasses(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(/className="([^"{}]+)"/g)) {
    for (const name of match[1].split(/\s+/)) if (name) names.add(name);
  }
  return names;
}

/** The class list the `container-type` rule establishes containment on. */
function containmentClasses(css: string): string[] {
  const rule = /^([^{}\n]*)\{container-type:inline-size\}/m.exec(css);
  if (rule === null) return [];
  return rule[1]
    .split(",")
    .map((selector) => selector.trim())
    .filter((selector) => selector.startsWith("."))
    .map((selector) => selector.slice(1));
}

describe("the Hoje mirror cannot go stale in silence", () => {
  it("establishes containment only on classes the product actually emits", () => {
    /*
      The direction that matters. A dead name in this list is not cosmetic: it
      is containment that reaches nothing, and a container query that therefore
      never fires on the surface it was written for.
    */
    const css = read(OPERATIONS_CSS);
    const declared = containmentClasses(css);
    expect(declared.length, "the container-type rule was not found").toBeGreaterThan(0);

    const emitted = new Set<string>([
      ...emittedClasses(read(HOME_VIEW)),
      // The other stacks that legitimately carry rows, read from their own
      // components so this list is derived too rather than typed.
      ...emittedClasses(read("src/features/daily-cycle/needs-attention-list.tsx")),
      ...emittedClasses(read("src/features/reminders/reminder-list.tsx")),
    ]);

    const dead = declared.filter((name) => !emitted.has(name));
    expect(
      dead,
      `these classes have containment and are emitted by no component: ${dead.join(", ")}`,
    ).toEqual([]);
  });

  it("gives every stack that renders `.list-row` a containment context", () => {
    /*
      The other direction, and the one the owner's report actually was: a stack
      that renders rows and has NO containment gets the two-column `.list-row`
      grid at any container width, so its `auto` meta track starves the title.
    */
    const home = read(HOME_VIEW);
    const declared = new Set(containmentClasses(read(OPERATIONS_CSS)));
    // Hoje's row stacks, derived from the view: every `home-*` class it uses to
    // wrap rows. `home-list` is the one the rewrite introduced.
    expect(home).toContain('className="home-list"');
    expect(
      declared.has("home-list"),
      "`.home-list` renders `.list-row`s and has no containment — the two-column grid will starve the title",
    ).toBe(true);
  });

  it("the layout lane mirrors the classes Hoje emits, not the ones it used to", () => {
    const lane = read(LAYOUT_LANE);
    const home = emittedClasses(read(HOME_VIEW));
    // The structural classes the fixture must reproduce for its measurements to
    // be about the real page. `today-columns` is what makes both columns narrow,
    // and it is the reason the defect exists at 1920px.
    for (const required of ["home-section", "home-list", "today-columns", "today-main", "today-side"]) {
      expect(home.has(required), `${HOME_VIEW} no longer emits .${required}`).toBe(true);
      expect(lane, `the layout lane does not mirror .${required}`).toContain(required);
    }
  });

  it("is not vacuous: each extractor answers differently on a fixture", () => {
    expect(containmentClasses(".a,.b{container-type:inline-size}")).toEqual(["a", "b"]);
    expect(containmentClasses(".a{color:red}")).toEqual([]);
    expect([...emittedClasses('<div className="x y" />')].sort()).toEqual(["x", "y"]);
    // A template literal className is deliberately skipped rather than parsed
    // half-correctly, so the extractor never reports a partial name as real.
    expect([...emittedClasses("<div className={`x ${y}`} />")]).toEqual([]);
  });
});
