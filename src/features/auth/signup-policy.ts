/**
 * The signup gate and auth-origin policy, as pure functions
 * (SH-SIGNUP-001, SH-ORIGIN-001).
 *
 * Deliberately **without** `server-only`, and separate from `signup-gate.ts`
 * which reads `process.env` and does carry it. Same separation the repository
 * already uses for action state versus Server Actions: the decision is pure and
 * testable, the environment read is the thin server-bound wrapper.
 *
 * Nothing here reads configuration, so importing it can never leak one.
 */

/** The exact string that opens the gate. Nothing else does. */
const OPEN = "true";

export type SignupGate =
  | { readonly open: true }
  | { readonly open: false; readonly reason: "not_configured" | "explicitly_disabled" };

/**
 * Decides the gate from a raw environment value.
 *
 * "Defaults to closed" is the load-bearing part, and it is strict on purpose:
 * absent, empty, misspelled, or any value other than the exact string `"true"`
 * all mean closed. There is no truthiness — `"1"`, `"yes"`, `"on"` and `"TRUE"`
 * are all closed, because a gate that opens on a value somebody typed loosely
 * is a gate that opens by accident. Opening signup is a deliberate act and has
 * to look like one.
 *
 * The two closed reasons are not cosmetic: "nobody configured this" and
 * "somebody turned it off" are different operational facts.
 */
export function readSignupGate(value: string | undefined): SignupGate {
  if (value === undefined || value.trim() === "") {
    return { open: false, reason: "not_configured" };
  }
  if (value === OPEN) return { open: true };
  return { open: false, reason: "explicitly_disabled" };
}

/**
 * Resolves the configured application origin.
 *
 * This replaced a read of the request's `Origin` header. That header is
 * supplied by whoever makes the request, and it decided the host inside
 * `emailRedirectTo` and `resetPasswordForEmail`'s `redirectTo` — so an attacker
 * reaching either endpoint chose where a link in a mail the provider sends to a
 * *real user* points. The provider's redirect allowlist would refuse most of
 * that, but an allowlist is the backstop, not the control.
 *
 * An unset origin is not silently replaced with a guess. Outside production it
 * falls back to the documented dev origin, which is unambiguous; in production
 * it throws, because the failure mode of guessing is a live email pointing at
 * the wrong host.
 */
export function resolveConfiguredOrigin(
  configured: string | undefined,
  nodeEnv: string | undefined,
): string {
  const trimmed = configured?.trim();
  if (trimmed) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error("APP_ORIGIN is not a valid absolute URL");
    }
    const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !local) {
      // http:// to a real host would put a downgradeable link in an email.
      throw new Error("APP_ORIGIN must be https, except for localhost");
    }
    // Origin only — a configured path would silently prefix every callback URL.
    return parsed.origin;
  }

  if (nodeEnv === "production") {
    throw new Error(
      "APP_ORIGIN is required in production: auth emails must not point at a request-supplied host",
    );
  }
  return "http://localhost:3000";
}

/**
 * The environment-bound readers.
 *
 * They take the environment as a parameter rather than reaching for
 * `process.env` behind a `server-only` marker. An earlier cut used a separate
 * `server-only` module, and that propagated the marker through
 * `auth/actions.ts` into every test that imports it — the guard broke unrelated
 * suites without protecting anything, because neither variable is
 * `NEXT_PUBLIC_`: a client bundle sees `undefined` for both, which reads as
 * "signup closed" and, for the origin, as the dev fallback that no client uses.
 * Fail-safe either way, and testable without a running server.
 */
/**
 * An environment bag. Typed as an index signature rather than the two named
 * keys so `process.env` (`NodeJS.ProcessEnv`) is assignable — a weak type of
 * just the named keys is rejected by TypeScript's excess-property rule, and the
 * workaround for that would be a cast at every call site.
 */
type EnvLike = Readonly<Record<string, string | undefined>>;

/** Reads `SIGNUP_ENABLED`. */
export function signupGateFrom(env: EnvLike): SignupGate {
  return readSignupGate(env.SIGNUP_ENABLED);
}

export function isSignupOpenIn(env: EnvLike): boolean {
  return signupGateFrom(env).open;
}

/** Reads `APP_ORIGIN`, with `NODE_ENV` deciding whether absence is fatal. */
export function configuredOriginFrom(env: EnvLike): string {
  return resolveConfiguredOrigin(env.APP_ORIGIN, env.NODE_ENV);
}
