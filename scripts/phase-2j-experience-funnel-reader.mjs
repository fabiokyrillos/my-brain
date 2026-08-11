/**
 * Phase 2J slice 2J.7 — the experience funnel's runner (`2J-METRICS-007`).
 *
 *   node scripts/phase-2j-experience-funnel-reader.mjs --email … --password …
 *
 * Reads one owner's Phase 2J events through **that owner's own authenticated
 * session** and prints the report. It **writes nothing**: measuring must not
 * perturb what is measured, so this records no product event and touches no row.
 *
 * Every read is authenticated, never service-role — the same rule Phase 2F's
 * reader follows, and for the same reason: a measurement path that could read
 * across owners is a measurement path that has to be trusted rather than
 * bounded. RLS does the bounding here.
 *
 * Exit codes follow the standing remote-script convention: 0 pass, 1 assertion
 * failure, 2 "the deployed chain cannot answer this yet". Exit 2 exists because
 * migration `202608080086` may not be deployed when this is first run, and a
 * reader that reported "zero events" in that case would be indistinguishable
 * from a quiet week — which is exactly the confusion `2J-METRICS-007` is about.
 */

import { createClient } from "@supabase/supabase-js";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";
import {
  PHASE_2J_EVENT_NAMES,
  aggregateExperienceFunnel,
  formatExperienceFunnel,
} from "./phase-2j-experience-funnel.mjs";

const DEFAULT_WINDOW_DAYS = 14;
const PAGE_SIZE = 1000;

function parseArgs(argv) {
  const args = { windowDays: DEFAULT_WINDOW_DAYS };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--email") args.email = argv[++index];
    else if (flag === "--password") args.password = argv[++index];
    else if (flag === "--days") args.windowDays = Number(argv[++index]);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.email || !args.password) {
    console.error("usage: --email <address> --password <password> [--days N]");
    process.exit(1);
  }
  if (!Number.isFinite(args.windowDays) || args.windowDays <= 0) {
    console.error("--days must be a positive number");
    process.exit(1);
  }

  // `publishableKey`, not `anonKey` -- the same defect Phase 2K's reader
  // carried, found by running that one. `getLinkedSupabaseCredentials` has
  // never returned an `anonKey`, so every invocation of this file died on
  // "supabaseKey is required" before reading a row.
  const { url, publishableKey } = await getLinkedSupabaseCredentials();
  const client = createClient(url, publishableKey, { auth: { persistSession: false } });

  const signIn = await client.auth.signInWithPassword({
    email: args.email,
    password: args.password,
  });
  if (signIn.error) {
    console.error(`sign-in failed: ${signIn.error.message}`);
    process.exit(1);
  }

  const since = new Date(Date.now() - args.windowDays * 24 * 60 * 60 * 1000).toISOString();
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await client
      .from("product_events")
      .select("event_name,properties,occurred_at")
      .in("event_name", PHASE_2J_EVENT_NAMES)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (page.error) {
      // A vocabulary the deployed database does not know yet is exit 2, not a
      // failure and not an empty report.
      if (/event_name/i.test(page.error.message ?? "")) {
        console.error("the deployed chain does not know the Phase 2J event vocabulary yet");
        process.exit(2);
      }
      console.error(`read failed: ${page.error.message}`);
      process.exit(1);
    }
    rows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < PAGE_SIZE) break;
  }

  const summary = aggregateExperienceFunnel(rows);
  console.log(`Phase 2J experience funnel — last ${args.windowDays} days`);
  console.log("");
  console.log(formatExperienceFunnel(summary));

  if (summary.considered === 0) {
    // Said out loud rather than printed as zeros. "Nobody used it" and "the
    // producer is broken" look identical in a table of noughts, and SH.6's
    // defect was invisible for exactly that reason.
    console.log("");
    console.log("No Phase 2J events in this window. That is either a quiet period or a broken");
    console.log("producer -- this reader cannot tell you which, and you should check one capture.");
  }

  await client.auth.signOut();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
