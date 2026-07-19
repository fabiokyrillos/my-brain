import { interpretationPatchSchema } from "./schema";

function parseJsonFields(formData: FormData, name: string) {
  return formData.getAll(name).map((value) => {
    if (typeof value !== "string") throw new Error(`Invalid ${name}.`);
    return JSON.parse(value) as unknown;
  });
}

export function parseCorrectionFormData(formData: FormData) {
  try {
    return interpretationPatchSchema.safeParse({
      entryId: formData.get("entryId"),
      expectedVersion: Number(formData.get("expectedVersion")),
      operationKey: formData.get("operationKey"),
      summary: formData.get("summary"),
      concepts: formData.getAll("concepts"),
      occurredAt: formData.get("occurredAt"),
      extractedDates: parseJsonFields(formData, "extractedDate"),
      entityLinks: parseJsonFields(formData, "entityLink"),
      classifications: {
        summary: formData.get("summaryClassification"),
        concepts: formData.get("conceptsClassification"),
        occurredAt: formData.get("occurredAtClassification"),
        entities: formData.get("entitiesClassification"),
      },
      pendingQuestions: parseJsonFields(formData, "pendingQuestion"),
      correctionReason: formData.get("correctionReason") || undefined,
      recordOnly: formData.get("recordOnly") === "on",
    });
  } catch {
    return interpretationPatchSchema.safeParse({});
  }
}
