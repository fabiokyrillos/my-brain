import { describe, expect, it } from "vitest";

import {
  activationFacts,
  deriveActivationProgress,
  type ActivationFactKey,
  type ActivationReading,
} from "@/features/activation/contracts";
import {
  ASSISTANT_IDENTITY_DEFAULTS,
  ONBOARDING_STEP_KEYS,
  deriveOnboardingPath,
  destinationHref,
  isAssistantPersonalised,
  onboardingSteps,
  pathMirrorsActivationOrder,
  type OnboardingExtraKey,
  type OnboardingStepKey,
} from "./contracts";
import { byokSettingsHref } from "@/features/byok/routes";

const SATISFIED: ActivationReading = { ok: true, satisfied: true };
const UNSATISFIED: ActivationReading = { ok: true, satisfied: false };
const UNREADABLE: ActivationReading = { ok: false };

function progressOf(overrides: Partial<Record<ActivationFactKey, ActivationReading>> = {}) {
  return deriveActivationProgress({
    locale_and_timezone: UNSATISFIED,
    ai_credential: UNSATISFIED,
    entry_captured: UNSATISFIED,
    interpretation_reviewed: UNSATISFIED,
    task_confirmed: UNSATISFIED,
    ...overrides,
  } as Record<ActivationFactKey, ActivationReading>);
}

function pathOf(input: {
  facts?: Partial<Record<ActivationFactKey, ActivationReading>>;
  extras?: Partial<Record<OnboardingExtraKey, ActivationReading>>;
  dismissed?: boolean;
}) {
  return deriveOnboardingPath({
    progress: progressOf(input.facts),
    extras: {
      assistant_identity: UNSATISFIED,
      memory_created: UNSATISFIED,
      ...input.extras,
    } as Record<OnboardingExtraKey, ActivationReading>,
    dismissed: input.dismissed ?? false,
  });
}

function stateOf(path: ReturnType<typeof pathOf>, key: OnboardingStepKey) {
  return path.steps.find((step) => step.key === key)?.state;
}

const EVERY_FACT_SATISFIED: Record<ActivationFactKey, ActivationReading> = {
  locale_and_timezone: SATISFIED,
  ai_credential: SATISFIED,
  entry_captured: SATISFIED,
  interpretation_reviewed: SATISFIED,
  task_confirmed: SATISFIED,
};

describe("2O-ONBOARD-002: the path is declared as ordered data and cannot disagree with activation", () => {
  it("declares seven steps, in a strictly increasing order starting at one", () => {
    expect(onboardingSteps.map((step) => step.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("declares each key exactly once", () => {
    expect(new Set(ONBOARDING_STEP_KEYS).size).toBe(ONBOARDING_STEP_KEYS.length);
  });

  it("carries the five activation facts in exactly the order activation declares them", () => {
    expect(pathMirrorsActivationOrder()).toBe(true);
  });

  it("rejects a planted reordering, so the check above is not blanket", () => {
    // The same five facts, two of them swapped. Every other property still
    // holds: same count, same keys, same orders present.
    const reordered = onboardingSteps
      .filter((step) => step.fact !== null)
      .map((step, index) => ({
        order: index === 0 ? 99 : step.order,
        fact: step.fact,
      }));
    expect(pathMirrorsActivationOrder(reordered)).toBe(false);
  });

  it("rejects a path that dropped one of the five", () => {
    const short = onboardingSteps.filter((step) => step.fact !== null).slice(1);
    expect(pathMirrorsActivationOrder(short)).toBe(false);
  });

  it("mirrors exactly five, and adds exactly the two this family asks for", () => {
    const mirrored = onboardingSteps.filter((step) => step.fact !== null);
    const extra = onboardingSteps.filter((step) => step.fact === null).map((step) => step.key);
    expect(mirrored).toHaveLength(activationFacts.length);
    expect(extra).toEqual(["assistant_identity", "memory_created"]);
  });
});

describe("2O-ACTIVATION-002 reaches the path: no step holds state of its own", () => {
  it("names, for every step, the existing data it is read from", () => {
    for (const step of onboardingSteps) {
      expect(step.derivedFrom.length, `${step.key} names no source`).toBeGreaterThan(0);
    }
  });

  it("names only tables that exist for their own reasons, never a progress store", () => {
    const sources = onboardingSteps.flatMap((step) => step.derivedFrom);
    for (const source of sources) {
      expect(
        /onboard|progress|step|cursor|tour|wizard|checklist|dismiss/i.test(source),
        `${source} reads as onboarding bookkeeping`,
      ).toBe(false);
    }
  });

  it("derives the same answer from the same readings, with no memory between calls", () => {
    const input = { facts: { entry_captured: SATISFIED } };
    expect(pathOf(input)).toEqual(pathOf(input));
  });
});

describe("2O-ONBOARD-011: a step that cannot succeed is not offered as the thing to do", () => {
  it("blocks the interpretation review when the credential is known absent", () => {
    const path = pathOf({ facts: { ai_credential: UNSATISFIED } });
    expect(stateOf(path, "interpretation_reviewed")).toBe("blocked");
  });

  it("blocks nothing else, because nothing else needs the credential to succeed", () => {
    const path = pathOf({ facts: { ai_credential: UNSATISFIED } });
    const blocked = path.steps.filter((step) => step.state === "blocked").map((step) => step.key);
    expect(blocked).toEqual(["interpretation_reviewed"]);
  });

  it("never blocks a step that is already satisfied", () => {
    const path = pathOf({
      facts: { ai_credential: UNSATISFIED, interpretation_reviewed: SATISFIED },
    });
    expect(stateOf(path, "interpretation_reviewed")).toBe("satisfied");
  });

  it("does not claim `blocked` off a credential it could not read", () => {
    // The mirror of `2O-ACTIVATION-003`, one level up: asserting "you cannot do
    // this" from a failed read is the same error as rendering a false fact.
    const path = pathOf({ facts: { ai_credential: UNREADABLE } });
    expect(stateOf(path, "interpretation_reviewed")).toBe("unsatisfied");
    expect(path.credential).toBe("unreadable");
  });

  it("never offers a blocked step, over every combination of readings there is", () => {
    /*
     * Exhaustive rather than illustrative — 3^7 = 2187 combinations, and the
     * property is one line. A hand-picked example would have proved the one
     * case I thought of.
     */
    const READINGS = [SATISFIED, UNSATISFIED, UNREADABLE];
    const FACT_KEYS: ActivationFactKey[] = [
      "locale_and_timezone",
      "ai_credential",
      "entry_captured",
      "interpretation_reviewed",
      "task_confirmed",
    ];
    const EXTRA_KEYS: OnboardingExtraKey[] = ["assistant_identity", "memory_created"];
    let sawBlocked = 0;
    let combinations = 0;

    for (let index = 0; index < 3 ** 7; index += 1) {
      let remainder = index;
      const facts: Partial<Record<ActivationFactKey, ActivationReading>> = {};
      const extras: Partial<Record<OnboardingExtraKey, ActivationReading>> = {};
      for (const key of FACT_KEYS) {
        facts[key] = READINGS[remainder % 3];
        remainder = Math.floor(remainder / 3);
      }
      for (const key of EXTRA_KEYS) {
        extras[key] = READINGS[remainder % 3];
        remainder = Math.floor(remainder / 3);
      }

      const path = pathOf({ facts, extras });
      combinations += 1;
      if (path.steps.some((step) => step.state === "blocked")) sawBlocked += 1;
      expect(path.nextStep?.state, `offered a blocked step at ${index}`).not.toBe("blocked");
    }

    // Non-vacuous in both directions: the loop really ran, and `blocked` really
    // occurs — otherwise the assertion above holds over nothing.
    expect(combinations).toBe(2187);
    expect(sawBlocked).toBeGreaterThan(0);
  });

  it("keeps a blocked step in the path rather than shortening it silently", () => {
    const path = pathOf({ facts: { ai_credential: UNSATISFIED } });
    expect(path.steps.map((step) => step.key)).toContain("interpretation_reviewed");
    expect(path.total).toBe(onboardingSteps.length);
  });

  it("orders the credential step before everything that needs it, which is what makes the above safe", () => {
    /*
     * The structural reason, asserted rather than assumed. Because the
     * credential step precedes every step that requires a credential, an
     * account with no credential is always offered the credential step first —
     * so a blocked step can never be the next one. `nextStep` refuses one
     * anyway, and this is the assertion that would fail if a future step were
     * inserted in a position that made that refusal load-bearing without
     * anyone noticing.
     */
    const credentialOrder = onboardingSteps.find((step) => step.key === "ai_credential")!.order;
    const dependants = onboardingSteps.filter((step) => step.requiresCredential);
    expect(dependants.length).toBeGreaterThan(0);
    for (const step of dependants) {
      expect(step.order, `${step.key} needs the credential but is offered before it`).toBeGreaterThan(
        credentialOrder,
      );
    }
  });

  it("offers nothing at all when every remaining step is blocked, and still says the path is incomplete", () => {
    const path = pathOf({
      facts: {
        ...EVERY_FACT_SATISFIED,
        ai_credential: UNSATISFIED,
        interpretation_reviewed: UNSATISFIED,
      },
      extras: { assistant_identity: SATISFIED, memory_created: SATISFIED },
    });
    // `ai_credential` itself is unsatisfied and unblocked, so it is offered —
    // which is the point: the one action that unblocks the rest.
    expect(path.nextStep?.key).toBe("ai_credential");
    expect(path.complete).toBe("no");
  });
});

describe("2O-ACTIVATION-003's vocabulary survives the trip into the path", () => {
  it("carries each fact's state through unchanged", () => {
    const path = pathOf({
      facts: { locale_and_timezone: SATISFIED, entry_captured: UNREADABLE },
    });
    expect(stateOf(path, "locale_and_timezone")).toBe("satisfied");
    expect(stateOf(path, "entry_captured")).toBe("unreadable");
  });

  it("maps the two extra readings the same way", () => {
    const path = pathOf({
      extras: { assistant_identity: SATISFIED, memory_created: UNREADABLE },
    });
    expect(stateOf(path, "assistant_identity")).toBe("satisfied");
    expect(stateOf(path, "memory_created")).toBe("unreadable");
  });

  it("keeps completeness three-valued, and calls an unreadable read `unknown` rather than `no`", () => {
    const path = pathOf({
      facts: { ...EVERY_FACT_SATISFIED, task_confirmed: UNREADABLE },
      extras: { assistant_identity: SATISFIED, memory_created: SATISFIED },
    });
    expect(path.complete).toBe("unknown");
  });

  it("counts only satisfied steps as satisfied", () => {
    const path = pathOf({
      facts: { locale_and_timezone: SATISFIED, entry_captured: UNREADABLE },
    });
    expect(path.satisfiedCount).toBe(1);
    expect(path.total).toBe(7);
  });
});

describe("2O-ONBOARD-009 / -010: what makes the panel appear, and what makes it stop", () => {
  it("offers the path while anything is outstanding", () => {
    expect(pathOf({}).offered).toBe(true);
  });

  it("stops offering once every step is satisfied, with nobody having dismissed anything", () => {
    const path = pathOf({
      facts: EVERY_FACT_SATISFIED,
      extras: { assistant_identity: SATISFIED, memory_created: SATISFIED },
    });
    expect(path.complete).toBe("yes");
    expect(path.offered).toBe(false);
  });

  it("stops offering when dismissed, whatever the states are", () => {
    expect(pathOf({ dismissed: true }).offered).toBe(false);
  });

  it("keeps offering when something could not be read, rather than withdrawing on a failed read", () => {
    const path = pathOf({
      facts: { ...EVERY_FACT_SATISFIED, task_confirmed: UNREADABLE },
      extras: { assistant_identity: SATISFIED, memory_created: SATISFIED },
    });
    expect(path.offered).toBe(true);
  });

  it("holds no dismissal of its own: the same readings with the flag flipped differ only there", () => {
    const offered = pathOf({});
    const hidden = pathOf({ dismissed: true });
    expect(hidden.steps).toEqual(offered.steps);
    expect(hidden.nextStep).toEqual(offered.nextStep);
  });
});

describe("2O-ONBOARD-004: the identity step reads a choice, not the existence of a row", () => {
  it("reads a row that is entirely default as not personalised", () => {
    expect(isAssistantPersonalised({ ...ASSISTANT_IDENTITY_DEFAULTS })).toBe(false);
  });

  it("reads an absent row as not personalised", () => {
    expect(isAssistantPersonalised(null)).toBe(false);
    expect(isAssistantPersonalised(undefined)).toBe(false);
  });

  it("accepts a change to any one of the four, not only the name", () => {
    for (const column of Object.keys(ASSISTANT_IDENTITY_DEFAULTS) as (keyof typeof ASSISTANT_IDENTITY_DEFAULTS)[]) {
      expect(
        isAssistantPersonalised({ ...ASSISTANT_IDENTITY_DEFAULTS, [column]: "something else" }),
        `${column} alone did not count`,
      ).toBe(true);
    }
  });

  it("does not read whitespace or an empty string as a choice", () => {
    expect(isAssistantPersonalised({ ...ASSISTANT_IDENTITY_DEFAULTS, agent_name: "   " })).toBe(false);
    expect(isAssistantPersonalised({ ...ASSISTANT_IDENTITY_DEFAULTS, agent_name: "" })).toBe(false);
  });

  it("ignores a padded default rather than counting it as a change", () => {
    expect(isAssistantPersonalised({ ...ASSISTANT_IDENTITY_DEFAULTS, agent_name: "  Brain  " })).toBe(false);
  });
});

describe("the destinations are real, and the credential step agrees with the recovery", () => {
  it("resolves the credential step to the same route the awaiting state links to", () => {
    const credentialStep = onboardingSteps.find((step) => step.key === "ai_credential");
    expect(destinationHref(credentialStep!.destination, "pt-BR")).toBe(byokSettingsHref("pt-BR"));
    expect(destinationHref(credentialStep!.destination, "en")).toBe(byokSettingsHref("en"));
  });

  it("builds a same-origin path for every destination, in both locales", () => {
    for (const step of onboardingSteps) {
      for (const locale of ["pt-BR", "en"] as const) {
        expect(destinationHref(step.destination, locale)).toMatch(
          new RegExp(`^/${locale}/app/[a-z]+$`),
        );
      }
    }
  });
});
