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
  /*
   * MEASURED AS A BASELINE IN 2S.0, DELIVERED AGAINST IN 2S.2.
   *
   * The original assertions here recorded what the surface offered **before**
   * the verbs existed: two controls, no dismissal, no suppression. Their own
   * comments named the slices that would change them — *"the control slice 2S.1
   * retargets"*, *"the property slice 2S.2 must preserve"* — so this is the
   * anticipated transition, not a guard being weakened to make a build pass.
   *
   * What the baseline was protecting is kept, and now asserted against the
   * mechanism that replaced the inline markup.
   */
  it("takes the open control's destination from the row, still", () => {
    // Unchanged by 2S.2: a Link whose destination is the row's own
    // `action_url` and nothing computed. Slice 2S.1 retargeted what that URL
    // POINTS AT; it did not move the decision into the component.
    expect(read(SURFACE), "the open control must take its destination from the row")
      .toContain("href={item.action_url}");
  });

  it("offers the row's verbs from the one shared source, not from inline markup", () => {
    const surface = read(SURFACE);

    // The inline `<form action={markNotification}>` is gone from the page: the
    // dispositions are dispatched by the row component now.
    expect(surface, "the surface must not hand-roll a disposition form")
      .not.toContain("<form action={markNotification}>");
    expect(surface, "the row's controls come from the shared component")
      .toContain("<NotificationRowActions");

    // And the set itself is closed by `verbs.ts` rather than by counting
    // `row-action` classes in a page. Six verbs, enumerated there, asserted by
    // name in `verbs.test.ts`.
    const verbs = read("src/features/notifications/verbs.ts");
    for (const verb of ["complete_task", "reschedule_task", "mark_read", "dismiss", "silence_until", "silence_subject"]) {
      expect(verbs, `the shared verb set is missing ${verb}`).toContain(`id: "${verb}"`);
    }
  });

  it("renders the read control only where it changes something", () => {
    /*
     * `R-24`, and it survived the rewrite — but only because this assertion
     * failed first. The initial shared verb list offered *marcar como lido* on
     * every row including rows already read, which is a control whose only
     * outcome is a no-op.
     *
     * The gate moved from the page's markup into `verbsForRow`, where both
     * surfaces read it, so it is asserted there now.
     */
    const verbs = read("src/features/notifications/verbs.ts");
    expect(verbs, "the read verb must be gated on the notice being unread")
      .toContain('if (verb.id === "mark_read" && noticeStatus !== "unread") return false;');
    // And the projection must actually pass the fact, or the gate is inert.
    expect(read("src/features/notifications/row-projection.ts"))
      .toContain("noticeStatus: row.status");
  });
});

describe("2S-FOUNDATION-004 → 2S-ANSWER-001: `dismissed` WAS unreachable, and now has a writer", () => {
  /*
   * THE ONE MEASUREMENT IN THIS FILE THAT SLICE 2S.2 EXISTS TO INVALIDATE.
   *
   * Slice 2S.0 measured a defect: `markNotification` accepted `"dismissed"`,
   * its single caller always sent `"read"`, and the list filtered out a state
   * nothing could produce. Both halves were asserted together, because either
   * alone reads like a design choice.
   *
   * `2S-ANSWER-001` is the repair — *"`dismissed` has a writer reachable from
   * the surface"* — so the measurement is rewritten to assert the repair rather
   * than deleted. The trap the original avoided is kept: the CALLER is proved
   * to exist before anything is claimed about what it sends, because a scan
   * that found nothing would otherwise pass over an empty tree.
   */
  it("still routes every disposition through the one writer, which is unchanged", () => {
    expect(read(AGENT_ACTIONS), "the action accepts both dispositions")
      .toMatch(/z\.enum\(\["read", ?"dismissed"\]\)/);
    /*
     * No new writer was created for dismissal. `2S-ANSWER-001` needed a
     * SURFACE, not an authority — which is why this slice adds no write path
     * for it at all.
     */
    const newWriters = sourceFiles().filter((file) => {
      const body = read(file);
      return file !== AGENT_ACTIONS
        && /from\("notifications"\)/.test(body)
        && /\.update\(/.test(body);
    });
    expect(newWriters, "a second writer of notification status appeared").toEqual([]);
  });

  it("has a reachable caller that can send dismissed", () => {
    const callers = sourceFiles().filter((file) => {
      const body = read(file);
      return file !== AGENT_ACTIONS && /markNotification/.test(body);
    });
    // Proved to exist FIRST, so what follows is not a claim over an empty scan.
    expect(callers.length, "the caller census found nothing at all").toBeGreaterThan(0);
    expect(callers, "the page must still be the surface that mounts it").toContain(SURFACE);

    // The dispatcher that turns a verb into a status, and it can produce both.
    const row = read("src/features/notifications/notification-row-actions.tsx");
    expect(row, "the row must be able to send dismissed")
      .toContain('verb.id === "mark_read" ? "read" : "dismissed"');
  });

  it("keeps filtering `dismissed` — which now guards a state the product CAN produce", () => {
    /*
     * `2S-ANSWER-005`. The filter was the second half of the defect precisely
     * because nothing could produce the state it hid. It is unchanged, and it
     * is now doing real work.
     */
    expect(read(SURFACE)).toContain('.neq("status", "dismissed")');
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
  /*
   * **Inverted by slice 2S.1, in the commit that spends the allocation.**
   *
   * This asserted a chain of 101 and zero Phase 2S migrations. Both were true
   * of slice 2S.0 and one of them stopped being true the moment 2S.1 landed --
   * so keeping the flat count would have made this guard fail for the reason it
   * was written to allow.
   *
   * What 2S.0 actually claimed is narrower and still holds: **this slice**
   * spent nothing. That is now asserted directly -- no migration names slice 0 --
   * and the phase-level ceiling is asserted where it belongs, in
   * `phase-2s-declarations.test.ts`, which pins the one allocated migration by
   * name. A count that has to be edited on every later spend is a count that
   * stops meaning anything.
   */
  it("spends no migration of its own, and the phase's one migration belongs to 2S.1", () => {
    const migrations = readdirSync(join(REPO, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
    const phase = migrations.filter((f) => /phase_2s/i.test(f));
    expect(
      phase.filter((f) => /slice_0/i.test(f)),
      "slice 2S.0 changes no behaviour and therefore spends nothing",
    ).toEqual([]);
    expect(phase, "the phase is allocated exactly one migration, and it is slice 2S.1's").toEqual([
      "202608240102_phase_2s_slice_1_notification_suppressions.sql",
    ]);
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
