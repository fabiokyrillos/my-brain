import "server-only";

import { z } from "zod";

import { Secret } from "@/lib/byok/secret";

/**
 * `BYOK-VALIDATE-001…007` — shape, then one live call, then a closed vocabulary.
 *
 * ## The rule this module exists to keep
 *
 * **The provider's error object never escapes.** It is not re-thrown, not logged
 * whole, not serialized into a result, and not attached to anything that will
 * be. OpenAI's SDK errors carry the request — which for a validation call
 * contains the key being validated — so an error that reaches a log has
 * published the secret it was checking.
 *
 * Everything here converts to one of six words and drops the rest on the floor.
 */

/** `BYOK-SCHEMA-006`'s closed vocabulary, plus the local-only `throttled`. */
export const VALIDATION_OUTCOMES = [
  "succeeded",
  "invalid_key",
  "insufficient_quota",
  "rate_limited",
  "revoked",
  "unknown",
] as const;

export type ValidationOutcome = (typeof VALIDATION_OUTCOMES)[number];

/**
 * `BYOK-VALIDATE-001` — shape validation before any network call.
 *
 * The message names the field and **never echoes the input**. A Zod issue that
 * quoted the value would put a key into whatever renders the error, which on a
 * form is the page.
 *
 * The bounds are deliberately loose on format and tight on size: OpenAI has
 * changed its key prefixes more than once, and a validator that rejects a
 * legitimate new format is an outage the user cannot work around. Length is the
 * part worth enforcing, because it is what stops a paste of an entire file.
 */
export const apiKeySchema = z
  .string()
  .trim()
  .min(20, "invalid")
  .max(400, "invalid")
  .regex(/^[A-Za-z0-9_-]+$/, "invalid");

export function parseApiKey(raw: unknown): Secret | null {
  const result = apiKeySchema.safeParse(raw);
  if (!result.success) return null;
  return new Secret(result.data);
}

/**
 * Map a provider failure to one word.
 *
 * Reads only the **status code** and a narrow, well-known set of error codes.
 * It deliberately does not pattern-match the message: provider messages are
 * prose, they change without notice, and matching on them is how a mapping
 * silently starts returning `unknown` for everything.
 */
export function classifyProviderFailure(error: unknown): ValidationOutcome {
  const status = readNumber(error, "status");
  const code = readString(error, "code");

  if (code === "invalid_api_key") return "invalid_key";
  if (code === "insufficient_quota") return "insufficient_quota";
  if (code === "account_deactivated") return "revoked";

  if (status === 401) return "invalid_key";
  if (status === 403) return "revoked";
  if (status === 429) {
    // 429 is both "too many requests" and "you are out of credit". The code
    // distinguishes them, and telling a user to "try again shortly" when their
    // balance is zero would be advice that never comes true.
    return code === "insufficient_quota" ? "insufficient_quota" : "rate_limited";
  }

  return "unknown";
}

function readNumber(value: unknown, key: string): number | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "number" ? candidate : undefined;
}

function readString(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const direct = (value as Record<string, unknown>)[key];
  if (typeof direct === "string") return direct;
  // The SDK nests the code under `error` on some responses.
  const nested = (value as Record<string, unknown>).error;
  if (typeof nested === "object" && nested !== null) {
    const inner = (nested as Record<string, unknown>)[key];
    if (typeof inner === "string") return inner;
  }
  return undefined;
}

/**
 * The one live call. Injectable so the opt-in lane can drive the real thing and
 * the unit suite can drive a stub without either pretending to be the other.
 */
export type ValidationProbe = (key: Secret) => Promise<void>;

/**
 * `BYOK-VALIDATE-002` — one minimal request, `maxRetries: 0`, short timeout.
 *
 * `maxRetries: 0` is not a performance choice. A retrying validator turns one
 * user action into several provider calls against a key that may be invalid,
 * which is precisely the traffic that gets an account rate-limited — and under
 * BYOK it is the **user's** account.
 */
export const VALIDATION_TIMEOUT_MS = 10_000;

export async function runValidation(
  key: Secret,
  probe: ValidationProbe,
): Promise<ValidationOutcome> {
  try {
    await probe(key);
    return "succeeded";
  } catch (error) {
    // The only thing that crosses this boundary is the return value. The error
    // is classified and discarded here; nothing above ever sees it.
    return classifyProviderFailure(error);
  }
}
