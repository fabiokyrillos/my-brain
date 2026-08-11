import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { parseProductEventPayload } from "./contracts";

type ProductAnalyticsContracts = {
  productEventContractVersion?: number;
  productEventVersionByName?: Record<string, number>;
  productEventNames?: readonly string[];
  productSurfaces?: readonly string[];
  parseProductEventPayload?: (value: unknown) => unknown | null;
  isProductAnalyticsSerializable?: (value: unknown) => boolean;
};

const contractsPath = `./${"contracts"}.ts`;
const contracts = await vi.importActual<ProductAnalyticsContracts>(contractsPath).catch(() => ({})) as ProductAnalyticsContracts;

const eventNames = [
  "capture_started",
  "capture_save_succeeded",
  "capture_save_failed",
  "capture_processing_enqueued",
  "capture_processing_completed",
  "capture_processing_failed",
  "needs_attention_viewed",
  "needs_attention_item_opened",
  "interpretation_review_viewed",
  "interpretation_corrected",
  "technical_details_opened",
  "task_candidates_presented",
  "candidate_edit_started",
  "candidate_edit_reset",
  "task_candidates_confirmed",
  "question_answered_basic",
  "question_resolved",
  "question_effect_previewed",
  "question_reinterpret_applied",
  "processing_retry_requested",
  "work_view_viewed",
  "task_status_changed",
  "task_command_previewed",
  "task_command_disambiguated",
  "task_command_applied",
  "task_command_undone",
  "rate_limit_refused",
  // Phase 2J slice 2J.7.
  "capture_mode_selected",
  "voice_transcription_finished",
  "attention_item_resolved",
  // Phase 2K slice 2K.8.
  "conversation_answer_shown",
  "conversation_memory_resolved",
  "conversation_suggestion_shown",
  // Phase 2M slice 2M.1. Four questions, six names, one reader.
  "calendar_viewed",
  "day_planned",
  "day_review_opened",
  "day_review_action_applied",
  "notification_consent_changed",
  "notification_suppressed",
] as const;

const basePayload = {
  surface: "capture",
  locale: "pt-BR",
  viewportClass: "desktop",
  appVersion: "2x-test-1",
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
} as const;

const propertiesByEvent: Record<(typeof eventNames)[number], Record<string, unknown>> = {
  capture_started: { captureSource: "home" },
  capture_save_succeeded: { captureSource: "home", durationMs: 12 },
  capture_save_failed: { captureSource: "home", durationMs: 12, failureKind: "validation" },
  capture_processing_enqueued: { processingMode: "initial" },
  capture_processing_completed: { processingMode: "initial", durationMs: 12, outcome: "ready" },
  capture_processing_failed: { processingMode: "initial", durationMs: 12, failureKind: "retryable" },
  needs_attention_viewed: { itemCount: 2 },
  needs_attention_item_opened: { attentionReason: "review_interpretation" },
  interpretation_review_viewed: {},
  interpretation_corrected: { fieldCount: 2 },
  technical_details_opened: {},
  task_candidates_presented: { candidateCount: 2 },
  candidate_edit_started: { candidateCount: 1 },
  candidate_edit_reset: { editedFieldCount: 2 },
  task_candidates_confirmed: { candidateCount: 2, editedCandidateCount: 1, editedFieldCount: 2 },
  question_answered_basic: { origin: "suggested" },
  question_resolved: { kind: "deferred" },
  question_effect_previewed: {},
  question_reinterpret_applied: {},
  processing_retry_requested: { retrySource: "user" },
  work_view_viewed: { workView: "today" },
  task_status_changed: { fromStatus: "inbox", toStatus: "in_progress" },
  task_command_previewed: {
    commandOrigin: "chat",
    outcomeCategory: "matched_requires_confirmation",
    candidateCount: 1,
    scoreBand: "high",
    marginBand: "high",
    signalCategories: ["normalized_exact_title", "recent_activity"],
    oneStep: false,
    requiresConfirmation: true,
    policyVersion: "2026-07-25.2",
  },
  task_command_disambiguated: {
    commandOrigin: "work",
    candidateCount: 3,
    selectedRank: 2,
    policyVersion: "2026-07-25.2",
  },
  task_command_applied: {
    commandOrigin: "chat",
    outcomeCategory: "applied",
    applyRoute: "direct",
    replayed: false,
    policyVersion: "2026-07-25.2",
  },
  task_command_undone: {
    commandOrigin: "work",
    undoResult: "undone",
    policyVersion: "2026-07-25.2",
  },
  rate_limit_refused: { operation: "ai", failureKind: "rate_limited" },
  capture_mode_selected: { captureMode: "voice" },
  voice_transcription_finished: { outcome: "succeeded", draftEdited: false, additionalSegment: false },
  attention_item_resolved: {
    attentionReason: "retry_processing",
    resolutionAction: "retry",
    resolutionBucket: "under_5s",
  },
  conversation_answer_shown: { evidence: "evidenced", explained: true },
  conversation_memory_resolved: { outcome: "undone" },
  conversation_suggestion_shown: { category: "person" },
  calendar_viewed: { orientation: "week" },
  day_planned: { operation: "set", itemCount: 3 },
  day_review_opened: { scope: "day" },
  day_review_action_applied: { scope: "next_day", actionKind: "carry_forward" },
  notification_consent_changed: { channel: "push", state: "granted" },
  notification_suppressed: { channel: "push", reason: "quiet_hours" },
};

describe("product analytics contracts", () => {
  it("defines the complete closed taxonomy of thirty-nine product events", () => {
    expect(contracts.productEventNames).toEqual(eventNames);
    expect(contracts.productSurfaces).toEqual([
      "home",
      "capture",
      "inbox",
      "needs_attention",
      "interpretation_review",
      "technical_details",
      "work",
      "questions",
      "server",
      "task_command",
      "conversation",
      // Phase 2M slice 2M.1, OD-2M-2 — its own surface, never a `workView`.
      "calendar",
    ]);
  });

  /**
   * The drift gate for the restated Phase 2E vocabularies (Epic 2E-H).
   *
   * `contracts.ts` imports these as *types* so the command taxonomy stays out
   * of the client bundle, which means a value outside the union is a compile
   * error but a missing member is not. This closes that half: each restated
   * list is held to the real runtime vocabulary by exact equality, so adding an
   * outcome, a band or an evidence label without teaching the analytics
   * allowlist about it reds here rather than being rejected by a CHECK
   * constraint in production.
   */
  it("restates every Phase 2E vocabulary exactly as its declaring module holds it", async () => {
    const [analytics, matchPolicy, outcomes, actual] = await Promise.all([
      import("@/features/task-commands/analytics"),
      import("@/features/task-commands/match-policy"),
      import("@/features/task-commands/outcomes"),
      import("./contracts"),
    ]);
    const restated = actual.taskCommandAnalyticsVocabularies;
    expect(restated.origins).toEqual([...analytics.TASK_COMMAND_ORIGINS]);
    expect(restated.applyRoutes).toEqual([...analytics.TASK_COMMAND_APPLY_ROUTES]);
    expect(restated.undoResults).toEqual([...analytics.TASK_COMMAND_UNDO_RESULTS]);
    expect(restated.outcomeCategories).toEqual([...outcomes.TASK_COMMAND_OUTCOMES]);
    expect(restated.previewedOutcomes).toEqual([...analytics.TASK_COMMAND_PREVIEWED_OUTCOMES]);
    expect(restated.scoreBands).toEqual([...matchPolicy.TASK_MATCH_SCORE_BANDS]);
    expect(restated.evidence).toEqual([...matchPolicy.TASK_MATCH_EVIDENCE]);
  });

  /**
   * PRD 2E-ANALYTICS-006, proven rather than asserted.
   *
   * The remote smoke is plain Node and cannot `import` this TypeScript module,
   * so it reads the two declarations out of the source. This holds that reader
   * to the real constants by exact equality, which is what makes it a mirror
   * instead of a fourth copy: a name added here and unparseable there fails on
   * this line, in the `app` CI job, rather than in a manual remote run nobody
   * is watching.
   */
  it("exposes both vocabularies to the remote smoke's reader, byte for byte", async () => {
    const { readProductEventVocabulary } = await import("../../../scripts/product-event-vocabulary.mjs");
    const read = readProductEventVocabulary(process.cwd());
    expect(read.eventNames).toEqual([...(contracts.productEventNames ?? [])]);
    expect(read.surfaces).toEqual([...(contracts.productSurfaces ?? [])]);
  });

  it("refuses a Phase 2E payload that carries content instead of a category", () => {
    const parse = contracts.parseProductEventPayload;
    const base = {
      ...basePayload,
      surface: "task_command",
      name: "task_command_previewed",
      properties: propertiesByEvent.task_command_previewed,
    };
    expect(parse?.(base)).not.toBeNull();
    // A raw title smuggled in as a signal category.
    expect(parse?.({
      ...base,
      properties: { ...base.properties, signalCategories: ["Send the invoice"] },
    })).toBeNull();
    // A repeated label: the builder deduplicates, so this did not come from it.
    expect(parse?.({
      ...base,
      properties: {
        ...base.properties,
        signalCategories: ["recent_activity", "recent_activity"],
      },
    })).toBeNull();
    // An extra property nobody declared.
    expect(parse?.({
      ...base,
      properties: { ...base.properties, commandText: "cancel my gym task" },
    })).toBeNull();
    // The preview event accepts `previewed`, which is a disposition rather than
    // an outcome — a one-step-eligible match rests there.
    expect(parse?.({ ...base, properties: { ...base.properties, outcomeCategory: "previewed" } }))
      .not.toBeNull();
    // ...and still refuses a category from no vocabulary at all.
    expect(parse?.({ ...base, properties: { ...base.properties, outcomeCategory: "matched" } }))
      .toBeNull();
    // The *apply* event does not accept it: an applied command has come to rest.
    expect(parse?.({
      ...basePayload,
      surface: "task_command",
      name: "task_command_applied",
      properties: { ...propertiesByEvent.task_command_applied, outcomeCategory: "previewed" },
    })).toBeNull();
    // A band outside the permanent vocabulary.
    expect(parse?.({ ...base, properties: { ...base.properties, scoreBand: "certain" } })).toBeNull();
    // A policy version that is free text rather than a version.
    expect(parse?.({ ...base, properties: { ...base.properties, policyVersion: "latest" } })).toBeNull();
    // A string standing in for a boolean, which the SQL validator also refuses.
    expect(parse?.({ ...base, properties: { ...base.properties, oneStep: "true" } })).toBeNull();
  });

  // Slice 2D.3: suggestion provenance is a bounded enum, never content.
  it("accepts only the bounded typed/suggested answer origin", () => {
    const parse = contracts.parseProductEventPayload;
    const base = { ...basePayload, name: "question_answered_basic" };
    expect(parse?.({ ...base, properties: { origin: "typed" } })).not.toBeNull();
    expect(parse?.({ ...base, properties: { origin: "suggested" } })).not.toBeNull();
    expect(parse?.({ ...base, properties: {} })).toBeNull();
    expect(parse?.({ ...base, properties: { origin: "person:ana-prado" } })).toBeNull();
    expect(parse?.({ ...base, properties: { origin: "suggested", suggestionId: "person:ana" } })).toBeNull();
    expect(parse?.({ ...base, properties: { origin: "suggested", answer: "Ana Prado" } })).toBeNull();
  });

  it("keeps the effect-preview event strictly property-free", () => {
    const parse = contracts.parseProductEventPayload;
    const base = { ...basePayload, surface: "questions", name: "question_effect_previewed" };
    expect(parse?.({ ...base, properties: {} })).not.toBeNull();
    expect(parse?.({ ...base, properties: { kind: "reinterpret" } })).toBeNull();
    expect(parse?.({ ...base, properties: { question: "Quem?" } })).toBeNull();
  });

  // Slice 2D.4: the reinterpretation event is boolean-by-existence.
  it("keeps the reinterpretation-applied event strictly property-free", () => {
    const parse = contracts.parseProductEventPayload;
    const base = { ...basePayload, surface: "server", name: "question_reinterpret_applied" };
    expect(parse?.({ ...base, properties: {} })).not.toBeNull();
    expect(parse?.({ ...base, properties: { consequence: "reinterpret" } })).toBeNull();
    expect(parse?.({ ...base, properties: { answer: "Sexta" } })).toBeNull();
  });

  it("keeps every event on the explicit v1 contract while appVersion remains the stored experience version", () => {
    expect(contracts.productEventContractVersion).toBe(1);
    expect(contracts.productEventVersionByName).toEqual(
      Object.fromEntries(eventNames.map((name) => [name, 1])),
    );
  });

  it.each(eventNames)("accepts the allowlisted payload for %s", (name) => {
    const parsed = contracts.parseProductEventPayload?.({
      ...basePayload,
      name,
      properties: propertiesByEvent[name],
      sessionId: "22222222-2222-4222-8222-222222222222",
      subject: { type: "entry", id: "33333333-3333-4333-8333-333333333333" },
    });

    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({ name, properties: propertiesByEvent[name] });
  });

  it("rejects unknown names, properties, values, and every free-content field", () => {
    const parse = contracts.parseProductEventPayload;
    const validCapture = { ...basePayload, name: "capture_started", properties: { captureSource: "home" } };

    expect(parse?.({ ...validCapture, name: "custom_event" })).toBeNull();
    expect(parse?.({ ...validCapture, surface: "internal" })).toBeNull();
    expect(parse?.({ ...validCapture, properties: { captureSource: "home", extra: true } })).toBeNull();
    expect(parse?.({ ...validCapture, properties: { captureSource: "unbounded-value" } })).toBeNull();
    expect(parse?.({ ...validCapture, original: "captura privada" })).toBeNull();
    expect(parse?.({ ...validCapture, summary: "resumo privado" })).toBeNull();
    expect(parse?.({ ...validCapture, answer: "resposta privada" })).toBeNull();
    expect(parse?.({ ...validCapture, prompt: "prompt privado" })).toBeNull();
    expect(parse?.({ ...validCapture, error: "erro bruto" })).toBeNull();
  });

  /**
   * Phase 2M slice 2M.1, `2M-METRICS-004`.
   *
   * The parser is the first of the two gates. A calendar phase is exactly where
   * a `plannedDate` or an `anchorDate` would feel harmless, so the refusal is
   * asserted at the application boundary as well as in the database — a writer
   * cannot smuggle one past the parser on its way to a validator that would
   * also have refused it.
   */
  it("bounds every Phase 2M daily-cycle event, and gives a date nowhere to go", () => {
    const parse = contracts.parseProductEventPayload;
    const on = (name: string, properties: unknown) => parse?.({ ...basePayload, name, properties });

    expect(on("calendar_viewed", { orientation: "day" })).not.toBeNull();
    expect(on("calendar_viewed", { orientation: "month" })).toBeNull();
    expect(on("calendar_viewed", { orientation: "day", anchorDate: "2026-08-12" })).toBeNull();

    expect(on("day_planned", { operation: "set", itemCount: 1 })).not.toBeNull();
    expect(on("day_planned", { operation: "cleared", itemCount: 50 })).not.toBeNull();
    // OD-2L-4's ceiling, and the floor: zero items is not a planning action.
    expect(on("day_planned", { operation: "set", itemCount: 51 })).toBeNull();
    expect(on("day_planned", { operation: "set", itemCount: 0 })).toBeNull();
    expect(on("day_planned", { operation: "moved", itemCount: 1 })).toBeNull();
    expect(on("day_planned", { operation: "set", itemCount: 1, plannedDate: "2026-08-12" })).toBeNull();

    expect(on("day_review_opened", { scope: "next_day" })).not.toBeNull();
    expect(on("day_review_opened", { scope: "week" })).toBeNull();

    expect(on("day_review_action_applied", { scope: "day", actionKind: "archive" })).not.toBeNull();
    expect(on("day_review_action_applied", { scope: "day", actionKind: "cancel" })).toBeNull();
    expect(on("day_review_action_applied", { scope: "day" })).toBeNull();

    expect(on("notification_consent_changed", { channel: "push", state: "revoked" })).not.toBeNull();
    expect(on("notification_consent_changed", { channel: "email", state: "revoked" })).toBeNull();
    expect(on("notification_consent_changed", { channel: "push", state: "muted" })).toBeNull();
    // The endpoint is the one value a subscription record could leak.
    expect(on("notification_consent_changed", {
      channel: "push", state: "granted", endpoint: "https://push.example/abc",
    })).toBeNull();

    expect(on("notification_suppressed", { channel: "push", reason: "daily_cap" })).not.toBeNull();
    expect(on("notification_suppressed", { channel: "push", reason: "expired" })).toBeNull();
    expect(on("notification_suppressed", { channel: "push", reason: "quiet_hours", title: "Reunião" })).toBeNull();
  });

  it("accepts the calendar surface, and still refuses one that was never declared", () => {
    const parse = contracts.parseProductEventPayload;
    const calendar = {
      ...basePayload,
      surface: "calendar",
      name: "calendar_viewed",
      properties: { orientation: "agenda" },
    };
    expect(parse?.(calendar)).not.toBeNull();
    expect(parse?.({ ...calendar, surface: "planner" })).toBeNull();
  });

  it("accepts only JSON-serializable product data", () => {
    const payload = {
      ...basePayload,
      name: "capture_started",
      properties: { captureSource: "home" },
    };

    expect(contracts.isProductAnalyticsSerializable?.(payload)).toBe(true);
    expect(contracts.isProductAnalyticsSerializable?.({ timestamp: new Date() })).toBe(false);
    expect(contracts.isProductAnalyticsSerializable?.({ callback: () => undefined })).toBe(false);
    expect(JSON.parse(JSON.stringify(contracts.parseProductEventPayload?.(payload)))).toMatchObject(payload);
  });

  it("bounds the editable-candidate analytics events to their allowlisted shape", () => {
    const parse = contracts.parseProductEventPayload;
    const valid = { ...basePayload, name: "candidate_edit_started", properties: { candidateCount: 1 } };

    expect(parse?.(valid)).not.toBeNull();
    expect(parse?.({ ...valid, properties: { candidateCount: 2 } })).toBeNull();
    expect(parse?.({ ...valid, properties: { candidateCount: 1, candidateIndex: 0 } })).toBeNull();

    const resetValid = { ...basePayload, name: "candidate_edit_reset", properties: { editedFieldCount: 0 } };
    expect(parse?.(resetValid)).not.toBeNull();
    expect(parse?.({ ...resetValid, properties: { editedFieldCount: -1 } })).toBeNull();
    expect(parse?.({ ...resetValid, properties: { editedFieldCount: 301 } })).toBeNull();
    expect(parse?.({ ...resetValid, properties: { editedFieldCount: 1, title: "leaked" } })).toBeNull();

    const confirmedValid = {
      ...basePayload,
      name: "task_candidates_confirmed",
      properties: { candidateCount: 2, editedCandidateCount: 1, editedFieldCount: 3 },
    };
    expect(parse?.(confirmedValid)).not.toBeNull();
    expect(parse?.({ ...confirmedValid, properties: { candidateCount: 2 } })).toBeNull();
    expect(parse?.({
      ...confirmedValid,
      properties: { candidateCount: 2, editedCandidateCount: 3, editedFieldCount: 3 },
    })).not.toBeNull();
  });

  /**
   * ADR-084's regression pin: the producer and the two validators must not
   * diverge again.
   *
   * SH.6 shipped a producer for `failureKind: 'quota'` and no consumer of it —
   * neither this module's `isOneOf` nor the database enum admitted the value,
   * so every quota refusal recorded nothing while the call site read as though
   * it recorded something. Three declarations of one vocabulary, checked here
   * against each other rather than against a hand-written list, because that
   * is the shape of the defect: each one was internally consistent.
   */
  it("agrees with the migration chain on captureSource and failureKind (ADR-084)", () => {
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/202608060078_phase_2g_composer_capture_source.sql",
      ),
      "utf8",
    );
    // The database's own words, read rather than restated.
    expect(migration).toContain(
      "'captureSource', array['home', 'capture_page', 'global', 'composer']",
    );
    expect(migration).toContain(
      "'failureKind', array['validation', 'session', 'storage', 'unknown', 'quota']",
    );

    // The application's, and they must admit exactly what the database does.
    const contracts = readFileSync(
      path.resolve(process.cwd(), "src/features/product-analytics/contracts.ts"),
      "utf8",
    );
    expect(contracts).toContain('["home", "capture_page", "global", "composer"]');
    expect(contracts).toContain('["validation", "session", "storage", "unknown", "quota"]');

    // And the producer's, so a value nobody validates cannot ship again.
    const producer = readFileSync(
      path.resolve(process.cwd(), "src/features/capture/actions.ts"),
      "utf8",
    );
    for (const emitted of ["quota", "storage", "composer"]) {
      expect(producer, `${emitted} is emitted by capture/actions.ts`).toContain(`"${emitted}"`);
    }

    // The behavioural half: the validator this module exports must accept the
    // two repaired values and still refuse an invented one.
    // Imported statically rather than through this file's `importActual`
    // shim. That shim exists to tolerate the module being absent — it falls
    // back to `{}` — which is the right posture for the vocabulary-census
    // cases above and the wrong one here: a `parse` that silently became
    // `undefined` would make every refusal assertion below pass by not
    // running, which is the exact failure mode this test exists to catch.
    const failed = {
      ...basePayload,
      name: "capture_save_failed",
      properties: { captureSource: "composer", durationMs: 12, failureKind: "quota" },
    };
    expect(parseProductEventPayload(failed)).not.toBeNull();
    expect(
      parseProductEventPayload({
        ...failed,
        properties: { ...failed.properties, failureKind: "invented" },
      }),
    ).toBeNull();
    expect(
      parseProductEventPayload({
        ...failed,
        properties: { ...failed.properties, captureSource: "invented" },
      }),
    ).toBeNull();
  });

  it("keeps contracts independent from React, Supabase, database types, and UI modules", () => {
    const filePath = path.resolve(process.cwd(), "src/features/product-analytics/contracts.ts");
    const source = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";

    expect(source).not.toBe("");
    expect(source).not.toMatch(/(?:from|import)\s*["'][^"']*(?:react|supabase|database\.types)[^"']*["']/i);
    expect(source).not.toMatch(/Database\s*\[\s*["']public["']\s*\]/);
    expect(source).not.toMatch(/from\s*["'][^"']*\.tsx?["']/i);
  });
});
