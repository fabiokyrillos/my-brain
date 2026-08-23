import { z } from "zod";

import { recurrenceRuleSchema } from "./recurrence-rule";

/**
 * The untrusted boundary between a repeating-reminder surface and
 * `create_reminder_series_v1` / `apply_reminder_series_command_v1`.
 *
 * Every schema here is `.strict()`, mirroring `schema.ts`'s discipline and the
 * RPCs' own exact key-set equality: the two refuse the same requests for the
 * same reason, so a caller cannot discover a looser path by going around the
 * form.
 *
 * ## What is validated here, and what is not
 *
 * **Shape only.** No instant is computed and none is accepted from a caller:
 * `2R-TIME-007` puts occurrence instants in exactly one place, and that place
 * is the database. What crosses this boundary is a **wall-clock intention** —
 * a local date and a local time the owner typed — which the RPC resolves
 * through the owner's profile zone. There is no offset here to mistrust,
 * which is the same property `snoozeMinutes` has in `schema.ts` and for the
 * same reason.
 *
 * ## Slice 2R.1 ships this without a surface, deliberately
 *
 * The plan gives slice 2R.1 *"the one allocated migration, its writer, and the
 * wall-clock semantics. **No surface.**"* So these schemas are exercised by
 * tests and by `series-actions.ts`, and the modal that will submit them lands
 * in slice 2R.3. That is not schema nobody uses — it is the writer arriving
 * with the migration, which is the rule ADR-123 Decision 7 set.
 */

const localeSchema = z.enum(["pt-BR", "en"]);

/**
 * The operation key, bounded exactly as the two RPCs bound it.
 *
 * 8..240, leaving room for the `series-v1:` and `series-cmd-v1:` prefixes
 * inside `undo_operations_operation_key_check`'s stored 8..260.
 */
const operationKeySchema = z.string().trim().min(8).max(240);

/** `FormData` arrives as strings; the coercion lives here once. */
const checkboxSchema = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")])
  .transform((value) => value === "on" || value === "true");

/**
 * The anchor: a local date and a local time, never an instant.
 *
 * Split into a date and an `HH:MM` rather than carried as one
 * `datetime-local` string because the series stores them separately — the date
 * is where the rule starts, the time is the wall clock every occurrence keeps.
 * Combining them here and splitting them in SQL would put the same parse in two
 * places.
 */
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const reminderSeriesCreationSchema = z
  .object({
    locale: localeSchema,
    title: z.string().trim().min(1).max(500),
    important: checkboxSchema,
    /** The same optional link a single reminder may carry, over the same column. */
    taskId: z
      .union([z.string().uuid(), z.literal("")])
      .optional()
      .transform((value) => (value === "" || value === undefined ? null : value)),
    anchorDate: localDateSchema,
    anchorTime: localTimeSchema,
    /**
     * The rule as a parsed object, not a string.
     *
     * A surface that serialised it to JSON and back would make the boundary's
     * refusal depend on `JSON.parse` succeeding first, which turns "your rule
     * is not one of the five" into "something was malformed". The action
     * assembles the object from its own controls and hands it over typed.
     */
    rule: recurrenceRuleSchema,
    operationKey: operationKeySchema,
  })
  .strict();

export type ReminderSeriesCreation = z.infer<typeof reminderSeriesCreationSchema>;

/**
 * The three series commands, as a discriminated union on `kind`.
 *
 * The same closed shape `reminderCommandSchema` gives the five single-reminder
 * commands, and it carries the same property: parsing
 * `{kind: "end_series", rule: {...}}` fails here before it can fail in SQL.
 *
 * **`detach_occurrence` is the default scope**, and that is `OD-2R-4`'s whole
 * point — the narrower action is the one a control falls back to, because a
 * default that silently changes every future occurrence is the shape of an
 * irreversible surprise.
 */
export const reminderSeriesCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("detach_occurrence") }).strict(),
  z
    .object({
      kind: z.literal("edit_future"),
      rule: recurrenceRuleSchema.optional(),
      title: z.string().trim().min(1).max(500).optional(),
      important: z.boolean().optional(),
      hour: z.number().int().min(0).max(23).optional(),
      minute: z.number().int().min(0).max(59).optional(),
    })
    .strict()
    .refine(
      (command) =>
        command.rule !== undefined
        || command.title !== undefined
        || command.important !== undefined
        || command.hour !== undefined
        || command.minute !== undefined,
      { message: "an edit must change something" },
    ),
  z.object({ kind: z.literal("end_series") }).strict(),
]);

export type ReminderSeriesCommand = z.infer<typeof reminderSeriesCommandSchema>;

/**
 * The two scopes `2R-SERIES-001` requires a control to offer, in the order a
 * control must offer them.
 *
 * **The narrower is first and is the default.** Declared as data rather than
 * left to each surface, so slice 2R.3's control and any later one cannot
 * disagree about which is safe — and so a test can assert the order rather
 * than a reviewer having to notice it.
 */
export const REMINDER_SERIES_SCOPES = ["occurrence", "future"] as const;

export type ReminderSeriesScope = (typeof REMINDER_SERIES_SCOPES)[number];

export const DEFAULT_REMINDER_SERIES_SCOPE: ReminderSeriesScope = "occurrence";

/** The command a chosen scope maps to. One mapping, so two surfaces cannot differ. */
export function commandForScope(scope: ReminderSeriesScope): ReminderSeriesCommand["kind"] {
  return scope === "occurrence" ? "detach_occurrence" : "edit_future";
}

export const reminderSeriesSubmissionSchema = z
  .object({
    locale: localeSchema,
    seriesId: z.string().uuid(),
    operationKey: operationKeySchema,
    scope: z.enum(REMINDER_SERIES_SCOPES),
  })
  .strict();

export type ReminderSeriesSubmission = z.infer<typeof reminderSeriesSubmissionSchema>;

/**
 * `2R-SERIES-007` — the undo submission, which is one identifier and nothing else.
 *
 * Deliberately **not** carrying the scope, the series or the reminder it came
 * from. `public.undo_operation` re-reads the recorded operation and decides for
 * itself what to compensate; anything else travelling here would be a second
 * opinion about a decision the router has already made from the ledger, and a
 * second opinion is what makes two authorities.
 */
export const reminderSeriesUndoSchema = z
  .object({
    locale: localeSchema,
    undoId: z.string().uuid(),
  })
  .strict();

export type ReminderSeriesUndo = z.infer<typeof reminderSeriesUndoSchema>;
