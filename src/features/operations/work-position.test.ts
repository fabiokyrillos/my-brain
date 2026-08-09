import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DEFAULT_WORK_QUERY, parseWorkQuery } from "@/features/daily-cycle/work-query";
import { parsePage } from "@/lib/pagination";
import {
  POSITION_FORBIDDEN_FIELDS,
  WORK_POSITION_VERSION,
  parseWorkPosition,
  serializeWorkPosition,
  toWorkPosition,
} from "./work-position";

/**
 * `2L-RETURN-002`/`-003` — the return position carries navigation and nothing
 * else.
 *
 * The refusal is asserted **field by field**, against a planted instance,
 * because "the schema is strict" is a property of a line rather than of the
 * payload: a future edit that relaxed one key would still leave `.strict()` in
 * the file.
 */

const full = parseWorkQuery(
  {
    view: "all",
    state: "completed",
    due: "overdue",
    priority: "high",
    origin: "brain",
    project: "9f1c2f2e-1111-4111-8111-111111111111",
    context: "9f1c2f2e-2222-4222-8222-222222222222",
    order: "due_desc",
    group: "project",
    page: "3",
  },
  parsePage,
);

const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

describe("2L-RETURN-001/002: the position round-trips through the URL and nothing else", () => {
  it("restores the same view, filters, ordering, grouping and page", () => {
    expect(parseWorkPosition(serializeWorkPosition(full))).toEqual(full);
  });

  it("restores the default for an absent, empty or unreadable payload", () => {
    // A malformed return is a user who lands on the default view. A throw would
    // be an error page in response to pressing Back.
    for (const value of [undefined, "", "not-base64url", encode({ nope: true }), ["a", "b"]]) {
      expect(parseWorkPosition(value as string | string[] | undefined)).toEqual(DEFAULT_WORK_QUERY);
    }
  });

  it("refuses a payload from an older shape rather than coercing it", () => {
    const stale = { ...toWorkPosition(full), v: "2020-01-01.1" };
    expect(parseWorkPosition(encode(stale))).toEqual(DEFAULT_WORK_QUERY);
  });

  it("holds no client-persisted position anywhere", () => {
    const source = readSource();
    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie|agent_preferences/);
  });
});

describe("2L-RETURN-003: it refuses, by name, every field that could authorize", () => {
  it.each(POSITION_FORBIDDEN_FIELDS)("refuses a payload carrying `%s`", (field) => {
    // Planted, one field at a time. A payload that carried a confirmation, an
    // operation key or a pinned instant would be an authorization travelling in
    // a URL — and being *ignored* is not enough, because a later reader could
    // start honouring it. It is refused, and the whole position falls back.
    const planted = { ...toWorkPosition(full), [field]: "smuggled" };
    expect(parseWorkPosition(encode(planted))).toEqual(DEFAULT_WORK_QUERY);
  });

  it("refuses any unknown field at all, not only the named ones", () => {
    const planted = { ...toWorkPosition(full), somethingNew: 1 };
    expect(parseWorkPosition(encode(planted))).toEqual(DEFAULT_WORK_QUERY);
  });

  it("names the fields it refuses, so the refusal is legible", () => {
    // The list is the statement; `.strict()` is the mechanism. Both are
    // asserted, because a list nobody checks is documentation.
    expect(POSITION_FORBIDDEN_FIELDS).toContain("confirmationId");
    expect(POSITION_FORBIDDEN_FIELDS).toContain("operationKey");
    expect(POSITION_FORBIDDEN_FIELDS).toContain("observedBefore");
    expect(POSITION_FORBIDDEN_FIELDS).toContain("issuedAt");
    expect(POSITION_FORBIDDEN_FIELDS).toContain("fingerprint");
    expect(POSITION_FORBIDDEN_FIELDS).toContain("patch");
    expect(POSITION_FORBIDDEN_FIELDS).toContain("preview");
    expect(readSource()).toContain(".strict()");
  });

  it("carries no content — every value is an identifier or a closed vocabulary", () => {
    const position = toWorkPosition(full);
    expect(Object.keys(position).sort()).toEqual(
      ["c", "d", "g", "k", "n", "o", "p", "r", "s", "v", "w"],
    );
    expect(position.v).toBe(WORK_POSITION_VERSION);
    // No title, no name, no description, no free text of any kind.
    for (const value of Object.values(position)) {
      if (typeof value !== "string") continue;
      expect(value).not.toMatch(/\s/);
    }
  });
});

function readSource(): string {
  return readFileSync(join(__dirname, "work-position.ts"), "utf8");
}
