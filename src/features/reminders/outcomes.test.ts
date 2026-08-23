import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { locales } from "@/lib/preferences";

import { getReminderCopy, reminderFailureMessage } from "./copy";
import {
  mapReminderCommandError,
  REMINDER_COMMAND_ERROR_DETAILS,
  REMINDER_COMMAND_UNTAGGED_FAILURES,
  sqlstateForDetail,
} from "./outcomes";

/**
 * The closed failure vocabulary (UX-12), held to the same three rules
 * `errors.test.ts` holds the 2E vocabulary to:
 *
 * 1. every declared token is actually raised by the migration — a declared code
 *    nothing can provoke is the same defect as a missing one;
 * 2. every declared token pairs with the SQLSTATE the table claims;
 * 3. every member of both lists has a sentence in both locales.
 */

const MIGRATION = readFileSync(
  path.resolve(process.cwd(), "supabase/migrations/202607310064_reminder_lifecycle_command.sql"),
  "utf8",
);

describe("the declared tokens are the ones the migration raises", () => {
  it("finds every declared token in a raise", () => {
    for (const detail of REMINDER_COMMAND_ERROR_DETAILS) {
      expect(MIGRATION, `${detail} is declared but never raised`).toContain(
        `detail = '${detail}'`,
      );
    }
  });

  it("pairs each token with the SQLSTATE the mapper's table claims", () => {
    for (const detail of REMINDER_COMMAND_ERROR_DETAILS) {
      const sqlstate = sqlstateForDetail(detail);
      // The raise spells the code and the detail in one statement, in that
      // order, so matching the pair proves they belong together rather than
      // both merely existing somewhere in a 900-line file.
      const pattern = new RegExp(
        `errcode = '${sqlstate}',\\s*detail = '${detail}'`,
      );
      expect(MIGRATION, `${detail} is not raised with ${sqlstate}`).toMatch(pattern);
    }
  });

  it("never uses 40001 for staleness", () => {
    // 2C-UNDO-004 / migration 050: 40001 makes the gateway hang until timeout.
    expect(sqlstateForDetail("G5_REMINDER_STALE_STATE")).toBe("55P03");
    // `raise … errcode`, not a bare occurrence: the migration's post-deploy
    // block greps the undo bundle *for* `40001`, and a substring assertion
    // would fail on that guard instead of on a use.
    expect(MIGRATION).not.toMatch(/errcode = '40001'/);
  });

  it("raises no G5 token the mapper has not declared", () => {
    const raised = [...MIGRATION.matchAll(/detail = '(G5_[A-Z_]+)'/g)].map((match) => match[1]);
    const declared = new Set<string>([
      ...REMINDER_COMMAND_ERROR_DETAILS,
      // The undo handler's own tokens are deliberately not in the surface's
      // vocabulary — the reminders page never calls `undo_operation`, so this
      // mapper cannot see them. They are covered in pgTAP, where they are
      // reachable.
      "G5_REMINDER_UNDO_UNSUPPORTED",
      "G5_REMINDER_UNDO_INTEGRITY",
      "G5_REMINDER_UNDO_STALE",
    ]);
    for (const token of raised) {
      expect(declared.has(token), `${token} is raised but undeclared anywhere`).toBe(true);
    }
  });
});

describe("mapping a database error onto the vocabulary", () => {
  it("prefers the token over the SQLSTATE, because two tokens share each code", () => {
    expect(
      mapReminderCommandError({ code: "55000", details: "G5_REMINDER_EDIT_TASK_LINKED" }),
    ).toBe("G5_REMINDER_EDIT_TASK_LINKED");
    expect(
      mapReminderCommandError({ code: "55000", details: "G5_REMINDER_TRANSITION_NOT_ALLOWED" }),
    ).toBe("G5_REMINDER_TRANSITION_NOT_ALLOWED");
  });

  it("finds a token that arrived in message rather than details", () => {
    expect(
      mapReminderCommandError({ code: "P0001", message: "… G5_REMINDER_IDEMPOTENCY_MISMATCH" }),
    ).toBe("G5_REMINDER_IDEMPOTENCY_MISMATCH");
  });

  it("maps the three untagged SQLSTATEs", () => {
    expect(mapReminderCommandError({ code: "42501" })).toBe("unauthenticated");
    expect(mapReminderCommandError({ code: "22023" })).toBe("invalid_payload");
    expect(mapReminderCommandError({ code: "P0002" })).toBe("not_found");
  });

  it("degrades anything else to unknown rather than surfacing raw SQL", () => {
    expect(mapReminderCommandError({ code: "23514", message: "violates check constraint" })).toBe(
      "unknown",
    );
    expect(mapReminderCommandError(null)).toBe("unknown");
    expect(mapReminderCommandError({})).toBe("unknown");
  });

  it("gives a foreign reminder and a missing one the same answer", () => {
    // The RPC raises one error for both, deliberately. Splitting them here
    // would reintroduce, in the UI, the existence disclosure SQL refuses.
    expect(mapReminderCommandError({ code: "P0002", message: "Reminder not found" })).toBe(
      "not_found",
    );
  });
});

describe("every failure has a sentence, in both locales", () => {
  const all = [...REMINDER_COMMAND_ERROR_DETAILS, ...REMINDER_COMMAND_UNTAGGED_FAILURES];

  for (const locale of locales) {
    it(`covers all ${all.length} codes in ${locale}`, () => {
      for (const code of all) {
        const message = reminderFailureMessage(locale, code);
        expect(message, `${code} has no ${locale} sentence`).toBeTruthy();
        expect(message.length, `${code}'s ${locale} sentence is a stub`).toBeGreaterThan(8);
        // A code leaking into its own message means the mapping fell through.
        expect(message).not.toContain("G5_");
      }
    });
  }

  it("says something different for the two 55000 tokens", () => {
    // They share a SQLSTATE and lead to different next steps: rename the task
    // versus nothing can be done here. Identical copy would erase that.
    for (const locale of locales) {
      const copy = getReminderCopy(locale);
      expect(copy.failure.G5_REMINDER_EDIT_TASK_LINKED).not.toBe(
        copy.failure.G5_REMINDER_TRANSITION_NOT_ALLOWED,
      );
    }
  });
});

/**
 * `23505` — the one refusal that arrives without a token, slice 2R.2.
 *
 * `reminders_one_live_occurrence_per_series` is a partial unique index, so it
 * has no `raise` and can have no `G5_*` name. It reaches the product as a bare
 * SQLSTATE, and before this it fell through to `unknown`: a nameable refusal
 * reported as a mystery.
 *
 * The cases below run in both directions, because matching on `23505` alone
 * would have been wrong. The table carries other unique indexes — the
 * idempotency key among them — and reporting a key collision as "the repetition
 * already has a next one" would name the wrong cause with total confidence.
 */
describe("the live-occurrence collision", () => {
  it("is named when the constraint is the series one", () => {
    expect(
      mapReminderCommandError({
        code: "23505",
        message: 'duplicate key value violates unique constraint "reminders_one_live_occurrence_per_series"',
        details: null,
      }),
    ).toBe("series_slot_taken");
  });

  it("reads the constraint out of `details` too, not only `message`", () => {
    // PostgREST has put the constraint in either field depending on the context
    // the error passed through — the same reason `detailFrom` scans both.
    expect(
      mapReminderCommandError({
        code: "23505",
        message: null,
        details: 'Key (series_id)=(…) already exists. reminders_one_live_occurrence_per_series',
      }),
    ).toBe("series_slot_taken");
  });

  it("stays `unknown` for a different unique index with the same SQLSTATE", () => {
    expect(
      mapReminderCommandError({
        code: "23505",
        message: 'duplicate key value violates unique constraint "undo_operations_operation_key_key"',
        details: null,
      }),
    ).toBe("unknown");
  });

  it("has a sentence in both locales that names the cause", () => {
    for (const locale of locales) {
      const message = reminderFailureMessage(locale, "series_slot_taken");
      expect(message).toBeTruthy();
      // Distinct from the generic failure: the whole point is that this one can
      // be explained, and "we could not apply the change" explains nothing.
      expect(message).not.toBe(getReminderCopy(locale).failure.unknown);
    }
  });
});
