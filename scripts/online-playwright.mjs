import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

/**
 * The two disposable BYOK product credentials, read from `.env.local` and
 * handed to the runner as environment.
 *
 * They live in `.env.local` and nowhere else: not in `.env.example`, not in CI,
 * not in any tracked file. This reads them here rather than in a spec so the
 * BYOK acceptance lane stays a lane — a spec that reached into the repository
 * for a secret would work locally and mean nothing about how the product gets
 * one. Absent names are simply not forwarded, and the spec skips itself.
 */
const DISPOSABLE_CREDENTIAL_NAMES = [
  "BYOK_TEST_USER_A_OPENAI_API_KEY",
  "BYOK_TEST_USER_B_OPENAI_API_KEY",
  /*
    The owner's own test account, forwarded for the lanes that need a session
    over *real* data rather than over a disposable account seeded with nothing.
    The redesign's visual lane is one: an empty surface renders every layout
    correctly, so a screenshot of one proves nothing about the composition.

    Same rule as the two above — read from `.env.local`, never from a tracked
    file, and simply not forwarded when absent, so the spec skips itself.
  */
  "ONLINE_AUTH_TEST_EMAIL",
];

function disposableCredentials() {
  let file;
  try {
    file = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    return {};
  }

  const found = {};
  for (const line of file.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match || !DISPOSABLE_CREDENTIAL_NAMES.includes(match[1])) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    if (value !== "") found[match[1]] = value;
  }
  return found;
}

const credentials = getLinkedSupabaseCredentials();
const playwrightCli = fileURLToPath(
  new URL("../node_modules/@playwright/test/cli.js", import.meta.url),
);
const result = spawnSync(process.execPath, [
  playwrightCli,
  "test",
  ...process.argv.slice(2),
], {
  stdio: "inherit",
  env: {
    ...process.env,
    ...disposableCredentials(),
    ONLINE_SUPABASE_URL: credentials.url,
    ONLINE_SUPABASE_PUBLISHABLE_KEY: credentials.publishableKey,
    ONLINE_SUPABASE_SERVICE_ROLE_KEY: credentials.serviceRoleKey,
  },
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
