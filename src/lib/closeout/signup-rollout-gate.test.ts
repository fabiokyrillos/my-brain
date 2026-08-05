import { mkdirSync, mkdtempSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GATE_IDS,
  OWNER_SIGNATURE_GATES,
  declaredGateIds,
  runGates,
  REPOSITORY_ROOT,
} from "../../../scripts/verify-signup-rollout.mjs";

/**
 * SH-ROLLOUT-002 and SH-ROLLOUT-004 — the rollout gate, and its own guard.
 *
 * ## What has to be true of a gate script for it to be worth running
 *
 * Two things, and only the second is interesting. It must go green when the
 * evidence is there — easy, and every verifier does it. And it must go **red
 * when the evidence is missing**, which is the property that makes the green
 * run mean anything, and the one a verifier silently loses the first time
 * somebody adds a `try/catch` for convenience.
 *
 * So the cases below build fixture repositories that are *missing exactly one
 * artifact each* and assert the corresponding gate fails. A gate that passed
 * against an empty directory would be a gate that says "open the door" to a
 * machine with nothing on it.
 */

const REPO = REPOSITORY_ROOT;

/** A throwaway repository containing only the paths a test puts in it. */
function emptyRepo(): string {
  return mkdtempSync(join(tmpdir(), "rollout-gate-"));
}

/** The real repository, copied shallowly enough for the offline gates to resolve. */
function repoWith(omit: string[] = []): string {
  const root = emptyRepo();
  const needed = [
    "docs/reports/BYOK_TRACEABILITY_MATRIX.md",
    "docs/reports/SIGNUP_HARDENING_DEPLOYED_ACCEPTANCE.md",
    "docs/reports/SH_DELETE_015_ORPHAN_MANIFEST.md",
    "docs/reports/SIGNUP_HARDENING_ORIGIN_VERIFICATION.md",
    "docs/reports/SIGNUP_HARDENING_SH6_DEPLOYMENT.md",
    "supabase/tests/signup_hardening_cascade_drill.sql",
    "supabase/tests/signup_hardening_suspension_admin.sql",
    "supabase/tests/signup_hardening_grant_census.sql",
    "supabase/functions/_shared/lifecycle-gate.ts",
    "supabase/functions/process-jobs/index.ts",
    "supabase/functions/process-jobs/request-bounds.ts",
    "scripts/verify-storage-orphans.mjs",
    "src/features/legal/documents.ts",
    "src/features/legal/retention.ts",
    "src/features/auth/hosted-auth-posture.ts",
    "src/features/auth/throttle.ts",
    "src/lib/closeout/heartbeat-disposition.test.ts",
    "src/proxy.ts",
  ];
  for (const path of needed) {
    if (omit.includes(path)) continue;
    mkdirSync(join(root, path, ".."), { recursive: true });
    cpSync(join(REPO, path), join(root, path));
  }
  mkdirSync(join(root, "supabase/migrations"), { recursive: true });
  for (const name of [
    "202608040074_policy_acceptances.sql",
    "202608040075_auth_event_attempts.sql",
    "202608050076_quota_enforcement.sql",
    "202608050077_retention_and_exposure.sql",
  ]) {
    if (omit.includes(`supabase/migrations/${name}`)) continue;
    writeFileSync(join(root, "supabase/migrations", name), "-- fixture\n");
  }
  return root;
}

/** Every hosted gate green, so a case can isolate one repository gate. */
const HOSTED_ALL_GREEN = {
  mailer_autoconfirm: false,
  security_captcha_enabled: true,
  uri_allow_list: "https://example.test/callback",
  password_min_length: 12,
  smtpConfigured: true,
  retentionSweepsScheduled: true,
  serviceRoleCredentialTableClosed: true,
};

function verdictFor(id: string, root: string, hosted: unknown = HOSTED_ALL_GREEN) {
  return runGates({ root, hosted }).find((r) => r.id === id)?.verdict;
}

describe("SH-ROLLOUT-004: the script and the document enumerate the same gates", () => {
  it("neither set has a gate the other lacks", () => {
    // The failure this catches is a gate added to the document and never
    // implemented — which would read as "covered" to anybody comparing counts.
    expect([...GATE_IDS].sort()).toEqual(declaredGateIds(REPO));
  });

  it("the register is not trivially small", () => {
    expect(GATE_IDS.length).toBeGreaterThanOrEqual(30);
  });

  it("every declared gate is implemented, none falling through to a default", () => {
    const results = runGates({ root: REPO, hosted: HOSTED_ALL_GREEN });
    expect(results).toHaveLength(GATE_IDS.length);
    for (const result of results) {
      expect(result.reason, `${result.id} has no reason`).toBeTruthy();
      expect(result.reason).not.toContain("declared but not implemented");
    }
  });
});

describe("fail-closed: an empty repository proves nothing", () => {
  it("no gate passes against a directory with no evidence in it", () => {
    // The single most important case in this file. A verifier that skips what
    // it cannot find reports green on an empty machine.
    const root = emptyRepo();
    try {
      const results = runGates({ root, hosted: null });
      expect(results.filter((r) => r.verdict === "PASS")).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("a missing hosted readback fails every hosted gate rather than skipping it", () => {
    const root = repoWith();
    try {
      // `hosted: null` is what an unreachable project looks like.
      for (const id of ["RG-SIG-1", "RG-SIG-2", "RG-SIG-4", "RG-SIG-6", "RG-EXP-3", "RG-DEP-1"]) {
        expect(verdictFor(id, root, null), id).toBe("FAIL");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("each gate fails when its own artifact is missing", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["RG-BYOK-1", "docs/reports/BYOK_TRACEABILITY_MATRIX.md"],
    ["RG-DEL-1", "docs/reports/SIGNUP_HARDENING_DEPLOYED_ACCEPTANCE.md"],
    ["RG-DEL-2", "supabase/tests/signup_hardening_cascade_drill.sql"],
    ["RG-DEL-3", "scripts/verify-storage-orphans.mjs"],
    ["RG-DEL-4", "docs/reports/SH_DELETE_015_ORPHAN_MANIFEST.md"],
    ["RG-SUS-1", "supabase/tests/signup_hardening_suspension_admin.sql"],
    ["RG-SUS-2", "supabase/functions/_shared/lifecycle-gate.ts"],
    ["RG-LEG-1", "src/features/legal/documents.ts"],
    ["RG-LEG-2", "supabase/migrations/202608040074_policy_acceptances.sql"],
    ["RG-LEG-3", "src/features/legal/retention.ts"],
    ["RG-SIG-3", "supabase/migrations/202608040075_auth_event_attempts.sql"],
    ["RG-SIG-5", "src/features/auth/hosted-auth-posture.ts"],
    ["RG-SIG-7", "src/features/auth/throttle.ts"],
    ["RG-QUO-1", "supabase/migrations/202608050076_quota_enforcement.sql"],
    ["RG-QUO-2", "supabase/functions/process-jobs/request-bounds.ts"],
    ["RG-QUO-3", "supabase/migrations/202608050077_retention_and_exposure.sql"],
    ["RG-EXP-1", "supabase/tests/signup_hardening_grant_census.sql"],
    ["RG-EXP-2", "src/lib/closeout/heartbeat-disposition.test.ts"],
    ["RG-EXP-4", "src/proxy.ts"],
    ["RG-DEP-2", "docs/reports/SIGNUP_HARDENING_ORIGIN_VERIFICATION.md"],
  ];

  it.each(cases)("%s fails without %s", (gate, artifact) => {
    const complete = repoWith();
    const broken = repoWith([artifact]);
    try {
      // Both directions in one case: green with the artifact, red without it.
      // Only the pair proves the gate is reading that artifact and not the
      // weather.
      expect(verdictFor(gate, complete), `${gate} should pass when complete`).toBe("PASS");
      expect(verdictFor(gate, broken), `${gate} should fail without ${artifact}`).toBe("FAIL");
    } finally {
      rmSync(complete, { recursive: true, force: true });
      rmSync(broken, { recursive: true, force: true });
    }
  });
});

describe("the owner-signature gates are honest about not being mechanized", () => {
  it("they report OWNER and never PASS, whatever the repository holds", () => {
    const root = repoWith();
    try {
      for (const id of OWNER_SIGNATURE_GATES) {
        expect(verdictFor(id, root), id).toBe("OWNER");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("an unsigned gate keeps the overall run red", () => {
    // T-33: a gate on documents rather than on configuration. If OWNER counted
    // as green, the script would report "open the door" with a legal review
    // nobody had done.
    const root = repoWith();
    try {
      const results = runGates({ root, hosted: HOSTED_ALL_GREEN });
      const clean = results.every((r) => r.verdict === "PASS");
      expect(clean).toBe(false);
      expect(results.filter((r) => r.verdict === "OWNER")).toHaveLength(
        OWNER_SIGNATURE_GATES.length,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("RG-QUO-3 distinguishes built from enforced", () => {
  it("fails when the sweeps exist and are not scheduled", () => {
    // SH.6's own lesson, made mechanical: a sweep nothing schedules enforces no
    // window, whatever the migration chain contains.
    const root = repoWith();
    try {
      expect(
        verdictFor("RG-QUO-3", root, { ...HOSTED_ALL_GREEN, retentionSweepsScheduled: false }),
      ).toBe("FAIL");
      expect(verdictFor("RG-QUO-3", root, HOSTED_ALL_GREEN)).toBe("PASS");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("RG-BYOK-2 reads code, not prose", () => {
  it("passes for the real worker, whose comments discuss the key by name", () => {
    // The first cut of this gate failed here: the worker's docblock explains
    // what used to be there by naming it, and a substring search cannot tell
    // code from an explanation of removed code.
    const root = repoWith();
    try {
      expect(verdictFor("RG-BYOK-2", root)).toBe("PASS");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when the key is genuinely read", () => {
    const root = repoWith();
    try {
      writeFileSync(
        join(root, "supabase/functions/process-jobs/index.ts"),
        'const key = Deno.env.get("OPENAI_API_KEY");\n',
      );
      expect(verdictFor("RG-BYOK-2", root)).toBe("FAIL");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
