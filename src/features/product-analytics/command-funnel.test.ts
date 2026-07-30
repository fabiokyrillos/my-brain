import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { productEventNames } from "./contracts";
import {
  TASK_COMMAND_APPLY_ROUTES,
  TASK_COMMAND_ORIGINS,
  TASK_COMMAND_PREVIEWED_OUTCOMES,
  TASK_COMMAND_UNDO_RESULTS,
} from "@/features/task-commands/analytics";
import {
  TASK_COMMAND_OUTCOMES,
  TASK_COMMAND_PREVIEW_DISPOSITIONS,
} from "@/features/task-commands/outcomes";

/**
 * Phase 2F Slice 2F.5 — the command-funnel reader (PRD 2F-MEASURE-001…006).
 *
 * The aggregator lives in `scripts/phase-2f-command-funnel.mjs` because it has
 * two callers that cannot share a module any other way: this suite, which runs
 * in CI with no network, and `scripts/phase-2f-command-funnel-reader.mjs`, which
 * runs against the deployed project. Implementing it twice would put the gate's
 * arithmetic in two places, and ADR-055's own words are that "a threshold
 * computable two ways is decided twice".
 *
 * Two vocabularies the reader *reads* (the four event names and the twelve
 * outcome members) are checked here against the TypeScript originals to prove the
 * read is complete. Three the reader *mirrors* — origins, apply routes, undo
 * results, all declared on a single line, which the shared parser cannot take —
 * are checked by exact equality, which is what makes them a mirror with a CI gate
 * rather than a fourth copy.
 */

type FunnelModule = typeof import("../../../scripts/phase-2f-command-funnel.mjs");

async function load(): Promise<FunnelModule> {
  return (await import("../../../scripts/phase-2f-command-funnel.mjs")) as FunnelModule;
}

const TIME_ZONE = "America/Sao_Paulo";
const WINDOW_END = "2026-07-29T12:00:00.000Z";

type Row = {
  eventName: string;
  createdAt: string;
  isSynthetic?: boolean;
  properties?: Record<string, unknown>;
};

function previewed(overrides: Partial<Row> & { properties?: Record<string, unknown> } = {}): Row {
  return {
    eventName: "task_command_previewed",
    createdAt: "2026-07-29T10:00:00.000Z",
    isSynthetic: false,
    ...overrides,
    properties: {
      commandOrigin: "chat",
      outcomeCategory: "previewed",
      candidateCount: 1,
      scoreBand: "high",
      marginBand: "high",
      signalCategories: [],
      oneStep: true,
      requiresConfirmation: false,
      policyVersion: "2026-07-25.3",
      ...overrides.properties,
    },
  };
}

function applied(overrides: Partial<Row> & { properties?: Record<string, unknown> } = {}): Row {
  return {
    eventName: "task_command_applied",
    createdAt: "2026-07-29T10:05:00.000Z",
    isSynthetic: false,
    ...overrides,
    properties: {
      commandOrigin: "chat",
      outcomeCategory: "applied",
      applyRoute: "direct",
      replayed: false,
      policyVersion: "2026-07-25.3",
      ...overrides.properties,
    },
  };
}

function disambiguated(
  overrides: Partial<Row> & { properties?: Record<string, unknown> } = {},
): Row {
  return {
    eventName: "task_command_disambiguated",
    createdAt: "2026-07-29T10:02:00.000Z",
    isSynthetic: false,
    ...overrides,
    properties: {
      commandOrigin: "chat",
      candidateCount: 3,
      selectedRank: 2,
      policyVersion: "2026-07-25.3",
      ...overrides.properties,
    },
  };
}

function undone(overrides: Partial<Row> & { properties?: Record<string, unknown> } = {}): Row {
  return {
    eventName: "task_command_undone",
    createdAt: "2026-07-29T10:10:00.000Z",
    isSynthetic: false,
    ...overrides,
    properties: {
      commandOrigin: "chat",
      undoResult: "undone",
      policyVersion: "2026-07-25.3",
      ...overrides.properties,
    },
  };
}

async function aggregate(rows: readonly Row[], options: Record<string, unknown> = {}) {
  const { aggregateCommandFunnel } = await load();
  return aggregateCommandFunnel({
    rows,
    timeZone: TIME_ZONE,
    windowEnd: WINDOW_END,
    windowDays: 14,
    ...options,
  });
}

describe("the command-funnel reader's vocabularies", () => {
  it("reads the four event names out of the contracts module rather than restating them", async () => {
    const { readCommandFunnelEventNames, COMMAND_FUNNEL_EVENT_NAMES } = await load();
    const read = readCommandFunnelEventNames(process.cwd());

    // Derived from the single source, in its declared order — so a fifth
    // `task_command_*` name added in TypeScript changes what this returns and
    // the reader stops silently ignoring it.
    expect(read).toEqual(productEventNames.filter((name) => name.startsWith("task_command_")));
    expect(read).toEqual([
      "task_command_previewed",
      "task_command_disambiguated",
      "task_command_applied",
      "task_command_undone",
    ]);
    // The module-level constant resolves the repository root itself, which is how
    // the runner reaches it with no argument.
    expect(COMMAND_FUNNEL_EVENT_NAMES).toEqual(read);
  });

  it("reads the twelve outcome members out of outcomes.ts", async () => {
    const { readCommandFunnelOutcomes, COMMAND_FUNNEL_OUTCOMES } = await load();
    // The list with twelve chances to drift is read, not restated. A thirteenth
    // member changes every distribution key, the refusal subset and the
    // unreachable set together.
    expect(readCommandFunnelOutcomes(process.cwd())).toEqual([...TASK_COMMAND_OUTCOMES]);
    expect(COMMAND_FUNNEL_OUTCOMES).toEqual([...TASK_COMMAND_OUTCOMES]);
  });

  it("derives the previewed vocabulary from the read one by the same spread", async () => {
    const { COMMAND_FUNNEL_PREVIEWED_OUTCOMES } = await load();
    expect(COMMAND_FUNNEL_PREVIEWED_OUTCOMES).toEqual([...TASK_COMMAND_PREVIEWED_OUTCOMES]);
  });

  it("mirrors the three single-line vocabularies by exact equality", async () => {
    const funnel = await load();
    // `toEqual` on arrays is order-sensitive, so a reordering fails here too —
    // not only an addition.
    expect(funnel.COMMAND_FUNNEL_ORIGINS).toEqual([...TASK_COMMAND_ORIGINS]);
    expect(funnel.COMMAND_FUNNEL_APPLY_ROUTES).toEqual([...TASK_COMMAND_APPLY_ROUTES]);
    expect(funnel.COMMAND_FUNNEL_UNDO_RESULTS).toEqual([...TASK_COMMAND_UNDO_RESULTS]);
  });

  it("cannot read the three mirrored lists, which is why they are mirrored", async () => {
    const { parseProductEventVocabulary } = await import(
      "../../../scripts/product-event-vocabulary.mjs"
    );
    const source = readFileSync("src/features/task-commands/analytics.ts", "utf8");
    // The justification, held to the facts: the shared parser splits an array
    // body by line and wants one quoted entry per line, and these three are
    // declared on a single line. If a future edit made them multi-line this case
    // fails, and the reader should switch to reading them.
    for (const name of [
      "TASK_COMMAND_ORIGINS",
      "TASK_COMMAND_APPLY_ROUTES",
      "TASK_COMMAND_UNDO_RESULTS",
    ]) {
      expect(() => parseProductEventVocabulary(source, name)).toThrow();
    }
  });

  it("derives the refusal subset from the read vocabulary and pins its membership", async () => {
    const { COMMAND_FUNNEL_REFUSAL_OUTCOMES, COMMAND_FUNNEL_PREVIEWED_OUTCOMES } = await load();

    for (const outcome of COMMAND_FUNNEL_REFUSAL_OUTCOMES) {
      expect(COMMAND_FUNNEL_PREVIEWED_OUTCOMES).toContain(outcome);
    }
    // PRD S5-R12: the categories where the system understood the request and
    // declined to complete it. `still_unmatched`/`creation_offered` are the
    // no-match set and are deliberately not refusals — classifying them twice
    // would make two independent measures move together.
    expect(COMMAND_FUNNEL_REFUSAL_OUTCOMES).toEqual([
      "unsupported",
      "rejected_stale",
      "rejected_conflict",
      "refused",
    ]);
  });

  it("pins the no-match member set to ADR-055's definition", async () => {
    const { COMMAND_FUNNEL_NO_MATCH_OUTCOMES, COMMAND_FUNNEL_EXCLUDED_OUTCOMES } = await load();
    expect(COMMAND_FUNNEL_NO_MATCH_OUTCOMES).toEqual(["still_unmatched", "creation_offered"]);
    expect(COMMAND_FUNNEL_EXCLUDED_OUTCOMES).toEqual(["unsupported"]);
  });
});

describe("the evidence thresholds", () => {
  it("carries ADR-055's nine numbers and the 90-day horizon, pinned", async () => {
    const { EVIDENCE_TIERS, EXPIRY_HORIZON_DAYS } = await load();

    // Pinned, not merely declared: a threshold edit has to come to this line.
    // ADR-055 is the only other place these numbers exist.
    expect({
      spikeCommands: EVIDENCE_TIERS.spike.qualifyingCommands,
      spikeActiveDays: EVIDENCE_TIERS.spike.activeDays,
      spikeWindowDays: EVIDENCE_TIERS.spike.windowDays,
      planningCommands: EVIDENCE_TIERS.planning.qualifyingCommands,
      planningActiveDays: EVIDENCE_TIERS.planning.activeDays,
      planningWindowDays: EVIDENCE_TIERS.planning.windowDays,
      planningDistinctUsers: EVIDENCE_TIERS.planning.distinctUsers,
      noMatchRate: EVIDENCE_TIERS.planning.noMatchRate.value,
      noMatchToCreationRate: EVIDENCE_TIERS.planning.noMatchToCreationRate.value,
      horizonDays: EXPIRY_HORIZON_DAYS,
    }).toEqual({
      spikeCommands: 50,
      spikeActiveDays: 10,
      spikeWindowDays: 14,
      planningCommands: 150,
      planningActiveDays: 20,
      planningWindowDays: 30,
      planningDistinctUsers: 2,
      noMatchRate: 0.2,
      noMatchToCreationRate: 0.15,
      horizonDays: 90,
    });
  });

  it("declares each rate threshold as an exact fraction so no float decides the gate", async () => {
    const { EVIDENCE_TIERS } = await load();
    expect(EVIDENCE_TIERS.planning.noMatchRate.fraction).toEqual({ numerator: 1, denominator: 5 });
    expect(EVIDENCE_TIERS.planning.noMatchToCreationRate.fraction)
      .toEqual({ numerator: 3, denominator: 20 });
  });

  it("names ADR-055's five permanent non-authorizers plus the diagnostic rate", async () => {
    const { COMMAND_FUNNEL_NON_AUTHORIZING } = await load();
    // Named as the report's own key paths, so a consumer can cross-reference
    // them mechanically instead of guessing which field a prose name meant.
    // `latency` is the exception and has no key: nothing here measures it, and
    // ADR-055 names it precisely so nobody later decides that it authorizes.
    expect(COMMAND_FUNNEL_NON_AUTHORIZING).toEqual([
      "unsupportedRefusals",
      "qualifyingCommands",
      "rates.oneStep",
      "rates.ambiguity",
      "latency",
      "rates.previewNoMatch",
    ]);
    const report = await aggregate([]);
    for (const key of COMMAND_FUNNEL_NON_AUTHORIZING) {
      if (key === "latency") continue;
      const resolved = key.split(".").reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)[part],
        report as unknown,
      );
      expect(resolved, `${key} is not a real report key`).toBeDefined();
    }
  });
});

describe("aggregating the funnel", () => {
  it("reports an empty window without dividing by zero", async () => {
    const report = await aggregate([]);

    expect(report.qualifyingCommands).toBe(0);
    expect(report.activeDays).toBe(0);
    expect(report.rates).toEqual({
      noMatch: 0,
      noMatchToCreation: 0,
      oneStep: 0,
      ambiguity: 0,
      previewNoMatch: 0,
    });
    for (const value of Object.values(report.rates)) {
      expect(Number.isFinite(value)).toBe(true);
    }
    // An absent category is indistinguishable from a zero one, deliberately.
    expect(Object.keys(report.outcomeDistribution).sort())
      .toEqual([...TASK_COMMAND_PREVIEWED_OUTCOMES].sort());
    expect(Object.values(report.outcomeDistribution).every((count) => count === 0)).toBe(true);
    expect(report.previewedByOrigin).toEqual({ chat: 0, work: 0 });
    expect(report.policyVersions).toEqual({});
  });

  it("counts a qualifying preview round per origin and keeps the distribution summing to it", async () => {
    const report = await aggregate([
      previewed(),
      previewed({ properties: { commandOrigin: "work" } }),
      previewed({ properties: { outcomeCategory: "ambiguous", oneStep: false, candidateCount: 3 } }),
    ]);

    expect(report.qualifyingCommands).toBe(3);
    expect(report.previewedByOrigin).toEqual({ chat: 2, work: 1 });
    expect(report.outcomeDistribution.previewed).toBe(2);
    expect(report.outcomeDistribution.ambiguous).toBe(1);
    // The invariant that makes the distribution readable: it partitions the
    // qualifying population and nothing else.
    const summed = Object.values(report.outcomeDistribution).reduce((a, b) => a + b, 0);
    expect(summed).toBe(report.qualifyingCommands);
    expect(report.countingUnit).toBe("qualifying_preview_round");
  });

  it("excludes `unsupported` from every denominator and counts it separately", async () => {
    const report = await aggregate([
      previewed(),
      previewed({ properties: { outcomeCategory: "unsupported", oneStep: false } }),
      previewed({ properties: { outcomeCategory: "unsupported", oneStep: false } }),
    ]);

    expect(report.qualifyingCommands).toBe(1);
    expect(report.unsupportedRefusals).toBe(2);
    // Present as a zero key even though two were observed: the distribution
    // partitions the *qualifying* population, and `unsupported` is not in it.
    expect(report.outcomeDistribution.unsupported).toBe(0);
    expect(report.rates.oneStep).toBe(1);
  });

  it("reports unsupported refusals in the refusal classes rather than a contradictory zero", async () => {
    const report = await aggregate([
      previewed(),
      previewed({ properties: { outcomeCategory: "unsupported", oneStep: false } }),
      previewed({ properties: { outcomeCategory: "refused", oneStep: false } }),
      previewed({ properties: { outcomeCategory: "rejected_stale", oneStep: false } }),
    ]);

    // The refusal breakdown is projected from `unsupportedRefusals` for that one
    // member, so the report never says "one unsupported refusal" and "zero
    // unsupported refusals" on two adjacent lines.
    expect(report.unsupportedRefusals).toBe(1);
    expect(report.refusalOutcomeClasses).toEqual({
      unsupported: 1,
      rejected_stale: 1,
      rejected_conflict: 0,
      refused: 1,
    });
  });

  it("excludes synthetic rows inside the window and reports how many it dropped", async () => {
    const report = await aggregate([
      previewed(),
      previewed({ isSynthetic: true }),
      applied({ isSynthetic: true, properties: { applyRoute: "created" } }),
      // Out of window *and* synthetic: counted once, in the window bucket, so the
      // two exclusion counters partition the fetched rows instead of overlapping.
      previewed({ isSynthetic: true, createdAt: "2020-01-01T00:00:00.000Z" }),
    ]);

    expect(report.qualifyingCommands).toBe(1);
    expect(report.excludedSynthetic).toBe(2);
    expect(report.excludedOutOfWindow).toBe(1);
    expect(report.rates.noMatchToCreation).toBe(0);
  });

  it("applies no email or name pattern of any kind", async () => {
    const { aggregateCommandFunnel } = await load();
    const source = aggregateCommandFunnel.toString();
    // 2F-MEASURE-002 is explicit that exclusion works "by construction through
    // … real mechanisms, not email-pattern heuristics". This is the cheapest
    // possible proof that no heuristic crept in.
    expect(source).not.toMatch(/@|example\.com|fixture|smoke|test-/i);
  });

  it("cross-tabulates applies, undos and disambiguations by origin", async () => {
    const report = await aggregate([
      previewed(),
      previewed({ properties: { commandOrigin: "work" } }),
      applied(),
      applied({ properties: { commandOrigin: "work", applyRoute: "direct" } }),
      applied({ properties: { applyRoute: "confirmed" } }),
      undone(),
      undone({ properties: { commandOrigin: "work", undoResult: "expired" } }),
      disambiguated(),
    ]);

    expect(report.appliedRoutesByOrigin).toEqual({
      chat: { direct: 1, confirmed: 1, created: 0 },
      work: { direct: 1, confirmed: 0, created: 0 },
    });
    expect(report.undoResultsByOrigin).toEqual({
      chat: { undone: 1, unavailable: 0, expired: 0, refused: 0 },
      work: { undone: 0, unavailable: 0, expired: 1, refused: 0 },
    });
    expect(report.disambiguationsByOrigin).toEqual({ chat: 1, work: 0 });
  });

  it("reports the previewed and applied populations raw rather than their difference", async () => {
    // The Work surface's direct-action buttons emit `task_command_applied` with
    // no preceding `task_command_previewed` (`operations/actions.ts:386`), while a
    // console intent can emit up to three preview rounds for one apply. Their
    // difference is therefore not a measure — it can read zero while the
    // direct-action path is in heavy use — so both populations are reported and
    // the reader subtracts knowingly or not at all.
    const report = await aggregate([
      previewed({ properties: { commandOrigin: "work" } }),
      applied({ properties: { commandOrigin: "work" } }),
      applied({ properties: { commandOrigin: "work" } }),
      applied({ properties: { commandOrigin: "work" } }),
      previewed(),
      applied(),
    ]);

    expect(report.previewedByOrigin).toEqual({ chat: 1, work: 1 });
    expect(report.appliedByOrigin).toEqual({ chat: 1, work: 3 });
  });

  it("counts rows per policy version so a mid-window bump is visible", async () => {
    const report = await aggregate([
      previewed(),
      previewed({ properties: { policyVersion: "2026-08-01.1" } }),
      applied({ properties: { policyVersion: "2026-08-01.1" } }),
    ]);

    // A gate computed across two matchers is a weighted average, and one that
    // cannot say so is not attributable to the rules that produced it.
    expect(report.policyVersions).toEqual({ "2026-07-25.3": 1, "2026-08-01.1": 2 });
  });
});

describe("the no-match rate, on ADR-055's final-outcome definition", () => {
  it("subtracts the offers that became creations", async () => {
    // ADR-055: `no_match` is a qualifying command whose *final* outcome is
    // `still_unmatched` or `creation_offered`. `creation_offered` is emitted at
    // preview time (`actions.ts:623`); a command that goes on to create emits
    // `applyRoute: 'created'` (`:981`) and its final outcome is `applied`.
    // No command identifier exists to join on, but the split is exact in
    // aggregate.
    const report = await aggregate([
      ...Array.from({ length: 4 }, () => previewed({
        properties: { outcomeCategory: "creation_offered", oneStep: false },
      })),
      previewed({ properties: { outcomeCategory: "still_unmatched", oneStep: false } }),
      ...Array.from({ length: 5 }, () => previewed()),
      applied({ properties: { applyRoute: "created" } }),
      applied({ properties: { applyRoute: "created" } }),
    ]);

    expect(report.qualifyingCommands).toBe(10);
    // 1 still_unmatched + (4 offered − 2 created) = 3
    expect(report.rates.noMatch).toBe(0.3);
    // The preview-time variant, reported for diagnosis only: (1 + 4) / 10
    expect(report.rates.previewNoMatch).toBe(0.5);
    expect(report.rates.noMatchToCreation).toBe(0.2);
    expect(report.windowBoundarySkew).toBe(0);
    expect(report.counts.creationsFromOffers).toBe(2);
  });

  it("never lets a creation whose offer predates the window push a rate above one", async () => {
    const report = await aggregate([
      previewed({ properties: { outcomeCategory: "creation_offered", oneStep: false } }),
      previewed(),
      applied({ properties: { applyRoute: "created" } }),
      applied({ properties: { applyRoute: "created" } }),
      applied({ properties: { applyRoute: "created" } }),
    ]);

    // One offer can have become at most one creation. The other two came from
    // offers in an earlier window and are reported as skew, not counted into a
    // rate whose denominator cannot contain them.
    expect(report.counts.created).toBe(3);
    expect(report.counts.creationsFromOffers).toBe(1);
    expect(report.rates.noMatchToCreation).toBe(0.5);
    expect(report.rates.noMatch).toBe(0);
    expect(report.windowBoundarySkew).toBe(2);
  });

  it("does not count a replayed creation as a new one", async () => {
    // A replay returned the original outcome and created nothing
    // (`apply.ts:222-225`), so a double-submit must not move the gate.
    const report = await aggregate([
      previewed({ properties: { outcomeCategory: "creation_offered", oneStep: false } }),
      previewed(),
      applied({ properties: { applyRoute: "created" } }),
      applied({ properties: { applyRoute: "created", replayed: true } }),
    ]);

    expect(report.counts.created).toBe(1);
    expect(report.replayedCreations).toBe(1);
    expect(report.rates.noMatchToCreation).toBe(0.5);
    expect(report.rates.noMatch).toBe(0);
    expect(report.windowBoundarySkew).toBe(0);
  });
});

describe("the observation window", () => {
  it("is half-open at the start so no row is counted in two adjacent windows", async () => {
    const report = await aggregate([
      // Exactly at the end: inside.
      previewed({ createdAt: WINDOW_END }),
      // Exactly at the start: outside.
      previewed({ createdAt: "2026-07-15T12:00:00.000Z" }),
      // One millisecond after the start: inside.
      previewed({ createdAt: "2026-07-15T12:00:00.001Z" }),
      // One millisecond after the end: outside.
      previewed({ createdAt: "2026-07-29T12:00:00.001Z" }),
    ]);

    expect(report.qualifyingCommands).toBe(2);
    expect(report.excludedOutOfWindow).toBe(2);
    expect(report.window).toEqual({
      start: "2026-07-15T12:00:00.000Z",
      end: "2026-07-29T12:00:00.000Z",
      days: 14,
    });
  });
});

describe("active days", () => {
  it("buckets by the supplied zone, not by UTC", async () => {
    // 2026-07-29T02:00Z is still 2026-07-28 at UTC−3. Bucketing in UTC would
    // report two active days where the owner had one, and `activeDays` is a
    // gate threshold — an accident in this direction *passes* a gate.
    const rows = [
      previewed({ createdAt: "2026-07-28T20:00:00.000Z" }),
      previewed({ createdAt: "2026-07-29T02:00:00.000Z" }),
    ];

    const local = await aggregate(rows, { timeZone: "America/Sao_Paulo" });
    const utc = await aggregate(rows, { timeZone: "UTC" });

    expect(local.activeDays).toBe(1);
    expect(utc.activeDays).toBe(2);
  });

  it("counts only days that carried a qualifying command", async () => {
    const report = await aggregate([
      previewed({ createdAt: "2026-07-20T15:00:00.000Z" }),
      previewed({ createdAt: "2026-07-20T18:00:00.000Z" }),
      previewed({
        createdAt: "2026-07-22T15:00:00.000Z",
        properties: { outcomeCategory: "unsupported", oneStep: false },
      }),
      applied({ createdAt: "2026-07-24T15:00:00.000Z" }),
      undone({ createdAt: "2026-07-25T15:00:00.000Z" }),
    ]);

    // 20 July only: the 22nd was unsupported, and an apply or an undo is not
    // itself a command round.
    expect(report.activeDays).toBe(1);
  });
});

describe("failing loudly", () => {
  it("throws on an event name it does not know", async () => {
    await expect(aggregate([{
      eventName: "task_command_teleported",
      createdAt: WINDOW_END,
      isSynthetic: false,
      properties: {},
    }])).rejects.toThrow(/task_command_teleported/);
  });

  it("throws on a category outside the vocabulary, naming the source", async () => {
    await expect(aggregate([previewed({ properties: { outcomeCategory: "vibes" } })]))
      .rejects.toThrow(/outcomes\.ts/);
    await expect(aggregate([applied({ properties: { applyRoute: "teleport" } })]))
      .rejects.toThrow(/analytics\.ts/);
    await expect(aggregate([undone({ properties: { undoResult: "maybe" } })]))
      .rejects.toThrow(/analytics\.ts/);
    await expect(aggregate([previewed({ properties: { commandOrigin: "email" } })]))
      .rejects.toThrow(/analytics\.ts/);
  });

  it("throws when any property it relies on is missing", async () => {
    for (const [factory, property] of [
      [previewed, "oneStep"],
      [previewed, "requiresConfirmation"],
      [previewed, "policyVersion"],
      [applied, "replayed"],
      [applied, "policyVersion"],
      [undone, "policyVersion"],
    ] as const) {
      const row = factory();
      delete (row.properties as Record<string, unknown>)[property];
      await expect(aggregate([row])).rejects.toThrow(new RegExp(property));
    }
  });

  it("throws on a missing or unusable time zone before aggregating anything", async () => {
    await expect(aggregate([previewed()], { timeZone: undefined }))
      .rejects.toThrow(/time zone/i);
    await expect(aggregate([previewed()], { timeZone: "Mars/Olympus_Mons" }))
      .rejects.toThrow(/Mars\/Olympus_Mons/);
  });

  it("throws on an unparseable timestamp rather than bucketing it somewhere", async () => {
    await expect(aggregate([previewed({ createdAt: "yesterday" })]))
      .rejects.toThrow(/yesterday/);
  });

  it("throws on a non-positive window", async () => {
    await expect(aggregate([], { windowDays: 0 })).rejects.toThrow(/windowDays/);
  });

  it("requires `isSynthetic` rather than treating an unknown as not synthetic", async () => {
    // The one input a non-database caller could get wrong. `null` or `"true"`
    // silently read as "not synthetic" would count disposable traffic into the
    // gate — the column is proven non-null in pgTAP, but the module contract is
    // not the column.
    for (const value of [null, undefined, "true", 1]) {
      const row = previewed();
      (row as Record<string, unknown>).isSynthetic = value;
      await expect(aggregate([row])).rejects.toThrow(/isSynthetic/);
    }
  });

  it("names the file it actually read when the outcome vocabulary is unreadable", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const { readCommandFunnelOutcomes } = await load();

    // The shared parser's messages name `contracts.ts`, because that is the only
    // file it was written for. This proves the reader rebuilds the message against
    // the file it read — the branch that would otherwise send a future maintainer
    // to the wrong module.
    const root = mkdtempSync(path.join(tmpdir(), "funnel-outcomes-"));
    const dir = path.join(root, "src", "features", "task-commands");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "outcomes.ts"),
      "export const TASK_COMMAND_OUTCOMES = [...SOMETHING_ELSE] as const;\n",
      "utf8",
    );

    // Leads with the file that was read. The parser's own message is kept after
    // the colon as provenance — it says *what* was unparseable, which is worth
    // more than a message with no attribution at all — but it can no longer be
    // the first thing a maintainer sees.
    expect(() => readCommandFunnelOutcomes(root))
      .toThrow(/^src\/features\/task-commands\/outcomes\.ts does not declare a readable/);
  });
});

describe("evaluating the evidence tiers", () => {
  async function tiers(counts: {
    qualifying: number;
    activeDays?: number;
    windowDays?: number;
    noMatch?: number;
    created?: number;
  }) {
    const { aggregateCommandFunnel, evaluateEvidenceTiers } = await load();
    const rows: Row[] = [];
    const activeDays = counts.activeDays ?? 1;
    for (let index = 0; index < counts.qualifying; index += 1) {
      // Spread across `activeDays` distinct local dates counting back from the
      // day before `windowEnd`, so the rows sit inside a 14-day window as well
      // as a 30-day one. 15:00Z is midday at UTC−3, so the local date and the
      // UTC date agree and the day count is exactly `activeDays`.
      const day = 28 - (index % activeDays);
      const outcome = index < (counts.noMatch ?? 0) ? "still_unmatched" : "previewed";
      rows.push(previewed({
        createdAt: `2026-07-${String(day).padStart(2, "0")}T15:00:00.000Z`,
        properties: { outcomeCategory: outcome, oneStep: outcome === "previewed" },
      }));
    }
    // Paired with an offer each, so the creations are attributable to the window
    // rather than counted as boundary skew.
    for (let index = 0; index < (counts.created ?? 0); index += 1) {
      rows.push(previewed({
        createdAt: "2026-07-20T15:00:00.000Z",
        properties: { outcomeCategory: "creation_offered", oneStep: false },
      }));
      rows.push(applied({
        createdAt: "2026-07-20T15:00:00.000Z",
        properties: { applyRoute: "created" },
      }));
    }
    const report = aggregateCommandFunnel({
      rows,
      timeZone: TIME_ZONE,
      windowEnd: WINDOW_END,
      windowDays: counts.windowDays ?? 30,
    });
    return { report, evaluation: evaluateEvidenceTiers(report, { goLive: "2026-07-29" }) };
  }

  it("reports the spike tier as met at exactly the thresholds", async () => {
    const { evaluation } = await tiers({ qualifying: 50, activeDays: 10, windowDays: 14 });
    expect(evaluation.spike.verdict).toBe("met");
    expect(evaluation.spike.thresholds.qualifyingCommands)
      .toEqual({ required: 50, measured: 50, met: true, comparison: "at_least" });
    expect(evaluation.spike.thresholds.activeDays)
      .toEqual({ required: 10, measured: 10, met: true, comparison: "at_least" });
    expect(evaluation.spike.thresholds.windowDays)
      .toEqual({ required: 14, measured: 14, met: true, comparison: "at_most" });
  });

  it("treats the observation window as a ceiling, not something to accumulate", async () => {
    // ADR-055 says "50 qualifying commands / 10 distinct active days / a 14-day
    // window". Fifty commands spread over a year is weaker evidence than fifty
    // over a fortnight, so a longer window must not satisfy the tier — otherwise
    // the reader's only authorizing verdict is reachable by waiting.
    const long = await tiers({ qualifying: 50, activeDays: 10, windowDays: 365 });
    expect(long.evaluation.spike.thresholds.windowDays.met).toBe(false);
    expect(long.evaluation.spike.verdict).toBe("not_met");

    // Shorter is stronger, so it passes.
    const short = await tiers({ qualifying: 50, activeDays: 10, windowDays: 12 });
    expect(short.evaluation.spike.thresholds.windowDays.met).toBe(true);
    expect(short.evaluation.spike.verdict).toBe("met");

    const planningLong = await tiers({
      qualifying: 150, activeDays: 20, windowDays: 31, noMatch: 30,
    });
    expect(planningLong.evaluation.planning.thresholds.windowDays.met).toBe(false);
    expect(planningLong.evaluation.planning.verdict).toBe("not_met");
  });

  it("reports the spike tier as met one above either floor", async () => {
    // Floors, so more is stronger: one above must still be met. Without this the
    // suite pins only the boundary and one side of it.
    const commands = await tiers({ qualifying: 51, activeDays: 10, windowDays: 14 });
    expect(commands.evaluation.spike.verdict).toBe("met");
    const days = await tiers({ qualifying: 50, activeDays: 11, windowDays: 14 });
    expect(days.evaluation.spike.verdict).toBe("met");
  });

  it("reports the planning tier as not met one below either floor", async () => {
    const commands = await tiers({
      qualifying: 149, activeDays: 20, windowDays: 30, noMatch: 30,
    });
    expect(commands.evaluation.planning.thresholds.qualifyingCommands.met).toBe(false);
    expect(commands.evaluation.planning.verdict).toBe("not_met");

    const days = await tiers({
      qualifying: 150, activeDays: 19, windowDays: 30, noMatch: 30,
    });
    expect(days.evaluation.planning.thresholds.activeDays.met).toBe(false);
    expect(days.evaluation.planning.verdict).toBe("not_met");
  });

  it("says when a window cannot satisfy a tier at all, whatever the data", async () => {
    // The two tiers want different windows and one report carries one window, so
    // a single run can positively evaluate at most one of them. At the reader's
    // 14-day default the planning tier is unreachable for a second reason that has
    // nothing to do with `distinctUsers`: 14 days admit at most 15 distinct local
    // dates, below its 20. Reported, because a structural `not_met` reads exactly
    // like a data `not_met`.
    const short = await tiers({ qualifying: 200, activeDays: 10, windowDays: 14, noMatch: 60 });
    expect(short.evaluation.spike.window.compatible).toBe(true);
    expect(short.evaluation.planning.window.compatible).toBe(false);
    expect(short.evaluation.planning.window.reason).toMatch(/distinct local dates/);

    const long = await tiers({ qualifying: 200, activeDays: 20, windowDays: 30, noMatch: 60 });
    expect(long.evaluation.planning.window.compatible).toBe(true);
    expect(long.evaluation.spike.window.compatible).toBe(false);
    expect(long.evaluation.spike.window.reason).toMatch(/exceeds this tier/);
  });

  it("reports the spike tier as not met one below either floor", async () => {
    const commands = await tiers({ qualifying: 49, activeDays: 10, windowDays: 14 });
    expect(commands.evaluation.spike.verdict).toBe("not_met");
    expect(commands.evaluation.spike.thresholds.qualifyingCommands.met).toBe(false);

    const days = await tiers({ qualifying: 50, activeDays: 9, windowDays: 14 });
    expect(days.evaluation.spike.verdict).toBe("not_met");
    expect(days.evaluation.spike.thresholds.activeDays.met).toBe(false);
  });

  it("can never report the planning tier as met, because distinct users are out of range", async () => {
    const { report, evaluation } = await tiers({
      qualifying: 150,
      activeDays: 20,
      windowDays: 30,
      noMatch: 30,
    });

    expect(report.distinctUsers).toBeNull();
    expect(report.privilegedReadRequired).toBe(true);
    // Every other threshold is met, and the verdict still is not `met`.
    expect(evaluation.planning.thresholds.qualifyingCommands.met).toBe(true);
    expect(evaluation.planning.thresholds.activeDays.met).toBe(true);
    expect(evaluation.planning.thresholds.windowDays.met).toBe(true);
    expect(evaluation.planning.thresholds.rateGate.met).toBe(true);
    expect(evaluation.planning.thresholds.distinctUsers)
      .toEqual({ required: 2, measured: null, met: null, privilegedReadRequired: true });
    expect(evaluation.planning.verdict).toBe("met_pending_privileged_read");
  });

  it("satisfies the planning rate gate from either branch", async () => {
    // 20% no-match, no creations.
    const byNoMatch = await tiers({
      qualifying: 150, activeDays: 20, windowDays: 30, noMatch: 30,
    });
    expect(byNoMatch.evaluation.planning.thresholds.rateGate.branches)
      .toEqual({ noMatch: true, noMatchToCreation: false });

    // Offers that all became creations: the no-match branch is 0 and the
    // creation branch alone must carry the gate.
    const byCreation = await tiers({
      qualifying: 150, activeDays: 20, windowDays: 30, created: 30,
    });
    expect(byCreation.report.rates.noMatch).toBe(0);
    expect(byCreation.evaluation.planning.thresholds.rateGate.branches)
      .toEqual({ noMatch: false, noMatchToCreation: true });
    expect(byCreation.evaluation.planning.thresholds.rateGate.met).toBe(true);

    const neither = await tiers({
      qualifying: 200, activeDays: 20, windowDays: 30, noMatch: 30, created: 20,
    });
    expect(neither.evaluation.planning.thresholds.rateGate.met).toBe(false);
    expect(neither.evaluation.planning.verdict).toBe("not_met");
  });

  it("never lets a zero denominator satisfy a rate threshold", async () => {
    const { evaluation } = await tiers({ qualifying: 0 });
    expect(evaluation.planning.thresholds.rateGate.met).toBe(false);
    expect(evaluation.spike.verdict).toBe("not_met");
  });

  it("decides the rate gate on exact integer arithmetic and shows the fraction", async () => {
    // 3/20 is exactly 0.15 and must pass; 2/20 must not. Reported rates are
    // rounded for reading, so the comparison cannot be made on them — and the
    // exact fraction travels with the verdict so nobody has to guess.
    const exact = await tiers({ qualifying: 17, activeDays: 20, windowDays: 30, created: 3 });
    expect(exact.report.qualifyingCommands).toBe(20);
    expect(exact.evaluation.planning.thresholds.rateGate.branches.noMatchToCreation).toBe(true);
    expect(exact.evaluation.planning.thresholds.rateGate.measured.exact.noMatchToCreation)
      .toBe("3/20");

    const under = await tiers({ qualifying: 18, activeDays: 20, windowDays: 30, created: 2 });
    expect(under.report.qualifyingCommands).toBe(20);
    expect(under.evaluation.planning.thresholds.rateGate.branches.noMatchToCreation).toBe(false);
  });
});

describe("the expiry", () => {
  it("is go-live plus ninety days", async () => {
    const { expiryDateFromGoLive } = await load();
    expect(expiryDateFromGoLive("2026-07-29")).toBe("2026-10-27");
  });

  it("crosses month and year boundaries by date arithmetic, not by string surgery", async () => {
    const { expiryDateFromGoLive } = await load();
    expect(expiryDateFromGoLive("2026-11-15")).toBe("2027-02-13");
    // 2028 is a leap year: 2028-01-31 + 90 days lands after a 29-day February.
    expect(expiryDateFromGoLive("2028-01-31")).toBe("2028-04-30");
  });

  it("refuses a go-live it cannot parse", async () => {
    const { expiryDateFromGoLive } = await load();
    expect(() => expiryDateFromGoLive("soon")).toThrow(/soon/);
  });

  it("travels with the evaluation so the gate and its deadline are read together", async () => {
    const { aggregateCommandFunnel, evaluateEvidenceTiers, EXPIRY_HORIZON_DAYS } = await load();
    const report = aggregateCommandFunnel({
      rows: [], timeZone: TIME_ZONE, windowEnd: WINDOW_END, windowDays: 14,
    });
    const evaluation = evaluateEvidenceTiers(report, { goLive: "2026-07-29" });
    expect(evaluation.expiry).toEqual({
      goLive: "2026-07-29",
      expiresOn: "2026-10-27",
      horizonDays: EXPIRY_HORIZON_DAYS,
    });
  });
});

describe("what the reader says about its own limits", () => {
  it("derives the unreachable preview categories from the emitters, not from a frozen claim", async () => {
    const { COMMAND_FUNNEL_REACHABILITY, COMMAND_FUNNEL_PREVIEWED_OUTCOMES } = await load();
    const source = readFileSync("src/features/task-commands/actions.ts", "utf8");

    // Every literal the emitter is handed, read out of the source. A future
    // slice that adds `report("unsupported")` changes this set, and the
    // assertion below then fails — which is the whole point: without reading the
    // file, the reachability claim would be a constant asserting itself while
    // the report told production a lie.
    const literals = new Set(
      [...source.matchAll(/\breport\(\s*"([a-z_]+)"\s*\)/gu)].map((match) => match[1]),
    );
    // The two dynamic sources: the preview's own disposition and the initial
    // match outcome. Both are bounded by vocabularies whose members are all
    // otherwise accounted for.
    expect(source).toContain("report(preview.disposition)");

    // Imported, not restated. `report(preview.disposition)` emits whatever
    // `TASK_COMMAND_PREVIEW_DISPOSITIONS` contains, so a future slice that adds a
    // member there starts emitting it — and a frozen copy here would let the
    // reachability claim go stale without anything failing.
    const dynamicallyReachable = new Set<string>([
      ...TASK_COMMAND_PREVIEW_DISPOSITIONS,
      // The two the initial round reports directly (`actions.ts:411`).
      "ambiguous",
      "ambiguous_overflow",
    ]);
    const unreachable = COMMAND_FUNNEL_PREVIEWED_OUTCOMES.filter(
      (outcome) => !literals.has(outcome) && !dynamicallyReachable.has(outcome),
    );

    expect(COMMAND_FUNNEL_REACHABILITY.unreachablePreviewOutcomes).toEqual(unreachable);
    expect([...COMMAND_FUNNEL_REACHABILITY.unreachablePreviewOutcomes])
      .toEqual(["applied", "unsupported", "rejected_conflict"]);
  });

  it("states every other structural limit as data", async () => {
    const report = await aggregate([]);

    expect(report.reachability.previewRoundsPerIntent).toEqual({ min: 1, max: 3 });
    expect(report.reachability.intentsWithNoPreviewEvent).toBe(true);
    expect(report.reachability.appliesWithoutPreview).toBe(true);
    expect(report.reachability.workDirectActionUndoEvent).toBe(false);
    expect(report.reachability.unsupportedVolumeMeasurable).toBe(false);
  });

  it("names ADR-055 and its own version so a pasted number stays traceable", async () => {
    const report = await aggregate([]);
    expect(report.adr).toBe("ADR-055");
    expect(report.readerVersion).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    expect(report.timeZone).toBe(TIME_ZONE);
  });

  it("carries no content-bearing field", async () => {
    const report = await aggregate([previewed(), applied(), undone(), disambiguated()]);
    const serialized = JSON.stringify(report);
    // 2F-ANALYTICS-003: counts, rates, bounded categories and ISO dates only.
    expect(serialized).not.toMatch(/userId|user_id|title|email|content|"id"/i);
  });
});

describe("the credentialed lane stays out of CI", () => {
  it("excludes the remote pattern from the default Vitest configuration", async () => {
    const config = readFileSync("vitest.config.ts", "utf8");
    // ADR-059: the end-to-end baseline needs the real loader and the real
    // scorer against a deployed database, so it lives under `src/` where the
    // default `include` would otherwise sweep it into the `app` CI job and fail
    // it for want of credentials.
    expect(config).toContain("src/**/*.remote.test.ts");
    // And the file that relies on the exclusion actually matches the pattern —
    // a rename that broke the match would otherwise go unnoticed until CI.
    const remote = "src/features/task-commands/end-to-end-match-baseline.remote.test.ts";
    expect(remote.endsWith(".remote.test.ts")).toBe(true);
    expect(readFileSync(remote, "utf8")).toContain("2F-MEASURE-007");
  });
});
