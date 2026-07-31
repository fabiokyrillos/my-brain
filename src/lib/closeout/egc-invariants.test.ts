import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Entity Graph Completion — the invariants, asserted mechanically.
 *
 * `EGC-INVARIANT-001` is the initiative's central claim: **the entity graph the
 * product already stores becomes reachable by its owner with no migration.** That
 * claim is worth exactly as much as the thing enforcing it, and prose enforces
 * nothing. This file is `G-0.3`, and it exists *before* the first product commit
 * for the reason `PHASE_2F_PROPOSAL.md` §15 gives: a gate written after the work
 * it governs is a description, not a check.
 *
 * The risk it answers is named in the PRD's own risk register as R1 — that a
 * "small" schema addition creeps in mid-slice (an `archived` flag, a display
 * order) and the initiative's central claim quietly stops being true. A reviewer
 * reading three slices of diffs would not reliably catch it. A pinned chain head
 * catches it on the first commit that moves.
 */

const REPO = resolve(__dirname, "../../..");

/**
 * The migration-chain head at the moment Entity Graph Completion was authorized.
 *
 * Set by Slice G5 of the product UX remediation (`202607310064`, the reminder
 * lifecycle command). Entity Graph Completion must not move it. **BYOK will** —
 * its plan budgets four migrations — so when that initiative starts, this pin is
 * updated by the slice that adds the first one, deliberately and visibly, rather
 * than deleted.
 */
const AUTHORIZED_MIGRATION_HEAD = "202607310064";

function migrationVersions(): string[] {
  return readdirSync(join(REPO, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => name.slice(0, 12))
    .filter((version) => /^\d{12}$/.test(version))
    .sort();
}

describe("EGC-INVARIANT-001: Entity Graph Completion adds no migration", () => {
  it("keeps the migration chain head at the version authorized for this initiative", () => {
    const versions = migrationVersions();
    expect(
      versions[versions.length - 1],
      "Entity Graph Completion moved the migration chain head. The initiative's "
        + "central claim is that the entity graph is reachable with no schema change, "
        + "and EGC-INVARIANT-001 makes that mechanical. If a migration is genuinely "
        + "required, the slice stops and the PRD is amended by owner decision — the "
        + "invariant is not renegotiated inside a branch.",
    ).toBe(AUTHORIZED_MIGRATION_HEAD);
  });

  it("reads the head from the directory rather than trusting a restated constant", () => {
    // The pin is only worth something if it is compared against the real chain.
    // A test that asserted the constant against itself would pass forever.
    const versions = migrationVersions();
    expect(versions.length).toBeGreaterThan(60);
    expect(versions).toContain(AUTHORIZED_MIGRATION_HEAD);
    expect(versions).toEqual([...versions].sort());
  });
});

describe("EGC-INVARIANT-003: Phase 2F's write-path invariant is untouched", () => {
  it("keeps the direct-write guard present, so EGC cannot silently become its exception", () => {
    // The guard itself asserts the allowlists; this asserts the guard still
    // exists to do so. Deleting it would make `tasks` writable with a green
    // suite, which is the one failure mode the guard cannot report about itself.
    const guards = readdirSync(join(REPO, "src/lib/supabase"));
    expect(guards).toContain("direct-write-guard.test.ts");
  });
});
