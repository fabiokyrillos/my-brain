import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadTaskCandidates } from "./candidates";
import { TASK_MATCH_POLICY_VERSION } from "./match-policy";
import { rankTaskCandidates, type TaskMatchOutcome } from "./matching";
import { validateTaskCommand, type ValidatedTaskCommand } from "./schema";
import type { TaskCommandAction } from "./taxonomy";

/**
 * PRD 2F-MEASURE-007 — the **end-to-end** match-quality baseline (ADR-059).
 *
 * Phase 2E published a pinned baseline and shipped a caveat with it: the
 * 14-scenario corpus in `match-baseline.test.ts` supplies `prefilterTier`,
 * `tokenOverlap` and `queryTokenCount` **by hand**, so those rates measure the
 * scoring layer against declared SQL verdicts. `PHASE_2E_FINAL_REPORT.md` says
 * plainly that "an end-to-end corpus needs a database and therefore needs
 * deployment", and forbids comparing a future end-to-end number against the
 * scoring-layer one. This file is that measurement, and the two numbers are
 * published side by side with their scope labels — never subtracted.
 *
 * What makes it end-to-end is that none of the scoring inputs is hand-written:
 * the candidate rows come from the deployed `list_task_command_candidates`
 * through the real `loadTaskCandidates`, and the verdicts come from the real
 * `rankTaskCandidates`. The only hand-written things are the seeded tasks and the
 * typed commands, which is what a corpus is.
 *
 * Seeding uses the service-role client — the pattern
 * `scripts/remote-phase-2e-smoke.mjs:154-158` already uses, untouched by Slice
 * 2F.4's revocation, which revoked from `authenticated` only. Seeding is fixture
 * setup, not the contract under measurement: every measured step below runs
 * through the owner's own session, where `auth.uid()` scoping is real.
 *
 * It creates no entries, so it never races the `pg_cron` interpretation drain.
 * Cleanup is fail-closed: a fixture that survives throws out of `afterAll`.
 */

const NOW = "2026-07-29T15:00:00.000Z";
const TIME_ZONE = "America/Sao_Paulo";

type Credentials = {
  readonly url: string;
  readonly publishableKey: string;
  readonly serviceRoleKey: string;
};

type Scenario = {
  readonly id: string;
  readonly command: ValidatedTaskCommand;
};

type SeedTask = {
  readonly title: string;
  readonly status: "todo" | "in_progress" | "waiting" | "completed" | "cancelled";
  readonly dueAt?: string | null;
};

/**
 * The corpus, chosen against the risks the Phase 2E PRD names rather than
 * against happy paths: two identical titles, a word several rows share, an
 * ineligible status, a phrase match, and a command whose target does not exist.
 */
const SEED_TASKS: readonly SeedTask[] = [
  { title: "Send the quarterly report to Marina", status: "todo" },
  { title: "Send the quarterly report to Marina", status: "todo" },
  { title: "Call the dentist about the crown", status: "todo" },
  { title: "Review the budget spreadsheet", status: "todo", dueAt: "2026-07-30T12:00:00.000Z" },
  { title: "Archive the old invoices", status: "cancelled" },
  { title: "Pay the electricity bill", status: "todo", dueAt: "2026-07-31T12:00:00.000Z" },
  { title: "Draft the onboarding checklist", status: "in_progress" },
  { title: "Prepare the offsite agenda", status: "waiting" },
];

function command(
  id: string,
  action: TaskCommandAction,
  targetHints: Record<string, unknown>,
  patch: Record<string, string> = {},
): Scenario {
  const result = validateTaskCommand(
    { action, targetHints, patch, operationKey: crypto.randomUUID() },
    { now: NOW, timeZone: TIME_ZONE },
  );
  if (result.status !== "ok") {
    throw new Error(`corpus command ${id} is invalid: ${JSON.stringify(result)}`);
  }
  return { id, command: result.command };
}

/**
 * Two shapes the corpus has to respect, both of them the product's own rules.
 *
 * `targetHints` carries `titleWords`, never a title (`schema.ts:110-124`): the
 * model copies the user's words and the matcher decides which row they name, so
 * a corpus written with whole titles would be testing an input shape the product
 * does not accept. And a status-carrying action takes an **empty** patch — the
 * destination comes from the taxonomy, and passing it explicitly is
 * `forbidden_patch_field`. Only `set_status` and `rename_task` carry one.
 */
const CORPUS: readonly Scenario[] = [
  // Words that name exactly one row.
  command("exact-unique", "complete_task", { titleWords: ["call", "dentist", "crown"] }),
  // Two rows carry these words verbatim: the ambiguity the PRD says must not
  // resolve itself.
  command("exact-duplicate", "complete_task",
    { titleWords: ["send", "quarterly", "report", "marina"] }),
  // A phrase out of the middle of one title.
  command("phrase", "complete_task", { titleWords: ["budget", "spreadsheet"] }),
  // One word that several rows share, which is what a weak overlap looks like.
  command("weak-overlap", "complete_task", { titleWords: ["report"] }),
  // Nothing in the corpus resembles this.
  command("absent", "complete_task", { titleWords: ["renew", "passport"] }),
  // Destructive: never one-step, whatever the match quality.
  command("destructive-exact", "cancel_task", { titleWords: ["pay", "electricity", "bill"] }),
  // Names a row whose status the action cannot act on.
  command("ineligible-status", "complete_task", { titleWords: ["archive", "old", "invoices"] }),
  // A row already in a non-initial state.
  command("in-progress", "complete_task", { titleWords: ["draft", "onboarding", "checklist"] }),
  // A status move where the destination comes from the patch rather than from
  // the taxonomy.
  command("waiting-set-status", "set_status", { titleWords: ["prepare", "offsite", "agenda"] },
    { status: "todo" }),
  // A rename, which carries a patch the matcher does not score on.
  command("rename", "rename_task", { titleWords: ["review", "budget", "spreadsheet"] },
    { title: "Review the annual budget spreadsheet" }),
];

function ratio(count: number, total: number): number {
  return Math.round((count / total) * 1000) / 1000;
}

let credentials: Credentials;
let admin: SupabaseClient;
let owner: SupabaseClient;
let ownerId: string;

const measured: { outcome: TaskMatchOutcome; oneStep: boolean; id: string }[] = [];

beforeAll(async () => {
  const { getLinkedSupabaseCredentials } = await import("../../../scripts/linked-supabase.mjs");
  credentials = getLinkedSupabaseCredentials() as Credentials;
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  admin = createClient(credentials.url, credentials.serviceRoleKey, options);

  const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const password = `Phase-2F5-${crypto.randomUUID()}!`;
  const created = await admin.auth.admin.createUser({
    email: `phase-2f5-baseline-${suffix}@example.test`,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw new Error(`create baseline owner (${created.error?.message ?? "no user returned"})`);
  }
  ownerId = created.data.user.id;

  owner = createClient(credentials.url, credentials.publishableKey, options);
  const session = await owner.auth.signInWithPassword({
    email: created.data.user.email as string,
    password,
  });
  if (session.error) throw new Error(`sign in baseline owner (${session.error.message})`);

  const seed = await admin.from("tasks").insert(SEED_TASKS.map((task) => ({
    user_id: ownerId,
    title: task.title,
    status: task.status,
    due_at: task.dueAt ?? null,
  }))).select("id");
  if (seed.error) throw new Error(`seed baseline corpus (${seed.error.message})`);
  if ((seed.data ?? []).length !== SEED_TASKS.length) {
    throw new Error(`seed baseline corpus: expected ${SEED_TASKS.length} rows`);
  }

  for (const scenario of CORPUS) {
    const rows = await loadTaskCandidates({
      client: owner,
      command: scenario.command,
      ownerId,
      now: NOW,
    });
    const result = rankTaskCandidates({
      command: scenario.command,
      rows,
      ownerId,
      now: NOW,
      timeZone: TIME_ZONE,
    });
    measured.push({ id: scenario.id, outcome: result.outcome, oneStep: result.oneStep });
  }
});

afterAll(async () => {
  // Fail-closed: the run must prove its fixtures are gone, not hope so. Task
  // rows leave with the owner through the `auth.users` cascade. A throw here is
  // reported as a suite failure, so residue turns the run red rather than
  // printing a warning nobody reads.
  if (!admin || !ownerId) return;
  await owner?.auth.signOut();
  const removed = await admin.auth.admin.deleteUser(ownerId);
  if (removed.error) {
    throw new Error(`baseline fixture owner survived the run: ${removed.error.message}`);
  }
  const still = await admin.auth.admin.getUserById(ownerId);
  if (still.data?.user) throw new Error("baseline fixture owner survived deletion");
});

describe("the end-to-end match-quality baseline (2F-MEASURE-007)", () => {
  it("resolved every corpus command through the deployed candidate query", () => {
    expect(measured).toHaveLength(CORPUS.length);
    expect(measured.map((entry) => entry.id)).toEqual(CORPUS.map((scenario) => scenario.id));
  });

  it("measures the end-to-end baseline the slice report cites", () => {
    const total = measured.length;
    const rate = (predicate: (entry: typeof measured[number]) => boolean) =>
      ratio(measured.filter(predicate).length, total);

    const baseline = {
      scope: "end-to-end",
      policyVersion: TASK_MATCH_POLICY_VERSION,
      scenarios: total,
      oneStep: rate((entry) => entry.oneStep),
      matchedNeedsDeliberateness: rate((entry) => entry.outcome === "matched" && !entry.oneStep),
      confirmationRequired: rate((entry) => entry.outcome === "matched_requires_confirmation"),
      ambiguous: rate((entry) =>
        entry.outcome === "ambiguous" || entry.outcome === "ambiguous_overflow"),
      noMatch: rate((entry) => entry.outcome === "unmatched"),
    };

    // Pinned, not merely reported: a weight change that quietly turns an
    // ambiguity into a one-step apply has to come to this line and say so — the
    // same discipline `match-baseline.test.ts` applies to the scoring layer.
    //
    // This number is **end-to-end**. `match-baseline.test.ts` measures the
    // **scoring layer**. They are two scopes, published together and never
    // compared against each other (2E-MATCH-018's caveat, discharged by
    // measuring rather than by argument).
    // The headline number is the **ambiguity rate**, and it is far higher end to
    // end than the scoring-layer corpus suggested. That is the measurement doing
    // its job: SQL's real prefilter and real token overlap put more rows in front
    // of the scorer than a hand-written triple did, and shared words like
    // "report" genuinely name two tasks in this corpus. It is also exactly why
    // ADR-055 makes ambiguity **permanently non-authorizing** — a high ambiguity
    // rate is a matcher observation, not evidence for semantic retrieval.
    expect(baseline).toEqual({
      scope: "end-to-end",
      policyVersion: "2026-07-25.3",
      scenarios: 10,
      oneStep: 0.1,
      matchedNeedsDeliberateness: 0,
      confirmationRequired: 0,
      ambiguous: 0.7,
      noMatch: 0.2,
    });
    // The five categories partition the corpus: no scenario is uncounted and
    // none is counted twice.
    const covered = baseline.oneStep + baseline.matchedNeedsDeliberateness
      + baseline.confirmationRequired + baseline.ambiguous + baseline.noMatch;
    expect(covered).toBeCloseTo(1, 10);
  });

  it("never one-step applies anything the user did not identify unambiguously", () => {
    for (const entry of measured) {
      if (!entry.oneStep) continue;
      expect(entry.outcome).toBe("matched");
    }
  });

  it("resolves the duplicate-title scenario as ambiguous, end to end", () => {
    // The scoring-layer corpus asserts this against a hand-written candidate
    // set. Here SQL produced the set, so this is the first time the claim is
    // proven against the real prefilter.
    const duplicate = measured.find((entry) => entry.id === "exact-duplicate");
    expect(duplicate?.outcome).toBe("ambiguous");
    expect(duplicate?.oneStep).toBe(false);
  });

  it("finds nothing for a command whose target the corpus does not contain", () => {
    expect(measured.find((entry) => entry.id === "absent")?.outcome).toBe("unmatched");
  });

  it("refuses one-step for a destructive action however well it matched", () => {
    const destructive = measured.find((entry) => entry.id === "destructive-exact");
    expect(destructive?.oneStep).toBe(false);
  });
});
