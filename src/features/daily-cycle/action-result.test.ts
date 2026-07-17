import { describe, expect, it, vi } from "vitest";

type ActionResultModule = {
  dailyCycleActionSuccessCodes?: readonly string[];
  dailyCycleActionFailureCodes?: readonly string[];
  createDailyCycleActionSuccess?: (input: Record<string, unknown>) => Record<string, unknown>;
  createDailyCycleActionFailure?: (input: Record<string, unknown>) => Record<string, unknown>;
  isDailyCycleActionResult?: (value: unknown) => boolean;
};

const actionResultPath = `./${"action-result"}.ts`;
const actionResult = await vi.importActual<ActionResultModule>(actionResultPath).catch(() => ({})) as ActionResultModule;

describe("daily cycle action result", () => {
  it("keeps success and failure codes stable and locale-independent", () => {
    expect(actionResult.dailyCycleActionSuccessCodes).toEqual([
      "capture_persisted",
      "capture_replayed",
      "correction_saved",
      "undo_applied",
      "reprocessing_queued",
      "task_candidates_confirmed",
      "task_creation_undone",
      "retry_scheduled",
      "question_answered",
    ]);
    expect(actionResult.dailyCycleActionFailureCodes).toEqual([
      "validation_failed",
      "unauthenticated",
      "not_found",
      "version_conflict",
      "action_unavailable",
      "retry_not_available",
      "operation_failed",
    ]);
  });

  it("creates a discriminated success result without provider or database details", () => {
    const result = actionResult.createDailyCycleActionSuccess?.({
      code: "capture_replayed",
      messageKey: "capture_replayed",
      entityId: "entry-1",
      productState: "saved",
      replayed: true,
    });

    expect(result).toEqual({
      ok: true,
      code: "capture_replayed",
      messageKey: "capture_replayed",
      entityId: "entry-1",
      productState: "saved",
      replayed: true,
      retryable: false,
    });
    expect(actionResult.isDailyCycleActionResult?.(result)).toBe(true);
  });

  it("creates a discriminated failure result with safe field errors", () => {
    const result = actionResult.createDailyCycleActionFailure?.({
      code: "validation_failed",
      messageKey: "validation_failed",
      retryable: false,
      fieldErrors: { content: "required" },
    });

    expect(result).toEqual({
      ok: false,
      code: "validation_failed",
      messageKey: "validation_failed",
      retryable: false,
      fieldErrors: { content: "required" },
    });
    expect(actionResult.isDailyCycleActionResult?.(result)).toBe(true);
    expect(actionResult.isDailyCycleActionResult?.({ ok: true, code: "validation_failed" })).toBe(false);
  });
});
