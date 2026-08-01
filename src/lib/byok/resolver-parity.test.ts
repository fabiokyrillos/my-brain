import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

/**
 * BYOK.2 gate B7's types half, and `BYOK-RESOLVER-001`/`004` read from the
 * migration rather than from a comment.
 *
 * Three artifacts have to agree about these two functions and there is no
 * regeneration step available here — `supabase gen types typescript` refuses to
 * run without an access token even against a local `--db-url`, and planting a
 * credential-shaped string in the workflow was tried once and correctly rejected
 * by push protection. So the agreement is proven by content comparison, the way
 * Phase 2E established:
 *
 *   migration  --  the signature as declared
 *   types file --  the signature as TypeScript believes it
 *   pgTAP      --  the signature as Postgres actually built it
 *
 * This file compares the first two. `supabase/tests/byok_resolvers.sql` pins the
 * third against `pg_proc` and `pg_get_function_result`, including the mutation
 * proof that the no-`user_id` detector fires.
 */

const MIGRATION = "supabase/migrations/202608010066_byok_resolvers.sql";

function migrationSource(): string {
  return readFileSync(path.resolve(process.cwd(), MIGRATION), "utf8").replace(/\r\n/g, "\n");
}

/** One function's declaration, from `create or replace function` to its `$$`. */
function declaration(name: string): string {
  const source = migrationSource();
  const start = source.indexOf(`create or replace function public.${name}(`);
  if (start === -1) throw new Error(`public.${name} is not declared in ${MIGRATION}`);
  const end = source.indexOf("\nas $$", start);
  if (end === -1) throw new Error(`public.${name} has no body marker`);
  return source.slice(start, end);
}

/** The `returns table (...)` column names of one declaration. */
function returnedColumns(name: string): string[] {
  const block = declaration(name);
  const start = block.indexOf("returns table (");
  if (start === -1) throw new Error(`public.${name} does not return a table`);
  const body = block.slice(start + "returns table (".length, block.indexOf(")", start));
  return body
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0])
    .filter(Boolean);
}

type Functions = Database["public"]["Functions"];

/**
 * The generated row shapes, as values so they can be enumerated at runtime.
 *
 * `satisfies` makes `tsc` fail if a key is missing or misspelled, and the
 * assertions below fail if one is extra — the two halves are the
 * both-directions check a one-sided comparison would not give.
 */
const OWN_ROW = {
  ciphertext: "",
  iv: "",
  key_version: 0,
  provider: "",
  status: "",
} satisfies Functions["resolve_own_ai_credential"]["Returns"][number];

const JOB_ROW = {
  ciphertext: "",
  iv: "",
  key_version: 0,
  provider: "",
  status: "",
} satisfies Functions["resolve_job_ai_credential"]["Returns"][number];

describe("B7: the migration and the generated types declare the same resolvers", () => {
  it("resolve_own_ai_credential's returned columns match, in both directions", () => {
    expect(returnedColumns("resolve_own_ai_credential").sort()).toEqual(
      Object.keys(OWN_ROW).sort(),
    );
  });

  it("resolve_job_ai_credential's returned columns match, in both directions", () => {
    expect(returnedColumns("resolve_job_ai_credential").sort()).toEqual(
      Object.keys(JOB_ROW).sort(),
    );
  });

  it("the parse is not vacuous", () => {
    // Both assertions above would pass against two empty lists.
    expect(returnedColumns("resolve_own_ai_credential")).toHaveLength(5);
    expect(returnedColumns("resolve_job_ai_credential")).toHaveLength(5);
  });

  it("the job resolver takes exactly one argument, and it is a job id", () => {
    const signature = /create or replace function public\.resolve_job_ai_credential\(([^)]*)\)/.exec(
      migrationSource(),
    );
    expect(signature).not.toBeNull();
    expect(signature![1].trim()).toBe("p_job_id uuid");

    // And the generated type says the same thing.
    const args: keyof Functions["resolve_job_ai_credential"]["Args"] = "p_job_id";
    expect(args).toBe("p_job_id");
  });

  it("the synchronous resolver takes nothing at all", () => {
    expect(migrationSource()).toContain("create or replace function public.resolve_own_ai_credential()");
  });
});

describe("BYOK-RESOLVER-001: neither resolver accepts an owner", () => {
  it("no declaration contains a user_id-shaped parameter", () => {
    for (const name of ["resolve_own_ai_credential", "resolve_job_ai_credential"]) {
      const signature = /\(([^)]*)\)/.exec(declaration(name))![1];
      expect(signature, `${name} must not take an owner`).not.toMatch(/user_?id/i);
    }
  });

  it("the detector fires on a signature that does take one — executed, not read", () => {
    // The same mutation `byok_resolvers.sql` performs against a real function,
    // performed here against the parser. A detector nobody has watched fail is a
    // detector nobody has tested.
    const hostile = "create or replace function public.probe(p_user_id uuid)";
    expect(/\(([^)]*)\)/.exec(hostile)![1]).toMatch(/user_?id/i);
  });
});

describe("BYOK-RESOLVER-004: nothing in the chain decrypts", () => {
  it("no executable statement mentions decryption or a master key", () => {
    // Documentation stripped first, in **both** of the forms this migration uses:
    // `--` lines and `comment on … is '…'` statements. The header explains at
    // length why nothing here decrypts and why the master key is not in this
    // database, and each function carries a `comment on` saying the same to
    // anyone reading the catalog. A guard that forbids documenting the thing it
    // guards deletes the explanation that makes the rule survivable — the same
    // fix the parity lock and the locality guard both needed, hit a third time
    // here because a `comment on` body is prose that happens to live in SQL.
    const executable = migrationSource()
      .replace(/^\s*--[^\n]*$/gm, "")
      .replace(/comment on [\s\S]*?;\n/g, "");
    expect(executable).not.toMatch(
      /decrypt|pgcrypto|pgp_sym|BYOK_MASTER_KEY|BYOK_FINGERPRINT_PEPPER/i,
    );

    // Non-vacuity: the stripping must not have emptied the file.
    expect(executable).toContain("create or replace function public.resolve_own_ai_credential()");
    expect(executable.length).toBeGreaterThan(1000);
  });

  it("neither returns a plaintext-shaped column", () => {
    const suspicious = /\b(plaintext|api_?key|secret|token|raw|clear)\b/;
    for (const name of ["resolve_own_ai_credential", "resolve_job_ai_credential"]) {
      for (const column of returnedColumns(name)) {
        expect(column, `${name}.${column} reads like plaintext`).not.toMatch(suspicious);
      }
    }
    // Positively: the sealed envelope is what comes back.
    expect(returnedColumns("resolve_own_ai_credential")).toContain("ciphertext");
  });
});

describe("BYOK.2 adds no table, column, policy or table grant", () => {
  it("the migration declares only the two functions", () => {
    const source = migrationSource();
    expect(source).not.toMatch(/create table|alter table|create policy|drop policy/i);
    expect(
      [...source.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]).sort(),
    ).toEqual(["resolve_job_ai_credential", "resolve_own_ai_credential"]);
  });

  it("both are SECURITY DEFINER with an empty search_path, declared in the source", () => {
    for (const name of ["resolve_own_ai_credential", "resolve_job_ai_credential"]) {
      const block = declaration(name);
      expect(block, `${name} must be SECURITY DEFINER`).toMatch(/security definer/);
      expect(block, `${name} must pin an empty search_path`).toMatch(/set search_path = ''/);
    }
  });

  it("the grants are exactly the two the PRD names, and the revokes precede them", () => {
    const source = migrationSource();

    // Order matters: `create function` grants EXECUTE to PUBLIC, so a grant
    // written before its revoke would be undone by it.
    const ownRevoke = source.indexOf("revoke all on function public.resolve_own_ai_credential()");
    const ownGrant = source.indexOf("grant execute on function public.resolve_own_ai_credential()");
    const jobRevoke = source.indexOf("revoke all on function public.resolve_job_ai_credential(uuid)");
    const jobGrant = source.indexOf("grant execute on function public.resolve_job_ai_credential(uuid)");

    for (const [label, index] of Object.entries({ ownRevoke, ownGrant, jobRevoke, jobGrant })) {
      expect(index, `${label} must be present`).toBeGreaterThan(-1);
    }
    expect(ownRevoke).toBeLessThan(ownGrant);
    expect(jobRevoke).toBeLessThan(jobGrant);

    expect(
      [...source.matchAll(/grant execute on function public\.(\w+)[^\n]*\n\s*to (\w+);/g)].map(
        (match) => `${match[1]}->${match[2]}`,
      ).sort(),
    ).toEqual([
      "resolve_job_ai_credential->service_role",
      "resolve_own_ai_credential->authenticated",
    ]);
  });
});
