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

/**
 * Invalidate the route, and let the client ask for it again.
 *
 * ## What was measured, in a real browser against the deployed database
 *
 * `revalidatePath` alone committed the write and **did not refresh the page**:
 * the category's reason still read `suggest_only_by_owner`, the history list
 * stayed empty, and the undo control never appeared until the owner reloaded by
 * hand. A `redirect` back to the same URL did not fix it either — Next treats a
 * navigation to the current route as a no-op, so the router cache kept serving
 * the entry it already had.
 *
 * That is the same practical failure this repository already recorded from the
 * opposite direction — *"revalidatePath destroys the undo control"* — arriving
 * here as *the undo control never appears*. For `2P-AUTONOMY-009` the undo has
 * to be reachable at the moment the owner changes the policy, which is exactly
 * when they might want it back.
 *
 * ## The two halves, and why neither replaces the other
 *
 * This one invalidates the server's cache, so the next render is fresh. The
 * client half — `router.refresh()` in `automation-policy-form.tsx` and
 * `automation-undo-button.tsx` — makes the next render *happen*. It is the
 * pattern `features/operations/undo-affordance.tsx` already uses after a task
 * command.
 */
function invalidateSettings(): void {
  /*
    THE ROUTE PATTERN, NOT THE RESOLVED PATH, AND THE DIFFERENCE WAS MEASURED.

    With `revalidatePath(`/${locale}/app/settings`)` — the shape every other
    action in this repository uses — the client's refresh request really was
    sent (the network shows `POST` then a fresh `GET` with `_rsc`) and the
    server answered it with the OLD render. `/app/settings` lives under a
    dynamic `[locale]` segment, and Next matches those by ROUTE PATTERN plus a
    type rather than by resolved URL.

    It takes no locale for the same reason: the pattern covers every locale, so
    there is nothing here for a request-supplied value to influence.
  */
  revalidatePath("/[locale]/app/settings", "page");
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
  /*
    A failed save RAISES rather than returning quietly, and for this control
    specifically.

    A `<form action>` re-renders the server tree when the action resolves, so a
    swallowed error would put the stored value back in the select with no
    explanation — the owner would believe they changed who may write without
    asking them, and nothing would have changed. That is the worst failure mode
    an authority control has, and it is worse than an error the user can see.

    `2P-SETTINGS-007` — a failed save preserves input and names its section —
    belongs to slice 2P.5, which introduces the settings sections this will live
    in. Until then the honest behaviour is to refuse loudly rather than to
    report a success that did not happen.
  */
  if (error) {
    throw new Error(`set_automation_category_policy failed: ${error.code ?? "unknown"}`);
  }

  invalidateSettings();
}

export async function undoAutomationCategoryPolicy(formData: FormData): Promise<void> {
  const locale = resolveLocale(formData.get("locale"));
  const undoId = undoIdSchema.safeParse(formData.get("undoId"));
  if (!undoId.success) return;

  const { supabase } = await requireUser(locale);
  const { error } = await supabase.rpc("undo_operation", { p_undo_id: undoId.data });
  /*
    Same rule, and the same reason. `55P03` here means the category moved since
    the operation was recorded — the handler refuses rather than overwriting a
    newer decision with an older one — and reporting that as a successful undo
    would tell the owner their policy had been restored when it had not.
  */
  if (error) {
    throw new Error(`undo_operation failed: ${error.code ?? "unknown"}`);
  }

  invalidateSettings();
}
