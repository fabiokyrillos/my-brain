import { describe, expect, it } from "vitest";

import { getTaskCommandCopy } from "./copy";
import {
  TASK_DISAMBIGUATION_KINDS,
  buildTaskDisambiguation,
  type TaskDisambiguationKind,
} from "./disambiguation";
import { TASK_MATCH_EVIDENCE, TASK_MATCH_POLICY_VERSION, type TaskMatchEvidence } from "./match-policy";
import type {
  RankedTaskCandidate,
  TaskMatchOutcome,
  TaskMatchResult,
  TaskPreState,
} from "./matching";
import { locales, type Locale } from "@/lib/preferences";

/**
 * PRD §13.3 (2E-DISAMBIG-001/002/004) and 2E-MATCH-012.
 *
 * Fixtures are `TaskMatchResult` objects built here rather than results driven
 * out of `rankTaskCandidates`, deliberately: this module's contract is the
 * *shape* of a match result, and the two cases that matter most —
 * `qualifyingCount` disagreeing with the length of the presented array, and an
 * unrenderable instant — are states the ranker either caps away or never emits.
 * Testing through the ranker would leave both unreachable.
 */

const OWNER = "11111111-1111-4111-8111-111111111111";
const OBSERVED = "2026-07-25T12:00:00.000Z";
const TIME_ZONE = "America/Sao_Paulo";

function preState(overrides: Partial<TaskPreState> = {}): TaskPreState {
  return {
    title: "Send the report",
    description: null,
    status: "todo",
    dueAt: null,
    plannedAt: null,
    manualPriority: null,
    completedAt: null,
    cancelledAt: null,
    intentionalNoDue: false,
    noDueReason: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    projectIds: [],
    projectNames: [],
    contextIds: [],
    contextNames: [],
    personIds: [],
    personNames: [],
    personRoles: [],
    ...overrides,
  };
}

function candidate(input: {
  readonly taskId: string;
  readonly score?: number;
  readonly evidence?: readonly TaskMatchEvidence[];
  readonly preState?: Partial<TaskPreState>;
}): RankedTaskCandidate {
  return {
    taskId: input.taskId,
    preState: preState(input.preState),
    score: input.score ?? 0.5,
    evidence: input.evidence ?? ["normalized_exact_title"],
  };
}

/**
 * `qualifyingCount` defaults to the number of presented candidates, which is
 * what the ranker produces whenever nothing was capped. Every test that cares
 * about the two disagreeing sets it explicitly.
 */
function matchResult(
  overrides: Partial<TaskMatchResult> & Pick<TaskMatchResult, "outcome">,
): TaskMatchResult {
  const candidates = overrides.candidates ?? [];
  return {
    candidates,
    topScore: candidates.length > 0 ? candidates[0].score : 0,
    margin: 0,
    overflowed: overrides.outcome === "ambiguous_overflow",
    oneStep: false,
    requiresConfirmation: overrides.outcome === "matched_requires_confirmation",
    destructive: false,
    qualifyingCount: candidates.length,
    ownerId: OWNER,
    observedBefore: OBSERVED,
    matchPolicyVersion: TASK_MATCH_POLICY_VERSION,
    ...overrides,
  };
}

function ambiguous(candidates: readonly RankedTaskCandidate[], qualifyingCount?: number): TaskMatchResult {
  return matchResult({
    outcome: "ambiguous",
    candidates,
    qualifyingCount: qualifyingCount ?? candidates.length,
  });
}

function build(result: TaskMatchResult, locale: Locale) {
  return buildTaskDisambiguation({ result, locale, timeZone: TIME_ZONE });
}

/** The complete key set of a candidate view, as the DTO declares it. */
const CANDIDATE_VIEW_KEYS = [
  "taskId",
  "title",
  "status",
  "dueAt",
  "plannedAt",
  "projectNames",
  "contextNames",
  "score",
  "evidence",
] as const;

describe.each(locales)("disambiguation projection (%s)", (locale) => {
  const copy = getTaskCommandCopy(locale);

  it("renders one qualifying ambiguous candidate as confirm_one, never as a list of one", () => {
    // 2E-MATCH-012, the case the requirement singles out. An `ambiguous` result
    // with exactly one qualifying candidate means "I found one but I am not sure
    // it is the one"; a disambiguation list of one asks the user to choose
    // between a single thing, which is not a question.
    const view = build(ambiguous([candidate({ taskId: "t1" })]), locale);

    expect(view.kind).toBe("confirm_one");
    expect(view.candidates).toHaveLength(1);
    expect(view.copy.title).toBe(copy.preview.ambiguousOneTitle);
    expect(view.copy.description).toBe(copy.preview.ambiguousOne);
    // The confirm-one prompt reuses neither half of the list's copy. The
    // description would be untrue of a single candidate, and the title — "I
    // need you to choose" — asks the user to pick between things when there is
    // only one thing. A review caught the two speech acts contradicting each
    // other, so both halves are pinned, not just the description.
    expect(view.copy.description).not.toBe(copy.outcomes.ambiguous.description);
    expect(view.copy.title).not.toBe(copy.outcomes.ambiguous.title);
  });

  it("renders more than one qualifying ambiguous candidate as a list", () => {
    const view = build(ambiguous([candidate({ taskId: "t1" }), candidate({ taskId: "t2" })]), locale);

    expect(view.kind).toBe("list");
    expect(view.candidates).toHaveLength(2);
    expect(view.copy).toEqual(copy.outcomes.ambiguous);
  });

  it("decides the kind from qualifyingCount, not from the length of the presented array", () => {
    // The presentation cap only ever shrinks the array, so the two fields can
    // disagree in exactly this direction. Reading `candidates.length` here would
    // produce a confirm-this-one prompt for three qualifying tasks — the user
    // being asked to confirm one of three, with the other two never mentioned.
    const view = build(ambiguous([candidate({ taskId: "t1" })], 3), locale);

    expect(view.kind).toBe("list");
    expect(view.candidates).toHaveLength(1);
  });

  it("gives ambiguous_overflow its own kind and its own copy", () => {
    const view = build(
      matchResult({
        outcome: "ambiguous_overflow",
        candidates: [candidate({ taskId: "t1" }), candidate({ taskId: "t2" })],
        qualifyingCount: 26,
      }),
      locale,
    );

    expect(view.kind).toBe("overflow");
    expect(view.overflowed).toBe(true);
    expect(view.copy).toEqual(copy.outcomes.ambiguous_overflow);
    // "too many to compare safely" and "two that look alike" are different
    // problems with different remedies (2E-UX-001 names them separately).
    expect(view.copy.title).not.toBe(copy.outcomes.ambiguous.title);
    expect(view.copy.description).not.toBe(copy.outcomes.ambiguous.description);
  });

  it("treats a confident match as not ambiguous at all", () => {
    const view = build(
      matchResult({ outcome: "matched", candidates: [candidate({ taskId: "t1" })], oneStep: true }),
      locale,
    );

    expect(view.kind).toBe("none");
    expect(view.candidates).toEqual([]);
    expect(view.copy).toEqual({ title: "", description: "" });
  });

  it("treats matched_requires_confirmation as not ambiguous either", () => {
    // Identification confidence and action gravity are independent axes (§11.1).
    // Collapsing them would send every cancellation to a disambiguation list of
    // exactly one entry, which is the defect PRD revision 3 corrected.
    const view = build(
      matchResult({
        outcome: "matched_requires_confirmation",
        candidates: [candidate({ taskId: "t1" })],
        destructive: true,
      }),
      locale,
    );

    expect(view.kind).toBe("none");
    expect(view.kind).not.toBe("confirm_one");
    expect(view.kind).not.toBe("list");
    expect(view.candidates).toEqual([]);
  });

  it("returns no candidates for kind none even when the result carries some", () => {
    const view = build(
      matchResult({
        outcome: "matched",
        candidates: [candidate({ taskId: "t1" }), candidate({ taskId: "t2" }), candidate({ taskId: "t3" })],
      }),
      locale,
    );

    expect(view.kind).toBe("none");
    expect(view.candidates).toHaveLength(0);
  });

  it("reports an unmatched result as nothing to disambiguate", () => {
    const view = build(matchResult({ outcome: "unmatched" }), locale);

    expect(view.kind).toBe("none");
    expect(view.candidates).toEqual([]);
  });

  it("preserves the ranked order exactly, with no re-sorting", () => {
    // The titles sort in the reverse of the ranked order and the ids sort in a
    // third order, so any re-sort — by title, by id, by score ascending — moves
    // at least one of them. 2E-MATCH-009's order is decided in `matching.ts`
    // and re-deriving it here against the host's collation is what would break.
    const ranked = [
      candidate({ taskId: "zzz", score: 0.9, preState: { title: "Zebra" } }),
      candidate({ taskId: "aaa", score: 0.6, preState: { title: "Mango" } }),
      candidate({ taskId: "mmm", score: 0.4, preState: { title: "Apple" } }),
    ];
    const view = build(ambiguous(ranked), locale);

    expect(view.candidates.map((entry) => entry.taskId)).toEqual(["zzz", "aaa", "mmm"]);
    expect(view.candidates.map((entry) => entry.title)).toEqual(["Zebra", "Mango", "Apple"]);
  });

  it("exposes no field that would mark a candidate as selected or recommended", () => {
    // 2E-DISAMBIG-002. Asserted on the exact key set rather than on the absence
    // of a few guessed names: a `defaultChoice` added tomorrow fails here even
    // though nobody thought to forbid that spelling.
    const view = build(ambiguous([candidate({ taskId: "t1" }), candidate({ taskId: "t2" })]), locale);

    for (const entry of view.candidates) {
      expect(Object.keys(entry).sort()).toEqual([...CANDIDATE_VIEW_KEYS].sort());
      for (const key of Object.keys(entry)) {
        expect(key).not.toMatch(/select|default|recommend|checked|chosen|preferred|primary/i);
      }
    }
    expect(Object.keys(view).sort()).toEqual(["candidates", "copy", "kind", "overflowed"]);
  });

  it("localizes every evidence signal that fired", () => {
    // Built from the declared vocabulary, so a signal added to
    // `TASK_MATCH_EVIDENCE` is covered the day it is added.
    const view = build(
      ambiguous([
        candidate({ taskId: "t1", evidence: TASK_MATCH_EVIDENCE }),
        candidate({ taskId: "t2", evidence: ["recent_activity"] }),
      ]),
      locale,
    );

    expect(view.candidates[0].evidence.map((entry) => entry.signal)).toEqual([...TASK_MATCH_EVIDENCE]);
    for (const entry of view.candidates[0].evidence) {
      expect(Object.keys(entry).sort()).toEqual(["distinguishing", "signal", "text"]);
      expect(entry.text).toBe(copy.evidence[entry.signal]);
      expect(entry.text.trim()).not.toBe("");
    }
    expect(view.candidates[1].evidence).toEqual([
      { signal: "recent_activity", text: copy.evidence.recent_activity, distinguishing: false },
    ]);

    // 2E-DISAMBIG-001 asks for "the evidence that distinguishes them".
    // `recent_activity` is the one signal both candidates carry, so it
    // separates nothing and is the only one marked non-distinguishing; every
    // other signal fired on `t1` alone. Asserting both sides matters — marking
    // everything distinguishing, or nothing, would each satisfy a one-sided
    // check.
    const shared = view.candidates[0].evidence
      .filter((entry) => !entry.distinguishing)
      .map((entry) => entry.signal);
    expect(shared).toEqual(["recent_activity"]);
    expect(
      view.candidates[0].evidence.filter((entry) => entry.distinguishing).length,
    ).toBe(TASK_MATCH_EVIDENCE.length - 1);
  });

  it("marks every signal distinguishing when only one candidate is shown", () => {
    // The confirm-this-one prompt has nothing to compare against, so each
    // signal is a reason this is the task rather than a reason it is not
    // another one. A `shown.length <= 1` guard that returned "all shared"
    // instead would leave that prompt with no evidence to justify itself.
    const view = build(ambiguous([candidate({ taskId: "t1", evidence: TASK_MATCH_EVIDENCE })]), locale);

    expect(view.kind).toBe("confirm_one");
    expect(view.candidates[0].evidence.every((entry) => entry.distinguishing)).toBe(true);
  });

  it("carries no evidence entry for a signal that did not fire", () => {
    const view = build(ambiguous([candidate({ taskId: "t1", evidence: [] })]), locale);

    expect(view.candidates[0].evidence).toEqual([]);
  });

  it("renders instants in the caller's zone, and refuses to invent one it cannot read", () => {
    // 2E-I18N-002 for the first half. The second is why `renderInstant` catches:
    // a candidate the surface cannot render is still a candidate, and dropping
    // it or crashing the list would be worse than saying the date is unreadable.
    const readable = build(
      ambiguous([
        candidate({
          taskId: "t1",
          preState: { dueAt: "2026-08-01T15:30:00.000Z", plannedAt: null },
        }),
      ]),
      locale,
    );
    const utc = buildTaskDisambiguation({
      result: ambiguous([
        candidate({
          taskId: "t1",
          preState: { dueAt: "2026-08-01T15:30:00.000Z", plannedAt: null },
        }),
      ]),
      locale,
      timeZone: "UTC",
    });

    expect(readable.candidates[0].dueAt).not.toBeNull();
    expect(readable.candidates[0].plannedAt).toBeNull();
    expect(readable.candidates[0].dueAt).not.toBe(utc.candidates[0].dueAt);

    const unreadable = build(
      ambiguous([candidate({ taskId: "t1", preState: { dueAt: "not-an-instant" } })]),
      locale,
    );

    expect(unreadable.candidates[0].dueAt).toBe(copy.values.unrenderableInstant);
  });

  it("is pure: the same input twice gives deeply equal results and a fresh object", () => {
    const input = ambiguous([
      candidate({ taskId: "t1", evidence: ["normalized_exact_title", "referenced_project"] }),
      candidate({ taskId: "t2", preState: { dueAt: "2026-08-01T15:30:00.000Z" } }),
    ]);
    const before = JSON.stringify(input);

    const first = build(input, locale);
    const second = build(input, locale);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    // 2E-DISAMBIG-004: nothing is remembered between commands, so nothing here
    // may write back into the result it was handed either.
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("the projection holds no module state across locales (2E-DISAMBIG-004)", () => {
  it("gives the same answer to the third call as to the first", () => {
    const input = ambiguous([candidate({ taskId: "t1" }), candidate({ taskId: "t2" })]);

    const firstEnglish = build(input, "en");
    const portuguese = build(input, "pt-BR");
    const thirdCallEnglish = build(input, "en");

    expect(thirdCallEnglish).toEqual(firstEnglish);
    expect(portuguese).not.toEqual(firstEnglish);
  });

  it("renders the same evidence in different words per locale", () => {
    const input = ambiguous([candidate({ taskId: "t1", evidence: ["normalized_exact_title"] })]);

    const ptBR = build(input, "pt-BR").candidates[0].evidence[0];
    const en = build(input, "en").candidates[0].evidence[0];

    expect(ptBR.signal).toBe(en.signal);
    expect(ptBR.text).not.toBe(en.text);
  });
});

describe("the kind vocabulary", () => {
  it("is reachable in full from the outcomes that produce it", () => {
    const reached: readonly TaskDisambiguationKind[] = (
      [
        matchResult({ outcome: "matched" }),
        ambiguous([candidate({ taskId: "t1" })]),
        ambiguous([candidate({ taskId: "t1" }), candidate({ taskId: "t2" })]),
        matchResult({
          outcome: "ambiguous_overflow",
          candidates: [candidate({ taskId: "t1" })],
          qualifyingCount: 26,
        }),
      ] satisfies readonly TaskMatchResult[]
    ).map((result) => build(result, "pt-BR").kind);

    expect([...new Set(reached)].sort()).toEqual([...TASK_DISAMBIGUATION_KINDS].sort());
  });

  it("reports SQL truncation on the view regardless of the kind", () => {
    // `overflowed` is a fact about the query, not about the presentation: a
    // caller may want to say "and there were more than I could look at"
    // alongside a verdict that is not itself an overflow.
    const outcomes: readonly TaskMatchOutcome[] = ["matched", "ambiguous"];
    for (const outcome of outcomes) {
      const view = build(
        matchResult({ outcome, candidates: [candidate({ taskId: "t1" })], overflowed: true }),
        "en",
      );
      expect(view.overflowed).toBe(true);
    }
  });
});
