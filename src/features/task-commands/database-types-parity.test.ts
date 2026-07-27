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
 * .sql` pins the third against `pg_proc.proargnames`, and the candidate RPC's
 * last assertion below proves that pgTAP expectation is the same list this file
 * derived from the migration — so all three agree or something goes red.
 *
 * Its scope is honest: it covers the two functions Phase 2E adds a TypeScript
 * caller for, not the whole generated file. Whole-file regeneration remains the
 * better check, and is recorded in `docs/TODO.md` for whenever the job can
 * obtain a real token.
 *
 * **Two return shapes, one parser.** Slice 2E.2's candidate RPC is
 * `returns table (...)`; Slice 2E.4's mutation RPC is `returns jsonb`, a scalar,
 * which the generator emits as a bare `Returns: Json` with no `[]`. The original
 * parser hardcoded `returns table \(` and `language sql`, so it did not merely
 * fail against the new function — it **threw**, because an unparseable
 * declaration raises here rather than failing an assertion. A parity check that
 * crashes on a legal declaration proves nothing about parity, which is why the
 * shape is now read out of the migration instead of assumed.
 */

/**
 * Line endings normalized: this repository checks out CRLF on Windows and LF in
 * CI, and every pattern below is anchored on newlines. Without this the test
 * passes on one platform and fails to even parse on the other.
 */
function source(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8").replace(/\r\n/g, "\n");
}

/**
 * The migration holding each function's CURRENT definition.
 *
 * Migrations are append-only, so `create or replace` in a later file supersedes
 * an earlier declaration and parity has to be proven against the later one.
 * `202607260059` remains current for `list_task_command_candidates` and the
 * destructive confirmation issuer. `202607270060` re-declares
 * `apply_task_command` to centralize the expanded creation action family.
 * Pointing any constant at an earlier declaration would prove parity against a
 * function the database has replaced.
 */
const CANDIDATES_MIGRATION =
  "supabase/migrations/202607260059_phase_2e_destructive_confirmation.sql";
const CANDIDATES_PGTAP = "supabase/tests/phase_2e_task_command_matching.sql";
const APPLY_MIGRATION = "supabase/migrations/202607270060_phase_2e_no_match_task_creation.sql";
const APPLY_PGTAP = "supabase/tests/phase_2e_task_command_apply.sql";
const CONFIRMATION_MIGRATION =
  "supabase/migrations/202607260059_phase_2e_destructive_confirmation.sql";
const CONFIRMATION_PGTAP = "supabase/tests/phase_2e_task_command_destructive.sql";
const CREATION_MIGRATION =
  "supabase/migrations/202607270060_phase_2e_no_match_task_creation.sql";
const CREATION_PGTAP = "supabase/tests/phase_2e_task_command_creation.sql";
const TYPES = "src/lib/supabase/database.types.ts";

/**
 * The mapping `supabase gen types typescript` applies.
 *
 * `jsonb` is `Json`, the alias the generated file declares at its top and uses
 * for every jsonb argument already in it (`confirm_entry_task_candidates_v6`'s
 * `p_candidate_edits`, and so on). It had to be added for Slice 2E.4: a type
 * missing from this map is an `undefined` expectation, which `toBe` reports as a
 * mismatch against whatever the types file says rather than as the omission it is.
 */
const SQL_TO_TS: Record<string, string> = {
  "text[]": "string[]",
  "uuid[]": "string[]",
  text: "string",
  uuid: "string",
  timestamptz: "string",
  integer: "number",
  boolean: "boolean",
  jsonb: "Json",
};

type Declared = { readonly name: string; readonly sqlType: string; readonly hasDefault: boolean };

/** A `returns table (...)` projection, or a scalar return type. */
type DeclaredReturns =
  | { readonly kind: "table"; readonly columns: readonly Declared[] }
  | { readonly kind: "scalar"; readonly sqlType: string };

type FunctionSpec = {
  readonly fn: string;
  readonly migration: string;
  /** Pinned, because `language sql` and `language plpgsql` are different contracts. */
  readonly language: "sql" | "plpgsql";
};

const CANDIDATES: FunctionSpec = {
  fn: "list_task_command_candidates",
  migration: CANDIDATES_MIGRATION,
  language: "sql",
};

const APPLY: FunctionSpec = {
  fn: "apply_task_command",
  migration: APPLY_MIGRATION,
  language: "plpgsql",
};

const CONFIRMATION: FunctionSpec = {
  fn: "issue_task_command_confirmation",
  migration: CONFIRMATION_MIGRATION,
  language: "plpgsql",
};

const CREATION_PREVIEW: FunctionSpec = {
  fn: "preview_task_command_creation",
  migration: CREATION_MIGRATION,
  language: "plpgsql",
};

const CREATION_CONFIRMATION: FunctionSpec = {
  fn: "issue_task_command_creation_confirmation",
  migration: CREATION_MIGRATION,
  language: "plpgsql",
};

const CREATION_APPLY: FunctionSpec = {
  fn: "create_task_command",
  migration: CREATION_MIGRATION,
  language: "plpgsql",
};

// Comments are stripped before the block is split, not after. Slice 2E.3's
// amendment put explanatory prose *inside* both the parameter list and the
// RETURNS TABLE, and prose contains commas — so splitting first tore a
// sentence into fragments that no longer looked like comments, and this file
// stopped parsing the migration at all rather than disagreeing with it. A
// parity check that throws on a legal declaration proves nothing about parity.
function parseDeclarations(block: string): Declared[] {
  return block
    .replace(/--.*$/gm, "")
    .split(",")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.match(/^(\w+)\s+([a-z0-9]+(?:\[\])?)(\s+default\s+.+)?$/i);
      if (!parts) throw new Error(`cannot parse declaration: ${JSON.stringify(line)}`);
      return { name: parts[1], sqlType: parts[2].toLowerCase(), hasDefault: parts[3] !== undefined };
    });
}

function parseMigration(spec: FunctionSpec): { args: Declared[]; returns: DeclaredReturns } {
  const sql = source(spec.migration);
  const match = sql.match(
    new RegExp(
      `create or replace function public\\.${spec.fn}\\(([\\s\\S]*?)\\)`
      + `\\s*returns\\s+([\\s\\S]*?)\\s*language\\s+${spec.language}\\b`,
    ),
  );
  if (!match) {
    throw new Error(`${spec.migration} no longer declares ${spec.fn} in the expected shape`);
  }

  const args = parseDeclarations(match[1]);
  const returnsBlock = match[2].trim();
  const table = returnsBlock.match(/^table\s*\(([\s\S]*)\)$/i);
  if (table) return { args, returns: { kind: "table", columns: parseDeclarations(table[1]) } };

  // Anchored, so a shape this parser does not understand throws instead of being
  // silently recorded as a scalar named after the first word of something else.
  if (!/^[a-z0-9]+(?:\[\])?$/i.test(returnsBlock)) {
    throw new Error(`cannot parse return shape: ${JSON.stringify(returnsBlock)}`);
  }
  return { args, returns: { kind: "scalar", sqlType: returnsBlock.toLowerCase() } };
}

type GeneratedMember = { readonly name: string; readonly optional: boolean; readonly tsType: string };

type GeneratedReturns =
  | { readonly kind: "table"; readonly columns: readonly GeneratedMember[] }
  | { readonly kind: "scalar"; readonly tsType: string };

function parseMembers(body: string): GeneratedMember[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.match(/^(\w+)(\?)?: (.+)$/);
      if (!parts) throw new Error(`cannot parse generated member: ${JSON.stringify(line)}`);
      return { name: parts[1], optional: parts[2] === "?", tsType: parts[3] };
    });
}

function parseGeneratedTypes(spec: FunctionSpec): {
  args: GeneratedMember[];
  returns: GeneratedReturns;
} {
  const types = source(TYPES);
  const block = types.match(
    new RegExp(
      `\\n      ${spec.fn}: \\{\\n        Args: \\{([\\s\\S]*?)\\n        \\}\\n`
      + `        Returns: ([\\s\\S]*?)\\n      \\}`,
    ),
  );
  if (!block) throw new Error(`${TYPES} does not declare ${spec.fn} in the generated shape`);

  const args = parseMembers(block[1]);
  const returnsBlock = block[2];
  // The generator emits a set-returning function as `{ ... }[]` and a scalar as a
  // bare type name. The trailing `[]` is the only thing that distinguishes them.
  const table = returnsBlock.match(/^\{([\s\S]*)\n        \}\[\]$/);
  if (table) return { args, returns: { kind: "table", columns: parseMembers(table[1]) } };
  return { args, returns: { kind: "scalar", tsType: returnsBlock.trim() } };
}

/**
 * The assertions both functions owe, registered inside each `describe`.
 *
 * Shared rather than copied: the two blocks below differ in what their *return*
 * shape and their pgTAP counterpart prove, not in what an argument list means,
 * and a second copy of the argument rules is a second place for them to fall
 * behind the generator's behaviour.
 */
function describeArgumentParity(
  migration: { args: Declared[] },
  generated: { args: GeneratedMember[] },
): void {
  it("declares the same arguments the migration does", () => {
    expect(generated.args.map((arg) => arg.name).sort()).toEqual(
      migration.args.map((arg) => arg.name).sort(),
    );
  });

  it("marks exactly the defaulted arguments optional", () => {
    const optionalInTypes = generated.args.filter((arg) => arg.optional).map((arg) => arg.name).sort();
    const defaultedInSql = migration.args.filter((arg) => arg.hasDefault).map((arg) => arg.name).sort();

    expect(optionalInTypes).toEqual(defaultedInSql);
  });

  it("types every argument the way the generator would", () => {
    for (const arg of migration.args) {
      const declared = generated.args.find((candidate) => candidate.name === arg.name);
      expect(declared?.tsType, `argument ${arg.name}`).toBe(SQL_TO_TS[arg.sqlType]);
    }
  });

  it("lists arguments alphabetically, as the generator emits them", () => {
    const names = generated.args.map((arg) => arg.name);
    expect(names).toEqual([...names].sort());
  });
}

describe(`${CANDIDATES.fn} generated-type parity (2E-OPERATIONS-002)`, () => {
  const migration = parseMigration(CANDIDATES);
  const generated = parseGeneratedTypes(CANDIDATES);

  describeArgumentParity(migration, generated);

  it("is still the set-returning projection both sides were written against", () => {
    // The shape is now read rather than assumed, so it has to be asserted: a
    // `returns table` quietly becoming a scalar would make every column
    // assertion below vacuous instead of red.
    expect(migration.returns.kind).toBe("table");
    expect(generated.returns.kind).toBe("table");
  });

  it("keeps the eligibility array required", () => {
    // If it ever became optional, a caller could omit it and the RPC would fall
    // back to a default that decides candidacy — the taxonomy would stop being
    // the source of truth (2E-MATCH-002).
    const defaultedInSql = migration.args.filter((arg) => arg.hasDefault).map((arg) => arg.name);
    expect(defaultedInSql).not.toContain("p_eligible_statuses");
  });

  it("declares the same result columns the migration does", () => {
    if (migration.returns.kind !== "table" || generated.returns.kind !== "table") {
      throw new Error(`${CANDIDATES.fn} is no longer a set-returning function`);
    }
    expect(generated.returns.columns.map((column) => column.name).sort()).toEqual(
      migration.returns.columns.map((column) => column.name).sort(),
    );
  });

  it("types every result column the way the generator would", () => {
    if (migration.returns.kind !== "table" || generated.returns.kind !== "table") {
      throw new Error(`${CANDIDATES.fn} is no longer a set-returning function`);
    }
    for (const column of migration.returns.columns) {
      const declared = generated.returns.columns.find(
        (candidate) => candidate.name === column.name,
      );
      expect(declared?.tsType, `column ${column.name}`).toBe(SQL_TO_TS[column.sqlType]);
    }
  });

  it("lists result columns alphabetically, as the generator emits them", () => {
    if (generated.returns.kind !== "table") {
      throw new Error(`${CANDIDATES.fn} is no longer a set-returning function`);
    }
    const names = generated.returns.columns.map((column) => column.name);
    expect(names).toEqual([...names].sort());
  });

  it("agrees with the signature pgTAP pins against the real catalog", () => {
    // `pg_proc.proargnames` is the input parameters in declaration order
    // followed by the RETURNS TABLE columns in declaration order. Pinning that
    // array is what makes the database the third party to this agreement
    // instead of leaving two files to agree with each other about a schema
    // neither has seen.
    if (migration.returns.kind !== "table") {
      throw new Error(`${CANDIDATES.fn} is no longer a set-returning function`);
    }
    const expected = [...migration.args, ...migration.returns.columns]
      .map((entry) => `'${entry.name}'`)
      .join(", ");

    expect(source(CANDIDATES_PGTAP)).toContain(`array[${expected}]`);
  });
});

describe(`${APPLY.fn} generated-type parity (2E-OPERATIONS-002)`, () => {
  const migration = parseMigration(APPLY);
  const generated = parseGeneratedTypes(APPLY);

  describeArgumentParity(migration, generated);

  it("returns a scalar jsonb, which the generator emits as Json", () => {
    // `returns jsonb` rather than `returns table`: there are no result column
    // names to compare, and the entire result contract is the jsonb shape
    // `apply.ts` validates. Getting this wrong in the types file would type the
    // result as `Json[]` and make `parseApplyResult` reject every real answer.
    expect(migration.returns.kind).toBe("scalar");
    if (migration.returns.kind !== "scalar" || generated.returns.kind !== "scalar") {
      throw new Error(`${APPLY.fn} no longer returns a scalar`);
    }
    expect(migration.returns.sqlType).toBe("jsonb");
    expect(generated.returns.tsType).toBe(SQL_TO_TS[migration.returns.sqlType]);
    expect(generated.returns.tsType).toBe("Json");
  });

  it("takes exactly the seven arguments the mutation contract declares", () => {
    expect(migration.args.map((arg) => arg.name)).toEqual([
      "p_task_id",
      "p_action",
      "p_patch",
      "p_pre_state",
      "p_observed_before",
      "p_policy_version",
      "p_operation_key",
    ]);
  });

  it("defaults none of them, so no gate can be skipped by omission", () => {
    // Every argument is load-bearing. A defaulted `p_pre_state` would make the
    // twelve-column staleness gate satisfiable by omission (2E-UPDATE-003); a
    // defaulted `p_operation_key` would make the idempotency reservation
    // optional (2E-IDEMPOTENCY-001). `confirm_entry_task_candidates_v6` defaults
    // nothing either, for the same reason (`202607220044:97-108`).
    expect(migration.args.filter((arg) => arg.hasDefault)).toEqual([]);
    expect(generated.args.filter((arg) => arg.optional)).toEqual([]);
  });

  it("does not take the owner as an argument", () => {
    // `task_command_fingerprint` does, because it is pure and hashes whatever it
    // is given. This one derives the owner from `auth.uid()`: a caller that could
    // name the owner could name another one, and inside a `SECURITY DEFINER`
    // function that predicate is the entire tenant boundary (2E-OWNERSHIP-001).
    expect(migration.args.map((arg) => arg.name)).not.toContain("p_owner_id");
    expect(generated.args.map((arg) => arg.name)).not.toContain("p_owner_id");
  });

  it("agrees with the signature pgTAP pins against the real catalog", () => {
    // The third party. Without this, the migration and the hand-written types
    // file only agree with *each other* about a schema neither has seen — which
    // is exactly the risk ADR-041 accepted when it gave up `supabase gen types`,
    // and exactly why 2E-OPERATIONS-002 asks for parity by content comparison
    // rather than by assertion. `list_task_command_candidates` is pinned three
    // ways at `phase_2e_task_command_matching.sql:78-83`; this closes the same
    // loop for the mutation RPC.
    //
    // `proargnames` here is the seven input parameters and nothing else:
    // `apply_task_command` returns a scalar jsonb, so unlike the candidate RPC
    // there are no RETURNS TABLE column names appended to the array.
    const expected = migration.args.map((arg) => `'${arg.name}'`).join(", ");

    expect(source(APPLY_PGTAP)).toContain(`array[${expected}]`);
  });

  it("pins the absence of defaults against the real catalog too", () => {
    // The TypeScript half above reads `default` out of the migration text. This
    // asserts the pgTAP file makes Postgres itself say the same thing, so a
    // future `create or replace` that adds a default cannot pass by editing one
    // file. `pronargdefaults` is a `smallint`, which is why the pgTAP assertion
    // casts its literal.
    expect(source(APPLY_PGTAP)).toContain("pronargdefaults");
    expect(source(APPLY_PGTAP)).toContain("0::smallint");
  });
});

describe(`${CONFIRMATION.fn} generated-type parity (2E-OPERATIONS-002)`, () => {
  const migration = parseMigration(CONFIRMATION);
  const generated = parseGeneratedTypes(CONFIRMATION);

  describeArgumentParity(migration, generated);

  it("returns a scalar jsonb, which the generator emits as Json", () => {
    expect(migration.returns.kind).toBe("scalar");
    if (migration.returns.kind !== "scalar" || generated.returns.kind !== "scalar") {
      throw new Error(`${CONFIRMATION.fn} no longer returns a scalar`);
    }
    expect(migration.returns.sqlType).toBe("jsonb");
    expect(generated.returns.tsType).toBe("Json");
  });

  it("takes the identical seven arguments the apply RPC takes, in the identical order", () => {
    // Not a coincidence and not decoration: `issueTaskCommandConfirmation` builds
    // its payload with `buildApplyPayload`, the same function `applyTaskCommand`
    // uses, precisely so the two calls cannot send different values. That only
    // works while the two signatures agree, and this is what makes a divergence
    // fail here rather than as a `2E_CONFIRMATION_REQUIRED` on a user's first
    // cancellation — the confirmation would be bound to a digest the apply never
    // derives, and the refusal would be indistinguishable from never having
    // confirmed at all.
    const applyArgs = parseMigration(APPLY).args.map((arg) => arg.name);
    expect(migration.args.map((arg) => arg.name)).toEqual(applyArgs);
  });

  it("defaults none of them, and does not take the owner", () => {
    // Same reasoning as the apply RPC: a defaulted argument is a binding that can
    // be skipped by omission, and an owner argument is an owner a caller could
    // name. 2E-DESTRUCTIVE-002's "bound to owner" is `auth.uid()` or it is
    // nothing.
    expect(migration.args.filter((arg) => arg.hasDefault)).toEqual([]);
    expect(generated.args.filter((arg) => arg.optional)).toEqual([]);
    expect(migration.args.map((arg) => arg.name)).not.toContain("p_owner_id");
  });

  it("agrees with the signature pgTAP pins against the real catalog", () => {
    const expected = migration.args.map((arg) => `'${arg.name}'`).join(", ");

    expect(source(CONFIRMATION_PGTAP)).toContain(`array[${expected}]`);
  });
});

for (const spec of [CREATION_PREVIEW, CREATION_CONFIRMATION, CREATION_APPLY]) {
  describe(`${spec.fn} generated-type parity (2E-OPERATIONS-002)`, () => {
    const migration = parseMigration(spec);
    const generated = parseGeneratedTypes(spec);

    describeArgumentParity(migration, generated);

    it("returns the scalar jsonb its strict TypeScript parser consumes", () => {
      expect(migration.returns.kind).toBe("scalar");
      if (migration.returns.kind !== "scalar" || generated.returns.kind !== "scalar") {
        throw new Error(`${spec.fn} no longer returns a scalar`);
      }
      expect(migration.returns.sqlType).toBe("jsonb");
      expect(generated.returns.tsType).toBe("Json");
    });

    it("takes the identical six server-bound creation values in the identical order", () => {
      expect(migration.args.map((arg) => arg.name)).toEqual([
        "p_action",
        "p_title_words",
        "p_patch",
        "p_observed_before",
        "p_policy_version",
        "p_operation_key",
      ]);
    });

    it("defaults none of the binding and never lets the caller name an owner", () => {
      expect(migration.args.filter((arg) => arg.hasDefault)).toEqual([]);
      expect(generated.args.filter((arg) => arg.optional)).toEqual([]);
      expect(migration.args.map((arg) => arg.name)).not.toContain("p_owner_id");
    });

    it("agrees with the signature pgTAP pins against the real catalog", () => {
      const expected = migration.args.map((arg) => `'${arg.name}'`).join(", ");
      expect(source(CREATION_PGTAP)).toContain(`array[${expected}]`);
    });
  });
}
