/**
 * Are the deployed Edge Functions the ones in this repository?
 *
 * Migrations have a parity check — `AUTHORIZED_MIGRATION_HEAD`, a chain, and a
 * hosted readback. Edge Functions had none, and on 2026-08-06 that cost a real
 * account: `delete-account` was deployed once on 2026-08-04 and never again,
 * while migration `202608050077` revoked the grant its deployed code depended
 * on. From that moment every account deletion stopped at `credential_not_erased`
 * and stayed `deleting` **forever**, because nothing re-runs the executor.
 *
 * The repository had already been fixed the same day the migration landed. The
 * commit and the deploy were simply two different acts, and only one of them
 * happened. Nothing could see the gap — which is what this closes.
 *
 * ## What it compares, and why that is the honest comparison
 *
 * The deployed function's `updated_at` against the newest commit touching its
 * **deployable** source — `.ts` and `.json`, never tests or markdown, because a
 * fixture edit changes nothing that runs. Not a content hash: the deployment
 * bundles and transforms
 * the source, so a hash comparison would need to reproduce the platform's build
 * exactly and would drift into false alarms. Timestamps answer the question
 * that actually matters — *is the deployment older than the code?* — and the
 * failure they can produce is a redeploy nobody needed, never a stall nobody
 * noticed.
 *
 * The comparison itself now lives in `edge-function-parity.mjs`, because
 * `2H-DEADMAN-004` requires the same answer to be readable beside scheduled-job
 * liveness in the operator health surface. This file stays the operator's
 * command and the CI-shaped gate; it is the only one of the two that exits
 * non-zero.
 *
 * Read-only. It deploys nothing; a redeploy is an operator action, and the
 * command to run is printed rather than executed.
 *
 * Usage: `npm run verify:edge-parity`
 */

import { readEdgeFunctionParity } from "./edge-function-parity.mjs";

function stamp(ms) {
  return ms === null ? "(never)" : new Date(ms).toISOString().slice(0, 16);
}

function main() {
  const rows = readEdgeFunctionParity();
  let stale = 0;

  console.log("function          deployed              last commit           state");
  for (const row of rows) {
    if (row.state === "orphan") {
      console.log(`${row.slug.padEnd(17)} deployed with no source in this repository — ORPHAN`);
      stale += 1;
      continue;
    }

    const state = row.state === "undeployed_by_design"
      ? "not deployed, by design"
      : row.state === "not_deployed"
        ? "NOT DEPLOYED"
        : row.state === "stale"
          ? "STALE"
          : "ok";
    const suffix = row.status && row.status !== "ACTIVE" ? ` (${row.status})` : "";
    console.log(
      `${row.slug.padEnd(17)} ${stamp(row.deployedAt).padEnd(21)} `
      + `${stamp(row.committedAt).padEnd(21)} ${state}${suffix}`,
    );
    if (row.reason) console.log(`  ${row.reason}`);
    if (row.state === "stale" || row.state === "not_deployed") {
      stale += 1;
      if (row.undeployedCommit) console.log(`  undeployed: ${row.undeployedCommit}`);
    }
  }

  if (stale > 0) {
    console.error(
      `\n${stale} function(s) out of parity. A migration that changes a contract an Edge`
      + "\nFunction depends on is only half-deployed until the function is redeployed:"
      + "\n  npx supabase functions deploy <slug>"
      + "\nDeploying is an operator action and is deliberately not performed here.",
    );
    process.exitCode = 1;
    return;
  }
  console.log("\nevery deployed function is at or ahead of its source");
}

main();
