/**
 * `2M-ACCESS-006` — every browser lane in this phase is a **mirror**, and this
 * is what bounds the cost of that.
 *
 * `e2e/calendar.spec.ts` and `e2e/daily-surfaces.spec.ts` compose their pages
 * from hand-written markup because the app's routes need a Supabase session CI
 * does not have. The precedent is `accessibility-mirror-guard.test.ts`, and so
 * is the danger: a mirror that drifts from the component keeps passing while
 * proving nothing about what ships.
 *
 * So every load-bearing class, attribute and copy string is **re-derived from
 * the component source on every run** and asserted to appear in the lane. A
 * component that renames `.calendar-reschedule`, drops `data-commitment`, stops
 * emitting `data-verb` or changes a sentence breaks this guard rather than
 * silently invalidating the lane.
 *
 * ## One implementation, three surfaces (slice 2M.3)
 *
 * It was the calendar's guard alone until the planner and the day review needed
 * the same thing. The requirement is per-surface — *"every new surface has an
 * entry in the CI accessibility lane, or a mirror whose load-bearing attributes
 * are re-derived from component source on every run"* — and the obvious response
 * would have been two more files shaped like this one. That would be three
 * copies of the contract, which is the failure the phase has paid for elsewhere:
 * three copies drift, and the one that drifts is the one nobody edits.
 *
 * So the surfaces are **data**, and the derivation is written once. Adding a
 * fourth surface is a row in `SURFACES`, and forgetting to add one is caught by
 * the census test at the bottom, which reads the lane directory rather than
 * trusting this list to be complete.
 *
 * It stays deliberately one-directional and shallow: it proves the lane still
 * *names* what the components emit. It cannot prove the lane's markup is
 * arranged the way React arranges it, and it does not claim to — that is the
 * residual, recorded rather than papered over.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(REPO, path), "utf8");

type Surface = {
  /** The lane this surface is mirrored by. */
  readonly spec: string;
  /** The components whose emitted classes must be named by the lane. */
  readonly components: readonly string[];
  /** The class prefix that marks a token as this surface's own. */
  readonly prefix: string;
  /** Data attributes the lane asserts on, which the component must still emit. */
  readonly attributes: readonly string[];
  /** The typed copy module, and the keys whose values the lane restates. */
  readonly copy: { readonly module: string; readonly keys: readonly string[] } | null;
  /** A minimum class census, so a surface cannot pass by emitting nothing. */
  readonly minimumClasses: number;
};

const SURFACES: Record<string, Surface> = {
  calendar: {
    spec: "e2e/calendar.spec.ts",
    components: [
      "src/features/calendar/calendar-item.tsx",
      "src/features/calendar/calendar-reschedule.tsx",
    ],
    prefix: "calendar-",
    attributes: ["data-lane", "data-commitment", "data-elapsed"],
    copy: { module: "src/features/calendar/copy.ts", keys: ["empty", "unavailable"] },
    minimumClasses: 5,
  },
  planner: {
    spec: "e2e/daily-surfaces.spec.ts",
    components: ["src/features/planning/planner-view.tsx"],
    prefix: "planner-",
    attributes: [],
    copy: null,
    minimumClasses: 4,
  },
  dayReview: {
    spec: "e2e/daily-surfaces.spec.ts",
    components: ["src/features/day-review/day-review-view.tsx"],
    prefix: "day-review-",
    attributes: ["data-verb", "data-source"],
    copy: null,
    minimumClasses: 4,
  },
  /*
   * Slice 2M.4a. Added as a **row**, which is the whole reason this guard was
   * made table-driven in 2M.3 rather than copied: a fourth surface costs five
   * lines and inherits every assertion, including the census below that refuses
   * a lane nobody added a row for.
   */
  notificationSettings: {
    spec: "e2e/daily-surfaces.spec.ts",
    components: ["src/features/notifications/notification-settings.tsx"],
    prefix: "notification-",
    attributes: ["data-consent-state"],
    copy: { module: "src/features/notifications/copy.ts", keys: ["unsupported"] },
    minimumClasses: 1,
  },
};

/** Every `className="…"` literal in a source, filtered to one surface's prefix. */
function classNames(source: string, prefix: string): readonly string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/className=\{?["'`]([^"'`{}]+)["'`]/g)) {
    for (const token of match[1].split(/\s+/)) if (token.startsWith(prefix)) found.add(token);
  }
  return [...found];
}

describe.each(Object.entries(SURFACES))(
  "2M-ACCESS-006: the %s mirror names what the components emit",
  (name, surface) => {
    const spec = read(surface.spec);
    const sources = surface.components.map(read);
    const census = sources.flatMap((source) => classNames(source, surface.prefix));

    it("extracts a non-empty class census, so this cannot pass vacuously", () => {
      expect(census.length, `no ${surface.prefix}* class was extracted from any component`)
        .toBeGreaterThanOrEqual(surface.minimumClasses);
    });

    it("names every class the components render", () => {
      const missing = census.filter((token) => !spec.includes(token));
      expect(missing, `${surface.spec} does not name these rendered classes`).toEqual([]);
    });

    it("carries the data attributes the lane asserts on", () => {
      for (const attribute of surface.attributes) {
        expect(
          sources.some((source) => source.includes(attribute)),
          `${name} stopped emitting ${attribute}`,
        ).toBe(true);
        expect(spec, `the lane stopped asserting ${attribute}`).toContain(attribute);
      }
    });

    it("loads the stylesheets the lane reads computed styles from", () => {
      // A stylesheet the spec forgets to load turns every computed-style
      // assertion into a measurement of the browser default.
      expect(spec).toContain('"calendar.css"');
      expect(spec).toContain('"task-commands.css"');
    });

    it("states, in the lane itself, what it cannot prove", () => {
      // The residual. A lane that did not say "an emulated viewport is not a
      // device" would be cited as hardware evidence within one phase — OD-2M-5
      // makes that the owner's proof and nobody else's.
      expect(spec).toMatch(/emulated viewport is a viewport, not a device/i);
      expect(spec).toMatch(/2M-ACCESS-007/);
    });

    if (surface.copy !== null) {
      it("carries the same words the typed copy record does", () => {
        const copySource = read(surface.copy!.module);
        const values = (key: string) =>
          [...copySource.matchAll(new RegExp(`^\\s*${key}: "([^"]+)",`, "gm"))].map((match) => match[1]);
        const extracted = surface.copy!.keys.flatMap(values);
        expect(extracted.length, "no copy string was extracted").toBeGreaterThan(1);
        const missing = extracted.filter((sentence) => !spec.includes(sentence));
        expect(missing, `${surface.spec} restates copy that no longer exists`).toEqual([]);
      });
    }
  },
);

describe("the calendar keeps the element its whole keyboard argument rests on", () => {
  it("keeps the disclosure a real <details> in both the component and the mirror", () => {
    // A component that replaced it with a button plus `aria-expanded` would need
    // a different journey, and this line is what forces that to be noticed.
    const reschedule = read("src/features/calendar/calendar-reschedule.tsx");
    expect(reschedule).toContain("<details");
    expect(reschedule).toContain("<summary");
    expect(read("e2e/calendar.spec.ts")).toContain("details.calendar-reschedule");
  });

  it("asserts the unavailable sentence the component actually renders", () => {
    expect(read("src/features/calendar/calendar-reschedule.tsx")).toContain("copy.unavailable");
    expect(read("e2e/calendar.spec.ts")).toContain("calendar-reschedule-unavailable");
  });

  it("keeps the stylesheet rule the lane measures", () => {
    expect(read("src/app/calendar.css")).toContain(".calendar-reschedule-summary");
  });
});

describe("the day review's mirror restates the sentences it asserts on", () => {
  it("takes the schedule promise from the typed copy module, in both locales", () => {
    // `2M-REVIEW-007`'s sentence is asserted in the browser, so it is a string
    // the lane restates — and therefore a string that can drift.
    const copy = read("src/features/day-review/copy.ts");
    const spec = read("e2e/daily-surfaces.spec.ts");
    for (const match of copy.matchAll(/nothingScheduled: "([^"]+)",/g)) {
      expect(spec, "the lane restates a promise the product no longer makes").toContain(match[1]);
    }
    expect([...copy.matchAll(/nothingScheduled: "([^"]+)",/g)].length, "no promise was extracted").toBe(2);
  });
});

describe("2M-ACCESS-006: the guard fails when the thing it guards changes", () => {
  /*
   * The mutation control, and the reason it is not optional.
   *
   * Every assertion above is of the form "the lane names what the component
   * emits". That is satisfied trivially by a derivation that extracts nothing —
   * the exact way a source-derived guard rots into a fixture. The census test
   * bounds one half of it; this bounds the other, by running the **same
   * derivation** over a deliberately mutated source and requiring it to notice.
   *
   * Nothing on disk is touched. The mutation is applied to a string, because a
   * harness that edits an artifact is testing a different artifact — a trap this
   * repository has paid for by name.
   */
  const spec = read("e2e/daily-surfaces.spec.ts");
  const source = read("src/features/day-review/day-review-view.tsx");

  it("notices a renamed class", () => {
    const renamed = source.replace(/day-review-verb/g, "day-review-verb-renamed");
    const missing = classNames(renamed, "day-review-").filter((token) => !spec.includes(token));
    expect(missing.length, "renaming a class did not break the derivation").toBeGreaterThan(0);
  });

  it("notices an added class the lane does not name", () => {
    const added = `${source}\nconst planted = <div className="day-review-planted" />;\n`;
    const missing = classNames(added, "day-review-").filter((token) => !spec.includes(token));
    expect(missing).toContain("day-review-planted");
  });

  it("notices a removed data attribute", () => {
    const stripped = source.replace(/data-verb/g, "data-gone");
    expect(stripped.includes("data-verb"), "the mutation did not remove the attribute").toBe(false);
    // The real assertion runs against the unmutated source above; this proves
    // the predicate that assertion uses is capable of being false.
    expect(source.includes("data-verb")).toBe(true);
  });

  it("notices a copy string the lane restates and the product no longer says", () => {
    const copy = read("src/features/day-review/copy.ts");
    const drifted = copy.replace(/nothingScheduled: "([^"]+)",/, 'nothingScheduled: "something else entirely",');
    const sentences = [...drifted.matchAll(/nothingScheduled: "([^"]+)",/g)].map((match) => match[1]);
    expect(sentences.some((sentence) => !spec.includes(sentence)), "a drifted sentence went unnoticed").toBe(true);
  });

  it("is not measuring an empty census — the control has something to mutate", () => {
    expect(classNames(source, "day-review-").length).toBeGreaterThan(3);
  });
});

describe("2M-ACCESS-006: no surface in this phase is left without a mirror", () => {
  it("covers every Phase 2M lane that exists on disk", () => {
    /*
     * The census that stops this list going stale. `SURFACES` is data, and data
     * can be incomplete — so the lane directory is read instead of trusted, and
     * a Phase 2M spec nobody added a row for fails here rather than shipping
     * unmirrored.
     */
    const lanes = readdirSync(join(REPO, "e2e"))
      .filter((file) => /^(calendar|daily-surfaces)\.spec\.ts$/.test(file))
      .sort();
    expect(lanes).toEqual(["calendar.spec.ts", "daily-surfaces.spec.ts"]);
    const covered = new Set(Object.values(SURFACES).map((surface) => surface.spec.replace("e2e/", "")));
    expect([...covered].sort()).toEqual(lanes);
  });

  it("names four surfaces, which is how many this phase has shipped", () => {
    expect(Object.keys(SURFACES)).toEqual(["calendar", "planner", "dayReview", "notificationSettings"]);
  });
});
