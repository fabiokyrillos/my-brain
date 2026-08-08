/**
 * Shared pieces of the backup toolchain — the parts more than one script needs
 * and none of them should own a second copy of.
 *
 * There is one rule in this file that outranks the rest: **the connection
 * string never reaches stdout, stderr, an argument list, or a written file.**
 * The Supabase CLI's own `db dump --dry-run` prints a live `PGPASSWORD` to the
 * console, which is how that hazard was found rather than imagined. Every
 * function here that touches a URL redacts it on the way out, and the URL is
 * taken from the environment rather than from `process.argv` so it cannot land
 * in shell history or in a process listing.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * The tables a census counts, and the drill compares.
 *
 * Deliberately identical to `COUNTED_TABLES` in
 * `scripts/phase-2h-restore-drill.mjs`, and asserted equal by
 * `src/lib/closeout/backup-toolchain.test.ts` — a census measured over one set
 * of tables and compared against another is a check that cannot fail for the
 * reason it exists.
 *
 * User content first, then the operational tables: a restore that recovered
 * every entry and no audit trail is a partial recovery that reads as a
 * complete one.
 *
 * ## `entities` was a phantom, and the census is what found it
 *
 * The list shipped in 2H.5 named `public.entities`. **There is no such table in
 * this schema** — the entity graph is `people`, `organizations`, `projects` and
 * `contexts`, joined polymorphically through `entry_entities`. The first census
 * ever taken against the live project returned `42P01 relation
 * "public.entities" does not exist`.
 *
 * The consequence had the drill been run first: check 1 would have reported
 * `entities is readable — FAIL` on a **perfectly good restore**, and an
 * operator would have been reading a real failure against a table that never
 * existed. Worse in the other direction — a reviewer who accepted that one
 * known-noisy failure would have been trained to accept check 1's failures
 * generally, which is the only check that measures whether the data came back.
 *
 * The four real entity tables replace it, so the entity graph is genuinely
 * counted instead of nominally counted.
 */
export const COUNTED_TABLES = Object.freeze([
  "entries",
  "entry_interpretations",
  "tasks",
  "people",
  "organizations",
  "projects",
  "contexts",
  "memories",
  "notifications",
  "jobs",
  "audit_logs",
  "ai_usage_events",
  "product_events",
]);

/**
 * What no database backup of this project covers, on any plan.
 *
 * Carried in every manifest and every census so the limitation travels with the
 * artifact. A restore that silently lacks these is the failure mode a backup
 * document is supposed to prevent, and a reader holding a dump file a year from
 * now will not have the runbook open.
 */
export const NOT_COVERED = Object.freeze([
  "Storage objects — not in the database, not in any database backup, on any plan. A restore returns rows referencing objects that are gone.",
  "Hosted Auth configuration — disable_signup, CAPTCHA, redirect allow list, SMTP. Provider configuration, reconstructable by hand from scripts/hosted-auth-config.mjs, not restorable.",
  "External secrets — BYOK_MASTER_KEY, the fingerprint pepper, WORKER_DISPATCH_SECRET. Held outside the repository by design. WITHOUT THE ORIGINAL BYOK_MASTER_KEY, every restored credential envelope is unreadable ciphertext.",
  "Vault secrets — deletion_reap_url, deletion_reap_secret.",
]);

/** A UTC stamp in two shapes: one for humans, one for a file name. */
export function utcStamp(now = new Date()) {
  const iso = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  return { iso, file: iso.replace(/[:-]/g, "").replace(/Z$/, "Z") };
}

/**
 * `SUPABASE_ACCESS_TOKEN` from the environment, or from `.env.local`.
 *
 * Same resolution order as `phase-2h-restore-drill.mjs`, so the two scripts
 * cannot disagree about which project an operator is authenticated against.
 */
export function resolveAccessToken(repoUrl) {
  const fromEnv = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  try {
    return (
      /^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.*)$/m
        .exec(readFileSync(new URL(".env.local", repoUrl), "utf8"))?.[1]
        ?.trim() || null
    );
  } catch {
    return null;
  }
}

/**
 * One statement through the Management API. Throws with a bounded message.
 *
 * `errorLimit` exists because the 300-character default **ate a result**: the
 * Phase 2I search benchmark carries its measurements out in a deliberate
 * `raise exception`, and this helper truncated the payload mid-JSON, so a run
 * that had completed perfectly reported "failed before it could report". The
 * bound stays by default — a runaway provider error should not flood a log —
 * but a caller that knows the message *is* the answer can raise it.
 */
export async function managementQuery(token, projectRef, sql, { errorLimit = 300 } = {}) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${body.slice(0, errorLimit)}`);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`unparseable response: ${body.slice(0, 200)}`);
  }
}

/**
 * Remove anything password-shaped from text about to be printed.
 *
 * Applied to every error message from a dump or restore, because pg_dump and
 * psql both echo the connection string in several of their failure modes and a
 * backup script that leaks the production password on a bad day is a worse
 * outcome than the failure it was reporting.
 */
export function redact(text) {
  return String(text ?? "")
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+(@)/gi, "$1***REDACTED***$2")
    .replace(/(PGPASSWORD\s*=\s*)\S+/gi, "$1***REDACTED***")
    .replace(/(password\s*=\s*)\S+/gi, "$1***REDACTED***");
}

/** SHA-256 of a buffer, lowercase hex. */
export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * A `pg_dump`/`psql` binary and its major version, or null.
 *
 * Order: an explicit `--pg-dump`/`--psql` path, then `PG_DUMP`/`PSQL` in the
 * environment, then `PATH`. Explicit beats ambient so an operator with two
 * Postgres installs can name the one whose major version matches the server —
 * pg_dump refuses a server newer than itself, and that refusal at 03:00 on a
 * schedule is a backup that silently stopped existing.
 */
export function findClient(binary, explicitPath = null) {
  const candidates = [explicitPath, process.env[binary.toUpperCase()], binary].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const out = execFileSync(candidate, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      const major = Number(/\b(\d+)\.\d+/.exec(out)?.[1] ?? NaN);
      if (Number.isFinite(major)) return { path: candidate, version: out.trim(), major };
    } catch {
      // Try the next candidate. A missing binary is the common case here, and
      // it is reported once by the caller rather than three times by this loop.
    }
  }
  return null;
}
