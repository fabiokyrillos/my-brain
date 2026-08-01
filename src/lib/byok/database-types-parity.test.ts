import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

/**
 * Implementation-plan task 1.2 — "regenerate `database.types.ts`; content-identical
 * diff review" — done the way this repository can actually do it.
 *
 * `supabase gen types typescript` refuses to run without an access token even
 * when pointed at a local `--db-url` it never leaves. The only way to satisfy
 * that in an offline job is to plant a credential-shaped string in the workflow,
 * which was tried once and **correctly rejected by GitHub push protection**.
 * Defeating a secret scanner to make a parity check pass is a worse outcome than
 * the drift the check exists to catch, so the answer here is the one
 * `src/features/task-commands/database-types-parity.test.ts` established for
 * Phase 2E: compare artifacts already in the repository.
 *
 *   migration  --  the schema as declared
 *   types file --  the schema as TypeScript believes it
 *   pgTAP      --  the schema as Postgres actually built it
 *
 * This file compares the first two by content, in **both directions**, so a
 * column added to one and not the other fails whichever side it was added to.
 * `supabase/tests/byok_credential_store.sql` pins the third with `has_column`,
 * and its column list is derived from the same parse — so all three agree or
 * something goes red.
 */

const MIGRATION = "supabase/migrations/202608010065_byok_credential_store.sql";

function migrationSource(): string {
  return readFileSync(path.resolve(process.cwd(), MIGRATION), "utf8").replace(/\r\n/g, "\n");
}

/**
 * The column names of one `create table` block, in declaration order.
 *
 * Constraint lines are excluded by requiring a type token after the name: every
 * real column is `name type …`, while every table constraint begins with
 * `constraint`. Parsing rather than listing is the whole point — a hand-written
 * list here would drift from the migration exactly as the types file might.
 */
function migrationColumns(table: string): string[] {
  const source = migrationSource();
  const start = source.indexOf(`create table public.${table} (`);
  if (start === -1) throw new Error(`create table public.${table} not found in ${MIGRATION}`);

  // The block ends at the first `);` that begins a line — the statement
  // terminator. Column and constraint bodies are indented, so this cannot cut
  // the block short on a nested `)`.
  const end = source.indexOf("\n);", start);
  if (end === -1) throw new Error(`unterminated create table for ${table}`);

  const body = source.slice(source.indexOf("(", start) + 1, end);
  const columns: string[] = [];
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("--") || trimmed.startsWith("constraint")) continue;
    const match = /^([a-z_]+)\s+(uuid|text|bytea|smallint|timestamptz|boolean|integer|jsonb)\b/.exec(
      trimmed,
    );
    if (match) columns.push(match[1]);
  }
  return columns;
}

type Tables = Database["public"]["Tables"];

/**
 * The declared columns of a generated `Row` type.
 *
 * Read from a value rather than from the type, because a type cannot be
 * enumerated at runtime. The object below is `satisfies`-checked against the
 * real `Row`, so `tsc` fails if a key is missing or misspelled and this test
 * fails if one is extra — the two halves together are the both-directions check.
 */
const CREDENTIAL_ROW = {
  ciphertext: null,
  created_at: "",
  fingerprint: null,
  iv: null,
  key_version: null,
  last_failure_code: null,
  provider: "",
  status: "",
  updated_at: "",
  user_id: "",
  validated_at: null,
} satisfies Tables["user_ai_credentials"]["Row"];

const ATTEMPT_ROW = {
  attempted_at: "",
  id: "",
  outcome: "",
  user_id: "",
} satisfies Tables["credential_validation_attempts"]["Row"];

describe("A8: the migration and the generated types describe the same tables", () => {
  it("user_ai_credentials columns match, in both directions", () => {
    expect(migrationColumns("user_ai_credentials").sort()).toEqual(
      Object.keys(CREDENTIAL_ROW).sort(),
    );
  });

  it("credential_validation_attempts columns match, in both directions", () => {
    expect(migrationColumns("credential_validation_attempts").sort()).toEqual(
      Object.keys(ATTEMPT_ROW).sort(),
    );
  });

  it("the parse is not vacuous", () => {
    // Every assertion above would pass against two empty lists. This is what
    // stops a regex that silently stopped matching from reporting agreement.
    expect(migrationColumns("user_ai_credentials")).toHaveLength(11);
    expect(migrationColumns("credential_validation_attempts")).toHaveLength(4);
    expect(migrationColumns("user_ai_credentials")).toContain("ciphertext");
    expect(migrationColumns("credential_validation_attempts")).toContain("outcome");
  });

  it("BYOK-SCHEMA-002: no plaintext column exists, under any name", () => {
    // The requirement is absolute, so the check is over the *whole* column list
    // rather than over a list of names somebody remembered to forbid.
    const suspicious = /\b(plaintext|api_?key|secret|token|credential_value|raw|clear)\b/;
    for (const column of migrationColumns("user_ai_credentials")) {
      expect(column, `${column} reads like a plaintext column`).not.toMatch(suspicious);
    }
    // And positively: the only key-bearing column is the sealed one.
    expect(migrationColumns("user_ai_credentials")).toContain("ciphertext");
  });

  it("BYOK-SCHEMA-007: the attempts table stores no fingerprint and no key material", () => {
    const columns = migrationColumns("credential_validation_attempts");
    for (const forbidden of ["fingerprint", "ciphertext", "iv", "key_version", "provider"]) {
      expect(columns).not.toContain(forbidden);
    }
  });

  it("BYOK-SCHEMA-009: the migration adds no column to any other table", () => {
    // The named tables, plus a general check that nothing else is altered:
    // `alter table` appears nowhere in this migration at all.
    const source = migrationSource();
    expect(source).not.toMatch(/alter table\s+public\.\w+\s+add column/i);

    const altered = [...source.matchAll(/alter table\s+(?:only\s+)?public\.(\w+)/gi)].map(
      (match) => match[1],
    );
    // The only `alter table` statements are the four RLS toggles on the two new
    // tables. Nothing pre-existing is touched.
    expect([...new Set(altered)].sort()).toEqual([
      "credential_validation_attempts",
      "user_ai_credentials",
    ]);
  });
});

describe("A8: the migration is the only one this slice adds", () => {
  it("declares exactly two tables and no function beyond the touch trigger", () => {
    const source = migrationSource();
    expect([...source.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]).sort()).toEqual([
      "credential_validation_attempts",
      "user_ai_credentials",
    ]);
    expect(
      [...source.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]),
    ).toEqual(["touch_user_ai_credentials_updated_at"]);
  });

  it("adds no resolver — BYOK.2 owns those, and a stray one here would ship unreviewed", () => {
    const source = migrationSource();
    expect(source).not.toMatch(/resolve_own_ai_credential|resolve_job_ai_credential/);
    expect(source).not.toMatch(/security definer/i);
  });
});
