import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { TASK_COMMAND_ACTIONS } from "@/features/task-commands/taxonomy";

/**
 * PRD 2E-COMMAND-010: the command prompt, its response schema and their two
 * version constants exist once, and are held there by a test rather than by a
 * comment.
 *
 * The extraction contract needed a cross-runtime *comparison*, because the
 * Deno worker cannot import `src/lib/ai` and had to re-declare the schema.
 * Command parsing has no worker counterpart — it runs synchronously in a
 * Server Action — so the honest form of the same guarantee is single
 * declaration, asserted over the whole tree, plus proof that no second
 * declaration has appeared in the Deno runtime. Building a Deno command parser
 * with no consumer, purely so a comparison test would have two sides, is the
 * speculative abstraction the hardening pass just finished deleting.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function sourceFiles(relativeRoot: string): string[] {
  const root = path.join(repoRoot, relativeRoot);
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((entry) => /\.(ts|tsx)$/.test(entry))
    .map((entry) => path.join(root, entry));
}

const productionFiles = [...sourceFiles("src"), ...sourceFiles("supabase/functions")].filter(
  (file) => !/\.test\.(ts|tsx)$/.test(file),
);

/** Repo-relative and POSIX-shaped, so an assertion reads the same on Windows. */
function relative(file: string): string {
  return path.relative(repoRoot, file).split(path.sep).join("/");
}

function declarationCount(pattern: RegExp): { count: number; files: string[] } {
  const files = productionFiles.filter((file) => pattern.test(readFileSync(file, "utf8")));
  return { count: files.length, files: files.map(relative) };
}

const provider = readFileSync(path.join(repoRoot, "src/lib/ai/openai-provider.ts"), "utf8");
const contract = readFileSync(path.join(repoRoot, "src/lib/ai/task-command-schema.ts"), "utf8");

describe("single declaration of the command contract", () => {
  it("declares the system prompt exactly once", () => {
    expect(declarationCount(/const taskCommandSystemPrompt\s*=/)).toEqual({
      count: 1,
      files: ["src/lib/ai/task-command-schema.ts"],
    });
  });

  it("declares the response schema exactly once", () => {
    expect(declarationCount(/const taskCommandProposalSchema\s*=/).count).toBe(1);
  });

  it("declares the prompt version exactly once", () => {
    expect(declarationCount(/TASK_COMMAND_PROMPT_VERSION\s*=/).count).toBe(1);
  });

  it("declares the strategy version exactly once", () => {
    expect(declarationCount(/TASK_COMMAND_STRATEGY_VERSION\s*=/).count).toBe(1);
  });

  it("declares the action taxonomy exactly once", () => {
    // A second array literal containing the verbs is how one taxonomy becomes
    // two, which is the defect Slice 2E.8 exists to prevent.
    expect(declarationCount(/const TASK_COMMAND_ACTIONS\s*=/)).toEqual({
      count: 1,
      files: ["src/features/task-commands/taxonomy.ts"],
    });
    const restated = productionFiles.filter((file) => {
      if (relative(file) === "src/features/task-commands/taxonomy.ts") return false;
      const code = readFileSync(file, "utf8");
      return code.includes('"complete_task"') && code.includes('"cancel_task"');
    });
    expect(restated.map(relative)).toEqual([]);
  });

  it("holds the prompt as a fixed literal with no interpolation site", () => {
    // A `${…}` inside the system prompt is the only way a task row could ever
    // reach it, so the absence of one is the structural half of §12.7.
    const literal = /const taskCommandSystemPrompt = `([\s\S]*?)`;/.exec(contract);
    expect(literal).not.toBeNull();
    expect(literal?.[1]).not.toContain("${");
  });

  it("derives the model's action enum from the taxonomy rather than restating it", () => {
    expect(contract).toContain("z.enum(TASK_COMMAND_ACTIONS)");
    expect(contract).toContain("z.enum(TASK_COMMAND_MODEL_UNSUPPORTED_REASONS)");
  });

  it("declares the prompt's distinctive content once, not merely its name", () => {
    // The name-based counts above are evaded by `taskCommandSystemPromptV2`.
    // A value-based check is what makes a second copy of the prompt visible,
    // the way the taxonomy check greps for the verbs themselves.
    const carriers = productionFiles.filter((file) =>
      readFileSync(file, "utf8").includes("You never see a task"),
    );
    expect(carriers.map(relative)).toEqual(["src/lib/ai/task-command-schema.ts"]);
  });

  it("ships no competing command contract in the Deno runtime", () => {
    const denoFiles = sourceFiles("supabase/functions").filter(
      (file) => !/\.test\.ts$/.test(file),
    );
    for (const file of denoFiles) {
      const code = readFileSync(file, "utf8");
      expect(code).not.toContain("taskCommandSystemPrompt");
      expect(code).not.toContain("TASK_COMMAND_");
    }
    // Phase 2E enqueues no jobs, so the worker has nothing to route.
    expect(declarationCount(/task_command/).files).not.toContain(
      "supabase/functions/process-jobs/index.ts",
    );
  });
});

describe("provider wiring", () => {
  it("imports the contract instead of re-declaring any part of it", () => {
    expect(provider).toContain('from "./task-command-schema"');
    expect(provider).toContain("taskCommandSystemPrompt");
    expect(provider).not.toMatch(/const taskCommandSystemPrompt\s*=/);
  });

  it("stamps the declared prompt and strategy versions on the result", () => {
    // 2E-COMMAND-012: `ai_usage_events` has no column for either, so the
    // proposal has to carry them out to whatever records the operation.
    expect(provider).toContain("promptVersion: TASK_COMMAND_PROMPT_VERSION");
    expect(provider).toContain("strategyVersion: TASK_COMMAND_STRATEGY_VERSION");
  });

  it("bounds the call before making it", () => {
    const method = provider.slice(provider.indexOf("async parseTaskCommand"));
    const guard = method.indexOf("classifyCommandText");
    const request = method.indexOf("this.client.responses.create");
    expect(guard).toBeGreaterThan(-1);
    expect(request).toBeGreaterThan(-1);
    // An out-of-bounds input is refused before it is billed.
    expect(guard).toBeLessThan(request);
    expect(method).toContain("max_output_tokens: TASK_COMMAND_MAX_OUTPUT_TOKENS");
  });

  it("parses the response itself rather than letting the SDK throw the schema error", () => {
    // `responses.parse` runs the schema eagerly inside the awaited promise, so
    // schema-violating output arrives as a ZodError indistinguishable from a
    // transport failure — misclassified as `provider_unavailable`, and with the
    // response (and its usage) already lost.
    // Bounded to this method: `answerFromKnowledge` legitimately still uses
    // `responses.parse`, where a throw carries no ledger consequence.
    const method = provider.slice(
      provider.indexOf("async parseTaskCommand"),
      provider.indexOf("async embedText"),
    );
    expect(method).not.toContain("this.client.responses.parse");
    const request = method.indexOf("this.client.responses.create");
    const validation = method.indexOf("taskCommandProposalSchema.safeParse", request);
    const returned = method.indexOf("proposal: parsed.data", request);
    expect(validation).toBeGreaterThan(request);
    expect(returned).toBeGreaterThan(validation);
  });

  it("keeps the billed usage on every failure after a paid response", () => {
    // 2E-PROVENANCE-002 and the worker's own rule in usage-order.test.ts.
    const method = provider.slice(
      provider.indexOf("async parseTaskCommand"),
      provider.indexOf("async embedText"),
    );
    const usage = method.indexOf("normalizeResponseUsage(response)");
    const request = method.indexOf("this.client.responses.create");
    expect(usage).toBeGreaterThan(request);
    for (const code of ["no_structured_output", "invalid_model_output"]) {
      const site = method.indexOf(code, usage);
      expect(site, code).toBeGreaterThan(-1);
      // Each post-response throw hands the caller what it was billed.
      expect(method.slice(site, site + 40), code).toContain("billed");
    }
  });

  it("throws only classified, content-free errors", () => {
    const method = provider.slice(
      provider.indexOf("async parseTaskCommand"),
      provider.indexOf("async embedText"),
    );
    const throws = method.match(/throw [^;]+/g) ?? [];
    expect(throws.length).toBeGreaterThan(0);
    for (const statement of throws) {
      expect(statement).toMatch(/throw new TaskCommandProviderError\((?:"[a-z_]+"|bound)(?:, billed)?\)/);
    }
    // A bare rethrow would carry the SDK's message, which quotes the request
    // body — the user's own command text.
    expect(method).not.toMatch(/catch \(\w+\)[\s\S]{0,80}throw \w+;/);
    // Nor may it be logged: `APIError.message` quotes that same body (§16.5).
    expect(method).not.toMatch(/console\./);
  });

  it("sends nothing but the fenced command text and the locale", () => {
    const method = provider.slice(
      provider.indexOf("async parseTaskCommand"),
      provider.indexOf("async embedText"),
    );
    const userTurn = method.slice(method.indexOf('role: "user"'), method.indexOf("text: {"));
    // The whole user turn is one builder call, so there is no concatenation
    // site through which a row could be appended later.
    expect(userTurn).toContain("buildTaskCommandUserMessage({ commandText, locale: input.locale })");
    expect(userTurn).not.toContain("+");
    expect(userTurn).not.toContain("${");
    // `input` carries exactly two fields, and only these two reach the model.
    expect(userTurn.match(/input\.\w+/g)).toEqual(["input.locale"]);
  });

  it("performs no domain write of its own, so the ledger cannot be written after one", () => {
    // 2E-PROVENANCE-002 orders the ledger before any dependent domain write.
    // The provider holds no Supabase client at all, so the only place that
    // ordering can be decided is the caller — by construction, not by care.
    const method = provider.slice(
      provider.indexOf("async parseTaskCommand"),
      provider.indexOf("async embedText"),
    );
    expect(method).not.toContain("supabase");
    expect(method).not.toContain(".rpc(");
    expect(provider).not.toContain("@supabase/supabase-js");
  });
});

describe("provider interface", () => {
  it("declares parseTaskCommand on the portable interface, not only on OpenAI", () => {
    const iface = readFileSync(path.join(repoRoot, "src/lib/ai/provider.ts"), "utf8");
    expect(iface).toContain("parseTaskCommand(input: TaskCommandParseInput)");
  });

  it("keeps the sixteen actions the PRDs tabulate", () => {
    // Fifteen from Phase 2E's §11.2, plus `clear_planned` from `2M-PLAN-002`.
    // A count rather than a list here on purpose: this file is about the
    // provider contract, and `taxonomy.test.ts` is where the membership and the
    // order are pinned.
    expect(TASK_COMMAND_ACTIONS).toHaveLength(16);
  });
});
