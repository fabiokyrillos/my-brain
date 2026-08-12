/**
 * SH-DELETE-013 — the executor is the ONLY site holding deletion capability,
 * and the allowlist is compared in both directions.
 *
 * The two pre-existing guards (`phase-2f-cleanup.test.ts`,
 * `egc-operations.test.ts`) assert `deleteUser`'s absence from two specific
 * verifier scripts. This one asserts the wider property SH.2 introduces: the
 * capability now exists somewhere in the repository, and exactly one file may
 * hold it. A one-directional allowlist would let a second holder be added by
 * appending a line; comparing both directions means the allowlist cannot grow
 * silently and cannot go stale either.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = process.cwd();

/**
 * Every site holding deletion capability, classified.
 *
 * The census (FINDINGS §2) recorded the pre-SH.2 reality: `admin.deleteUser`
 * already appeared in e2e teardown and operator smoke scripts, and the two
 * older guards pin its absence from *product* code specifically. Listing those
 * nineteen here rather than excluding them by scan scope is the deliberate
 * choice: a guard that quietly skipped a directory would grow a blind spot
 * exactly where a future writer would put one. Each entry states its
 * classification, and the `product` class has exactly one member.
 *
 * Adding a `product` entry is an ADR-scoped decision (ADR-074 put the
 * capability outside `src/` on purpose), never a convenience.
 */
type CapabilityClass = "product" | "e2e-teardown" | "operator-script";

const DELETION_CAPABILITY_ALLOWLIST: Readonly<
  Record<string, { readonly class: CapabilityClass; readonly reason: string }>
> = {
  "supabase/functions/delete-account/executor.ts": {
    class: "product",
    reason:
      "ADR-074: the self-only, resumable deletion executor -- outside src/, authorized for the Bearer token's own account and no other",
  },
  "e2e/byok-isolation-and-rotation.spec.ts": { class: "e2e-teardown", reason: "pre-SH.2: disposable-account teardown" },
  "e2e/byok-removal-jobs-capture.spec.ts": { class: "e2e-teardown", reason: "pre-SH.2: disposable-account teardown" },
  "e2e/byok-settings-journey.spec.ts": { class: "e2e-teardown", reason: "pre-SH.2: disposable-account teardown" },
  "e2e/editable-candidate-confirmation.spec.ts": { class: "e2e-teardown", reason: "pre-SH.2: disposable-account teardown" },
  "e2e/online-auth.spec.ts": { class: "e2e-teardown", reason: "pre-SH.2: disposable-account teardown" },
  "e2e/deployed-deletion-captcha.spec.ts": {
    class: "e2e-teardown",
    reason:
      "the deletion-challenge hotfix's deployed verification: every case is a refusal, so nothing deletes the disposable account and this call is the only thing that does",
  },
  "e2e/online-account-deletion.spec.ts": {
    class: "e2e-teardown",
    reason:
      "SH.2 deployed acceptance: the journey provisions its own disposable account and the product deletes it; this call is the net for a run that failed before reaching that point",
  },
  "e2e/online-account-suspension.spec.ts": {
    class: "e2e-teardown",
    reason: "SH.3 deployed acceptance: disposable-account teardown after the reactivation evidence is captured",
  },
  "e2e/online-consent-interposition.spec.ts": {
    class: "e2e-teardown",
    reason: "SH.4 deployed acceptance: disposable-account teardown, one account per locale",
  },
  "scripts/local-task-command-creation-race.mjs": { class: "operator-script", reason: "pre-SH.2: fixture cleanup" },
  "scripts/phase-2f-command-funnel-reader.mjs": { class: "operator-script", reason: "pre-SH.2: fixture cleanup" },
  "scripts/phase-2f-gate3-exact-title-reuse.mjs": { class: "operator-script", reason: "pre-SH.2: fixture cleanup" },
  "scripts/remote-daily-cycle-smoke.mjs": { class: "operator-script", reason: "pre-SH.2: fixture cleanup" },
  "scripts/remote-editable-candidate-confirmation-smoke.mjs": { class: "operator-script", reason: "pre-SH.2: fixture cleanup" },
  "scripts/remote-entry-processing-smoke.mjs": { class: "operator-script", reason: "pre-SH.2: fixture cleanup" },
  "scripts/remote-interpretation-revisions-smoke.mjs": { class: "operator-script", reason: "pre-SH.2: fixture cleanup" },
  "scripts/remote-job-reliability-smoke.mjs": { class: "operator-script", reason: "pre-SH.2: fixture cleanup" },
  "scripts/remote-phase-2e-smoke.mjs": { class: "operator-script", reason: "pre-SH.2: fixture cleanup" },
  "scripts/remote-product-events-smoke.mjs": { class: "operator-script", reason: "pre-SH.2: fixture cleanup" },
  "scripts/remote-question-preview-smoke.mjs": { class: "operator-script", reason: "pre-SH.2: fixture cleanup" },
  "scripts/remote-question-reinterpretation-smoke.mjs": { class: "operator-script", reason: "pre-SH.2: fixture cleanup" },
  "scripts/remote-question-resolution-smoke.mjs": { class: "operator-script", reason: "pre-SH.2: fixture cleanup" },
  "scripts/remote-supabase-smoke.mjs": { class: "operator-script", reason: "pre-SH.2: fixture cleanup" },
  "scripts/phase-2h-deletion-reaper-race.mjs": {
    class: "operator-script",
    reason:
      "2H-RECOVER-001: teardown for the eight disposable accounts the concurrency proof creates in the LOCAL stack. It is worth noting what this entry means and what it does not: the reaper itself does not appear on this list, because reap.ts calls executeDeletion rather than deleteUser -- the capability stayed in exactly one place while gaining an automatic caller",
  },
  "scripts/phase-2h-rate-limit-race.mjs": {
    class: "operator-script",
    reason:
      "2H-RATE-004: teardown for the four disposable accounts the rate-limit concurrency proof creates in the LOCAL stack. The limiter itself holds no deletion capability at all -- rate_limit_events rows leave with the account by cascade, so nothing in 2H.3 needed one",
  },
  "scripts/phase-2m-daily-cycle-funnel-proof.mjs": {
    class: "operator-script",
    reason:
      "2M-METRICS-002/003: teardown for the two disposable owners the hosted funnel proof creates on the DEPLOYED project. The deletion is the proof of zero residue rather than an incidental cleanup: product_events grants service_role neither SELECT nor DELETE, so the rows cannot be counted or removed directly, and the only honest evidence that none survives is that no owner of them does. Nothing in the funnel path -- neither the reader nor the aggregation module -- holds this capability or any service-role client at all, which phase-2m-telemetry-guard.test.ts asserts separately",
  },
  "scripts/phase-2m-push-delivery-proof.mjs": {
    class: "operator-script",
    reason:
      "2M-NOTIFY-005/-009/-010/-011: teardown for the two disposable owners the hosted push proof creates on the DEPLOYED project. Signup is closed and must stay closed, so the owners are minted through the admin API and must be removed the same way; the deletion runs in a `finally` so a failed assertion cannot leave a live account behind. Unlike the funnel proof, the three push tables ARE readable here, so the run additionally reads each one owner-scoped after the delete and reports a table it could not read as residue NOT PROVED rather than as silence. Nothing on the push PRODUCT path holds this capability or a service-role client at all -- phase-2m-notification-boundary-guard.test.ts asserts that over the five delivery modules separately",
  },
};

/** Scanned roots. `docs/` is excluded: prose may name what code may not do. */
const SCAN_ROOTS = ["src", "scripts", "supabase/functions", "e2e"];
const SCANNED_EXTENSIONS = [".ts", ".tsx", ".mjs"];

const CAPABILITY_PATTERNS = [/auth\.admin\.deleteUser/, /admin\.deleteUser/];

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("--"))
    .join("\n");
}

function walk(directory: string, found: string[]): void {
  for (const entry of readdirSync(join(REPO, directory))) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const relative = `${directory}/${entry}`;
    if (statSync(join(REPO, relative)).isDirectory()) {
      walk(relative, found);
      continue;
    }
    if (SCANNED_EXTENSIONS.some((extension) => entry.endsWith(extension))) found.push(relative);
  }
}

function holdersOfDeletionCapability(): string[] {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) walk(root, files);

  return files
    .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
    .filter((file) => {
      const source = stripComments(readFileSync(join(REPO, file), "utf8"));
      return CAPABILITY_PATTERNS.some((pattern) => pattern.test(source));
    })
    .sort();
}

describe("SH-DELETE-013: deletion capability has exactly one home", () => {
  const holders = holdersOfDeletionCapability();
  const allowed = Object.keys(DELETION_CAPABILITY_ALLOWLIST).sort();

  it("every holder is on the allowlist", () => {
    for (const holder of holders) {
      expect(
        allowed,
        `${holder} can delete an account and is not an allowlisted site`,
      ).toContain(holder);
    }
  });

  it("every allowlisted site still holds the capability -- no stale entries", () => {
    for (const entry of allowed) {
      expect(holders, `${entry} is allowlisted but no longer deletes anything`).toContain(entry);
    }
  });

  it("exactly one PRODUCT site holds the capability, and it is the Edge Function", () => {
    const product = Object.entries(DELETION_CAPABILITY_ALLOWLIST)
      .filter(([, entry]) => entry.class === "product")
      .map(([file]) => file);
    expect(product).toEqual(["supabase/functions/delete-account/executor.ts"]);
  });

  it("no file under src/ holds the capability -- the ADR-074 boundary", () => {
    expect(holders.filter((file) => file.startsWith("src/"))).toEqual([]);
  });

  it("the non-product classes are the recorded census plus the SH.2-4 acceptance journeys", () => {
    // e2e teardown and operator scripts held this before SH.2 and are listed
    // rather than skipped. If one is ever deleted or a new one appears, the
    // both-directions assertions above name it.
    //
    // The three deployed-acceptance journeys added when SH.2-SH.4 were accepted
    // against the hosted project are counted separately from the pre-SH.2 five,
    // because "how many files hold this" is only a useful number if it is also
    // clear *why* it grew. Teardown is the honest class for them: each one
    // provisions its own disposable account and removes it, and none touches an
    // account it did not create.
    const byClass = (name: CapabilityClass) =>
      Object.entries(DELETION_CAPABILITY_ALLOWLIST).filter(([, entry]) => entry.class === name);

    const teardown = byClass("e2e-teardown").map(([file]) => file);
    const acceptanceJourneys = teardown.filter((file) =>
      /^e2e\/online-(account-deletion|account-suspension|consent-interposition)\.spec\.ts$/.test(file),
    );
    expect(acceptanceJourneys).toHaveLength(3);

    // Plus the deletion-challenge hotfix's deployed verification. Counted on
    // its own line rather than folded into the number above, for the same
    // reason the three are: a count that grows without saying why stops being
    // evidence of anything. Every case in that spec is a *refusal*, so the
    // product never deletes the disposable account and this call is the only
    // thing that removes it.
    const hotfixVerification = teardown.filter(
      (file) => file === "e2e/deployed-deletion-captcha.spec.ts",
    );
    expect(hotfixVerification).toHaveLength(1);

    expect(teardown).toHaveLength(5 + acceptanceJourneys.length + hotfixVerification.length);

    // The operator scripts split the same way, and for the same reason. Thirteen
    // pre-date SH.2 and clean up their own fixtures; the fourteenth is 2H.1's
    // concurrency proof, which creates eight disposable accounts in the LOCAL
    // stack to prove the reaper claims each exactly once, and removes them.
    //
    // What is NOT on this list is the reaper itself. `reap.ts` invokes
    // `executeDeletion` rather than `deleteUser`, so the capability still has
    // exactly one home while having gained an automatic caller — which is the
    // whole design claim of 2H-RECOVER-003, asserted here by absence.
    const operatorScripts = byClass("operator-script").map(([file]) => file);
    const recoveryProof = operatorScripts.filter(
      (file) => file === "scripts/phase-2h-deletion-reaper-race.mjs"
        || file === "scripts/phase-2h-rate-limit-race.mjs",
    );
    expect(recoveryProof).toHaveLength(2);

    // Plus Phase 2M's hosted funnel proof, counted on its own line for the same
    // reason every other addition is. It is the first entry whose deletion IS
    // the evidence rather than tidiness: `product_events` grants `service_role`
    // neither SELECT nor DELETE, so its rows cannot be counted or removed
    // directly, and "no owner of them survives" is the only honest proof of
    // zero residue available. Removing this call would not leave rows behind
    // tidily — it would leave the claim unprovable.
    const funnelProof = operatorScripts.filter(
      (file) => file === "scripts/phase-2m-daily-cycle-funnel-proof.mjs",
    );
    expect(funnelProof).toHaveLength(1);

    // Plus Phase 2M slice 2M.4b's hosted push proof, counted on its own line for
    // the same reason. Its deletion is teardown AND evidence, but in the
    // opposite direction from the funnel proof's: the three push tables are
    // readable, so the run reads each one owner-scoped AFTER the delete and
    // reports zero rows. A table it could not read is recorded as residue NOT
    // PROVED rather than passed over — silence is not evidence, and a harness
    // that treated an unreadable table as a clean one would be reporting the
    // absence of a measurement as the absence of rows.
    const pushProof = operatorScripts.filter(
      (file) => file === "scripts/phase-2m-push-delivery-proof.mjs",
    );
    expect(pushProof).toHaveLength(1);

    expect(operatorScripts)
      .toHaveLength(14 + recoveryProof.length + funnelProof.length + pushProof.length);
    expect(operatorScripts).not.toContain("supabase/functions/delete-account/reap.ts");
  });

  it("the product entry cites the ADR that placed it there", () => {
    expect(DELETION_CAPABILITY_ALLOWLIST["supabase/functions/delete-account/executor.ts"].reason)
      .toMatch(/ADR-\d+/);
  });

  it("every allowlist entry states why it is there", () => {
    for (const [file, entry] of Object.entries(DELETION_CAPABILITY_ALLOWLIST)) {
      expect(entry.reason.trim(), `${file} is allowlisted without a stated reason`).not.toBe("");
    }
  });
});
