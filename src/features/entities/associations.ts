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
 * the same shape to the same action, and `origin` reaches exactly one
 * expression: the audit `reason`, which records which page the owner was on.
 * **It selects no table, no predicate and no payload**, and revalidation does
 * not depend on it either — both pages are refreshed either way, because the
 * row they both render is the same row. `egc-invariants.test.ts` asserts the
 * single writer in both directions, and `associations.test.ts` asserts the two
 * origins produce byte-identical payloads.
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
  taskPersonRoleSchema,
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

/* -------------------------------------------------------------------------- */
/* Person <-> Task                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `2P-PERSON-001` — a person's role **on one task**, edited in the context of
 * that task's own row on the person page.
 *
 * ## Three ways this table differs from `person_projects`, all load-bearing
 *
 * 1. **The role is a closed vocabulary**, not the owner's words:
 *    `task_people_role_check` admits `requester`, `involved`, `assignee` and
 *    `waiting_on`, and `taskPersonRoleSchema` mirrors it. A free-text field here
 *    would produce a `23514` the owner could not read.
 * 2. **The role is part of the primary key** — `(task_id, person_id, role)` — so
 *    the same person may hold two roles on one task, and "the role of this
 *    person on this task" is not a well-formed question. `previousRole`
 *    identifies which row is being changed; without it the statement would have
 *    to guess, and guessing would silently rewrite the wrong one.
 * 3. **Moving onto a role the person already holds is a collision**, not an
 *    update. Postgres reports the primary-key violation as `23505`, and the
 *    honest answer is that they already have it — not that the save failed.
 *
 * ## Why it is an UPDATE rather than a delete-then-insert
 *
 * Updating a primary-key column is ordinary SQL, and it keeps the change to one
 * statement whose failure leaves the old row exactly where it was. A
 * delete-then-insert has a window in which the person holds no role on the task
 * at all, and a second-statement failure would leave them holding none — a
 * silent unlink dressed as a role edit.
 *
 * The task itself is untouched: this writes no title, status or due date, and
 * `2P-PERSON-001`'s correction is explicit that a role lives on the relation
 * rather than being copied onto either endpoint.
 */
export async function updateTaskPersonRole(
  _previous: EntityEditState,
  formData: FormData,
): Promise<EntityEditState> {
  const locale = resolveLocale(formData.get("locale"));

  const fields = submittedRelationFields(formData);
  const parsed = taskPersonRoleSchema.safeParse(fields);
  if (!parsed.success) return failedRelation(locale, "invalidInput", fields);
  const { personId, taskId, previousRole, role } = parsed.data;

  const { supabase, user } = await requireUser(parsed.data.locale);

  // Nothing to do, and saying so beats writing a row that changes nothing and
  // an audit entry claiming a change that did not happen.
  if (previousRole === role) {
    return { status: "success", message: getEntityCopy(locale).roleUnchanged };
  }

  const before = await supabase
    .from("task_people")
    .select("task_id,person_id,role")
    .eq("user_id", user.id)
    .eq("task_id", taskId)
    .eq("person_id", personId)
    .eq("role", previousRole)
    .maybeSingle();
  if (before.error) return failedRelation(locale, "saveFailed");
  if (!before.data) return failedRelation(locale, "notFound");

  const { data: after, error } = await supabase
    .from("task_people")
    .update({ role })
    .eq("user_id", user.id)
    .eq("task_id", taskId)
    .eq("person_id", personId)
    .eq("role", previousRole)
    .select("task_id,person_id,role")
    .maybeSingle();

  if (error) {
    return failedRelation(locale, isDuplicateAssociation(error) ? "roleAlreadyHeld" : "saveFailed", fields);
  }
  if (!after) return failedRelation(locale, "notFound");

  /*
   * The role tokens themselves are in the audit row, and that is safe: they are
   * a four-value closed vocabulary fixed by a check constraint, not content.
   * The task's title is NOT — it is governed by the sensitivity contract the
   * person page derives from the task's source entry, and an audit reason
   * carrying it would put governed text into a table the surface never masks.
   */
  const audit = await supabase.from("audit_logs").insert({
    user_id: user.id,
    action_type: "update_task_person_role",
    entity_type: "task_person",
    entity_id: taskId,
    actor: "user",
    before_state: { person_id: personId, role: before.data.role },
    after_state: { person_id: personId, role: after.role },
    reason: "Owner changed a task role from the person page",
  });
  if (audit.error) console.error("Task-person role audit failed", audit.error.message);

  // The route PATTERN: both surfaces sit under `[locale]`, where a resolved
  // path invalidates nothing.
  revalidatePath(`/[locale]/app/people/${personId}`, "page");
  // The task's own surface is `/app/work/[taskId]`; `/app/tasks` is the list.
  revalidatePath(`/[locale]/app/work/${taskId}`, "page");
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
  const { personId, projectId, origin } = parsed.data;

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
    // `origin` is required by the schema, so it is read here rather than
    // ignored: a field a strict schema refuses the form for, and which then
    // affects nothing, is a refusal the owner cannot act on.
    reason: `Owner ended a person-project association from the ${origin} page`,
  });
  if (audit.error) console.error("Person-project end audit failed", audit.error.message);

  revalidateBoth(parsed.data.locale, personId, `projects/${projectId}`);
  return { status: "success", message: getEntityCopy(locale).associationEnded };
}
