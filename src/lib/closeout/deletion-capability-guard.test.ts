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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { globSync } from "node:fs";

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
};

/** Scanned roots. `docs/` is excluded: prose may name what code may not do. */
const SCAN_GLOBS = [
  "src/**/*.{ts,tsx}",
  "scripts/**/*.mjs",
  "supabase/functions/**/*.ts",
  "e2e/**/*.ts",
];

const CAPABILITY_PATTERNS = [/auth\.admin\.deleteUser/, /admin\.deleteUser/];

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("--"))
    .join("\n");
}

function holdersOfDeletionCapability(): string[] {
  const holders: string[] = [];
  for (const pattern of SCAN_GLOBS) {
    for (const file of globSync(pattern, { cwd: REPO })) {
      const normalized = file.replace(/\\/g, "/");
      // A test file that asserts about the capability is not a holder of it;
      // this guard is one such file, and so are the executor's own tests.
      if (normalized.endsWith(".test.ts") || normalized.endsWith(".test.tsx")) continue;
      const source = stripComments(readFileSync(join(REPO, file), "utf8"));
      if (CAPABILITY_PATTERNS.some((rx) => rx.test(source))) holders.push(normalized);
    }
  }
  return holders.sort();
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

  it("the non-product classes are exactly the pre-SH.2 surface the census recorded", () => {
    // e2e teardown and operator scripts held this before SH.2 and are listed
    // rather than skipped. If one is ever deleted or a new one appears, the
    // both-directions assertions above name it.
    const byClass = (name: CapabilityClass) =>
      Object.entries(DELETION_CAPABILITY_ALLOWLIST).filter(([, entry]) => entry.class === name);
    expect(byClass("e2e-teardown")).toHaveLength(5);
    expect(byClass("operator-script")).toHaveLength(14);
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
