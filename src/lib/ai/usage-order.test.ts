import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("AI usage ledger ordering", () => {
  it("records file analysis before parsing or persisting provider output", () => {
    const worker = source("../../../supabase/functions/process-jobs/attachment.ts");
    const providerSuccess = worker.indexOf("const responseJson = await openaiResponse.json()");
    const usageRecord = worker.indexOf('service.rpc("record_ai_usage"', providerSuccess);
    const outputParsing = worker.indexOf("JSON.parse(outputText(responseJson))", providerSuccess);

    expect(providerSuccess).toBeGreaterThan(-1);
    expect(usageRecord).toBeGreaterThan(providerSuccess);
    expect(usageRecord).toBeLessThan(outputParsing);
  });

  it("records entry extraction before parsing or persisting provider output", () => {
    const worker = source("../../../supabase/functions/process-jobs/entry.ts");
    const providerSuccess = worker.indexOf("const responseJson = await openaiResponse.json()");
    const usageRecord = worker.indexOf('p_operation: "capture_extraction"', providerSuccess);
    const outputParsing = worker.indexOf("JSON.parse(outputText(responseJson))", providerSuccess);

    expect(providerSuccess).toBeGreaterThan(-1);
    expect(usageRecord).toBeGreaterThan(providerSuccess);
    expect(usageRecord).toBeLessThan(outputParsing);
  });
});
