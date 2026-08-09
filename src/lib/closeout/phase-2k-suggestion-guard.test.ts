/**
 * `2K-SUGG-002` / `2K-SUGG-003` / `2K-SUGG-005`, T-2K-10 — the structural half
 * of slice 2K.6.
 *
 * ## The threat, stated the way the model states it
 *
 * "Contextual suggestions derived from current state" invites a **model call
 * per page load**. That spends the user's own BYOK credential on something they
 * did not ask for, on every render of the primary surface — and caching would
 * reduce the cost without making an unrequested billed call legitimate.
 *
 * So the property is not "the suggestions are cheap"; it is that the module is
 * **incapable** of costing anything. That is what this guard asserts, and it is
 * the same reasoning ADR-094 applied when it refused to rank priorities with a
 * model call.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(REPO, path), "utf8");
const code = (path: string) =>
  read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SUGGESTIONS = "src/features/conversation-cards/suggestions.ts";
const ROW = "src/features/conversation-cards/suggestion-row.tsx";
const PAGE = "src/app/[locale]/app/chat/page.tsx";

/** Anything that would make a suggestion cost money or a rate-limit slot. */
const COSTS_SOMETHING =
  /(?<!["'`])\b(getAIProvider|recordAIUsage|admitRateLimitedOperation|openAiGate|answerFromKnowledge|embedText)\b/;

describe("2K-SUGG-002: the suggestions module cannot cost anything", () => {
  it("constructs no provider, records no usage, requests no rate-limit slot", () => {
    for (const file of [SUGGESTIONS, ROW]) {
      expect(COSTS_SOMETHING.test(code(file)), file).toBe(false);
    }
  });

  it("fires on a planted violation, so the absence above means something", () => {
    for (const planted of [
      "const provider = getAIProvider({ credential });",
      "await recordAIUsage(supabase, { operation: 'chat' });",
      "const admission = await admitRateLimitedOperation(...);",
    ]) {
      expect(COSTS_SOMETHING.test(planted), planted).toBe(true);
    }
    expect(COSTS_SOMETHING.test("const suggestions = deriveConversationSuggestions(inputs);")).toBe(false);
  });

  it("is a pure module: no client, no fetch, no async", () => {
    // A pure function of its input cannot become expensive by accident. An
    // `async` export would be the first sign it had started reaching for
    // something.
    const source = code(SUGGESTIONS);
    expect(source).not.toMatch(/\basync\b|\bawait\b|\bfetch\(|createClient|supabase/);
  });

  it("has no confidence contract and no fail-closed path, because it needs none", () => {
    expect(code(SUGGESTIONS)).not.toMatch(/confidence|failClosed|fallback/i);
  });
});

describe("2K-SUGG-001: the cap is in the module, not at the call site", () => {
  it("declares the ceiling and applies it in the derivation", () => {
    const source = code(SUGGESTIONS);
    expect(source).toMatch(/export const MAX_SUGGESTIONS = 3;/);
    expect(source).toMatch(/\.slice\(0, MAX_SUGGESTIONS\)/);
  });

  it("does not leave the cap to the renderer", () => {
    // A cap applied where the list is drawn holds until somebody draws it
    // somewhere else.
    expect(code(ROW)).not.toMatch(/slice\(0,\s*3\)|MAX_SUGGESTIONS/);
  });
});

describe("2K-SUGG-005: a name can never reach telemetry", () => {
  it("narrows through a function whose return type has no field for one", () => {
    const narrowed = code(SUGGESTIONS)
      .match(/export function suggestionTelemetryCategory\([\s\S]*?\n\}/)?.[0] ?? "";
    expect(narrowed, "suggestionTelemetryCategory not found").not.toBe("");
    expect(narrowed).toMatch(/\{ category: suggestion\.category \}/);
    expect(narrowed).not.toMatch(/\bname\b|\btext\b|\bid\b/);
  });

  it("keeps the category a closed enum", () => {
    expect(code(SUGGESTIONS)).toMatch(/export const SUGGESTION_CATEGORIES = \["person", "project"\] as const;/);
  });

  it("produces no rendered sentence in the derivation module", () => {
    // The sentence is built in `copy.ts`, from a category and a name the
    // derivation kept apart. A module that produced strings would produce one
    // thing a telemetry event could log whole.
    expect(code(SUGGESTIONS)).not.toMatch(/`[^`]*\$\{[^}]*name[^}]*\}/);
  });
});

describe("2K-SUGG-003: the hard-coded example and its ternary are gone", () => {
  it("no longer names a person the user may not have", () => {
    const page = read(PAGE);
    expect(page).not.toContain("Marina");
    expect(page).not.toMatch(/Experimente:|Try: /);
  });

  it("renders the derived suggestions instead", () => {
    expect(code(PAGE)).toMatch(/<SuggestionRow/);
    expect(code(PAGE)).toMatch(/deriveConversationSuggestions\(/);
  });

  it("makes no provider call on the page that renders them", () => {
    // The page is where a model call would be added if anybody wanted one.
    expect(COSTS_SOMETHING.test(code(PAGE))).toBe(false);
  });

  it("renders nothing rather than a placeholder when there is nothing to say", () => {
    expect(code(ROW)).toMatch(/if \(suggestions\.length === 0\) return null;/);
  });

  it("offers no control that would ask on the user's behalf", () => {
    // A suggestion says what the user *could* type. A control that submitted it
    // would put words in their mouth, and the composer is one field away.
    expect(code(ROW)).not.toMatch(/<form\b|<button\b|formAction|type="submit"|onClick/);
  });
});
