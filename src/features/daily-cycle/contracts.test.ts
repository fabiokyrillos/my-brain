import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

type ContractsModule = {
  productStates?: readonly string[];
  attentionReasons?: readonly string[];
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

  it("defines only the five supported attention reasons", () => {
    expect(contracts.attentionReasons).toEqual([
      "review_interpretation",
      "confirm_existing_candidates",
      "answer_existing_question",
      "retry_processing",
      "resolve_consistency",
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
