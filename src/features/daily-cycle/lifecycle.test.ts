import { describe, expect, it, vi } from "vitest";

type LifecycleInput = {
  entryLifecycle: string;
  job?: { status: string; retryAt?: string | null } | null;
  hasValidTaskCandidates?: boolean;
  hasOpenQuestion?: boolean;
  recordOnly?: boolean;
  hasMaterializedTaskForCandidates?: boolean;
  hasConsistencyIssue?: boolean;
  now?: string;
};

type LifecycleModule = {
  entryLifecycleStates?: readonly string[];
  jobLifecycleStates?: readonly string[];
  resolveDailyCycleLifecycle?: (input: LifecycleInput) => {
    productState: string;
    attentionReason: string | null;
    fallback: boolean;
  };
};

const lifecyclePath = `./${"lifecycle"}.ts`;
const lifecycle = await vi.importActual<LifecycleModule>(lifecyclePath).catch(() => ({})) as LifecycleModule;

function resolve(input: LifecycleInput) {
  expect(lifecycle.resolveDailyCycleLifecycle).toBeTypeOf("function");
  return lifecycle.resolveDailyCycleLifecycle?.(input);
}

describe("daily cycle lifecycle projection", () => {
  it("documents the nine internal entry lifecycle states and job states", () => {
    expect(lifecycle.entryLifecycleStates).toEqual([
      "saved",
      "interpreting",
      "awaiting_review",
      "partially_processed",
      "completed",
      "recoverable_error",
      "terminal_error",
      "reprocessing",
      "awaiting_ai_configuration",
    ]);
    expect(lifecycle.jobLifecycleStates).toEqual(["pending", "running", "failed", "completed", "exhausted"]);
  });

  it.each([
    [{ entryLifecycle: "saved" }, { productState: "saved", attentionReason: null, fallback: false }],
    [{ entryLifecycle: "interpreting" }, { productState: "organizing", attentionReason: null, fallback: false }],
    [{ entryLifecycle: "awaiting_review" }, { productState: "needs_attention", attentionReason: "review_interpretation", fallback: false }],
    [{ entryLifecycle: "partially_processed" }, { productState: "needs_attention", attentionReason: "review_interpretation", fallback: false }],
    [{ entryLifecycle: "completed" }, { productState: "ready", attentionReason: null, fallback: false }],
    [{ entryLifecycle: "recoverable_error" }, { productState: "could_not_organize", attentionReason: "retry_processing", fallback: false }],
    [{ entryLifecycle: "terminal_error" }, { productState: "could_not_organize", attentionReason: "retry_processing", fallback: false }],
    [{ entryLifecycle: "reprocessing" }, { productState: "organizing", attentionReason: null, fallback: false }],
    [{ entryLifecycle: "awaiting_ai_configuration" }, { productState: "needs_attention", attentionReason: "configure_ai_credential", fallback: false }],
  ] as const)("maps %o to the public product state", (input, expected) => {
    expect(resolve(input)).toEqual(expected);
  });

  it("uses job state to distinguish saved, active processing, retrying, and exhausted work", () => {
    expect(resolve({ entryLifecycle: "saved", job: { status: "pending" } })).toMatchObject({ productState: "organizing" });
    expect(resolve({ entryLifecycle: "recoverable_error", job: { status: "running" } })).toMatchObject({ productState: "organizing" });
    expect(resolve({
      entryLifecycle: "recoverable_error",
      job: { status: "failed", retryAt: "2026-07-17T15:01:00.000Z" },
      now: "2026-07-17T15:00:00.000Z",
    })).toMatchObject({ productState: "organizing", attentionReason: null });
    expect(resolve({
      entryLifecycle: "recoverable_error",
      job: { status: "failed", retryAt: "2026-07-17T14:59:00.000Z" },
      now: "2026-07-17T15:00:00.000Z",
    })).toMatchObject({ productState: "could_not_organize", attentionReason: "retry_processing" });
    expect(resolve({ entryLifecycle: "recoverable_error", job: { status: "exhausted" } })).toMatchObject({ productState: "could_not_organize" });
    expect(resolve({ entryLifecycle: "saved", job: { status: "completed" } })).toEqual({
      productState: "could_not_organize",
      attentionReason: "resolve_consistency",
      fallback: true,
    });
  });

  it("projects current candidates and open questions only when they still require a supported action", () => {
    expect(resolve({ entryLifecycle: "completed", hasValidTaskCandidates: true })).toMatchObject({
      productState: "needs_attention",
      attentionReason: "confirm_existing_candidates",
    });
    expect(resolve({ entryLifecycle: "completed", hasOpenQuestion: true })).toMatchObject({
      productState: "needs_attention",
      attentionReason: "answer_existing_question",
    });
    expect(resolve({
      entryLifecycle: "completed",
      hasValidTaskCandidates: true,
      hasMaterializedTaskForCandidates: true,
    })).toEqual({ productState: "ready", attentionReason: null, fallback: false });
    expect(resolve({
      entryLifecycle: "completed",
      hasValidTaskCandidates: true,
      hasMaterializedTaskForCandidates: true,
      hasOpenQuestion: true,
    })).toMatchObject({ productState: "needs_attention", attentionReason: "answer_existing_question" });
  });

  it("applies deterministic precedence for record-only, terminal failures, and inconsistencies", () => {
    expect(resolve({ entryLifecycle: "completed", recordOnly: true, hasValidTaskCandidates: true })).toEqual({
      productState: "ready",
      attentionReason: null,
      fallback: false,
    });
    expect(resolve({ entryLifecycle: "terminal_error", hasValidTaskCandidates: true })).toEqual({
      productState: "could_not_organize",
      attentionReason: "retry_processing",
      fallback: false,
    });
    expect(resolve({ entryLifecycle: "completed", hasConsistencyIssue: true })).toEqual({
      productState: "needs_attention",
      attentionReason: "resolve_consistency",
      fallback: false,
    });
  });

  /**
   * `BYOK-CAPTURE-002`, and specifically the ordering the projection depends on.
   *
   * An entry reaches the awaiting state two ways, and only one of them leaves
   * the job table empty. These assertions pin the harder one.
   */
  describe("awaiting AI configuration", () => {
    it("beats an exhausted job left behind by a credential failure", () => {
      // The failure mode this prevents: enqueued while a key was active, run
      // after it was removed, job terminal. Reading the job first would answer
      // `could_not_organize` + `retry_processing` — offering the one action that
      // cannot work and hiding the one that can.
      expect(resolve({ entryLifecycle: "awaiting_ai_configuration", job: { status: "exhausted" } })).toEqual({
        productState: "needs_attention",
        attentionReason: "configure_ai_credential",
        fallback: false,
      });
    });

    it("beats a pending or failed job, so nothing claims to be organizing", () => {
      for (const status of ["pending", "running", "failed"]) {
        expect(
          resolve({ entryLifecycle: "awaiting_ai_configuration", job: { status } }),
          `a ${status} job must not make an awaiting entry look organizing`,
        ).toEqual({
          productState: "needs_attention",
          attentionReason: "configure_ai_credential",
          fallback: false,
        });
      }
    });

    it("is never reported as organizing, saved or ready", () => {
      // The negative form of the requirement, stated once so a future reordering
      // of the branches above cannot satisfy the positives by accident.
      const projection = resolve({ entryLifecycle: "awaiting_ai_configuration" });
      expect(["organizing", "saved", "ready"]).not.toContain(projection?.productState);
    });

    it("still fails closed on an unknown job state", () => {
      expect(resolve({ entryLifecycle: "awaiting_ai_configuration", job: { status: "invented" } })).toEqual({
        productState: "could_not_organize",
        attentionReason: "resolve_consistency",
        fallback: true,
      });
    });
  });

  it("fails closed for unknown entry or job states and never returns ready", () => {
    expect(resolve({ entryLifecycle: "legacy_complete" })).toEqual({
      productState: "could_not_organize",
      attentionReason: "resolve_consistency",
      fallback: true,
    });
    expect(resolve({ entryLifecycle: "completed", job: { status: "stalled_forever" } })).toEqual({
      productState: "could_not_organize",
      attentionReason: "resolve_consistency",
      fallback: true,
    });
  });
});
