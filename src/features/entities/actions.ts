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
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { resolveLocale, type Locale } from "@/lib/preferences";

import { getEntityCopy } from "./copy";
import type { EntityEditState, EntityEditSubmission } from "./edit-state";
import {
  contextCreateSchema,
  contextUpdateSchema,
  organizationCreateSchema,
  organizationUpdateSchema,
  personOrganizationSchema,
  personUpdateSchema,
  projectUpdateSchema,
} from "./schema";

/** The routing id `createOrganizationForSubject` assigns to, held to the same bar as every other. */
const subjectIdSchema = z.string().uuid();

/**
 * Invalidate the person surfaces (slice 2P.6).
 *
 * ## The route patterns, whole
 *
 * Under a `[locale]` dynamic segment a literal path invalidates nothing, which
 * slice 2P.4 measured against the deployed app. A *hybrid* —
 * `/[locale]/app/people/<uuid>` — is worse than either, because it looks
 * targeted and matches no route file at all: Next tags cache entries by route
 * structure, and that string is neither the structure nor a resolved path. The
 * first draft of `linkPersonOrganization` shipped one.
 *
 * ## Synchronous, and that was established by execution
 *
 * The call was briefly moved into `after()` to keep it off the response path,
 * on the reasoning that both routes are dynamic (`ƒ` in the build output) and
 * therefore have no full-route cache to rebuild. The authenticated journey
 * refuted it immediately: the company saved, the dialog closed, and the page
 * went on rendering *Sem empresa*. **A Server Action's response carries a fresh
 * render only when the action revalidated something synchronously**, so moving
 * it after the response is indistinguishable from not calling it at all — the
 * write lands and the owner is looking at the old value.
 *
 * It stays where it is for that reason, and the cost is real: invalidating the
 * pattern makes the response re-render a page that issues eighteen queries in
 * three rounds. That is a property of the person workspace, not of this write.
 */
function revalidatePeople(): void {
  revalidatePath("/[locale]/app/people/[personId]", "page");
  revalidatePath("/[locale]/app/people", "page");
}

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
  key:
    | "invalidInput"
    | "sessionExpired"
    | "duplicateName"
    | "notFound"
    | "saveFailed"
    | "createFailed"
    | "createdButNotLinked",
  submitted: EntityEditSubmission | null = null,
): EntityEditState {
  return {
    status: "error",
    message: getEntityCopy(locale)[key],
    submitted,
    // Only the two a surface branches on carry a token; the rest stay
    // message-only, because nothing renders differently for them. See
    // `edit-state.ts` on why this is not a string comparison at the call site.
    code: key === "createdButNotLinked" || key === "duplicateName" ? key : null,
  };
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

  /*
   * Repaired in slice 2P.6 because this slice's own surface needs it: the
   * disclosure that submits here now carries the company as a hidden field, so a
   * save from it must leave the page showing the stored values rather than the
   * ones it was rendered with. ADR-123's amendment scopes the repair
   * deliberately — the remaining `revalidatePath` call sites across the
   * repository stay recorded debt rather than being rewritten silently.
   */
  revalidatePeople();
  return { status: "success", message: getEntityCopy(locale).saved };
}

/* -------------------------------------------------------------------------- */
/* Organizations and contexts — EGC.1                                          */
/* -------------------------------------------------------------------------- */

/**
 * The first write path organizations and contexts have ever had (EGC-ORG-003/004,
 * EGC-CTX-003/004).
 *
 * Both tables have been fully writable by `authenticated` under forced RLS since
 * `202607160003:185-197` and, until now, only the interpretation-persistence RPC
 * has written them — which is why the Company selector could report "no
 * organizations" while owning no way to make one (`EG-04`).
 *
 * These follow `updateProject`'s posture exactly rather than inventing a second
 * one: RLS plus an explicit `user_id` predicate, read-before-write so the audit
 * row can say what changed, a distinct localized sentence per failure, and an
 * `audit_logs` row that is part of the write rather than a side effect of it.
 * **No column is added and no grant is widened** — `EGC-INVARIANT-001` and
 * `EGC-INVARIANT-002` are asserted mechanically elsewhere.
 *
 * There is no delete action, per `EGC-DEC-1`. `contexts.id` is referenced with
 * `on delete cascade` from `person_contexts` and `task_contexts`, so a delete
 * control here would destroy associations silently.
 */
export async function createOrganization(
  _previous: EntityEditState,
  formData: FormData,
): Promise<EntityEditState> {
  const locale = resolveLocale(formData.get("locale"));

  const fields = submittedFields(formData);
  const parsed = organizationCreateSchema.safeParse(fields);
  if (!parsed.success) return failed(locale, "invalidInput", fields);
  const { name, description } = parsed.data;

  const { supabase, user } = await requireUser(parsed.data.locale);

  const { data: created, error } = await supabase
    .from("organizations")
    .insert({ user_id: user.id, name, description })
    .select("id,name,description")
    .maybeSingle();

  if (error) return failed(locale, isDuplicateName(error) ? "duplicateName" : "createFailed", fields);
  if (!created) return failed(locale, "createFailed", fields);

  const audit = await supabase.from("audit_logs").insert({
    user_id: user.id,
    action_type: "create_organization",
    entity_type: "organization",
    entity_id: created.id,
    actor: "user",
    after_state: { name: created.name, description: created.description },
    reason: "Owner created an organization",
  });
  if (audit.error) console.error("Organization create audit failed", audit.error.message);

  revalidatePath(`/${parsed.data.locale}/app/organizations`);
  return { status: "success", message: getEntityCopy(locale).created };
}

export async function updateOrganization(
  _previous: EntityEditState,
  formData: FormData,
): Promise<EntityEditState> {
  const locale = resolveLocale(formData.get("locale"));

  const fields = submittedFields(formData);
  const parsed = organizationUpdateSchema.safeParse(fields);
  if (!parsed.success) return failed(locale, "invalidInput", fields);
  const { organizationId, name, description } = parsed.data;

  const { supabase, user } = await requireUser(parsed.data.locale);

  const before = await supabase
    .from("organizations")
    .select("name,description")
    .eq("id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (before.error) return failed(locale, "saveFailed");
  if (!before.data) return failed(locale, "notFound");

  const { data: after, error } = await supabase
    .from("organizations")
    .update({ name, description, updated_at: new Date().toISOString() })
    .eq("id", organizationId)
    .eq("user_id", user.id)
    .select("name,description")
    .maybeSingle();

  if (error) return failed(locale, isDuplicateName(error) ? "duplicateName" : "saveFailed", fields);
  if (!after) return failed(locale, "notFound");

  const audit = await supabase.from("audit_logs").insert({
    user_id: user.id,
    action_type: "update_organization",
    entity_type: "organization",
    entity_id: organizationId,
    actor: "user",
    before_state: before.data,
    after_state: after,
    reason: "Owner edited the organization from its detail page",
  });
  if (audit.error) console.error("Organization edit audit failed", audit.error.message);

  revalidatePath(`/${parsed.data.locale}/app/organizations/${organizationId}`);
  revalidatePath(`/${parsed.data.locale}/app/organizations`);
  return { status: "success", message: getEntityCopy(locale).saved };
}

export async function createContext(
  _previous: EntityEditState,
  formData: FormData,
): Promise<EntityEditState> {
  const locale = resolveLocale(formData.get("locale"));

  const fields = submittedFields(formData);
  const parsed = contextCreateSchema.safeParse(fields);
  if (!parsed.success) return failed(locale, "invalidInput", fields);
  const { name, description, kind } = parsed.data;

  const { supabase, user } = await requireUser(parsed.data.locale);

  const { data: created, error } = await supabase
    .from("contexts")
    .insert({ user_id: user.id, name, description, kind })
    .select("id,name,description,kind")
    .maybeSingle();

  if (error) return failed(locale, isDuplicateName(error) ? "duplicateName" : "createFailed", fields);
  if (!created) return failed(locale, "createFailed", fields);

  const audit = await supabase.from("audit_logs").insert({
    user_id: user.id,
    action_type: "create_context",
    entity_type: "context",
    entity_id: created.id,
    actor: "user",
    after_state: { name: created.name, description: created.description, kind: created.kind },
    reason: "Owner created a context",
  });
  if (audit.error) console.error("Context create audit failed", audit.error.message);

  revalidatePath(`/${parsed.data.locale}/app/contexts`);
  return { status: "success", message: getEntityCopy(locale).created };
}

export async function updateContext(
  _previous: EntityEditState,
  formData: FormData,
): Promise<EntityEditState> {
  const locale = resolveLocale(formData.get("locale"));

  const fields = submittedFields(formData);
  const parsed = contextUpdateSchema.safeParse(fields);
  if (!parsed.success) return failed(locale, "invalidInput", fields);
  const { contextId, name, description, kind } = parsed.data;

  const { supabase, user } = await requireUser(parsed.data.locale);

  const before = await supabase
    .from("contexts")
    .select("name,description,kind")
    .eq("id", contextId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (before.error) return failed(locale, "saveFailed");
  if (!before.data) return failed(locale, "notFound");

  const { data: after, error } = await supabase
    .from("contexts")
    .update({ name, description, kind, updated_at: new Date().toISOString() })
    .eq("id", contextId)
    .eq("user_id", user.id)
    .select("name,description,kind")
    .maybeSingle();

  if (error) return failed(locale, isDuplicateName(error) ? "duplicateName" : "saveFailed", fields);
  if (!after) return failed(locale, "notFound");

  const audit = await supabase.from("audit_logs").insert({
    user_id: user.id,
    action_type: "update_context",
    entity_type: "context",
    entity_id: contextId,
    actor: "user",
    before_state: before.data,
    after_state: after,
    reason: "Owner edited the context from its detail page",
  });
  if (audit.error) console.error("Context edit audit failed", audit.error.message);

  revalidatePath(`/${parsed.data.locale}/app/contexts/${contextId}`);
  revalidatePath(`/${parsed.data.locale}/app/contexts`);
  return { status: "success", message: getEntityCopy(locale).saved };
}

/**
 * Create an organization and assign it to a person or project in one act
 * (EGC-ORG-005, EGC-ORG-006).
 *
 * This is `EG-04`'s remedy: a Company selector that reports emptiness while
 * owning no way to fix it is a dead end presented as a choice.
 *
 * **It is two writes, and it says so when only the first succeeds.** The
 * organization is created, then assigned. If the assignment fails, the
 * organization survives — it is visible in the list and selectable next time —
 * and the result reports `createdButNotLinked` rather than claiming an
 * assignment that did not happen. EGC-ORG-006 requires the honesty rather than
 * the atomicity: making this transactional would need an RPC, which is a new
 * privileged boundary this initiative does not take.
 */
/**
 * `2P-PERSON-001`, `2P-PERSON-002` — assign an **existing** company to a person,
 * from the person's own section.
 *
 * ## Why this is not `updatePerson`
 *
 * `updatePerson` writes name, notes and company together over a `.strict()`
 * schema, so a company control submitting to it would have to carry the stored
 * name and notes as hidden inputs — values rendered at some earlier moment. That
 * is precisely the cross-section clobber slice 2P.5 had to repair in
 * `updateProfile`: a note edited elsewhere would be reverted by a company
 * change, silently, with the audit row recording the revert as intentional.
 *
 * ## Why it is not a *new* write path either
 *
 * `createOrganizationForSubject` already writes this exact column with this
 * exact audit shape — it just gets there by creating the row first. This is its
 * other half, and the two are deliberately symmetric: same predicate, same
 * pre-read, same `update_person` audit row over `organization_id`. What the
 * slice removes is the *third* route, the nested disclosure that made the owner
 * open an edit form to reach a selector.
 *
 * Clearing the company is a first-class outcome: `optionalRelation` maps the
 * empty option to `null`, and "this person no longer works there" is a fact the
 * owner must be able to record without deleting anything.
 */
export async function linkPersonOrganization(
  _previous: EntityEditState,
  formData: FormData,
): Promise<EntityEditState> {
  const locale = resolveLocale(formData.get("locale"));

  const fields = submittedFields(formData);
  const parsed = personOrganizationSchema.safeParse(fields);
  if (!parsed.success) return failed(locale, "invalidInput", fields);
  const { personId, organizationId } = parsed.data;

  const { supabase, user } = await requireUser(parsed.data.locale);

  // Read before write, in the same ownership scope, so the audit row can say
  // which company was replaced rather than only which one is now set. An
  // assignment that overwrites is the common case here, not the exception.
  const before = await supabase
    .from("people")
    .select("organization_id")
    .eq("id", personId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (before.error) return failed(locale, "saveFailed");
  if (!before.data) return failed(locale, "notFound");

  /*
   * The foreign key is NOT re-proved here, and it does not need to be.
   * `people_organization_id_fkey` plus forced RLS on `organizations` means an
   * id belonging to someone else fails the constraint rather than linking, and
   * the selector is built from `loadOrganizationOptions`, which is owner-scoped
   * already. A membership query would be a third opinion about ownership that
   * could drift from the other two.
   */
  const { data: after, error } = await supabase
    .from("people")
    .update({ organization_id: organizationId, updated_at: new Date().toISOString() })
    .eq("id", personId)
    .eq("user_id", user.id)
    .select("organization_id")
    .maybeSingle();

  if (error) return failed(locale, "saveFailed", fields);
  if (!after) return failed(locale, "notFound");

  const audit = await supabase.from("audit_logs").insert({
    user_id: user.id,
    action_type: "update_person",
    entity_type: "person",
    entity_id: personId,
    actor: "user",
    before_state: before.data,
    after_state: after,
    reason: "Owner set the person's company from the person page",
  });
  if (audit.error) console.error("Person company audit failed", audit.error.message);

  revalidatePeople();
  return { status: "success", message: getEntityCopy(locale).companySaved };
}

export async function createOrganizationForSubject(
  _previous: EntityEditState,
  formData: FormData,
): Promise<EntityEditState> {
  const locale = resolveLocale(formData.get("locale"));

  // Both routing fields are validated **before** the organization is created,
  // and that ordering is the point: this action performs two writes, and the
  // first one is not undone if the second cannot run. A `subjectId` that is not
  // a uuid would have left a persisted organization the owner never asked for,
  // reported as a partial success, because `.eq("id", "")` fails at PostgREST
  // rather than at the schema. Every other id in this module goes through
  // `z.string().uuid()`; these two had been the exception.
  const subject = formData.get("subject");
  const subjectId = formData.get("subjectId");
  if (
    (subject !== "person" && subject !== "project") ||
    typeof subjectId !== "string" ||
    !subjectIdSchema.safeParse(subjectId).success
  ) {
    return failed(locale, "invalidInput");
  }

  // The creation half re-uses the same validated shape, minus the routing
  // fields, so a name this accepts is a name `createOrganization` accepts.
  // Both schemas are `.strict()`, so the routing keys have to be removed rather
  // than ignored — a forged control must stay a rejection.
  const fields = submittedFields(formData);
  const creationFields = Object.fromEntries(
    Object.entries(fields).filter(([key]) => key !== "subject" && key !== "subjectId"),
  );
  const parsed = organizationCreateSchema.safeParse(creationFields);
  if (!parsed.success) return failed(locale, "invalidInput", fields);

  const { supabase, user } = await requireUser(parsed.data.locale);

  const { data: created, error } = await supabase
    .from("organizations")
    .insert({ user_id: user.id, name: parsed.data.name, description: parsed.data.description })
    .select("id,name")
    .maybeSingle();
  if (error) return failed(locale, isDuplicateName(error) ? "duplicateName" : "createFailed", fields);
  if (!created) return failed(locale, "createFailed", fields);

  const createAudit = await supabase.from("audit_logs").insert({
    user_id: user.id,
    action_type: "create_organization",
    entity_type: "organization",
    entity_id: created.id,
    actor: "user",
    after_state: { name: created.name },
    reason: `Owner created an organization while editing a ${subject}`,
  });
  if (createAudit.error) console.error("Organization create audit failed", createAudit.error.message);

  const table = subject === "person" ? "people" : "projects";

  // Read before write, exactly as the other four actions do. **This assignment
  // can overwrite an existing company**: a person already linked to Acme who
  // gets a new company created here loses that link, and an audit row carrying
  // only the result could not say what was lost. That is the question the row
  // exists for, and this was the one write in the module that could not answer
  // it.
  const before = await supabase
    .from(table)
    .select("organization_id")
    .eq("id", subjectId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: linked, error: linkError } = await supabase
    .from(table)
    .update({ organization_id: created.id, updated_at: new Date().toISOString() })
    .eq("id", subjectId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  // The organization exists either way. Saying so is the whole point of this
  // branch: the user's next attempt will find it in the list.
  if (linkError || !linked) return failed(locale, "createdButNotLinked", fields);

  const linkAudit = await supabase.from("audit_logs").insert({
    user_id: user.id,
    action_type: subject === "person" ? "update_person" : "update_project",
    entity_type: subject,
    entity_id: subjectId,
    actor: "user",
    // Null when the pre-read itself failed, which is honest: the write happened
    // and the prior value is unknown, which is a different thing from there
    // having been none.
    before_state: before.data ?? null,
    after_state: { organization_id: created.id },
    reason: "Owner assigned a newly created organization",
  });
  if (linkAudit.error) console.error("Organization link audit failed", linkAudit.error.message);

  // The company dialog's create pane submits here, so this is one of the call
  // sites slice 2P.6's own surface needs. Off the response path for the reason
  // `revalidatePeople` records.
  revalidatePath("/[locale]/app/organizations", "page");
  revalidatePath(
    subject === "person" ? "/[locale]/app/people/[personId]" : "/[locale]/app/projects/[projectId]",
    "page",
  );
  return { status: "success", message: getEntityCopy(locale).createdAndLinked };
}
