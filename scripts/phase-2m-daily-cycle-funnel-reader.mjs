/**
 * Phase 2M slice 2M.1 — the daily-cycle funnel's runner (`2M-METRICS-003`).
 *
 *   node scripts/phase-2m-daily-cycle-funnel-reader.mjs --email … --password …
 *   node scripts/phase-2m-daily-cycle-funnel-reader.mjs --access-token …
 *
 * **Two ways in, because one of them does not work on this project.** Turnstile
 * has been enforced since Signup Hardening SH.5, so GoTrue answers
 * `captcha_failed` to `grant_type=password` from any caller that has not solved
 * a widget — which is every script. `--email/--password` is kept for an
 * environment without a CAPTCHA; `--access-token` takes a session the owner
 * already has (their browser's, or one minted by an operator script) and is the
 * path that works here.
 *
 * Neither path uses service-role. That is not an accident of convenience: a
 * measurement path that could read across owners would have to be trusted
 * rather than bounded, and RLS is what bounds this one. The proof harness that
 * *does* need admin — to create and destroy a disposable owner — is a separate
 * file, `phase-2m-daily-cycle-funnel-proof.mjs`, precisely so this one can be
 * asserted to contain no such client.
 *
 * Reads one owner's Phase 2M events through **that owner's own authenticated
 * session** and prints the report. It **writes nothing**: measuring must not
 * perturb what is measured, so this records no product event and touches no
 * row.
 *
 * Every read is authenticated, never service-role — the same rule Phase 2J's
 * and Phase 2K's readers follow, and for the same reason: a measurement path
 * that could read across owners is a measurement path that has to be trusted
 * rather than bounded. RLS does the bounding here.
 *
 * Exit codes follow the standing remote-script convention: 0 pass, 1 assertion
 * failure, 2 "the deployed chain cannot answer this yet". Exit 2 exists because
 * migration `202608110090` may not be deployed when this is first run, and a
 * reader that reported "zero events" in that case would be indistinguishable
 * from a quiet week — which is exactly the confusion `2M-METRICS-003` is about.
 *
 * **This reader lands with the migration and before any producer**, which is
 * `2M-METRICS-001`'s ordering. Until slices 2M.1–2M.4b ship their producers it
 * will legitimately report zeros, and it says so in words rather than printing
 * a table of noughts.
 */

import { createClient } from "@supabase/supabase-js";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";
import {
  PHASE_2M_EVENT_NAMES,
  aggregateDailyCycleFunnel,
  formatDailyCycleFunnel,
} from "./phase-2m-daily-cycle-funnel.mjs";

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

/**
 * Reads one owner's Phase 2M rows through an already-authenticated client.
 *
 * Exported so the proof harness reads through **this** function rather than
 * through a query of its own. A proof that issued its own `select` would be
 * proving a query nobody runs, which is the difference between a consumer and a
 * script that resembles one.
 */
export async function readDailyCycleRows(client, sinceIso) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await client
      .from("product_events")
      /*
       * `created_at`, not `occurred_at`.
       *
       * `product_events` has no `occurred_at`: the ledger's only timestamp is
       * `created_at timestamptz not null default now()` (`202607170024:51`), and
       * that is deliberate — the row is written at the moment the interaction
       * happens, so ingestion time IS fact time here.
       *
       * The first draft of this reader asked for `occurred_at` and PostgREST
       * answered *"column product_events.occurred_at does not exist"*, which is
       * how it was found. `phase-2k-conversation-funnel-reader.mjs` has the same
       * defect and is corrected in the same commit.
       */
      .select("event_name,properties,created_at")
      .in("event_name", PHASE_2M_EVENT_NAMES)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (page.error) {
      // A vocabulary the deployed database does not know yet is a distinct
      // outcome, not a failure and not an empty report.
      const error = new Error(page.error.message ?? "read failed");
      error.notDeployed = /event_name/i.test(page.error.message ?? "");
      throw error;
    }
    rows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < PAGE_SIZE) break;
  }
  return rows;
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

  const { url, anonKey } = await getLinkedSupabaseCredentials();
  const client = createClient(url, anonKey, {
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
  let rows;
  try {
    rows = await readDailyCycleRows(client, since);
  } catch (error) {
    if (error?.notDeployed) {
      console.error("the deployed chain does not know the Phase 2M event vocabulary yet");
      process.exit(2);
    }
    console.error(`read failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const summary = aggregateDailyCycleFunnel(rows);
  console.log(`Phase 2M daily-cycle funnel — last ${args.windowDays} days`);
  console.log("");
  console.log(formatDailyCycleFunnel(summary));

  if (summary.considered === 0) {
    // Said out loud rather than printed as zeros. "Nobody used it", "the
    // producer is broken" and "the producer does not exist yet" look identical
    // in a table of noughts, and SH.6's defect was invisible for exactly that
    // reason.
    console.log("");
    console.log("No Phase 2M events in this window. Before slices 2M.1 to 2M.4b ship their");
    console.log("producers that is the expected reading; after they ship it is either a quiet");
    console.log("period or a broken producer -- this reader cannot tell you which.");
  }

  if (hasPassword) await client.auth.signOut();
}

// Importable as a module by the proof harness, executable as a script by the
// owner. `import.meta.main` is the Node 22 answer to "am I the entry point".
if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
