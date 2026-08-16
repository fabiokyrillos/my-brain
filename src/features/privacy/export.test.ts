import { describe, expect, it, vi } from "vitest";

import { EXPORT_ROW_CEILING, buildAccountExport } from "./export";
import { ENUMERATED_TABLES, ENUMERATION_COVERAGE, WITHHELD_TABLES } from "./enumeration";

/**
 * `2O-PRIVACY-004`, `-005`, `-006` and `R-2O-19`.
 *
 * The property under test is not *"the export works"* — it is that **there is no
 * input under which a partial archive is returned**. Threat T-2 is exactly that
 * failure, and it is a failure a passing happy-path test cannot detect.
 */

const AT = "2026-08-16T03:00:00.000Z";
const TABLES = ENUMERATED_TABLES.map((entry) => entry.table);

type Options = { refuse?: string; rows?: Record<string, number> };

/**
 * The sensitive column values, per table that actually has them.
 *
 * **The first version of this fixture gave every table a `ciphertext`**, which
 * made *"no secret survives anywhere in the archive"* fail against a correct
 * export — the fixture, not the product, was wrong. A fixture that does not
 * model the schema tests a different schema, and the assertion it breaks is
 * usually the strongest one in the file. §82 recorded the same lesson from the
 * other side: a mutation that SURVIVES is sometimes the harness being wrong.
 */
const SENSITIVE_COLUMNS: Record<string, Record<string, string>> = {
  user_ai_credentials: { ciphertext: "SECRET", iv: "IV", fingerprint: "fp-1234" },
  push_subscriptions: { endpoint: "https://push.test/x", auth: "AUTH", p256dh: "P256" },
  entry_embeddings: { embedding: "[0.1,0.2]", content: "the entry text" },
};

function clientReturning({ refuse, rows = {} }: Options = {}) {
  const from = vi.fn((table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn((_column: string, userId: string) => ({
        range: vi.fn(async (start: number, end: number) => {
          if (table === refuse) return { data: null, error: { message: "permission denied" } };
          const total = rows[table] ?? 1;
          const size = Math.max(0, Math.min(total - start, end - start + 1));
          return {
            data: Array.from({ length: size }, (_unused, index) => ({
              id: `${table}-${start + index}`,
              // RLS returns only the caller's rows; the fixture models that.
              user_id: userId,
              created_at: AT,
              ...(SENSITIVE_COLUMNS[table] ?? {}),
            })),
            error: null,
          };
        }),
      })),
    })),
  }));
  return { from } as never;
}

describe("2O-PRIVACY-004 / R-2O-19: complete or refused, never partial", () => {
  it("a complete export covers every enumerated table", async () => {
    const result = await buildAccountExport(clientReturning(), "owner", AT);
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;

    const archive = JSON.parse(result.archive) as { data: Record<string, unknown[]> };
    expect(Object.keys(archive.data).sort()).toEqual([...TABLES].sort());
    expect(result.rows).toBe(TABLES.length);
  });

  it("one refused table refuses the whole export and returns no archive at all", async () => {
    const result = await buildAccountExport(clientReturning({ refuse: "tasks" }), "owner", AT);
    expect(result).toEqual({ status: "refused", reason: "unreadable", table: "tasks" });
    expect(result).not.toHaveProperty("archive");
  });

  it("refuses whichever table refuses — the refusal is not special-cased to one", async () => {
    for (const table of ["entries", "product_events", "policy_acceptances"]) {
      const result = await buildAccountExport(clientReturning({ refuse: table }), "owner", AT);
      expect(result.status).toBe("refused");
    }
  });

  it("an account past the ceiling is refused rather than truncated", async () => {
    const result = await buildAccountExport(
      clientReturning({ rows: { entries: EXPORT_ROW_CEILING + 1 } }),
      "owner",
      AT,
    );
    expect(result).toEqual({ status: "refused", reason: "too-large" });
  });

  it("pages beyond the first request rather than stopping at one page", async () => {
    // A reader that took only the first page would silently drop rows 1001+ and
    // still report `complete` — a partial that looks whole.
    const result = await buildAccountExport(clientReturning({ rows: { entries: 2500 } }), "owner", AT);
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;
    const archive = JSON.parse(result.archive) as { data: Record<string, unknown[]> };
    expect(archive.data.entries).toHaveLength(2500);
  });
});

describe("2O-PRIVACY-006: the archive states its own scope and generation time", () => {
  it("names the generation time it was given", async () => {
    const result = await buildAccountExport(clientReturning(), "owner", AT);
    if (result.status !== "complete") throw new Error("expected a complete export");
    const archive = JSON.parse(result.archive) as { generatedAt: string };
    expect(archive.generatedAt).toBe(AT);
  });

  it("declares the whole enumeration, including the tables it does not export", async () => {
    const result = await buildAccountExport(clientReturning(), "owner", AT);
    if (result.status !== "complete") throw new Error("expected a complete export");
    const archive = JSON.parse(result.archive) as {
      scope: {
        tablesCovered: number;
        tablesExported: number;
        withheldTables: readonly { table: string }[];
      };
    };

    expect(archive.scope.tablesCovered).toBe(ENUMERATION_COVERAGE.length);
    expect(archive.scope.tablesExported).toBe(ENUMERATED_TABLES.length);
    expect(archive.scope.withheldTables.map((entry) => entry.table)).toEqual(
      WITHHELD_TABLES.map((entry) => entry.table),
    );
  });
});

describe("2O-PRIVACY-005 / T-1: nothing secret and nothing foreign", () => {
  it("the credential ciphertext and the push capability never enter the archive", async () => {
    const result = await buildAccountExport(clientReturning(), "owner", AT);
    if (result.status !== "complete") throw new Error("expected a complete export");

    const archive = JSON.parse(result.archive) as { data: Record<string, Record<string, unknown>[]> };
    expect(archive.data.user_ai_credentials[0]).not.toHaveProperty("ciphertext");
    expect(archive.data.user_ai_credentials[0]).not.toHaveProperty("iv");
    expect(archive.data.push_subscriptions[0]).not.toHaveProperty("endpoint");
    expect(archive.data.push_subscriptions[0]).not.toHaveProperty("auth");
    expect(archive.data.push_subscriptions[0]).not.toHaveProperty("p256dh");
    expect(archive.data.entry_embeddings[0]).not.toHaveProperty("embedding");

    // The control: redaction removes the named columns and keeps the rest, so
    // "no ciphertext" is not satisfied by an empty row. `fingerprint` is kept
    // deliberately — it identifies which key is configured and is not the key.
    expect(archive.data.user_ai_credentials[0]).toHaveProperty("id");
    expect(archive.data.user_ai_credentials[0]).toHaveProperty("fingerprint", "fp-1234");
    // The entry text survives; only the derived vector is dropped.
    expect(archive.data.entry_embeddings[0]).toHaveProperty("content", "the entry text");

    // And no secret survives anywhere in the serialized archive — the assertion
    // a per-row check cannot make, because a leak could land in another table.
    for (const secret of ["SECRET", "P256", "AUTH", "push.test", "[0.1,0.2]"]) {
      expect(result.archive, `${secret} survived into the archive`).not.toContain(secret);
    }
  });

  it("a table with no withheld list keeps every column it has", async () => {
    // The other direction: redaction must not be quietly stripping everything.
    const result = await buildAccountExport(clientReturning(), "owner", AT);
    if (result.status !== "complete") throw new Error("expected a complete export");
    const archive = JSON.parse(result.archive) as { data: Record<string, Record<string, unknown>[]> };
    expect(archive.data.entries[0]).toEqual({
      id: "entries-0",
      user_id: "owner",
      created_at: AT,
    });
  });

  it("every read is scoped to the requesting user", async () => {
    // The unit-level half of T-1. The database-level half — against a foreign
    // row that exists — is `supabase/tests/phase_2o_privacy_enumeration.sql`,
    // because an assertion about RLS cannot be proved by a fixture that
    // implements it.
    const eq = vi.fn(() => ({ range: vi.fn(async () => ({ data: [], error: null })) }));
    const from = vi.fn(() => ({ select: vi.fn(() => ({ eq })) }));
    await buildAccountExport({ from } as never, "owner-under-test", AT);

    expect(eq).toHaveBeenCalledTimes(ENUMERATED_TABLES.length);
    for (const call of eq.mock.calls) {
      expect(call).toEqual(["user_id", "owner-under-test"]);
    }
  });
});
