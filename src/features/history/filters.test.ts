import { describe, expect, it } from "vitest";

import {
  EMPTY_HISTORY_FILTERS,
  hasActiveFilters,
  historyFilterQuery,
  parseHistoryFilters,
} from "./filters";

describe("parseHistoryFilters", () => {
  it("reads a complete, well-formed filter set", () => {
    const filters = parseHistoryFilters({
      from: "2026-07-01",
      to: "2026-07-31",
      actor: "agent",
      entity: "task",
      category: "changed",
      subject: "11111111-2222-3333-4444-555555555555",
    });

    expect(filters).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
      actor: "agent",
      entityType: "task",
      category: "changed",
      subjectId: "11111111-2222-3333-4444-555555555555",
      ignoredKeys: [],
    });
  });

  it("returns the empty set when nothing is in the address", () => {
    expect(parseHistoryFilters({})).toEqual(EMPTY_HISTORY_FILTERS);
    expect(hasActiveFilters(EMPTY_HISTORY_FILTERS)).toBe(false);
  });

  it("drops every malformed parameter instead of failing the page", () => {
    const filters = parseHistoryFilters({
      from: "31/07/2026",
      to: "yesterday",
      actor: "root",
      entity: "widget",
      category: "everything",
      subject: "not-a-uuid",
    });

    expect(filters.from).toBeNull();
    expect(filters.to).toBeNull();
    expect(filters.actor).toBeNull();
    expect(filters.entityType).toBeNull();
    expect(filters.category).toBeNull();
    expect(filters.subjectId).toBeNull();
    // Recorded, so the page can say it ignored them rather than pretending.
    expect([...filters.ignoredKeys].sort()).toEqual([
      "actor",
      "category",
      "entity",
      "from",
      "subject",
      "to",
    ]);
  });

  it("does not let an unknown actor become a silent filter on the system", () => {
    // `asHistoryActor` folds unknown values to `system` when reading a stored
    // row. Doing that here would answer a typo with someone else's history.
    const filters = parseHistoryFilters({ actor: "sistema" });
    expect(filters.actor).toBeNull();
    expect(filters.ignoredKeys).toEqual(["actor"]);
  });

  it("normalizes a reversed range rather than returning nothing", () => {
    const filters = parseHistoryFilters({ from: "2026-07-31", to: "2026-07-01" });
    expect(filters.from).toBe("2026-07-01");
    expect(filters.to).toBe("2026-07-31");
    expect(filters.ignoredKeys).toEqual([]);
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(parseHistoryFilters({ actor: ["user", "agent"] }).actor).toBe("user");
  });

  it("treats an empty or whitespace value as absent, not as malformed", () => {
    const filters = parseHistoryFilters({ actor: "", entity: "   " });
    expect(filters.actor).toBeNull();
    expect(filters.entityType).toBeNull();
    expect(filters.ignoredKeys).toEqual([]);
  });

  it("keeps one valid filter when another beside it is malformed", () => {
    const filters = parseHistoryFilters({ actor: "user", entity: "widget" });
    expect(filters.actor).toBe("user");
    expect(filters.entityType).toBeNull();
    expect(filters.ignoredKeys).toEqual(["entity"]);
  });

  it("ignores the page parameter, which pagination owns", () => {
    expect(parseHistoryFilters({ page: "4" })).toEqual(EMPTY_HISTORY_FILTERS);
  });
});

describe("historyFilterQuery", () => {
  it("round-trips a filter set back into query parameters", () => {
    const filters = parseHistoryFilters({
      from: "2026-07-01",
      actor: "user",
      entity: "memory",
      category: "lifecycle",
    });
    expect(historyFilterQuery(filters)).toEqual({
      from: "2026-07-01",
      actor: "user",
      entity: "memory",
      category: "lifecycle",
    });
  });

  it("omits page, so a filter change cannot strand the reader on page 4", () => {
    const query = historyFilterQuery(parseHistoryFilters({ actor: "user", page: "4" }));
    expect(query).not.toHaveProperty("page");
  });

  it("emits nothing when nothing is filtered", () => {
    expect(historyFilterQuery(EMPTY_HISTORY_FILTERS)).toEqual({});
  });
});
