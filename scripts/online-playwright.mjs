import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

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
    ONLINE_SUPABASE_URL: credentials.url,
    ONLINE_SUPABASE_PUBLISHABLE_KEY: credentials.publishableKey,
    ONLINE_SUPABASE_SERVICE_ROLE_KEY: credentials.serviceRoleKey,
  },
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
