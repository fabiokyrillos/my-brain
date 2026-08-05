import { describe, expect, it } from "vitest";
import nextConfig, {
  AUTH_SOURCE,
  BASE_SOURCE,
  contentSecurityPolicy,
  TURNSTILE_ORIGIN,
} from "../../../next.config";

/**
 * SH-CAPTCHA-004 — the widget's origin is permitted on the auth routes and
 * nowhere else, and every route still gets exactly one policy.
 *
 * ## The bug this exists to prevent recurring
 *
 * The Turnstile script was blocked in production while every static check
 * passed: the widget markup rendered, the site key was present and correct, and
 * nothing in the repository was obviously wrong. Only a real browser reported
 * `violates the following Content Security Policy directive`.
 *
 * That failure mode is the dangerous one — it is silent while hosted CAPTCHA is
 * off, and the moment the setting is switched on it becomes "every sign-in is
 * refused for a missing token", which locks out every account including the
 * owner's.
 *
 * ## Why overlap is asserted, not just permissiveness
 *
 * Two `Content-Security-Policy` headers on one response are enforced as an
 * **intersection**. A second, looser policy for `/auth` layered on top of a
 * global strict one would therefore change nothing at all, while looking
 * exactly like a fix. The sources have to be mutually exclusive, and that is
 * what the last two cases here check — including the direction nobody thinks
 * of, where a route matches *neither* pattern and silently loses its CSP.
 */

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

async function rules(): Promise<HeaderRule[]> {
  const headers = await nextConfig.headers!();
  return headers as HeaderRule[];
}

const cspOf = (rule: HeaderRule) =>
  rule.headers.find((h) => h.key === "Content-Security-Policy")!.value;

/**
 * Next's source patterns, as a matcher good enough to test exclusivity.
 *
 * An approximation of path-to-regexp, not a reimplementation of it — the
 * authority on real matching is the deployed response, and the probe that reads
 * the live headers is what actually closed this bug. This exists to catch a
 * regression in the two constants before it reaches a deploy.
 *
 * The lookbehind is load-bearing: without it the `:` inside the `(?:` this
 * function itself produces gets rewritten on the next pass, and the pattern
 * turns into `(?[^/]+-BR|en)` — an invalid group that throws rather than
 * failing an assertion.
 */
function matches(source: string, path: string): boolean {
  const pattern = source
    // `:locale(pt-BR|en)` -> a group of the given alternatives
    .replace(/:(\w+)\(([^)]*)\)/g, "(?:$2)")
    // `/:path*` -> the rest of the path, including nothing at all
    .replace(/\/:(\w+)\*/g, "(?:/.*)?")
    .replace(/(?<!\(\?):(\w+)/g, "[^/]+");
  return new RegExp(`^${pattern}$`).test(path);
}

const AUTH_PATHS = [
  "/pt-BR/auth/login",
  "/pt-BR/auth/register",
  "/pt-BR/auth/recover",
  "/pt-BR/auth/resend",
  "/en/auth/login",
  "/en/auth/callback",
];

const PRODUCT_PATHS = [
  "/pt-BR/app",
  "/pt-BR/app/inbox",
  "/en/app/settings",
  "/pt-BR/legal/terms",
  "/",
];

describe("SH-CAPTCHA-004: the Turnstile origin is permitted only where the widget renders", () => {
  it("the auth policy allows the script, the frame AND the connection", async () => {
    // All three, because allowing only the script produces a widget that loads
    // and then has nowhere to draw -- which looks like a different bug.
    const auth = contentSecurityPolicy({ turnstile: true });
    expect(auth).toMatch(new RegExp(`script-src [^;]*${TURNSTILE_ORIGIN}`));
    expect(auth).toMatch(new RegExp(`frame-src [^;]*${TURNSTILE_ORIGIN}`));
    expect(auth).toMatch(new RegExp(`connect-src [^;]*${TURNSTILE_ORIGIN}`));
  });

  it("the base policy allows it nowhere", async () => {
    expect(contentSecurityPolicy({ turnstile: false })).not.toContain(TURNSTILE_ORIGIN);
  });

  it("neither policy loosens anything else", async () => {
    const base = contentSecurityPolicy({ turnstile: false });
    const auth = contentSecurityPolicy({ turnstile: true });
    for (const directive of [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "style-src 'self' 'unsafe-inline'",
    ]) {
      expect(base).toContain(directive);
      expect(auth).toContain(directive);
    }
    // The auth policy differs from the base one ONLY by the Turnstile origin:
    // delete every occurrence, tidy the whitespace the deletion leaves behind,
    // and what remains must be the base policy exactly. Any other difference --
    // a directive dropped, a source widened -- fails here rather than shipping.
    const withoutTurnstile = auth
      .split(TURNSTILE_ORIGIN)
      .join("")
      .replace(/\s+/g, " ")
      .replace(/\s+;/g, ";")
      .trim();
    expect(withoutTurnstile).toBe(base);
  });

  it("every auth route is served the Turnstile policy", async () => {
    const [base, auth] = await rules();
    for (const path of AUTH_PATHS) {
      expect(matches(AUTH_SOURCE, path), `${path} must match the auth source`).toBe(true);
      expect(matches(BASE_SOURCE, path), `${path} must NOT also match the base source`).toBe(false);
    }
    expect(cspOf(auth)).toContain(TURNSTILE_ORIGIN);
    expect(cspOf(base)).not.toContain(TURNSTILE_ORIGIN);
  });

  it("no product route is served the Turnstile policy", async () => {
    for (const path of PRODUCT_PATHS) {
      expect(matches(BASE_SOURCE, path), `${path} must match the base source`).toBe(true);
      expect(matches(AUTH_SOURCE, path), `${path} must NOT match the auth source`).toBe(false);
    }
  });

  it("every route matches exactly one source, never two and never zero", async () => {
    // Two would mean the browser intersects the policies and the looser one is
    // a no-op -- the exact trap this fix exists to avoid. Zero would mean a
    // route with no CSP at all, which is worse than the bug being fixed.
    for (const path of [...AUTH_PATHS, ...PRODUCT_PATHS]) {
      const hits = [BASE_SOURCE, AUTH_SOURCE].filter((source) => matches(source, path));
      expect(hits.length, `${path} matched ${hits.length} sources`).toBe(1);
    }
  });

  it("keeps the shared hardening headers on both rules", async () => {
    for (const rule of await rules()) {
      const keys = rule.headers.map((h) => h.key);
      expect(keys).toContain("X-Content-Type-Options");
      expect(keys).toContain("X-Frame-Options");
      expect(keys).toContain("Referrer-Policy");
      expect(keys).toContain("Permissions-Policy");
      expect(keys).toContain("Content-Security-Policy");
    }
  });
});
