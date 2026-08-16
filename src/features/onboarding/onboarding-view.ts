import "server-only";

import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadActivationProgress } from "@/features/activation/activation-view";
import type { ActivationReading } from "@/features/activation/contracts";
import type { Database } from "@/lib/supabase/database.types";
import {
  ASSISTANT_IDENTITY_COLUMNS,
  deriveOnboardingPath,
  isAssistantPersonalised,
  type OnboardingExtraKey,
  type OnboardingPath,
} from "./contracts";
import { ONBOARDING_DISMISSAL_COOKIE, isDismissedValue } from "./dismissal";

/**
 * The path's one server read — `2O-ONBOARD-002` and `-009`.
 *
 * The five activation facts come from `loadActivationProgress` rather than from
 * five reads repeated here. That is the whole point of `2O-ONBOARD-002`: if this
 * module asked the same questions its own way, the path and the activation
 * contract could answer differently about the same account, which is precisely
 * the disagreement the requirement forbids.
 *
 * The two extra readings use the same wrapping the activation view uses, so a
 * failed read becomes `unreadable` rather than an exception or — far worse — a
 * fact that is false.
 */

type Client = SupabaseClient<Database>;

async function reading(read: () => Promise<ActivationReading>): Promise<ActivationReading> {
  try {
    return await read();
  } catch {
    return { ok: false };
  }
}

/**
 * Whether the dismissal cookie is present and says the one thing it may say.
 *
 * A missing cookie jar is `false` — the path is offered. `cookies()` throws in
 * contexts that have no request, and an offer shown once too often is a much
 * smaller failure than an offer silently withheld.
 */
export async function readDismissal(): Promise<boolean> {
  try {
    const jar = await cookies();
    return isDismissedValue(jar.get(ONBOARDING_DISMISSAL_COOKIE)?.value);
  } catch {
    return false;
  }
}

export async function loadOnboardingPath(
  supabase: Client,
  userId: string,
  options?: { dismissed?: boolean },
): Promise<OnboardingPath> {
  const [progress, assistantIdentity, memoryCreated, dismissed] = await Promise.all([
    loadActivationProgress(supabase, userId),
    reading(async () => {
      const { data, error } = await supabase
        .from("agent_preferences")
        .select(ASSISTANT_IDENTITY_COLUMNS.join(","))
        .eq("user_id", userId)
        .maybeSingle();
      if (error) return { ok: false };
      /*
       * Absence is `false`, not `unreadable`. `handle_new_user` creates this
       * row, so a missing one is abnormal — but "you have not named your
       * assistant" is true of an account with no preferences row, and offering
       * the step is the correct answer either way.
       */
      return { ok: true, satisfied: isAssistantPersonalised(data as Record<string, string | null> | null) };
    }),
    reading(async () => {
      const { data, error } = await supabase
        .from("memories")
        .select("user_id")
        .eq("user_id", userId)
        .limit(1);
      if (error) return { ok: false };
      return { ok: true, satisfied: (data ?? []).length > 0 };
    }),
    options?.dismissed === undefined ? readDismissal() : Promise.resolve(options.dismissed),
  ]);

  return deriveOnboardingPath({
    progress,
    extras: {
      assistant_identity: assistantIdentity,
      memory_created: memoryCreated,
    } satisfies Record<OnboardingExtraKey, ActivationReading>,
    dismissed,
  });
}
