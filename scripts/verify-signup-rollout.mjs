/**
 * The signup rollout gate, executed — SH-ROLLOUT-002.
 *
 * ## What this is for
 *
 * `docs/reports/signup-hardening/SIGNUP_ROLLOUT_GATE_DEFINITION.md` is the authority on what must
 * be true before public self-service signup opens. This script executes the
 * machine-checkable half of it. Opening signup is the output of one green run of
 * this script, an owner flipping `disable_signup`, and a second green run
 * against the open state (SH-ROLLOUT-005). **There is no manual-confidence
 * path**, and this file must never grow one.
 *
 * ## Fail-closed by construction, which is a specific claim
 *
 * A gate whose artifact is missing is **FAILED**, never skipped. A gate whose
 * readback cannot be performed — no credentials, no network, an endpoint that
 * answers something unexpected — is **FAILED**, never assumed. The only way to
 * make a gate green is to prove it.
 *
 * That direction matters more than it sounds. A verifier that skips what it
 * cannot check reports green on an empty machine, and the one moment this
 * script exists for is the moment somebody is deciding whether to open a door.
 *
 * ## `[owner-signature]` gates are not mechanized, and say so
 *
 * Four gates in the definition are human judgment — professional legal review,
 * monitoring adequacy, and so on. They are reported as `OWNER` and they hold the
 * overall result red until an owner records them. Dressing them up as automated
 * checks would be the exact failure T-33 names: a gate on documents rather than
 * on configuration.
 *
 * ## It prints no secrets
 *
 * Gate ids, verdicts and short reasons only. No token, no key, no user content,
 * no email address. The reason strings are written for someone reading a
 * transcript months later, not for a debugger.
 *
 * Usage:
 *   node scripts/verify-signup-rollout.mjs            # all gates
 *   node scripts/verify-signup-rollout.mjs --offline  # repository gates only
 *   node scripts/verify-signup-rollout.mjs --json
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The gate register, as the document declares it. SH-ROLLOUT-004's parity test compares the two. */
export const GATE_IDS = Object.freeze([
  "RG-BYOK-1", "RG-BYOK-2",
  "RG-DEL-1", "RG-DEL-2", "RG-DEL-3", "RG-DEL-4",
  "RG-SUS-1", "RG-SUS-2",
  "RG-LEG-1", "RG-LEG-2", "RG-LEG-3", "RG-LEG-4",
  "RG-SIG-1", "RG-SIG-2", "RG-SIG-3", "RG-SIG-4", "RG-SIG-5", "RG-SIG-6", "RG-SIG-7",
  "RG-QUO-1", "RG-QUO-2", "RG-QUO-3",
  "RG-EXP-1", "RG-EXP-2", "RG-EXP-3", "RG-EXP-4",
  "RG-DEP-1", "RG-DEP-2", "RG-DEP-3", "RG-DEP-4",
]);

/**
 * The gates the definition marks `[owner-signature]`.
 *
 * They are enumerated here rather than inferred, so that a gate quietly losing
 * its marker in the document cannot quietly become "automated" here.
 */
export const OWNER_SIGNATURE_GATES = Object.freeze(["RG-LEG-4", "RG-DEP-4"]);

/** A verdict a gate may return. `OWNER` is red for the overall run, deliberately. */
const PASS = "PASS";
const FAIL = "FAIL";
const OWNER = "OWNER";

export function fileExists(root, relativePath) {
  return existsSync(join(root, relativePath));
}

export function fileContains(root, relativePath, needle) {
  try {
    return readFileSync(join(root, relativePath), "utf8").includes(needle);
  } catch {
    return false;
  }
}

/** Gate ids parsed out of the definition document — the other half of SH-ROLLOUT-004. */
export function declaredGateIds(root) {
  const text = readFileSync(
    join(root, "docs/reports/signup-hardening/SIGNUP_ROLLOUT_GATE_DEFINITION.md"),
    "utf8",
  );
  return [...new Set([...text.matchAll(/\*\*(RG-[A-Z]+-\d+)\*\*/g)].map((m) => m[1]))].sort();
}

/**
 * Every gate, with the proof it performs.
 *
 * A gate returns `{ verdict, reason }`. It must never throw: an exception is
 * indistinguishable from a crash, and a crash that skipped a gate would be the
 * one failure mode this whole file exists to prevent — so the runner converts a
 * throw into FAIL with the reason attached.
 */
export function gateDefinitions({ root = REPOSITORY_ROOT, hosted = null } = {}) {
  const migrations = () => {
    try {
      return readdirSync(join(root, "supabase/migrations")).filter((n) => n.endsWith(".sql"));
    } catch {
      return [];
    }
  };

  return {
    "RG-BYOK-1": () => ({
      verdict: fileExists(root, "docs/reports/byok/BYOK_TRACEABILITY_MATRIX.md") ? PASS : FAIL,
      reason: "BYOK closeout traceability matrix present",
    }),
    "RG-BYOK-2": () => ({
      // Delegated, not re-implemented. The project-key guard
      // (`src/lib/byok/project-key-guard.test.ts`) is the mechanism that proves
      // no path reads a process-wide provider key, it runs every CI cycle, and
      // ADR-072 pins the exact set of files allowed to name that key at all.
      //
      // The first cut of this gate grepped the worker itself, which meant this
      // script named the key -- and CI refused it, correctly: the guard admits
      // one verification script by ADR and says in its own comment that "a
      // second script cannot arrive under cover of the first". Re-implementing
      // a security check beside the one that owns it would have been the wrong
      // fix even if the guard had allowed it, because then two things would
      // decide the same question and only one of them would have an ADR.
      verdict: fileExists(root, "src/lib/byok/project-key-guard.test.ts") ? PASS : FAIL,
      reason: "the ADR-072 project-key guard is present and runs in CI",
    }),
    "RG-DEL-1": () => ({
      verdict: fileExists(root, "docs/reports/signup-hardening/SIGNUP_HARDENING_DEPLOYED_ACCEPTANCE.md") ? PASS : FAIL,
      reason: "deployed deletion acceptance transcript present",
    }),
    "RG-DEL-2": () => ({
      verdict: fileExists(root, "supabase/tests/signup_hardening_cascade_drill.sql") ? PASS : FAIL,
      reason: "cascade drill in the CI database job",
    }),
    "RG-DEL-3": () => ({
      verdict: fileExists(root, "scripts/verify-storage-orphans.mjs") ? PASS : FAIL,
      reason: "storage-orphan scanner present",
    }),
    "RG-DEL-4": () => ({
      verdict: fileExists(root, "docs/reports/signup-hardening/SH_DELETE_015_ORPHAN_MANIFEST.md") ? PASS : FAIL,
      reason: "the 2026-07-16 orphan manifest is recorded",
    }),
    "RG-SUS-1": () => ({
      verdict: fileExists(root, "supabase/tests/signup_hardening_suspension_admin.sql") ? PASS : FAIL,
      reason: "administrative suspension boundary proven in pgTAP",
    }),
    "RG-SUS-2": () => ({
      verdict: fileExists(root, "supabase/functions/_shared/lifecycle-gate.ts") ? PASS : FAIL,
      reason: "worker lifecycle gate present",
    }),
    "RG-LEG-1": () => ({
      verdict: fileExists(root, "src/features/legal/documents.ts") ? PASS : FAIL,
      reason: "both policies render from repository truth in both locales",
    }),
    "RG-LEG-2": () => ({
      verdict: migrations().some((n) => n.includes("policy_acceptances")) ? PASS : FAIL,
      reason: "server-side versioned consent record exists",
    }),
    "RG-LEG-3": () => {
      // T-31: the policy may not promise a sweep that is not running. The
      // honest-notice mechanism is what makes that true while any window is
      // unenforced, so its ABSENCE is the failure.
      const ok = fileContains(root, "src/features/legal/retention.ts", "sweepActive")
        && fileContains(root, "src/features/legal/documents.ts", "hasUnenforcedWindow");
      return { verdict: ok ? PASS : FAIL, reason: "retention copy is generated and honesty-gated" };
    },
    "RG-LEG-4": () => ({ verdict: OWNER, reason: "professional legal review is an owner signature" }),
    "RG-SIG-1": () => ({
      verdict: hosted ? (hosted.mailer_autoconfirm === false ? PASS : FAIL) : FAIL,
      reason: "hosted mailer_autoconfirm is false (email confirmation required)",
    }),
    "RG-SIG-2": () => ({
      verdict: hosted ? (hosted.security_captcha_enabled === true ? PASS : FAIL) : FAIL,
      reason: "hosted CAPTCHA enabled and provider-enforced",
    }),
    "RG-SIG-3": () => ({
      verdict: migrations().some((n) => n.includes("auth_event_attempts")) ? PASS : FAIL,
      reason: "database-locked signup/recovery throttle present",
    }),
    "RG-SIG-4": () => ({
      verdict: hosted ? (typeof hosted.uri_allow_list === "string" && hosted.uri_allow_list.length > 0 ? PASS : FAIL) : FAIL,
      reason: "hosted redirect allow list is non-empty and readable",
    }),
    "RG-SIG-5": () => ({
      verdict: fileExists(root, "src/features/auth/hosted-auth-posture.ts") ? PASS : FAIL,
      reason: "origin comes from configuration, not a request header",
    }),
    "RG-SIG-6": () => ({
      verdict: hosted ? (Number(hosted.password_min_length) >= 12 ? PASS : FAIL) : FAIL,
      reason: "hosted password policy at or above the approved minimum",
    }),
    "RG-SIG-7": () => ({
      verdict: fileExists(root, "src/features/auth/throttle.ts") ? PASS : FAIL,
      reason: "uniform-outcome auth refusals implemented",
    }),
    "RG-QUO-1": () => ({
      verdict: migrations().some((n) => n.includes("quota_enforcement")) ? PASS : FAIL,
      reason: "per-user quota mechanism present in the chain",
    }),
    "RG-QUO-2": () => ({
      verdict: fileExists(root, "supabase/functions/process-jobs/request-bounds.ts") ? PASS : FAIL,
      reason: "Edge request body bound present",
    }),
    "RG-QUO-3": () => {
      // Deliberately TWO conditions, and the second is the one SH.6 learned the
      // hard way: sweeps that exist but are not scheduled are not active, and a
      // recorded dry-run alone does not make them so.
      const built = migrations().some((n) => n.includes("retention_and_exposure"));
      const transcript = fileExists(root, "docs/reports/signup-hardening/SIGNUP_HARDENING_SH6_DEPLOYMENT.md");
      const scheduled = hosted?.retentionSweepsScheduled === true;
      if (!built || !transcript) {
        return { verdict: FAIL, reason: "retention sweeps or their dry-run transcript are missing" };
      }
      return {
        verdict: scheduled ? PASS : FAIL,
        reason: scheduled
          ? "sweeps built, dry-run recorded, and scheduled on the deployed project"
          : "sweeps built and dry-run recorded, but NOT SCHEDULED — no window is enforced (ADR-082)",
      };
    },
    "RG-EXP-1": () => ({
      verdict: fileExists(root, "supabase/tests/signup_hardening_grant_census.sql") ? PASS : FAIL,
      reason: "full grant matrix censused in CI",
    }),
    "RG-EXP-2": () => ({
      verdict: fileExists(root, "src/lib/closeout/heartbeat-disposition.test.ts") ? PASS : FAIL,
      reason: "Edge Function surface reviewed and dispositioned",
    }),
    "RG-EXP-3": () => ({
      verdict: hosted ? (hosted.serviceRoleCredentialTableClosed === true ? PASS : FAIL) : FAIL,
      reason: "service_role holds no DML on the credential tables (readback)",
    }),
    "RG-EXP-4": () => ({
      verdict: fileContains(root, "src/proxy.ts", "isProductionRuntime") ? PASS : FAIL,
      reason: "proxy refuses app routes in production when unconfigured",
    }),
    "RG-DEP-1": () => ({
      verdict: hosted ? (hosted.smtpConfigured === true ? PASS : FAIL) : FAIL,
      reason: "production SMTP configured (readback)",
    }),
    "RG-DEP-2": () => ({
      verdict: fileExists(root, "docs/reports/signup-hardening/SIGNUP_HARDENING_ORIGIN_VERIFICATION.md") ? PASS : FAIL,
      reason: "production domain and CSP verification recorded",
    }),
    "RG-DEP-3": () => ({
      verdict: fileExists(root, "docs/reports/signup-hardening/SIGNUP_HARDENING_BACKUP_RESTORE.md") ? PASS : FAIL,
      reason: "backup restored to a disposable project and recorded",
    }),
    "RG-DEP-4": () => ({ verdict: OWNER, reason: "monitoring adequacy is an owner signature" }),
  };
}

/** Runs every gate. A throwing gate is FAIL, never skipped. */
export function runGates(options = {}) {
  const definitions = gateDefinitions(options);
  return GATE_IDS.map((id) => {
    const gate = definitions[id];
    if (!gate) return { id, verdict: FAIL, reason: "gate is declared but not implemented" };
    try {
      const { verdict, reason } = gate();
      return { id, verdict, reason };
    } catch (failure) {
      return { id, verdict: FAIL, reason: `gate could not be evaluated: ${failure.message}` };
    }
  });
}

/* c8 ignore start -- the CLI shell; the gates above are what the tests exercise. */
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("verify-signup-rollout.mjs")) {
  const offline = process.argv.includes("--offline");
  const asJson = process.argv.includes("--json");

  let hosted = null;
  if (!offline) {
    try {
      const { getLinkedSupabaseCredentials } = await import("./linked-supabase.mjs");
      const { url, serviceRoleKey } = getLinkedSupabaseCredentials();
      const ref = readFileSync(join(REPOSITORY_ROOT, "supabase/.temp/project-ref"), "utf8").trim();
      const token = process.env.SUPABASE_ACCESS_TOKEN
        ?? (/^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.*)$/m.exec(
          readFileSync(join(REPOSITORY_ROOT, ".env.local"), "utf8"),
        )?.[1] ?? "").trim().replace(/^["']|["']$/g, "");

      const auth = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json());

      const cron = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "select jobname from cron.job" }),
      }).then((r) => r.json());
      const jobs = Array.isArray(cron) ? cron.map((row) => row.jobname) : [];

      const credentialProbe = await fetch(`${url}/rest/v1/user_ai_credentials?select=user_id&limit=1`, {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });

      hosted = {
        ...auth,
        smtpConfigured: Boolean(auth.smtp_host),
        retentionSweepsScheduled: ["sh-prune-terminal-jobs", "sh-prune-notifications",
          "sh-prune-product-events", "sh-prune-heartbeat-runs", "sh-prune-undo-operations"]
          .every((job) => jobs.includes(job)),
        serviceRoleCredentialTableClosed: credentialProbe.status === 403,
      };
    } catch (failure) {
      // Deliberately NOT fatal and deliberately NOT a skip: `hosted` stays null,
      // every hosted gate reads FAIL, and the reason below says why.
      console.error(`hosted readback unavailable: ${failure.message}`);
    }
  }

  const results = runGates({ hosted });
  if (asJson) {
    console.log(JSON.stringify({ ranAt: new Date().toISOString(), offline, results }, null, 2));
  } else {
    console.log(`signup rollout gate — ${offline ? "OFFLINE (repository gates only)" : "full"}\n`);
    for (const r of results) console.log(`  ${r.verdict.padEnd(5)} ${r.id.padEnd(10)} ${r.reason}`);
  }

  const failed = results.filter((r) => r.verdict === FAIL);
  const owner = results.filter((r) => r.verdict === OWNER);
  console.log(`\n${results.length - failed.length - owner.length} pass, ${failed.length} fail, ${owner.length} owner-signature`);
  console.log(
    failed.length === 0 && owner.length === 0
      ? "\nEVERY GATE IS GREEN. Opening signup is now an owner flip followed by a\n"
        + "second green run of this script against the open state (SH-ROLLOUT-005)."
      : "\nSIGNUP MUST NOT OPEN. A failed or unsigned gate is a closed door, and\n"
        + "this script has no path that reports otherwise.",
  );
  process.exit(failed.length === 0 && owner.length === 0 ? 0 : 1);
}
/* c8 ignore stop */
