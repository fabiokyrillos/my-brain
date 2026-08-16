/**
 * The guided path — `2O-ONBOARD-001` … `-011`.
 *
 * ## What this module is, and what it deliberately is not
 *
 * It is the **shape of the path as data**: which steps exist, in what order,
 * which activation fact each one mirrors, where each one sends the owner, and
 * which existing module each one mounts. It holds no copy, issues no query and
 * renders nothing, so the same declaration can be asserted by a unit test, read
 * by a Server Component and checked against the tree by a build-time guard.
 *
 * ## The path is derived, and there is no branch under which it is not
 *
 * `OD-2O-3` is signed **A** and `2O-ACTIVATION-002` is therefore **absolute**:
 * no stored onboarding step, cursor or flag. Every step below names the existing
 * data its state is read from, and every one of those tables exists for its own
 * reasons — `entries` is where entries live, not where progress is recorded.
 *
 * That is the whole mechanism behind `2O-ONBOARD-009`. The path is resumable
 * across sessions and devices **by construction** rather than by a feature, and
 * an interrupted onboarding is indistinguishable from a paused one because
 * there is no cursor that could be stale. It is also why nothing here needs a
 * migration: there is nothing to persist.
 *
 * ## Seven steps, five of which are activation facts
 *
 * `2O-ONBOARD-002` requires the path to be rendered from `2O-ACTIVATION-001`'s
 * ordered facts, and that contract declares **exactly five**. Two of this
 * family's own requirements ask for steps that are not among them:
 * `2O-ONBOARD-004` asks for the assistant's identity and `2O-ONBOARD-008` asks
 * for a first memory.
 *
 * They are added **here**, as steps, rather than by widening `activationFacts`.
 * Adding a sixth and seventh fact would change a contract slice 2O.0 delivered
 * and `contracts.test.ts` guards — on a requirement that never asked for it —
 * and every other consumer of activation would inherit two facts it has no use
 * for. What `2O-ONBOARD-002` demands is that the path and the truth about the
 * account cannot disagree; `pathMirrorsActivationOrder` below is asserted, so
 * the five appear in the path in exactly the order activation declares them,
 * carrying exactly the state activation read.
 *
 * Both extra steps are derived the same way and hold no state of their own, so
 * the absolute prohibition reaches them too.
 */

import {
  activationFacts,
  readingToState,
  type ActivationFactKey,
  type ActivationFactState,
  type ActivationProgress,
  type ActivationReading,
} from "@/features/activation/contracts";
import { byokSettingsHref } from "@/features/byok/routes";
import type { Locale } from "@/lib/preferences";

/** The two steps this family asks for that activation does not declare. */
export type OnboardingExtraKey = "assistant_identity" | "memory_created";

export type OnboardingStepKey = ActivationFactKey | OnboardingExtraKey;

/**
 * Where a step sends the owner.
 *
 * A closed set rather than free strings: every value resolves to a route that
 * already exists, and `onboarding-guard.test.ts` checks each one against the
 * app directory. A step that pointed at a page nobody had written would
 * otherwise render as a confident link to a 404.
 */
export type OnboardingDestination = "settings" | "capture" | "inbox" | "work" | "memories";

/**
 * A fourth value the activation vocabulary does not have, and why.
 *
 * `2O-ACTIVATION-003`'s three values answer *"is this fact true?"*.
 * `2O-ONBOARD-011` asks a different question — *"could the owner even do this
 * right now?"* — and the honest answer for a step that needs an AI credential
 * on an account that has none is neither "not done" nor "unreadable". It is
 * **blocked**, and the difference is the whole requirement: showing a step that
 * cannot succeed is precisely what `-011` forbids.
 *
 * `blocked` is claimed **only** when the credential is *known* absent. A
 * credential that could not be read leaves the step in its own state, because
 * asserting "you cannot do this" off a failed read would be the same mistake
 * `2O-ACTIVATION-003` exists to prevent, one level up.
 */
export type OnboardingStepState = ActivationFactState | "blocked";

export type OnboardingStepDefinition = Readonly<{
  key: OnboardingStepKey;
  /** 1-based position. Declared order is rendered order. */
  order: number;
  /**
   * The activation fact this step mirrors, or `null` for the two steps
   * `2O-ONBOARD-004` and `-008` ask for that activation does not declare.
   * Never a second source of truth for a fact activation already reads.
   */
  fact: ActivationFactKey | null;
  /** The existing data the step's state is read from. Never a progress store. */
  derivedFrom: readonly string[];
  destination: OnboardingDestination;
  /**
   * The module the step **mounts rather than reimplements**.
   *
   * The plan names reimplementation as this slice's second risk: four steps
   * reach surfaces that already exist, and a guided path is exactly the shape
   * that grows a second write path by accident. This field is what
   * `onboarding-guard.test.ts` resolves against the tree, so a step that
   * quietly grew its own form would have to lie here first.
   */
  mounts: string;
  /**
   * Whether the step can succeed at all without an active AI credential.
   *
   * Only the interpretation review does. Capture deliberately does not —
   * `capture_entry_async` stores the entry and leaves the job pending, which is
   * the `awaiting_ai_configuration` state the product already renders — and a
   * task and a memory both have confirmed manual paths that never call a model.
   */
  requiresCredential: boolean;
}>;

export const onboardingSteps = [
  {
    key: "locale_and_timezone",
    order: 1,
    fact: "locale_and_timezone",
    derivedFrom: ["profiles"],
    destination: "settings",
    mounts: "profile/settings-form",
    requiresCredential: false,
  },
  /*
   * `2O-ONBOARD-004`, and it sits second rather than first because it is the
   * only step whose value is cosmetic until something speaks: naming the
   * assistant before the product renders a single date in the right zone is
   * asking for a preference about an actor the owner has not met.
   */
  {
    key: "assistant_identity",
    order: 2,
    fact: null,
    derivedFrom: ["agent_preferences"],
    destination: "settings",
    mounts: "profile/settings-form",
    requiresCredential: false,
  },
  {
    key: "ai_credential",
    order: 3,
    fact: "ai_credential",
    derivedFrom: ["user_ai_credentials"],
    destination: "settings",
    mounts: "byok/credential-panel",
    requiresCredential: false,
  },
  {
    key: "entry_captured",
    order: 4,
    fact: "entry_captured",
    derivedFrom: ["entries"],
    destination: "capture",
    mounts: "capture/actions",
    requiresCredential: false,
  },
  {
    key: "interpretation_reviewed",
    order: 5,
    fact: "interpretation_reviewed",
    derivedFrom: ["entry_task_candidate_resolutions"],
    destination: "inbox",
    mounts: "daily-cycle/records-queue",
    requiresCredential: true,
  },
  {
    key: "task_confirmed",
    order: 6,
    fact: "task_confirmed",
    derivedFrom: ["tasks"],
    destination: "work",
    mounts: "tasks/actions",
    requiresCredential: false,
  },
  /*
   * `2O-ONBOARD-008`'s second half. Last because a memory is the one step that
   * is worth nothing until the product already knows something: it is the
   * owner correcting or extending what was understood, not a form to fill on
   * arrival.
   */
  {
    key: "memory_created",
    order: 7,
    fact: null,
    derivedFrom: ["memories"],
    destination: "memories",
    mounts: "memories/actions",
    requiresCredential: false,
  },
] as const satisfies readonly OnboardingStepDefinition[];

export const ONBOARDING_STEP_KEYS = onboardingSteps.map((step) => step.key);

/**
 * The column defaults, in the schema's own spelling, for the one step whose
 * state is *"has the owner chosen?"* rather than *"does a row exist?"*.
 *
 * `agent_preferences` is created with values already in it, so existence proves
 * nothing about intent. These four are the defaults `202607160001_phase1_identity.sql`
 * declares, and `onboarding-guard.test.ts` re-reads that migration and fails if
 * any of them drifts — which is not hypothetical: `defaultAgentPreferences` in
 * `src/lib/preferences.ts` says `tone: "direct"` while the column defaults to
 * `informal`, so deriving this from that module would have read a fresh account
 * as already personalised. That finding is recorded and not repaired here; it
 * belongs to the preferences centre.
 */
export const ASSISTANT_IDENTITY_DEFAULTS = {
  agent_name: "Brain",
  personality: "direct",
  tone: "informal",
  response_detail: "short",
} as const;

export type AssistantIdentityColumn = keyof typeof ASSISTANT_IDENTITY_DEFAULTS;

export const ASSISTANT_IDENTITY_COLUMNS = Object.keys(
  ASSISTANT_IDENTITY_DEFAULTS,
) as readonly AssistantIdentityColumn[];

/**
 * *"Has the owner personalised the assistant?"*, from a row of that table.
 *
 * Any one of the four differing from its default is enough. Requiring the name
 * alone would leave an owner who set a tone and kept `Brain` looking like an
 * owner who never opened the form.
 *
 * **The residual is stated rather than hidden:** an owner who deliberately
 * wants every default never satisfies this step, and their exit is
 * `2O-ONBOARD-010`'s dismissal. Deriving it any other way would need a stored
 * "I saw this" flag, which `2O-ACTIVATION-002` forbids absolutely.
 */
export function isAssistantPersonalised(
  row: Partial<Record<AssistantIdentityColumn, string | null>> | null | undefined,
): boolean {
  if (!row) return false;
  return ASSISTANT_IDENTITY_COLUMNS.some((column) => {
    const value = row[column];
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    return trimmed !== "" && trimmed !== ASSISTANT_IDENTITY_DEFAULTS[column];
  });
}

export type OnboardingStep = Readonly<{
  key: OnboardingStepKey;
  order: number;
  state: OnboardingStepState;
  destination: OnboardingDestination;
  /** True only where the step is blocked, so the view never has to re-derive it. */
  needsCredential: boolean;
}>;

export type OnboardingPath = Readonly<{
  steps: readonly OnboardingStep[];
  /**
   * The step to offer now: the first that is neither satisfied nor blocked.
   *
   * A blocked step is **skipped here and still rendered** — `2O-ONBOARD-011`
   * forbids showing it as the thing to do, and hiding it would leave the owner
   * with a path that silently got shorter. When every remaining step is
   * blocked this is `null` while `complete` is `"no"`, and that combination is
   * exactly the state in which the panel offers the credential recovery
   * instead of a step.
   */
  nextStep: OnboardingStep | null;
  satisfiedCount: number;
  total: number;
  /** Three-valued for the same reason a fact is. */
  complete: "yes" | "no" | "unknown";
  /** The credential's own state, so the view can say the true thing about it. */
  credential: ActivationFactState;
  /** Whether the panel renders at all. Dismissal and completion, in one answer. */
  offered: boolean;
}>;

function stateFor(
  definition: OnboardingStepDefinition,
  own: ActivationFactState,
  credential: ActivationFactState,
): OnboardingStepState {
  if (own === "satisfied") return "satisfied";
  // A satisfied step is never blocked: an interpretation reviewed last month
  // stays reviewed whether or not a credential is present today.
  if (definition.requiresCredential && credential === "unsatisfied") return "blocked";
  return own;
}

export function deriveOnboardingPath(input: {
  progress: ActivationProgress;
  extras: Readonly<Record<OnboardingExtraKey, ActivationReading>>;
  dismissed: boolean;
}): OnboardingPath {
  const { progress, extras, dismissed } = input;
  const factStates = new Map(progress.facts.map((fact) => [fact.key, fact.state]));
  const credential = factStates.get("ai_credential") ?? "unreadable";

  const steps = onboardingSteps.map((definition) => {
    const own = definition.fact
      ? (factStates.get(definition.fact) ?? "unreadable")
      : readingToState(extras[definition.key as OnboardingExtraKey]);
    const state = stateFor(definition, own, credential);
    return Object.freeze({
      key: definition.key,
      order: definition.order,
      state,
      destination: definition.destination,
      needsCredential: state === "blocked",
    });
  });

  const satisfiedCount = steps.filter((step) => step.state === "satisfied").length;
  const complete = steps.every((step) => step.state === "satisfied")
    ? "yes"
    : // `blocked` is knowledge: the account is genuinely missing this step.
      steps.some((step) => step.state === "unsatisfied" || step.state === "blocked")
      ? "no"
      : "unknown";

  return Object.freeze({
    steps,
    nextStep: steps.find((step) => step.state !== "satisfied" && step.state !== "blocked") ?? null,
    satisfiedCount,
    total: steps.length,
    complete,
    credential,
    /*
     * `2O-ONBOARD-010` — a dismissed path never reappears on its own — and the
     * quieter half: a finished path stops offering itself without anyone
     * having to dismiss it. `unknown` still offers, because the panel can then
     * say it could not read something, and silently withdrawing an offer over
     * a failed read is the mirror of rendering a false fact.
     */
    offered: !dismissed && complete !== "yes",
  });
}

/**
 * `2O-ONBOARD-002`, as a function rather than as a promise in prose.
 *
 * The five activation facts must appear in the path in exactly the order
 * activation declares them. Asserted in `contracts.test.ts` with a planted
 * reordering, because a path whose steps drifted out of the facts' order would
 * still render — it would simply be telling the owner to do things in an order
 * the product does not believe in.
 */
export function pathMirrorsActivationOrder(
  steps: readonly Pick<OnboardingStepDefinition, "order" | "fact">[] = onboardingSteps,
  facts: readonly { key: ActivationFactKey; order: number }[] = activationFacts,
): boolean {
  const inPath = [...steps]
    .filter((step) => step.fact !== null)
    .sort((a, b) => a.order - b.order)
    .map((step) => step.fact);
  const inActivation = [...facts]
    .sort((a, b) => a.order - b.order)
    .map((fact) => fact.key);
  return (
    inPath.length === inActivation.length && inPath.every((key, index) => key === inActivation[index])
  );
}

/**
 * The route a step reaches.
 *
 * The credential step deliberately resolves through `byokSettingsHref` — the
 * same function the `awaiting_ai_configuration` recovery uses — so the step and
 * the recovery can never point at different places. `onboarding-guard.test.ts`
 * asserts that equality rather than trusting this comment.
 */
export function destinationHref(destination: OnboardingDestination, locale: Locale): string {
  if (destination === "settings") return byokSettingsHref(locale);
  return `/${locale}/app/${destination}`;
}
