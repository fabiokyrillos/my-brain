import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { TASK_COMMAND_OUTCOMES } from "./outcomes";
import {
  TASK_COMMAND_APPLY_ROUTES,
  TASK_COMMAND_ORIGINS,
  TASK_COMMAND_PREVIEWED_OUTCOMES,
  TASK_COMMAND_UNDO_RESULTS,
  buildTaskCommandAppliedProperties,
  buildTaskCommandDisambiguatedProperties,
  buildTaskCommandPreviewedProperties,
  buildTaskCommandUndoneProperties,
  marginBand,
  scoreBand,
  signalCategories,
} from "./analytics";
import { TASK_MATCH_EVIDENCE, TASK_MATCH_SCORE_BANDS, TASK_MATCH_THRESHOLDS } from "./match-policy";
import { TASK_COMMAND_POLICY_VERSION } from "./taxonomy";

const ANALYTICS_SOURCE = "src/features/task-commands/analytics.ts";

describe("score and margin bands", () => {
  it("uses only the declared band vocabulary", () => {
    const produced = new Set([
      scoreBand(0), scoreBand(0.3), scoreBand(0.6), scoreBand(0.95),
      marginBand(0), marginBand(0.05), marginBand(0.2), marginBand(0.9),
    ]);
    for (const band of produced) expect(TASK_MATCH_SCORE_BANDS).toContain(band);
  });

  it("bands a score against the declared thresholds and nothing else", () => {
    const { minCandidateScore, topScore, minMargin } = TASK_MATCH_THRESHOLDS;
    expect(scoreBand(minCandidateScore - 0.001)).toBe("none");
    expect(scoreBand(minCandidateScore)).toBe("low");
    expect(scoreBand(topScore - 0.001)).toBe("low");
    expect(scoreBand(topScore)).toBe("medium");
    expect(scoreBand(topScore + minMargin - 0.001)).toBe("medium");
    expect(scoreBand(topScore + minMargin)).toBe("high");
  });

  it("bands a margin against the minimum margin and twice it", () => {
    const { minMargin } = TASK_MATCH_THRESHOLDS;
    expect(marginBand(0)).toBe("none");
    expect(marginBand(minMargin - 0.001)).toBe("low");
    expect(marginBand(minMargin)).toBe("medium");
    expect(marginBand(minMargin * 2)).toBe("high");
  });

  it("treats a non-finite or negative value as no band rather than throwing", () => {
    expect(scoreBand(Number.NaN)).toBe("none");
    expect(scoreBand(-1)).toBe("none");
    expect(marginBand(Number.NaN)).toBe("none");
    expect(marginBand(-0.4)).toBe("none");
  });
});

describe("signal categories", () => {
  it("deduplicates across candidates and reports the declared order", () => {
    const merged = signalCategories([
      ["recent_activity", "normalized_token_overlap"],
      ["normalized_token_overlap", "referenced_project"],
    ]);
    expect(merged).toEqual(["normalized_token_overlap", "referenced_project", "recent_activity"]);
  });

  it("is a subset of the declared evidence vocabulary, always", () => {
    const merged = signalCategories([[...TASK_MATCH_EVIDENCE]]);
    expect(merged).toEqual([...TASK_MATCH_EVIDENCE]);
  });

  it("reports nothing when nothing fired", () => {
    expect(signalCategories([])).toEqual([]);
    expect(signalCategories([[], []])).toEqual([]);
  });
});

describe("payload builders", () => {
  it("carries every one of 2E-ANALYTICS-001's seven categories on the preview event", () => {
    const properties = buildTaskCommandPreviewedProperties({
      origin: "chat",
      outcome: "ambiguous",
      candidateCount: 2,
      topScore: 0.62,
      margin: 0.04,
      evidence: [["normalized_exact_title"], ["normalized_token_overlap"]],
      oneStep: false,
      requiresConfirmation: false,
    });
    expect(properties).toEqual({
      commandOrigin: "chat",
      outcomeCategory: "ambiguous",
      candidateCount: 2,
      scoreBand: "medium",
      // 0.04 is above zero and below `minMargin`: a real but insufficient
      // separation, which is exactly what makes this result ambiguous.
      marginBand: "low",
      signalCategories: ["normalized_exact_title", "normalized_token_overlap"],
      oneStep: false,
      requiresConfirmation: false,
      policyVersion: TASK_COMMAND_POLICY_VERSION,
    });
  });

  it("reports a rank rather than an identity for a disambiguation", () => {
    expect(
      buildTaskCommandDisambiguatedProperties({ origin: "work", candidateCount: 3, selectedRank: 2 }),
    ).toEqual({
      commandOrigin: "work",
      candidateCount: 3,
      selectedRank: 2,
      policyVersion: TASK_COMMAND_POLICY_VERSION,
    });
  });

  it("clamps counts and ranks to non-negative integers", () => {
    const properties = buildTaskCommandDisambiguatedProperties({
      origin: "chat",
      candidateCount: -4,
      selectedRank: 2.9,
    });
    expect(properties.candidateCount).toBe(0);
    expect(properties.selectedRank).toBe(2);
  });

  it("describes an apply by its outcome category and route", () => {
    expect(
      buildTaskCommandAppliedProperties({
        origin: "chat",
        outcome: "rejected_stale",
        route: "confirmed",
        replayed: false,
      }),
    ).toEqual({
      commandOrigin: "chat",
      outcomeCategory: "rejected_stale",
      applyRoute: "confirmed",
      replayed: false,
      policyVersion: TASK_COMMAND_POLICY_VERSION,
    });
  });

  it("describes an undo by its bounded result", () => {
    expect(buildTaskCommandUndoneProperties({ origin: "work", result: "expired" })).toEqual({
      commandOrigin: "work",
      undoResult: "expired",
      policyVersion: TASK_COMMAND_POLICY_VERSION,
    });
  });
});

describe("content-free by construction (2E-ANALYTICS-003)", () => {
  /**
   * A structural assertion, not a review note. The builders cannot leak a title
   * or an id if they never receive one, so this pins the *imports* rather than
   * trying to inspect every produced value: a future edit that starts taking a
   * candidate row or a preview fails here first.
   */
  it("imports no module that carries task content", () => {
    const source = readFileSync(path.resolve(process.cwd(), ANALYTICS_SOURCE), "utf8");
    for (const forbidden of ["./matching", "./preview", "./candidates", "./schema", "./disambiguation"]) {
      expect(source).not.toContain(`from "${forbidden}"`);
    }
  });

  it("declares every bounded vocabulary the migration will pin as a CHECK", () => {
    // Band literals in a constraint are permanent (2E-ANALYTICS-002), and so is
    // every other closed list the properties validator will enforce. Asserting
    // them here is what makes a silent widening a red test rather than a
    // migration that accepts a value the CHECK rejects.
    expect(TASK_COMMAND_ORIGINS).toEqual(["chat", "work"]);
    expect(TASK_COMMAND_APPLY_ROUTES).toEqual(["direct", "confirmed", "created"]);
    expect(TASK_COMMAND_UNDO_RESULTS).toEqual(["undone", "unavailable", "expired", "refused"]);
    expect(TASK_MATCH_SCORE_BANDS).toEqual(["none", "low", "medium", "high"]);
  });

  it("adds exactly one member to the outcome vocabulary for the preview event", () => {
    // `previewed` is a disposition, not an outcome, and this is the one place
    // it has to be reportable. The assertion pins both halves: the twelve are
    // untouched, and exactly one is added.
    expect(TASK_COMMAND_PREVIEWED_OUTCOMES.slice(0, TASK_COMMAND_OUTCOMES.length))
      .toEqual([...TASK_COMMAND_OUTCOMES]);
    expect(TASK_COMMAND_PREVIEWED_OUTCOMES).toHaveLength(TASK_COMMAND_OUTCOMES.length + 1);
    expect(TASK_COMMAND_PREVIEWED_OUTCOMES.at(-1)).toBe("previewed");
    expect(TASK_COMMAND_OUTCOMES).not.toContain("previewed");
  });
});
