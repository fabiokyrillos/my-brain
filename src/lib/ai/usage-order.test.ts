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
    const outputValidation = worker.indexOf("validateExtraction(", providerSuccess);

    expect(providerSuccess).toBeGreaterThan(-1);
    expect(usageRecord).toBeGreaterThan(providerSuccess);
    expect(usageRecord).toBeLessThan(outputParsing);
    // Rejecting invalid output must not skip the cost that was already
    // incurred: the ledger write stays ahead of validation too.
    expect(outputValidation).toBeGreaterThan(-1);
    expect(usageRecord).toBeLessThan(outputValidation);
  });

  it("preserves the embedding provider request id so retries cannot double-record cost", () => {
    const worker = source("../../../supabase/functions/process-jobs/entry.ts");
    const embeddingCall = worker.indexOf("https://api.openai.com/v1/embeddings");
    const requestIdRead = worker.indexOf('response.headers.get("x-request-id")', embeddingCall);
    const usageRecord = worker.indexOf('p_operation: "semantic_search"', embeddingCall);

    expect(embeddingCall).toBeGreaterThan(-1);
    expect(requestIdRead).toBeGreaterThan(embeddingCall);
    expect(requestIdRead).toBeLessThan(usageRecord);
    // Scoped to the embedding block rather than the whole file: another RPC may
    // legitimately pass a literal null for an unrelated parameter later.
    const embeddingBlock = worker.slice(embeddingCall, worker.indexOf("entry_embeddings", embeddingCall));
    expect(embeddingBlock).not.toContain("p_provider_request_id: null");
  });
});
