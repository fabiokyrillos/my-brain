/**
 * The Phase 2F command-funnel reader (PRD 2F-MEASURE-001…006, ADR-055).
 *
 * Owner-scoped, content-free aggregates over the `task_command_*` product
 * events Slice 2E.7 already emits. It computes ADR-055's two evidence tiers and
 * the 90-day expiry, and it computes nothing else: there is no dashboard here,
 * no new event, no new storage, and no HTTP surface.
 *
 * Why this is plain Node rather than TypeScript
 * ---------------------------------------------
 * It has two callers that cannot otherwise share one implementation: the Vitest
 * suite in `src/features/product-analytics/command-funnel.test.ts`, which runs
 * in CI with no network, and `phase-2f-command-funnel-reader.mjs`, which runs
 * against the deployed project. Writing the arithmetic twice would put the gate
 * in two places, and ADR-055's own words are that "a threshold computable two
 * ways is decided twice". This repository carries no `tsx` or `ts-node`, so the
 * shared module is the one both can import.
 *
 * Read versus mirrored, stated precisely
 * --------------------------------------
 * The four event **names** are *read* out of `contracts.ts` through the existing
 * `product-event-vocabulary.mjs`, the mechanism ADR-052 established. The four
 * category vocabularies cannot be: that parser accepts only flat
 * `export const X = [ … ] as const` arrays and throws on a spread, and the
 * category lists are non-exported `readonly T[]` declarations with one spread
 * among them. So they are **restated below and held to the TypeScript
 * originals by exact-equality Vitest cases**. That is a mirror with a CI gate,
 * materially weaker than a read, and it is labelled as one rather than dressed
 * up as ADR-052's mechanism. Re-shaping `contracts.ts` so the parser could read
 * them would be a production change made to serve a test.
 *
 * It fails loudly everywhere. A reader that shrugged at an unknown event name
 * would under-report the moment a fifth one ships; one that shrugged at an
 * unknown category would drop it from a denominator that decides whether money
 * gets spent on semantic retrieval.
 */

import { readProductEventVocabulary } from "./product-event-vocabulary.mjs";

/** The reader's own version, so a pasted number is traceable to its definition. */
export const READER_VERSION = "2026-07-29.1";

const ANALYTICS_SOURCE = "src/features/task-commands/analytics.ts";
const OUTCOMES_SOURCE = "src/features/task-commands/outcomes.ts";

/** Mirrors `TASK_COMMAND_ORIGINS`. */
export const COMMAND_FUNNEL_ORIGINS = ["chat", "work"];

/** Mirrors `TASK_COMMAND_OUTCOMES` — 2E-UX-001's twelve, in its declared order. */
export const COMMAND_FUNNEL_OUTCOMES = [
  "applied",
  "no_change",
  "ambiguous",
  "ambiguous_overflow",
  "matched_requires_confirmation",
  "clarification_requested",
  "still_unmatched",
  "creation_offered",
  "unsupported",
  "rejected_stale",
  "rejected_conflict",
  "refused",
];

/** Mirrors `TASK_COMMAND_PREVIEWED_OUTCOMES` — the twelve plus `previewed`. */
export const COMMAND_FUNNEL_PREVIEWED_OUTCOMES = [...COMMAND_FUNNEL_OUTCOMES, "previewed"];

/** Mirrors `TASK_COMMAND_APPLY_ROUTES`. */
export const COMMAND_FUNNEL_APPLY_ROUTES = ["direct", "confirmed", "created"];

/** Mirrors `TASK_COMMAND_UNDO_RESULTS`. */
export const COMMAND_FUNNEL_UNDO_RESULTS = ["undone", "unavailable", "expired", "refused"];

/**
 * The refusal classes 2F-MEASURE-001 asks for: the categories where the system
 * understood the request and declined to complete it.
 *
 * Derived as a filter over the mirrored vocabulary rather than written as a
 * parallel list, so a thirteenth outcome cannot arrive without the parity case
 * noticing. `still_unmatched` and `creation_offered` are deliberately absent —
 * they are the no-match set below, and classifying them twice would make two
 * independent measures move together. `ambiguous`, `ambiguous_overflow`,
 * `clarification_requested` and `matched_requires_confirmation` are unresolved
 * rather than refused; `no_change` is a successful no-op; `applied` and
 * `previewed` are successes.
 */
const REFUSAL_MEMBERS = ["unsupported", "rejected_stale", "rejected_conflict", "refused"];
export const COMMAND_FUNNEL_REFUSAL_OUTCOMES = COMMAND_FUNNEL_PREVIEWED_OUTCOMES
  .filter((outcome) => REFUSAL_MEMBERS.includes(outcome));

/**
 * ADR-055's `no_match` members. The ADR says *final* outcome, which is why
 * `aggregateCommandFunnel` corrects the offered count by the created count
 * rather than counting preview dispositions — see the `noMatch` rate below.
 */
export const COMMAND_FUNNEL_NO_MATCH_OUTCOMES = ["still_unmatched", "creation_offered"];

/** Excluded from every denominator (ADR-055; 2F-MEASURE-002). */
export const COMMAND_FUNNEL_EXCLUDED_OUTCOMES = ["unsupported"];

/**
 * ADR-055's permanently non-authorizing measures, plus this reader's own
 * diagnostic rate. Carried in the report so a future consumer of the output
 * cannot mistake volume, ease or latency for evidence.
 */
export const COMMAND_FUNNEL_NON_AUTHORIZING = [
  "unsupportedRefusalVolume",
  "commandVolume",
  "oneStepRate",
  "ambiguityRate",
  "latency",
  "previewNoMatchRate",
];

/**
 * ADR-055's thresholds. The rate gates carry an exact fraction beside the
 * decimal: the decimal is for reading, the fraction is what decides, so no
 * rounded rate ever stands between the evidence and the gate.
 */
export const EVIDENCE_TIERS = {
  spike: { qualifyingCommands: 50, activeDays: 10, windowDays: 14 },
  planning: {
    qualifyingCommands: 150,
    activeDays: 20,
    windowDays: 30,
    distinctUsers: 2,
    noMatchRate: { value: 0.2, fraction: { numerator: 1, denominator: 5 } },
    noMatchToCreationRate: { value: 0.15, fraction: { numerator: 3, denominator: 20 } },
  },
};

/** ADR-055's expiry horizon, in days. */
export const EXPIRY_HORIZON_DAYS = 90;

/**
 * What the deployed emitters can and cannot produce, as data.
 *
 * A measurement that reports a structurally-impossible zero as though it were
 * an observation is worse than no measurement. Every entry here was verified
 * against the emit sites in `src/features/task-commands/actions.ts` and
 * `src/features/operations/actions.ts`, and the Vitest parity case fails if a
 * future emitter makes one of these claims stale.
 */
const UNREACHABLE_PREVIEW_OUTCOMES = ["applied", "unsupported", "rejected_conflict"];
export const COMMAND_FUNNEL_REACHABILITY = Object.freeze({
  /**
   * Allowlisted on `task_command_previewed` and reachable from no code path:
   * both `unsupported` branches return before the emitter exists
   * (`actions.ts:347-358` and `:719-726`; `report` is defined at `:400`), and
   * no site passes `applied` or `rejected_conflict` to the preview event.
   */
  unreachablePreviewOutcomes: Object.freeze(
    COMMAND_FUNNEL_PREVIEWED_OUTCOMES.filter((o) => UNREACHABLE_PREVIEW_OUTCOMES.includes(o)),
  ),
  /**
   * One user intent can emit one to three preview rounds: the first round, the
   * disambiguation re-round (`actions.ts:746-777` calling back into the round
   * that emits at `:466`), and the clarification re-round (`:573`, then `:546`,
   * `:558` or `:623`). The allowlist carries no command identifier and
   * `session_id` names a session, so no deduplication is available.
   */
  previewRoundsPerIntent: Object.freeze({ min: 1, max: 3 }),
  /**
   * And some intents emit none: the creation round returns its failure state
   * before reporting when the preview or the confirmation issue fails
   * (`actions.ts:615-622`).
   */
  intentsWithNoPreviewEvent: true,
  /**
   * The Work surface's direct-action buttons apply without a preview round
   * (`operations/actions.ts:386`), so the applied population is a superset of
   * the previewed one. `appliedWithoutPreview` reports the difference.
   */
  appliesWithoutPreview: true,
  /** That same path has no undo event; the only emitter is `actions.ts:1070`. */
  workDirectActionUndoEvent: false,
  /**
   * Consequence for 2F-MEASURE-005: unsupported-refusal *volume* is not
   * measurable this phase. The exclusion rule is implemented and unit-tested,
   * and it is vacuous against production data until an emitter exists.
   */
  unsupportedVolumeMeasurable: false,
});

/**
 * The four `task_command_*` names, read from the contracts module.
 *
 * Derived by prefix rather than listed, so a fifth name added in TypeScript
 * changes what this returns instead of being silently dropped from the funnel.
 */
export function readCommandFunnelEventNames(repositoryRoot) {
  const { eventNames } = readProductEventVocabulary(repositoryRoot);
  const names = eventNames.filter((name) => name.startsWith("task_command_"));
  if (names.length === 0) {
    throw new Error("contracts.ts declares no task_command_* product event names");
  }
  return names;
}

const EVENT_NAMES = [
  "task_command_previewed",
  "task_command_disambiguated",
  "task_command_applied",
  "task_command_undone",
];

function zeroed(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function byOrigin(build) {
  return Object.fromEntries(COMMAND_FUNNEL_ORIGINS.map((origin) => [origin, build()]));
}

/** Three decimals, matching the Phase 2E baseline's precision. Reporting only. */
function rate(numerator, denominator) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

/**
 * `numerator / denominator >= threshold`, decided by integer multiplication.
 *
 * A zero denominator is never met: `0 >= 0` is true in arithmetic and false as
 * evidence, and a gate that a total absence of data can satisfy is not a gate.
 */
function meetsFraction(numerator, denominator, fraction) {
  if (denominator <= 0) return false;
  return numerator * fraction.denominator >= fraction.numerator * denominator;
}

function instantOf(value, label) {
  const parsed = typeof value === "number" ? new Date(value) : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} is not a parseable instant: ${String(value)}`);
  }
  return parsed;
}

/**
 * A calendar-date formatter for the supplied zone.
 *
 * The zone is required with no default. Production tolerates a missing profile
 * row and falls back (`actions.ts:214-224`) because a command still has to run;
 * a *measurement* that silently picks a zone can split one local day into two
 * across a UTC−3 midnight and inflate `activeDays`, which is a gate threshold.
 * An accident in that direction passes a gate, so this refuses instead.
 */
function localDateFormatter(timeZone) {
  if (typeof timeZone !== "string" || timeZone.trim() === "") {
    throw new Error("A time zone is required; the reader never assumes one");
  }
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    throw new Error(`Unusable time zone: ${timeZone}`);
  }
}

function requireMember(value, allowed, property, source) {
  if (!allowed.includes(value)) {
    throw new Error(
      `Unknown ${property} "${String(value)}"; the vocabulary is declared in ${source}`,
    );
  }
  return value;
}

function requireBoolean(value, property) {
  if (typeof value !== "boolean") {
    throw new Error(`Event property ${property} must be a boolean, received ${typeof value}`);
  }
  return value;
}

/**
 * The funnel, for one owner over one window.
 *
 * Single pass, no allocation per row beyond the counters, and every category
 * key present with a zero value so a consumer never has to tell "absent" from
 * "none" — and so a vocabulary member cannot quietly disappear from a report.
 */
export function aggregateCommandFunnel(input) {
  const rows = input?.rows ?? [];
  const windowDays = input?.windowDays;
  if (!Number.isInteger(windowDays) || windowDays <= 0) {
    throw new Error(`windowDays must be a positive integer, received ${String(windowDays)}`);
  }
  const formatter = localDateFormatter(input?.timeZone);
  const end = instantOf(input?.windowEnd, "windowEnd");
  const start = new Date(end.getTime() - windowDays * 86400000);

  const outcomeDistribution = zeroed(COMMAND_FUNNEL_PREVIEWED_OUTCOMES);
  const originSplit = zeroed(COMMAND_FUNNEL_ORIGINS);
  const qualifyingByOrigin = zeroed(COMMAND_FUNNEL_ORIGINS);
  const appliedByOrigin = zeroed(COMMAND_FUNNEL_ORIGINS);
  const appliedRoutesByOrigin = byOrigin(() => zeroed(COMMAND_FUNNEL_APPLY_ROUTES));
  const undoResultsByOrigin = byOrigin(() => zeroed(COMMAND_FUNNEL_UNDO_RESULTS));
  const disambiguationsByOrigin = zeroed(COMMAND_FUNNEL_ORIGINS);
  const activeDates = new Set();

  let qualifyingCommands = 0;
  let unsupportedRefusals = 0;
  let excludedSynthetic = 0;
  let excludedOutOfWindow = 0;
  let oneStepCount = 0;
  let ambiguityCount = 0;
  let stillUnmatched = 0;
  let creationOffered = 0;
  let created = 0;

  for (const row of rows) {
    const eventName = row?.eventName;
    if (!EVENT_NAMES.includes(eventName)) {
      throw new Error(
        `Unknown product event "${String(eventName)}" reached the funnel reader; `
        + "the four names it aggregates are declared in "
        + "src/features/product-analytics/contracts.ts",
      );
    }
    // The synthetic filter runs before the window filter so its count reports
    // every labelled row the query returned, not only the recent ones.
    if (row.isSynthetic === true) {
      excludedSynthetic += 1;
      continue;
    }
    const at = instantOf(row.createdAt, "createdAt");
    if (at.getTime() <= start.getTime() || at.getTime() > end.getTime()) {
      excludedOutOfWindow += 1;
      continue;
    }

    const properties = row.properties ?? {};
    const origin = requireMember(
      properties.commandOrigin,
      COMMAND_FUNNEL_ORIGINS,
      "commandOrigin",
      ANALYTICS_SOURCE,
    );

    if (eventName === "task_command_previewed") {
      const outcome = requireMember(
        properties.outcomeCategory,
        COMMAND_FUNNEL_PREVIEWED_OUTCOMES,
        "outcomeCategory",
        OUTCOMES_SOURCE,
      );
      const oneStep = requireBoolean(properties.oneStep, "oneStep");
      if (COMMAND_FUNNEL_EXCLUDED_OUTCOMES.includes(outcome)) {
        unsupportedRefusals += 1;
        continue;
      }
      qualifyingCommands += 1;
      qualifyingByOrigin[origin] += 1;
      originSplit[origin] += 1;
      outcomeDistribution[outcome] += 1;
      activeDates.add(formatter.format(at));
      if (oneStep) oneStepCount += 1;
      if (outcome === "ambiguous" || outcome === "ambiguous_overflow") ambiguityCount += 1;
      if (outcome === "still_unmatched") stillUnmatched += 1;
      if (outcome === "creation_offered") creationOffered += 1;
      continue;
    }

    if (eventName === "task_command_applied") {
      requireMember(
        properties.outcomeCategory,
        COMMAND_FUNNEL_OUTCOMES,
        "outcomeCategory",
        OUTCOMES_SOURCE,
      );
      const route = requireMember(
        properties.applyRoute,
        COMMAND_FUNNEL_APPLY_ROUTES,
        "applyRoute",
        ANALYTICS_SOURCE,
      );
      appliedByOrigin[origin] += 1;
      appliedRoutesByOrigin[origin][route] += 1;
      if (route === "created") created += 1;
      continue;
    }

    if (eventName === "task_command_undone") {
      const result = requireMember(
        properties.undoResult,
        COMMAND_FUNNEL_UNDO_RESULTS,
        "undoResult",
        ANALYTICS_SOURCE,
      );
      undoResultsByOrigin[origin][result] += 1;
      continue;
    }

    disambiguationsByOrigin[origin] += 1;
  }

  // ADR-055 defines `no_match` on the command's *final* outcome. An offer that
  // became a creation ended `applied`, so it is not a no-match — and the two
  // counts are joinable in aggregate even though no per-row key exists. When a
  // creation's offer sat in an earlier window the difference goes negative;
  // that is reported as skew rather than hidden by the clamp.
  const offeredNotCreated = Math.max(0, creationOffered - created);
  const noMatchNumerator = stillUnmatched + offeredNotCreated;
  const windowBoundarySkew = Math.max(0, created - creationOffered);

  return {
    readerVersion: READER_VERSION,
    adr: "ADR-055",
    window: {
      start: start.toISOString(),
      end: end.toISOString(),
      days: windowDays,
    },
    timeZone: input.timeZone,
    countingUnit: "qualifying_preview_round",
    qualifyingCommands,
    activeDays: activeDates.size,
    unsupportedRefusals,
    excludedSynthetic,
    excludedOutOfWindow,
    outcomeDistribution,
    refusalOutcomeClasses: Object.fromEntries(
      COMMAND_FUNNEL_REFUSAL_OUTCOMES.map((outcome) => [outcome, outcomeDistribution[outcome]]),
    ),
    originSplit,
    appliedRoutesByOrigin,
    undoResultsByOrigin,
    disambiguationsByOrigin,
    appliedWithoutPreview: Object.fromEntries(COMMAND_FUNNEL_ORIGINS.map((origin) => [
      origin,
      Math.max(0, appliedByOrigin[origin] - qualifyingByOrigin[origin]),
    ])),
    rates: {
      noMatch: rate(noMatchNumerator, qualifyingCommands),
      noMatchToCreation: rate(created, qualifyingCommands),
      oneStep: rate(oneStepCount, qualifyingCommands),
      ambiguity: rate(ambiguityCount, qualifyingCommands),
      previewNoMatch: rate(stillUnmatched + creationOffered, qualifyingCommands),
    },
    windowBoundarySkew,
    reachability: COMMAND_FUNNEL_REACHABILITY,
    nonAuthorizing: COMMAND_FUNNEL_NON_AUTHORIZING,
    // Out of an owner-scoped reader's range by construction (2F-MEASURE-004).
    // Reported as absent, never inferred as one: inferring it would let the
    // planning tier read `met` for a single user.
    distinctUsers: null,
    privilegedReadRequired: true,
    counts: {
      stillUnmatched,
      creationOffered,
      created,
      noMatchNumerator,
    },
  };
}

function threshold(required, measured) {
  return { required, measured, met: measured >= required };
}

/**
 * ADR-055's two tiers against one report, plus the dated expiry.
 *
 * The planning tier's verdict vocabulary has no reachable `met`: the distinct
 * user count is out of an owner-scoped reader's range, so the best this can
 * return is `met_pending_privileged_read`. That is structural rather than a
 * convention — there is no branch here that produces `met` for it.
 */
export function evaluateEvidenceTiers(report, options = {}) {
  const spike = {
    qualifyingCommands: threshold(EVIDENCE_TIERS.spike.qualifyingCommands, report.qualifyingCommands),
    activeDays: threshold(EVIDENCE_TIERS.spike.activeDays, report.activeDays),
    windowDays: threshold(EVIDENCE_TIERS.spike.windowDays, report.window.days),
  };

  const rateGate = meetsFraction(
    report.counts.noMatchNumerator,
    report.qualifyingCommands,
    EVIDENCE_TIERS.planning.noMatchRate.fraction,
  ) || meetsFraction(
    report.counts.created,
    report.qualifyingCommands,
    EVIDENCE_TIERS.planning.noMatchToCreationRate.fraction,
  );

  const planning = {
    qualifyingCommands: threshold(
      EVIDENCE_TIERS.planning.qualifyingCommands,
      report.qualifyingCommands,
    ),
    activeDays: threshold(EVIDENCE_TIERS.planning.activeDays, report.activeDays),
    windowDays: threshold(EVIDENCE_TIERS.planning.windowDays, report.window.days),
    distinctUsers: {
      required: EVIDENCE_TIERS.planning.distinctUsers,
      measured: null,
      met: null,
      privilegedReadRequired: true,
    },
    rateGate: {
      either: {
        noMatch: EVIDENCE_TIERS.planning.noMatchRate.value,
        noMatchToCreation: EVIDENCE_TIERS.planning.noMatchToCreationRate.value,
      },
      measured: {
        noMatch: report.rates.noMatch,
        noMatchToCreation: report.rates.noMatchToCreation,
      },
      met: rateGate,
    },
  };

  const planningCountable = planning.qualifyingCommands.met
    && planning.activeDays.met
    && planning.windowDays.met
    && planning.rateGate.met;

  const goLive = options.goLive ?? null;

  return {
    spike: {
      verdict: Object.values(spike).every((entry) => entry.met) ? "met" : "not_met",
      thresholds: spike,
    },
    planning: {
      // No branch returns `met`. At one user the tier authorizes nothing beyond
      // the spike, and the privileged read is the only thing that can change
      // that — performed at evaluation time, not by this reader.
      verdict: planningCountable ? "met_pending_privileged_read" : "not_met",
      thresholds: planning,
    },
    expiry: goLive === null ? null : {
      goLive,
      expiresOn: expiryDateFromGoLive(goLive),
      horizonDays: EXPIRY_HORIZON_DAYS,
    },
  };
}

/**
 * ADR-055's expiry date, computed rather than written by hand.
 *
 * Go-live is the Slice 2F.5 merge date (ADR-060) — a git fact a closeout
 * verifier can check. The arithmetic runs on a UTC date so no zone can move the
 * deadline by a day.
 */
export function expiryDateFromGoLive(goLive) {
  if (typeof goLive !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(goLive)) {
    throw new Error(`Go-live must be an ISO calendar date, received: ${String(goLive)}`);
  }
  const at = new Date(`${goLive}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime())) {
    throw new Error(`Go-live is not a real date: ${goLive}`);
  }
  const expires = new Date(at.getTime() + EXPIRY_HORIZON_DAYS * 86400000);
  return expires.toISOString().slice(0, 10);
}
