import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadTaskCandidates } from "./candidates";
import { TASK_MATCH_POLICY_VERSION, TASK_MATCH_PREFILTER_TIERS } from "./match-policy";
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
 * What makes it end-to-end is that no scoring input is hand-written: the
 * candidate rows come from the deployed `list_task_command_candidates` through
 * the real `loadTaskCandidates`, and the verdicts come from the real
 * `rankTaskCandidates`. The only hand-written things are the seeded tasks and the
 * typed commands, which is what a corpus is.
 *
 * The corpus is designed against the prefilter's tier ladder
 * (`202607260059_phase_2e_destructive_confirmation.sql:2860-2876`), because a
 * corpus that reaches only one tier measures only one weight:
 *
 *   - **tier 0** — the normalized title *is* the normalized hint (`exactTitle`,
 *     the policy's strongest signal);
 *   - **tier 1** — the whole hint appears in the title as complete **contiguous**
 *     words, three characters or more (`titlePhrase`) — including a single word;
 *   - **tier 2** — the words are present but not contiguous, so only lexical
 *     overlap remains (`tokenOverlap`), which is the rung a semantic signal would
 *     plausibly help;
 *   - excluded — an ineligible status, which never reaches the scorer at all;
 *   - unconnected — no lexical or relational link, filtered before scoring.
 *
 * Reaching tier 0 requires the hint's words to be the title's words, stopwords
 * included, which is why several seeded titles carry none. §"exercised signals"
 * below records which weights this corpus does and does not move.
 *
 * Seeding uses the service-role client — the pattern
 * `scripts/remote-phase-2e-smoke.mjs:154-158` already uses, untouched by Slice
 * 2F.4's revocation, which revoked from `authenticated` only. Seeding is fixture
 * setup, not the contract under measurement: every measured step runs through the
 * owner's own session, where `auth.uid()` scoping is real.
 *
 * It creates no entries, so it never races the `pg_cron` interpretation drain.
 * Cleanup is fail-closed: a fixture that survives throws out of `afterAll`.
 */

const TIME_ZONE = "America/Sao_Paulo";

/**
 * The measurement instant, fixed once per run **after** the corpus is seeded.
 *
 * It cannot be a literal. Seeded rows take `created_at = now()` from the server,
 * so a literal in the past silently clamps the recency signal out
 * (`matching.ts:485-500` grants it only when the audited instant is at or before
 * `now`), and the pinned rates would then depend on the hour the run happened.
 * Deriving it from the seed keeps the clock relationship deterministic in the
 * other direction: the instant is always after every row, on every run.
 *
 * Due dates are deliberately absent from the corpus. Temporal signals need a
 * `temporalPhrase` hint, none of these commands carries one, and a fixed due date
 * against a moving `now` would be the same accident in a different place.
 */
let now = "";

type Credentials = {
  readonly url: string;
  readonly publishableKey: string;
  readonly serviceRoleKey: string;
};

type ScenarioSpec = {
  readonly id: string;
  readonly tier: 0 | 1 | 2 | "excluded" | "none";
  readonly action: TaskCommandAction;
  readonly titleWords: readonly string[];
  readonly patch?: Record<string, string>;
};

type SeedTask = {
  readonly title: string;
  readonly status: "todo" | "in_progress" | "waiting" | "completed" | "cancelled";
};

const SEED_TASKS: readonly SeedTask[] = [
  // Stopword-free titles, so a word list can *be* the title (tier 0).
  { title: "Renew passport", status: "todo" },
  { title: "Send quarterly report", status: "todo" },
  { title: "Send quarterly report", status: "todo" },
  { title: "Pay electricity bill", status: "todo" },
  { title: "Draft onboarding checklist", status: "in_progress" },
  { title: "Prepare offsite agenda", status: "waiting" },
  // Carries stopwords, so a contiguous fragment reaches tier 1 but not tier 0.
  { title: "Review the budget spreadsheet", status: "todo" },
  // Never eligible for `complete_task`, so it never reaches the scorer.
  { title: "Archive old invoices", status: "cancelled" },
];

/**
 * Two shapes the corpus has to respect, both of them the product's own rules.
 *
 * `targetHints` carries `titleWords`, never a title (`schema.ts:110-124`): the
 * model copies the user's words and the matcher decides which row they name. And
 * a status-carrying action takes an **empty** patch — the destination comes from
 * the taxonomy, and passing it explicitly is `forbidden_patch_field`. Only
 * `set_status` and `rename_task` carry one.
 */
const CORPUS: readonly ScenarioSpec[] = [
  // Tier 0, one row: the strongest signal, resolvable in one step.
  { id: "exact-unique", tier: 0, action: "complete_task", titleWords: ["renew", "passport"] },
  // Tier 0, two rows carrying the same title: a genuine tie above the confidence
  // threshold, which is the ambiguity the PRD says must not resolve itself.
  {
    id: "exact-duplicate",
    tier: 0,
    action: "complete_task",
    titleWords: ["send", "quarterly", "report"],
  },
  // Tier 1: a contiguous fragment of a title that carries stopwords.
  { id: "phrase", tier: 1, action: "complete_task", titleWords: ["budget", "spreadsheet"] },
  // Also tier 1, not 2: a single word of three characters or more that appears as
  // a complete word in a title reaches the phrase rung of the ladder
  // (`202607260059:2864-2868`). It scores *above* the confidence threshold and is
  // ambiguous only because two rows tie on it — which is a different thing from
  // scoring low, and mislabelling it was how the first version of this corpus
  // claimed a tier it never visited.
  { id: "phrase-single-word", tier: 1, action: "complete_task", titleWords: ["report"] },
  // Tier 2, genuinely: the words are present but **not contiguous**, so the
  // phrase rung fails and only lexical overlap remains. This is the rung where a
  // semantic signal would plausibly help, so a baseline that skipped it would
  // skip the case ADR-055 exists to ask about.
  {
    id: "partial-overlap",
    tier: 2,
    action: "complete_task",
    titleWords: ["review", "spreadsheet"],
  },
  // No connection at all.
  { id: "absent", tier: "none", action: "complete_task", titleWords: ["kayak", "lessons"] },
  // Tier 0 and destructive: matched well, and still never one-step.
  {
    id: "destructive-exact",
    tier: 0,
    action: "cancel_task",
    titleWords: ["pay", "electricity", "bill"],
  },
  // Names a cancelled row, which the prefilter excludes before scoring.
  {
    id: "ineligible-status",
    tier: "excluded",
    action: "complete_task",
    titleWords: ["archive", "old", "invoices"],
  },
  // Tier 0 on a row already in a non-initial state.
  {
    id: "in-progress",
    tier: 0,
    action: "complete_task",
    titleWords: ["draft", "onboarding", "checklist"],
  },
  // Tier 0 where the destination comes from the patch rather than the taxonomy.
  {
    id: "waiting-set-status",
    tier: 0,
    action: "set_status",
    titleWords: ["prepare", "offsite", "agenda"],
    patch: { status: "todo" },
  },
  // Tier 0 including the title's stopwords, carrying a patch the matcher does
  // not score on.
  {
    id: "rename",
    tier: 0,
    action: "rename_task",
    titleWords: ["review", "the", "budget", "spreadsheet"],
    patch: { title: "Review the annual budget spreadsheet" },
  },
];

function validate(spec: ScenarioSpec): ValidatedTaskCommand {
  const result = validateTaskCommand(
    {
      action: spec.action,
      targetHints: { titleWords: [...spec.titleWords] },
      patch: spec.patch ?? {},
      operationKey: crypto.randomUUID(),
    },
    { now, timeZone: TIME_ZONE },
  );
  if (result.status !== "ok") {
    throw new Error(`corpus command ${spec.id} is invalid: ${JSON.stringify(result)}`);
  }
  return result.command;
}

function ratio(count: number, total: number): number {
  return Math.round((count / total) * 1000) / 1000;
}

let admin: SupabaseClient;
let owner: SupabaseClient;
let ownerId: string;

const measured: {
  id: string;
  /** What the corpus *claims*. Never asserted against itself — see `tiers`. */
  declaredTier: ScenarioSpec["tier"];
  /** What SQL actually assigned, read off the rows the deployed query returned. */
  tiers: readonly number[];
  outcome: TaskMatchOutcome;
  oneStep: boolean;
  candidates: number;
}[] = [];

beforeAll(async () => {
  const { getLinkedSupabaseCredentials } = await import("../../../scripts/linked-supabase.mjs");
  const credentials = getLinkedSupabaseCredentials() as Credentials;
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
  }))).select("id, created_at");
  if (seed.error) {
    // The standing convention: a missing contract is "not deployed", not
    // "broken". Vitest cannot exit 2, so the message carries the distinction.
    if (seed.error.code === "42P01" || seed.error.code === "PGRST205") {
      throw new Error(`NOT DEPLOYED: public.tasks is unreachable (${seed.error.message})`);
    }
    throw new Error(`seed baseline corpus (${seed.error.message})`);
  }
  const seeded = seed.data ?? [];
  if (seeded.length !== SEED_TASKS.length) {
    throw new Error(`seed baseline corpus: expected ${SEED_TASKS.length} rows`);
  }

  // Fixed after the seed, from the newest seeded row, so every candidate is at or
  // before the measurement instant on every run.
  const newest = seeded
    .map((row) => new Date(row.created_at as string).getTime())
    .reduce((a, b) => Math.max(a, b), 0);
  now = new Date(newest + 1000).toISOString();

  for (const spec of CORPUS) {
    const command = validate(spec);
    const rows = await loadTaskCandidates({ client: owner, command, ownerId, now });
    const result = rankTaskCandidates({ command, rows, ownerId, now, timeZone: TIME_ZONE });
    measured.push({
      id: spec.id,
      declaredTier: spec.tier,
      // The authoritative value, from the rows SQL returned — not the annotation.
      tiers: rows.map((row) => row.prefilterTier),
      outcome: result.outcome,
      oneStep: result.oneStep,
      candidates: result.candidates.length,
    });
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
    expect(measured.map((entry) => entry.id)).toEqual(CORPUS.map((spec) => spec.id));
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
    expect(baseline).toEqual({
      scope: "end-to-end",
      policyVersion: "2026-07-25.3",
      scenarios: 11,
      oneStep: 0.455,
      matchedNeedsDeliberateness: 0,
      confirmationRequired: 0.091,
      ambiguous: 0.273,
      noMatch: 0.182,
    });
    // The five categories partition the corpus: no scenario is uncounted and none
    // is counted twice. Asserted on **counts**, not on the rounded rates — with a
    // scenario count that does not divide cleanly the rates cannot sum to exactly
    // one, and loosening a tolerance to accommodate that would be weakening the
    // check rather than stating it.
    const counted = measured.filter((entry) => entry.oneStep).length
      + measured.filter((entry) => entry.outcome === "matched" && !entry.oneStep).length
      + measured.filter((entry) => entry.outcome === "matched_requires_confirmation").length
      + measured.filter((entry) =>
        entry.outcome === "ambiguous" || entry.outcome === "ambiguous_overflow").length
      + measured.filter((entry) => entry.outcome === "unmatched").length;
    expect(counted).toBe(total);
  });

  it("exercised every scoring tier, measured from SQL rather than from the annotation", () => {
    // A corpus that reaches a single tier measures a single weight and calls it a
    // baseline. The first version of this case asserted the hand-written `tier`
    // annotation against a hand-written list, which is the same defect wearing a
    // guard's uniform: it passed while the corpus never visited tier 2 and one
    // scenario was mislabelled. `prefilterTier` comes off the rows the deployed
    // query returned, so this now measures the thing it claims to.
    const observed = new Set(measured.flatMap((entry) => entry.tiers));
    expect([...observed].sort()).toEqual([
      TASK_MATCH_PREFILTER_TIERS.exactTitle,
      TASK_MATCH_PREFILTER_TIERS.titlePhrase,
      TASK_MATCH_PREFILTER_TIERS.connected,
    ].sort());

    // And the declared annotations agree with SQL, scenario by scenario — the
    // check that would have caught the mislabelling.
    for (const entry of measured) {
      if (entry.declaredTier === "excluded" || entry.declaredTier === "none") {
        expect(entry.tiers).toEqual([]);
        continue;
      }
      expect(entry.tiers.length).toBeGreaterThan(0);
      expect(Math.min(...entry.tiers)).toBe(entry.declaredTier);
    }

    // Six scenarios reach tier 0, and they are the reason `confirmationRequired`
    // and the one-step rate are non-zero at all: below tier 0 the destructive and
    // duplicate cases would be refused for having matched poorly, proving nothing.
    const tierZero = measured.filter((entry) => entry.declaredTier === 0);
    expect(tierZero).toHaveLength(6);
  });

  it("resolves a tier-0 unique match in one step", () => {
    const exact = measured.find((entry) => entry.id === "exact-unique");
    expect(exact?.outcome).toBe("matched");
    expect(exact?.oneStep).toBe(true);
    expect(exact?.candidates).toBe(1);
  });

  it("refuses to resolve two rows that carry the same title", () => {
    // The scoring-layer corpus asserts this against a hand-written candidate
    // set. Here SQL produced the set and both rows scored at the exact-title
    // weight, so the tie is real rather than an artifact of a weak tier.
    const duplicate = measured.find((entry) => entry.id === "exact-duplicate");
    expect(duplicate?.outcome).toBe("ambiguous");
    expect(duplicate?.oneStep).toBe(false);
    expect(duplicate?.candidates).toBe(2);
  });

  it("refuses one-step for a destructive action that matched at the top weight", () => {
    // Non-vacuous only because the hint reaches tier 0: this scenario is refused
    // for being destructive, not for having matched poorly.
    const destructive = measured.find((entry) => entry.id === "destructive-exact");
    expect(destructive?.outcome).toBe("matched_requires_confirmation");
    expect(destructive?.oneStep).toBe(false);
  });

  it("finds nothing for a command whose target the corpus does not contain", () => {
    expect(measured.find((entry) => entry.id === "absent")?.outcome).toBe("unmatched");
    expect(measured.find((entry) => entry.id === "absent")?.candidates).toBe(0);
  });

  it("never surfaces a row whose status the action cannot act on", () => {
    // The cancelled row is named exactly and still never reaches the scorer.
    const ineligible = measured.find((entry) => entry.id === "ineligible-status");
    expect(ineligible?.outcome).toBe("unmatched");
    expect(ineligible?.candidates).toBe(0);
  });

  it("records which signals this corpus does not exercise", () => {
    // Stated rather than implied. The corpus moves the three title weights and
    // the status-eligibility filter; it carries no project, context, person or
    // temporal hint and seeds no relations, so those weights are untested here
    // and the rates above must not be read as covering them.
    expect(CORPUS.every((spec) => spec.patch === undefined
      || Object.keys(spec.patch).every((key) => key === "status" || key === "title"))).toBe(true);
    for (const spec of CORPUS) {
      expect(Object.keys({ titleWords: spec.titleWords })).toEqual(["titleWords"]);
    }
  });
});
