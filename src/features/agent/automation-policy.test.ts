import { describe, expect, it } from "vitest";

import {
  AUTOMATION_CATEGORIES,
  AUTOMATION_DECISION_REASONS,
  AUTOMATION_DEFAULT_STATE,
  AUTOMATION_POLICY_STATES,
  CALIBRATION_FRESHNESS,
  CALIBRATION_OUTCOMES,
  CALIBRATION_THRESHOLDS,
  calibrationShortfall,
  normalizePolicyState,
  permitsAutomaticWrite,
  type AutomationCategory,
  type AutomationCategoryDecision,
} from "./automation-policy";

function decision(overrides: Partial<AutomationCategoryDecision> = {}): AutomationCategoryDecision {
  return {
    category: "task",
    state: "suggest_only",
    eligible: false,
    reason: "suggest_only_by_owner",
    calibration: {
      reviewed: 0,
      approved: 0,
      corrected: 0,
      rejected: 0,
      undone: 0,
      precision: null,
      recentReviewed: 0,
      newestObservedAt: null,
      recentUndo: false,
      hasProducer: true,
    },
    requiredReviewed: CALIBRATION_THRESHOLDS.task.minimumReviewed,
    requiredPrecision: CALIBRATION_THRESHOLDS.task.minimumPrecision,
    ...overrides,
  };
}

describe("the six categories the owner signed", () => {
  it("are exactly six, and are exactly these", () => {
    expect([...AUTOMATION_CATEGORIES]).toEqual([
      "task",
      "person",
      "project",
      "organization",
      "memory",
      "relation",
    ]);
  });

  it("every category carries its own threshold — none inherits another's", () => {
    for (const category of AUTOMATION_CATEGORIES) {
      const threshold = CALIBRATION_THRESHOLDS[category];
      expect(threshold, `${category} has no threshold`).toBeDefined();
      expect(threshold.minimumReviewed).toBeGreaterThan(0);
      expect(threshold.minimumPrecision).toBeGreaterThan(0);
      expect(threshold.minimumPrecision).toBeLessThanOrEqual(1);
    }
    expect(Object.keys(CALIBRATION_THRESHOLDS).sort()).toEqual([...AUTOMATION_CATEGORIES].sort());
  });

  it("no threshold is the generic 90% rule the owner forbade for identity-bearing categories", () => {
    // `task` is deliberately 0.90 and is the ONLY one, because it is the only
    // fully reversible category. If a later edit flattened the table to one
    // number, this fails.
    const distinct = new Set(
      AUTOMATION_CATEGORIES.map((category) => CALIBRATION_THRESHOLDS[category].minimumPrecision),
    );
    expect(distinct.size).toBeGreaterThan(1);
    for (const category of ["person", "memory", "relation", "project", "organization"] as AutomationCategory[]) {
      expect(CALIBRATION_THRESHOLDS[category].minimumPrecision).toBeGreaterThan(0.9);
    }
  });
});

describe("fail-closed by construction", () => {
  it("the default state automates nothing", () => {
    expect(AUTOMATION_DEFAULT_STATE).toBe("suggest_only");
    expect(permitsAutomaticWrite(decision({ state: AUTOMATION_DEFAULT_STATE }))).toBe(false);
  });

  it("an unknown stored state degrades to the default instead of throwing", () => {
    expect(normalizePolicyState("automatic")).toBe("suggest_only");
    expect(normalizePolicyState("AUTOMATIC_WHEN_ELIGIBLE")).toBe("suggest_only");
    expect(normalizePolicyState(null)).toBe("suggest_only");
    expect(normalizePolicyState(undefined)).toBe("suggest_only");
    expect(normalizePolicyState(7)).toBe("suggest_only");
    // The value `agent_preferences.autonomy_level` actually holds today.
    expect(normalizePolicyState("autonomous")).toBe("suggest_only");
  });

  it("a missing decision permits nothing", () => {
    expect(permitsAutomaticWrite(null)).toBe(false);
    expect(permitsAutomaticWrite(undefined)).toBe(false);
  });

  it("only the single eligible reason permits a write", () => {
    for (const reason of AUTOMATION_DECISION_REASONS) {
      const permitted = permitsAutomaticWrite(
        decision({ state: "automatic_when_eligible", eligible: reason === "automatic", reason }),
      );
      expect(permitted, `reason ${reason}`).toBe(reason === "automatic");
    }
  });

  it("`eligible: true` with any other reason is refused — the two must agree", () => {
    // A row that claims eligibility under `insufficient_calibration` is
    // incoherent, and the consumer must not resolve the incoherence in favour
    // of writing.
    expect(
      permitsAutomaticWrite(
        decision({ state: "automatic_when_eligible", eligible: true, reason: "insufficient_calibration" }),
      ),
    ).toBe(false);
    expect(
      permitsAutomaticWrite(
        decision({ state: "automatic_when_eligible", eligible: true, reason: "blocked_by_recent_undo" }),
      ),
    ).toBe(false);
  });

  it("high precision on a tiny sample does not permit a write", () => {
    // 2 of 2 approved is precision 1.0 — and it is two examples.
    expect(
      permitsAutomaticWrite(
        decision({
          state: "automatic_when_eligible",
          eligible: false,
          reason: "insufficient_calibration",
          calibration: { ...decision().calibration, reviewed: 2, approved: 2, precision: 1 },
        }),
      ),
    ).toBe(false);
  });

  // NON-VACUITY: the predicate can return true, so every `false` above is a
  // refusal rather than a function that never says yes.
  it("permits a write when the database says the category is eligible", () => {
    expect(
      permitsAutomaticWrite(decision({ state: "automatic_when_eligible", eligible: true, reason: "automatic" })),
    ).toBe(true);
  });
});

describe("the shortfall the owner reads", () => {
  it("is null for a category that is not armed — a shortfall is not why it refuses", () => {
    expect(calibrationShortfall(decision({ state: "suggest_only" }))).toBeNull();
    expect(calibrationShortfall(decision({ state: "disabled" }))).toBeNull();
  });

  it("names how many examples and how much precision are missing", () => {
    const shortfall = calibrationShortfall(
      decision({
        state: "automatic_when_eligible",
        reason: "insufficient_calibration",
        calibration: { ...decision().calibration, reviewed: 2, approved: 1, rejected: 1, precision: 0.5 },
      }),
    );
    expect(shortfall).toEqual({ reviewed: 48, precision: 0.4 });
  });

  it("reports no precision shortfall when nothing has been reviewed", () => {
    const shortfall = calibrationShortfall(decision({ state: "automatic_when_eligible" }));
    expect(shortfall).toEqual({ reviewed: 50, precision: null });
  });

  it("never reports a negative shortfall once a bar is cleared", () => {
    const shortfall = calibrationShortfall(
      decision({
        state: "automatic_when_eligible",
        calibration: { ...decision().calibration, reviewed: 90, approved: 90, precision: 1 },
      }),
    );
    expect(shortfall).toEqual({ reviewed: 0, precision: 0 });
  });
});

describe("the vocabularies are closed", () => {
  it("three states, no more", () => {
    expect([...AUTOMATION_POLICY_STATES]).toEqual(["disabled", "suggest_only", "automatic_when_eligible"]);
  });

  it("five reasons, exactly one of which is eligible", () => {
    expect(AUTOMATION_DECISION_REASONS).toHaveLength(5);
    expect(AUTOMATION_DECISION_REASONS).toContain("automatic");
  });

  it("four outcomes, and correction, rejection and undo are distinct signals", () => {
    expect([...CALIBRATION_OUTCOMES]).toEqual(["approved", "corrected", "rejected", "undone"]);
    expect(new Set(CALIBRATION_OUTCOMES).size).toBe(4);
  });

  it("freshness and the undo block are real numbers, not placeholders", () => {
    expect(CALIBRATION_FRESHNESS.minimumRecentReviewed).toBeGreaterThan(0);
    expect(CALIBRATION_FRESHNESS.newestWithinDays).toBeLessThan(CALIBRATION_FRESHNESS.recentWindowDays);
    expect(CALIBRATION_FRESHNESS.undoBlockWindow).toBeGreaterThan(0);
  });
});
