import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

/**
 * `BYOK-LIFECYCLE-002` — the **only** read path, and it returns metadata.
 *
 * ## What is deliberately absent from this type
 *
 * `ciphertext` and `iv`. Not omitted from the render — **never selected**. A read
 * path that fetched them and then chose not to display them would put a
 * ciphertext into a React Server Component payload, where it is one careless
 * prop away from the browser and one `console.log` away from a server log. The
 * `select` below names five columns, and the type has five fields, so there is
 * nothing to leak by accident.
 *
 * `BYOK-LIFECYCLE-003`: there is no reveal action anywhere in this feature, and
 * no endpoint that returns plaintext. This module is where such a thing would
 * have to live, and it does not exist here.
 */

export type CredentialStatus = "active" | "invalid" | "removed" | "absent";

export type CredentialMetadata = {
  readonly configured: boolean;
  readonly status: CredentialStatus;
  readonly provider: string | null;
  readonly fingerprint: string | null;
  readonly validatedAt: string | null;
  readonly lastFailureCode: string | null;
  /**
   * The staleness witness the rotation form echoes back.
   *
   * It is a timestamp, not a secret, and it is what makes two simultaneous
   * rotations produce one winner and one declared conflict rather than a
   * partial write.
   */
  readonly observedUpdatedAt: string | null;
};

export const ABSENT_CREDENTIAL: CredentialMetadata = {
  configured: false,
  status: "absent",
  provider: null,
  fingerprint: null,
  validatedAt: null,
  lastFailureCode: null,
  observedUpdatedAt: null,
};

export async function loadCredentialMetadata(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CredentialMetadata> {
  const { data, error } = await supabase
    .from("user_ai_credentials")
    // Five columns, and not one more. `ciphertext` and `iv` are not selected.
    .select("status,provider,fingerprint,validated_at,last_failure_code,updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return ABSENT_CREDENTIAL;

  const status: CredentialStatus =
    data.status === "active" || data.status === "invalid" || data.status === "removed"
      ? data.status
      : "absent";

  return {
    // `configured` is `active` alone. `invalid` and `removed` are *not*
    // configured, because BYOK-LIFECYCLE-001 gates AI identically for all three
    // — and a Settings page that said "configured" while every AI surface
    // refused would be the product contradicting itself.
    configured: status === "active",
    status,
    provider: data.provider,
    fingerprint: data.fingerprint,
    validatedAt: data.validated_at,
    lastFailureCode: data.last_failure_code,
    observedUpdatedAt: data.updated_at,
  };
}
