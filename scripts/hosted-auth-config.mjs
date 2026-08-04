#!/usr/bin/env node
/**
 * The hosted Auth configuration readback and targeted update (SH-GD.1,
 * SH-ORIGIN-001).
 *
 * ## Why this exists instead of `supabase config push`
 *
 * `config push` sends the whole `[auth]` block. The live readback returns **242
 * fields** — MFA, SAML, every OAuth provider, session timeboxes — most of which
 * `config.toml` does not mention and this initiative has no opinion about.
 * Pushing would set all of them, so a change to two settings would silently
 * become a change to everything, and "no unrelated hosted setting regressed"
 * would be a hope rather than a claim.
 *
 * This sends a PATCH containing only the fields
 * `src/features/auth/hosted-auth-posture.ts` names, then **re-reads the whole
 * configuration and diffs it against the pre-change snapshot**. Anything that
 * moved and was not intended is printed as a regression. That turns the safety
 * requirement into a postcondition instead of a promise.
 *
 * ## It never prints the token
 *
 * `SUPABASE_ACCESS_TOKEN` is read from the environment or `.env.local` and used
 * only as a bearer header. Every value whose FIELD NAME looks like a credential
 * is reduced to a presence flag before anything is printed — applied to the
 * response, so a secret field added by the provider tomorrow is redacted by
 * default rather than by having been listed here.
 *
 * Usage:
 *   node scripts/hosted-auth-config.mjs                # readback only
 *   node scripts/hosted-auth-config.mjs --diff         # readback + intended delta
 *   node scripts/hosted-auth-config.mjs --apply        # apply, then prove the delta
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REPO = new URL("..", import.meta.url);

/** Names that must never have their value printed. */
const SECRETISH = /secret|password|key|token|dsn|credential/i;

export function redact(value, path = "") {
  if (value === null || typeof value !== "object") {
    // Booleans and numbers cannot carry a credential, and several fields this
    // readback exists to record are numbers whose names contain "password" or
    // "token" (`password_min_length`, `rate_limit_token_refresh`). Redacting
    // those would hide the very ceilings the application must sit below.
    if (typeof value !== "string") return value;
    return SECRETISH.test(path) && value !== "" ? "<redacted:present>" : value;
  }
  if (Array.isArray(value)) return value.map((item, index) => redact(item, `${path}[${index}]`));
  const out = {};
  for (const [key, inner] of Object.entries(value)) out[key] = redact(inner, `${path}.${key}`);
  return out;
}

/** Field-by-field difference between two readbacks. */
export function diffConfig(before, after) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const changes = [];
  for (const key of keys) {
    const from = JSON.stringify(before[key]);
    const to = JSON.stringify(after[key]);
    if (from !== to) changes.push({ key, from, to });
  }
  return changes;
}

/**
 * The intended posture, in plain JavaScript.
 *
 * `src/features/auth/hosted-auth-posture.ts` is the application-side statement
 * of the same thing, generated from `buildAuthCallbackUrl`. This file cannot
 * import it — a node script cannot load TypeScript — so the two are duplicated
 * and **pinned to each other** by `hosted-auth-parity.test.ts`, the same
 * arrangement `extraction-parity.test.ts` uses for the worker's copy of the
 * extraction schema. Duplication that a test forbids from drifting is the
 * established answer here; duplication nothing checks is how the callback list
 * and the app disagree six weeks from now.
 */
export const PRODUCTION_ORIGIN = "https://my-brain-dusky.vercel.app";
export const DEVELOPMENT_ORIGIN = "http://localhost:3000";
const LOCALES = ["pt-BR", "en"];

export function redirectAllowList(origins = [PRODUCTION_ORIGIN, DEVELOPMENT_ORIGIN]) {
  const urls = new Set();
  for (const origin of origins) {
    for (const locale of LOCALES) {
      urls.add(new URL(`/${locale}/auth/callback`, origin).toString());
      for (const next of [`/${locale}/app`, `/${locale}/auth/reset`]) {
        const url = new URL(`/${locale}/auth/callback`, origin);
        url.searchParams.set("next", next);
        urls.add(url.toString());
      }
    }
  }
  return [...urls].sort();
}

export const INTENDED_HOSTED_AUTH = {
  site_url: PRODUCTION_ORIGIN,
  uri_allow_list: redirectAllowList().join(","),
  disable_signup: true,
  external_email_enabled: true,
  mailer_autoconfirm: false,
  external_anonymous_users_enabled: false,
};

function accessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  try {
    const text = readFileSync(new URL(".env.local", REPO), "utf8");
    const match = /^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.*)$/m.exec(text);
    return match ? match[1].trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

async function main() {
  const token = accessToken();
  if (!token) {
    console.error("SUPABASE_ACCESS_TOKEN is unavailable (environment or .env.local).");
    process.exitCode = 1;
    return;
  }
  const ref = readFileSync(new URL("supabase/.temp/project-ref", REPO), "utf8").trim();
  const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
  const headers = { Authorization: `Bearer ${token}`, "content-type": "application/json" };

  const read = async () => {
    const response = await fetch(endpoint, { headers });
    if (!response.ok) throw new Error(`readback failed: HTTP ${response.status}`);
    return response.json();
  };

  const before = await read();
  const safeBefore = redact(before);

  console.log(`hosted auth config — project ${ref}`);
  console.log(`  fields returned: ${Object.keys(before).length}`);
  console.log("");
  for (const key of Object.keys(safeBefore).sort()) {
    console.log(`  ${key} = ${JSON.stringify(safeBefore[key])}`);
  }

  console.log("\n=== INTENDED DELTA ===");
  const pending = [];
  for (const [key, want] of Object.entries(INTENDED_HOSTED_AUTH)) {
    const have = before[key];
    const same = JSON.stringify(have) === JSON.stringify(want);
    console.log(`  ${same ? "ok  " : "CHANGE"} ${key}`);
    if (!same) {
      console.log(`        from ${JSON.stringify(have)}`);
      console.log(`        to   ${JSON.stringify(want)}`);
      pending.push(key);
    }
  }
  if (pending.length === 0) {
    console.log("\nHosted configuration already matches repository truth. Nothing to do.");
    return;
  }

  if (!process.argv.includes("--apply")) {
    console.log(`\nDRY RUN. Would PATCH ${pending.length} field(s): ${pending.join(", ")}`);
    console.log("Re-run with --apply to perform it.");
    return;
  }

  const response = await fetch(endpoint, {
    method: "PATCH",
    headers,
    body: JSON.stringify(INTENDED_HOSTED_AUTH),
  });
  if (!response.ok) {
    console.error(`\nPATCH failed: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
    process.exitCode = 1;
    return;
  }

  const after = await read();
  const changes = diffConfig(redact(before), redact(after));
  const intended = new Set(Object.keys(INTENDED_HOSTED_AUTH));
  const unintended = changes.filter((change) => !intended.has(change.key));

  console.log("\n=== APPLIED ===");
  for (const change of changes) {
    console.log(`  ${intended.has(change.key) ? "intended  " : "UNINTENDED"} ${change.key}`);
    console.log(`        from ${change.from}`);
    console.log(`        to   ${change.to}`);
  }
  console.log(`\nfields changed: ${changes.length} (unintended: ${unintended.length})`);

  for (const [key, want] of Object.entries(INTENDED_HOSTED_AUTH)) {
    if (JSON.stringify(after[key]) !== JSON.stringify(want)) {
      console.log(`POSTCONDITION FAILED — ${key} did not take the intended value`);
      process.exitCode = 1;
    }
  }
  if (unintended.length > 0) {
    console.log("POSTCONDITION FAILED — unrelated settings changed");
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
