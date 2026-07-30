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
 * What is read and what is mirrored, stated exactly
 * -------------------------------------------------
 * Two vocabularies are **read** out of TypeScript through the existing
 * `product-event-vocabulary.mjs` parser — the mechanism ADR-052 established:
 *
 *   - the four `task_command_*` event names, from `contracts.ts`;
 *   - `TASK_COMMAND_OUTCOMES`, the twelve outcome members, from `outcomes.ts`.
 *
 * The twelve are the list that actually drifts, so reading them matters most,
 * and `COMMAND_FUNNEL_PREVIEWED_OUTCOMES` is derived from them by the same
 * `[...outcomes, "previewed"]` spread `analytics.ts:121-124` uses — so it is
 * derived from a read, not restated.
 *
 * Three lists are **mirrored**: origins, apply routes and undo results. Not by
 * preference — the shared parser splits an array's body by line and requires one
 * quoted entry per line, and all three are declared on a single line
 * (`analytics.ts:95,108,230`), so it throws on them. Extending that parser would
 * change a module two other smokes depend on in order to serve this one. They
 * are two, three and four members long, they are held to the TypeScript
 * originals by exact-equality Vitest cases, and the concession is recorded here
 * rather than dressed up as a read.
 *
 * It fails loudly everywhere. A reader that shrugged at an unknown event name
 * would under-report the moment a fifth one ships; one that shrugged at an
 * unknown category would drop it from a denominator that decides whether money
 * gets spent on semantic retrieval.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseProductEventVocabulary,
  readProductEventVocabulary,
} from "./product-event-vocabulary.mjs";

/** The reader's own version, so a pasted number is traceable to its definition. */
export const READER_VERSION = "2026-07-30.1";

const ANALYTICS_SOURCE = "src/features/task-commands/analytics.ts";
const OUTCOMES_SOURCE = "src/features/task-commands/outcomes.ts";

function repositoryRoot(explicit) {
  return explicit ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

/**
 * The twelve outcome members, read from `outcomes.ts`.
 *
 * Read rather than restated because this is the list with twelve chances to
 * drift. A thirteenth outcome added in TypeScript changes what this returns, and
 * every distribution key, the refusal subset and the unreachable set move with
 * it.
 */
export function readCommandFunnelOutcomes(root) {
  const source = readFileSync(path.join(repositoryRoot(root), OUTCOMES_SOURCE), "utf8");
  return parseProductEventVocabulary(source, "TASK_COMMAND_OUTCOMES");
}

/**
 * The four `task_command_*` names, read from the contracts module.
 *
 * Derived by prefix rather than listed, so a fifth name added in TypeScript
 * changes what this returns instead of being silently dropped from the funnel.
 */
export function readCommandFunnelEventNames(root) {
  const { eventNames } = readProductEventVocabulary(repositoryRoot(root));
  const names = eventNames.filter((name) => name.startsWith("task_command_"));
  if (names.length === 0) {
    throw new Error("contracts.ts declares no task_command_* product event names");
  }
  return names;
}

/** Mirrors `TASK_COMMAND_ORIGINS` (`analytics.ts:95`). */
export const COMMAND_FUNNEL_ORIGINS = ["chat", "work"];

/** Mirrors `TASK_COMMAND_APPLY_ROUTES` (`analytics.ts:108`). */
export const COMMAND_FUNNEL_APPLY_ROUTES = ["direct", "confirmed", "created"];

/** Mirrors `TASK_COMMAND_UNDO_RESULTS` (`analytics.ts:230`). */
export const COMMAND_FUNNEL_UNDO_RESULTS = ["undone", "unavailable", "expired", "refused"];

/** Read from `outcomes.ts` — 2E-UX-001's twelve, in its declared order. */
export const COMMAND_FUNNEL_OUTCOMES = readCommandFunnelOutcomes();

/** The twelve plus `previewed`, by the same spread `analytics.ts:121-124` uses. */
export const COMMAND_FUNNEL_PREVIEWED_OUTCOMES = [...COMMAND_FUNNEL_OUTCOMES, "previewed"];

/** Read from `contracts.ts`. */
export const COMMAND_FUNNEL_EVENT_NAMES = readCommandFunnelEventNames();

/**
 * The refusal classes 2F-MEASURE-001 asks for: the categories where the system
 * understood the request and declined to complete it.
 *
 * Derived as a filter over the read vocabulary rather than written as a parallel
 * list, so a thirteenth outcome cannot arrive without the parity case noticing.
 * `still_unmatched` and `creation_offered` are deliberately absent — they are the
 * no-match set below, and classifying them twice would make two independent
 * measures move together. `ambiguous`, `ambiguous_overflow`,
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
 * rather than counting preview dispositions.
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
 * ADR-055's thresholds.
 *
 * `qualifyingCommands` and `activeDays` are **floors** — more is stronger
 * evidence. `windowDays` is a **ceiling**: ADR-055 says "50 qualifying commands
 * / 10 distinct active days / a 14-day window", and the window is the
 * measurement period, not something to accumulate. Fifty commands over a year is
 * weaker evidence than fifty over a fortnight, so a longer window must not
 * satisfy the tier.
 *
 * The rate gates carry an exact fraction beside the decimal: the decimal is for
 * reading, the fraction is what decides, so no rounded rate ever stands between
 * the evidence and the gate.
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
 * Preview outcomes no deployed code path can emit.
 *
 * Verified against every `report(...)` call site in
 * `src/features/task-commands/actions.ts`, and re-verified on every CI run:
 * `command-funnel.test.ts` reads that file and fails if a literal emitter for
 * any of these appears. Without that read the claim would be a frozen constant
 * asserting itself.
 */
const UNREACHABLE_PREVIEW_OUTCOMES = ["applied", "unsupported", "rejected_conflict"];

/**
 * What the deployed emitters can and cannot produce, as data.
 *
 * A measurement that reports a structurally-impossible zero as though it were an
 * observation is worse than no measurement.
 */
export const COMMAND_FUNNEL_REACHABILITY = Object.freeze({
  /**
   * Allowlisted on `task_command_previewed` and reachable from no code path:
   * both `unsupported` branches return before the emitter exists
   * (`actions.ts:347-358` and `:719-726`; `report` is defined at `:400`), and no
   * site passes `applied` or `rejected_conflict` to the preview event.
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
   * (`operations/actions.ts:386`), so the applied population is a superset of the
   * previewed one. Both populations are reported raw — `previewedByOrigin` and
   * `appliedByOrigin` — because their difference is not a clean measure: a
   * console intent can emit up to three preview rounds for one apply, so a
   * subtraction can read zero while direct-action applies are in heavy use.
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

function requireVersion(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Event property policyVersion must be a non-empty string");
  }
  return value;
}

/**
 * The funnel, for one owner over one window.
 *
 * Single pass, and every category key present with a zero value so a consumer
 * never has to tell "absent" from "none" — and so a vocabulary member cannot
 * quietly disappear from a report.
 *
 * The exclusion counters partition the rows they are reported against: the
 * window filter runs first, so `excludedSynthetic` counts labelled rows *inside*
 * the window and the two buckets never overlap.
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
  const appliedByOrigin = zeroed(COMMAND_FUNNEL_ORIGINS);
  const appliedRoutesByOrigin = byOrigin(() => zeroed(COMMAND_FUNNEL_APPLY_ROUTES));
  const undoResultsByOrigin = byOrigin(() => zeroed(COMMAND_FUNNEL_UNDO_RESULTS));
  const disambiguationsByOrigin = zeroed(COMMAND_FUNNEL_ORIGINS);
  const activeDates = new Set();
  const policyVersions = {};

  let qualifyingCommands = 0;
  let unsupportedRefusals = 0;
  let excludedSynthetic = 0;
  let excludedOutOfWindow = 0;
  let oneStepCount = 0;
  let ambiguityCount = 0;
  let stillUnmatched = 0;
  let creationOffered = 0;
  let created = 0;
  let replayedCreations = 0;

  for (const row of rows) {
    const eventName = row?.eventName;
    if (!COMMAND_FUNNEL_EVENT_NAMES.includes(eventName)) {
      throw new Error(
        `Unknown product event "${String(eventName)}" reached the funnel reader; `
        + "the names it aggregates are declared in "
        + "src/features/product-analytics/contracts.ts",
      );
    }
    const at = instantOf(row.createdAt, "createdAt");
    if (at.getTime() <= start.getTime() || at.getTime() > end.getTime()) {
      excludedOutOfWindow += 1;
      continue;
    }
    if (row.isSynthetic === true) {
      excludedSynthetic += 1;
      continue;
    }

    const properties = row.properties ?? {};
    const origin = requireMember(
      properties.commandOrigin,
      COMMAND_FUNNEL_ORIGINS,
      "commandOrigin",
      ANALYTICS_SOURCE,
    );
    // Recorded per row rather than assumed uniform: a policy bump mid-window
    // makes every rate a weighted average over two matchers, and a gate that
    // cannot say so is not attributable to the rules that produced it.
    const policyVersion = requireVersion(properties.policyVersion);
    policyVersions[policyVersion] = (policyVersions[policyVersion] ?? 0) + 1;

    if (eventName === "task_command_previewed") {
      const outcome = requireMember(
        properties.outcomeCategory,
        COMMAND_FUNNEL_PREVIEWED_OUTCOMES,
        "outcomeCategory",
        OUTCOMES_SOURCE,
      );
      const oneStep = requireBoolean(properties.oneStep, "oneStep");
      requireBoolean(properties.requiresConfirmation, "requiresConfirmation");
      if (COMMAND_FUNNEL_EXCLUDED_OUTCOMES.includes(outcome)) {
        unsupportedRefusals += 1;
        continue;
      }
      qualifyingCommands += 1;
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
      // A replay returned the original outcome and created nothing
      // (`apply.ts:222-225`), so counting it would let a double-submit move a
      // gate. Counted separately instead of dropped.
      const replayed = requireBoolean(properties.replayed, "replayed");
      appliedByOrigin[origin] += 1;
      appliedRoutesByOrigin[origin][route] += 1;
      if (route === "created") {
        if (replayed) replayedCreations += 1;
        else created += 1;
      }
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
  // became a creation ended `applied`, so it is not a no-match. There is no
  // per-row key to join on, but the split is exact in aggregate:
  //
  //   creation_offered = (offers that became creations) + (offers that did not)
  //
  // and the first term is bounded by the creations actually observed. Creations
  // beyond that came from offers in an earlier window; they are reported as skew
  // rather than allowed to push a rate above one.
  const creationsFromOffers = Math.min(creationOffered, created);
  const offeredNotCreated = creationOffered - creationsFromOffers;
  const noMatchNumerator = stillUnmatched + offeredNotCreated;
  const windowBoundarySkew = created - creationsFromOffers;

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
    // `unsupported` is projected from its own counter, not from the
    // distribution: the distribution partitions the *qualifying* population and
    // `unsupported` is excluded from it, so reading it from there would report
    // zero refusals in a window that had them.
    refusalOutcomeClasses: Object.fromEntries(
      COMMAND_FUNNEL_REFUSAL_OUTCOMES.map((outcome) => [
        outcome,
        outcome === "unsupported" ? unsupportedRefusals : outcomeDistribution[outcome],
      ]),
    ),
    originSplit,
    previewedByOrigin: originSplit,
    appliedByOrigin,
    appliedRoutesByOrigin,
    undoResultsByOrigin,
    disambiguationsByOrigin,
    policyVersions,
    rates: {
      noMatch: rate(noMatchNumerator, qualifyingCommands),
      noMatchToCreation: rate(creationsFromOffers, qualifyingCommands),
      oneStep: rate(oneStepCount, qualifyingCommands),
      ambiguity: rate(ambiguityCount, qualifyingCommands),
      previewNoMatch: rate(stillUnmatched + creationOffered, qualifyingCommands),
    },
    windowBoundarySkew,
    replayedCreations,
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
      creationsFromOffers,
      noMatchNumerator,
    },
  };
}

/** A floor: more of it is stronger evidence. */
function atLeast(required, measured) {
  return { required, measured, met: measured >= required, comparison: "at_least" };
}

/** A ceiling: a longer observation window is *weaker* evidence, not stronger. */
function atMost(required, measured) {
  return { required, measured, met: measured <= required, comparison: "at_most" };
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
    qualifyingCommands: atLeast(
      EVIDENCE_TIERS.spike.qualifyingCommands,
      report.qualifyingCommands,
    ),
    activeDays: atLeast(EVIDENCE_TIERS.spike.activeDays, report.activeDays),
    windowDays: atMost(EVIDENCE_TIERS.spike.windowDays, report.window.days),
  };

  const noMatchBranch = meetsFraction(
    report.counts.noMatchNumerator,
    report.qualifyingCommands,
    EVIDENCE_TIERS.planning.noMatchRate.fraction,
  );
  const creationBranch = meetsFraction(
    report.counts.creationsFromOffers,
    report.qualifyingCommands,
    EVIDENCE_TIERS.planning.noMatchToCreationRate.fraction,
  );

  const planning = {
    qualifyingCommands: atLeast(
      EVIDENCE_TIERS.planning.qualifyingCommands,
      report.qualifyingCommands,
    ),
    activeDays: atLeast(EVIDENCE_TIERS.planning.activeDays, report.activeDays),
    windowDays: atMost(EVIDENCE_TIERS.planning.windowDays, report.window.days),
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
      // Exact counts beside the rounded rates: the rates are for reading, and
      // whoever reads "0.2 / 0.2, not met" deserves to see the fraction that
      // decided it.
      measured: {
        noMatch: report.rates.noMatch,
        noMatchToCreation: report.rates.noMatchToCreation,
        exact: {
          noMatch: `${report.counts.noMatchNumerator}/${report.qualifyingCommands}`,
          noMatchToCreation: `${report.counts.creationsFromOffers}/${report.qualifyingCommands}`,
        },
      },
      branches: { noMatch: noMatchBranch, noMatchToCreation: creationBranch },
      met: noMatchBranch || creationBranch,
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
