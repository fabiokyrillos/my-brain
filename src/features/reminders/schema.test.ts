import { describe, expect, it } from "vitest";

import {
  expectedReminderStateSchema,
  reminderCommandSchema,
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
