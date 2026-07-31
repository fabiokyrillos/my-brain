"use server";

/**
 * The only writer `public.person_relationships` has ever had (EGC-REL).
 *
 * The table was created by `202607160009:6-12` with forced RLS, four own-row
 * policies and full `authenticated` CRUD. **Nothing has ever written it** — not
 * the interpretation RPC, not a trigger, not the application. The Person page
 * has read it since Slice F2 and rendered whatever it found, which was always
 * nothing. This module is the other half.
 *
 * ## One writer, and why that is asserted rather than intended
 *
 * `EGC-ASSOC-003` requires one contract per relationship table, and
 * `write-path-inventory.test.ts` asserts it in both directions: this module
 * writes the table, and no other module does. Two writers is not a style
 * problem — it is how a soft-end contract acquires a hard delete on the surface
 * that forgot about it.
 *
 * ## Ending is not deleting (EGC-REL-007, EGC-DEC-2)
 *
 * `endOwnerRelationship` sets `valid_until = now()`. There is no delete in this
 * module and there is no delete schema. Every reader already filters
 * `.is("valid_until", null)`, so an ended relationship leaves the page while its
 * row stays in the database — which is what makes "we were married until 2019" a
 * fact the product can still hold.
 *
 * ## What the database does not enforce here, stated plainly
 *
 * `person_contexts` and `person_projects` each carry a **partial unique index**
 * on the live pair (`202607160011:1-2`). `person_relationships` carries **no
 * unique index at all** — only the plain `(user_id, person_id, valid_until)`
 * index from `202607160009:12`. The PRD's EGC-REL-007 describes the partial
 * index as freeing the pair for a later re-add; that is true of the two
 * association tables and **not** of this one.
 *
 * The consequence is load-bearing: nothing at the database stops two live rows
 * of the same type for the same person, so the duplicate refusal below is an
 * *application* check with no `23505` behind it. It is written as a read before
 * the insert, and it is honest about what it is — a check that races, not a
 * constraint. Losing that race produces a second live row, which the surface
 * renders and the owner can end. That is a better outcome than adding a
 * migration to an initiative whose zero-migration invariant is the point.
 */

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import { resolveLocale } from "@/lib/preferences";

import { getEntityCopy } from "./copy";
import type { EntityEditState } from "./edit-state";
import { failedRelation, submittedRelationFields } from "./relation-state";
import {
  relationshipCreateSchema,
  relationshipEndSchema,
  relationshipUpdateSchema,
} from "./schema";

/** Both Person paths a relationship write invalidates. */
function revalidatePerson(locale: "pt-BR" | "en", personId: string) {
  revalidatePath(`/${locale}/app/people/${personId}`);
  revalidatePath(`/${locale}/app/people`);
}

export async function createOwnerRelationship(
  _previous: EntityEditState,
  formData: FormData,
): Promise<EntityEditState> {
  const locale = resolveLocale(formData.get("locale"));

  const fields = submittedRelationFields(formData);
  const parsed = relationshipCreateSchema.safeParse(fields);
  if (!parsed.success) return failedRelation(locale, "invalidInput", fields);
  const { personId, relationshipType, description } = parsed.data;

  const { supabase, user } = await requireUser(parsed.data.locale);

  // EGC-ASSOC-007: the target is proved to be the caller's own before anything
  // is written, so a foreign id is a localized refusal rather than a `23503`
  // the owner cannot read. The composite FK would refuse it too — this check
  // exists for the message, not for the safety.
  const person = await supabase
    .from("people")
    .select("id")
    .eq("id", personId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (person.error) return failedRelation(locale, "saveFailed");
  if (!person.data) return failedRelation(locale, "notFound");

  // The duplicate check with no constraint behind it — see the header. A live
  // row of the same type for the same person is refused here and nowhere else.
  const existing = await supabase
    .from("person_relationships")
    .select("id")
    .eq("user_id", user.id)
    .eq("person_id", personId)
    .eq("relationship_type", relationshipType)
    .is("valid_until", null)
    .maybeSingle();
  if (existing.error) return failedRelation(locale, "saveFailed");
  if (existing.data) return failedRelation(locale, "duplicateRelation", fields);

  const { data: created, error } = await supabase
    .from("person_relationships")
    .insert({
      user_id: user.id,
      person_id: personId,
      // EGC-REL-001: null is not missing data. It means "related to the owner",
      // which is the only kind of relationship this slice authors.
      related_person_id: null,
      relationship_type: relationshipType,
      description,
      // EGC-REL-010. The column already defaults to 1; writing it explicitly is
      // what makes the intent legible at the call site — a user-entered fact is
      // not a scored inference, and the value is never surfaced.
      confidence: 1,
    })
    .select("id,relationship_type,description")
    .maybeSingle();

  if (error) return failedRelation(locale, "saveFailed", fields);
  if (!created) return failedRelation(locale, "saveFailed", fields);

  const audit = await supabase.from("audit_logs").insert({
    user_id: user.id,
    action_type: "create_person_relationship",
    entity_type: "person_relationship",
    entity_id: created.id,
    actor: "user",
    // The person the relationship is about, so the row can be read back without
    // a join. `description` is user content and is deliberately not copied.
    after_state: { person_id: personId, relationship_type: created.relationship_type },
    reason: "Owner recorded a relationship to themselves",
  });
  if (audit.error) console.error("Relationship create audit failed", audit.error.message);

  revalidatePerson(parsed.data.locale, personId);
  return { status: "success", message: getEntityCopy(locale).relationshipAdded };
}

/**
 * Editing a live relationship, in place (EGC-REL-008).
 *
 * **Changing the type is an edit, not an end-and-recreate.** Getting a
 * relationship's category wrong is a correction; treating it as the end of one
 * relationship and the start of another would write a history that says
 * something happened between two people when nothing did.
 */
export async function updateOwnerRelationship(
  _previous: EntityEditState,
  formData: FormData,
): Promise<EntityEditState> {
  const locale = resolveLocale(formData.get("locale"));

  const fields = submittedRelationFields(formData);
  const parsed = relationshipUpdateSchema.safeParse(fields);
  if (!parsed.success) return failedRelation(locale, "invalidInput", fields);
  const { relationshipId, personId, relationshipType, description } = parsed.data;

  const { supabase, user } = await requireUser(parsed.data.locale);

  const before = await supabase
    .from("person_relationships")
    .select("relationship_type,description")
    .eq("id", relationshipId)
    .eq("user_id", user.id)
    .eq("person_id", personId)
    .is("valid_until", null)
    .maybeSingle();
  if (before.error) return failedRelation(locale, "saveFailed");
  if (!before.data) return failedRelation(locale, "notFound");

  const { data: after, error } = await supabase
    .from("person_relationships")
    .update({ relationship_type: relationshipType, description })
    .eq("id", relationshipId)
    .eq("user_id", user.id)
    .is("valid_until", null)
    .select("relationship_type,description")
    .maybeSingle();

  if (error) return failedRelation(locale, "saveFailed", fields);
  if (!after) return failedRelation(locale, "notFound");

  const audit = await supabase.from("audit_logs").insert({
    user_id: user.id,
    action_type: "update_person_relationship",
    entity_type: "person_relationship",
    entity_id: relationshipId,
    actor: "user",
    // Only the type, in both states. `description` is the owner's own sentence
    // about another person and has no business being copied into a ledger row
    // to record that it changed.
    before_state: { relationship_type: before.data.relationship_type },
    after_state: { relationship_type: after.relationship_type },
    reason: "Owner corrected a relationship",
  });
  if (audit.error) console.error("Relationship edit audit failed", audit.error.message);

  revalidatePerson(parsed.data.locale, personId);
  return { status: "success", message: getEntityCopy(locale).saved };
}

/**
 * Ending a relationship (EGC-REL-007). **The row survives.**
 *
 * `.is("valid_until", null)` on the update is not decoration: without it, a
 * second click would overwrite the first `valid_until` with a later one and
 * quietly move the date the relationship ended.
 */
export async function endOwnerRelationship(
  _previous: EntityEditState,
  formData: FormData,
): Promise<EntityEditState> {
  const locale = resolveLocale(formData.get("locale"));

  const fields = submittedRelationFields(formData);
  const parsed = relationshipEndSchema.safeParse(fields);
  if (!parsed.success) return failedRelation(locale, "invalidInput", fields);
  const { relationshipId, personId } = parsed.data;

  const { supabase, user } = await requireUser(parsed.data.locale);

  const { data: ended, error } = await supabase
    .from("person_relationships")
    .update({ valid_until: new Date().toISOString() })
    .eq("id", relationshipId)
    .eq("user_id", user.id)
    .eq("person_id", personId)
    .is("valid_until", null)
    .select("id,relationship_type")
    .maybeSingle();

  if (error) return failedRelation(locale, "saveFailed");
  if (!ended) return failedRelation(locale, "notFound");

  const audit = await supabase.from("audit_logs").insert({
    user_id: user.id,
    action_type: "end_person_relationship",
    entity_type: "person_relationship",
    entity_id: relationshipId,
    actor: "user",
    before_state: { valid_until: null },
    after_state: { relationship_type: ended.relationship_type, ended: true },
    reason: "Owner ended a relationship",
  });
  if (audit.error) console.error("Relationship end audit failed", audit.error.message);

  revalidatePerson(parsed.data.locale, personId);
  return { status: "success", message: getEntityCopy(locale).relationshipEnded };
}
