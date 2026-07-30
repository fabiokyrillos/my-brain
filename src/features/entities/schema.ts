import { z } from "zod";

/**
 * The validated shape of an entity edit (UX-08, UX-09).
 *
 * Every bound here mirrors a column constraint rather than a UI preference, so
 * a value this accepts is a value the database accepts. Where they would
 * disagree the form would show a generic failure it could not explain, which is
 * the failure mode this module exists to prevent.
 *
 * Pure and synchronous — no clock, no I/O, no Supabase.
 */

/** `projects_name_check` / `people_name_check`: 1–160 characters. */
const entityName = z.string().trim().min(1).max(160);

/**
 * An optional free-text column, normalized to `null` rather than `""`.
 *
 * `projects.description` and `people.notes` are nullable with no default, and
 * both detail pages already fall back on `null` to render their placeholder
 * sentence. Storing an empty string instead would leave a row that is neither
 * absent nor present: the placeholder would stop appearing and nothing would
 * take its place.
 */
const optionalText = z
  .string()
  .trim()
  .max(4000)
  .transform((value) => (value === "" ? null : value));

/**
 * A relation that may be cleared.
 *
 * The empty string is what an unselected `<select>` submits, and it means "no
 * organization" — which the column models as `null`, since it is
 * `references public.organizations(id) on delete set null`.
 */
const optionalRelation = z
  .union([z.string().uuid(), z.literal("")])
  .transform((value) => (value === "" ? null : value));

/** The four literals `projects_status_check` allows. */
export const PROJECT_STATUSES = ["active", "paused", "completed", "archived"] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const projectUpdateSchema = z.object({
  projectId: z.string().uuid(),
  locale: z.enum(["pt-BR", "en"]),
  name: entityName,
  description: optionalText,
  status: z.enum(PROJECT_STATUSES),
  organizationId: optionalRelation,
}).strict();

export const personUpdateSchema = z.object({
  personId: z.string().uuid(),
  locale: z.enum(["pt-BR", "en"]),
  name: entityName,
  notes: optionalText,
  organizationId: optionalRelation,
}).strict();

export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type PersonUpdateInput = z.infer<typeof personUpdateSchema>;
