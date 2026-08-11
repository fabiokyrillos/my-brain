/**
 * `2M-ACCESS-006` — the calendar's browser lane is a **mirror**, and this is
 * what bounds the cost of that.
 *
 * `e2e/calendar.spec.ts` composes its page from hand-written markup because the
 * app's routes need a Supabase session CI does not have. The precedent is
 * `accessibility-mirror-guard.test.ts`, and so is the danger: a mirror that
 * drifts from the component keeps passing while proving nothing about what
 * ships.
 *
 * So every load-bearing class and attribute is **re-derived from the component
 * source on every run** and asserted to appear in the spec. A component that
 * renames `.calendar-reschedule`, drops `data-commitment` or stops rendering the
 * lane in text breaks this guard rather than silently invalidating the lane.
 *
 * It is deliberately one-directional and shallow: it proves the spec still
 * *names* what the components emit. It cannot prove the spec's markup is
 * arranged the way React arranges it, and it does not claim to — that is the
 * residual cost, recorded rather than papered over.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(REPO, path), "utf8");

const SPEC = read("e2e/calendar.spec.ts");
const ITEM = read("src/features/calendar/calendar-item.tsx");
const RESCHEDULE = read("src/features/calendar/calendar-reschedule.tsx");
const VIEW = read("src/features/calendar/calendar-view.tsx");
const CSS = read("src/app/calendar.css");

/** Every `className="…"` and `class="…"` literal in a source. */
function classNames(source: string): readonly string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/className=\{?["'`]([^"'`{}]+)["'`]/g)) {
    for (const token of match[1].split(/\s+/)) if (token.startsWith("calendar-")) found.add(token);
  }
  return [...found];
}

describe("2M-ACCESS-006: the calendar mirror names what the components emit", () => {
  it("extracts a non-empty class census, so this file cannot pass vacuously", () => {
    const census = [...classNames(ITEM), ...classNames(RESCHEDULE), ...classNames(VIEW)];
    expect(census.length, "no calendar class was extracted from any component").toBeGreaterThan(5);
  });

  it("names every calendar class the item and the reschedule frame render", () => {
    const missing = [...classNames(ITEM), ...classNames(RESCHEDULE)]
      .filter((token) => !SPEC.includes(token));
    expect(missing, "e2e/calendar.spec.ts does not name these rendered classes").toEqual([]);
  });

  it("carries the data attributes the lane asserts on", () => {
    for (const attribute of ["data-lane", "data-commitment", "data-elapsed"]) {
      expect(ITEM, `the item stopped emitting ${attribute}`).toContain(attribute);
      expect(SPEC, `the lane stopped asserting ${attribute}`).toContain(attribute);
    }
  });

  it("keeps the disclosure a real <details> in both the component and the mirror", () => {
    // The whole keyboard argument rests on this element. A component that
    // replaced it with a button plus `aria-expanded` would need a different
    // journey, and this line is what forces that to be noticed.
    expect(RESCHEDULE).toContain("<details");
    expect(RESCHEDULE).toContain("<summary");
    expect(SPEC).toContain("details.calendar-reschedule");
  });

  it("keeps the stylesheet the lane reads in the lane's own list", () => {
    // A stylesheet the spec forgets to load turns every computed-style
    // assertion into a measurement of the browser default.
    expect(SPEC).toContain('"calendar.css"');
    expect(CSS).toContain(".calendar-reschedule-summary");
  });

  it("asserts the unavailable sentence the component actually renders", () => {
    expect(RESCHEDULE).toContain("copy.unavailable");
    expect(SPEC).toContain("calendar-reschedule-unavailable");
  });

  it("carries the same words the typed copy record does, in both locales", () => {
    /*
     * The lane restates the copy because Playwright's transpiler does not
     * resolve the `@/` alias, so the strings are duplicated — and a duplicated
     * string is a string that drifts. Extracted here from `copy.ts` itself, so
     * a copy change fails this guard rather than turning every locale assertion
     * in the lane into a comparison against a sentence nobody renders.
     *
     * Only the four the lane asserts on. A guard demanding every string would
     * be asserting that the lane covers the whole surface, which it does not
     * claim to.
     */
    const copy = read("src/features/calendar/copy.ts");
    const values = (key: string) => [...copy.matchAll(new RegExp(`^\\s*${key}: "([^"]+)",`, "gm"))]
      .map((match) => match[1]);

    const extracted = [
      ...values("title"),
      ...values("empty"),
      ...values("summary"),
      ...values("unavailable"),
    ];
    expect(extracted.length, "no copy string was extracted").toBeGreaterThan(4);

    const missing = [
      ...values("empty"),
      ...values("unavailable"),
    ].filter((sentence) => !SPEC.includes(sentence));
    expect(missing, "e2e/calendar.spec.ts restates copy that no longer exists").toEqual([]);
  });

  it("states, in the lane itself, what it cannot prove", () => {
    // The residual. A lane that did not say "an emulated viewport is not a
    // device" would be cited as hardware evidence within one phase — OD-2M-5
    // makes that the owner's proof and nobody else's.
    expect(SPEC).toMatch(/emulated viewport is a viewport, not a device/i);
    expect(SPEC).toMatch(/2M-ACCESS-007/);
  });
});
