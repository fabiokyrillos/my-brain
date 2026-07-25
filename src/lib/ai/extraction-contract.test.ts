import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The extraction contract lives in two runtimes: `src/lib/ai` is the source of
// truth, and the Deno worker re-declares the parts it cannot import (ADR-021 —
// `openai-provider.ts` starts with `import "server-only"`, which throws outside
// a react-server bundler).
//
// `extraction-parity.test.ts` already holds the two *schemas* together
// behaviourally. This suite closes the half the Pre-2E hardening left open
// (architecture review H4): the prompt text and the two version constants, and
// the order of the worker's own post-provider pipeline. Both were "kept in
// sync" by comment only, and a comment cannot fail a build.

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const nodeProvider = source("./openai-provider.ts");
const denoWorker = source("../../../supabase/functions/process-jobs/entry.ts");

/** The body of a single-backtick template literal assigned to `name`. */
function templateLiteral(code: string, name: string): string {
  const match = new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`).exec(code);
  if (!match) throw new Error(`Template literal ${name} not found`);
  return match[1];
}

function stringConstant(code: string, name: string): string {
  const match = new RegExp(`${name} = "([^"]*)"`).exec(code);
  if (!match) throw new Error(`Constant ${name} not found`);
  return match[1];
}

describe("Node/Deno extraction prompt parity", () => {
  it("ships the identical system prompt in both runtimes", () => {
    expect(templateLiteral(denoWorker, "SYSTEM_PROMPT"))
      .toBe(templateLiteral(nodeProvider, "systemPrompt"));
  });

  it("ships the identical prompt version in both runtimes", () => {
    expect(stringConstant(denoWorker, "EXTRACTION_PROMPT_VERSION"))
      .toBe(stringConstant(nodeProvider, "EXTRACTION_PROMPT_VERSION"));
  });

  it("ships the identical strategy version in both runtimes", () => {
    expect(stringConstant(denoWorker, "EXTRACTION_STRATEGY_VERSION"))
      .toBe(stringConstant(nodeProvider, "EXTRACTION_STRATEGY_VERSION"));
  });

  it("states the instant format the validator requires", () => {
    // The provider schema types these fields as bare strings and Structured
    // Outputs does not enforce `format`, so the prompt is the only place the
    // requirement can be stated to the model at all.
    const prompt = templateLiteral(nodeProvider, "systemPrompt");
    expect(prompt).toContain("occurredAt and dueAt");
    expect(prompt).toMatch(/timezone designator/i);
  });
});

describe("worker extraction pipeline order", () => {
  const providerSuccess = denoWorker.indexOf("const responseJson = await openaiResponse.json()");
  const parsing = denoWorker.indexOf("JSON.parse(outputText(responseJson))", providerSuccess);
  const normalization = denoWorker.indexOf("normalizeExtractionInstants(", providerSuccess);
  const validation = denoWorker.indexOf("validateExtraction(", providerSuccess);

  it("normalizes under-specified instants after parsing", () => {
    expect(parsing).toBeGreaterThan(-1);
    expect(normalization).toBeGreaterThan(parsing);
  });

  it("normalizes before validating, so a widened value is the one validated", () => {
    expect(validation).toBeGreaterThan(-1);
    expect(normalization).toBeGreaterThan(-1);
    expect(normalization).toBeLessThan(validation);
  });

  it("normalizes in the entry's own timezone rather than a fixed zone", () => {
    // The same resolution the prompt is given. A hardcoded zone would move
    // every deadline for a user outside it.
    const call = denoWorker.slice(normalization, denoWorker.indexOf(")", normalization) + 1);
    expect(call).toContain("timezone");
  });
});
