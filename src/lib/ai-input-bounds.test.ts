import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AI_INPUT_BOUNDS, type AIInputBound } from "./ai-input-bounds";

/**
 * SH-QUOTA-007 — every AI-bound input has a declared bound, and the bound is
 * where the input is.
 *
 * The failure this guards is not "somebody removed a `.max()`". It is the
 * quieter one: a bound that exists at its call site as an anonymous literal,
 * which nobody can enumerate and nothing notices when it moves. So each case
 * below names one bound and reads back the site that enforces it.
 *
 * `capture` is enforced twice — in Zod and in `capture_entry_async` — because a
 * direct RPC call never touches the schema. The pair must agree, and the last
 * case is what keeps them agreeing.
 */

const REPO = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(REPO, relativePath), "utf8").replace(/\r\n/g, "\n");
}

/** Where each declared bound is enforced, and the text that proves it. */
const ENFORCEMENT: Record<AIInputBound, { file: string; contains: string }> = {
  captureContent: {
    file: "src/features/capture/schema.ts",
    contains: "max(AI_INPUT_BOUNDS.captureContent",
  },
  chatQuestion: {
    file: "src/features/chat/actions.ts",
    contains: "max(AI_INPUT_BOUNDS.chatQuestion)",
  },
  memoryContent: {
    file: "src/features/memories/schema.ts",
    contains: "max(AI_INPUT_BOUNDS.memoryContent)",
  },
  entityName: {
    file: "src/features/operations/actions.ts",
    contains: "max(AI_INPUT_BOUNDS.entityName)",
  },
  workItemTitle: {
    file: "src/features/operations/actions.ts",
    contains: "max(AI_INPUT_BOUNDS.workItemTitle)",
  },
  fileExtractedText: {
    file: "supabase/functions/process-jobs/attachment.ts",
    contains: ".slice(0, 100000)",
  },
  fileDescription: {
    file: "supabase/functions/process-jobs/attachment.ts",
    contains: ".slice(0, 4000)",
  },
};

describe("SH-QUOTA-007: each declared bound is enforced where its input is read", () => {
  it("the declared set and the enforcement map are the same set", () => {
    // A bound declared and never enforced is decoration; an input enforced and
    // never declared is the state this module exists to end.
    expect(Object.keys(ENFORCEMENT).sort()).toEqual(Object.keys(AI_INPUT_BOUNDS).sort());
  });

  it.each(Object.keys(ENFORCEMENT) as AIInputBound[])("%s is enforced", (bound) => {
    const { file, contains } = ENFORCEMENT[bound];
    expect(read(file), `${bound} must be enforced in ${file}`).toContain(contains);
  });

  it("every bound is a positive integer", () => {
    for (const [name, value] of Object.entries(AI_INPUT_BOUNDS)) {
      expect(Number.isInteger(value), `${name} must be an integer`).toBe(true);
      expect(value, `${name} must be positive`).toBeGreaterThan(0);
    }
  });

  it("the Deno worker's file bounds match the declaration", () => {
    // `supabase/functions` cannot import this module, so the worker keeps
    // literals and this is the link — the `extraction-parity.test.ts` pattern.
    const worker = read("supabase/functions/process-jobs/attachment.ts");
    expect(worker).toContain(`.slice(0, ${AI_INPUT_BOUNDS.fileExtractedText})`);
    expect(worker).toContain(`.slice(0, ${AI_INPUT_BOUNDS.fileDescription})`);
  });

  it("the capture bound is the same number the database enforces", () => {
    // The RPC is the only enforcement a direct PostgREST caller meets, so a
    // schema loosened past it would be a bound the product only appears to have.
    const wiring = read("supabase/migrations/202608040071_account_lifecycle_wiring.sql");
    const match = /char_length\(normalized_content\) not between 1 and (\d+)/.exec(wiring);
    expect(match, "capture_entry_async must still bound its content").not.toBeNull();
    expect(Number(match![1])).toBe(AI_INPUT_BOUNDS.captureContent);
  });
});
