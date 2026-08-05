#!/usr/bin/env node
/**
 * SH-SIGNUP-007 — the hosted password policy, verified behaviourally.
 *
 * ## Why a readback is not enough
 *
 * `password_min_length = 12` in the configuration says what the dashboard was
 * told. It does not say what GoTrue *does* when a caller skips the form. The
 * gap this requirement closes is precisely that the Zod schema guards the
 * Server Actions and the Server Actions are not the only door: an authenticated
 * caller reaching `PUT /auth/v1/user` is validated by GoTrue alone.
 *
 * ## How a session is obtained without touching a real account
 *
 * A disposable account is admin-created (the SH-GD.3 strategy, the same one the
 * `online-*` journeys use), then `admin/generate_link` mints a recovery link
 * and `/verify` exchanges it for a session. That path is deliberate:
 * `signInWithPassword` is CAPTCHA-protected now and no automated browser can
 * mint a Turnstile token, so signing in is not available to this script. Token
 * *verification* is not CAPTCHA-protected — it is the second leg of a flow whose
 * first leg already was.
 *
 * ## Safety
 *
 * - The owner's account is never touched. The probe refuses to run against any
 *   address it did not create in this process.
 * - The disposable account is deleted in a `finally`, so a failure mid-probe
 *   still leaves no account in an unknown state.
 * - No password is printed, ever — only the length class and the verdict.
 *
 * Usage: node scripts/sh5-password-policy-probe.mjs
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const REPO = new URL("..", import.meta.url);
const env = Object.fromEntries(
  readFileSync(new URL(".env.local", REPO), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const { getLinkedSupabaseCredentials } = await import(new URL("scripts/linked-supabase.mjs", REPO).href);
const credentials = getLinkedSupabaseCredentials();
const service = credentials.serviceRoleKey ?? credentials.serviceKey ?? credentials.secretKey;
if (!url || !anon || !service) {
  console.error("Supabase URL, anon key and service-role key are all required.");
  process.exit(2);
}

const adminHeaders = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
const anonHeaders = { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" };

/**
 * Passwords used by this probe. Never printed.
 *
 * `WEAK` is eleven lowercase letters plus a digit: it satisfies the OLD hosted
 * policy (six characters, no class requirement) and violates the NEW one on
 * both counts that matter — it is under twelve and it has no upper case and no
 * symbol. That is what makes it the right negative case: it is not garbage, it
 * is exactly what the previous configuration would have accepted.
 */
const WEAK = `abcdefghijk${randomBytes(2).toString("hex")}`.slice(0, 11) + "1";
const STRONG = `Sh5-Policy-${randomBytes(6).toString("hex")}!Aa1`;

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
};

const disposable = `sh5-pwpolicy-${randomBytes(6).toString("hex")}@example.invalid`;
let userId = null;

try {
  // -- create the disposable account ---------------------------------------
  const created = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ email: disposable, password: STRONG, email_confirm: true }),
  });
  const createdBody = await created.json();
  userId = createdBody.id ?? null;
  if (!userId) {
    throw new Error(
      `could not create the disposable account: HTTP ${created.status} ` +
        JSON.stringify(createdBody).slice(0, 200),
    );
  }
  console.log(`disposable account created: ${disposable.slice(0, 14)}...  id=${userId.slice(0, 8)}...\n`);

  // -- a session, without signing in (sign-in needs a CAPTCHA token) --------
  const link = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ type: "recovery", email: disposable }),
  }).then((r) => r.json());

  // `generate_link` returns the hashed token directly, and the endpoint that
  // accepts it is `token_hash` -- NOT `token` + `email`, which is the raw-OTP
  // shape and answers `otp_expired` for a hash it cannot match.
  const hashedToken = link.hashed_token
    ?? new URL(link.action_link ?? `${url}/?token=`).searchParams.get("token");
  const verified = await fetch(`${url}/auth/v1/verify`, {
    method: "POST",
    headers: anonHeaders,
    body: JSON.stringify({ type: "recovery", token_hash: hashedToken }),
  });
  const session = await verified.json();
  const accessToken = session.access_token;
  record(
    "a session is obtainable for the disposable account",
    Boolean(accessToken),
    accessToken
      ? "recovery token exchanged for a session"
      : `HTTP ${verified.status} ${JSON.stringify(session).slice(0, 160)}`,
  );
  // Deliberately NOT `process.exit` -- that terminates immediately and skips the
  // `finally`, which is how the first run of this script left a disposable
  // account behind. Throwing unwinds through the cleanup.
  if (!accessToken) throw new Error("no session; cannot exercise the policy");

  const asUser = {
    apikey: anon,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const changePassword = async (password) => {
    const response = await fetch(`${url}/auth/v1/user`, {
      method: "PUT",
      headers: asUser,
      body: JSON.stringify({ password }),
    });
    const text = await response.text();
    let parsed = {};
    try { parsed = JSON.parse(text); } catch { /* non-JSON */ }
    return {
      status: response.status,
      code: parsed.error_code ?? parsed.code ?? "",
      message: parsed.msg ?? parsed.message ?? "",
    };
  };

  // -- 1. the weak password the OLD policy would have accepted --------------
  const weak = await changePassword(WEAK);
  const weakRefused = weak.status >= 400;
  record(
    "a password the OLD hosted policy allowed is now REFUSED by GoTrue",
    weakRefused,
    `HTTP ${weak.status} ${weak.code || weak.message}` +
      `\n      (12 chars minimum and four classes; the candidate had neither)`,
  );

  // -- 2. a compliant password reaches the normal path ---------------------
  const strong = await changePassword(STRONG + "z");
  record(
    "a policy-compliant password reaches the normal validation path",
    strong.status === 200,
    `HTTP ${strong.status} ${strong.code || strong.message || "(accepted)"}`,
  );

  // -- 3. the refusal is the POLICY, not something else ---------------------
  record(
    "the refusal names the password policy rather than a generic failure",
    /password|weak|character|length/i.test(`${weak.code} ${weak.message}`),
    `code=${weak.code || "(none)"} message=${weak.message || "(none)"}`,
  );

  // -- 4. direct API cannot downgrade below the declared policy -------------
  // The same weak value, retried after a successful compliant change, so the
  // refusal cannot be explained by session state or by ordering.
  const weakAgain = await changePassword(WEAK);
  record(
    "direct Auth API usage cannot downgrade below the declared policy",
    weakAgain.status >= 400,
    `HTTP ${weakAgain.status} ${weakAgain.code || weakAgain.message} (retried after a compliant change)`,
  );
} finally {
  if (userId) {
    const deleted = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: adminHeaders,
    });
    const gone = await fetch(`${url}/auth/v1/admin/users/${userId}`, { headers: adminHeaders });
    console.log(
      `\ncleanup: delete HTTP ${deleted.status}; re-read HTTP ${gone.status} ` +
        `${gone.status === 404 ? "(gone)" : "(STILL PRESENT -- investigate)"}`,
    );
    results.push({ name: "the disposable account is removed", pass: gone.status === 404 });
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
