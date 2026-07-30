import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

/**
 * Phase 2F cleanup verifier — pure-predicate proofs (`2F-OPERATIONS-004`,
 * definitive Slice 2F.6 PRD §6.2 F24).
 *
 * The live scan cannot prove its own orphan predicate works: every scanned
 * table's `user_id` cascades from `auth.users`, so the row it looks for cannot
 * exist and a zero is not a measurement. That is stated in the verifier itself
 * and it is why these cases exist — the predicate is proven here, over injected
 * rows including a known orphan, and the verifier's live output reports per-table
 * row counts so "zero" can never be indistinguishable from "asked nothing".
 *
 * The remaining cases hold the verifier to the two properties a reader has to
 * take on trust otherwise: that its fixture prefixes match the scripts that mint
 * them, and that it writes nothing.
 */

const REPO = resolve(__dirname, "../../..");

type Module = typeof import("../../../scripts/verify-phase-2f-cleanup.mjs");

async function load(): Promise<Module> {
  return (await import("../../../scripts/verify-phase-2f-cleanup.mjs")) as Module;
}

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "phase-2f-cleanup-"));
  roots.push(root);
  mkdirSync(join(root, "docs/reports"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  return root;
}

describe("2F-OPERATIONS-004: the orphan predicate, proven over injected rows", () => {
  it("detects a row whose owner is absent from auth.users", async () => {
    const { findOrphanRows } = await load();
    const known = new Set(["owner-a", "owner-b"]);
    const rows = [
      { user_id: "owner-a" },
      { user_id: "ghost" },
      { user_id: "owner-b" },
    ];
    expect(findOrphanRows(rows, known)).toEqual([{ user_id: "ghost" }]);
  });

  it("reports nothing when every owner is present — the positive control's counterpart", async () => {
    const { findOrphanRows } = await load();
    expect(findOrphanRows([{ user_id: "a" }, { user_id: "b" }], new Set(["a", "b"]))).toEqual([]);
  });

  it("ignores rows with no user_id rather than counting them as orphans", async () => {
    const { findOrphanRows } = await load();
    expect(findOrphanRows([{ user_id: null }, { user_id: undefined }], new Set())).toEqual([]);
  });

  it("would report every row as an orphan against an empty known-user set, so the scan is not inert", async () => {
    const { findOrphanRows } = await load();
    expect(findOrphanRows([{ user_id: "a" }, { user_id: "b" }], new Set())).toHaveLength(2);
  });
});

describe("2F-OPERATIONS-004: fixture identification", () => {
  it("matches every Phase 2F fixture prefix the minting scripts actually use", async () => {
    const { findDisposableUsers, DISPOSABLE_PREFIXES } = await load();
    const users = [
      { email: "phase-2f5-funnel-owner-a-abc@example.test" },
      { email: "phase-2f5-baseline-abc@example.test" },
      { email: "codex-2f3-owner-abc@example.com" },
      { email: "phase2f-gate3-owner-abc@example.invalid" },
      { email: "real.person@example.com" },
      { email: null },
    ];
    const found = findDisposableUsers(users) as { email: string | null }[];
    expect(found.map((user) => user.email)).toEqual([
      "phase-2f5-funnel-owner-a-abc@example.test",
      "phase-2f5-baseline-abc@example.test",
      "codex-2f3-owner-abc@example.com",
      "phase2f-gate3-owner-abc@example.invalid",
    ]);
    expect(DISPOSABLE_PREFIXES).toContain("phase2f-gate3-");
  });

  it("uses the prefix the Gate 3 script writes, not the one a reader would guess", async () => {
    // `phase2f-gate3-` has no hyphen after `phase2f`. A verifier keyed on
    // `phase-2f-` would miss the entire Gate 3 fixture population, which is the
    // kind of near-miss a hand-written prefix list produces.
    const { DISPOSABLE_PREFIXES } = await load();
    const gate3 = readFileSync(join(REPO, "scripts/phase-2f-gate3-exact-title-reuse.mjs"), "utf8");
    const declared = gate3.match(/`([a-z0-9-]*?)\$\{label\}/);
    expect(declared, "Gate 3 no longer builds its fixture email from a template literal").not.toBeNull();
    expect(DISPOSABLE_PREFIXES).toContain(declared![1]);
  });

  it("matches the fixture storage objects the remote smoke uploads", async () => {
    const { isFixtureStorageObject } = await load();
    expect(isFixtureStorageObject("remote-smoke.txt")).toBe(true);
    expect(isFixtureStorageObject("phase-2f-remote-smoke.txt")).toBe(true);
    expect(isFixtureStorageObject("holiday-photo.png")).toBe(false);
  });
});

describe("2F-OPERATIONS-004: error classification fails closed", () => {
  it("recognises the two privilege-denied answers PostgREST and Postgres each give", async () => {
    const { isPrivilegeDenied } = await load();
    expect(isPrivilegeDenied({ code: "42501" })).toBe(true);
    expect(isPrivilegeDenied({ code: "PGRST301" })).toBe(true);
    expect(isPrivilegeDenied({ message: "permission denied for table product_events" })).toBe(true);
    expect(isPrivilegeDenied({ code: "PGRST205" })).toBe(false);
    expect(isPrivilegeDenied(undefined)).toBe(false);
  });

  it("recognises absence as PGRST205, which is what actually arrives, as well as 42P01", async () => {
    // PostgREST answers an unknown relation from its schema cache and never
    // reaches Postgres, so the native undefined-table SQLSTATE is never raised.
    // The Phase 2E verifier died on exactly this.
    const { isTableAbsent } = await load();
    expect(isTableAbsent({ code: "PGRST205" })).toBe(true);
    expect(isTableAbsent({ code: "42P01" })).toBe(true);
    expect(isTableAbsent({ message: "Could not find the table 'public.tasks'" })).toBe(true);
    expect(isTableAbsent({ code: "42501" })).toBe(false);
  });
});

describe("2F-OPERATIONS-004: scope declarations", () => {
  it("scans every table the Phase 2E verifier scanned, plus the Phase 2F handover", async () => {
    const { SCANNED_TABLES } = await load();
    const phase2e = readFileSync(join(REPO, "scripts/verify-phase-2e-cleanup.mjs"), "utf8");
    const inherited = [...phase2e.matchAll(/^\s{2}"([a-z_]+)",$/gm)].map((match) => match[1]);
    expect(inherited.length).toBeGreaterThan(10);
    for (const table of inherited) {
      expect(SCANNED_TABLES, `${table} was scanned by the Phase 2E verifier and must not be dropped`)
        .toContain(table);
    }
    expect(SCANNED_TABLES).toContain("product_events");
  });

  it("gives every deliberately-unscanned table a reason and a cascade anchor", async () => {
    const { DELIBERATELY_NOT_SCANNED, SCANNED_TABLES } = await load();
    for (const [table, reason] of Object.entries(DELIBERATELY_NOT_SCANNED)) {
      expect(SCANNED_TABLES).not.toContain(table);
      expect(reason, `${table}'s exclusion cites no migration anchor`).toMatch(/\d{12}:\d+/);
    }
  });

  it("declares both posture-protected tables as scanned, so their refusal is asserted", async () => {
    const { SERVICE_ROLE_CANNOT_READ, SCANNED_TABLES } = await load();
    for (const table of Object.keys(SERVICE_ROLE_CANNOT_READ)) {
      expect(SCANNED_TABLES).toContain(table);
    }
    expect(Object.keys(SERVICE_ROLE_CANNOT_READ).sort())
      .toEqual(["product_events", "task_command_confirmations"]);
  });

  it("keeps the deferred-object list pointed at what the phase actually refused", async () => {
    const { RPCS_THAT_MUST_NOT_EXIST, AI_USAGE_PROVENANCE_PATTERN } = await load();
    expect(Object.keys(RPCS_THAT_MUST_NOT_EXIST).sort())
      .toEqual(["create_reminder", "create_task_command_v2"]);
    // A pattern over the live column set, not a guessed exact name: no
    // provenance column name has ever been declared anywhere.
    expect(AI_USAGE_PROVENANCE_PATTERN.test("prompt_version")).toBe(true);
    expect(AI_USAGE_PROVENANCE_PATTERN.test("strategy_version")).toBe(true);
    expect(AI_USAGE_PROVENANCE_PATTERN.test("ai_prompt_strategy_version")).toBe(true);
    expect(AI_USAGE_PROVENANCE_PATTERN.test("version_prompt")).toBe(true);
    expect(AI_USAGE_PROVENANCE_PATTERN.test("model")).toBe(false);
    expect(AI_USAGE_PROVENANCE_PATTERN.test("match_policy_version")).toBe(false);
  });
});

describe("2F-OPERATIONS-004: the ADR-057 reopening gate", () => {
  it("reports the gate intact when the script is present and no transcript exists", async () => {
    const { readProvenanceReopeningGate } = await load();
    const gate = readProvenanceReopeningGate(REPO);
    expect(gate.scriptPresent).toBe(true);
    expect(gate.transcripts).toEqual([]);
  });

  it("detects a missing gate script", async () => {
    const { readProvenanceReopeningGate } = await load();
    const root = scratch();
    expect(readProvenanceReopeningGate(root).scriptPresent).toBe(false);
  });

  it("detects a dry-run transcript, which would mean the deferral is no longer merely deferred", async () => {
    const { readProvenanceReopeningGate } = await load();
    const root = scratch();
    writeFileSync(join(root, "scripts/phase-2f-gate1-record-ai-usage-dry-run.sql"), "-- x\n", "utf8");
    writeFileSync(
      join(root, "docs/reports/PHASE_2G_RECORD_AI_USAGE_DRY_RUN_TRANSCRIPT.md"),
      "executed\n",
      "utf8",
    );
    const gate = readProvenanceReopeningGate(root);
    expect(gate.scriptPresent).toBe(true);
    expect(gate.transcripts).toEqual(["PHASE_2G_RECORD_AI_USAGE_DRY_RUN_TRANSCRIPT.md"]);
  });
});

describe("2F-OPERATIONS-004: the verifier writes nothing", () => {
  it("issues no insert, update, delete, upsert or rpc call anywhere in its source", async () => {
    const source = readFileSync(join(REPO, "scripts/verify-phase-2f-cleanup.mjs"), "utf8");
    for (const method of ["insert(", "update(", "delete(", "upsert(", ".rpc("]) {
      expect(source, `the cleanup verifier must not call ${method}`).not.toContain(method);
    }
    expect(source).not.toContain("admin.auth.admin.deleteUser");
    expect(source).not.toContain("createUser");
  });

  it("reaches PostgREST's schema only by a GET, so the deferral probes touch no function", async () => {
    const source = readFileSync(join(REPO, "scripts/verify-phase-2f-cleanup.mjs"), "utf8");
    expect(source).toContain("await fetch(`${url}/rest/v1/`");
    expect(source).not.toContain('method: "POST"');
  });
});
