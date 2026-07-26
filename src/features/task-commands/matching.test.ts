import { describe, expect, it } from "vitest";

import {
  TASK_MATCH_EVIDENCE,
  TASK_MATCH_LIMITS,
  TASK_MATCH_POLICY_VERSION,
  TASK_MATCH_THRESHOLDS,
  TASK_MATCH_WEIGHTS,
} from "./match-policy";
import {
  TaskMatchInputError,
  describeUnreachableCandidates,
  eligibleStatusesFor,
  rankTaskCandidates,
  type TaskCandidateRow,
} from "./matching";
import { validateTaskCommand, type ValidatedTaskCommand } from "./schema";
import { TASK_COMMAND_ACTIONS, actionPolicy, type TaskCommandAction } from "./taxonomy";
import { resolveTemporalPhrase } from "./temporal";

const NOW = "2026-07-25T12:00:00.000Z";
const TIME_ZONE = "America/Sao_Paulo";
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER_OWNER = "22222222-2222-4222-8222-222222222222";

/**
 * What the lexicon resolves "tomorrow" to, taken from `temporal.ts` rather than
 * written out: a fixture that hard-codes the instant stops testing proximity the
 * moment the lexicon's day boundary changes.
 */
const TOMORROW = (() => {
  const resolved = resolveTemporalPhrase("tomorrow", { now: NOW, timeZone: TIME_ZONE });
  if (resolved.status !== "resolved") throw new Error("the lexicon no longer resolves 'tomorrow'");
  return resolved.instant;
})();

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

/** A row the authoritative normalizer reported as an exact title hit. */
function exactRow(taskId: string, overrides: Partial<TaskCandidateRow> = {}): TaskCandidateRow {
  return row({ taskId, prefilterTier: 0, tokenOverlap: 1, queryTokenCount: 1, ...overrides });
}

/**
 * Every fixture in this file goes through here, so none of them can assert
 * behaviour against a `(tier, overlap, queryTokenCount)` triple SQL has no
 * execution that produces. `sql-reachability.test.ts` is where those rules are
 * stated and pinned against the migration; this is what applies them.
 *
 * Deliberately a throw rather than an expectation: an unreachable fixture is a
 * broken test, and it should fail where it was written rather than add a
 * passing assertion to whichever `it` happened to use it.
 */
function rank(rows: readonly TaskCandidateRow[], cmd: ValidatedTaskCommand) {
  const unreachable = describeUnreachableCandidates(rows);
  if (unreachable !== null) {
    throw new Error(`fixture rows are not reachable from SQL: ${unreachable}`);
  }
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

  it("does not report ambiguity it cannot render, but still reports the truncation", () => {
    // A truncated set with nothing above the floor used to return
    // `ambiguous_overflow` with an empty candidate list — "there are too many,
    // narrow this down" pointing at nothing, which 2E-DISAMBIG-001 cannot
    // render. The truthful outcome is `unmatched`, which routes to 2E.6's
    // clarification, with `overflowed` still true so the surface can say there
    // was more than it could look at.
    const rows = [
      row({ taskId: "t1", effectiveLimit: 1 }),
      row({ taskId: "t2", effectiveLimit: 1 }),
    ];

    const result = rank(rows, command({ action: "complete_task" }));

    expect(result.qualifyingCount).toBe(0);
    expect(result.outcome).toBe("unmatched");
    expect(result.overflowed).toBe(true);
  });

  it("never returns ambiguous_overflow with nothing to disambiguate", () => {
    // The non-qualifying rows share one token out of five (0.044, below the
    // floor) rather than being tier-3 no-hint rows: `query_token_count` is
    // computed once per query, so a set mixing 1 and 0 is not one SQL can
    // return, and the fixture used to assert against exactly that.
    const cmd = command({ action: "complete_task", titleWords: ["a", "b", "c", "d", "e"] });
    for (const qualifying of [0, 1, 2]) {
      const rows = Array.from({ length: qualifying + 2 }, (_, index) =>
        index < qualifying
          ? row({
            taskId: `t${index}`,
            effectiveLimit: 1,
            prefilterTier: 0,
            tokenOverlap: 5,
            queryTokenCount: 5,
          })
          : row({
            taskId: `t${index}`,
            effectiveLimit: 1,
            prefilterTier: 2,
            tokenOverlap: 1,
            queryTokenCount: 5,
          }));
      const result = rank(rows, cmd);
      if (result.outcome !== "ambiguous_overflow") continue;
      expect(result.candidates.length).toBeGreaterThan(0);
    }
  });

  it("reads the limit from the data, not from the constant this process asked for", () => {
    const rows = [
      exactRow("t1", { effectiveLimit: 3 }),
      exactRow("t2", { effectiveLimit: 3 }),
    ];

    const result = rank(rows, command({ action: "complete_task", titleWords: ["report"] }));

    expect(result.overflowed).toBe(false);
  });

  it("is not overflowed at exactly the declared limit, and is one row above it", () => {
    // `rows.length > declaredLimit`. With no fixture sitting *on* the limit,
    // relaxing that to `>=` left the suite green while making every full page
    // report a truncation — which 2E-MATCH-004 turns into a refusal to
    // one-step apply, so the mutation silently disables the happy path.
    const atLimit = [
      exactRow("t1", { effectiveLimit: 2 }),
      exactRow("t2", { effectiveLimit: 2 }),
    ];
    const overLimit = [...atLimit, exactRow("t3", { effectiveLimit: 2 })];
    const cmd = command({ action: "complete_task", titleWords: ["report"] });

    expect(rank(atLimit, cmd).overflowed).toBe(false);
    expect(rank(overLimit, cmd).overflowed).toBe(true);
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

/**
 * 2E-MATCH-011 says "at or above", and every comparison implementing it is a
 * strict one whose boundary no fixture sat on. Each test here fails under the
 * off-by-one that a mutation run proved the suite could not see.
 */
describe("thresholds are inclusive at the boundary (2E-MATCH-011/015)", () => {
  it("accepts a top score sitting exactly on the threshold", () => {
    // 0.22 x 6/11 + 0.1 + 0.1 + 0.1 + 0.08 + 0.05 = 0.55, which is
    // TASK_MATCH_THRESHOLDS.topScore to the digit. Assembled from six weaker
    // signals rather than a title hit because the title ladder alone cannot
    // land on it.
    const result = rank(
      [
        row({
          taskId: "t1",
          status: "todo",
          prefilterTier: 2,
          tokenOverlap: 6,
          queryTokenCount: 11,
          projectHintMatched: true,
          contextHintMatched: true,
          personHintMatched: true,
          dueAt: new Date(Date.parse(TOMORROW) + 48 * 3_600_000).toISOString(),
        }),
      ],
      command({
        action: "complete_task",
        titleWords: ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"],
        project: "Acme",
        context: "Work",
        person: "Ana",
        status: "todo",
        temporalPhrase: "tomorrow",
      }),
    );

    expect(result.topScore).toBe(TASK_MATCH_THRESHOLDS.topScore);
    expect(result.outcome).toBe("matched");
    expect(result.oneStep).toBe(true);
  });

  it("accepts a margin sitting exactly on the threshold", () => {
    // 0.82 against 0.70. A `<=` here would send the clearest two-candidate
    // separation the policy can express back to a disambiguation list.
    const result = rank(
      [
        exactRow("t1", { status: "todo" }),
        row({
          taskId: "t2",
          status: "blocked",
          prefilterTier: 1,
          tokenOverlap: 1,
          queryTokenCount: 1,
        }),
      ],
      command({ action: "complete_task", titleWords: ["report"], status: "blocked" }),
    );

    expect(result.topScore).toBe(0.82);
    expect(result.margin).toBe(TASK_MATCH_THRESHOLDS.minMargin);
    expect(result.outcome).toBe("matched");
    expect(result.oneStep).toBe(true);
  });

  it("caps the presented list without capping the count it reports", () => {
    // Deleting the `TASK_MATCH_LIMITS.ranked` slice survived every scenario in
    // the suite, because none produced more candidates than the cap. 2E.3 reads
    // `qualifyingCount` to choose its copy and `candidates` to render, so the
    // two have to disagree here.
    const rows = Array.from({ length: TASK_MATCH_LIMITS.ranked + 2 }, (_, index) =>
      exactRow(`t${index}`));

    const result = rank(rows, command({ action: "complete_task", titleWords: ["report"] }));

    expect(result.qualifyingCount).toBe(TASK_MATCH_LIMITS.ranked + 2);
    expect(result.candidates).toHaveLength(TASK_MATCH_LIMITS.ranked);
    expect(result.overflowed).toBe(false);
  });
});

/**
 * The correction pass fixed four review Criticals and covered none of them by
 * test. A mutation run then proved every one of those fixes could be deleted
 * with the suite still green. These are the fixtures that make the fixes real.
 */
describe("the guards the correction pass added (regression)", () => {
  it("refuses to score the relation the requested action is about to write", () => {
    // Critical #4. `assign_project` with a project hint of "Acme" scored the
    // task *already* in Acme above the one the user meant. For `set_waiting_on`
    // that is worse than a no-op: a person merely `involved` boosted a task
    // that then received a real `waiting_on` row, one step, unconfirmed.
    const relationCases = [
      { action: "assign_project", hints: { project: "Acme" }, patch: { projectRef: "Acme" }, hit: "projectHintMatched" },
      { action: "assign_context", hints: { context: "Work" }, patch: { contextRef: "Work" }, hit: "contextHintMatched" },
      { action: "assign_person", hints: { person: "Ana" }, patch: { personRef: "Ana" }, hit: "personHintMatched" },
      { action: "set_waiting_on", hints: { person: "Ana" }, patch: { personRef: "Ana" }, hit: "personHintMatched" },
    ] as const;

    for (const relationCase of relationCases) {
      const result = rank(
        [exactRow("t1", { [relationCase.hit]: true })],
        command({
          action: relationCase.action,
          titleWords: ["report"],
          ...relationCase.hints,
          patch: relationCase.patch,
        }),
      );

      expect(result.candidates[0].evidence).not.toContain("referenced_project");
      expect(result.candidates[0].evidence).not.toContain("referenced_context");
      expect(result.candidates[0].evidence).not.toContain("referenced_person");
      // 0.82 is the title ladder alone: the relation contributed nothing.
      expect(result.topScore).toBe(0.82);
    }
  });

  it("still scores a relation the requested action does not write", () => {
    // The guard must not be a blanket "ignore relation hints": for an action
    // that writes no relation, the hint is ordinary evidence.
    const result = rank(
      [exactRow("t1", { projectHintMatched: true })],
      command({ action: "complete_task", titleWords: ["report"], project: "Acme" }),
    );

    expect(result.candidates[0].evidence).toContain("referenced_project");
  });

  it("cannot be carried from ambiguous to a one-step apply by one relation hint", () => {
    // The calibration this Critical turned on: two identically-titled tasks,
    // one of which the hint matches. At 0.12 the hint alone closed the margin
    // and applied. At 0.1 it cannot.
    const result = rank(
      [exactRow("t1", { projectHintMatched: true }), exactRow("t2")],
      command({ action: "complete_task", titleWords: ["invoice"], project: "Acme" }),
    );

    expect(result.margin).toBeLessThan(TASK_MATCH_THRESHOLDS.minMargin);
    expect(result.outcome).toBe("ambiguous");
    expect(result.oneStep).toBe(false);
  });

  it("scores nothing for an audit row newer than the observation instant", () => {
    // Critical #3. A garbage clock used to award every task full recency;
    // clamping the age at zero is what stopped it, and deleting the clamp
    // manufactures a one-step apply out of a bad timestamp.
    const future = new Date(Date.parse(NOW) + 14 * 86_400_000).toISOString();
    const result = rank(
      [exactRow("t1", { lastAuditedAt: future }), exactRow("t2")],
      command({ action: "complete_task", titleWords: ["invoice"] }),
    );

    expect(result.candidates[0].evidence).not.toContain("recent_activity");
    expect(result.margin).toBe(0);
    expect(result.outcome).toBe("ambiguous");
  });

  it("refuses an instant without a timezone designator", () => {
    // Critical #3, the other half: `Date.parse("2026-07-25T12:00")` is defined
    // to be *local* time, so the same command scored on two machines produced
    // two outcomes.
    const rows = [exactRow("t1")];
    const cmd = command({ action: "complete_task", titleWords: ["report"] });

    expect(() => rankTaskCandidates({
      command: cmd, rows, ownerId: OWNER, now: "2026-07-25T12:00", timeZone: TIME_ZONE,
    })).toThrow(TaskMatchInputError);
    expect(() => rankTaskCandidates({
      command: cmd, rows, ownerId: OWNER, now: "not a date", timeZone: TIME_ZONE,
    })).toThrow(TaskMatchInputError);
    expect(() => rankTaskCandidates({
      command: cmd, rows, ownerId: OWNER, now: new Date(Number.NaN), timeZone: TIME_ZONE,
    })).toThrow(TaskMatchInputError);
  });

  it("does not credit a status hint that every eligible candidate must satisfy", () => {
    // `reopen_task` is eligible only from `completed`, so a hint of "completed"
    // fires on every candidate and separates none of them — while inflating the
    // score against the threshold. A review proved "reopen the completed report
    // task" reached a one-step apply that "reopen the report task" did not.
    // 0.22 + 0.1 + 0.1 + 0.1 = 0.52, just under the 0.55 threshold. The
    // tautological hint would have added 0.08 and carried it to a one-step
    // apply — so "reopen the completed report task" applied where "reopen the
    // report task" asked.
    const rows = () => [row({
      taskId: "t1",
      status: "completed",
      prefilterTier: 2,
      tokenOverlap: 1,
      queryTokenCount: 1,
      projectHintMatched: true,
      contextHintMatched: true,
      personHintMatched: true,
    })];
    const hints = { titleWords: ["report"], project: "Acme", context: "Work", person: "Ana" };

    const withHint = rank(rows(), command({ action: "reopen_task", ...hints, status: "completed" }));
    const withoutHint = rank(rows(), command({ action: "reopen_task", ...hints }));

    expect(withHint.topScore).toBe(withoutHint.topScore);
    expect(withHint.candidates[0].evidence).not.toContain("status_match");
    expect(withHint.outcome).toBe(withoutHint.outcome);
    expect(withHint.outcome).toBe("ambiguous");
    expect(withHint.oneStep).toBe(false);
  });

  it("still credits a status hint that can separate candidates", () => {
    // `complete_task` is eligible from six statuses, so naming one is real
    // evidence rather than a tautology.
    const result = rank(
      [exactRow("t1", { status: "blocked" })],
      command({ action: "complete_task", titleWords: ["report"], status: "blocked" }),
    );

    expect(result.candidates[0].evidence).toContain("status_match");
  });

  it("never resolves an ambiguous destructive action into a confirmation prompt", () => {
    // Identification confidence is settled before action gravity is consulted.
    // Hoisting the confirmation branch above the ambiguity branch would offer a
    // single confirm control for an arbitrary one of two identical tasks — a
    // cancellation applied to a task the user never identified.
    for (const action of TASK_COMMAND_ACTIONS) {
      const policy = actionPolicy(action);
      if (!policy.requiresConfirmation) continue;
      const result = rank(
        [exactRow("t1"), exactRow("t2")],
        command({ action, titleWords: ["invoice"], patch: patchFor(action) }),
      );

      expect(result.outcome).toBe("ambiguous");
      expect(result.candidates).toHaveLength(2);
      expect(result.oneStep).toBe(false);
    }
  });
});

describe("published score, ordering score, and the clamp between them", () => {
  it("publishes within 0..1 while ordering on the uncapped value", () => {
    // The weights can sum past 1. Clamping made a candidate with eight fired
    // signals tie with one that had seven — which can only ever *cause*
    // ambiguity, never a false match, but it also reversed their order in the
    // disambiguation list. Both halves are asserted here because a mutation run
    // proved each survived on its own.
    // The titles are chosen so the tie-break *disagrees* with the score order:
    // if the comparator ever ranks on the published (capped) score, these two
    // tie at 1.0 and fall through to the title, which puts the weaker candidate
    // first. With equal titles the mutation was invisible.
    const eight = exactRow("t1", {
      title: "z-eight-signals",
      status: "blocked",
      projectHintMatched: true,
      contextHintMatched: true,
      personHintMatched: true,
      lastAuditedAt: "2026-07-25T11:00:00.000Z",
      dueAt: TOMORROW,
    });
    const seven = exactRow("t2", {
      title: "a-seven-signals",
      status: "blocked",
      projectHintMatched: true,
      contextHintMatched: true,
      personHintMatched: true,
      dueAt: TOMORROW,
    });

    const result = rank([seven, eight], command({
      action: "complete_task",
      titleWords: ["report"],
      project: "Acme",
      context: "Work",
      person: "Ana",
      status: "blocked",
      temporalPhrase: "tomorrow",
    }));

    // PRD §7's contract: nothing published above 1.
    for (const candidate of result.candidates) {
      expect(candidate.score).toBeLessThanOrEqual(1);
    }
    expect(result.topScore).toBe(1);
    // ...and the richer candidate still sorts first, despite tying once capped.
    expect(result.candidates.map((candidate) => candidate.taskId)).toEqual(["t1", "t2"]);
  });

  it("clamps the overlap fraction for a caller that skipped the reachability check", () => {
    // `describeUnreachableCandidates` refuses `tokenOverlap > queryTokenCount`,
    // so this row cannot come from `loadTaskCandidates`. The clamp is the
    // defence for a caller that assembled rows some other way, and it is
    // reachable only by calling the ranker directly — which is why no fixture
    // covered it.
    const overClaiming = rankTaskCandidates({
      command: command({ action: "complete_task", titleWords: ["a", "b"] }),
      rows: [row({ taskId: "t1", prefilterTier: 2, tokenOverlap: 8, queryTokenCount: 2 })],
      ownerId: OWNER,
      now: NOW,
      timeZone: TIME_ZONE,
    });
    const honest = rankTaskCandidates({
      command: command({ action: "complete_task", titleWords: ["a", "b"] }),
      rows: [row({ taskId: "t1", prefilterTier: 2, tokenOverlap: 2, queryTokenCount: 2 })],
      ownerId: OWNER,
      now: NOW,
      timeZone: TIME_ZONE,
    });

    expect(overClaiming.topScore).toBe(honest.topScore);
    expect(overClaiming.topScore).toBe(TASK_MATCH_WEIGHTS.tokenOverlap);
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
  const hintMs = Date.parse(TOMORROW);

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
      [exactRow("t1", { plannedAt: TOMORROW })],
      command({ action: "complete_task", titleWords: ["report"], temporalPhrase: "tomorrow" }),
    );

    expect(result.candidates[0].evidence).toContain("temporal_proximity");
  });

  it("puts a distance of exactly temporalExactHours in the exact band, not the near one", () => {
    // `distanceHours <= temporalExactHours`. Tightening it to `<` moved this
    // case into the half-weight band and no fixture noticed, because none sat
    // on the boundary — so a task due exactly a day from the hint quietly
    // stopped being "on that day".
    const result = withDue(TASK_MATCH_LIMITS.temporalExactHours);

    expect(result.candidates[0].evidence).toContain("temporal_proximity");
    expect(result.candidates[0].evidence).not.toContain("temporal_proximity_near");
  });

  it("puts a distance of exactly temporalNearHours in the near band, not out of range", () => {
    const result = withDue(TASK_MATCH_LIMITS.temporalNearHours);

    expect(result.candidates[0].evidence).toContain("temporal_proximity_near");
    expect(result.candidates[0].evidence).not.toContain("temporal_proximity");
  });

  it("drops the signal one hour past the near band", () => {
    const result = withDue(TASK_MATCH_LIMITS.temporalNearHours + 1);

    expect(result.candidates[0].evidence).not.toContain("temporal_proximity");
    expect(result.candidates[0].evidence).not.toContain("temporal_proximity_near");
  });

  it("takes the nearer of due and planned, not due unconditionally", () => {
    // "move my dentist thing": a task planned for the hinted day but due next
    // year is exactly what the user means, and preferring `due_at` lost it to a
    // task merely due that day. No fixture carried both dates, so swapping the
    // min for a max survived the whole suite.
    const result = rank(
      [exactRow("t1", {
        plannedAt: TOMORROW,
        dueAt: new Date(hintMs + 365 * 24 * 3_600_000).toISOString(),
      })],
      command({ action: "complete_task", titleWords: ["report"], temporalPhrase: "tomorrow" }),
    );

    expect(result.candidates[0].evidence).toContain("temporal_proximity");
  });
});

describe("labels claim only what the score supports (2E-MATCH-014/015)", () => {
  it("does not label a token overlap that contributed nothing", () => {
    // 2E-DISAMBIG-001 renders these to the user, so "shares wording" against a
    // contribution of zero is a claim the score does not support.
    const result = rank(
      [row({
        taskId: "t1",
        prefilterTier: 2,
        tokenOverlap: 0,
        queryTokenCount: 3,
        projectHintMatched: true,
      })],
      command({ action: "complete_task", titleWords: ["a", "b", "c"], project: "Acme" }),
    );

    expect(result.candidates[0].evidence).not.toContain("normalized_token_overlap");
    expect(result.candidates[0].evidence).toContain("referenced_project");
  });

  it("does not label recency whose contribution rounds away", () => {
    // One second inside a fourteen-day window contributes ~5e-9, which rounds
    // to zero. Labelling it would tell the user "recently active" on the
    // strength of nothing.
    const almostStale = new Date(
      Date.parse(NOW) - (TASK_MATCH_LIMITS.recencyWindowDays * 86_400_000 - 1_000),
    ).toISOString();

    const result = rank(
      [exactRow("t1", { lastAuditedAt: almostStale })],
      command({ action: "complete_task", titleWords: ["report"] }),
    );

    expect(result.candidates[0].evidence).not.toContain("recent_activity");
    expect(result.topScore).toBe(0.82);
  });

  it("accepts a candidate sitting exactly on the floor", () => {
    // 2E-MATCH-015's floor is `>=`. The only fixture landing on 0.1 did so
    // incidentally, in the baseline corpus, so tightening it to `>` here was
    // invisible.
    const result = rank(
      [row({ taskId: "t1", prefilterTier: 2, tokenOverlap: 0, queryTokenCount: 4, projectHintMatched: true })],
      command({ action: "complete_task", titleWords: ["a", "b", "c", "d"], project: "Acme" }),
    );

    expect(result.candidates[0].score).toBe(TASK_MATCH_THRESHOLDS.minCandidateScore);
    expect(result.qualifyingCount).toBe(1);
  });

  it("drops a candidate one rounding step below the floor", () => {
    const result = rank(
      [row({ taskId: "t1", prefilterTier: 2, tokenOverlap: 2, queryTokenCount: 5 })],
      command({ action: "complete_task", titleWords: ["a", "b", "c", "d", "e"] }),
    );

    expect(result.candidates[0]).toBeUndefined();
    expect(result.qualifyingCount).toBe(0);
    expect(result.outcome).toBe("unmatched");
  });
});

describe("cross-row agreement on the values SQL computes once", () => {
  it("reports the earliest observation, not the first row's", () => {
    // This value guards 2E-UPDATE-003's TOCTOU check and feeds
    // 2E-PREVIEW-004's fingerprint, and it was read from `rows[0]` on trust —
    // even when that row is dropped moments later as cross-owner.
    const earlier = "2026-07-25T11:59:00.000Z";
    const result = rankTaskCandidates({
      command: command({ action: "complete_task", titleWords: ["report"] }),
      rows: [
        exactRow("t1", { ownerId: OTHER_OWNER, observedBefore: NOW }),
        exactRow("t2", { observedBefore: earlier }),
      ],
      ownerId: OWNER,
      now: NOW,
      timeZone: TIME_ZONE,
    });

    expect(result.observedBefore).toBe(earlier);
  });

  it("reports no observation at all when one is unreadable", () => {
    const result = rankTaskCandidates({
      command: command({ action: "complete_task", titleWords: ["report"] }),
      rows: [exactRow("t1", { observedBefore: "not a date" })],
      ownerId: OWNER,
      now: NOW,
      timeZone: TIME_ZONE,
    });

    expect(result.observedBefore).toBeNull();
  });

  it("reads the smallest declared limit, not the first row's", () => {
    const rows = [
      exactRow("t1", { effectiveLimit: 25 }),
      exactRow("t2", { effectiveLimit: 1 }),
    ];

    const result = rankTaskCandidates({
      command: command({ action: "complete_task", titleWords: ["report"] }),
      rows,
      ownerId: OWNER,
      now: NOW,
      timeZone: TIME_ZONE,
    });

    expect(result.overflowed).toBe(true);
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
  it("orders by score, then title, then id", () => {
    const rows = [
      exactRow("t3", { title: "b" }),
      exactRow("t1", { title: "b" }),
      exactRow("t2", { title: "a" }),
    ];

    const result = rank(rows, command({ action: "complete_task", titleWords: ["report"] }));

    expect(result.candidates.map((candidate) => candidate.taskId)).toEqual(["t2", "t1", "t3"]);
  });

  it("breaks a title tie by code point, not by the host's collation", () => {
    // "a"/"b" collate identically either way, so the previous fixture could not
    // tell `<` from `localeCompare` and the swap survived a mutation run.
    // "B" (U+0042) sorts before "a" (U+0061) by code unit and after it in every
    // locale ICU implements — which is the whole reason 2E-MATCH-009 forbids
    // `localeCompare`: the tie-break must not depend on the machine.
    const rows = [exactRow("t1", { title: "a" }), exactRow("t2", { title: "B" })];

    const result = rank(rows, command({ action: "complete_task", titleWords: ["report"] }));

    expect(result.candidates.map((candidate) => candidate.preState.title)).toEqual(["B", "a"]);
    // Pins the premise rather than assuming it: if a future ICU made these
    // collate by code point too, the fixture would stop discriminating and this
    // is what would say so.
    expect("B".localeCompare("a")).toBeGreaterThan(0);
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
