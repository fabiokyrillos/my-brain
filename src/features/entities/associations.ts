"use server";

/**
 * The only application writer of `public.person_contexts` and
 * `public.person_projects` (EGC-ASSOC).
 *
 * ## Why one module serves two surfaces
 *
 * `EGC-ASSOC-003`: associating Marina with Atlas is the same fact whether the
 * owner is looking at Marina or at Atlas. Two write paths would be two places
 * for the soft-end contract, the ownership check and the duplicate refusal to
 * disagree — and risk R3 in the PRD names exactly that. So both surfaces submit
 * the same shape to the same action, and `origin` steers only the revalidation
 * and the audit reason. **It can never select a different table, predicate or
 * write.** `write-path-inventory.test.ts` asserts the single writer in both
 * directions.
 *
 * ## The trigger already writes these tables, and that matters
 *
 * `link_interpreted_entities` (`202607160011`) inserts into both with
 * `on conflict do nothing`, from the interpretation path. So this module is the
 * only *application* writer, not the only writer — and a manual add after a
 * trigger add would collide. The partial unique indexes
 * (`person_contexts_current_idx`, `person_projects_current_idx`, both on the
 * live pair) are what make that collision a `23505` rather than a duplicate,
 * and the duplicate check below turns it into a sentence before it gets there.
 *
 * ## Ending is not deleting (EGC-ASSOC-005, EGC-DEC-2)
 *
 * Both end functions set `valid_until = now()`. Neither table has a delete path
 * in this module and neither has a delete schema. The partial unique indexes
 * cover only live rows, so re-adding after an end succeeds and produces exactly
 * one live row (EGC-ASSOC-006) — asserted, not assumed.
 */

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import { resolveLocale, type Locale } from "@/lib/preferences";

import { getEntityCopy } from "./copy";
import type { EntityEditState } from "./edit-state";
import { failedRelation, submittedRelationFields } from "./relation-state";
import {
  personContextEndSchema,
  personContextSchema,
  personProjectEndSchema,
  personProjectSchema,
} from "./schema";

/** A unique-index violation on a live pair, told apart from an outage. */
function isDuplicateAssociation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  return (error.message ?? "").includes("duplicate key");
}

function revalidateBoth(locale: Locale, personId: string, otherPath: string | null) {
  revalidatePath(`/${locale}/app/people/${personId}`);
  if (otherPath) revalidatePath(`/${locale}/app/${otherPath}`);
}

/**
 * Prove a target row is the caller's own before writing a link to it
 * (EGC-ASSOC-007).
 *
 * The composite FKs `202607170016` added make a cross-owner write structurally
 * impossible, so this is **not** the safety. It exists so the failure is a
 * localized refusal instead of a `23503` with a constraint name in it.
 */
async function ownsBoth(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  personId: string,
  target: { table: "contexts" | "projects"; id: string },
): Promise<"ok" | "missing" | "failed"> {
  const [person, other] = await Promise.all([
    supabase.from("people").select("id").eq("id", personId).eq("user_id", userId).maybeSingle(),
    supabase.from(target.table).select("id").eq("id", target.id).eq("user_id", userId).maybeSingle(),
  ]);
  if (person.error || other.error) return "failed";
  return person.data && other.data ? "ok" : "missing";
}

/* -------------------------------------------------------------------------- */
/* Person <-> Context                                                          */
/* -------------------------------------------------------------------------- */

export async function associatePersonContext(
  _previous: EntityEditState,
  formData: FormData,
): Promise<EntityEditState> {
  const locale = resolveLocale(formData.get("locale"));

  const fields = submittedRelationFields(formData);
  const parsed = personContextSchema.safeParse(fields);
  if (!parsed.success) return failedRelation(locale, "invalidInput", fields);
  const { personId, contextId } = parsed.data;

  const { supabase, user } = await requireUser(parsed.data.locale);

  const ownership = await ownsBoth(supabase, user.id, personId, { table: "contexts", id: contextId });
  if (ownership === "failed") return failedRelation(locale, "saveFailed");
  if (ownership === "missing") return failedRelation(locale, "foreignTarget", fields);

  const { data: created, error } = await supabase
    .from("person_contexts")
    .insert({ user_id: user.id, person_id: personId, context_id: contextId, confidence: 1 })
    .select("id")
    .maybeSingle();

  // The partial unique index refuses a second live pair. Reported as "already
  // there" rather than as a failure, because it is not one — the owner asked
  // for a state the data is already in.
  if (error) {
    return failedRelation(locale, isDuplicateAssociation(error) ? "duplicateRelation" : "saveFailed", fields);
  }
  if (!created) return failedRelation(locale, "saveFailed", fields);

  const audit = await supabase.from("audit_logs").insert({
    user_id: user.id,
    action_type: "associate_person_context",
    entity_type: "person_context",
    entity_id: created.id,
    actor: "user",
    after_state: { person_id: personId, context_id: contextId },
    reason: "Owner associated a person with a context",
  });
  if (audit.error) console.error("Person-context audit failed", audit.error.message);

  revalidateBoth(parsed.data.locale, personId, `contexts/${contextId}`);
  return { status: "success", message: getEntityCopy(locale).associationAdded };
}

export async function endPersonContext(
  _previous: EntityEditState,
  formData: FormData,
): Promise<EntityEditState> {
  const locale = resolveLocale(formData.get("locale"));

  const fields = submittedRelationFields(formData);
  const parsed = personContextEndSchema.safeParse(fields);
  if (!parsed.success) return failedRelation(locale, "invalidInput", fields);
  const { personId, contextId } = parsed.data;

  const { supabase, user } = await requireUser(parsed.data.locale);

  // `.is("valid_until", null)` is load-bearing: without it a second click would
  // overwrite the first end date with a later one and quietly move when the
  // association stopped.
  const { data: ended, error } = await supabase
    .from("person_contexts")
    .update({ valid_until: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("person_id", personId)
    .eq("context_id", contextId)
    .is("valid_until", null)
    .select("id")
    .maybeSingle();

  if (error) return failedRelation(locale, "saveFailed");
  if (!ended) return failedRelation(locale, "notFound");

  const audit = await supabase.from("audit_logs").insert({
    user_id: user.id,
    action_type: "end_person_context",
    entity_type: "person_context",
    entity_id: ended.id,
    actor: "user",
    before_state: { valid_until: null },
    after_state: { person_id: personId, context_id: contextId, ended: true },
    reason: "Owner ended a person-context association",
  });
  if (audit.error) console.error("Person-context end audit failed", audit.error.message);

  revalidateBoth(parsed.data.locale, personId, `contexts/${contextId}`);
  return { status: "success", message: getEntityCopy(locale).associationEnded };
}

/* -------------------------------------------------------------------------- */
/* Person <-> Project                                                          */
/* -------------------------------------------------------------------------- */

export async function associatePersonProject(
  _previous: EntityEditState,
  formData: FormData,
): Promise<EntityEditState> {
  const locale = resolveLocale(formData.get("locale"));

  const fields = submittedRelationFields(formData);
  const parsed = personProjectSchema.safeParse(fields);
  if (!parsed.success) return failedRelation(locale, "invalidInput", fields);
  const { personId, projectId, role, origin } = parsed.data;

  const { supabase, user } = await requireUser(parsed.data.locale);

  const ownership = await ownsBoth(supabase, user.id, personId, { table: "projects", id: projectId });
  if (ownership === "failed") return failedRelation(locale, "saveFailed");
  if (ownership === "missing") return failedRelation(locale, "foreignTarget", fields);

  const { data: created, error } = await supabase
    .from("person_projects")
    .insert({ user_id: user.id, person_id: personId, project_id: projectId, role, confidence: 1 })
    .select("id")
    .maybeSingle();

  if (error) {
    return failedRelation(locale, isDuplicateAssociation(error) ? "duplicateRelation" : "saveFailed", fields);
  }
  if (!created) return failedRelation(locale, "saveFailed", fields);

  const audit = await supabase.from("audit_logs").insert({
    user_id: user.id,
    action_type: "associate_person_project",
    entity_type: "person_project",
    entity_id: created.id,
    actor: "user",
    // `role` is the owner's own words about their own work (EGC-ASSOC-004) and
    // is not copied into the ledger. That a role was set is recorded; what it
    // said is not.
    after_state: { person_id: personId, project_id: projectId, has_role: role !== null },
    reason: `Owner associated a person with a project from the ${origin} page`,
  });
  if (audit.error) console.error("Person-project audit failed", audit.error.message);

  revalidateBoth(parsed.data.locale, personId, `projects/${projectId}`);
  return { status: "success", message: getEntityCopy(locale).associationAdded };
}

/**
 * Change the role on a live association, in place.
 *
 * A role is a correction, not a new association: ending and re-adding to fix
 * "revisora" to "revisora do contrato" would write a history saying somebody
 * left a project and rejoined it the same second.
 */
export async function updatePersonProjectRole(
  _previous: EntityEditState,
  formData: FormData,
): Promise<EntityEditState> {
  const locale = resolveLocale(formData.get("locale"));

  const fields = submittedRelationFields(formData);
  const parsed = personProjectSchema.safeParse(fields);
  if (!parsed.success) return failedRelation(locale, "invalidInput", fields);
  const { personId, projectId, role, origin } = parsed.data;

  const { supabase, user } = await requireUser(parsed.data.locale);

  const before = await supabase
    .from("person_projects")
    .select("id,role")
    .eq("user_id", user.id)
    .eq("person_id", personId)
    .eq("project_id", projectId)
    .is("valid_until", null)
    .maybeSingle();
  if (before.error) return failedRelation(locale, "saveFailed");
  if (!before.data) return failedRelation(locale, "notFound");

  const { data: after, error } = await supabase
    .from("person_projects")
    .update({ role })
    .eq("id", before.data.id)
    .eq("user_id", user.id)
    .is("valid_until", null)
    .select("id,role")
    .maybeSingle();

  if (error) return failedRelation(locale, "saveFailed", fields);
  if (!after) return failedRelation(locale, "notFound");

  const audit = await supabase.from("audit_logs").insert({
    user_id: user.id,
    action_type: "update_person_project_role",
    entity_type: "person_project",
    entity_id: after.id,
    actor: "user",
    before_state: { has_role: before.data.role !== null },
    after_state: { has_role: after.role !== null },
    reason: `Owner changed a project role from the ${origin} page`,
  });
  if (audit.error) console.error("Person-project role audit failed", audit.error.message);

  revalidateBoth(parsed.data.locale, personId, `projects/${projectId}`);
  return { status: "success", message: getEntityCopy(locale).saved };
}

export async function endPersonProject(
  _previous: EntityEditState,
  formData: FormData,
): Promise<EntityEditState> {
  const locale = resolveLocale(formData.get("locale"));

  const fields = submittedRelationFields(formData);
  const parsed = personProjectEndSchema.safeParse(fields);
  if (!parsed.success) return failedRelation(locale, "invalidInput", fields);
  const { personId, projectId } = parsed.data;

  const { supabase, user } = await requireUser(parsed.data.locale);

  const { data: ended, error } = await supabase
    .from("person_projects")
    .update({ valid_until: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("person_id", personId)
    .eq("project_id", projectId)
    .is("valid_until", null)
    .select("id")
    .maybeSingle();

  if (error) return failedRelation(locale, "saveFailed");
  if (!ended) return failedRelation(locale, "notFound");

  const audit = await supabase.from("audit_logs").insert({
    user_id: user.id,
    action_type: "end_person_project",
    entity_type: "person_project",
    entity_id: ended.id,
    actor: "user",
    before_state: { valid_until: null },
    after_state: { person_id: personId, project_id: projectId, ended: true },
    reason: "Owner ended a person-project association",
  });
  if (audit.error) console.error("Person-project end audit failed", audit.error.message);

  revalidateBoth(parsed.data.locale, personId, `projects/${projectId}`);
  return { status: "success", message: getEntityCopy(locale).associationEnded };
}
