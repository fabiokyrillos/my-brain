/**
 * The CAPTCHA posture, as pure functions (SH-CAPTCHA-003/004/005, ADR-076).
 *
 * No `server-only`: the site key is public by definition and the widget is a
 * client component, so both halves read from here. Nothing in this file touches
 * a secret — the Turnstile **secret key** is a hosted GoTrue setting and must
 * never exist in this repository or in any bundle.
 *
 * ## What the application can and cannot claim
 *
 * The application carries the widget and forwards the token. It does **not**
 * enforce anything, and this module is deliberately shaped so that no caller
 * can believe otherwise: there is no `verifyToken`, because verification happens
 * inside GoTrue against the secret. SH-CAPTCHA-002 — "a raw API call without a
 * valid token fails" — is a property of the hosted setting, provable only by
 * deployed probes, and it stays unclaimed until those run.
 *
 * So the honest reading of a page that renders the widget while hosted CAPTCHA
 * is off is: the token is collected and sent, and the provider ignores it. That
 * is the intended intermediate state, not a bug.
 */

/** The form field the widget writes and the Server Actions read. */
export const CAPTCHA_TOKEN_FIELD = "captchaToken";

/**
 * The one external origin the auth pages may load.
 *
 * Named here rather than inlined in the component so SH-CAPTCHA-004 can assert
 * it: this origin must appear on the auth surface and **nowhere** in the
 * authenticated product.
 */
export const TURNSTILE_SCRIPT_ORIGIN = "https://challenges.cloudflare.com";

/**
 * Implicit rendering, not explicit.
 *
 * Turnstile's implicit mode scans the DOM for `.cf-turnstile` and injects the
 * hidden response input itself, which means the widget needs **no client
 * JavaScript of ours at all** — no `useEffect`, no ref, no render callback, no
 * cleanup on unmount. `data-response-field-name` renames that injected input to
 * the field the Server Actions read, so the token arrives through the ordinary
 * form POST that already works without JS.
 */
export const TURNSTILE_SCRIPT_URL = `${TURNSTILE_SCRIPT_ORIGIN}/turnstile/v0/api.js`;

/**
 * The public site key, or `null` when the deployment has not been given one.
 *
 * `null` is a first-class state, not an error. Local dev and CI run without a
 * key on purpose (SH-CAPTCHA-005): the widget renders nothing, the actions send
 * no token, and the provider — which also has CAPTCHA disabled there — asks for
 * none. A CI run therefore never claims the hosted control, which is exactly
 * what that requirement is protecting against.
 *
 * It is read from the argument rather than from `process.env` directly so the
 * decision stays testable, the shape `signup-policy.ts` established.
 */
export function turnstileSiteKey(
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  const value = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  return value ? value : null;
}

/**
 * The token a form submitted, reduced to what may be forwarded.
 *
 * Turnstile tokens are bounded (~2 KB); anything longer did not come from the
 * widget, and forwarding an unbounded field to the provider is how a form field
 * becomes a request-smuggling surface. An absent or empty token becomes
 * `undefined` rather than `""`, because the Supabase client omits an undefined
 * option and would forward an empty string as a *present, invalid* token —
 * which turns "the widget did not run" into "the challenge failed", two
 * different facts with two different messages.
 */
export function readCaptchaToken(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > 2048) return undefined;
  return trimmed;
}

/**
 * Does a provider error say the challenge failed?
 *
 * GoTrue reports it as `captcha_protection_failed` on newer versions and as a
 * plain message on older ones, so both are recognised. Matching too narrowly
 * would surface a CAPTCHA failure as `invalid-credentials`, sending someone to
 * reset a password that was never wrong.
 */
export function isCaptchaError(error: { code?: string; message?: string }): boolean {
  if (error.code === "captcha_protection_failed") return true;
  return /captcha/i.test(error.message ?? "");
}
