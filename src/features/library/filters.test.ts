import { describe, expect, it } from "vitest";

import { ATTACHMENT_LIMITS } from "@/lib/quotas";

import {
  CLASSIFIED_MIME_TYPES,
  FILE_KIND_FILTERS,
  FILE_KIND_MIME_TYPES,
  FILE_STATE_FILTERS,
  NO_FILE_FILTERS,
  PERIOD_FILTERS,
  fileFiltersQuery,
  fileFiltersRecord,
  fileKindOf,
  filesHref,
  hasActiveFileFilter,
  isActiveFilter,
  mimeTypesForKind,
  parseFileFilters,
  type FileFilters,
} from "./filters";

/**
 * `2N-FILES-010` — the filters, proved against the two ways a filter lies.
 *
 * A filter lies by **carrying a stale page** (page three of the unfiltered list
 * is not page three of the filtered one) and by **applying half of itself** (a
 * linked-entity type with no id, or vice versa). Both are asserted here, and
 * both are properties of the URL rather than of the query — which is why they
 * are testable without a database at all.
 */

describe("the state vocabulary is the column's, not a second one", () => {
  it("mirrors attachments.status exactly", () => {
    // `202607160007:107` — four values, and the page has rendered their labels
    // since before this slice. A fifth invented here would be a filter for a
    // state no row can hold.
    expect([...FILE_STATE_FILTERS]).toEqual(["uploaded", "processing", "ready", "failed"]);
  });
});

describe("the kinds cover the upload allowlist exhaustively", () => {
  it("classifies every MIME type the product accepts", () => {
    for (const mimeType of ATTACHMENT_LIMITS.mimeAllowlist) {
      expect(CLASSIFIED_MIME_TYPES).toContain(mimeType);
    }
  });

  it("classifies nothing the product does not accept", () => {
    for (const mimeType of CLASSIFIED_MIME_TYPES) {
      expect(ATTACHMENT_LIMITS.mimeAllowlist as readonly string[]).toContain(mimeType);
    }
  });

  it("makes `other` the complement rather than a hard-coded leftovers list", () => {
    // `null` is the instruction to negate `CLASSIFIED_MIME_TYPES`. A kind that
    // returned a list here would silently stop covering a MIME type added to the
    // allowlist tomorrow.
    expect(mimeTypesForKind("other")).toBeNull();
    for (const kind of FILE_KIND_FILTERS.filter((value) => value !== "other")) {
      expect(mimeTypesForKind(kind)).toEqual(FILE_KIND_MIME_TYPES[kind]);
    }
  });

  it("assigns each MIME type to exactly one kind", () => {
    expect(new Set(CLASSIFIED_MIME_TYPES).size).toBe(CLASSIFIED_MIME_TYPES.length);
  });
});

describe("the period vocabulary is search's, not a second one", () => {
  it("takes the words search already uses", () => {
    expect([...PERIOD_FILTERS]).toEqual(["7d", "30d", "12m"]);
  });
});

describe("parsing refuses to half-apply a filter", () => {
  it("reads a complete set", () => {
    expect(
      parseFileFilters({
        state: "ready",
        kind: "image",
        period: "30d",
        linkType: "person",
        linkId: "person-1",
      }),
    ).toEqual({
      state: "ready",
      kind: "image",
      period: "30d",
      linked: { entityType: "person", entityId: "person-1" },
    });
  });

  it("ignores a linked type with no id", () => {
    expect(parseFileFilters({ linkType: "person" }).linked).toBeNull();
  });

  it("ignores a linked id with no type", () => {
    expect(parseFileFilters({ linkId: "person-1" }).linked).toBeNull();
  });

  it("ignores a linked type the reverse direction does not serve", () => {
    // `entry` is a readable link type but has no file section of its own, so it
    // cannot be a filter — offering it would produce a chip that selects rows
    // the page cannot explain.
    expect(parseFileFilters({ linkType: "entry", linkId: "entry-1" }).linked).toBeNull();
  });

  it("treats an unrecognised value as no filter rather than as an error", () => {
    expect(parseFileFilters({ state: "finished", kind: "hologram", period: "5y" })).toEqual(
      NO_FILE_FILTERS,
    );
  });

  it("takes the first value when a parameter repeats", () => {
    expect(parseFileFilters({ state: ["ready", "failed"] }).state).toBe("ready");
  });

  it("reads nothing out of an empty query", () => {
    expect(parseFileFilters({})).toEqual(NO_FILE_FILTERS);
    expect(hasActiveFileFilter(parseFileFilters({}))).toBe(false);
  });
});

describe("2N-FILES-010: a filter link never carries a stale page", () => {
  const active: FileFilters = {
    state: "ready",
    kind: null,
    period: null,
    linked: null,
  };

  it("omits the page entirely", () => {
    expect(fileFiltersQuery(active, { kind: "image" })).not.toContain("page");
  });

  it("preserves the other axes while toggling one", () => {
    expect(fileFiltersQuery(active, { kind: "image" })).toBe("?state=ready&kind=image");
  });

  it("clears an axis when the patch is null", () => {
    expect(fileFiltersQuery(active, { state: null })).toBe("");
  });

  it("writes both halves of a linked filter or neither", () => {
    const query = fileFiltersQuery(NO_FILE_FILTERS, {
      linked: { entityType: "project", entityId: "project-1" },
    });
    expect(query).toContain("linkType=project");
    expect(query).toContain("linkId=project-1");
  });

  it("builds a route rather than a bare query", () => {
    expect(filesHref("pt-BR", active)).toBe("/pt-BR/app/files?state=ready");
    expect(filesHref("en", NO_FILE_FILTERS)).toBe("/en/app/files");
  });
});

describe("pagination keeps the filter", () => {
  it("hands every active predicate to the page links", () => {
    const filters = parseFileFilters({
      state: "failed",
      kind: "document",
      period: "7d",
      linkType: "person",
      linkId: "person-1",
    });
    expect(fileFiltersRecord(filters)).toEqual({
      state: "failed",
      kind: "document",
      period: "7d",
      linkType: "person",
      linkId: "person-1",
    });
  });

  it("hands over nothing when nothing is filtered", () => {
    expect(fileFiltersRecord(NO_FILE_FILTERS)).toEqual({});
  });
});

describe("one predicate decides both the class and the announcement", () => {
  const filters: FileFilters = {
    state: "ready",
    kind: null,
    period: null,
    linked: { entityType: "person", entityId: "person-1" },
  };

  it("marks the active chip on a simple axis", () => {
    expect(isActiveFilter(filters, "state", "ready")).toBe(true);
    expect(isActiveFilter(filters, "state", "failed")).toBe(false);
  });

  it("marks `All` active only when the axis is unset", () => {
    expect(isActiveFilter(filters, "kind", null)).toBe(true);
    expect(isActiveFilter(filters, "state", null)).toBe(false);
  });

  it("compares a linked filter by value rather than by identity", () => {
    expect(
      isActiveFilter(filters, "linked", { entityType: "person", entityId: "person-1" }),
    ).toBe(true);
    expect(
      isActiveFilter(filters, "linked", { entityType: "project", entityId: "person-1" }),
    ).toBe(false);
    expect(
      isActiveFilter(filters, "linked", { entityType: "person", entityId: "person-2" }),
    ).toBe(false);
  });
});

describe("fileKindOf classifies a row the same way the chips filter it", () => {
  it("answers with the kind whose map contains the type", () => {
    expect(fileKindOf("image/png")).toBe("image");
    expect(fileKindOf("application/pdf")).toBe("document");
    expect(fileKindOf("text/csv")).toBe("spreadsheet");
    expect(fileKindOf("text/plain")).toBe("text");
  });

  it("falls to `other` for an allowlisted type nobody classified", () => {
    // The exhaustive complement, exactly as `mimeTypesForKind("other")` is. A
    // hard-coded leftovers list would leave a new allowed type unlabelled.
    expect(fileKindOf("application/zip")).toBe("other");
  });

  /*
   * The invariant that makes the label trustworthy: whatever kind a row is
   * labelled, selecting that chip must return the row. Derived from the same
   * map in both directions, so this cannot pass by coincidence — it re-walks
   * every declared type rather than sampling four.
   */
  it("agrees with the filter in both directions, for every classified type", () => {
    for (const kind of FILE_KIND_FILTERS) {
      for (const mime of mimeTypesForKind(kind) ?? []) {
        expect(fileKindOf(mime), `${mime} is labelled ${fileKindOf(mime)} but filtered as ${kind}`).toBe(kind);
      }
    }
    // Non-vacuity: the loop above must actually have types to walk.
    expect(CLASSIFIED_MIME_TYPES.length).toBeGreaterThan(4);
  });
});
