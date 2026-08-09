import { describe, expect, it } from "vitest";

import { parsePage } from "@/lib/pagination";
import {
  DEFAULT_WORK_QUERY,
  WORK_DUE_FILTERS,
  WORK_GROUPINGS,
  WORK_ORDERS,
  WORK_ORIGINS,
  WORK_PRIORITIES,
  WORK_STATES,
  isNarrowed,
  parseWorkQuery,
  toWorkQueryParams,
  workHref,
  workViews,
} from "./work-query";

/**
 * `2L-VIEW-004`/`-005`/`-006`/`-007`/`-008`/`-009` — the URL is the state.
 *
 * Every assertion below is about one property: a parameter this module cannot
 * recognise resolves to the **declared default** and **never widens the result
 * set**. That is asserted *per parameter*, because a single "malformed input"
 * test would pass while one of eight parsers quietly fell open.
 */

const parse = (params: Record<string, string | string[] | undefined>) =>
  parseWorkQuery(params, parsePage);

describe("2L-VIEW-008: every parameter fails closed, per parameter", () => {
  const cases: readonly [string, readonly string[]][] = [
    ["view", workViews],
    ["state", WORK_STATES],
    ["due", WORK_DUE_FILTERS],
    ["priority", WORK_PRIORITIES],
    ["origin", WORK_ORIGINS],
    ["order", WORK_ORDERS],
    ["group", WORK_GROUPINGS],
  ];

  it.each(cases)("accepts every declared value of `%s` and nothing else", (name, allowed) => {
    for (const value of allowed) {
      expect(parse({ [name]: value })[name as keyof typeof DEFAULT_WORK_QUERY]).toBe(value);
    }
    for (const malformed of ["", "future_value", "ALL", "1", "null"]) {
      expect(parse({ [name]: malformed })[name as keyof typeof DEFAULT_WORK_QUERY])
        .toBe(DEFAULT_WORK_QUERY[name as keyof typeof DEFAULT_WORK_QUERY]);
    }
  });

  it.each(cases)("resolves a repeated `%s` to the default rather than guessing", (name, allowed) => {
    // Two values is a malformed request. Picking the first would be choosing
    // for the user, and choosing the *wider* one would be the failure this
    // requirement is written against.
    expect(parse({ [name]: [allowed[0], allowed[1] ?? allowed[0]] })[name as keyof typeof DEFAULT_WORK_QUERY])
      .toBe(DEFAULT_WORK_QUERY[name as keyof typeof DEFAULT_WORK_QUERY]);
  });

  it("never widens: the fallbacks are the narrowest declared values", () => {
    // `state` is the one filter whose vocabulary is genuinely ordered by
    // breadth, and its default is the narrowest member. A default of "any"
    // would mean a typo showed the user cancelled work.
    expect(DEFAULT_WORK_QUERY.state).toBe("open");
    expect(WORK_STATES[0]).toBe("open");
  });

  it("drops a relation filter that is not a uuid, rather than passing it through", () => {
    // A non-uuid cannot name a row, so the honest answer is *no relation
    // filter* — which is wider than a bad filter would have been, and is the
    // only alternative to inventing an id.
    expect(parse({ project: "not-an-id" }).projectId).toBeNull();
    expect(parse({ project: "" }).projectId).toBeNull();
    expect(parse({ project: ["a", "b"] }).projectId).toBeNull();
    expect(parse({ project: "9f1c2f2e-1111-4111-8111-111111111111" }).projectId)
      .toBe("9f1c2f2e-1111-4111-8111-111111111111");
  });

  it("resolves an absent query to the declared default in every field", () => {
    expect(parse({})).toEqual(DEFAULT_WORK_QUERY);
  });
});

describe("2L-VIEW-002: no fourth view can arrive through a parameter", () => {
  it("keeps the reported views at exactly three", () => {
    expect([...workViews]).toEqual(["today", "all", "waiting"]);
  });

  it("resolves any other value to the default view", () => {
    for (const candidate of ["upcoming", "completed", "cancelled", "project", "someday"]) {
      expect(parse({ view: candidate }).view).toBe("today");
    }
  });
});

describe("2L-VIEW-004/005/006/009: the parts compose", () => {
  it("carries view, filters, ordering, grouping and page together", () => {
    const query = parse({
      view: "all",
      state: "completed",
      due: "overdue",
      priority: "high",
      origin: "brain",
      project: "9f1c2f2e-1111-4111-8111-111111111111",
      order: "due_desc",
      group: "project",
      page: "3",
    });

    expect(query).toEqual({
      view: "all",
      state: "completed",
      due: "overdue",
      priority: "high",
      origin: "brain",
      projectId: "9f1c2f2e-1111-4111-8111-111111111111",
      contextId: null,
      order: "due_desc",
      group: "project",
      page: 3,
    });
  });

  it("round-trips: a query becomes a URL and the URL becomes the same query", () => {
    // The property `2L-RETURN-001` needs. Not "the string looks right" —
    // parse(serialise(q)) === q, for a query that uses every field.
    const query = parse({
      view: "waiting",
      state: "cancelled",
      due: "upcoming",
      priority: "urgent",
      origin: "you",
      context: "9f1c2f2e-2222-4222-8222-222222222222",
      order: "updated_asc",
      group: "context",
      page: "4",
    });
    const url = new URL(workHref("pt-BR", query), "https://example.test");
    expect(parse(Object.fromEntries(url.searchParams))).toEqual(query);
  });

  it("omits defaults, so one state has one URL", () => {
    expect(toWorkQueryParams(DEFAULT_WORK_QUERY)).toEqual({});
    expect(workHref("en", DEFAULT_WORK_QUERY)).toBe("/en/app/work");
  });

  it("preserves each parameter across a change to another", () => {
    const query = parse({ view: "all", priority: "high", order: "due_asc", page: "2" });
    const moved = { ...query, group: "priority" as const };
    const url = new URL(workHref("en", moved), "https://example.test");
    const back = parse(Object.fromEntries(url.searchParams));
    expect(back.priority).toBe("high");
    expect(back.order).toBe("due_asc");
    expect(back.page).toBe(2);
    expect(back.group).toBe("priority");
  });
});

describe("a narrowed view is distinguishable from an empty one", () => {
  it("knows when nothing was narrowed", () => {
    expect(isNarrowed(DEFAULT_WORK_QUERY)).toBe(false);
    expect(isNarrowed(parse({ view: "all", page: "2" }))).toBe(false);
  });

  it("knows when something was", () => {
    // The universal-state contract requires a filtered-empty result to be
    // distinguishable from a genuinely empty view, and this is the predicate
    // that distinguishes them.
    expect(isNarrowed(parse({ priority: "high" }))).toBe(true);
    expect(isNarrowed(parse({ state: "completed" }))).toBe(true);
    expect(isNarrowed(parse({ project: "9f1c2f2e-1111-4111-8111-111111111111" }))).toBe(true);
  });
});
