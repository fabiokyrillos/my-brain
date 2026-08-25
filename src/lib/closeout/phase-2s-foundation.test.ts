/**
 * Phase 2S — slice 2S.0. **Measure the ground, and change nothing.**
 *
 * `2S-FOUNDATION-001` … `-007`. The record this file executes is
 * `docs/reports/phase-2s/PHASE_2S_SLICE_00_ACCEPTANCE.md`; the hosted halves are
 * quoted there with their exact SQL, and the halves that can be re-derived from
 * the tree are asserted here so they cannot rot silently.
 *
 * Three rules this file obeys, each paid for by an earlier phase:
 *
 * 1. **A criterion that names a count cannot survive the count changing.**
 *    Phase 2R's `2R-FOUNDATION-006` named "the four rows" and there were none.
 *    So every hosted number lives in the record, taken at the slice's baseline,
 *    and this file asserts the *shape* of the source rather than re-stating a
 *    row count it cannot see.
 * 2. **A guard needs a control that can fail.** Every closed-set assertion below
 *    is paired with a negative: a shape the probe must NOT find. A scan that
 *    matched nothing would otherwise satisfy "no caller sends `dismissed`" by
 *    finding no callers at all.
 * 3. **A rule about the heartbeat is proved by calling it.** This file therefore
 *    does **not** claim to prove behaviour. It re-asserts the deployed clauses
 *    against the migration that defines them — the record carries the live
 *    `pg_get_functiondef` read — and slice 2S.1 is where the function is
 *    *called*. Matching a substring proves the text, never the behaviour, and
 *    that distinction is why slice 2R.1's approach was not enough.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

const SURFACE = "src/app/[locale]/app/notifications/page.tsx";
const AGENT_ACTIONS = "src/features/agent/actions.ts";
/** The migration that defines the deployed `run_user_heartbeat`. */
const HEARTBEAT = "supabase/migrations/202608040073_account_lifecycle_admin.sql";
const RECORD = "docs/reports/phase-2s/PHASE_2S_SLICE_00_ACCEPTANCE.md";

/** Every non-test source file, so a census cannot miss a caller by guessing a directory. */
function sourceFiles(dir = "src", acc: string[] = []): string[] {
  for (const entry of readdirSync(join(REPO, dir), { withFileTypes: true })) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(relative, acc);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) acc.push(relative);
  }
  return acc;
}

describe("2S-FOUNDATION-003: the notification surface's controls, enumerated from the component", () => {
  /*
   * The PRD says the surface offers "two controls, *Abrir* and *Lida*". This
   * asserts that as a **closed set on the row**, because the requirement is not
   * "two controls exist" — it is "these are the only ones".
   */
  it("offers exactly two row controls, and their destinations are what the phase measured", () => {
    const surface = read(SURFACE);

    // `Abrir` — a Link, whose destination is the row's own `action_url` and
    // nothing computed. This is the control slice 2S.1 retargets.
    expect(surface, "the open control must take its destination from the row")
      .toContain('href={item.action_url}');

    // `Lida` — a form posting to the one disposition writer, with the status
    // fixed in a hidden input rather than chosen.
    expect(surface, "the read control must post to markNotification")
      .toContain("<form action={markNotification}>");
    expect(surface, "the read control sends a fixed status")
      .toMatch(/name="status" value="read"/);

    // The closed half: there is no third row control today. `row-action` is the
    // class every row control carries, so counting it counts the set.
    const rowActions = [...surface.matchAll(/className="row-action"/g)].length;
    expect(rowActions, "the row offers exactly two controls at this baseline").toBe(2);

    // The control for the control: a shape that is genuinely absent. If the
    // probe were matching loosely, this would match too.
    expect(surface, "no dismiss control exists on the surface yet")
      .not.toMatch(/value="dismissed"/);
    expect(surface, "no suppression control exists on the surface yet")
      .not.toMatch(/silenciar|suppress/i);
  });

  it("renders the read control only where it changes something", () => {
    // `R-24` — a control whose only outcome is a no-op is not offered. This is
    // the property slice 2S.2 must preserve when it adds verbs beside it.
    expect(read(SURFACE), "the read control is gated on the row being unread")
      .toContain('{item.status === "unread" ? <form action={markNotification}>');
  });
});

describe("2S-FOUNDATION-004: `dismissed` is unreachable, and the census proves it by finding the caller", () => {
  /*
   * The trap this test exists to avoid: asserting "nothing sends `dismissed`"
   * over a scan that found no callers at all would pass over an empty tree.
   * So the caller count is asserted **first**, and the disposition second.
   */
  it("has exactly one caller of markNotification, and it always sends read", () => {
    const callers = sourceFiles().filter((file) => {
      const body = read(file);
      return file !== AGENT_ACTIONS && /markNotification/.test(body);
    });

    expect(callers, "the caller census must find exactly one caller").toEqual([SURFACE]);

    const surface = read(SURFACE);
    const statuses = [...surface.matchAll(/name="status" value="([a-z]+)"/g)].map((m) => m[1]);
    expect(statuses, "the one caller sends exactly one status, and it is read").toEqual(["read"]);
  });

  it("declares a disposition the product cannot produce, and filters on it anyway", () => {
    // Both halves of the defect, asserted together, because either alone reads
    // like a design choice.
    expect(read(AGENT_ACTIONS), "the action still accepts both dispositions")
      .toMatch(/z\.enum\(\["read", ?"dismissed"\]\)/);
    expect(read(SURFACE), "the list filters a state nothing can produce")
      .toContain('.neq("status", "dismissed")');
  });
});

describe("2S-FOUNDATION-002: the deployed cadence rules, re-asserted against the migration that defines them", () => {
  /*
   * The record carries the live `pg_get_functiondef` read. This re-asserts the
   * same clauses against `202608040073`, so a later edit to the migration that
   * did not reach the record would be caught.
   *
   * **The PRD quotes ONE suppression clause. The function has TWO, plus a
   * unique constraint.** That correction is the substance of this block, and it
   * is why slice 2S.1 cannot design a backoff against the PRD's quote alone.
   */
  const heartbeat = () => read(HEARTBEAT);

  it("builds the task dedupe key from the subject AND the owner's local date", () => {
    expect(heartbeat()).toContain("'stale:' || task.id::text || ':' || local_date::text");
    expect(heartbeat()).toContain("'overdue:' || task.id::text || ':' || local_date::text");
  });

  it("builds the reminder dedupe key WITHOUT a date, which is why it never repeats", () => {
    // The asymmetry that explains the ledger: a task notice carries the local
    // date and therefore re-qualifies every day; a reminder notice does not and
    // is permanently once-only under the exact-key clause below.
    expect(heartbeat()).toContain("'reminder:' || reminder.id::text");
    expect(heartbeat(), "the reminder key must not carry a date")
      .not.toContain("'reminder:' || reminder.id::text || ':' || local_date");
  });

  it("suppresses on TWO clauses and a unique constraint, not on one", () => {
    // (A) exact key, no time bound — an unbounded per-key guard.
    expect(heartbeat()).toContain("and notification.dedupe_key = candidate.dedupe_key");
    // (B) the 24-hour cooldown, scoped to the task types only.
    expect(heartbeat()).toContain("and notification.created_at > now() - interval '24 hours'");
    expect(heartbeat()).toContain("where candidate.type in ('task_overdue', 'task_stale')");
    // (C) the constraint underneath both.
    expect(heartbeat()).toContain("on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing");
  });

  it("never reads a notification's status when deciding whether to speak again", () => {
    // The finding the whole phase rests on. Bounded to the function's own body
    // so a `status` elsewhere in a 1 500-line migration cannot mask it.
    const body = heartbeat().slice(heartbeat().indexOf("create or replace function public.run_user_heartbeat"));
    const pending = body.slice(body.indexOf("), pending as ("), body.indexOf("), limited as ("));
    expect(pending.length, "the suppression block must have been located").toBeGreaterThan(200);
    expect(pending, "suppression must not consider the disposition")
      .not.toMatch(/notification\.status/);
    // The control: the block the probe read really does contain the clauses, so
    // a mislocated slice cannot pass this by being empty.
    expect(pending).toContain("interval '24 hours'");
  });

  it("orders the capped slots so a reminder outranks a stale nudge", () => {
    // Recorded, not proved. `2S-CADENCE-005` requires this be asserted by
    // CALLING the function, and that is slice 2S.1's obligation, not this
    // file's. What is asserted here is only that the literal has not moved.
    expect(heartbeat()).toContain("order by rank desc, event_time asc, dedupe_key");
  });
});

describe("2S-FOUNDATION-007: this slice changes no product behaviour", () => {
  it("creates no migration, and the chain is the one the phase started with", () => {
    const migrations = readdirSync(join(REPO, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
    expect(migrations.length, "slice 2S.0 spends nothing").toBe(101);
    expect(
      migrations.filter((f) => /phase_2s/i.test(f)),
      "the allocation is spent in slice 2S.1, not here",
    ).toEqual([]);
  });

  it("adds no writer of notifications", () => {
    // Stop condition 3, asserted rather than assumed. Two writers exist and
    // they write different things: the heartbeat PRODUCES rows, and
    // `markNotification` MUTATES a disposition. The record says so in those
    // words, because "the heartbeat is the only writer" is not literally true
    // and a requirement resting on a false sentence is a requirement nobody can
    // check.
    const writers = sourceFiles().filter((file) => /\.from\("notifications"\)[\s\S]{0,120}\.(update|insert|upsert|delete)/.test(read(file)));
    expect(writers, "exactly one application-layer writer, and it is the disposition writer")
      .toEqual([AGENT_ACTIONS]);
  });

  it("ships the record it is accountable to", () => {
    const record = read(RECORD);
    for (const requirement of [1, 2, 3, 4, 5, 6, 7]) {
      expect(record, `2S-FOUNDATION-00${requirement} is unrecorded`)
        .toContain(`2S-FOUNDATION-00${requirement}`);
    }
    expect(record, "the record must state that push is still zero")
      .toMatch(/notification_deliveries/);
  });
});
