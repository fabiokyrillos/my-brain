import { describe, expect, it } from "vitest";

import { TASK_MATCH_LIMITS, TASK_MATCH_POLICY_VERSION } from "./match-policy";
import { rankTaskCandidates, type TaskCandidateRow, type TaskMatchOutcome } from "./matching";
import { validateTaskCommand, type ValidatedTaskCommand } from "./schema";
import type { TaskCommandAction } from "./taxonomy";

/**
 * PRD 2E-MATCH-018 — the measured match-quality baseline.
 *
 * Phase 2E chose deterministic matching over semantic retrieval on evidence
 * (PRD §23.1), and §22 makes this corpus the bar Phase 2F's semantic signal
 * must beat. A baseline nobody can reproduce is not evidence, so it is computed
 * here from a committed corpus rather than quoted from a spreadsheet: the rates
 * below are what the report cites, and changing a weight moves them in the same
 * commit that moves the policy digest.
 *
 * The corpus is adversarial where the PRD says the risk is — identical titles,
 * near-equal candidates, ineligible statuses, an overflowing set, a hint that
 * shares one token out of five — not a set of happy paths chosen to make the
 * one-step rate look good.
 */

const NOW = "2026-07-25T12:00:00.000Z";
const TIME_ZONE = "America/Sao_Paulo";
const OWNER = "11111111-1111-4111-8111-111111111111";

function command(
  action: TaskCommandAction,
  targetHints: Record<string, unknown>,
  patch: Record<string, string> = {},
): ValidatedTaskCommand {
  const result = validateTaskCommand(
    { action, targetHints, patch, operationKey: "aaaaaaaa-1111-4111-8111-111111111111" },
    { now: NOW, timeZone: TIME_ZONE },
  );
  if (result.status !== "ok") throw new Error(`corpus command invalid: ${JSON.stringify(result)}`);
  return result.command;
}

function row(overrides: Partial<TaskCandidateRow> & { taskId: string }): TaskCandidateRow {
  return {
    ownerId: OWNER,
    title: "Send the report",
    status: "todo",
    dueAt: null,
    plannedAt: null,
    manualPriority: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    description: null,
    completedAt: null,
    cancelledAt: null,
    intentionalNoDue: false,
    noDueReason: null,
    updatedAt: "2026-07-01T00:00:00.000Z",
    projectIds: [],
    contextIds: [],
    personIds: [],
    personRoles: [],
    observedBefore: NOW,
    projectNames: [],
    contextNames: [],
    personNames: [],
    projectHintMatched: false,
    contextHintMatched: false,
    personHintMatched: false,
    lastAuditedAt: null,
    prefilterTier: 3,
    tokenOverlap: 0,
    queryTokenCount: 0,
    effectiveLimit: TASK_MATCH_LIMITS.candidates,
    ...overrides,
  };
}

function exact(taskId: string, overrides: Partial<TaskCandidateRow> = {}): TaskCandidateRow {
  return row({ taskId, prefilterTier: 0, tokenOverlap: 1, queryTokenCount: 1, ...overrides });
}

type Scenario = {
  readonly id: string;
  readonly command: ValidatedTaskCommand;
  readonly rows: readonly TaskCandidateRow[];
  readonly outcome: TaskMatchOutcome;
  readonly oneStep: boolean;
};

const CORPUS: readonly Scenario[] = [
  {
    id: "exact-title-unique",
    command: command("complete_task", { titleWords: ["report"] }),
    rows: [exact("t1")],
    outcome: "matched",
    oneStep: true,
  },
  {
    id: "phrase-title-unique",
    command: command("complete_task", { titleWords: ["report"] }),
    rows: [row({ taskId: "t1", prefilterTier: 1, tokenOverlap: 1, queryTokenCount: 1 })],
    outcome: "matched",
    oneStep: true,
  },
  {
    id: "two-identical-titles",
    command: command("reschedule_due", { titleWords: ["invoice"] }, { dueAt: "tomorrow" }),
    rows: [exact("t1"), exact("t2")],
    outcome: "ambiguous",
    oneStep: false,
  },
  {
    id: "cancel-unambiguous",
    command: command("cancel_task", { titleWords: ["gym"] }),
    rows: [exact("t1")],
    outcome: "matched_requires_confirmation",
    oneStep: false,
  },
  {
    id: "restore-unambiguous",
    command: command("restore_task", { titleWords: ["gym"] }),
    rows: [exact("t1", { status: "cancelled" })],
    outcome: "matched",
    oneStep: false,
  },
  {
    id: "nothing-owned-matches",
    command: command("complete_task", { titleWords: ["flights"] }),
    rows: [],
    outcome: "unmatched",
    oneStep: false,
  },
  {
    id: "overflowing-set",
    command: command("complete_task", { titleWords: ["report"] }),
    rows: [exact("t1", { effectiveLimit: 1 }), exact("t2", { effectiveLimit: 1 })],
    outcome: "ambiguous_overflow",
    oneStep: false,
  },
  {
    id: "one-token-in-five",
    command: command("complete_task", { titleWords: ["a", "b", "c", "d", "e"] }),
    rows: [row({ taskId: "t1", prefilterTier: 2, tokenOverlap: 1, queryTokenCount: 5 })],
    outcome: "unmatched",
    oneStep: false,
  },
  {
    id: "project-hint-only",
    command: command("complete_task", { project: "Acme" }),
    rows: [row({ taskId: "t1", prefilterTier: 2, projectHintMatched: true })],
    outcome: "ambiguous",
    oneStep: false,
  },
  {
    id: "exact-title-and-project",
    command: command("complete_task", { titleWords: ["invoice"], project: "Acme" }),
    rows: [exact("t1", { projectHintMatched: true })],
    outcome: "matched",
    oneStep: true,
  },
  {
    id: "exact-beats-phrase",
    command: command("complete_task", { titleWords: ["report"] }),
    rows: [exact("t1"), row({ taskId: "t2", prefilterTier: 1, tokenOverlap: 1, queryTokenCount: 1 })],
    outcome: "matched",
    oneStep: true,
  },
  {
    id: "reschedule-unique",
    command: command("reschedule_due", { titleWords: ["dentist"] }, { dueAt: "tomorrow" }),
    rows: [exact("t1")],
    outcome: "matched",
    oneStep: true,
  },
  {
    id: "set-priority-unique",
    command: command("set_priority", { titleWords: ["taxes"] }, { priority: "high" }),
    rows: [exact("t1")],
    outcome: "matched",
    oneStep: true,
  },
  {
    id: "exact-title-but-ineligible",
    command: command("complete_task", { titleWords: ["report"] }),
    rows: [exact("t1", { status: "completed" })],
    outcome: "unmatched",
    oneStep: false,
  },
];

function rate(count: number, total: number): number {
  return Math.round((count / total) * 1_000) / 1_000;
}

describe("match-quality baseline (2E-MATCH-018)", () => {
  const results = CORPUS.map((scenario) => ({
    scenario,
    result: rankTaskCandidates({
      command: scenario.command,
      rows: scenario.rows,
      ownerId: OWNER,
      now: NOW,
      timeZone: TIME_ZONE,
    }),
  }));

  it.each(results)("$scenario.id resolves as the corpus declares", ({ scenario, result }) => {
    expect(result.outcome).toBe(scenario.outcome);
    expect(result.oneStep).toBe(scenario.oneStep);
  });

  it("measures the baseline the phase report cites", () => {
    const total = results.length;
    const measured = {
      policyVersion: TASK_MATCH_POLICY_VERSION,
      scenarios: total,
      oneStep: rate(results.filter(({ result }) => result.oneStep).length, total),
      matchedNeedsDeliberateness: rate(
        results.filter(({ result }) => result.outcome === "matched" && !result.oneStep).length,
        total,
      ),
      confirmationRequired: rate(
        results.filter(({ result }) => result.outcome === "matched_requires_confirmation").length,
        total,
      ),
      ambiguous: rate(
        results.filter(({ result }) =>
          result.outcome === "ambiguous" || result.outcome === "ambiguous_overflow").length,
        total,
      ),
      noMatch: rate(results.filter(({ result }) => result.outcome === "unmatched").length, total),
    };

    // Pinned, not merely reported: a weight change that quietly turns an
    // ambiguity into a one-step apply has to come here and say so.
    expect(measured).toEqual({
      policyVersion: "2026-07-25.2",
      scenarios: 14,
      oneStep: 0.429,
      matchedNeedsDeliberateness: 0.071,
      confirmationRequired: 0.071,
      ambiguous: 0.214,
      noMatch: 0.214,
    });
  });

  it("never one-step applies anything the user did not identify unambiguously", () => {
    for (const { result } of results) {
      if (!result.oneStep) continue;
      expect(result.outcome).toBe("matched");
      expect(result.overflowed).toBe(false);
      expect(result.destructive).toBe(false);
      expect(result.margin).toBeGreaterThanOrEqual(0.12);
    }
  });
});
