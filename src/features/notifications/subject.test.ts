import { describe, expect, it } from "vitest";

import { deriveNotificationSubject } from "./subject";

/**
 * `2S-ACT-001` needs the subject of a notice, and `notifications` has no column
 * that holds it.
 *
 * The link exists in `dedupe_key`, and reading it that way is **not** an
 * invention of this slice: `run_user_heartbeat` itself does
 * `split_part(candidate.dedupe_key, ':', 2)` to recover the subject id when it
 * counts prior notices about a subject (migration `202608240102`, the
 * `sent_about_subject` clause). This module is that same convention, read in
 * one place instead of at every call site.
 *
 * The formats, verbatim from the deployed function:
 *
 * | notice | dedupe_key |
 * |---|---|
 * | `task_overdue` | `overdue:{task_id}:{local_date}` |
 * | `task_stale`   | `stale:{task_id}:{local_date}` |
 * | `reminder`     | `reminder:{reminder_id}` |
 *
 * **It refuses rather than guesses.** A key it does not recognise yields `null`,
 * and the row then renders with its message verbs and no task verbs — which is
 * the safe direction, because the alternative is offering *Concluir* against an
 * id parsed out of a string that meant something else.
 */
describe("deriveNotificationSubject", () => {
  const taskId = "3f7c1b52-0e2a-4d61-9f83-2b6a1c9d4e70";
  const reminderId = "9a1d4e08-77bb-4c2f-8e15-6d3f0a2b9c44";

  it("reads a task from an overdue key", () => {
    expect(deriveNotificationSubject({ type: "task_overdue", dedupe_key: `overdue:${taskId}:2026-08-25` }))
      .toEqual({ noticeType: "task_overdue", subjectType: "task", subjectId: taskId });
  });

  it("reads a task from a stale key", () => {
    expect(deriveNotificationSubject({ type: "task_stale", dedupe_key: `stale:${taskId}:2026-08-25` }))
      .toEqual({ noticeType: "task_stale", subjectType: "task", subjectId: taskId });
  });

  it("reads a reminder from a reminder key, which carries no date", () => {
    expect(deriveNotificationSubject({ type: "reminder", dedupe_key: `reminder:${reminderId}` }))
      .toEqual({ noticeType: "reminder", subjectType: "reminder", subjectId: reminderId });
  });

  it("returns null when the row has no dedupe key at all", () => {
    // `notifications.dedupe_key` is nullable, and a row without one has no
    // recoverable subject. Nullable is not the same as absent-by-mistake.
    expect(deriveNotificationSubject({ type: "task_overdue", dedupe_key: null })).toBeNull();
  });

  it("returns null for a prefix this product does not produce", () => {
    expect(deriveNotificationSubject({ type: "task_overdue", dedupe_key: `digest:${taskId}:2026-08-25` })).toBeNull();
  });

  it("returns null when the middle segment is not a uuid", () => {
    // The whole risk of parsing a string is acting on what it decodes to. A
    // task verb dispatched against "42" would be a write against nothing, or
    // worse, against something else.
    expect(deriveNotificationSubject({ type: "task_overdue", dedupe_key: "overdue:42:2026-08-25" })).toBeNull();
  });

  it("returns null when the prefix disagrees with the row's own type", () => {
    /*
     * Two independent facts describe the same notice: `type` and the key's
     * prefix. If they disagree, one of them is wrong and there is no way to
     * tell which — so the row keeps its message verbs and offers no task verb.
     */
    expect(deriveNotificationSubject({ type: "reminder", dedupe_key: `overdue:${taskId}:2026-08-25` })).toBeNull();
  });

  it("returns null for a reminder key carrying extra segments", () => {
    // The reminder form is exactly two segments. A third means this is not the
    // shape this module was told about.
    expect(deriveNotificationSubject({ type: "reminder", dedupe_key: `reminder:${reminderId}:2026-08-25` })).toBeNull();
  });

  it("returns null for a task key missing its date segment", () => {
    expect(deriveNotificationSubject({ type: "task_overdue", dedupe_key: `overdue:${taskId}` })).toBeNull();
  });
});
