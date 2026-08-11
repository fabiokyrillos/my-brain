import { describe, expect, it } from "vitest";

import { getWorkFiltersCopy } from "./work-filters-copy";
import {
  DEFAULT_WORK_QUERY,
  WORK_ORDERS,
  WORK_PLANNED_FILTERS,
  isNarrowed,
  parseWorkQuery,
  toWorkQueryParams,
  workHref,
  workViews,
} from "./work-query";
import {
  fromWorkPosition,
  parseWorkPosition,
  serializeWorkPosition,
  toWorkPosition,
} from "@/features/operations/work-position";
import { comparePlannedAt } from "@/features/planning/planned-at";

/**
 * `2M-PLAN-003` — `planned_at` acquires read-side semantics: "at minimum a
 * filter and an ordering on the existing Work surface, expressed within the
 * three-view taxonomy as filters rather than as a fourth view."
 *
 * The three-view clause is the one with teeth. A `planned` view would have been
 * the obvious shape and would have cost a migration: `workView` is a deployed
 * telemetry enum with a CHECK behind it, and Phase 2M's budget names its three
 * migrations by content. So the assertions below are as much about what did
 * *not* happen — no fourth view, no new telemetry value, no widening — as about
 * the filter itself.
 */

const parsePage = (value: unknown): number =>
  typeof value === "string" && /^\d+$/.test(value) ? Math.max(1, Number(value)) : 1;

describe("the filter lives inside the three views", () => {
  it("adds no view", () => {
    // The reported destinations are still exactly three. If a fourth were ever
    // added this fails, and it fails for the reason that matters: `workView` is
    // a deployed CHECK, and a value it does not admit costs a migration Phase
    // 2M's budget has already allocated by name.
    expect([...workViews]).toEqual(["today", "all", "waiting"]);
    // And `planned` is not smuggled in as one: it resolves to the default.
    expect(parseWorkQuery({ view: "planned" }, parsePage).view).toBe(DEFAULT_WORK_QUERY.view);
  });

  it("is available on every view, because it is a filter and not a destination", () => {
    for (const view of ["today", "all", "waiting"] as const) {
      const parsed = parseWorkQuery({ view, planned: "today" }, parsePage);
      expect(parsed.view).toBe(view);
      expect(parsed.planned).toBe("today");
    }
  });
});

describe("fail-closed, in the direction 2L-VIEW-008 requires", () => {
  it("resolves an unknown, malformed or repeated value to the declared default", () => {
    expect(parseWorkQuery({ planned: "someday" }, parsePage).planned).toBe("any");
    expect(parseWorkQuery({ planned: "" }, parsePage).planned).toBe("any");
    expect(parseWorkQuery({ planned: ["today", "none"] }, parsePage).planned).toBe("any");
    expect(parseWorkQuery({}, parsePage).planned).toBe("any");
  });

  it("defaults to the value that changes nothing, so a fallback cannot narrow either", () => {
    // `any` adds no predicate. The other four each add one, so no value of this
    // parameter can widen a view and a malformed one cannot silently hide rows.
    expect(DEFAULT_WORK_QUERY.planned).toBe("any");
  });

  it("counts as a narrowing when it is set, so an empty page says why", () => {
    expect(isNarrowed({ ...DEFAULT_WORK_QUERY, planned: "none" })).toBe(true);
    expect(isNarrowed({ ...DEFAULT_WORK_QUERY, planned: "any" })).toBe(false);
  });
});

describe("the URL is still the complete description of the position", () => {
  it("omits the parameter at its default and carries it otherwise", () => {
    expect(toWorkQueryParams(DEFAULT_WORK_QUERY).planned).toBeUndefined();
    expect(toWorkQueryParams({ ...DEFAULT_WORK_QUERY, planned: "overdue" }).planned).toBe("overdue");
    expect(workHref("pt-BR", { ...DEFAULT_WORK_QUERY, planned: "today" }))
      .toBe("/pt-BR/app/work?planned=today");
  });

  it("round-trips every member", () => {
    for (const planned of WORK_PLANNED_FILTERS) {
      const query = { ...DEFAULT_WORK_QUERY, planned };
      expect(parseWorkQuery(toWorkQueryParams(query), parsePage).planned).toBe(planned);
    }
  });
});

describe("the return position carries it without invalidating the ones already out there", () => {
  it("round-trips through the encoded payload", () => {
    for (const planned of WORK_PLANNED_FILTERS) {
      const query = { ...DEFAULT_WORK_QUERY, planned };
      expect(parseWorkPosition(serializeWorkPosition(query)).planned).toBe(planned);
    }
  });

  it("reads a position minted before the filter existed as the declared default", () => {
    /*
     * The compatibility case, and the reason the version was not bumped. A link
     * shared yesterday carries no `l`; `.strict()` would refuse it if the key
     * were required, and a refused position silently drops the user's place.
     * Absent means what those links already meant: no planned filter.
     */
    const legacy = toWorkPosition(DEFAULT_WORK_QUERY) as Record<string, unknown>;
    delete legacy.l;
    const encoded = Buffer.from(JSON.stringify(legacy), "utf8").toString("base64url");
    expect(parseWorkPosition(encoded).planned).toBe("any");
  });

  it("still refuses a position carrying anything that is not navigation", () => {
    const smuggled = { ...toWorkPosition(DEFAULT_WORK_QUERY), operationKey: "abc" };
    const encoded = Buffer.from(JSON.stringify(smuggled), "utf8").toString("base64url");
    // `.strict()` is what refuses it, and the fallback is the default position
    // rather than a partial one.
    expect(parseWorkPosition(encoded)).toEqual(DEFAULT_WORK_QUERY);
  });

  it("keeps fromWorkPosition total over the schema", () => {
    const position = toWorkPosition({ ...DEFAULT_WORK_QUERY, planned: "upcoming" });
    expect(fromWorkPosition(position).planned).toBe("upcoming");
  });
});

describe("the ordering", () => {
  it("offers both directions", () => {
    expect(WORK_ORDERS).toContain("planned_asc");
    expect(WORK_ORDERS).toContain("planned_desc");
  });

  it("puts an absent plan last in both, which the projection expresses as nullsFirst: false", () => {
    // The declaration is `comparePlannedAt`; this asserts the property both the
    // comparator and the PostgREST order must have, so the two cannot drift.
    for (const direction of ["asc", "desc"] as const) {
      expect(comparePlannedAt(null, "2026-08-14T12:00:00.000Z", direction)).toBeGreaterThan(0);
    }
  });
});

describe("the words", () => {
  it("labels every member in both locales", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const copy = getWorkFiltersCopy(locale);
      expect(copy.groups.planned.length).toBeGreaterThan(0);
      for (const value of WORK_PLANNED_FILTERS) {
        expect(copy.planned[value]?.length, `${locale}.planned.${value}`).toBeGreaterThan(0);
      }
      for (const order of ["planned_asc", "planned_desc"] as const) {
        expect(copy.order[order]?.length, `${locale}.order.${order}`).toBeGreaterThan(0);
      }
    }
  });

  it("never calls a passed intention late", () => {
    /*
     * OD-2M-3 A: `planned_at` is an intention, so a day that went by with the
     * task still open is a fact and not a failure. The `due` filter's own
     * `overdue` label may say "atrasadas"/"overdue" — that one is about a
     * deadline — and this one may not, which is why the two vocabularies are
     * separate records rather than one shared by both.
     */
    expect(getWorkFiltersCopy("pt-BR").planned.overdue.toLowerCase()).not.toContain("atrasad");
    expect(getWorkFiltersCopy("en").planned.overdue.toLowerCase()).not.toContain("overdue");
    expect(getWorkFiltersCopy("en").planned.overdue.toLowerCase()).not.toContain("late");
    // Non-vacuous: the due vocabulary does use the word, so the assertion above
    // is about this vocabulary's restraint rather than about the word's absence
    // from the file.
    expect(getWorkFiltersCopy("en").due.overdue.toLowerCase()).toContain("overdue");
  });
});
