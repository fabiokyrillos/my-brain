import { describe, expect, it } from "vitest";

import {
  TASK_MATCH_EVIDENCE,
  TASK_MATCH_LIMITS,
  TASK_MATCH_POLICY_VERSION,
  TASK_MATCH_THRESHOLDS,
  TASK_MATCH_WEIGHTS,
} from "./match-policy";
import { eligibleStatusesFor, rankTaskCandidates, type TaskCandidateRow } from "./matching";
import { validateTaskCommand, type ValidatedTaskCommand } from "./schema";
import { TASK_COMMAND_ACTIONS, actionPolicy, type TaskCommandAction } from "./taxonomy";
import { resolveTemporalPhrase } from "./temporal";

const NOW = "2026-07-25T12:00:00.000Z";
const TIME_ZONE = "America/Sao_Paulo";
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER_OWNER = "22222222-2222-4222-8222-222222222222";

/**
 * Fixtures are built through `validateTaskCommand` rather than as bare object
 * literals, so a change to the command contract that makes these commands
 * unrepresentable fails here instead of leaving the matcher tested against a
 * shape nothing can produce.
 */
function command(input: {
  action: TaskCommandAction;
  titleWords?: string[];
  project?: string;
  context?: string;
  person?: string;
  status?: string;
  temporalPhrase?: string;
  patch?: Record<string, string>;
}): ValidatedTaskCommand {
  const targetHints: Record<string, unknown> = {};
  if (input.titleWords) targetHints.titleWords = input.titleWords;
  if (input.project) targetHints.project = input.project;
  if (input.context) targetHints.context = input.context;
  if (input.person) targetHints.person = input.person;
  if (input.status) targetHints.status = input.status;
  if (input.temporalPhrase) targetHints.temporalPhrase = input.temporalPhrase;

  const result = validateTaskCommand(
    {
      action: input.action,
      targetHints,
      patch: input.patch ?? {},
      operationKey: "aaaaaaaa-1111-4111-8111-111111111111",
    },
    { now: NOW, timeZone: TIME_ZONE },
  );
  if (result.status !== "ok") {
    throw new Error(`fixture command is not valid: ${JSON.stringify(result)}`);
  }
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

/** A row the authoritative normalizer reported as an exact title hit. */
function exactRow(taskId: string, overrides: Partial<TaskCandidateRow> = {}): TaskCandidateRow {
  return row({ taskId, prefilterTier: 0, tokenOverlap: 1, queryTokenCount: 1, ...overrides });
}

function rank(rows: readonly TaskCandidateRow[], cmd: ValidatedTaskCommand) {
  return rankTaskCandidates({ command: cmd, rows, ownerId: OWNER, now: NOW, timeZone: TIME_ZONE });
}

describe("outcome classification (2E-MATCH-011/012/013)", () => {
  it("one clear exact hit is matched and one-step eligible", () => {
    const result = rank([exactRow("t1")], command({ action: "complete_task", titleWords: ["report"] }));

    expect(result.outcome).toBe("matched");
    expect(result.oneStep).toBe(true);
    expect(result.topScore).toBe(0.82);
    expect(result.candidates).toHaveLength(1);
    expect(result.matchPolicyVersion).toBe(TASK_MATCH_POLICY_VERSION);
  });

  it("a phrase hit still clears the threshold, which PRD 12.1 depends on", () => {
    // "mark the report task as done" against "Send the report": the hint is
    // contained, not equal. If this fell below the threshold the headline flow
    // of the PRD would be a disambiguation list of one.
    const result = rank(
      [row({ taskId: "t1", prefilterTier: 1, tokenOverlap: 1, queryTokenCount: 1 })],
      command({ action: "complete_task", titleWords: ["report"] }),
    );

    expect(result.outcome).toBe("matched");
    expect(result.topScore).toBeGreaterThanOrEqual(TASK_MATCH_THRESHOLDS.topScore);
  });

  it("two identically-scoring candidates are ambiguous, never a coin toss", () => {
    const result = rank(
      [exactRow("t1"), exactRow("t2")],
      command({ action: "complete_task", titleWords: ["report"] }),
    );

    expect(result.outcome).toBe("ambiguous");
    expect(result.margin).toBe(0);
    expect(result.oneStep).toBe(false);
    expect(result.candidates).toHaveLength(2);
  });

  it("a confident cancellation is matched_requires_confirmation, not ambiguous", () => {
    // PRD revision 3 corrected exactly this: collapsing gravity into confidence
    // showed the user a disambiguation list containing one entry.
    const result = rank([exactRow("t1")], command({ action: "cancel_task", titleWords: ["gym"] }));

    expect(result.outcome).toBe("matched_requires_confirmation");
    expect(result.oneStep).toBe(false);
    expect(result.destructive).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
  });

  it("restore_task is matched but never one-step, and needs no token", () => {
    const result = rank(
      [exactRow("t1", { status: "cancelled" })],
      command({ action: "restore_task", titleWords: ["gym"] }),
    );

    expect(result.outcome).toBe("matched");
    expect(result.oneStep).toBe(false);
    expect(result.requiresConfirmation).toBe(false);
  });

  it("no rows is unmatched", () => {
    const result = rank([], command({ action: "complete_task", titleWords: ["nothing"] }));

    expect(result.outcome).toBe("unmatched");
    expect(result.candidates).toEqual([]);
    expect(result.topScore).toBe(0);
  });

  it("a row below the floor is not a weak candidate, it is not a candidate", () => {
    // 2E-MATCH-015: one shared token out of five. There is no "first result" to
    // fall back to.
    const result = rank(
      [row({ taskId: "t1", prefilterTier: 2, tokenOverlap: 1, queryTokenCount: 5 })],
      command({ action: "complete_task", titleWords: ["a", "b", "c", "d", "e"] }),
    );

    expect(result.outcome).toBe("unmatched");
    expect(result.qualifyingCount).toBe(0);
  });

  it("a clear winner over a weaker runner-up is matched", () => {
    const result = rank(
      [
        exactRow("t1"),
        row({ taskId: "t2", prefilterTier: 1, tokenOverlap: 1, queryTokenCount: 1 }),
      ],
      command({ action: "complete_task", titleWords: ["report"] }),
    );

    expect(result.topScore).toBe(0.82);
    expect(result.margin).toBeCloseTo(0.2, 5);
    expect(result.outcome).toBe("matched");
  });

  it("a margin below the minimum is ambiguous however strong the top score", () => {
    // Both exact hits; one also holds the status the hint named. The top score
    // is 0.9 — far above the threshold — and it still may not apply, because
    // confidence in *identification* is what 2E-MATCH-011 measures.
    const result = rank(
      [exactRow("t1", { status: "blocked" }), exactRow("t2")],
      command({ action: "complete_task", titleWords: ["report"], status: "blocked" }),
    );

    expect(result.topScore).toBe(0.9);
    expect(result.margin).toBeCloseTo(0.08, 5);
    expect(result.margin).toBeLessThan(TASK_MATCH_THRESHOLDS.minMargin);
    expect(result.outcome).toBe("ambiguous");
    expect(result.oneStep).toBe(false);
  });
});

describe("overflow (2E-MATCH-004)", () => {
  it("a truncated set is ambiguous_overflow even when the top candidate is perfect", () => {
    const rows = [
      exactRow("t1", { effectiveLimit: 1 }),
      row({ taskId: "t2", effectiveLimit: 1, prefilterTier: 2, tokenOverlap: 1, queryTokenCount: 1 }),
    ];

    const result = rank(rows, command({ action: "complete_task", titleWords: ["report"] }));

    expect(result.overflowed).toBe(true);
    expect(result.outcome).toBe("ambiguous_overflow");
    expect(result.oneStep).toBe(false);
  });

  it("overflow outranks unmatched, because the winner may be the row that was cut", () => {
    const rows = [
      row({ taskId: "t1", effectiveLimit: 1 }),
      row({ taskId: "t2", effectiveLimit: 1 }),
    ];

    const result = rank(rows, command({ action: "complete_task" }));

    expect(result.qualifyingCount).toBe(0);
    expect(result.outcome).toBe("ambiguous_overflow");
  });

  it("reads the limit from the data, not from the constant this process asked for", () => {
    const rows = [
      exactRow("t1", { effectiveLimit: 3 }),
      exactRow("t2", { effectiveLimit: 3 }),
    ];

    const result = rank(rows, command({ action: "complete_task", titleWords: ["report"] }));

    expect(result.overflowed).toBe(false);
  });

  it("the probe row is never scored as a candidate", () => {
    const rows = [
      exactRow("t1", { effectiveLimit: 1 }),
      exactRow("probe", { effectiveLimit: 1 }),
    ];

    const result = rank(rows, command({ action: "complete_task", titleWords: ["report"] }));

    expect(result.candidates.map((candidate) => candidate.taskId)).toEqual(["t1"]);
  });
});

describe("ownership and eligibility (2E-MATCH-001/002)", () => {
  it("drops a row belonging to another owner", () => {
    const result = rank(
      [exactRow("t1", { ownerId: OTHER_OWNER })],
      command({ action: "complete_task", titleWords: ["report"] }),
    );

    expect(result.outcome).toBe("unmatched");
    expect(result.candidates).toEqual([]);
  });

  it("drops a row the action could not legally act upon", () => {
    // A completed task can never be completed again, whatever the RPC was asked
    // for. This layer is what survives a caller that built the status argument
    // from the wrong action.
    const result = rank(
      [exactRow("t1", { status: "completed" })],
      command({ action: "complete_task", titleWords: ["report"] }),
    );

    expect(result.outcome).toBe("unmatched");
  });

  it("ranks a cancelled task for restore_task and for nothing else", () => {
    const cancelled = [exactRow("t1", { status: "cancelled" })];

    expect(rank(cancelled, command({ action: "restore_task", titleWords: ["gym"] })).outcome)
      .toBe("matched");
    for (const action of TASK_COMMAND_ACTIONS) {
      if (action === "restore_task") continue;
      expect(rank(cancelled, command({
        action,
        titleWords: ["gym"],
        patch: patchFor(action),
      })).outcome).toBe("unmatched");
    }
  });

  it("exposes the taxonomy's eligible statuses verbatim", () => {
    for (const action of TASK_COMMAND_ACTIONS) {
      expect(eligibleStatusesFor(action)).toEqual(actionPolicy(action).eligibleFrom);
    }
  });
});

/** The minimum patch each action needs to validate, so fixtures stay legal. */
function patchFor(action: TaskCommandAction): Record<string, string> {
  const required = actionPolicy(action).requiredPatchFields;
  const patch: Record<string, string> = {};
  for (const field of required) {
    if (field === "status") patch.status = "todo";
    else if (field === "priority") patch.priority = "high";
    else if (field === "dueAt" || field === "plannedAt") patch[field] = "tomorrow";
    else if (field === "note") patch.note = "a note";
    else if (field === "title") patch.title = "a title";
    else patch[field] = "a reference";
  }
  return patch;
}

describe("signals and evidence (2E-MATCH-005/014)", () => {
  it("labels every signal that fired, from the closed vocabulary", () => {
    const result = rank(
      [
        exactRow("t1", {
          status: "blocked",
          projectHintMatched: true,
          contextHintMatched: true,
          personHintMatched: true,
          lastAuditedAt: "2026-07-25T11:00:00.000Z",
        }),
      ],
      command({
        action: "complete_task",
        titleWords: ["report"],
        project: "Acme",
        context: "Work",
        person: "Ana",
        status: "blocked",
      }),
    );

    expect(result.candidates[0].evidence).toEqual([
      "normalized_exact_title",
      "normalized_token_overlap",
      "referenced_project",
      "referenced_context",
      "referenced_person",
      "status_match",
      "recent_activity",
    ]);
    for (const label of result.candidates[0].evidence) {
      expect(TASK_MATCH_EVIDENCE).toContain(label);
    }
  });

  it("never credits an exact title with also containing itself", () => {
    const exact = rank([exactRow("t1")], command({ action: "complete_task", titleWords: ["report"] }));
    const phrase = rank(
      [row({ taskId: "t1", prefilterTier: 1, tokenOverlap: 1, queryTokenCount: 1 })],
      command({ action: "complete_task", titleWords: ["report"] }),
    );

    expect(exact.candidates[0].evidence).not.toContain("normalized_title_phrase");
    expect(phrase.candidates[0].evidence).not.toContain("normalized_exact_title");
    expect(exact.topScore - phrase.topScore).toBeCloseTo(
      TASK_MATCH_WEIGHTS.exactTitle - TASK_MATCH_WEIGHTS.titlePhrase,
      5,
    );
  });

  it("scales token overlap by the fraction of the hint the title carries", () => {
    const half = rank(
      [row({ taskId: "t1", prefilterTier: 2, tokenOverlap: 2, queryTokenCount: 4 })],
      command({ action: "complete_task", titleWords: ["a", "b", "c", "d"] }),
    );

    expect(half.candidates[0].score).toBe(0.11);
  });
});

describe("temporal proximity", () => {
  const resolved = resolveTemporalPhrase("tomorrow", { now: NOW, timeZone: TIME_ZONE });
  if (resolved.status !== "resolved") throw new Error("the lexicon no longer resolves 'tomorrow'");
  const hintMs = Date.parse(resolved.instant);

  function withDue(offsetHours: number) {
    return rank(
      [
        exactRow("t1", { dueAt: new Date(hintMs + offsetHours * 3_600_000).toISOString() }),
      ],
      command({ action: "complete_task", titleWords: ["report"], temporalPhrase: "tomorrow" }),
    );
  }

  it("scores the full weight for a due date on the resolved instant", () => {
    expect(withDue(0).candidates[0].evidence).toContain("temporal_proximity");
    expect(withDue(0).topScore).toBe(0.92);
  });

  it("scores half for a nearby one", () => {
    expect(withDue(48).topScore).toBe(0.87);
  });

  it("scores nothing for a distant one, and invents no date", () => {
    expect(withDue(100).candidates[0].evidence).not.toContain("temporal_proximity");
  });

  it("ignores a phrase the lexicon does not carry rather than guessing", () => {
    const result = rank(
      [exactRow("t1", { dueAt: NOW })],
      command({ action: "complete_task", titleWords: ["report"], temporalPhrase: "sometime soonish" }),
    );

    expect(result.candidates[0].evidence).not.toContain("temporal_proximity");
  });

  it("falls back to planned_at when there is no due date", () => {
    const result = rank(
      [exactRow("t1", { plannedAt: resolved.instant })],
      command({ action: "complete_task", titleWords: ["report"], temporalPhrase: "tomorrow" }),
    );

    expect(result.candidates[0].evidence).toContain("temporal_proximity");
  });
});

describe("recency (2E-MATCH-006)", () => {
  it("decays with age and disappears outside the window", () => {
    const fresh = rank(
      [exactRow("t1", { lastAuditedAt: "2026-07-25T11:00:00.000Z" })],
      command({ action: "complete_task", titleWords: ["report"] }),
    );
    const stale = rank(
      [exactRow("t1", { lastAuditedAt: "2026-06-01T00:00:00.000Z" })],
      command({ action: "complete_task", titleWords: ["report"] }),
    );

    expect(fresh.candidates[0].evidence).toContain("recent_activity");
    expect(stale.candidates[0].evidence).not.toContain("recent_activity");
    expect(fresh.topScore).toBeGreaterThan(stale.topScore);
  });

  it("cannot on its own resolve the canonical two-identical-titles ambiguity", () => {
    // The calibration that matters most in this module. If recency could open a
    // gap of `minMargin`, PRD 12.2's two "Send invoice" tasks would silently
    // resolve to whichever the user last touched.
    expect(TASK_MATCH_WEIGHTS.recency).toBeLessThan(TASK_MATCH_THRESHOLDS.minMargin);

    const result = rank(
      [exactRow("t1", { lastAuditedAt: "2026-07-25T11:00:00.000Z" }), exactRow("t2")],
      command({ action: "complete_task", titleWords: ["invoice"] }),
    );

    expect(result.outcome).toBe("ambiguous");
  });
});

describe("determinism (2E-MATCH-009/017)", () => {
  it("orders by score, then title, then id — and by nothing locale-dependent", () => {
    const rows = [
      exactRow("t3", { title: "b" }),
      exactRow("t1", { title: "b" }),
      exactRow("t2", { title: "a" }),
    ];

    const result = rank(rows, command({ action: "complete_task", titleWords: ["report"] }));

    expect(result.candidates.map((candidate) => candidate.taskId)).toEqual(["t2", "t1", "t3"]);
  });

  it("produces byte-identical results for the same input", () => {
    const rows = [exactRow("t1"), exactRow("t2", { prefilterTier: 1 })];
    const cmd = command({ action: "complete_task", titleWords: ["report"] });

    expect(JSON.stringify(rank(rows, cmd))).toBe(JSON.stringify(rank(rows, cmd)));
  });

  it("does not read the ambient clock", () => {
    const rows = [exactRow("t1", { lastAuditedAt: "2026-07-25T11:00:00.000Z" })];
    const cmd = command({ action: "complete_task", titleWords: ["report"] });

    const early = rankTaskCandidates({
      command: cmd, rows, ownerId: OWNER, now: NOW, timeZone: TIME_ZONE,
    });
    const late = rankTaskCandidates({
      command: cmd, rows, ownerId: OWNER, now: "2026-08-25T12:00:00.000Z", timeZone: TIME_ZONE,
    });

    // Injecting a later instant is the *only* thing that moves the recency
    // signal; a module reading `Date.now()` would score both the same.
    expect(early.topScore).not.toBe(late.topScore);
  });
});

describe("action gravity is independent of confidence (2E-MATCH-013)", () => {
  it("no destructive action is one-step eligible at any score", () => {
    for (const action of TASK_COMMAND_ACTIONS) {
      if (!actionPolicy(action).destructive) continue;
      const result = rank(
        [exactRow("t1")],
        command({ action, titleWords: ["report"], patch: patchFor(action) }),
      );
      expect(result.oneStep).toBe(false);
    }
  });

  it("the taxonomy itself never marks a destructive action one-step", () => {
    for (const action of TASK_COMMAND_ACTIONS) {
      const policy = actionPolicy(action);
      if (policy.destructive) expect(policy.oneStepEligible).toBe(false);
    }
  });
});
