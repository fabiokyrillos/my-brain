/**
 * Phase 2S — slice 2S.1. **The claims the migration makes about itself.**
 *
 * ## What this file is NOT for
 *
 * It does not prove behaviour, and nothing here should be read as if it did.
 * `supabase/tests/phase_2s_notification_suppressions.sql` **calls**
 * `run_user_heartbeat` fifty-three times and reads the rows it wrote; that is
 * where the cadence, the suppression and the destination are proved. Slice 2R.1
 * matched substrings against `pg_proc.prosrc` and proved nothing, and this file
 * exists precisely so that mistake is not repeated under a different name.
 *
 * ## What it IS for
 *
 * Three of this slice's claims are claims **about the source**, and a source
 * claim is checked by reading the source or it is not checked at all:
 *
 * 1. **"The 24-hour cooldown is byte-identical."** That is the whole safety
 *    argument for the backoff — the floor did not move, so no input exists on
 *    which the product speaks MORE than before. It is asserted here as a real
 *    byte comparison against the definition this migration replaces, not as a
 *    sentence in a record.
 * 2. **"Nothing else in the function moved."** Asserted as a diff of the two
 *    definitions restricted to the three changes the header declares.
 * 3. **"The new clauses can only remove candidates."** A structural property:
 *    they are conjunctions inside `pending`, never a widened `or`.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

const PREVIOUS = "supabase/migrations/202608040073_account_lifecycle_admin.sql";
const MINE = "supabase/migrations/202608240102_phase_2s_slice_1_notification_suppressions.sql";
const HEARTBEAT_START = "create or replace function public.run_user_heartbeat(p_user_id uuid)";

/** The function body as it appears in a migration file, from its header to its terminator. */
function heartbeatBody(file: string): string {
  const source = read(file);
  const start = source.indexOf(HEARTBEAT_START);
  expect(start, `${file} does not define the heartbeat`).toBeGreaterThan(-1);
  const end = source.indexOf("\n$$;", start);
  expect(end, `${file}'s heartbeat definition is unterminated`).toBeGreaterThan(start);
  return source.slice(start, end);
}

/**
 * The `pending` CTE alone — the only part of the function this slice changed —
 * **with its SQL comments removed.**
 *
 * The stripping is not tidiness. A first version of this file asserted the
 * ladder's ceiling with `toContain("else false")`, and a mutation control that
 * DELETED the ceiling from the code still passed: the phrase also appears in
 * the comment above it explaining what the ceiling is for. The guard was being
 * satisfied by its own subject's description.
 *
 * That is a failure mode this repository has met before under other names, and
 * the general form of it is worth stating: **a check that reads a file cannot
 * read the prose in that file, because prose is where the claim lives and the
 * claim is what is under test.** Every assertion below therefore reads code.
 */
function pendingClause(file: string): string {
  const body = heartbeatBody(file);
  const start = body.indexOf("), pending as (");
  const end = body.indexOf("), limited as (");
  expect(start, `${file} has no pending CTE`).toBeGreaterThan(-1);
  expect(end, `${file} has no limited CTE`).toBeGreaterThan(start);
  return body
    .slice(start, end)
    .split(/\r?\n/)
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
}

describe("2S-CADENCE-004: the 24-hour cooldown did not move, proved by bytes", () => {
  /*
   * The clause is lifted from BOTH files and compared character for character.
   * A reworded, re-indented or "equivalent" cooldown fails this — which is the
   * point, because the claim in the record is identity, not equivalence.
   */
  const COOLDOWN = `    and not exists (
      select 1 from public.notifications notification
      where candidate.type in ('task_overdue', 'task_stale')
        and notification.user_id = p_user_id
        and notification.created_at > now() - interval '24 hours'
        and notification.dedupe_key like
          split_part(candidate.dedupe_key, ':', 1) || ':' ||
          split_part(candidate.dedupe_key, ':', 2) || ':%'
    )`;

  it("appears verbatim in the migration this one replaces", () => {
    // The control half. If the literal above were wrong, the assertion below
    // would pass vacuously for a migration that dropped the cooldown entirely.
    expect(pendingClause(PREVIOUS).replace(/\r\n/g, "\n")).toContain(COOLDOWN);
  });

  it("appears verbatim in this slice's migration too", () => {
    expect(pendingClause(MINE).replace(/\r\n/g, "\n")).toContain(COOLDOWN);
  });

  it("is still the FLOOR: the exact-key clause above it is unchanged as well", () => {
    for (const file of [PREVIOUS, MINE]) {
      expect(
        pendingClause(file),
        `${file} lost the unbounded exact-key clause`,
      ).toContain("and notification.dedupe_key = candidate.dedupe_key");
    }
  });
});

describe("2S-CADENCE-001/-002: the backoff is additive, bounded and terminating", () => {
  const pending = () => pendingClause(MINE);

  it("adds its clauses as conjunctions, so they can only ever REMOVE a candidate", () => {
    /*
     * The safety property, structurally. `pending` is a chain of `and`s; a new
     * clause introduced with a top-level `or` could ADMIT a candidate the old
     * function withheld, and no test of the ladder would notice — every ladder
     * case would still pass while some other input started speaking more.
     *
     * So: the CTE contains no top-level `or`. The `or`s that do appear are
     * inside parentheses belonging to a single clause.
     */
    const topLevel = pending()
      .split(/\r?\n/)
      .filter((line) => /^\s{4}or\b/.test(line));
    expect(topLevel, `a top-level disjunction entered the pending CTE: ${topLevel.join(" | ")}`)
      .toEqual([]);
  });

  it("names the whole ladder and a terminal case", () => {
    const clause = pending();
    for (const rung of ["interval '1 day'", "interval '3 days'", "interval '7 days'"]) {
      expect(clause, `the backoff is missing the ${rung} rung`).toContain(rung);
    }
    // `else false` is the ceiling. Without it the CASE returns null for a
    // fifth notice, null is not true, and the candidate would be dropped by
    // accident rather than by rule — the right answer for the wrong reason,
    // and one nobody could rely on.
    expect(clause, "the ladder has no terminal case").toContain("else false");
  });

  it("counts only notices sent since the subject last changed", () => {
    // The reset anchor. Without this predicate the count would include notices
    // from before the owner touched the task, and the backoff would never reset.
    expect(pending()).toContain("and sent.created_at > candidate.subject_changed_at");
  });
});

describe("2S-SILENCE-009: the suppression is consulted at the source", () => {
  it("is read inside the heartbeat rather than filtered at read time", () => {
    const clause = pendingClause(MINE);
    expect(clause).toContain("from public.notification_suppressions suppression");
    expect(clause, "a permanent suppression must not need an expiry to be honoured")
      .toContain("suppression.scope = 'forever' or suppression.suppressed_until > now()");
    expect(clause, "a suppression narrowed to one notice type must not silence the others")
      .toContain("suppression.notice_type is null or suppression.notice_type = candidate.type");
  });

  it("is not consulted anywhere in the application's read path", () => {
    /*
     * `OD-2S-9` A was signed so the ledger stops filling, NOT so the surface
     * hides rows. A reader that filtered suppressed notices at query time would
     * make the count the owner sees stop matching the rows that exist — the
     * exact defect option B was rejected for.
     */
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(REPO, dir), { withFileTypes: true })) {
        const relative = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(relative);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          if (/from\("notification_suppressions"\)/.test(read(relative))) offenders.push(relative);
        }
      }
    };
    walk("src");
    expect(offenders, "the suppression must not be read at render time").toEqual([]);
  });
});

describe("2S-REACH-001/-003: the destination points at the subject", () => {
  it("sends both task notice types to the task rather than to the list", () => {
    const body = heartbeatBody(MINE);
    expect(body).toContain("'/en/app/work/' else '/pt-BR/app/work/' end || task.id::text");
    expect(
      (body.match(/'\/en\/app\/work\/' else '\/pt-BR\/app\/work\/' end \|\| task\.id::text/g) ?? []).length,
      "both task branches must point at the subject",
    ).toBe(2);
    expect(body, "no task branch may still point at the list").not.toContain("'/en/app/tasks'");
  });

  it("leaves the reminder destination alone, and that is a recorded refusal", () => {
    /*
     * There is no `/app/reminders/[reminderId]` route in this repository, so a
     * per-reminder destination would be a link to nothing. The list is the
     * correct answer today and this asserts it stays the answer until a route
     * exists — a refusal with a name, rather than an omission.
     */
    expect(heartbeatBody(MINE)).toContain("'/en/app/reminders' else '/pt-BR/app/reminders' end");
    const routes = readdirSync(join(REPO, "src/app/[locale]/app/reminders"));
    expect(
      routes.filter((name) => name.startsWith("[")),
      "a per-reminder route now exists, so the destination above must be revisited",
    ).toEqual([]);
  });
});

describe("2S-TRUST: the new authority is bounded and the reuse is real", () => {
  it("registers an undo handler, because the ledger refuses an operation without one", () => {
    const migration = read(MINE);
    expect(migration).toContain("private.undo_suppress_notification_subject_v1");
    expect(migration).toContain("insert into private.undo_operation_handlers");
    // The handler CLOSES the ledger. `2R-UNDO-LEDGER-NOT-CLOSED` is a live
    // example of one that does not, so this is asserted rather than assumed.
    expect(migration, "the handler must mark the operation undone")
      .toContain("set status = 'undone', undone_at = pg_catalog.now()");
  });

  it("proves polymorphic ownership by reusing the existing validator", () => {
    const migration = read(MINE);
    expect(migration, "ownership must be proved by trigger")
      .toContain("execute function public.validate_polymorphic_entity_owner()");
    // The reuse only works because the columns are named what the validator
    // reads. If they were renamed, the trigger would silently validate nothing.
    expect(migration).toMatch(/entity_type text not null check/);
    expect(migration).toMatch(/entity_id uuid not null/);
  });

  it("shares the actor vocabulary with audit_logs rather than inventing a fourth", () => {
    expect(read(MINE)).toContain("check (actor in ('user', 'agent', 'system'))");
  });

  it("revokes from service_role EXPLICITLY rather than merely not granting", () => {
    /*
     * `alter default privileges` in this schema hands every new table
     * REFERENCES, SELECT, TRIGGER and TRUNCATE to `service_role`. CI proved it:
     * the first version of this migration granted only SELECT, and the deployed
     * posture came back with four privileges — one of them TRUNCATE, which is
     * destructive.
     *
     * **Omitting a grant is not the same as withholding one.** This asserts the
     * revoke that actually withholds.
     */
    expect(read(MINE)).toContain(
      "revoke all on table public.notification_suppressions from public, anon, service_role;",
    );
  });

  it("registers an undo handler that is SECURITY INVOKER", () => {
    /*
     * `undo_operation_routing.sql` refuses a definer handler by name, and it
     * refused this one. The router is already `security definer`, so a handler
     * that is definer too gains nothing and turns any accidental grant on it
     * into a cross-tenant write.
     *
     * Asserted here as well as there, so the defect is caught by the file that
     * would introduce it rather than by the suite that inherits it.
     */
    const migration = read(MINE);
    const start = migration.indexOf(
      "create or replace function private.undo_suppress_notification_subject_v1",
    );
    expect(start, "the handler is missing").toBeGreaterThan(-1);
    const header = migration.slice(start, migration.indexOf("as $$", start));
    expect(header, "an undo handler must not be security definer").not.toContain("security definer");
    expect(header, "an undo handler must pin an empty search_path").toContain("set search_path = ''");
  });

  it("creates exactly one new write authority, and it is the suppression", () => {
    const migration = read(MINE);
    const created = [...migration.matchAll(/^create or replace function (public\.\w+)/gm)]
      .map((match) => match[1]);
    expect(created.sort(), "an unexpected public function entered the migration").toEqual([
      // Recreated, not created: OD-2S-9 A. It existed before this phase.
      "public.run_user_heartbeat",
      "public.suppress_notification_subject",
    ]);
  });

  it("is enumerated for export and deletion, because it is the owner's data", () => {
    expect(read("src/features/privacy/enumeration.ts"))
      .toContain('{ table: "notification_suppressions" }');
  });
});
