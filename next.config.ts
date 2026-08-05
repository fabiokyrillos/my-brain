import type { NextConfig } from "next";

/**
 * The Content Security Policy, in two variants (SH-CAPTCHA-004).
 *
 * ## Why two, and why the sources must not overlap
 *
 * The Turnstile widget loads a script from Cloudflare, and the product routes
 * have no business permitting that origin. The obvious implementation — one
 * global policy plus a second, looser one for `/auth` — **does not work**, and
 * failing to know that is how this ends up looking configured while being
 * broken: when two `Content-Security-Policy` headers reach a browser, they are
 * enforced as an **intersection**, so the strict one would keep blocking
 * Cloudflare no matter what the second one allowed.
 *
 * So the two sources are mutually exclusive by construction: the base pattern
 * excludes the auth routes with a negative lookahead, and the auth pattern
 * matches exactly them. Every request gets exactly one policy, and
 * `csp.test.ts` asserts that in both directions — a route that somehow matched
 * neither would silently lose its CSP entirely, which is worse than the problem
 * this fixes.
 *
 * ## How this was found
 *
 * Not in review. The widget markup rendered on the deployed site, the site key
 * was present and correct, and every static check passed — but the script was
 * blocked by CSP, so Turnstile never injected its response input and no token
 * was ever produced. That failure is invisible while hosted CAPTCHA is off, and
 * the moment it is switched on it becomes "every sign-in is refused for a
 * missing token", locking out every account including the owner's. It was
 * caught by loading the real page in a real browser and reading the console.
 */

const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

function contentSecurityPolicy({ turnstile }: { turnstile: boolean }) {
  const script = ["'self'", "'unsafe-inline'", "'unsafe-eval'"];
  const connect = [
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "http://127.0.0.1:54321",
  ];
  // `frame-src` rather than `child-src`: the widget renders inside an iframe,
  // and without this the script loads and then has nowhere to draw.
  const frame = ["'self'"];

  if (turnstile) {
    script.push(TURNSTILE_ORIGIN);
    frame.push(TURNSTILE_ORIGIN);
    connect.push(TURNSTILE_ORIGIN);
  }

  return [
    "default-src 'self'",
    `script-src ${script.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connect.join(" ")}`,
    `frame-src ${frame.join(" ")}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

const sharedHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** Everything that is NOT an auth route. */
export const BASE_SOURCE = "/((?!pt-BR/auth|en/auth).*)";
/** Exactly the auth routes, both locales. */
export const AUTH_SOURCE = "/:locale(pt-BR|en)/auth/:path*";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: BASE_SOURCE,
        headers: [
          ...sharedHeaders,
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy({ turnstile: false }),
          },
        ],
      },
      {
        source: AUTH_SOURCE,
        headers: [
          ...sharedHeaders,
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy({ turnstile: true }),
          },
        ],
      },
    ];
  },
};

export { contentSecurityPolicy, TURNSTILE_ORIGIN };
export default nextConfig;
