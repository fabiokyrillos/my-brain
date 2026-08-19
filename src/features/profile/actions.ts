"use server";

import { revalidatePath } from "next/cache";
import { getSettingsCopy } from "@/features/settings/copy";
import { SETTINGS_REVALIDATION_PATHS } from "@/features/settings/sections";
import { assertActiveAccount } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { changedColumns, describeSaveOutcome } from "./save-outcome";
import { profileSchema } from "./schema";
import { buildSettingsPayload } from "./settings-payload";
import { resolveSettingsFormValues, storedAsSubmission } from "./settings-resolve";
import {
  isProfileFormSection,
  ownedProfileFields,
  type ProfileFormSection,
} from "./settings-sections";
import type { ProfileFormState } from "./settings-form";

function localized(locale: "pt-BR" | "en", pt: string, en: string) {
  return locale === "pt-BR" ? pt : en;
}

/**
 * `2P-SETTINGS-007`'s second half — the message names the section that failed.
 *
 * The section's own name comes from the settings copy module rather than from a
 * string here, so a section renamed once is renamed everywhere.
 */
function sectionName(locale: "pt-BR" | "en", section: ProfileFormSection): string {
  return getSettingsCopy(locale).sections[section].name;
}

export async function updateProfile(
  _state: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const requestedLocale = formData.get("locale") === "en" ? "en" : "pt-BR";
  /*
    `2P-SETTINGS-004`, and the whole reason this action changed in slice 2P.5.

    Settings is now eight sections and this form is four of them, so a
    submission carries four fields where it used to carry seventeen. Parsing
    those four against a strict schema would fail; filling the other thirteen
    from defaults would BLANK them, which is precisely what the requirement
    forbids — *saving one section cannot reset stored values owned by another.*

    So the payload is assembled from two sources: this section's fields come
    from the form, and every other field comes from the STORED ROW read below.
    The strict schema is then applied to the whole object, unchanged, so
    validation is not weakened for the fields this section does own.

    The stored row rather than hidden inputs, deliberately. Echoing the other
    sections' values through the page would let a tab left open overwrite a
    newer save with what it happened to render — a lost update introduced to
    avoid a read this action already performs for the pass-through columns.
  */
  const rawSection = formData.get("section");
  if (!isProfileFormSection(rawSection)) {
    return {
      status: "error",
      message: localized(
        requestedLocale,
        "Não foi possível identificar a seção. Recarregue a página e tente novamente.",
        "Could not identify the section. Reload the page and try again.",
      ),
    };
  }
  const section = rawSection;

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { status: "error", section, message: localized(requestedLocale, "Sua sessão expirou. Entre novamente.", "Your session expired. Sign in again.") };
  }
  await assertActiveAccount(supabase, user.id, requestedLocale);

  const [profileResult, preferencesResult] = await Promise.all([
    /*
     * `2O-PREF-010` widened both selects, and neither adds a query.
     *
     * The snapshot existed to **preserve** hidden preferences; it is now also
     * the *before* half of what changed. Answering "what will behave
     * differently" needs the previous value of every column a control writes —
     * `personality`, `tone`, the quiet hours, the routing — and none of those
     * were selected, because nothing had ever needed to compare them.
     *
     * `timezone` joins the profile select for the same reason. It is the one
     * preference stored on `profiles` rather than `agent_preferences`, and it
     * is the single most consequential one to change.
     */
    supabase.from("profiles").select("display_name,locale,timezone").eq("user_id", user.id).maybeSingle(),
    supabase.from("agent_preferences").select("agent_name,personality,tone,response_detail,quiet_start,quiet_end,important_reminder_override,max_followups_per_day,follow_up_intensity,daily_review_time,autonomy_level,weekly_review_day,weekly_review_time,planning_day,planning_time,ai_provider,ai_profile,chat_model,extraction_model,review_model,file_model,reasoning_model,background_model,embedding_model,privacy_default").eq("user_id", user.id).maybeSingle(),
  ]);
  if (profileResult.error || preferencesResult.error) {
    return { status: "error", section, message: localized(requestedLocale, "Não foi possível carregar suas preferências atuais.", "Could not load your current preferences.") };
  }

  /*
    The two sources, merged, and then parsed strictly as one whole object.

    `resolveSettingsFormValues` is the SAME function `loadSettingsFormValues`
    uses to build what the form rendered, so a column this section does not own
    is written back exactly as the reader saw it — including when the
    `agent_preferences` row is missing entirely and both sides have to agree
    about what a default means.

    Only the owned keys are taken from the payload, and they are taken by name
    from `PROFILE_SECTION_FIELDS`. A submission that smuggled in another
    section's field would have it ignored here and then rejected by
    `.strict()`'s unknown-key rule only if it were also unknown — so the filter,
    not the schema, is what confines a section to its own columns.
  */
  const stored = resolveSettingsFormValues(profileResult.data, preferencesResult.data);
  const submitted = Object.fromEntries(
    Array.from(formData.entries()).filter(([key]) => !key.startsWith("$ACTION_")),
  );
  const candidate: Record<string, unknown> = {
    ...storedAsSubmission(stored),
    locale: requestedLocale,
  };
  for (const field of ownedProfileFields(section)) {
    /*
      `delete` rather than assigning `undefined`, and it is load-bearing.

      An unticked checkbox submits **nothing**, so for
      `importantReminderOverride` absence IS the value `false`. Leaving the
      stored `"on"` in place would make the control impossible to turn off; the
      key has to actually go.

      For every other owned field the absence is impossible — a select, a text
      input and a number input all submit — so a missing key here means the
      section did not render a field it claims to own, and the strict parse
      below refuses with this section's name rather than writing a default.
    */
    if (field in submitted) candidate[field] = submitted[field];
    else delete candidate[field];
  }

  const parsed = profileSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      status: "error",
      section,
      message: localized(
        requestedLocale,
        `Revise os campos de ${sectionName("pt-BR", section)} antes de salvar.`,
        `Review the ${sectionName("en", section)} fields before saving.`,
      ),
    };
  }

  const payload = buildSettingsPayload(parsed.data, {
    fallbackDisplayName: String(user.user_metadata.display_name ?? "Usuário"),
    profile: profileResult.data,
    preferences: preferencesResult.data,
  });
  const { error } = await supabase.rpc("save_profile_settings", {
    p_profile: payload.profile,
    p_preferences: payload.preferences,
  });
  if (error) {
    /*
     * `2O-PREF-011`. The message says it failed and invites a retry, and the
     * **input is kept by construction**: this returns a state, it does not
     * redirect and it does not revalidate, so the form React is holding — every
     * field of it — is exactly what the reader typed. A `revalidatePath` here
     * would refresh the page out from under a failed save and discard it, which
     * is the shape slice 2N.3 found in the undo control.
     *
     * A partial write is impossible for a different reason: the payload is one
     * `save_profile_settings` call, so it lands whole or not at all.
     */
    console.error("Profile settings save failed", error.code);
    return {
      status: "error",
      section,
      message: localized(
        requestedLocale,
        getSettingsCopy("pt-BR").saveFailedIn(sectionName("pt-BR", section)),
        getSettingsCopy("en").saveFailedIn(sectionName("en", section)),
      ),
    };
  }

  /*
    THE ROUTE PATTERNS, NOT THE RESOLVED PATH.

    `/app/settings` lives under a dynamic `[locale]` segment, and its seven
    sibling sections live under a second one. The Next documentation states the
    rule outright — *"If `path` contains a dynamic segment … this parameter is
    required"* — and slice 2P.4 measured what happens without it against the
    deployed app: the client's refresh request is sent, the server answers it
    with the PREVIOUS render, and the owner concludes their save did not land.

    Two patterns cover all eight sections in both locales, and they come from
    the routing contract rather than being written here, so a section added to
    the route tree cannot leave this action invalidating a path that no longer
    matches it.
  */
  for (const path of SETTINGS_REVALIDATION_PATHS) revalidatePath(path, "page");
  /*
   * `2O-PREF-010`. What changed, and what will now behave differently — in the
   * registry's own words, which are the same words the summary on this page
   * uses. Diffed against the snapshot that was read before the write, so it
   * describes the change rather than the submission: a save that alters nothing
   * says so instead of claiming an effect.
   */
  const changed = changedColumns(
    { ...(preferencesResult.data ?? {}), timezone: profileResult.data?.timezone ?? null },
    { ...payload.preferences, timezone: payload.profile.timezone },
  );
  return { status: "success", section, message: describeSaveOutcome(requestedLocale, changed) };
}
