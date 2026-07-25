import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * PRD 2E-OPERATIONS-002: "generated types are regenerated whenever exposed
 * schema changes, and parity is proven by **content comparison**, not
 * asserted."
 *
 * Nothing in this repository proved that before. `src/lib/supabase/
 * database.types.ts` is the only description of the schema that `tsc` ever
 * sees, so a migration could add, rename or retype an RPC and every TypeScript
 * gate would stay green against a file describing a schema that no longer
 * exists.
 *
 * The obvious implementation — regenerate in CI and `diff` — was tried and
 * withdrawn. `supabase gen types typescript` refuses to start without an access
 * token even when pointed at a local `--db-url` it never leaves, and the only
 * way to satisfy that in an offline job is to plant a credential-shaped string
 * in the workflow. GitHub's push protection rejected exactly that, correctly.
 * Defeating a secret scanner to make a parity check pass is a worse outcome
 * than the drift the check exists to catch, so the check is done here instead,
 * against artifacts that are already in the repository:
 *
 *   migration  --  the schema as declared
 *   types file --  the schema as TypeScript believes it
 *   pgTAP      --  the schema as Postgres actually built it
 *
 * This file compares the first two by content. `phase_2e_task_command_matching
 * .sql` pins the third against `pg_proc.proargnames`, and the last assertion
 * below proves that pgTAP expectation is the same list this file derived from
 * the migration — so all three agree or something goes red.
 *
 * Its scope is honest: it covers the function this slice adds, not the whole
 * generated file. Whole-file regeneration remains the better check, and is
 * recorded in `docs/TODO.md` for whenever the job can obtain a real token.
 */

/**
 * Line endings normalized: this repository checks out CRLF on Windows and LF in
 * CI, and every pattern below is anchored on newlines. Without this the test
 * passes on one platform and fails to even parse on the other.
 */
function source(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8").replace(/\r\n/g, "\n");
}

const MIGRATION = "supabase/migrations/202607250056_phase_2e_task_command_matching.sql";
const PGTAP = "supabase/tests/phase_2e_task_command_matching.sql";
const TYPES = "src/lib/supabase/database.types.ts";
const FUNCTION = "list_task_command_candidates";

/** The mapping `supabase gen types typescript` applies. */
const SQL_TO_TS: Record<string, string> = {
  "text[]": "string[]",
  "uuid[]": "string[]",
  text: "string",
  uuid: "string",
  timestamptz: "string",
  integer: "number",
  boolean: "boolean",
};

type Declared = { readonly name: string; readonly sqlType: string; readonly hasDefault: boolean };

function parseMigration() {
  const sql = source(MIGRATION);
  const match = sql.match(
    new RegExp(
      `create or replace function public\\.${FUNCTION}\\(([\\s\\S]*?)\\)\\s*returns table \\(([\\s\\S]*?)\\)\\s*language sql`,
    ),
  );
  if (!match) throw new Error(`${MIGRATION} no longer declares ${FUNCTION} in the expected shape`);

  const parse = (block: string): Declared[] =>
    block
      .split(",")
      .map((line) => line.replace(/--.*$/gm, "").trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const parts = line.match(/^(\w+)\s+([a-z0-9]+(?:\[\])?)(\s+default\s+.+)?$/i);
        if (!parts) throw new Error(`cannot parse declaration: ${JSON.stringify(line)}`);
        return { name: parts[1], sqlType: parts[2].toLowerCase(), hasDefault: parts[3] !== undefined };
      });

  return { args: parse(match[1]), returns: parse(match[2]) };
}

function parseGeneratedTypes() {
  const types = source(TYPES);
  const block = types.match(
    new RegExp(`\\n      ${FUNCTION}: \\{\\n        Args: \\{([\\s\\S]*?)\\n        \\}\\n        Returns: \\{([\\s\\S]*?)\\n        \\}\\[\\]\\n      \\}`),
  );
  if (!block) throw new Error(`${TYPES} does not declare ${FUNCTION} in the generated shape`);

  const parse = (body: string) =>
    body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const parts = line.match(/^(\w+)(\?)?: (.+)$/);
        if (!parts) throw new Error(`cannot parse generated member: ${JSON.stringify(line)}`);
        return { name: parts[1], optional: parts[2] === "?", tsType: parts[3] };
      });

  return { args: parse(block[1]), returns: parse(block[2]) };
}

describe(`${FUNCTION} generated-type parity (2E-OPERATIONS-002)`, () => {
  const migration = parseMigration();
  const generated = parseGeneratedTypes();

  it("declares the same arguments the migration does", () => {
    expect(generated.args.map((arg) => arg.name).sort()).toEqual(
      migration.args.map((arg) => arg.name).sort(),
    );
  });

  it("marks exactly the defaulted arguments optional", () => {
    const optionalInTypes = generated.args.filter((arg) => arg.optional).map((arg) => arg.name).sort();
    const defaultedInSql = migration.args.filter((arg) => arg.hasDefault).map((arg) => arg.name).sort();

    expect(optionalInTypes).toEqual(defaultedInSql);
    // The one required argument is the eligibility array. If it ever became
    // optional, a caller could omit it and the RPC would fall back to a default
    // that decides candidacy — the taxonomy would stop being the source of
    // truth (2E-MATCH-002).
    expect(defaultedInSql).not.toContain("p_eligible_statuses");
  });

  it("types every argument the way the generator would", () => {
    for (const arg of migration.args) {
      const declared = generated.args.find((candidate) => candidate.name === arg.name);
      expect(declared?.tsType, `argument ${arg.name}`).toBe(SQL_TO_TS[arg.sqlType]);
    }
  });

  it("declares the same result columns the migration does", () => {
    expect(generated.returns.map((column) => column.name).sort()).toEqual(
      migration.returns.map((column) => column.name).sort(),
    );
  });

  it("types every result column the way the generator would", () => {
    for (const column of migration.returns) {
      const declared = generated.returns.find((candidate) => candidate.name === column.name);
      expect(declared?.tsType, `column ${column.name}`).toBe(SQL_TO_TS[column.sqlType]);
    }
  });

  it("lists arguments and columns alphabetically, as the generator emits them", () => {
    const names = (entries: ReadonlyArray<{ name: string }>) => entries.map((entry) => entry.name);
    expect(names(generated.args)).toEqual([...names(generated.args)].sort());
    expect(names(generated.returns)).toEqual([...names(generated.returns)].sort());
  });

  it("agrees with the signature pgTAP pins against the real catalog", () => {
    // `pg_proc.proargnames` is the input parameters in declaration order
    // followed by the RETURNS TABLE columns in declaration order. Pinning that
    // array is what makes the database the third party to this agreement
    // instead of leaving two files to agree with each other about a schema
    // neither has seen.
    const expected = [...migration.args, ...migration.returns]
      .map((entry) => `'${entry.name}'`)
      .join(", ");

    expect(source(PGTAP)).toContain(`array[${expected}]`);
  });
});
