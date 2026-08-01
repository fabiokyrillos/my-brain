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

  it("defines only the six supported attention reasons", () => {
    expect(contracts.attentionReasons).toEqual([
      "review_interpretation",
      "confirm_existing_candidates",
      "answer_existing_question",
      "retry_processing",
      "resolve_consistency",
      "configure_ai_credential",
    ]);
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
    // and `configure_ai_credential` is exactly what it excludes.
    const all = contracts.attentionReasons ?? [];
    const tracked = contracts.trackedAttentionReasons ?? [];
    const wider = new Set<string>(all);
    for (const reason of tracked) expect(wider.has(reason)).toBe(true);
    expect(all.filter((reason) => !tracked.includes(reason))).toEqual(["configure_ai_credential"]);
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
