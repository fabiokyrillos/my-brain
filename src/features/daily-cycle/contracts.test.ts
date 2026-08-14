import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

type ContractsModule = {
  productStates?: readonly string[];
  attentionReasons?: readonly string[];
  trackedAttentionReasons?: readonly string[];
  dailyCycleActions?: readonly string[];
  dailyCycleMessageKeys?: readonly string[];
  isDailyCycleSerializable?: (value: unknown) => boolean;
};

const contractsPath = `./${"contracts"}.ts`;
const contracts = await vi.importActual<ContractsModule>(contractsPath).catch(() => ({})) as ContractsModule;

describe("daily cycle product contracts", () => {
  it("defines only the five public product states", () => {
    expect(contracts.productStates).toEqual([
      "saved",
      "organizing",
      "needs_attention",
      "ready",
      "could_not_organize",
    ]);
  });

  it("defines only the seven supported attention reasons", () => {
    expect(contracts.attentionReasons).toEqual([
      "review_interpretation",
      "confirm_existing_candidates",
      "answer_existing_question",
      "retry_processing",
      "resolve_consistency",
      "configure_ai_credential",
      "resolve_validity_conflict",
    ]);
  });

  /**
   * `2N-CONFLICT-003`. The regression that matters most in this slice.
   *
   * `resolve_consistency` already means *one entry the assistant could not
   * organize*, and it has a live producer at `lifecycle.ts:71`. 2N.4 needed a
   * reason for two facts that cannot both be right, and the failure mode it had
   * to avoid was reusing that one — which would make a single sentence stand for
   * two unrelated problems.
   *
   * Asserted as two distinct members with two distinct meanings, so a later
   * "simplification" that collapses them fails here rather than in the queue.
   */
  it("keeps resolve_consistency and resolve_validity_conflict as two different reasons", () => {
    expect(contracts.attentionReasons).toContain("resolve_consistency");
    expect(contracts.attentionReasons).toContain("resolve_validity_conflict");
    expect("resolve_consistency").not.toBe("resolve_validity_conflict");
  });

  it("keeps the tracked subset to exactly what the database enum admits", () => {
    // `needs_attention_item_opened` validates `attentionReason` against a
    // five-member enum inside Postgres (`202607170024:205`), and BYOK.4 spends no
    // migration widening it. The narrow type is what turns "would raise 22023 at
    // runtime" into "does not compile", so it is asserted rather than trusted.
    expect(contracts.trackedAttentionReasons).toEqual([
      "review_interpretation",
      "confirm_existing_candidates",
      "answer_existing_question",
      "retry_processing",
      "resolve_consistency",
    ]);

    // And the relationship between the two: the tracked list is a strict subset,
    // and these two are exactly what it excludes.
    //
    // `resolve_validity_conflict` joined that exclusion in 2N.4 for the same
    // reason `configure_ai_credential` was already in it, and the assertion is
    // the point: the DB enum still has five members, 2N.4 spent no migration, and
    // the conflict row therefore must not fire `needs_attention_item_opened`.
    // Widening the tracked list to "fix" a future compile error would ship a
    // runtime `22023`.
    const all = contracts.attentionReasons ?? [];
    const tracked = contracts.trackedAttentionReasons ?? [];
    const wider = new Set<string>(all);
    for (const reason of tracked) expect(wider.has(reason)).toBe(true);
    expect(all.filter((reason) => !tracked.includes(reason))).toEqual([
      "configure_ai_credential",
      "resolve_validity_conflict",
    ]);
  });

  it("exposes product-oriented actions and semantic message keys", () => {
    expect(contracts.dailyCycleActions).toEqual(expect.arrayContaining([
      "open_entry",
      "review_interpretation",
      "confirm_existing_candidates",
      "answer_existing_question",
      "retry_processing",
      "resolve_consistency",
      "complete_task",
      "wait_task",
      "resume_task",
      "reopen_task",
    ]));
    expect(contracts.dailyCycleMessageKeys).toEqual(expect.arrayContaining([
      "capture_saved",
      "capture_replayed",
      "retry_scheduled",
      "version_conflict",
      "action_failed",
    ]));
  });

  it("accepts a representative product DTO payload and rejects non-serializable values", () => {
    const receipt = {
      entryId: "entry-1",
      persisted: true,
      productState: "saved",
      messageKey: "capture_saved",
      safeHref: "/pt-BR/app/inbox/entry-1",
      replayed: false,
    };

    expect(contracts.isDailyCycleSerializable?.(receipt)).toBe(true);
    expect(contracts.isDailyCycleSerializable?.({ createdAt: new Date() })).toBe(false);
    expect(contracts.isDailyCycleSerializable?.({ retry: () => undefined })).toBe(false);
  });

  it("keeps every initial daily-cycle module independent from UI, Supabase, and database types", () => {
    const directory = path.resolve(process.cwd(), "src/features/daily-cycle");
    for (const fileName of ["contracts.ts", "action-result.ts", "copy.ts", "lifecycle.ts"]) {
      const filePath = path.join(directory, fileName);
      const source = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";

      expect(source).not.toBe("");
      expect(source).not.toMatch(/(?:from|import)\s*["'][^"']*(?:react|supabase|database\.types)[^"']*["']/i);
      expect(source).not.toMatch(/Database\s*\[\s*["']public["']\s*\]/);
      expect(source).not.toMatch(/from\s*["'][^"']*\.tsx?["']/i);
    }
  });
});
