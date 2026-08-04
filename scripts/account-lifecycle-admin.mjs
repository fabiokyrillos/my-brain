#!/usr/bin/env node
/**
 * The operator surface for account lifecycle transitions (SH-ADMIN-002).
 *
 * ## Why a script and not a page
 *
 * ADR-075: there is exactly one operator, no hosting platform, and an
 * established family of operator scripts (`byok-rotate-master-key.mjs`). A
 * product admin UI would need an admin role, an authorization model and a
 * route that holds service-role capability — three new trust surfaces to serve
 * one person. A generic service-role HTTP endpoint would be worse: T-10 in the
 * threat model is precisely "an over-broad service-role route exposed to
 * users", and the way to make that unbuildable is not to build it.
 *
 * So the boundary is SQL: `suspend_account`, `reactivate_account` and
 * `begin_account_deletion_admin` are `SECURITY DEFINER`, `service_role`-only,
 * and refuse every reason outside their per-verb closed set. This file calls
 * them and prints what changed. It holds no logic the database does not
 * enforce — if it were deleted tomorrow, nothing about the boundary would
 * weaken.
 *
 * ## Dry run by default
 *
 * Every mutating verb prints what it WOULD do and exits unless `--apply` is
 * present. That is the `byok-rotate-master-key.mjs` posture and the
 * SH-RETENTION-008 discipline, applied to a surface that can close somebody's
 * account with one typo.
 *
 * ## It prints no user content
 *
 * The readback is a status, a reason code, an actor and a timestamp. The
 * account is identified by its uuid — never by email, display name, or
 * anything it owns. The operator supplied the email; echoing it back into a
 * terminal transcript that ends up in an acceptance report is the one way this
 * script could leak something it was given, so it does not.
 *
 * Usage:
 *   node scripts/account-lifecycle-admin.mjs --status --email someone@example.com
 *   node scripts/account-lifecycle-admin.mjs --suspend --email someone@example.com --reason operator_suspension_abuse
 *   node scripts/account-lifecycle-admin.mjs --suspend --email someone@example.com --reason operator_suspension_abuse --apply
 *   node scripts/account-lifecycle-admin.mjs --reactivate --id <uuid> --reason operator_reactivation --apply
 *   node scripts/account-lifecycle-admin.mjs --start-deletion --id <uuid> --reason operator_deletion_start --apply
 */

import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The verbs, their RPCs and their reason sets.
 *
 * The reason sets are duplicated from `202608040073` **on purpose and with a
 * test that compares them to the migration text**: the database is the
 * enforcement point, and this copy exists only so the script can refuse a typo
 * before spending a round trip. A copy that could drift would be worse than no
 * copy at all, which is what the parity test is for.
 */
export const VERBS = Object.freeze({
  status: { rpc: null, mutating: false, reasons: [] },
  suspend: {
    rpc: "suspend_account",
    mutating: true,
    reasons: [
      "operator_suspension",
      "operator_suspension_abuse",
      "operator_suspension_security",
    ],
  },
  reactivate: {
    rpc: "reactivate_account",
    mutating: true,
    reasons: ["operator_reactivation", "deletion_reverted"],
  },
  "start-deletion": {
    rpc: "begin_account_deletion_admin",
    mutating: true,
    reasons: ["operator_deletion_start"],
  },
});

export class UsageError extends Error {}

/**
 * Pure argument parsing, exported so its tests need no network and no project.
 *
 * Every refusal here is a `UsageError` carrying a sentence an operator can act
 * on. Nothing is inferred: no default verb, no default account, no default
 * reason, and `--apply` is never implied.
 */
export function parseArguments(argv) {
  const verbs = Object.keys(VERBS).filter((name) => argv.includes(`--${name}`));
  if (verbs.length === 0) {
    throw new UsageError(
      `Name exactly one verb: ${Object.keys(VERBS).map((name) => `--${name}`).join(", ")}`,
    );
  }
  if (verbs.length > 1) {
    throw new UsageError(`Name exactly one verb, not ${verbs.length}`);
  }
  const verb = verbs[0];

  const valueOf = (flag) => {
    const index = argv.indexOf(`--${flag}`);
    if (index === -1) return null;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new UsageError(`--${flag} needs a value`);
    return value;
  };

  const id = valueOf("id");
  const email = valueOf("email");
  if ((id === null) === (email === null)) {
    throw new UsageError("Name the account by exactly one of --id or --email");
  }
  if (id !== null && !UUID.test(id)) throw new UsageError("--id is not a uuid");

  const reason = valueOf("reason");
  const definition = VERBS[verb];
  if (definition.mutating) {
    if (reason === null) {
      throw new UsageError(`--reason is required; one of: ${definition.reasons.join(", ")}`);
    }
    if (!definition.reasons.includes(reason)) {
      throw new UsageError(
        `--reason ${reason} is outside the closed set for --${verb}: ${definition.reasons.join(", ")}`,
      );
    }
  } else if (reason !== null) {
    throw new UsageError("--status takes no --reason");
  }

  return { verb, id, email, reason, apply: argv.includes("--apply") };
}

/**
 * The readback line. Deliberately a pure function of the RPC's own output, so
 * a test can assert what a transcript will contain — including that it
 * contains no email.
 */
export function formatStatusLine(readback) {
  if (!readback || readback.found !== true) return "  account: NOT FOUND";
  return [
    `  account:   ${readback.user_id}`,
    `  status:    ${readback.status ?? "no lifecycle row"}`,
    `  reason:    ${readback.reason_code ?? "-"}`,
    `  changed:   ${readback.changed_by ?? "-"} at ${readback.changed_at ?? "-"}`,
  ].join("\n");
}

async function readback(db, { id, email }) {
  const { data, error } = await db.rpc("admin_account_lifecycle_status", {
    p_user_id: id,
    p_email: email,
  });
  if (error) throw new Error(`readback refused (${error.code ?? "unknown"})`);
  return data;
}

async function main(argv) {
  const parsed = parseArguments(argv);
  // Resolved inside `main` rather than at module scope: the pure exports above
  // are imported by unit tests running under jsdom, where `import.meta.url` is
  // an http URL and `createRequire` refuses it. Nothing here loads until the
  // file is genuinely being run as a script.
  const { createClient } = createRequire(import.meta.url)("@supabase/supabase-js");
  const { url, serviceRoleKey } = getLinkedSupabaseCredentials();
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  const before = await readback(db, parsed);
  console.log(`verb: ${parsed.verb}`);
  console.log("before:");
  console.log(formatStatusLine(before));

  if (before?.found !== true) {
    console.log("\nNo such account. Nothing was attempted.");
    process.exitCode = 1;
    return;
  }
  if (!VERBS[parsed.verb].mutating) return;

  if (!parsed.apply) {
    console.log(
      `\nDRY RUN. This would call ${VERBS[parsed.verb].rpc} with reason ${parsed.reason}.`,
    );
    console.log("Re-run with --apply to perform it.");
    return;
  }

  const { error } = await db.rpc(VERBS[parsed.verb].rpc, {
    p_user_id: before.user_id,
    p_reason_code: parsed.reason,
  });
  if (error) {
    // The database's declared codes and details are the diagnostic; the
    // message text is not echoed, because a DEFINER function's message can
    // carry a status but is not a channel this script guarantees is content-free.
    console.error(`refused (${error.code ?? "unknown"})`);
    process.exitCode = 1;
    return;
  }

  console.log("after:");
  console.log(formatStatusLine(await readback(db, { id: before.user_id, email: null })));
  console.log("\nThe transition wrote its audit row through the lifecycle machine.");
}

// Only when invoked as a script: the parsing and formatting above are imported
// by tests, and a module that connected on import would make a unit test reach
// for a live project (the `verify-storage-orphans.mjs` pattern).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof UsageError ? error.message : "failed");
    process.exitCode = error instanceof UsageError ? 2 : 1;
  });
}
