/**
 * Non-destructive hosted verification of the account-deletion challenge.
 *
 * The defect this checks for was invisible to every static gate: the widget
 * markup can be perfect, the site key present and correct, and the script still
 * blocked by a Content-Security-Policy the page never mentions — which produces
 * no token, which the provider then refuses, which the surface reported as a
 * wrong password. That is exactly how the Turnstile rollout failed once already
 * (`next.config.ts` records it), and static checks passed the whole time.
 *
 * So this reads the **deployed response**: the headers a browser would enforce
 * and the HTML a browser would parse. It deletes nothing, submits nothing, and
 * touches no real account.
 *
 * Usage: `npm run verify:deletion-captcha`
 *        `npm run verify:deletion-captcha -- https://some-other-origin`
 */

import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
const DEFAULT_ORIGIN = "https://my-brain-dusky.vercel.app";

/** Anything shaped like a Turnstile *secret*. A site key is `0x…`; secrets are `0x…` too — so the test is length and context, not prefix alone. */
const SECRET_SHAPED = /0x[0-9A-Za-z_-]{30,}/g;

function ok(label, passed, detail = "") {
  console.log(`  ${passed ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  return passed;
}

/** A session cookie for a disposable account, minted the way the e2e fixture does. */
async function disposableSession({ url, publishableKey, serviceRoleKey }, email) {
  const admin = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  };
  const created = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: admin,
    body: JSON.stringify({ email, email_confirm: true }),
  });
  const createdBody = await created.text();
  if (!created.ok) throw new Error(`admin create failed: ${created.status} ${createdBody.slice(0, 200)}`);
  const userId = JSON.parse(createdBody).id;

  const generated = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: admin,
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const generatedBody = await generated.text();
  if (!generated.ok) throw new Error(`generate_link failed: ${generated.status}`);
  const { email_otp: emailOtp } = JSON.parse(generatedBody);

  const verified = await fetch(`${url}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email, token: emailOtp }),
  });
  const verifiedBody = await verified.text();
  if (!verified.ok) throw new Error(`verify failed: ${verified.status}`);
  const session = JSON.parse(verifiedBody);

  const ref = new URL(url).hostname.split(".")[0];
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(
    JSON.stringify(session),
    "utf8",
  ).toString("base64url")}`;
  return { userId, cookie, accessToken: session.access_token };
}

async function main() {
  const origin = (process.argv[2] ?? DEFAULT_ORIGIN).replace(/\/$/, "");
  const credentials = getLinkedSupabaseCredentials();
  console.log(`deployed origin : ${origin}`);

  const email = `codex-deletion-captcha-${crypto.randomUUID()}@example.com`;
  let userId;
  let passed = true;

  try {
    const session = await disposableSession(credentials, email);
    userId = session.userId;

    // The consent gate would otherwise interpose before the deletion surface.
    // Recorded through the product's own RPC, as the interposition surface does.
    for (const document of ["terms", "privacy"]) {
      const response = await fetch(`${credentials.url}/rest/v1/rpc/record_policy_acceptance`, {
        method: "POST",
        headers: {
          apikey: credentials.publishableKey,
          authorization: `Bearer ${session.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ p_document: document, p_surface: "interposition" }),
      });
      if (!response.ok) throw new Error(`consent RPC failed: ${response.status}`);
    }

    const target = `${origin}/pt-BR/account/delete`;
    const response = await fetch(target, {
      headers: { cookie: session.cookie },
      redirect: "manual",
    });
    const html = await response.text();

    console.log("\nthe deployed account-deletion surface");
    passed = ok("reachable while authenticated", response.status === 200, `status ${response.status}`) && passed;

    // A browser enforces the INTERSECTION of every CSP header it receives, so
    // one is not a detail: two would silently re-block Cloudflare.
    const csp = response.headers.get("content-security-policy") ?? "";
    // `fetch` joins repeated headers with ", ", so a second policy shows up as a
    // second `default-src` inside one string. Counting the directive is the
    // reliable read; counting header entries is not.
    const policies = (csp.match(/default-src/g) ?? []).length;
    passed = ok("carries exactly one Content-Security-Policy", policies === 1, `${policies} policy/policies`) && passed;
    passed = ok("its script-src permits the widget origin", /script-src[^;]*challenges\.cloudflare\.com/.test(csp)) && passed;
    passed = ok("its frame-src permits it too", /frame-src[^;]*challenges\.cloudflare\.com/.test(csp)) && passed;
    passed = ok("its connect-src permits it too", /connect-src[^;]*challenges\.cloudflare\.com/.test(csp)) && passed;

    console.log("\nthe widget itself");
    passed = ok("the page renders the Turnstile container", html.includes("cf-turnstile")) && passed;
    passed = ok("the response field is the one the action reads", html.includes("captchaToken")) && passed;
    passed = ok("it loads the script from Cloudflare", html.includes(TURNSTILE_ORIGIN)) && passed;
    const siteKey = /data-sitekey="([^"]+)"/.exec(html)?.[1];
    passed = ok("a site key is present", Boolean(siteKey), siteKey ? `${siteKey.slice(0, 6)}… (${siteKey.length} chars)` : "absent") && passed;

    console.log("\nnothing secret is exposed");
    // The site key is public by definition; anything ELSE key-shaped in the
    // document is what this is looking for.
    const keyShaped = [...new Set(html.match(SECRET_SHAPED) ?? [])].filter((value) => value !== siteKey);
    passed = ok("no second key-shaped value in the document", keyShaped.length === 0, keyShaped.length ? `${keyShaped.length} found` : "") && passed;
    passed = ok("no secret variable name reaches the page", !/TURNSTILE_SECRET|CAPTCHA_SECRET|secret_?key/i.test(html)) && passed;

    console.log("\nthe controls are still there");
    passed = ok('the confirmation input', html.includes('name="confirmation"')) && passed;
    passed = ok("the password input", html.includes('name="password"')) && passed;
  } finally {
    if (userId) {
      const deleted = await fetch(`${credentials.url}/auth/v1/admin/users/${userId}`, {
        method: "DELETE",
        headers: {
          apikey: credentials.serviceRoleKey,
          authorization: `Bearer ${credentials.serviceRoleKey}`,
        },
      });
      console.log(`\ndisposable account removed : ${deleted.ok}`);
      if (!deleted.ok) passed = false;
    }
  }

  if (!passed) {
    console.error("\nThe deployed deletion surface cannot complete a challenge.");
    process.exitCode = 1;
    return;
  }
  console.log("\nall checks passed — nothing was deleted and no real account was touched");
}

await main();
