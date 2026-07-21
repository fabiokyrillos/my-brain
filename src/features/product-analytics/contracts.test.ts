import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

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
  "processing_retry_requested",
  "work_view_viewed",
  "task_status_changed",
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
  question_answered_basic: {},
  processing_retry_requested: { retrySource: "user" },
  work_view_viewed: { workView: "today" },
  task_status_changed: { fromStatus: "inbox", toStatus: "in_progress" },
};

describe("product analytics contracts", () => {
  it("defines the complete closed taxonomy of nineteen product events", () => {
    expect(contracts.productEventNames).toEqual(eventNames);
    expect(contracts.productSurfaces).toEqual([
      "home",
      "capture",
      "inbox",
      "needs_attention",
      "interpretation_review",
      "technical_details",
      "work",
      "server",
    ]);
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

  it("keeps contracts independent from React, Supabase, database types, and UI modules", () => {
    const filePath = path.resolve(process.cwd(), "src/features/product-analytics/contracts.ts");
    const source = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";

    expect(source).not.toBe("");
    expect(source).not.toMatch(/(?:from|import)\s*["'][^"']*(?:react|supabase|database\.types)[^"']*["']/i);
    expect(source).not.toMatch(/Database\s*\[\s*["']public["']\s*\]/);
    expect(source).not.toMatch(/from\s*["'][^"']*\.tsx?["']/i);
  });
});
