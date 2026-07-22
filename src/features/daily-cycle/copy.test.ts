import { describe, expect, it, vi } from "vitest";

type CopyModule = {
  dailyCycleLocales?: readonly string[];
  dailyCycleCopy?: Record<string, {
    productStates: Record<string, { label: string; description: string }>;
    attentionReasons: Record<string, { title: string; description: string }>;
    messages: Record<string, string>;
  }>;
};

const copyPath = `./${"copy"}.ts`;
const copy = await vi.importActual<CopyModule>(copyPath).catch(() => ({})) as CopyModule;

describe("daily cycle copy", () => {
  it("provides typed PT-BR and English copy for every product state", () => {
    expect(copy.dailyCycleLocales).toEqual(["pt-BR", "en"]);

    for (const locale of ["pt-BR", "en"]) {
      for (const state of ["saved", "organizing", "needs_attention", "ready", "could_not_organize"]) {
        expect(copy.dailyCycleCopy?.[locale]?.productStates[state]).toEqual({
          label: expect.any(String),
          description: expect.any(String),
        });
      }
    }
  });

  it("provides human explanations for every attention reason in both locales", () => {
    for (const locale of ["pt-BR", "en"]) {
      for (const reason of [
        "review_interpretation",
        "confirm_existing_candidates",
        "answer_existing_question",
        "retry_processing",
        "resolve_consistency",
      ]) {
        expect(copy.dailyCycleCopy?.[locale]?.attentionReasons[reason]).toEqual({
          title: expect.any(String),
          description: expect.any(String),
        });
      }
    }
  });

  it("keeps action-result copy semantic rather than exposing internal failures", () => {
    expect(copy.dailyCycleCopy?.["pt-BR"]?.messages).toMatchObject({
      capture_saved: "Salvo. A organização foi solicitada.",
      retry_scheduled: expect.any(String),
      version_conflict: expect.any(String),
      action_failed: expect.any(String),
    });
    expect(copy.dailyCycleCopy?.en?.messages).toMatchObject({
      capture_saved: "Saved. Organization was queued.",
      retry_scheduled: expect.any(String),
      version_conflict: expect.any(String),
      action_failed: expect.any(String),
    });
  });

  it("frames candidate attention as resolving suggestions, not confirming every task", () => {
    expect(copy.dailyCycleCopy?.["pt-BR"]?.attentionReasons.confirm_existing_candidates).toEqual({
      title: "Decida sobre as sugestões",
      description: "Escolha o destino de cada sugestão pendente.",
    });
    expect(copy.dailyCycleCopy?.en?.attentionReasons.confirm_existing_candidates).toEqual({
      title: "Resolve the suggestions",
      description: "Choose what should happen to each pending suggestion.",
    });
  });
});
