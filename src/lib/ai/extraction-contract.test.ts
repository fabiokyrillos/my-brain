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

/**
 * The entity taxonomy, and why the prompt is where it has to live.
 *
 * Measured on the owner's own reported record (prompt version
 * `2026-07-25.1`): the entry *"Preciso desenvolver um relatório de Sweepstakes
 * pra Garo. Ele faz parte da Royal Caribbean."* produced `people: []`,
 * `organizations: ["Royal Caribbean"]` and — the second half of the same defect
 * — `projects: ["Relatório de Sweepstakes para Garo"]`, which is the task title.
 *
 * Nothing downstream could have recovered from that. `people` is the only input
 * to `derivePendingPersonCandidates`, so an empty array is a person suggestion
 * that never existed rather than one that was filtered. The four array names
 * were the model's *only* signal about what belonged in each: Structured
 * Outputs carries no per-field description, and the prompt said nothing.
 *
 * These assertions are deliberately about **meaning stated**, not about
 * classification achieved — a unit test cannot prove what a model returns.
 * `src/lib/ai/extraction-classification.remote.test.ts` measures that against
 * the live provider, using this same prompt read from the worker source.
 */
describe("the extraction prompt separates people, organizations, projects and contexts", () => {
  const prompt = () => templateLiteral(nodeProvider, "systemPrompt");

  it("defines each of the four entity fields rather than leaving the field name to speak", () => {
    const body = prompt();
    for (const field of ["people:", "organizations:", "projects:", "contexts:"]) {
      expect(body, `${field} is never defined for the model`).toContain(`- ${field}`);
    }
  });

  it("says a person may be one the user has never registered", () => {
    // The failure this closes: `Known user context` lists the owner's existing
    // people, and an empty or non-matching list read as "return nobody".
    const body = prompt();
    expect(body).toMatch(/named for the first time/i);
    expect(body, "the prompt does not say what Known user context is not")
      .toMatch(/not the set of people you are allowed to return/i);
  });

  it("forbids the task title becoming a project", () => {
    expect(prompt(), "the projects/task-title line is gone").toMatch(/task title is never a project/i);
  });

  it("says a person attached to an organization yields both, one per field", () => {
    expect(prompt()).toMatch(/attaches a person to an organization produces both/i);
  });

  it("keeps evidence-only extraction, no invented names, and ambiguity as a question", () => {
    // The three guarantees the new section must not have traded away for recall.
    const body = prompt();
    expect(body).toContain("Never invent names");
    expect(body).toContain("Evidence must be a short phrase grounded in the entry.");
    expect(body).toMatch(/add one short pending question/i);
    expect(body, "the taxonomy examples must send an unnamed individual to a question")
      .toMatch(/add a pending question rather than choosing a name/i);
  });

  it("teaches the boundary with both a positive and a negative example", () => {
    const body = prompt();
    const examples = body.slice(body.indexOf("Examples of that line:"));
    expect(examples, "the worked examples are gone").not.toBe("");
    // Positive: one sentence that must yield a person *and* an organization.
    // `\p{L}` rather than `\w`: the examples are Portuguese, and `\w` does not
    // match an accented letter — a name like `Túlio` would fail this on its
    // spelling rather than on the contract.
    expect(examples).toMatch(/people: \p{L}+\. organizations: \p{L}+/u);
    // Negative: one sentence that names a company and must yield no person.
    expect(examples).toMatch(/people: none, because naming a company names no person/);
    // Negative: one sentence with no individual named at all.
    expect(examples).toMatch(/people: none, because no individual is named/);
  });

  /**
   * The control that keeps this a contract and not a lookup table.
   *
   * The owner asked for semantic instruction, explicitly *not* a heuristic for
   * the name that failed. It also protects the remote lane: if the reported
   * sentence were quoted here, that lane would be reading the prompt back to
   * itself and would pass on a build that generalized to nothing.
   */
  it("carries no example lifted from the record that exposed the defect", () => {
    const body = prompt().toLowerCase();
    for (const token of ["garo", "royal caribbean", "sweepstakes"]) {
      expect(body, `the prompt hardcodes "${token}" instead of teaching the rule`)
        .not.toContain(token);
    }
  });
});
