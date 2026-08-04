/**
 * SH.3's guards: the administrative boundary has exactly one home, the operator
 * CLI refuses before it acts, and the three refusal vocabularies share nothing.
 *
 * SH-ADMIN-002, SH-ADMIN-003, SH-SUSPEND-009, T-10.
 *
 * These read repository text and pure exported functions — no database, no
 * network — so they run in the `app` CI job beside the rest of the closeout
 * family.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatStatusLine,
  parseArguments,
  UsageError,
  VERBS,
} from "../../../scripts/account-lifecycle-admin.mjs";

const REPO = process.cwd();
const MIGRATION = readFileSync(
  join(REPO, "supabase/migrations/202608040073_account_lifecycle_admin.sql"),
  "utf8",
);

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("--"))
    .join("\n");
}

function walk(directory: string, found: string[]): void {
  for (const entry of readdirSync(join(REPO, directory))) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const relative = `${directory}/${entry}`;
    if (statSync(join(REPO, relative)).isDirectory()) {
      walk(relative, found);
      continue;
    }
    if ([".ts", ".tsx", ".mjs"].some((extension) => entry.endsWith(extension))) {
      found.push(relative);
    }
  }
}

// ---------------------------------------------------------------------------
// SH-ADMIN-003 — the lifecycle transitions have exactly one caller
// ---------------------------------------------------------------------------

/**
 * Every site that names an administrative lifecycle RPC, classified.
 *
 * The pattern the deletion-capability guard established: a one-directional
 * allowlist lets a second holder be added by appending a line, so both
 * directions are compared. `database.types.ts` is generated from the schema and
 * necessarily names every RPC — it is listed with its class rather than skipped
 * by scan scope, because a skipped path is where the next holder would go.
 */
const ADMIN_RPC_CALLER_ALLOWLIST: Readonly<Record<string, { class: string; reason: string }>> = {
  "scripts/account-lifecycle-admin.mjs": {
    class: "operator-cli",
    reason:
      "ADR-075: the operator surface. Holds the service-role key it already had and calls the DEFINER functions; enforces nothing the database does not.",
  },
  "src/lib/supabase/database.types.ts": {
    class: "generated-types",
    reason: "generated from the schema; naming an RPC is not calling one",
  },
};

const ADMIN_RPCS = [
  "suspend_account",
  "reactivate_account",
  "begin_account_deletion_admin",
  "admin_account_lifecycle_status",
] as const;

function callersOfAdminRpcs(): string[] {
  const files: string[] = [];
  for (const root of ["src", "scripts", "supabase/functions", "e2e"]) walk(root, files);
  return files
    .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
    .filter((file) => {
      const source = stripComments(readFileSync(join(REPO, file), "utf8"));
      return ADMIN_RPCS.some((rpc) => source.includes(rpc));
    })
    .sort();
}

describe("SH-ADMIN-003: the administrative boundary has one caller", () => {
  const callers = callersOfAdminRpcs();
  const allowed = Object.keys(ADMIN_RPC_CALLER_ALLOWLIST).sort();

  it("every site naming an admin RPC is on the allowlist", () => {
    for (const caller of callers) {
      expect(allowed, `${caller} reaches the admin boundary and is not allowlisted`).toContain(
        caller,
      );
    }
  });

  it("every allowlisted site still names one -- no stale entries", () => {
    for (const entry of allowed) {
      expect(callers, `${entry} is allowlisted but names no admin RPC`).toContain(entry);
    }
  });

  it("exactly one executable caller exists, and it is the operator CLI", () => {
    const executable = Object.entries(ADMIN_RPC_CALLER_ALLOWLIST)
      .filter(([, entry]) => entry.class === "operator-cli")
      .map(([file]) => file);
    expect(executable).toEqual(["scripts/account-lifecycle-admin.mjs"]);
  });

  it("T-10: no Edge Function and no route reaches the admin boundary", () => {
    // The threat model's over-broad service-role endpoint is unbuildable by
    // absence: nothing under supabase/functions or src/app names these RPCs.
    expect(callers.filter((file) => file.startsWith("supabase/functions"))).toEqual([]);
    expect(callers.filter((file) => file.startsWith("src/app"))).toEqual([]);
    expect(callers.filter((file) => file.startsWith("src/features"))).toEqual([]);
  });

  it("every allowlist entry states its class and why", () => {
    for (const [file, entry] of Object.entries(ADMIN_RPC_CALLER_ALLOWLIST)) {
      expect(entry.class.trim(), `${file} has no class`).not.toBe("");
      expect(entry.reason.trim(), `${file} has no stated reason`).not.toBe("");
    }
  });
});

// ---------------------------------------------------------------------------
// SH-ADMIN-002 — the CLI refuses before it acts
// ---------------------------------------------------------------------------

const ACCOUNT = "11111111-1111-4111-8111-111111111111";

describe("SH-ADMIN-002: the operator CLI", () => {
  it("dry-runs by default: nothing is applied without --apply", () => {
    const parsed = parseArguments([
      "--suspend",
      "--id",
      ACCOUNT,
      "--reason",
      "operator_suspension_abuse",
    ]);
    expect(parsed.apply).toBe(false);
    expect(parsed.verb).toBe("suspend");
  });

  it("--apply is explicit and never inferred", () => {
    const parsed = parseArguments([
      "--reactivate",
      "--email",
      "someone@example.test",
      "--reason",
      "operator_reactivation",
      "--apply",
    ]);
    expect(parsed.apply).toBe(true);
  });

  it.each([
    { why: "no verb", argv: ["--id", ACCOUNT] },
    {
      why: "two verbs",
      argv: ["--suspend", "--reactivate", "--id", ACCOUNT, "--reason", "operator_suspension"],
    },
    { why: "no account", argv: ["--suspend", "--reason", "operator_suspension"] },
    {
      why: "two selectors",
      argv: ["--suspend", "--id", ACCOUNT, "--email", "a@b.test", "--reason", "operator_suspension"],
    },
    {
      why: "a malformed id",
      argv: ["--suspend", "--id", "not-a-uuid", "--reason", "operator_suspension"],
    },
    { why: "no reason", argv: ["--suspend", "--id", ACCOUNT] },
    {
      why: "a free-text reason",
      argv: ["--suspend", "--id", ACCOUNT, "--reason", "because i felt like it"],
    },
    {
      why: "another verb's reason",
      argv: ["--suspend", "--id", ACCOUNT, "--reason", "operator_deletion_start"],
    },
    {
      why: "a reason on --status",
      argv: ["--status", "--id", ACCOUNT, "--reason", "operator_suspension"],
    },
    { why: "a flag with no value", argv: ["--suspend", "--id"] },
  ])("refuses $why", ({ argv }) => {
    expect(() => parseArguments(argv)).toThrow(UsageError);
  });

  it("the per-verb reason sets are exactly what the migration enforces", () => {
    // The CLI's copy of the vocabulary exists only to refuse a typo before a
    // round trip. A copy that could drift would be worse than none, so it is
    // compared to the migration's own per-function validation text.
    const between = (start: string, end: string) =>
      MIGRATION.slice(MIGRATION.indexOf(start), MIGRATION.indexOf(end));

    const suspendBody = between(
      "create or replace function public.suspend_account(",
      "create or replace function public.reactivate_account(",
    );
    for (const reason of VERBS.suspend.reasons) {
      expect(suspendBody, `suspend_account must accept ${reason}`).toContain(`'${reason}'`);
    }
    expect(VERBS.suspend.reasons).toHaveLength(3);

    const reactivateBody = between(
      "create or replace function public.reactivate_account(",
      "create or replace function public.begin_account_deletion_admin(",
    );
    for (const reason of VERBS.reactivate.reasons) {
      expect(reactivateBody, `reactivate_account must accept ${reason}`).toContain(`'${reason}'`);
    }

    expect(VERBS["start-deletion"].reasons).toEqual(["operator_deletion_start"]);
    expect(VERBS["start-deletion"].rpc).toBe("begin_account_deletion_admin");
  });

  it("the readback prints the state and never an email", () => {
    const line = formatStatusLine({
      found: true,
      user_id: ACCOUNT,
      status: "suspended",
      reason_code: "operator_suspension_abuse",
      changed_by: "operator",
      changed_at: "2026-08-04T12:00:00Z",
      // A field the RPC does not return; if the formatter ever started echoing
      // everything it was handed, this is what would appear in a transcript.
      email: "someone@example.test",
    });
    expect(line).toContain(ACCOUNT);
    expect(line).toContain("suspended");
    expect(line).toContain("operator");
    expect(line).not.toContain("someone@example.test");
    expect(line).not.toContain("@");
  });

  it("an account that does not exist reads as NOT FOUND, not as a state", () => {
    expect(formatStatusLine({ found: false })).toContain("NOT FOUND");
    expect(formatStatusLine(null)).toContain("NOT FOUND");
  });

  it("holds no capability beyond the four RPCs it declares", () => {
    const source = stripComments(
      readFileSync(join(REPO, "scripts/account-lifecycle-admin.mjs"), "utf8"),
    );
    // It reads no user-owned table and touches no storage: the whole surface is
    // the lifecycle RPCs. `deleteUser` in particular stays out (SH-DELETE-013).
    for (const forbidden of [
      "deleteUser",
      ".storage",
      'from("entries")',
      'from("tasks")',
      'from("attachments")',
      'from("account_lifecycle")',
      ".delete(",
    ]) {
      expect(source, `the operator CLI must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("does not connect on import, so a unit test cannot reach a live project", () => {
    const source = readFileSync(join(REPO, "scripts/account-lifecycle-admin.mjs"), "utf8");
    expect(source).toContain("import.meta.url === pathToFileURL(process.argv[1]).href");
  });
});

// ---------------------------------------------------------------------------
// SH-SUSPEND-009 — three refusal vocabularies, none sharing a code
// ---------------------------------------------------------------------------

describe("SH-SUSPEND-009: lifecycle, deletion and throttle refusals are disjoint", () => {
  const migrationsDirectory = join(REPO, "supabase/migrations");

  function detailsIn(file: string): string[] {
    const text = readFileSync(join(migrationsDirectory, file), "utf8");
    return [...text.matchAll(/detail\s*=\s*'([A-Z0-9_]+)'/g)].map((match) => match[1]);
  }

  const lifecycleVocabulary = new Set([
    ...detailsIn("202608040070_account_lifecycle.sql"),
    ...detailsIn("202608040071_account_lifecycle_wiring.sql"),
    ...detailsIn("202608040073_account_lifecycle_admin.sql"),
    ...detailsIn("202608040072_account_deletion.sql").filter((code) =>
      code.startsWith("ACCOUNT_LIFECYCLE_"),
    ),
  ]);

  /** The executor's stop reasons — migration 072's closed CHECK. */
  const deletionVocabulary = new Set([
    "unknown_owned_table",
    "unclassifiable_storage_object",
    "cross_owner_reference",
    "storage_residue_remains",
    "credential_not_erased",
    "auth_delete_failed",
    "lifecycle_not_deleting",
  ]);

  /** The throttle vocabulary that already exists (BYOK, `202608010067`). */
  const throttleVocabulary = new Set(detailsIn("202608010067_byok_validation_throttle.sql"));

  it("the lifecycle vocabulary is non-empty and uniformly prefixed", () => {
    expect(lifecycleVocabulary.size).toBeGreaterThanOrEqual(4);
    for (const code of lifecycleVocabulary) expect(code).toMatch(/^ACCOUNT_LIFECYCLE_/);
  });

  it("the deletion stop vocabulary is exactly the migration's CHECK, both directions", () => {
    const check = readFileSync(
      join(migrationsDirectory, "202608040072_account_deletion.sql"),
      "utf8",
    );
    // Bounded by the NEXT constraint's name rather than by a character count:
    // a slice long enough to reach `jsonb_typeof(...) = 'object'` would pick up
    // a word that is not a stop reason at all.
    const start = check.indexOf("account_deletion_log_stop_reason_vocabulary_check");
    const end = check.indexOf("account_deletion_log_requester_session_hash_check");
    expect(end).toBeGreaterThan(start);
    const declared = new Set(
      [...check.slice(start, end).matchAll(/'([a-z_]+)'/g)].map((match) => match[1]),
    );
    expect([...declared].sort()).toEqual([...deletionVocabulary].sort());
  });

  it("no code appears in more than one vocabulary", () => {
    const all = [...lifecycleVocabulary, ...deletionVocabulary, ...throttleVocabulary];
    expect(new Set(all).size).toBe(all.length);
  });

  it("the worker's deferral code belongs to none of the failure vocabularies", () => {
    // `owner_not_active` must never reach `jobs.error`, which the Jobs page
    // renders verbatim: a suspension is not a broken job.
    const jobFailure = readFileSync(
      join(REPO, "supabase/functions/_shared/job-failure.ts"),
      "utf8",
    );
    const declared = jobFailure.slice(
      jobFailure.indexOf("TERMINAL_JOB_FAILURE_CODES"),
      jobFailure.indexOf("export const JOB_FAILURE_CODES"),
    );
    expect(declared).not.toContain("owner_not_active");
    const gate = readFileSync(
      join(REPO, "supabase/functions/_shared/lifecycle-gate.ts"),
      "utf8",
    );
    expect(gate).toContain('export const OWNER_NOT_ACTIVE_CODE = "owner_not_active"');
  });
});
