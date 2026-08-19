"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { SETTINGS_REVALIDATION_PATHS } from "@/features/settings/sections";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale, type Locale } from "@/lib/preferences";

import { getAutomationCopy } from "./automation-copy";
import { AUTOMATION_CATEGORIES, AUTOMATION_POLICY_STATES, isAutomationCategory } from "./automation-policy";
import type { AutomationActionState } from "./automation-state";

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
 *
 * ## Slice 2P.5: these return instead of throwing
 *
 * See `automation-state.ts` for the whole reasoning. In short, slice 2P.4 made
 * them throw because a *swallowed* error is worse than a loud one, and named
 * `2P-SETTINGS-007` as the successor that would make a *rendered* error
 * possible. This is that successor: a thrown error replaces the page with the
 * boundary and destroys the section, the history and any other section's
 * unsaved input, while a returned state keeps all of it and says something
 * specific.
 */

const categorySchema = z.enum(AUTOMATION_CATEGORIES);
const stateSchema = z.enum(AUTOMATION_POLICY_STATES);
const undoIdSchema = z.string().uuid();

function resolveLocale(raw: FormDataEntryValue | null): Locale {
  return typeof raw === "string" && isLocale(raw) ? raw : "pt-BR";
}

/**
 * Invalidate both settings routes, and let the client ask for them again.
 *
 * ## What was measured, in a real browser against the deployed database
 *
 * `revalidatePath` with the **resolved** path committed the write and **did not
 * refresh the page**: the category's reason still read `suggest_only_by_owner`,
 * the history list stayed empty, and the undo control never appeared until the
 * owner reloaded by hand. A `redirect` back to the same URL did not fix it
 * either — Next treats a navigation to the current route as a no-op, so the
 * router cache kept serving the entry it already had.
 *
 * The route **pattern** plus `'page'` is the form a dynamic segment needs, and
 * the Next documentation says so outright: *"If `path` contains a dynamic
 * segment … this parameter is required."*
 *
 * ## Two patterns since slice 2P.5
 *
 * The section this control lives in moved from `/app/settings` to
 * `/app/settings/assistant`, which is a **second** dynamic segment. Both come
 * from the routing contract rather than being written here, so a section added
 * to the route tree cannot leave this action invalidating a path that no longer
 * matches it.
 */
function invalidateSettings(): void {
  for (const path of SETTINGS_REVALIDATION_PATHS) revalidatePath(path, "page");
}

export async function setAutomationCategoryPolicy(
  _state: AutomationActionState,
  formData: FormData,
): Promise<AutomationActionState> {
  const locale = resolveLocale(formData.get("locale"));
  const copy = getAutomationCopy(locale);
  const category = categorySchema.safeParse(formData.get("category"));
  const state = stateSchema.safeParse(formData.get("automationCategoryState"));

  /*
    A malformed submission changes nothing and says so.

    Neither field is user-typed prose — both are closed vocabularies rendered by
    this product — so an unparseable value is a tampered or stale payload rather
    than a mistake to explain, and there is nothing here for the "a failed save
    must preserve what was typed" rule to preserve. It still reports rather than
    returning silently: slice 2P.4 measured that a silent no-op and a successful
    save look identical on this surface, because the `<select>` is uncontrolled
    and holds the owner's own click either way.
  */
  if (!category.success || !state.success) {
    const raw = formData.get("category");
    return {
      status: "error",
      message: copy.saveFailed,
      ...(isAutomationCategory(raw) ? { category: raw } : {}),
    };
  }

  const { supabase } = await requireUser(locale);
  const { error } = await supabase.rpc("set_automation_category_policy", {
    p_category: category.data,
    p_state: state.data,
    p_operation_key: randomUUID(),
  });
  if (error) {
    /*
      No revalidation on a failure. A revalidation would refresh the page out
      from under the failed save and discard the message with it — the shape
      slice 2N.3 found in the undo control and `updateProfile` already avoids.
    */
    console.error("Automation policy save failed", error.code);
    return { status: "error", category: category.data, message: copy.saveFailed };
  }

  invalidateSettings();
  return { status: "success", category: category.data, message: copy.saveSucceeded };
}

export async function undoAutomationCategoryPolicy(
  _state: AutomationActionState,
  formData: FormData,
): Promise<AutomationActionState> {
  const locale = resolveLocale(formData.get("locale"));
  const copy = getAutomationCopy(locale);
  const undoId = undoIdSchema.safeParse(formData.get("undoId"));
  /*
    The category rides along purely so the failure can be rendered on the right
    row. It is NOT trusted for anything else: `public.undo_operation` re-reads
    the recorded operation and decides for itself which category it touches, so
    a tampered value here can misplace a message and nothing more.
  */
  const raw = formData.get("category");
  const category = isAutomationCategory(raw) ? raw : undefined;

  if (!undoId.success) {
    return { status: "error", message: copy.undoFailed, ...(category ? { category } : {}) };
  }

  const { supabase } = await requireUser(locale);
  const { error } = await supabase.rpc("undo_operation", { p_undo_id: undoId.data });
  if (error) {
    /*
      `55P03` is not a generic failure and must not read as one: it means the
      category moved since the operation was recorded, and the handler refused
      rather than overwriting a newer decision with an older one. Reporting that
      as "could not undo, try again" would invite exactly the retry that will
      keep being refused.
    */
    console.error("Automation policy undo failed", error.code);
    return {
      status: "error",
      message: error.code === "55P03" ? copy.undoStale : copy.undoFailed,
      ...(category ? { category } : {}),
    };
  }

  invalidateSettings();
  return { status: "success", message: copy.undoSucceeded, ...(category ? { category } : {}) };
}

/*
  `idleAutomationState` is deliberately NOT re-exported from here.

  A `"use server"` module may export only async functions — a plain const is a
  build error `tsc --noEmit` cannot see, which this repository has already paid
  for once. Consumers import it from `automation-state.ts`, where it lives.
*/
