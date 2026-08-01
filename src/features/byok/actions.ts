"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { encryptCredential, requireMasterKey, requireFingerprintPepper, requireRateLimitPepper } from "@/lib/byok/crypto";
import { computeFingerprint } from "@/lib/byok/fingerprint";
import { hashClientIp } from "@/lib/byok/ip";
import type { Secret } from "@/lib/byok/secret";
import { resolveLocale } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";

import { getByokCopy } from "./copy";
import { validateAgainstProvider } from "./probe";
import { parseApiKey, runValidation, type ValidationOutcome } from "./validation";

/**
 * `BYOK-LIFECYCLE-001…009`, `BYOK-VALIDATE-001…007`, `BYOK-ROTATE-001…004`.
 *
 * ## The shape every action returns
 *
 * **Metadata only.** No action here returns a key, a ciphertext, an IV or a
 * fingerprint-bearing error. `BYOK-LIFECYCLE-002` allows exactly five fields to
 * reach a read path, and `BYOK-GUARD-004` round-trips every one of these results
 * through `JSON.stringify` to prove nothing else got in.
 */

export type ByokActionState =
  | { readonly status: "idle" }
  | { readonly status: "success"; readonly message: string }
  | { readonly status: "error"; readonly message: string };

/**
 * The client address, from the proxy header the platform sets.
 *
 * `x-forwarded-for` is a **list** — the client, then each proxy that added
 * itself. The leftmost entry is the one closest to the client, and it is also
 * the one a client can forge. That is acceptable here and worth stating: this
 * value feeds a rate-limit bucket, not an authorization decision, and a forged
 * value costs the forger their own ceiling rather than buying them anything.
 * Anything unparseable collapses into one shared bucket, so forging garbage is
 * strictly worse than sending a real address.
 */
async function clientIpHash(): Promise<string | null> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const candidate = forwarded?.split(",")[0]?.trim() ?? headerList.get("x-real-ip");
  if (!candidate) return null;
  return hashClientIp(candidate, requireRateLimitPepper());
}

type ValidationAttempt =
  | { readonly ok: true; readonly outcome: ValidationOutcome }
  | { readonly ok: false; readonly throttled: true };

/**
 * Reserve a slot, run the one live call, record the outcome.
 *
 * The reservation is taken **before** the provider is contacted and is never
 * released: a crash between reserving and finalizing leaves the attempt counted,
 * which is the correct failure direction. A crash must not be a way to get free
 * attempts against somebody else's key.
 */
async function attemptValidation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  key: Secret,
): Promise<ValidationAttempt> {
  const ipHash = await clientIpHash();

  const { data: attemptId, error: claimError } = await supabase.rpc(
    "claim_credential_validation_slot",
    { p_ip_hash: ipHash },
  );
  if (claimError || !attemptId) return { ok: false, throttled: true };

  const outcome = await runValidation(key, validateAgainstProvider);

  await supabase.rpc("finalize_credential_validation_attempt", {
    p_attempt_id: attemptId,
    p_outcome: outcome,
  });

  return { ok: true, outcome };
}

/** Everything a credential row needs, sealed. */
async function sealCredential(key: Secret, userId: string) {
  const keyVersion = 1;
  const provider = "openai";
  const envelope = await encryptCredential(key.expose(), requireMasterKey(), {
    userId,
    keyVersion,
    provider,
  });
  return {
    provider,
    key_version: keyVersion,
    ciphertext: `\\x${Buffer.from(envelope.ciphertext, "base64").toString("hex")}`,
    iv: `\\x${Buffer.from(envelope.iv, "base64").toString("hex")}`,
    fingerprint: await computeFingerprint(key.expose(), requireFingerprintPepper()),
    validated_at: new Date().toISOString(),
    status: "active" as const,
    last_failure_code: null,
  };
}

/**
 * Save or rotate — one action, because they are one operation.
 *
 * `BYOK-ROTATE-001`: **validate first**. On failure the existing credential is
 * untouched and still active, which is the property that makes rotation safe to
 * attempt. A rotation that cleared the old key before proving the new one works
 * would turn a typo into an outage.
 *
 * `BYOK-ROTATE-004`: concurrency is resolved by a **staleness witness** rather
 * than a lock — the same mechanism the task-command console uses. The form
 * carries the `updated_at` it rendered; the write only lands if the row still
 * has it. Two simultaneous rotations therefore produce one winner and one
 * declared conflict, never a partial write, and it costs no migration.
 */
export async function saveAiCredential(
  _previous: ByokActionState,
  formData: FormData,
): Promise<ByokActionState> {
  const copy = getByokCopy(formData.get("locale"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: copy.messages.credentialRequired };

  const key = parseApiKey(formData.get("apiKey"));
  if (!key) return { status: "error", message: copy.shapeInvalid };

  const attempt = await attemptValidation(supabase, key);
  if (!attempt.ok) return { status: "error", message: copy.validation.throttled };

  if (attempt.outcome !== "succeeded") {
    // `BYOK-VALIDATE-007`: a key that fails validation is never stored in any
    // form. Only the failure code is recorded, and only on a row that already
    // exists — a first-time failure creates nothing at all.
    await supabase
      .from("user_ai_credentials")
      .update({ last_failure_code: attempt.outcome })
      .eq("user_id", user.id);
    return { status: "error", message: copy.validation[attempt.outcome] };
  }

  const sealed = await sealCredential(key, user.id);
  const witness = formData.get("observedUpdatedAt");
  const rotating = typeof witness === "string" && witness.length > 0;

  if (rotating) {
    const { data, error } = await supabase
      .from("user_ai_credentials")
      .update(sealed)
      .eq("user_id", user.id)
      .eq("updated_at", witness)
      .select("user_id");
    if (error) return { status: "error", message: copy.validation.unknown };
    if (!data || data.length === 0) {
      return { status: "error", message: copy.rotationConflict };
    }
    revalidatePath(`/${resolveLocale(formData.get("locale"))}/app/settings`);
    return { status: "success", message: copy.rotated };
  }

  const { error } = await supabase
    .from("user_ai_credentials")
    .upsert({ user_id: user.id, ...sealed }, { onConflict: "user_id" });
  if (error) return { status: "error", message: copy.validation.unknown };

  revalidatePath(`/${resolveLocale(formData.get("locale"))}/app/settings`);
  return { status: "success", message: copy.saved };
}

/**
 * `BYOK-LIFECYCLE-006` — removal nulls the key material in **one statement**.
 *
 * Not a two-step "mark removed, then clear": a crash between the two would leave
 * a row that says `removed` while still holding a decryptable ciphertext, which
 * is the exact state the status CHECK forbids and the exact state a user who
 * clicked *Remove* believes cannot exist.
 */
export async function removeAiCredential(
  _previous: ByokActionState,
  formData: FormData,
): Promise<ByokActionState> {
  const copy = getByokCopy(formData.get("locale"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: copy.messages.credentialRequired };

  const { error } = await supabase
    .from("user_ai_credentials")
    .update({
      status: "removed",
      ciphertext: null,
      iv: null,
      key_version: null,
      validated_at: null,
      last_failure_code: null,
    })
    .eq("user_id", user.id);
  if (error) return { status: "error", message: copy.validation.unknown };

  revalidatePath(`/${resolveLocale(formData.get("locale"))}/app/settings`);
  return { status: "success", message: copy.removed };
}
