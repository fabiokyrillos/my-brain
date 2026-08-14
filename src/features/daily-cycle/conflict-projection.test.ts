import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CONFLICT_PAGE_SIZE,
  CONFLICT_SCAN_LIMIT,
  loadMemoryConflicts,
} from "./conflict-projection";

/**
 * The read half of `2N-CONFLICT-002`, asserted against a recorded query rather
 * than a live client: what matters here is *which columns are read, under whose
 * scope, and with what bound* — and all three are visible in the builder calls.
 */

type Row = {
  id: string;
  content: string;
  sensitivity: string | null;
  valid_from: string | null;
  valid_until: string | null;
};

const calls = {
  select: "",
  eqUserId: "",
  notNull: [] as string[],
  limit: 0,
};

function client(rows: Row[], error: { message: string } | null = null) {
  calls.select = "";
  calls.eqUserId = "";
  calls.notNull = [];
  calls.limit = 0;

  const builder = {
    select(columns: string) { calls.select = columns; return builder; },
    eq(column: string, value: string) { if (column === "user_id") calls.eqUserId = value; return builder; },
    not(column: string, operator: string, value: unknown) {
      if (operator === "is" && value === null) calls.notNull.push(column);
      return builder;
    },
    order() { return builder; },
    limit(value: number) { calls.limit = value; return Promise.resolve({ data: error ? null : rows, error }); },
  };

  return { from: vi.fn(() => builder) } as never;
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    content: "Trabalho na Acme",
    sensitivity: "normal",
    valid_from: "2026-09-01T00:00:00.000Z",
    valid_until: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("loadMemoryConflicts", () => {
  it("reads only the five columns the rule needs", async () => {
    await loadMemoryConflicts(client([]), { locale: "pt-BR", userId: "user-1" });
    expect(calls.select).toBe("id,content,sensitivity,valid_from,valid_until");
  });

  /**
   * RLS is the trust boundary; this predicate is the belt to its braces, and the
   * posture `memories/actions.ts` established. Asserted because a projection that
   * lost it would still pass every other test in this file.
   */
  it("scopes the read to the caller, in addition to RLS", async () => {
    await loadMemoryConflicts(client([]), { locale: "pt-BR", userId: "user-1" });
    expect(calls.eqUserId).toBe("user-1");
  });

  it("pushes both not-null halves into SQL, so the bound is spent on rows that could match", async () => {
    await loadMemoryConflicts(client([]), { locale: "pt-BR", userId: "user-1" });
    expect(calls.notNull.sort()).toEqual(["valid_from", "valid_until"]);
  });

  it("asks for one row beyond the scan bound, and never scans it", async () => {
    expect(CONFLICT_SCAN_LIMIT).toBe(200);
    await loadMemoryConflicts(client([]), { locale: "pt-BR", userId: "user-1" });
    expect(calls.limit).toBe(CONFLICT_SCAN_LIMIT + 1);
  });

  it("derives a conflict and prefixes the locale onto the action", async () => {
    const result = await loadMemoryConflicts(client([row()]), { locale: "pt-BR", userId: "user-1" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].reason).toBe("resolve_validity_conflict");
    expect(result.items[0].action.href).toBe("/pt-BR/app/memories/11111111-1111-4111-8111-111111111111");
    expect(result.bounded).toBe(false);
  });

  it("prefixes the other locale too, so the row never leaves the owner's language", async () => {
    const result = await loadMemoryConflicts(client([row()]), { locale: "en", userId: "user-1" });
    expect(result.items[0].action.href).toBe("/en/app/memories/11111111-1111-4111-8111-111111111111");
  });

  it("carries both dates untouched — neither is the winner", async () => {
    const result = await loadMemoryConflicts(client([row()]), { locale: "pt-BR", userId: "user-1" });
    expect(result.items[0].validFrom).toBe("2026-09-01T00:00:00.000Z");
    expect(result.items[0].validUntil).toBe("2026-08-01T00:00:00.000Z");
  });

  it("derives nothing from a coherent window even though SQL returned it", async () => {
    const result = await loadMemoryConflicts(
      client([row({ valid_from: "2026-08-01T00:00:00.000Z", valid_until: "2026-09-01T00:00:00.000Z" })]),
      { locale: "pt-BR", userId: "user-1" },
    );
    expect(result.items).toEqual([]);
    expect(result.bounded).toBe(false);
  });

  it("derives nothing from an empty read — absent and foreign are one case", async () => {
    const result = await loadMemoryConflicts(client([]), { locale: "pt-BR", userId: "user-1" });
    expect(result.items).toEqual([]);
    expect(result.bounded).toBe(false);
  });

  /**
   * `2N-KNOWS-008`. A conflict check that silently stopped looking would tell the
   * owner their memories are consistent when it simply ran out of budget — which
   * is worse than a long list.
   */
  it("reports the bound when the scan hit its limit, even with nothing to show", async () => {
    const rows = Array.from({ length: CONFLICT_SCAN_LIMIT + 1 }, (_, index) => row({
      id: `id-${index}`,
      valid_from: "2026-08-01T00:00:00.000Z",
      valid_until: "2026-09-01T00:00:00.000Z",
    }));
    const result = await loadMemoryConflicts(client(rows), { locale: "pt-BR", userId: "user-1" });
    expect(result.items).toEqual([]);
    expect(result.bounded).toBe(true);
  });

  it("reports the bound when more conflicts exist than the page shows", async () => {
    const rows = Array.from({ length: CONFLICT_PAGE_SIZE + 1 }, (_, index) => row({ id: `id-${index}` }));
    const result = await loadMemoryConflicts(client(rows), { locale: "pt-BR", userId: "user-1" });
    expect(result.items).toHaveLength(CONFLICT_PAGE_SIZE);
    expect(result.bounded).toBe(true);
  });

  it("never scans the probe row past the bound", async () => {
    // One conflict sits in the probe position. If it were scanned, 201 rows
    // would have been examined and this would find it.
    const rows = Array.from({ length: CONFLICT_SCAN_LIMIT }, (_, index) => row({
      id: `clean-${index}`,
      valid_from: "2026-08-01T00:00:00.000Z",
      valid_until: "2026-09-01T00:00:00.000Z",
    }));
    rows.push(row({ id: "probe-row" }));
    const result = await loadMemoryConflicts(client(rows), { locale: "pt-BR", userId: "user-1" });
    expect(result.items).toEqual([]);
    expect(result.bounded).toBe(true);
  });

  it("classifies fail-closed, so an unreadable sensitivity is not shown in the clear", async () => {
    const result = await loadMemoryConflicts(client([row({ sensitivity: null })]), { locale: "pt-BR", userId: "user-1" });
    expect(result.items[0].sensitivity).toBe("highly_sensitive");
  });

  it("surfaces a read failure rather than reporting no conflicts", async () => {
    await expect(
      loadMemoryConflicts(client([], { message: "permission denied" }), { locale: "pt-BR", userId: "user-1" }),
    ).rejects.toThrow();
  });

  it("does not write — the only table access is a select", async () => {
    const supabase = client([row()]);
    await loadMemoryConflicts(supabase, { locale: "pt-BR", userId: "user-1" });
    // `from` is called exactly once, and the builder it returns exposes no
    // mutation verb. A second call would mean a second table, and an insert or
    // update would mean persisted inference — both forbidden by `OD-2N-7` A.
    expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledTimes(1);
    expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith("memories");
  });
});
