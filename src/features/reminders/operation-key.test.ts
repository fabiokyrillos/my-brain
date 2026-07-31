import { describe, expect, it } from "vitest";

import { reminderOperationKey } from "./operation-key";
import type { ExpectedReminderState } from "./schema";

/**
 * The two properties the key exists to hold (UX-12, duplicate-submission
 * prevention).
 *
 * These are the whole reason the key is derived rather than random or fixed:
 * a random key applies a double click twice, a per-render key swallows a
 * deliberate second action. Both failures are silent, and both are exactly what
 * these cases refuse.
 */

const REMINDER_ID = "44444444-4444-4444-8444-444444444444";

const base: ExpectedReminderState = {
  status: "scheduled",
  remindAt: "2026-12-01T09:00:00.000000+00",
  title: "Ligar para o contador",
  important: false,
};

describe("duplicate submission", () => {
  it("gives two submits of one control over one row state the same key", () => {
    // A double click happens before any re-render, so both carry the identical
    // pre-state. Same key + same payload replays in the database.
    expect(reminderOperationKey(REMINDER_ID, "cancel", base)).toBe(
      reminderOperationKey(REMINDER_ID, "cancel", { ...base }),
    );
  });

  it("is pure — no clock, no counter, no randomness", () => {
    const first = reminderOperationKey(REMINDER_ID, "snooze", base);
    const second = reminderOperationKey(REMINDER_ID, "snooze", base);
    expect(first).toBe(second);
  });
});

describe("a deliberate second action is not swallowed", () => {
  it("changes when remind_at moved, which is what a first snooze does", () => {
    const after = { ...base, remindAt: "2026-12-01T10:00:00.000000+00" };
    expect(reminderOperationKey(REMINDER_ID, "snooze", after)).not.toBe(
      reminderOperationKey(REMINDER_ID, "snooze", base),
    );
  });

  it("changes when status moved, which is what cancel then restore does", () => {
    const cancelled = { ...base, status: "cancelled" as const };
    expect(reminderOperationKey(REMINDER_ID, "restore", cancelled)).not.toBe(
      reminderOperationKey(REMINDER_ID, "restore", base),
    );
  });

  it("changes when only the title moved — the case that made hashing necessary", () => {
    // Dropping the title from the key instead of hashing it was written and
    // rejected: two consecutive edits changing only the title would share a key
    // and the second would replay the first.
    const renamed = { ...base, title: "Ligar para o contador na terça" };
    expect(reminderOperationKey(REMINDER_ID, "edit", renamed)).not.toBe(
      reminderOperationKey(REMINDER_ID, "edit", base),
    );
  });

  it("changes when only importance moved", () => {
    expect(reminderOperationKey(REMINDER_ID, "edit", { ...base, important: true })).not.toBe(
      reminderOperationKey(REMINDER_ID, "edit", base),
    );
  });
});

describe("keys do not collide across actions or rows", () => {
  it("differs per action over identical state", () => {
    const keys = new Set(
      (["snooze", "reschedule", "cancel", "restore", "edit"] as const).map((action) =>
        reminderOperationKey(REMINDER_ID, action, base),
      ),
    );
    expect(keys.size).toBe(5);
  });

  it("differs per reminder", () => {
    expect(reminderOperationKey("55555555-5555-4555-8555-555555555555", "cancel", base)).not.toBe(
      reminderOperationKey(REMINDER_ID, "cancel", base),
    );
  });
});

describe("the key fits the database's bound", () => {
  it("stays inside 8..240 even for a 500-character title", () => {
    // The RPC validates 8..240 and then prefixes `reminder-v1:` (12 chars),
    // which must still fit `undo_operations_operation_key_check`'s 8..260.
    const key = reminderOperationKey(REMINDER_ID, "edit", { ...base, title: "x".repeat(500) });
    expect(key.length).toBeGreaterThanOrEqual(8);
    expect(key.length).toBeLessThanOrEqual(240);
    expect(`reminder-v1:${key}`.length).toBeLessThanOrEqual(260);
  });

  it("survives trimming — the RPC btrims before measuring", () => {
    const key = reminderOperationKey(REMINDER_ID, "cancel", base);
    expect(key).toBe(key.trim());
  });
});
