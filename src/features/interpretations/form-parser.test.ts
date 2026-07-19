import { describe, expect, it } from "vitest";
import { parseCorrectionFormData } from "./form-parser";

function baseForm() {
  const form = new FormData();
  form.set("entryId", "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6");
  form.set("expectedVersion", "3");
  form.set("operationKey", "6118fb25-2f80-432a-aa96-0e76d924862e");
  form.set("summary", "Resumo corrigido");
  form.append("concepts", "person_note");
  form.append("concepts", "project_note");
  form.set("occurredAt", "2026-07-17T14:00:00.000Z");
  form.append("extractedDate", JSON.stringify({ value: "2026-07-18", label: "prazo" }));
  form.append("entityLink", JSON.stringify({ entityType: "person", entityId: "ea9f441a-aa22-47bc-b8e7-cfe2209f5987", mention: "Marina", confidence: 1 }));
  form.append("pendingQuestion", JSON.stringify({ question: "Qual projeto?", reason: "Projeto ambíguo", confidence: 0.52 }));
  form.set("summaryClassification", "fact");
  form.set("conceptsClassification", "interpretation");
  form.set("occurredAtClassification", "fact");
  form.set("entitiesClassification", "inference");
  form.set("recordOnly", "on");
  form.set("correctionReason", "A pessoa confirmou os dados.");
  return form;
}

describe("parseCorrectionFormData", () => {
  it("produces the bounded revision contract from repeated form fields", () => {
    const result = parseCorrectionFormData(baseForm());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      expectedVersion: 3,
      summary: "Resumo corrigido",
      concepts: ["person_note", "project_note"],
      recordOnly: true,
      correctionReason: "A pessoa confirmou os dados.",
      classifications: { summary: "fact", concepts: "interpretation", occurredAt: "fact", entities: "inference" },
    });
    expect(result.data.extractedDates).toEqual([{ value: "2026-07-18", label: "prazo" }]);
    expect(result.data.entityLinks[0]).toMatchObject({ entityType: "person", mention: "Marina" });
    expect(result.data.pendingQuestions[0]?.question).toBe("Qual projeto?");
  });

  it("rejects malformed hidden JSON and invalid optimistic-concurrency input", () => {
    const form = baseForm();
    form.set("expectedVersion", "not-a-version");
    form.set("entityLink", "{not-json}");

    const result = parseCorrectionFormData(form);

    expect(result.success).toBe(false);
  });
});
