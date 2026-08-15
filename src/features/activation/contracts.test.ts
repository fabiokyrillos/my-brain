import { describe, expect, it } from "vitest";

import {
  ACTIVATION_FACT_KEYS,
  activationFacts,
  deriveActivationProgress,
  nextActivationFact,
  readingToState,
  type ActivationReading,
} from "./contracts";

/** A satisfied reading, spelled once so the tables below stay readable. */
const yes: ActivationReading = { ok: true, satisfied: true };
const no: ActivationReading = { ok: true, satisfied: false };
const broken: ActivationReading = { ok: false };

function readings(overrides: Partial<Record<(typeof ACTIVATION_FACT_KEYS)[number], ActivationReading>> = {}) {
  return {
    locale_and_timezone: no,
    ai_credential: no,
    entry_captured: no,
    interpretation_reviewed: no,
    task_confirmed: no,
    ...overrides,
  };
}

describe("2O-ACTIVATION-001: activation is declared as ordered data, not prose", () => {
  it("declares five facts, in a strictly increasing order starting at one", () => {
    expect(activationFacts).toHaveLength(5);
    expect(activationFacts.map((fact) => fact.order)).toEqual([1, 2, 3, 4, 5]);
  });

  it("declares each key exactly once, and the key list agrees with the definitions", () => {
    const keys = activationFacts.map((fact) => fact.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...ACTIVATION_FACT_KEYS]).toEqual(keys);
  });

  it("names, for every fact, the existing data it is read from", () => {
    // The list is the contract `2O-ONBOARD-002` renders from. A fact with no
    // source could not be derived, and would have to be stored — which
    // `2O-ACTIVATION-002` forbids absolutely.
    for (const fact of activationFacts) {
      expect(fact.derivedFrom.length, `${fact.key} names no source`).toBeGreaterThan(0);
    }
  });
});

describe("2O-ACTIVATION-002: no fact holds state of its own", () => {
  it("names only tables that exist for their own reasons, never a progress store", () => {
    /*
     * `OD-2O-3` is signed **A**, so this prohibition is absolute: there is no
     * branch under which a stored onboarding step, cursor or flag becomes
     * permitted. The check is deliberately shaped as a *refusal* over the
     * declared sources rather than as a search of the tree — a stored flag would
     * arrive here, as a source, before it arrived anywhere else.
     */
    const sources = activationFacts.flatMap((fact) => fact.derivedFrom);
    for (const source of sources) {
      expect(source, `${source} reads as onboarding bookkeeping`).not.toMatch(
        /onboard|activation|progress|step|cursor|tour|wizard|checklist/i,
      );
    }
    // Non-vacuous, in both directions: the corpus is real, and the pattern
    // really matches the shape it forbids.
    expect(sources.length).toBe(5);
    expect(["onboarding_progress"].filter((name) => /onboard/i.test(name))).toHaveLength(1);
  });
});

describe("2O-ACTIVATION-003: a fact is three-valued, and a failed read is never a false fact", () => {
  it("maps each reading to its own state", () => {
    expect(readingToState(yes)).toBe("satisfied");
    expect(readingToState(no)).toBe("unsatisfied");
    expect(readingToState(broken)).toBe("unreadable");
  });

  it("never reports a failed read as unsatisfied", () => {
    // The whole point of the third value. A read that failed and a fact that is
    // false are different things, and collapsing them is how a product tells a
    // user to do something they have already done.
    expect(readingToState(broken)).not.toBe("unsatisfied");
  });

  it("keeps completeness three-valued too", () => {
    const all = (reading: ActivationReading) =>
      Object.fromEntries(ACTIVATION_FACT_KEYS.map((key) => [key, reading])) as Record<
        (typeof ACTIVATION_FACT_KEYS)[number],
        ActivationReading
      >;

    expect(deriveActivationProgress(all(yes)).complete).toBe("yes");
    expect(deriveActivationProgress(all(no)).complete).toBe("no");
    // Nothing is known to be missing, and something could not be read: the
    // honest answer is neither "done" nor "not done".
    expect(deriveActivationProgress(all(broken)).complete).toBe("unknown");
  });

  it("reports `no` rather than `unknown` when something is genuinely missing", () => {
    // An unreadable fact does not erase a fact that was read and found false.
    const progress = deriveActivationProgress(
      readings({ locale_and_timezone: broken, ai_credential: no }),
    );
    expect(progress.complete).toBe("no");
    expect(progress.unreadableCount).toBe(1);
  });

  it("counts only satisfied facts as satisfied", () => {
    const progress = deriveActivationProgress(
      readings({ locale_and_timezone: yes, ai_credential: yes, entry_captured: broken }),
    );
    expect(progress.satisfiedCount).toBe(2);
    expect(progress.unreadableCount).toBe(1);
    expect(progress.facts).toHaveLength(5);
  });

  it("returns the facts in declared order, whatever order the readings arrive in", () => {
    const progress = deriveActivationProgress(readings());
    expect(progress.facts.map((fact) => fact.key)).toEqual([...ACTIVATION_FACT_KEYS]);
  });
});

describe("2O-ONBOARD-009 groundwork: the next step is derived, so a pause and an interruption are the same", () => {
  it("offers the first fact that is not satisfied", () => {
    const progress = deriveActivationProgress(
      readings({ locale_and_timezone: yes, ai_credential: yes }),
    );
    expect(nextActivationFact(progress)?.key).toBe("entry_captured");
  });

  it("offers nothing once every fact is satisfied", () => {
    const progress = deriveActivationProgress(
      Object.fromEntries(ACTIVATION_FACT_KEYS.map((key) => [key, yes])) as Parameters<
        typeof deriveActivationProgress
      >[0],
    );
    expect(nextActivationFact(progress)).toBeNull();
  });

  it("does not skip an unreadable fact, and says the state it is offering", () => {
    // Skipping it would claim it is done; treating it as false would claim it is
    // not. It is offered, carrying `unreadable`, so the caller can say so.
    const progress = deriveActivationProgress(
      readings({ locale_and_timezone: yes, ai_credential: broken }),
    );
    const next = nextActivationFact(progress);
    expect(next?.key).toBe("ai_credential");
    expect(next?.state).toBe("unreadable");
  });

  it("derives the same answer from the same readings, with no memory between calls", () => {
    // `2O-ONBOARD-009`: derived state is resumable by construction. Two calls on
    // two devices see the same account and must answer identically.
    const input = readings({ locale_and_timezone: yes, ai_credential: yes, entry_captured: yes });
    expect(deriveActivationProgress(input)).toEqual(deriveActivationProgress(input));
  });
});
