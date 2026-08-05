import { locales, type Locale } from "@/lib/preferences";
import { buildAuthCallbackUrl } from "./flow";

/**
 * The intended hosted Auth posture, as repository truth (SH-ORIGIN-001,
 * SH-SIGNUP-003, SH-GD.1).
 *
 * ## Why the hosted settings live in the repository at all
 *
 * The readback that produced this found `site_url = "http://localhost:3000"` on
 * the production project with an **empty** redirect allow list — which means
 * every confirmation and recovery link the deployed product could send pointed
 * at the recipient's own machine. Nothing in the repository disagreed with that,
 * because nothing in the repository had an opinion. Now it does, and the opinion
 * is diffable.
 *
 * ## The allow list is generated, never typed
 *
 * `redirectAllowList()` calls `buildAuthCallbackUrl` — the *same* function the
 * Server Actions call — for every locale and every `next` the callback route
 * accepts. A hand-written list would drift the first time a locale or a
 * post-auth destination is added, and the failure mode of drift here is a live
 * auth link the provider refuses.
 *
 * Both the bare callback path and the `next`-bearing forms are emitted, because
 * providers differ on whether the query string participates in matching and
 * this is not a thing to be clever about: an over-narrow list breaks auth in a
 * way only a real email reveals, and every entry here is an exact URL, so the
 * extra entries widen nothing.
 */

/**
 * The owner-selected production origin. Vercel, no custom domain yet.
 *
 * Not inferred, and deliberately not read from `APP_ORIGIN`: this is the value
 * the *hosted provider* must agree with, and reading it from the environment
 * would make the two agree by construction while proving nothing.
 */
export const PRODUCTION_ORIGIN = "https://my-brain-dusky.vercel.app";

/**
 * Local development. Repository truth requires it: the online acceptance suite
 * and `npm run dev` both serve the app here against the hosted project, and
 * `signup-policy.ts` documents this exact value as the non-production fallback.
 *
 * It is enumerated, never a wildcard, so it cannot become an unrestricted
 * production redirect. A dedicated development Supabase project would remove
 * the need for it entirely — named for SH.7 rather than left implicit.
 */
export const DEVELOPMENT_ORIGIN = "http://localhost:3000";

/** Every post-authentication destination the callback route will honour. */
function nextTargets(locale: Locale): readonly string[] {
  return [`/${locale}/app`, `/${locale}/auth/reset`];
}

/**
 * The exact redirect allow list, generated from the app's own URL builder.
 */
export function redirectAllowList(
  origins: readonly string[] = [PRODUCTION_ORIGIN, DEVELOPMENT_ORIGIN],
): string[] {
  const urls = new Set<string>();
  for (const origin of origins) {
    for (const locale of locales) {
      urls.add(new URL(`/${locale}/auth/callback`, origin).toString());
      for (const next of nextTargets(locale)) {
        urls.add(
          buildAuthCallbackUrl(origin, locale, next as `/${Locale}/app` | `/${Locale}/auth/reset`),
        );
      }
    }
  }
  return [...urls].sort();
}

/**
 * The hosted fields this repository asserts an opinion about.
 *
 * Deliberately a **small** set. Every field named here is one a reviewer can
 * check against the readback; every field absent is one the initiative has not
 * decided and must therefore not overwrite — which is the whole argument for a
 * targeted update over a whole-file push.
 */
export const INTENDED_HOSTED_AUTH = {
  site_url: PRODUCTION_ORIGIN,
  uri_allow_list: redirectAllowList().join(","),
  /** Registration stays shut. Opening it is a post-initiative owner decision. */
  disable_signup: true,
  /** The provider stays enabled — it is not how registration is closed. */
  external_email_enabled: true,
  /** Confirmation stays required; auto-confirm would skip proof of address. */
  mailer_autoconfirm: false,
  /** A second door into account creation the signup gate would not see. */
  external_anonymous_users_enabled: false,

  /**
   * SH-SIGNUP-007 — the hosted policy matches the application's Zod policy.
   *
   * Until 2026-08-05 this was `6` with no character requirement, while
   * `schema.ts` demanded twelve characters across four classes. That gap was
   * not theoretical: the Zod schema guards the Server Actions, and the Server
   * Actions are not the only door. An authenticated caller reaching
   * `PUT /auth/v1/user` through PostgREST is validated by GoTrue alone, so a
   * six-character password was reachable by anyone willing to skip the form.
   *
   * `password_required_characters` is a **closed set**, not free text, and the
   * four-class member contains a literal double backslash. It is read from the
   * provider's own enum by `scripts/hosted-auth-config.mjs` rather than
   * transcribed here — a hand-escaped copy was rejected as a 97-character
   * string where the API wanted 98, and a constant that can be wrong in a way
   * nobody can see by reading it is worse than no constant.
   */
  password_min_length: 12,
} as const;

/**
 * The application-side policy, stated once so the parity test can compare it to
 * `schema.ts` and to the hosted readback without re-deriving it from a regex.
 *
 * The app policy remains the **first** line, not the only one: it fails faster,
 * in the user's language, before a network call. The hosted policy is what
 * makes it true at the boundary the form does not own.
 */
export const APPLICATION_PASSWORD_POLICY = {
  minLength: 12,
  maxLength: 128,
  /** lower, upper, digit, symbol — the four classes `schema.ts` requires. */
  requiredClasses: 4,
} as const;
