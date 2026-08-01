import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  isResolved,
  resolveOwnCredential,
  type CredentialFailureCode,
  type ResolvedCredential,
} from "./adapter";

/**
 * The one gate every synchronous AI path passes through.
 *
 * ## Why a shared helper rather than five copies
 *
 * There are five provider construction sites. Five copies of "resolve, check the
 * outcome, return the right gated state" is five chances to get one of them
 * subtly wrong — and the one that is wrong will be the one that falls back, or
 * the one that reports "something went wrong" where the user needed "you have
 * not configured a key yet, here is where". The engineering standard this
 * repository holds — domain rules out of the leaves, query assembly not
 * duplicated — applies exactly as much to a security decision.
 *
 * ## Why the failure is a value and not a throw
 *
 * `BYOK-ADAPTER-007`. Every one of these three is a state the product renders
 * differently, and a thrown exception flattens them into one 500.
 */

export type AiGate =
  | { readonly ok: true; readonly credential: ResolvedCredential }
  | { readonly ok: false; readonly reason: CredentialFailureCode };

/**
 * Resolve the caller's own credential, or report which gated state applies.
 *
 * **No provider is constructed and no provider call is made when this fails** —
 * which is the property `BYOK-GUARD-001` and matrix case 12 both check. The
 * project key is not consulted, because there is no longer any code that could
 * consult it.
 */
export async function openAiGate(
  supabase: SupabaseClient<Database>,
  userId: string,
  /**
   * Injected only by tests, which pass a master key rather than mutating
   * `process.env` — under a parallel runner that is a shared mutable global, and
   * the crypto suite already learned that lesson.
   */
  env: NodeJS.ProcessEnv = process.env,
): Promise<AiGate> {
  const resolution = await resolveOwnCredential(supabase, userId, env);
  if (isResolved(resolution)) return { ok: true, credential: resolution };
  return { ok: false, reason: resolution.outcome };
}

/**
 * The message key for a gated state.
 *
 * Returns a **key**, never a sentence: copy lives in the feature's typed `copy.ts`
 * module and is localized there, which is the mechanism `ENGINEERING_STANDARDS`
 * requires and the thing a scattered locale ternary would defeat.
 *
 * The three codes collapse to two messages on purpose. "You have not configured
 * a key" is actionable and names the fix. "Your key could not be read" is the
 * other two, and it is deliberately vague about which: the difference between a
 * transient resolver miss and a failed decryption is not something the owner can
 * act on differently, and `BYOK-CRYPTO-005` forbids reporting which anyway.
 */
export function gateMessageKey(reason: CredentialFailureCode): "credentialRequired" | "credentialUnreadable" {
  return reason === "credential_required" ? "credentialRequired" : "credentialUnreadable";
}
