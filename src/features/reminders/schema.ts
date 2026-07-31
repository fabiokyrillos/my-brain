import { z } from "zod";

import { REMINDER_STATUSES, SNOOZE_PRESET_MINUTES } from "./lifecycle";

/**
 * The untrusted boundary between the reminders surface and the command RPC.
 *
 * Every schema here is `.strict()`: a forged or stale control is a rejection,
 * not a silently dropped field. That mirrors the RPC's own exact key-set
 * equality check — the two refuse the same requests for the same reason, so a
 * caller cannot discover a looser path by going around the form.
 *
 * The discriminated union is the whole point. `apply_reminder_command_v1` admits
 * five named commands, each with its own fields, and DEC-6 forbids "one
 * operation smuggling fields belonging to another". A `discriminatedUnion` on
 * `action` gives that property at the type level *and* at runtime: parsing
 * `{action: "cancel", remindAt: "…"}` fails here before it can fail in SQL.
 */

/**
 * The four scalars the surface rendered, echoed back so the RPC can refuse a
 * stale write.
 *
 * `remindAt` is passed through as an opaque string, not re-parsed into a `Date`
 * and re-serialized: the RPC compares it as a `timestamptz`, and a round-trip
 * through JavaScript's date formatting is a chance to change the value the owner
 * actually saw. It is validated for shape only.
 */
export const expectedReminderStateSchema = z
  .object({
    status: z.enum(REMINDER_STATUSES),
    // Explicit-offset instants only, in either of the two spellings the two
    // producers emit: `+HH:MM` from `localDateTimeToOffsetInstant`, and a bare
    // `+HH` from Postgres `to_char(..., 'OF')` on a whole-hour offset.
    remindAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}(:\d{2})?)$/),
    title: z.string().min(1).max(500),
    important: z.boolean(),
  })
  .strict();

export type ExpectedReminderState = z.infer<typeof expectedReminderStateSchema>;

const reminderIdSchema = z.string().uuid();

/**
 * The operation key.
 *
 * Bounded 8..240 to match the RPC's own validation, which in turn leaves room
 * for the `reminder-v1:` prefix inside `undo_operations_operation_key_check`'s
 * 8..260 stored bound. The form mints one per rendered control, so a
 * double-submitted button replays rather than applying twice.
 */
const operationKeySchema = z.string().trim().min(8).max(240);

const localeSchema = z.enum(["pt-BR", "en"]);

/**
 * `FormData` arrives as strings. These coercions are written once here rather
 * than at each call site so "the checkbox is on/off" and "the select is a
 * number" cannot drift between the four forms that submit them.
 */
const checkboxSchema = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")])
  .transform((value) => value === "on" || value === "true");

export const reminderCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("snooze"),
      // A closed preset set, not a free integer: relative offsets from `now()`
      // carry no timezone, so there is no browser-supplied offset to mistrust.
      snoozeMinutes: z.coerce
        .number()
        .int()
        .refine(
          (value): value is (typeof SNOOZE_PRESET_MINUTES)[number] =>
            (SNOOZE_PRESET_MINUTES as readonly number[]).includes(value),
          { message: "not a snooze preset" },
        ),
    })
    .strict(),
  z
    .object({
      action: z.literal("reschedule"),
      // The raw `<input type="datetime-local">` value. It is converted to an
      // explicit-offset instant using the owner's **profile** timezone by
      // `localDateTimeToOffsetInstant`, never by the browser's zone — the
      // "no unsafe browser-supplied offset" rule DEC-6 states.
      remindAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    })
    .strict(),
  z.object({ action: z.literal("cancel") }).strict(),
  z.object({ action: z.literal("restore") }).strict(),
  z
    .object({
      action: z.literal("edit"),
      title: z.string().trim().min(1).max(500),
      important: checkboxSchema,
    })
    .strict(),
]);

export type ReminderCommandInput = z.infer<typeof reminderCommandSchema>;

/**
 * The whole submission: which reminder, which command, what the caller believed
 * it looked like, and the key that makes a retry idempotent.
 *
 * `expectedState` travels as a JSON string in one hidden field rather than four
 * loose ones. That is not a shortcut — it keeps the four scalars atomically
 * paired with each other, so a partially-stale hidden field set cannot be
 * assembled from two different renders of the row.
 */
export const reminderSubmissionSchema = z
  .object({
    locale: localeSchema,
    reminderId: reminderIdSchema,
    operationKey: operationKeySchema,
    expectedState: z
      .string()
      .min(2)
      .max(4000)
      .transform((value, ctx) => {
        try {
          return expectedReminderStateSchema.parse(JSON.parse(value));
        } catch {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "unparseable expected state" });
          return z.NEVER;
        }
      }),
  })
  .strict();

export type ReminderSubmission = z.infer<typeof reminderSubmissionSchema>;
