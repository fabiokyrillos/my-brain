import { z } from "zod";

/**
 * Life Brain C.5 — what the birthday form may submit. The database checks the
 * same date again (`people_birthday_range_check`, `set_person_birthday`); this
 * is the boundary's own refusal, so a bad date never reaches the RPC.
 */
export function isRealBirthday(day: number, month: number, year: number | null): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month) || month < 1 || month > 12 || day < 1) return false;
  if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2100)) return false;
  // 2000 is a leap year, so 29 February passes without a year.
  const lastDay = new Date(Date.UTC(year ?? 2000, month, 0)).getUTCDate();
  return day <= lastDay;
}

const optionalInt = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
  z.number().int().nullable(),
);

export const birthdayFormSchema = z
  .object({
    personId: z.string().uuid(),
    intent: z.enum(["set", "clear"]),
    day: optionalInt,
    month: optionalInt,
    year: optionalInt,
  })
  .superRefine((value, context) => {
    if (value.intent === "clear") return;
    if (value.day === null || value.month === null || !isRealBirthday(value.day, value.month, value.year)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "invalid birthday" });
    }
  });
