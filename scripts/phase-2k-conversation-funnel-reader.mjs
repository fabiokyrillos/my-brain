/**
 * Phase 2K slice 2K.8 — the Conversar funnel's runner (`2K-METRICS-007`).
 *
 *   node scripts/phase-2k-conversation-funnel-reader.mjs --email … --password …
 *   node scripts/phase-2k-conversation-funnel-reader.mjs --access-token …
 *
 * ## Two corrections, found while proving Phase 2M's reader and applied here
 *
 * This file carried both defects and neither had ever fired, because a manual
 * script that is never run reports nothing at all:
 *
 *   1. it selected, filtered and ordered by `occurred_at`, and
 *      `public.product_events` **has no such column** — its only timestamp is
 *      `created_at` (`202607170024:51`). Every invocation would have died on
 *      *"column product_events.occurred_at does not exist"*; and
 *   2. it signed in with `grant_type=password`, which Turnstile has refused
 *      since Signup Hardening SH.5. `--access-token` is the way in that works.
 *
 * `2K-METRICS-007` requires a consumer that asks a question of the events. A
 * consumer that cannot execute is the failure that requirement exists to
 * prevent, one level up, so it is corrected rather than recorded.
 *
 * Reads one owner's Phase 2K events through **that owner's own authenticated
 * session** and prints the report. It **writes nothing**: measuring must not
 * perturb what is measured, so this records no product event and touches no row.
 *
 * Every read is authenticated, never service-role — the same rule Phase 2J's
 * reader follows, and for the same reason: a measurement path that could read
 * across owners is a measurement path that has to be trusted rather than
 * bounded. RLS does the bounding here.
 *
 * Exit codes follow the standing remote-script convention: 0 pass, 1 assertion
 * failure, 2 "the deployed chain cannot answer this yet". Exit 2 exists because
 * migration `202608090088` may not be deployed when this is first run, and a
 * reader that reported "zero events" in that case would be indistinguishable
 * from a quiet week — which is exactly the confusion `2K-METRICS-007` is about.
 */

import { createClient } from "@supabase/supabase-js";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";
import {
  PHASE_2K_EVENT_NAMES,
  aggregateConversationFunnel,
  formatConversationFunnel,
} from "./phase-2k-conversation-funnel.mjs";

const DEFAULT_WINDOW_DAYS = 14;
const PAGE_SIZE = 1000;

function parseArgs(argv) {
  const args = { windowDays: DEFAULT_WINDOW_DAYS };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--email") args.email = argv[++index];
    else if (flag === "--password") args.password = argv[++index];
    else if (flag === "--access-token") args.accessToken = argv[++index];
    else if (flag === "--days") args.windowDays = Number(argv[++index]);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const hasPassword = Boolean(args.email && args.password);
  if (!hasPassword && !args.accessToken) {
    console.error("usage: --access-token <jwt> | --email <address> --password <password> [--days N]");
    console.error("this project enforces Turnstile, so the password path answers captcha_failed");
    process.exit(1);
  }
  if (!Number.isFinite(args.windowDays) || args.windowDays <= 0) {
    console.error("--days must be a positive number");
    process.exit(1);
  }

  /*
   * `publishableKey`, not `anonKey`. `getLinkedSupabaseCredentials` returns a
   * publishable key under that exact name and has never returned an
   * `anonKey`, so this destructure produced `undefined` and `createClient`
   * threw *"supabaseKey is required"* before a single row was read. **The
   * THIRD defect in this file, and the third that had never fired**, because
   * the two above were also only reachable by running it -- which nothing did
   * until Phase 2M slice 2M.2 discharged the obligation to run it once.
   */
  const { url, publishableKey } = await getLinkedSupabaseCredentials();
  const client = createClient(url, publishableKey, {
    auth: { persistSession: false },
    ...(args.accessToken
      ? { global: { headers: { Authorization: `Bearer ${args.accessToken}` } } }
      : {}),
  });

  if (hasPassword) {
    const signIn = await client.auth.signInWithPassword({
      email: args.email,
      password: args.password,
    });
    if (signIn.error) {
      console.error(`sign-in failed: ${signIn.error.message}`);
      if (signIn.error.message?.includes("captcha")) {
        console.error("use --access-token: Turnstile refuses grant_type=password from a script");
      }
      process.exit(1);
    }
  }

  const since = new Date(Date.now() - args.windowDays * 24 * 60 * 60 * 1000).toISOString();
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await client
      .from("product_events")
      .select("event_name,properties,created_at")
      .in("event_name", PHASE_2K_EVENT_NAMES)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (page.error) {
      // A vocabulary the deployed database does not know yet is exit 2, not a
      // failure and not an empty report.
      if (/event_name/i.test(page.error.message ?? "")) {
        console.error("the deployed chain does not know the Phase 2K event vocabulary yet");
        process.exit(2);
      }
      console.error(`read failed: ${page.error.message}`);
      process.exit(1);
    }
    rows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < PAGE_SIZE) break;
  }

  const summary = aggregateConversationFunnel(rows);
  console.log(`Phase 2K Conversar funnel — last ${args.windowDays} days`);
  console.log("");
  console.log(formatConversationFunnel(summary));

  if (summary.considered === 0) {
    // Said out loud rather than printed as zeros. "Nobody used it" and "the
    // producer is broken" look identical in a table of noughts, and SH.6's
    // defect was invisible for exactly that reason.
    console.log("");
    console.log("No Phase 2K events in this window. That is either a quiet period or a broken");
    console.log("producer -- this reader cannot tell you which, and you should open one thread.");
  }

  if (hasPassword) await client.auth.signOut();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
