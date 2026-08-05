import Script from "next/script";
import {
  CAPTCHA_TOKEN_FIELD,
  TURNSTILE_SCRIPT_URL,
  turnstileSiteKey,
} from "./captcha";

/**
 * The Turnstile widget on an auth form (SH-CAPTCHA-003, ADR-076).
 *
 * A plain server component with **no client JavaScript of its own**. Turnstile's
 * implicit mode finds `.cf-turnstile` and injects its own hidden input; naming
 * that input `captchaToken` means the token rides the ordinary form POST the
 * Server Actions already receive. Nothing to hydrate, nothing to clean up, and
 * the form still submits without our JS.
 *
 * ## It renders nothing without a site key, and that is the configured state
 *
 * Local dev and CI run with no `NEXT_PUBLIC_TURNSTILE_SITE_KEY` on purpose
 * (SH-CAPTCHA-005). No key means no widget, no token, and — in those
 * environments — a provider with CAPTCHA disabled, which asks for none. A green
 * CI run therefore never implies the hosted control is on. That is the point:
 * the only proof of enforcement is the deployed probe of SH-CAPTCHA-002.
 *
 * ## The site key is public, the secret key is not here at all
 *
 * A Turnstile site key is designed to be read by anyone; it identifies the
 * widget and grants nothing. Its pair, the secret key, lives only in hosted
 * GoTrue. This repository contains no path by which a secret could reach a
 * bundle, because it contains no code that reads one.
 */
export function TurnstileWidget({
  env = process.env as Readonly<Record<string, string | undefined>>,
}: {
  env?: Readonly<Record<string, string | undefined>>;
}) {
  const siteKey = turnstileSiteKey(env);
  if (!siteKey) return null;

  return (
    <>
      <Script src={TURNSTILE_SCRIPT_URL} strategy="afterInteractive" async defer />
      <div
        className="cf-turnstile"
        data-sitekey={siteKey}
        data-response-field-name={CAPTCHA_TOKEN_FIELD}
        // The auth pages are a single narrow card; the compact widget is the
        // one that fits without the form reflowing when the challenge appears.
        data-size="flexible"
      />
    </>
  );
}
