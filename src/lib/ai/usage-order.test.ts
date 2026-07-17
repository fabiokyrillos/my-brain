import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("AI usage ledger ordering", () => {
  it("records capture extraction before interpretation persistence", () => {
    const capture = source("../../features/capture/actions.ts");
    const providerSuccess = capture.indexOf("const result = await provider.extractEntry");
    const usageRecord = capture.indexOf("operation: \"capture_extraction\"");
    const domainPersistence = capture.indexOf("persist_entry_interpretation");

    expect(providerSuccess).toBeGreaterThan(-1);
    expect(usageRecord).toBeGreaterThan(providerSuccess);
    expect(usageRecord).toBeLessThan(domainPersistence);
  });

  it("records capture embedding before vector persistence", () => {
    const capture = source("../../features/capture/actions.ts");
    const providerSuccess = capture.indexOf("const embedded = await provider.embedText");
    const usageRecord = capture.indexOf("operation: \"semantic_search\"", providerSuccess);
    const domainPersistence = capture.indexOf('.from("entry_embeddings")', providerSuccess);

    expect(providerSuccess).toBeGreaterThan(-1);
    expect(usageRecord).toBeGreaterThan(providerSuccess);
    expect(usageRecord).toBeLessThan(domainPersistence);
  });

  it("records file analysis before parsing or persisting provider output", () => {
    const worker = source("../../../supabase/functions/process-jobs/index.ts");
    const providerSuccess = worker.indexOf("const responseJson = await openaiResponse.json()");
    const usageRecord = worker.indexOf('service.rpc("record_ai_usage"', providerSuccess);
    const outputParsing = worker.indexOf("JSON.parse(outputText(responseJson))", providerSuccess);

    expect(providerSuccess).toBeGreaterThan(-1);
    expect(usageRecord).toBeGreaterThan(providerSuccess);
    expect(usageRecord).toBeLessThan(outputParsing);
  });
});
