/**
 * `2J-METRICS-001` … `2J-METRICS-007` — the telemetry contract's guard.
 *
 * Two properties, and the second is the one SH.6 taught:
 *
 *   1. **Content-free by construction.** Every declared event's property keys
 *      are a closed whitelist in the database, so there is nowhere to put a
 *      transcript, a filename or a title. A guard that only read the TypeScript
 *      would miss a payload that reached the RPC by another route.
 *   2. **Every producer has a consumer.** SH.6 shipped `capture_save_failed`
 *      with `failureKind: 'quota'` that no vocabulary accepted and no reader
 *      asked for; the emission was wrapped in `.catch(() => {})` and recorded
 *      nothing for weeks while the code read as though it worked. So this
 *      asserts each Phase 2J event has BOTH an emitter and an aggregator.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The aggregator is plain JavaScript, so its return type is inferred from an
// object literal whose optional keys start at zero. Typed here rather than in
// the module: adding TypeScript to a script the runner executes directly would
// change how it is run.
type FunnelSummary = {
  considered: number;
  ignored: number;
  captureModes: Record<string, number>;
  transcription: Record<string, number>;
  draft: { edited: number; unedited: number };
  segments: { single: number; additional: number };
  attention: { byAction: Record<string, number>; byBucket: Record<string, number> };
};
type FunnelRow = { event_name: string; properties: Record<string, unknown> };

import * as funnel from "../../../scripts/phase-2j-experience-funnel.mjs";

const aggregateExperienceFunnel = (rows: FunnelRow[] | undefined): FunnelSummary =>
  (funnel as { aggregateExperienceFunnel: (r: unknown) => FunnelSummary })
    .aggregateExperienceFunnel(rows);

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

const PHASE_2J_EVENTS = [
  "capture_mode_selected",
  "voice_transcription_finished",
  "attention_item_resolved",
] as const;

const MIGRATION = "supabase/migrations/202608080086_phase_2j_experience_telemetry.sql";

describe("2J-METRICS-007: every declared event has a producer and a consumer", () => {
  const emitters = read("src/features/product-analytics/interaction-events.tsx");
  const aggregator = read("scripts/phase-2j-experience-funnel.mjs");

  it.each(PHASE_2J_EVENTS)("%s is emitted somewhere", (name) => {
    expect(emitters).toContain(`name: "${name}"`);
  });

  it.each(PHASE_2J_EVENTS)("%s is aggregated by the funnel reader", (name) => {
    expect(aggregator).toContain(name);
  });

  it("declares no event the aggregator ignores", () => {
    // The reverse direction. An event added to the vocabulary but not to the
    // reader is precisely the shape SH.6 shipped.
    const declared = [...read("src/features/product-analytics/contracts.ts").matchAll(/"(capture_mode_selected|voice_transcription_finished|attention_item_resolved)"/g)];
    expect(new Set(declared.map((match) => match[1])).size).toBe(PHASE_2J_EVENTS.length);
  });

  it("wires the reader into package.json, because a script nobody can run is not a consumer", () => {
    const manifest = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
    const entries = Object.values(manifest.scripts ?? {});
    expect(entries.some((command) => command.includes("phase-2j-experience-funnel-reader.mjs"))).toBe(true);
  });
});

describe("2J-METRICS-006: the payload has nowhere to put content", () => {
  const migration = read(MIGRATION);

  it("whitelists each event's property keys in the database", () => {
    expect(migration).toMatch(/when 'capture_mode_selected' then\s*\n\s*allowed_keys := array\['captureMode'\];/);
    expect(migration).toMatch(/when 'voice_transcription_finished' then\s*\n\s*allowed_keys := array\['outcome', 'draftEdited', 'additionalSegment'\];/);
    expect(migration).toMatch(/when 'attention_item_resolved' then\s*\n\s*allowed_keys := array\['attentionReason', 'resolutionAction', 'resolutionBucket'\];/);
  });

  it("admits no key that could hold user text", () => {
    // Read from the migration's own arms rather than from a list kept here, so
    // widening a whitelist has to face this test.
    const arms = migration.match(/allowed_keys := array\[[^\]]*\];/g) ?? [];
    expect(arms.length).toBeGreaterThan(10);
    for (const arm of arms) {
      expect(arm).not.toMatch(/'(text|content|transcript|title|filename|name|body|excerpt|preview|query)'/);
    }
  });

  it("constrains every Phase 2J value to a closed enum or a boolean", () => {
    expect(migration).toContain("require_product_event_enum(p_properties, 'captureMode', array['text', 'attachment', 'voice'])");
    expect(migration).toContain("require_product_event_enum(p_properties, 'outcome', array['succeeded', 'failed'])");
    expect(migration).toContain("require_product_event_boolean(p_properties, 'draftEdited')");
    expect(migration).toContain("require_product_event_boolean(p_properties, 'additionalSegment')");
  });

  it("records a bucket rather than a duration", () => {
    // `2J-METRICS-002`. A millisecond count says when somebody was at their desk
    // and how fast they read. The enum makes the coarse answer the only one.
    expect(migration).toContain("array['under_5s', 'under_60s', 'over_60s']");
    const contracts = read("src/features/product-analytics/contracts.ts");
    expect(contracts).toMatch(/resolutionBucket: ResolutionBucket/);
    expect(contracts).not.toMatch(/resolutionMs|durationMs: number;\s*\n\s*\};\s*\n\s*attention_item_resolved/);
  });

  it("bucketises at the emitter, so no caller can pass a raw duration through", () => {
    const emitters = read("src/features/product-analytics/interaction-events.tsx");
    expect(emitters).toContain("resolutionBucket: toResolutionBucket(input.elapsedMs)");
  });
});

describe("the aggregator answers the questions it claims to", () => {
  it("counts modality, outcome, draft edits and segments", () => {
    const summary = aggregateExperienceFunnel([
      { event_name: "capture_mode_selected", properties: { captureMode: "voice" } },
      { event_name: "capture_mode_selected", properties: { captureMode: "text" } },
      {
        event_name: "voice_transcription_finished",
        properties: { outcome: "succeeded", draftEdited: true, additionalSegment: false },
      },
      {
        event_name: "voice_transcription_finished",
        properties: { outcome: "failed", draftEdited: false, additionalSegment: true },
      },
      {
        event_name: "attention_item_resolved",
        properties: {
          attentionReason: "retry_processing",
          resolutionAction: "bulk_retry",
          resolutionBucket: "under_5s",
        },
      },
    ]);

    expect(summary.considered).toBe(5);
    expect(summary.captureModes.voice).toBe(1);
    expect(summary.captureModes.text).toBe(1);
    expect(summary.transcription).toMatchObject({ succeeded: 1, failed: 1 });
    expect(summary.draft).toEqual({ edited: 1, unedited: 1 });
    expect(summary.segments).toEqual({ single: 1, additional: 1 });
    expect(summary.attention.byAction.bulk_retry).toBe(1);
    expect(summary.attention.byBucket.under_5s).toBe(1);
  });

  it("counts an unknown value rather than dropping it", () => {
    // A silently discarded row makes a vocabulary drift look like a quiet
    // period, which is the exact confusion this whole file exists to prevent.
    const summary = aggregateExperienceFunnel([
      { event_name: "capture_mode_selected", properties: { captureMode: "telepathy" } },
    ]);
    expect(summary.captureModes.unknown).toBe(1);
    expect(summary.considered).toBe(1);
  });

  it("ignores events from other phases without counting them as considered", () => {
    const summary = aggregateExperienceFunnel([
      { event_name: "capture_started", properties: { captureSource: "home" } },
    ]);
    expect(summary.considered).toBe(0);
    expect(summary.ignored).toBe(1);
  });

  it("survives an empty or missing input", () => {
    expect(aggregateExperienceFunnel([]).considered).toBe(0);
    expect(aggregateExperienceFunnel(undefined).considered).toBe(0);
  });
});
