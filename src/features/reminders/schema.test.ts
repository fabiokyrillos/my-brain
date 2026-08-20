import { describe, expect, it } from "vitest";

import {
  expectedReminderStateSchema,
  reminderCommandSchema,
  reminderCreationSchema,
  reminderSubmissionSchema,
} from "./schema";

/**
 * The untrusted boundary (UX-12, DEC-6).
 *
 * The cases that matter here are the refusals. A discriminated union that
 * happily parses `{action: "cancel", remindAt: …}` would let a control forged in
 * devtools carry a field belonging to another command — the exact thing DEC-6
 * names — and the only reason it does not is that every member is `.strict()`.
 */

const VALID_STATE = {
  status: "scheduled",
  remindAt: "2026-12-01T09:00:00.000000+00",
  title: "Ligar para o contador",
  important: false,
};

describe("the expected pre-state", () => {
  it("accepts both offset spellings the two producers emit", () => {
    // `localDateTimeToOffsetInstant` emits `+HH:MM`; Postgres `to_char(..,'OF')`
    // emits a bare `+HH` on a whole-hour offset. Refusing either would break a
    // round trip that is otherwise correct.
    for (const remindAt of [
      "2026-12-01T09:00:00.000000+00",
      "2026-12-01T09:00:00+00:00",
      "2026-12-01T09:00:00-03:00",
      "2026-12-01T09:00:00Z",
      "2026-12-01T09:00Z",
    ]) {
      expect(
        expectedReminderStateSchema.safeParse({ ...VALID_STATE, remindAt }).success,
        `${remindAt} was refused`,
      ).toBe(true);
    }
  });

  it("refuses an instant with no explicit offset", () => {
    // A bare wall-clock would be read in whatever zone the reader happens to
    // have, which is the failure DEC-6's timezone rule exists to prevent.
    expect(expectedReminderStateSchema.safeParse({ ...VALID_STATE, remindAt: "2026-12-01T09:00" }).success).toBe(false);
    expect(expectedReminderStateSchema.safeParse({ ...VALID_STATE, remindAt: "tomorrow" }).success).toBe(false);
  });

  it("refuses an unknown status and a fifth key", () => {
    expect(expectedReminderStateSchema.safeParse({ ...VALID_STATE, status: "deleted" }).success).toBe(false);
    expect(
      expectedReminderStateSchema.safeParse({ ...VALID_STATE, extra: "1" }).success,
    ).toBe(false);
  });
});

describe("no command can smuggle another's fields", () => {
  it("parses each command with exactly its own fields", () => {
    expect(reminderCommandSchema.parse({ action: "snooze", snoozeMinutes: "60" })).toEqual({
      action: "snooze",
      snoozeMinutes: 60,
    });
    expect(
      reminderCommandSchema.parse({ action: "reschedule", remindAtLocal: "2026-12-01T09:00" }),
    ).toEqual({ action: "reschedule", remindAtLocal: "2026-12-01T09:00" });
    expect(reminderCommandSchema.parse({ action: "cancel" })).toEqual({ action: "cancel" });
    expect(reminderCommandSchema.parse({ action: "restore" })).toEqual({ action: "restore" });
    expect(
      reminderCommandSchema.parse({ action: "edit", title: "  Novo título  ", important: "on" }),
    ).toEqual({ action: "edit", title: "Novo título", important: true });
  });

  it("refuses cancel carrying a reschedule field", () => {
    expect(
      reminderCommandSchema.safeParse({ action: "cancel", remindAtLocal: "2026-12-01T09:00" })
        .success,
    ).toBe(false);
  });

  it("refuses restore carrying an edit field", () => {
    expect(
      reminderCommandSchema.safeParse({ action: "restore", title: "forged" }).success,
    ).toBe(false);
  });

  it("refuses snooze carrying an absolute instant", () => {
    expect(
      reminderCommandSchema.safeParse({
        action: "snooze",
        snoozeMinutes: 60,
        remindAtLocal: "2026-12-01T09:00",
      }).success,
    ).toBe(false);
  });

  it("refuses an unnamed action", () => {
    expect(reminderCommandSchema.safeParse({ action: "delete" }).success).toBe(false);
    expect(reminderCommandSchema.safeParse({}).success).toBe(false);
  });
});

describe("per-command value validation", () => {
  it("admits only the five snooze presets", () => {
    for (const minutes of [15, 60, 180, 1440, 10080]) {
      expect(reminderCommandSchema.safeParse({ action: "snooze", snoozeMinutes: minutes }).success).toBe(true);
    }
    for (const minutes of [0, 7, 61, 10081, -60]) {
      expect(
        reminderCommandSchema.safeParse({ action: "snooze", snoozeMinutes: minutes }).success,
        `${minutes} was accepted`,
      ).toBe(false);
    }
  });

  it("refuses a fractional snooze interval", () => {
    expect(reminderCommandSchema.safeParse({ action: "snooze", snoozeMinutes: 60.5 }).success).toBe(false);
  });

  it("takes a local wall-clock for reschedule and refuses an offset-bearing one", () => {
    // The conversion to an instant happens server-side with the profile
    // timezone. Accepting an offset here would let the caller choose the zone.
    expect(
      reminderCommandSchema.safeParse({
        action: "reschedule",
        remindAtLocal: "2026-12-01T09:00:00+05:00",
      }).success,
    ).toBe(false);
  });

  it("bounds the edited title at the column's own limit", () => {
    expect(
      reminderCommandSchema.safeParse({ action: "edit", title: "x".repeat(500), important: "" })
        .success,
    ).toBe(true);
    expect(
      reminderCommandSchema.safeParse({ action: "edit", title: "x".repeat(501), important: "" })
        .success,
    ).toBe(false);
    expect(
      reminderCommandSchema.safeParse({ action: "edit", title: "   ", important: "" }).success,
    ).toBe(false);
  });

  it("reads an absent checkbox as false, not as invalid", () => {
    // An unchecked checkbox submits nothing at all, so the form sends "".
    expect(reminderCommandSchema.parse({ action: "edit", title: "t", important: "" })).toEqual({
      action: "edit",
      title: "t",
      important: false,
    });
  });
});

describe("the submission envelope", () => {
  const valid = {
    locale: "pt-BR",
    reminderId: "44444444-4444-4444-8444-444444444444",
    operationKey: "r5-cancel-abc-1234",
    expectedState: JSON.stringify(VALID_STATE),
  };

  it("parses the expected state out of its single hidden field", () => {
    const parsed = reminderSubmissionSchema.parse(valid);
    expect(parsed.expectedState).toEqual(VALID_STATE);
  });

  it("refuses an unparseable or partial expected state", () => {
    expect(reminderSubmissionSchema.safeParse({ ...valid, expectedState: "{" }).success).toBe(false);
    expect(
      reminderSubmissionSchema.safeParse({
        ...valid,
        expectedState: JSON.stringify({ status: "scheduled" }),
      }).success,
    ).toBe(false);
  });

  it("refuses a non-uuid reminder id and an out-of-bounds operation key", () => {
    expect(reminderSubmissionSchema.safeParse({ ...valid, reminderId: "1" }).success).toBe(false);
    expect(reminderSubmissionSchema.safeParse({ ...valid, operationKey: "short" }).success).toBe(false);
    expect(
      reminderSubmissionSchema.safeParse({ ...valid, operationKey: "x".repeat(241) }).success,
    ).toBe(false);
  });

  it("refuses an unknown locale rather than defaulting silently", () => {
    expect(reminderSubmissionSchema.safeParse({ ...valid, locale: "fr" }).success).toBe(false);
  });
});

/**
 * `2P-REMINDER-003` — create and reschedule share vocabulary and validation.
 *
 * The requirement is easy to satisfy on paper and easy to lose in a refactor, so
 * these assert **agreement between the two schemas** rather than each one's
 * behaviour separately: a value one flow accepts, the other accepts, and a value
 * one refuses, the other refuses. Testing them independently would let the two
 * drift apart while every assertion still passed.
 */
describe("2P-REMINDER-003: creation speaks the reschedule command's vocabulary", () => {
  const valid = {
    locale: "pt-BR",
    title: "Ligar para a clínica",
    remindAtLocal: "2026-09-01T09:30",
    important: "false",
    taskId: "",
  };

  it("accepts a well-formed creation", () => {
    const parsed = reminderCreationSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.important).toBe(false);
      // Empty becomes an explicit absence, so the action never has to know how a
      // `<select>` serialises "none".
      expect(parsed.data.taskId).toBeNull();
    }
  });

  /**
   * The instant grammar, held to the reschedule command's by construction.
   *
   * Every case is run through **both** parsers and the verdicts compared. That
   * is what makes this a shared-vocabulary test rather than two lists somebody
   * has to keep in step by hand.
   */
  it("agrees with reschedule on every instant, accepted and refused alike", () => {
    const instants = [
      "2026-09-01T09:30",
      "2026-01-01T00:00",
      "2026-12-31T23:59",
      // Refusals: seconds, a date alone, a bare time, the ISO Z form, a stray
      // offset, and the empty string.
      "2026-09-01T09:30:00",
      "2026-09-01",
      "09:30",
      "2026-09-01T09:30:00Z",
      "2026-09-01T09:30-03:00",
      "",
    ];
    for (const remindAtLocal of instants) {
      const created = reminderCreationSchema.safeParse({ ...valid, remindAtLocal }).success;
      const rescheduled = reminderCommandSchema
        .safeParse({ action: "reschedule", remindAtLocal }).success;
      expect(created, remindAtLocal).toBe(rescheduled);
    }
  });

  it("agrees with the edit command on titles, accepted and refused alike", () => {
    const titles = ["Ligar", "  espaços em volta  ", "", "   ", "x".repeat(500), "x".repeat(501)];
    for (const title of titles) {
      const created = reminderCreationSchema.safeParse({ ...valid, title }).success;
      const edited = reminderCommandSchema
        .safeParse({ action: "edit", title, important: "false" }).success;
      expect(created, JSON.stringify(title)).toBe(edited);
    }
  });

  it("reads a checkbox the way the edit command does", () => {
    for (const [raw, expected] of [["on", true], ["true", true], ["false", false], ["", false]] as const) {
      const parsed = reminderCreationSchema.safeParse({ ...valid, important: raw });
      expect(parsed.success, raw).toBe(true);
      if (parsed.success) expect(parsed.data.important, raw).toBe(expected);
    }
  });

  it("refuses a link that is not an identifier, rather than storing it", () => {
    expect(reminderCreationSchema.safeParse({ ...valid, taskId: "not-a-uuid" }).success).toBe(false);
    expect(
      reminderCreationSchema
        .safeParse({ ...valid, taskId: "11111111-1111-4111-8111-111111111111" }).success,
    ).toBe(true);
  });

  /**
   * `.strict()`, and why that one line carries `2P-REMINDER-RECURRENCE`.
   *
   * A field the schema does not declare is a **refusal**, not a silently dropped
   * key — so *"we do not offer it"* and *"we do not accept it"* stay the same
   * statement, whatever a stale client or a hand-made request sends. That covers
   * the repeat-shaped fields without this file listing them: the vocabulary is
   * enforced tree-wide by `phase-2m-recurrence-guard.test.ts`, which exempts
   * only itself, and a second list spelled here as code is exactly the
   * collision §100 recorded and refused to solve by widening that exemption.
   *
   * The accepted keys are asserted as a closed set below, which is the stronger
   * half: a blocklist refuses what somebody thought of, a closed list refuses
   * everything else.
   */
  it("refuses an unknown field rather than ignoring it", () => {
    expect(reminderCreationSchema.safeParse({ ...valid, snoozeMinutes: 15 }).success).toBe(false);
    expect(reminderCreationSchema.safeParse({ ...valid, whatever: "weekly" }).success).toBe(false);
  });

  it("accepts exactly five keys, so a sixth cannot arrive without a decision", () => {
    const parsed = reminderCreationSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(Object.keys(parsed.data).sort())
        .toEqual(["important", "locale", "remindAtLocal", "taskId", "title"]);
    }
  });
});
