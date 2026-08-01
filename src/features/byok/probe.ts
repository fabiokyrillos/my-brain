import "server-only";

import OpenAI from "openai";

import type { Secret } from "@/lib/byok/secret";

import { VALIDATION_TIMEOUT_MS, type ValidationProbe } from "./validation";

/**
 * The real provider probe — the **only** place in the product that makes a
 * network call with a key it has not yet accepted.
 *
 * ## Why `models.list` and not a completion
 *
 * It is the cheapest authenticated call OpenAI offers: it costs no tokens, so
 * validating a key never bills the user, and it answers exactly the question
 * being asked — *does this credential authenticate?* A one-token completion
 * would cost money, would depend on the account having access to whichever
 * model was hard-coded, and would fail for a key that is perfectly valid but
 * scoped away from that model.
 *
 * ## `maxRetries: 0`, deliberately
 *
 * A retrying validator turns one user action into several provider calls
 * against a key that may be invalid — which is the traffic that gets an account
 * rate-limited. Under BYOK that account is the **user's**.
 *
 * ## What this file must never do
 *
 * Log. Not the error, not the key, not the request. The SDK's errors carry the
 * request that produced them, and for this call the request is authenticated
 * with the value being validated. The `catch` is in `runValidation`, which
 * classifies and discards; nothing here reaches for a logger.
 */
export const validateAgainstProvider: ValidationProbe = async (key: Secret) => {
  const client = new OpenAI({
    apiKey: key.expose(),
    maxRetries: 0,
    timeout: VALIDATION_TIMEOUT_MS,
  });
  await client.models.list();
};
