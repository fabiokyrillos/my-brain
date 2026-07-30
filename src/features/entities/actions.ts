"use server";

/**
 * The first write path Projects and People have ever had (UX-08, UX-09).
 *
 * Before this, `createRecord` inserted `{user_id, name}` and nothing else could
 * be changed: `projects.description`, `projects.status`, `people.notes` and both
 * `organization_id` columns existed in the schema and were unreachable from the
 * UI. This module makes them editable **without** adding a column — DEC-4 defers
 * every schema question until the existing ones are surfaced.
 *
 * Four properties, each stated where it is implemented:
 *
 * 1. **Ownership is proved twice.** RLS is the trust boundary, and the `user_id`
 *    predicate on every statement is the belt to its braces. A policy edited in
 *    a later migration would silently widen these writes otherwise, and a
 *    cross-tenant update is not the failure to discover in production.
 * 2. **The pre-state is read before the write, in the same ownership scope.**
 *    An audit row that records only the result cannot answer "what did this
 *    change", which is the question the row exists for.
 * 3. **Every failure is a distinct, localized sentence.** A duplicate name and a
 *    vanished row are different things to do next; collapsing them into "could
 *    not save" is how a user ends up retrying something that can never succeed.
 * 4. **Nothing is invented.** No column is added, no relation is created, and
 *    the organization list is read from what already exists.
 *
 * These are plain RLS-scoped statements rather than an RPC, matching the posture
 * `createRecord` already uses for these two tables. `authenticated` still holds
 * `update` on both (`202607160003:195`); Phase 2F's revocation covered `tasks`
 * and `reminders` only, deliberately.
 */

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import { resolveLocale, type Locale } from "@/lib/preferences";

import { getEntityCopy } from "./copy";
import type { EntityEditState, EntityEditSubmission } from "./edit-state";
import { personUpdateSchema, projectUpdateSchema } from "./schema";

/**
 * A unique-index violation, told apart from every other write failure.
 *
 * `projects_user_name_idx` and `people_user_name_idx` are unique on
 * `(user_id, lower(name))`, so renaming onto an existing name is a *user*
 * mistake with an obvious next step, not an outage. Postgres reports it as
 * `23505`; the message check is a fallback for clients that surface the text
 * without the code.
 */
function isDuplicateName(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = error.message ?? "";
  return message.includes("duplicate key") || message.includes("_user_name_idx");
}

/**
 * A refusal, carrying the submission back when the owner can act on it.
 *
 * React 19 resets an uncontrolled form once a Server Action completes, so a
 * refused save would otherwise snap the field back to the stored value — an
 * error message above an edit the user can no longer see. `notFound` and
 * `saveFailed` pass nothing, because there is no edit left to preserve.
 */
function failed(
  locale: Locale,
  key: "invalidInput" | "sessionExpired" | "duplicateName" | "notFound" | "saveFailed",
  submitted: EntityEditSubmission | null = null,
): EntityEditState {
  return { status: "error", message: getEntityCopy(locale)[key], submitted };
}

/**
 * The submitted fields, without React's own.
 *
 * A Server Action's `FormData` carries framework metadata under `$ACTION_*`
 * keys. Both schemas here are `.strict()` — deliberately, so a forged control
 * is a rejection rather than a silent drop — which means those keys would fail
 * every save. `updateProfile` filters them for exactly this reason
 * (`profile/actions.ts:18-20`); this is the same filter, and it is the only
 * thing separating a strict schema from an unusable form.
 */
function submittedFields(formData: FormData): EntityEditSubmission {
  return Object.fromEntries(
    Array.from(formData.entries())
      .filter(([key]) => !key.startsWith("$ACTION_"))
      .map(([key, value]) => [key, typeof value === "string" ? value : ""]),
  );
}

export async function updateProject(
  _previous: EntityEditState,
  formData: FormData,
): Promise<EntityEditState> {
  // Resolved first and independently: the validation failure below happens
  // before the schema succeeds and still has to be localized (ADR-036).
  const locale = resolveLocale(formData.get("locale"));

  const fields = submittedFields(formData);
  const parsed = projectUpdateSchema.safeParse(fields);
  if (!parsed.success) return failed(locale, "invalidInput", fields);
  const { projectId, name, description, status, organizationId } = parsed.data;

  const { supabase, user } = await requireUser(parsed.data.locale);

  // Read before write, in the same ownership scope, so the audit row can say
  // what changed rather than only what it now is.
  const before = await supabase
    .from("projects")
    .select("name,description,status,organization_id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (before.error) return failed(locale, "saveFailed");
  if (!before.data) return failed(locale, "notFound");

  const { data: after, error } = await supabase
    .from("projects")
    .update({ name, description, status, organization_id: organizationId, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", user.id)
    .select("name,description,status,organization_id")
    .maybeSingle();

  if (error) return failed(locale, isDuplicateName(error) ? "duplicateName" : "saveFailed", fields);
  // A row that passed the pre-read and matched nothing here was deleted in
  // between. Reported as gone rather than as a generic failure.
  if (!after) return failed(locale, "notFound");

  // The audit row is part of the write, not a side effect of it: an edit that
  // succeeded without one would be a change with no record of who made it.
  // Its own failure is not surfaced, because the change did happen and telling
  // the user it did not would be the larger lie.
  const audit = await supabase.from("audit_logs").insert({
    user_id: user.id,
    action_type: "update_project",
    entity_type: "project",
    entity_id: projectId,
    actor: "user",
    before_state: before.data,
    after_state: after,
    reason: "Owner edited the project from its detail page",
  });
  if (audit.error) console.error("Project edit audit failed", audit.error.message);

  revalidatePath(`/${parsed.data.locale}/app/projects/${projectId}`);
  revalidatePath(`/${parsed.data.locale}/app/projects`);
  return { status: "success", message: getEntityCopy(locale).saved };
}

export async function updatePerson(
  _previous: EntityEditState,
  formData: FormData,
): Promise<EntityEditState> {
  const locale = resolveLocale(formData.get("locale"));

  const fields = submittedFields(formData);
  const parsed = personUpdateSchema.safeParse(fields);
  if (!parsed.success) return failed(locale, "invalidInput", fields);
  const { personId, name, notes, organizationId } = parsed.data;

  const { supabase, user } = await requireUser(parsed.data.locale);

  const before = await supabase
    .from("people")
    .select("name,notes,organization_id")
    .eq("id", personId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (before.error) return failed(locale, "saveFailed");
  if (!before.data) return failed(locale, "notFound");

  const { data: after, error } = await supabase
    .from("people")
    .update({ name, notes, organization_id: organizationId, updated_at: new Date().toISOString() })
    .eq("id", personId)
    .eq("user_id", user.id)
    .select("name,notes,organization_id")
    .maybeSingle();

  if (error) return failed(locale, isDuplicateName(error) ? "duplicateName" : "saveFailed", fields);
  if (!after) return failed(locale, "notFound");

  const audit = await supabase.from("audit_logs").insert({
    user_id: user.id,
    action_type: "update_person",
    entity_type: "person",
    entity_id: personId,
    actor: "user",
    before_state: before.data,
    after_state: after,
    reason: "Owner edited the person from their detail page",
  });
  if (audit.error) console.error("Person edit audit failed", audit.error.message);

  revalidatePath(`/${parsed.data.locale}/app/people/${personId}`);
  revalidatePath(`/${parsed.data.locale}/app/people`);
  return { status: "success", message: getEntityCopy(locale).saved };
}
