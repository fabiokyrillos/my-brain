"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { isLocale, type Locale } from "@/lib/preferences";

import { AUTOMATION_CATEGORIES, AUTOMATION_POLICY_STATES } from "./automation-policy";

/**
 * The owner's two automation controls — set a category's policy, and take that
 * change back.
 *
 * ## Neither of these authorizes a write
 *
 * Setting a category to `automatic_when_eligible` ARMS it. Whether the agent
 * may then act is re-measured by `private.automation_category_decision` on
 * every read, against evidence this action cannot touch. That separation is
 * the point: the switch belongs to the owner and the evidence belongs to the
 * database, and neither is sufficient alone.
 *
 * ## Why the operation key is minted here rather than accepted from the form
 *
 * A key that arrived in the payload is a key the client chooses, and a client
 * that reuses one turns the idempotency guard into a way to silently discard a
 * real second change. It is minted per submission, and the database dedupes on
 * the real unique index over `(user_id, operation_key)`.
 *
 * ## Why the locale arrives in the form
 *
 * It is the shape `updateProfile`, the BYOK actions and the onboarding pair
 * already use, and it is narrowed rather than trusted: a revalidation path
 * built from an unchecked string is a request-supplied path.
 */

const categorySchema = z.enum(AUTOMATION_CATEGORIES);
const stateSchema = z.enum(AUTOMATION_POLICY_STATES);
const undoIdSchema = z.string().uuid();

function resolveLocale(raw: FormDataEntryValue | null): Locale {
  return typeof raw === "string" && isLocale(raw) ? raw : "pt-BR";
}

export async function setAutomationCategoryPolicy(formData: FormData): Promise<void> {
  const locale = resolveLocale(formData.get("locale"));
  const category = categorySchema.safeParse(formData.get("category"));
  const state = stateSchema.safeParse(formData.get("automationCategoryState"));

  /*
    A malformed submission changes nothing and says nothing, deliberately.
    Neither field is user-typed prose — both are closed vocabularies rendered by
    this product — so an unparseable value is a tampered or stale payload rather
    than a mistake to explain. There is nothing here for the "a failed save must
    preserve what was typed" rule to preserve.
  */
  if (!category.success || !state.success) return;

  const { supabase } = await requireUser(locale);
  const { error } = await supabase.rpc("set_automation_category_policy", {
    p_category: category.data,
    p_state: state.data,
    p_operation_key: randomUUID(),
  });
  if (error) return;

  revalidatePath(`/${locale}/app/settings`);
}

export async function undoAutomationCategoryPolicy(formData: FormData): Promise<void> {
  const locale = resolveLocale(formData.get("locale"));
  const undoId = undoIdSchema.safeParse(formData.get("undoId"));
  if (!undoId.success) return;

  const { supabase } = await requireUser(locale);
  const { error } = await supabase.rpc("undo_operation", { p_undo_id: undoId.data });
  if (error) return;

  revalidatePath(`/${locale}/app/settings`);
}
