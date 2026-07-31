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
 *
 * **The `4000` is the one bound in this module that is not a column
 * constraint.** Every free-text column this covers — including
 * `organizations.description` and `contexts.description`, which the EGC.1
 * schemas reuse it for — is bare `text` with no CHECK. It is a deliberate
 * product ceiling on a field the owner types into, not a mirror of anything,
 * and it is named here so the module's opening claim stays accurate rather than
 * approximately true.
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

/**
 * `contexts_name_check`: 1–120 characters — **not** 160.
 *
 * `organizations`, `projects` and `people` all bound their name at 160
 * (`202607160003:14,26,39`); `contexts` bounds it at 120 (`:4`). Reusing
 * `entityName` here would accept 121–160 and let the database refuse a value
 * the form had already told the user was fine.
 */
const contextName = z.string().trim().min(1).max(120);

/** The four literals `projects_status_check` allows. */
export const PROJECT_STATUSES = ["active", "paused", "completed", "archived"] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** The three literals `contexts_kind_check` allows (`202607160003:6`). */
export const CONTEXT_KINDS = ["work", "personal", "custom"] as const;

export type ContextKind = (typeof CONTEXT_KINDS)[number];

/**
 * `contexts.kind` narrowed for rendering, defaulting to `custom`.
 *
 * The column is `text` with a CHECK, so a value outside the three is a data
 * fault rather than a crash — the same posture `projects/[projectId]/page.tsx`
 * already takes for `projects.status`. `custom` is the safe default because it
 * is the kind that promises the reader least about the row.
 */
export function asContextKind(value: string): ContextKind {
  return (CONTEXT_KINDS as readonly string[]).includes(value) ? (value as ContextKind) : "custom";
}

/**
 * Organizations and contexts gain their first write path (EGC-ORG, EGC-CTX).
 *
 * Both tables have carried forced RLS, four own-row policies and full
 * `authenticated` CRUD since `202607160003:185-197`, and until now only the
 * interpretation-persistence RPC (`202607160005`) has ever written them. These
 * schemas add **no column**: every field below is one the table already has.
 *
 * There is no delete schema, and that is deliberate rather than unfinished.
 * `contexts.id` is referenced by `person_contexts.context_id` and
 * `task_contexts.context_id` with `on delete cascade`, so deleting a context
 * would silently destroy every association that referenced it. EGC-DEC-1 keeps
 * deletion out of this initiative rather than ship a destructive control over a
 * cascade without the confirmation-and-undo contract such an action needs.
 */
export const organizationCreateSchema = z.object({
  locale: z.enum(["pt-BR", "en"]),
  name: entityName,
  description: optionalText,
}).strict();

export const organizationUpdateSchema = z.object({
  organizationId: z.string().uuid(),
  locale: z.enum(["pt-BR", "en"]),
  name: entityName,
  description: optionalText,
}).strict();

export const contextCreateSchema = z.object({
  locale: z.enum(["pt-BR", "en"]),
  name: contextName,
  description: optionalText,
  kind: z.enum(CONTEXT_KINDS),
}).strict();

export const contextUpdateSchema = z.object({
  contextId: z.string().uuid(),
  locale: z.enum(["pt-BR", "en"]),
  name: contextName,
  description: optionalText,
  kind: z.enum(CONTEXT_KINDS),
}).strict();

export type OrganizationCreateInput = z.infer<typeof organizationCreateSchema>;
export type OrganizationUpdateInput = z.infer<typeof organizationUpdateSchema>;
export type ContextCreateInput = z.infer<typeof contextCreateSchema>;
export type ContextUpdateInput = z.infer<typeof contextUpdateSchema>;

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
