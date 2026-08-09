/**
 * `2K-EXPL-003` / `2K-EXPL-005` / `2K-EXPL-006`, T-2K-04 — the structural half
 * of slice 2K.5.
 *
 * ## The threat, stated the way the model states it
 *
 * Explaining what was left out is one refactor away from `search`'s forbidden
 * "3 hidden results". And "don't show a count" is not enough on its own,
 * because **a rate is a count over repeated queries**: an attacker — or an
 * over-sharing screenshot — can binary-search existence by rephrasing.
 *
 * So this guard is about the **payload**, not about the rendering. A count that
 * never renders today is a count somebody can render tomorrow.
 *
 * Modelled on `phase-2i-search-guard.test.ts:119`, which forbids the same shape
 * on the search surface.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(REPO, path), "utf8");
const code = (path: string) =>
  read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const EXPLANATION = "src/features/conversation-sources/explanation.ts";
const PANEL = "src/features/conversation-sources/explanation-panel.tsx";
const FEATURE = join("src", "features", "conversation-sources");

function featureFiles(): string[] {
  const root = join(REPO, FEATURE);
  const found: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) continue;
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
    found.push(relative(REPO, full).replace(/\\/g, "/"));
  }
  return found;
}

/**
 * The shapes a count would take.
 *
 * Matched as a **declared field**, so a quoted string in a refusal list is not
 * a violation — the distinction slice 2K.3 had to make when a guard fired on
 * the module written to satisfy it.
 */
const COUNT_SHAPED =
  /(?<!["'`])\b(hiddenCount|excludedCount|sensitiveCount|omittedCount|hasHidden|omitted|excludedTotal)\s*[:?]/;

/** The shapes model reasoning would take. */
const REASONING_SHAPED =
  /(?<!["'`])\b(prompt|reasoning|chainOfThought|rationale|scores?|similarity|threshold)\s*[:?]/;

describe("2K-EXPL-003: the disclosure payload carries no count", () => {
  it("declares exactly two boolean fields", () => {
    const schema = code(EXPLANATION).match(/export const answerExplanationSchema = z[\s\S]*?\.strict\(\);/)?.[0] ?? "";
    expect(schema, "answerExplanationSchema not found").not.toBe("");
    expect(schema).toMatch(/weakMatchesExcluded: z\.boolean\(\)/);
    expect(schema).toMatch(/archivedMemoriesExcluded: z\.boolean\(\)/);
    expect(schema).toMatch(/\.strict\(\)/);
    // Two booleans and nothing else: any other `z.` field would be a third.
    expect(schema.match(/z\.(boolean|string|number|array|object|enum)\(/g)).toHaveLength(2);
  });

  it("finds no count-shaped field anywhere in the feature", () => {
    for (const file of featureFiles()) {
      expect(COUNT_SHAPED.test(code(file)), file).toBe(false);
    }
  });

  it("fires on a planted count, and not on a quoted refusal", () => {
    for (const planted of [
      "const payload = { hiddenCount: 3 };",
      "type Explanation = { excludedCount?: number };",
      "const p = { hasHidden: true };",
    ]) {
      expect(COUNT_SHAPED.test(planted), planted).toBe(true);
    }
    expect(COUNT_SHAPED.test('const refused = ["hiddenCount", "excludedCount"] as const;')).toBe(false);
    expect(COUNT_SHAPED.test("const p = { weakMatchesExcluded: true };")).toBe(false);
  });
});

describe("2K-EXPL-006: no model reasoning is carried anywhere", () => {
  it("finds no prompt, reasoning, score or threshold field in the feature", () => {
    for (const file of featureFiles()) {
      expect(REASONING_SHAPED.test(code(file)), file).toBe(false);
    }
  });

  it("fires on a planted reasoning field", () => {
    for (const planted of [
      "const payload = { reasoning: trace };",
      "type P = { prompt: string };",
      "const p = { similarity: 0.42 };",
      "const p = { threshold: 0.2 };",
    ]) {
      expect(REASONING_SHAPED.test(planted), planted).toBe(true);
    }
  });
});

describe("2K-EXPL-005: sensitivity cannot reach the disclosure by any path", () => {
  it("builds the payload from four named counts, none of which is a classification", () => {
    const builder = code(EXPLANATION).match(/export function buildAnswerExplanation\([\s\S]*?\n\}/)?.[0] ?? "";
    expect(builder, "buildAnswerExplanation not found").not.toBe("");
    for (const field of ["retrieved", "aboveFloor", "aboveFloorMemories", "inForceMemories"]) {
      expect(builder).toContain(field);
    }
    expect(builder).not.toMatch(/sensitiv|classification|masked/i);
  });

  it("names no literal sensitivity level anywhere in the feature", () => {
    for (const file of featureFiles()) {
      expect(code(file), file)
        .not.toMatch(/["'`]highly_sensitive["'`]\s*[!=]==?|[!=]==?\s*["'`]highly_sensitive/);
    }
  });
});

describe("2K-EXPL-001: the panel is progressive and never blocks", () => {
  it("uses a native disclosure, closed by default", () => {
    const panel = code(PANEL);
    expect(panel).toMatch(/<details/);
    expect(panel).toMatch(/<summary>/);
    // No `open` attribute, and no state that could start expanded.
    expect(panel).not.toMatch(/\bopen\b\s*[=}]/);
    expect(panel).not.toMatch(/useState/);
  });

  it("draws nothing when there is nothing to disclose", () => {
    expect(code(PANEL)).toMatch(/if \(!hasDisclosure\(explanation\)\) return null;/);
  });
});

describe("2K-EXPL-007: the absent correction path is declared in code, not implied", () => {
  it("states the domain effect as a value the panel reads", () => {
    expect(code(EXPLANATION)).toMatch(/export function interpretationCorrectionHasDomainEffect\(\)/);
    expect(code(PANEL)).toMatch(/interpretationCorrectionHasDomainEffect\(\)/);
  });

  it("offers no control that would record nothing", () => {
    // A button that quietly does nothing is the failure this requirement
    // exists to prevent, so the panel has none at all.
    expect(code(PANEL)).not.toMatch(/<form\b|<button\b|formAction|type="submit"/);
  });
});
