import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildMatrix,
  declaredRequirements,
  generate,
  sliceOwnership,
} from "../../../scripts/generate-egc-traceability.mjs";
import { accountSignals, classify } from "../../../scripts/verify-egc-cleanup.mjs";

/**
 * EGC-OPERATIONS-001 and 002 — the closeout instruments, tested against
 * fixtures that carry one deliberate defect each.
 *
 * The doctrine `generate-phase-2f-traceability.mjs` established: a guard proven
 * only in the failing direction may be refusing everything, and a guard proven
 * only in the passing direction may be accepting everything. Both directions,
 * every time.
 */

const REPO = resolve(__dirname, "../../..");

/** A minimal repository carrying exactly the files the generator reads. */
function fixtureRepo(overrides: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "egc-trace-"));
  const files: Record<string, string> = {
    "docs/ENTITY_GRAPH_COMPLETION_PRD.md": [
      "## 5. Requirements",
      "",
      "### EGC-ORG — organizations",
      "",
      "| ID | Requirement |",
      "| --- | --- |",
      "| **EGC-ORG-001** | Organizations get a list route. |",
      "| **EGC-ORG-002** | Organizations get a detail route. |",
      "",
      "## 6. Owner decisions inside this PRD",
      "",
      "### EGC-DEC-1 — deletion of organizations and contexts",
      "",
    ].join("\n"),
    "docs/ENTITY_GRAPH_COMPLETION_IMPLEMENTATION_PLAN.md": [
      "## Slice EGC.1 — Organizations and Contexts",
      "",
      "**Delivers:** EGC-ORG-001…002, and",
      "EGC-DEC-1 as its governing decision.",
      "",
    ].join("\n"),
    ...overrides,
  };

  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), content, "utf8");
  }
  return root;
}

describe("EGC-OPERATIONS-001: the traceability generator", () => {
  it("parses requirements from table rows and decisions from headings", () => {
    const root = fixtureRepo();
    try {
      const declared = declaredRequirements(root);
      expect([...declared.keys()].sort()).toEqual(["EGC-DEC-1", "EGC-ORG-001", "EGC-ORG-002"]);
      expect(declared.get("EGC-ORG-001")).toBe("Organizations get a list route.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads a Delivers declaration that wraps onto the next line", () => {
    // The defect the first draft shipped: reading only the first line left
    // `EGC-SURFACE-001…005` attributed to no slice, because the real
    // declaration wraps. The fixture wraps too.
    const root = fixtureRepo();
    try {
      const owners = sliceOwnership(root);
      expect(owners.get("EGC-ORG-001")).toBe("EGC.1");
      expect(owners.get("EGC-ORG-002")).toBe("EGC.1");
      expect(owners.get("EGC-DEC-1")).toBe("EGC.1");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("expands both the range and the slash-list notations the plan uses", () => {
    const root = fixtureRepo({
      "docs/ENTITY_GRAPH_COMPLETION_IMPLEMENTATION_PLAN.md": [
        "## Slice EGC.3 — Convergence",
        "",
        "**Delivers:** EGC-ORG-001…002, EGC-INVARIANT-001/002/005.",
        "",
      ].join("\n"),
    });
    try {
      const owners = sliceOwnership(root);
      expect(owners.get("EGC-ORG-002")).toBe("EGC.3");
      expect(owners.get("EGC-INVARIANT-001")).toBe("EGC.3");
      expect(owners.get("EGC-INVARIANT-002")).toBe("EGC.3");
      expect(owners.get("EGC-INVARIANT-005")).toBe("EGC.3");
      // 003 and 004 are not in the list and must not be invented.
      expect(owners.has("EGC-INVARIANT-003")).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("parses identically whether the documents use LF or CRLF", () => {
    // The defect this generator shipped and had to fix: `.split("\n")` left a
    // trailing `\r`, and the heading pattern ends `(.+)$` — `.` does not match
    // `\r`, so all three owner decisions vanished on a Windows checkout while
    // the table rows kept working, because their pattern ends `\s*$`.
    const lf = fixtureRepo();
    const crlf = fixtureRepo();
    try {
      for (const path of [
        "docs/ENTITY_GRAPH_COMPLETION_PRD.md",
        "docs/ENTITY_GRAPH_COMPLETION_IMPLEMENTATION_PLAN.md",
      ]) {
        const content = readFileSync(join(crlf, path), "utf8").replace(/\n/g, "\r\n");
        writeFileSync(join(crlf, path), content, "utf8");
      }

      expect([...declaredRequirements(crlf).keys()].sort())
        .toEqual([...declaredRequirements(lf).keys()].sort());
      expect([...sliceOwnership(crlf).entries()].sort())
        .toEqual([...sliceOwnership(lf).entries()].sort());
    } finally {
      rmSync(lf, { recursive: true, force: true });
      rmSync(crlf, { recursive: true, force: true });
    }
  });

  it("fails closed on a dangling requirement reference", () => {
    const root = fixtureRepo({
      "docs/ENTITY_GRAPH_COMPLETION_PRD.md": [
        "| ID | Requirement |",
        "| --- | --- |",
        "| **EGC-ORG-001** | Organizations get a list route, see EGC-ORG-999. |",
        "",
      ].join("\n"),
    });
    try {
      const { problems } = buildMatrix(root);
      expect(problems.some((problem) => problem.includes("EGC-ORG-999"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed when a claimed artifact does not exist", () => {
    const root = fixtureRepo();
    try {
      const { problems } = buildMatrix(root);
      // The fixture repo contains none of the real evidence paths, so every one
      // of them must be reported — a generator that printed dead links instead
      // is the failure mode this whole family exists to prevent.
      expect(problems.some((problem) => problem.includes("does not exist"))).toBe(true);
      expect(generate(root, { write: false }).ok).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts the real repository — the positive control", () => {
    // Without this, every assertion above would pass while the generator
    // refused everything.
    const result = generate(REPO, { write: false });
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("regenerates content-identically, which is gate C3", () => {
    const first = generate(REPO, { write: false });
    const second = generate(REPO, { write: false });
    expect(first.content).toBe(second.content);
    // And the file on disk matches, so the committed matrix is the current one.
    expect(readFileSync(join(REPO, "docs/reports/entity-graph/EGC_TRACEABILITY_MATRIX.md"), "utf8").replace(/\r\n/g, "\n"))
      .toBe(first.content);
  });
});

describe("EGC-OPERATIONS-002: the cleanup verifier's classifier", () => {
  const noActivity = { egcRows: 0, productRows: 0, scheduledRuns: 0 };

  it("recognises the fixture prefixes the e2e specs actually mint", () => {
    const signals = accountSignals({ email: "codex-entitygraph-abc@example.com" }, noActivity);
    expect(signals.map((entry) => entry.signal)).toContain("known-fixture-prefix");
    expect(signals.map((entry) => entry.signal)).toContain("reserved-domain:example.com");
  });

  it("never reaches likely-fixture on naming alone, however generated the address looks", () => {
    // The guard against the failure in the *other* direction: deleting somebody
    // real because their address looks machine-made. Three naming signals and no
    // behaviour still stops at `possible-fixture`.
    const signals = accountSignals(
      { email: "codex-4f2b8c1d9e0a7b6c5d4e3f2a1b0c9d8e-1690000000@example.test" },
      noActivity,
    );
    expect(signals.filter((entry) => entry.kind === "name").length).toBeGreaterThanOrEqual(3);
    expect(signals.filter((entry) => entry.kind === "behaviour")).toHaveLength(0);
    expect(classify(signals)).toBe("possible-fixture");
  });

  it("catches the account the prefix rule missed, on behaviour rather than on name", () => {
    // The production case recorded in SECURITY.md: an ordinary-looking address,
    // confirmed, abandoned after three minutes, with the hourly heartbeat still
    // running on its behalf for three weeks. Two acceptance artifacts called it
    // a real user because no fixture creator emits that prefix.
    const signals = accountSignals(
      { email: "someone.ordinary@gmail.com" },
      { egcRows: 0, productRows: 0, scheduledRuns: 358 },
    );
    expect(signals.map((entry) => entry.kind)).toContain("behaviour");
    expect(classify(signals)).toBe("possible-fixture");

    // And with one corroborating signal it escalates — which is the whole point
    // of scoring rather than matching.
    const corroborated = accountSignals(
      { email: "someone.ordinary@example.test" },
      { egcRows: 4, productRows: 0, scheduledRuns: 358 },
    );
    expect(classify(corroborated)).toBe("likely-fixture");
  });

  it("leaves a real account with real activity unclassified", () => {
    // The positive control. An owner who writes entries and tasks is never
    // residue, whatever their entity-graph row count.
    const signals = accountSignals(
      { email: "owner@somewhere.example" },
      { egcRows: 12, productRows: 340, scheduledRuns: 500 },
    );
    expect(signals).toEqual([]);
    expect(classify(signals)).toBe("unclassified");
  });

  it("holds no deletion path at all", () => {
    // EGC-OPERATIONS-002 and the loop's own instruction: detection and
    // reporting first; deletion needs a manifest and a human. A verifier that
    // could delete would eventually be pointed at production by a CI job trying
    // to go green.
    const source = readFileSync(join(REPO, "scripts/verify-egc-cleanup.mjs"), "utf8");
    expect(source).not.toMatch(/\.delete\s*\(/);
    expect(source).not.toMatch(/deleteUser/);
    expect(source).not.toMatch(/admin\.auth\.admin\.delete/);
  });
});
