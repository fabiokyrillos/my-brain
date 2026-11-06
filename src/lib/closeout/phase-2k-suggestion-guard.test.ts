/**
 * `2K-SUGG-002` / `2K-SUGG-003` / `2K-SUGG-005`, T-2K-10 — the structural half
 * of slice 2K.6, carried forward by Life Brain B.7.
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
 *
 * ## What Life Brain B.7 changed here, and what it did not
 *
 * Two assertions in this file were rewritten, and both deserve to be read as
 * deliberate rather than as a guard bent to fit new code.
 *
 * 1. **The vocabulary grew from two names to eight.** The property was never
 *    "there are two categories" — it was "the category is a **closed** enum, so
 *    telemetry cannot carry anything else". The list below is still exact and
 *    still ordered, so adding a ninth category is still a visible edit here.
 *
 * 2. **The row may now hold a control.** The old assertion refused `<button`
 *    and `onClick` outright, from a sentence in `suggestion-row.tsx` saying a
 *    control "would put words in their mouth and turn a hint into an action".
 *    The owner read that surface on 5 November 2026 and asked for the half the
 *    sentence was not about: *"para eu clicar, e já preencher isso embaixo. Mas
 *    lembre que é preencher, não enviar."*
 *
 *    So the refusal is now the sharper one it should always have been: **no path
 *    from a suggestion to a submission.** No `<form>`, no `formAction`, no
 *    `type="submit"`, no `requestSubmit`. A control that writes into a field and
 *    stops is permitted, and is required to say so with `type="button"`.
 *
 *    The weaker form of this edit — leaving the regex alone and moving the
 *    button into a file the regex does not read — would have kept this file
 *    green while deleting the property. The chip's file is therefore **named
 *    below** and held to the same rule.
 *
 * 3. **A file that can fetch now exists.** `suggestion-sources.ts` reads the
 *    rows the derivation orders, which is exactly where somebody would later add
 *    "and ask the model to rank them". It is held to the no-cost rule too.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(REPO, path), "utf8");
const code = (path: string) =>
  read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SUGGESTIONS = "src/features/conversation-cards/suggestions.ts";
const SOURCES = "src/features/conversation-cards/suggestion-sources.ts";
const ROW = "src/features/conversation-cards/suggestion-row.tsx";
const CHIP = "src/features/conversation-cards/seed-chip.tsx";
const SEED = "src/features/capture/composer-seed.tsx";
const PAGE = "src/app/[locale]/app/chat/page.tsx";

/** Anything that would make a suggestion cost money or a rate-limit slot. */
const COSTS_SOMETHING =
  /(?<!["'`])\b(getAIProvider|recordAIUsage|admitRateLimitedOperation|openAiGate|answerFromKnowledge|embedText)\b/;

/** Any path from a chip to a submitted turn. */
const SUBMITS = /<form\b|formAction|type="submit"|requestSubmit/;

describe("2K-SUGG-002: the suggestions module cannot cost anything", () => {
  it("constructs no provider, records no usage, requests no rate-limit slot", () => {
    for (const file of [SUGGESTIONS, SOURCES, ROW, CHIP, SEED]) {
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

  it("keeps the reading in the file that is allowed to read, and only there", () => {
    /*
      Life Brain B.7. The derivation cannot fetch, so the rows arrive from
      `suggestion-sources.ts`. That file is the one place a query may live, and
      naming it here is what stops the next slice from "just adding a small
      read" to the pure module instead.
    */
    expect(code(SOURCES)).toMatch(/import "server-only";/);
    expect(code(SOURCES)).toMatch(/loadSuggestionInputs/);
    // The page asks the reader, never the database, for a suggestion input.
    expect(code(PAGE)).toMatch(/loadSuggestionInputs\(/);
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
    expect(code(CHIP)).not.toMatch(/slice\(0,\s*3\)|MAX_SUGGESTIONS/);
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

  it("keeps the category a closed enum, in its declared precedence order", () => {
    /*
      Life Brain B.7: eight names where there were two. The pin is exact for the
      same reason it always was — an open union is a union a name could join —
      and it is *ordered* because the order IS the urgency rule the derivation
      reads, so a reordering is a behaviour change and belongs in a diff here.
    */
    expect(code(SUGGESTIONS)).toMatch(
      /export const SUGGESTION_CATEGORIES = \[\s*"overdue_task",\s*"due_today",\s*"reminder_soon",\s*"birthday_soon",\s*"open_question",\s*"unreviewed_entry",\s*"person",\s*"project",\s*\] as const;/,
    );
  });

  it("reports every category, and narrows nothing now that the chain admits them", () => {
    /*
      This assertion was the inverse until `202611060108` was spent. It read
      "reports only the categories the deployed vocabulary accepts", and it
      existed to stop `REPORTABLE_SUGGESTION_CATEGORIES` being deleted as dead
      code *before* the migration: `record_product_event` validated this
      property against `array['person', 'project']`, the writer is fail-open, so
      a dated category would have been swallowed and the surface would have
      looked instrumented while reporting nothing.

      The owner authorized the migration on 6 November 2026 (ADR-161) and it
      landed first, in the same pull request. So the narrowing is gone, and its
      absence is asserted rather than remembered — a filter that comes back
      would silently stop reporting six categories again, which is precisely the
      state this line used to describe. `phase-2m-telemetry-guard.test.ts` holds
      the other end: the chain must admit every category the derivation declares.
    */
    expect(code(SUGGESTIONS)).not.toMatch(/export const REPORTABLE_SUGGESTION_CATEGORIES/);
    expect(code(ROW)).not.toMatch(/\.filter\(/);
    expect(code(ROW)).toMatch(/categories=\{suggestions\.map\(\(suggestion\) => suggestion\.category\)\}/);
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
});

describe("LB-SUGG-004: a chip fills the field and can never send it", () => {
  /*
    The distinction the owner drew, held structurally. Filling is the owner's
    question arriving where they can read, edit or delete it with the send
    button unpressed; sending is the product speaking for them.
  */
  it("offers no path from a suggestion to a submitted turn", () => {
    for (const file of [ROW, CHIP, SEED]) {
      expect(SUBMITS.test(code(file)), file).toBe(false);
    }
  });

  it("is not vacuous: it detects every shape a send would arrive in", () => {
    for (const planted of [
      '<form action={formAction}>',
      "form.current?.requestSubmit();",
      '<button type="submit">Ask</button>',
      "<Button formAction={ask} />",
    ]) {
      expect(SUBMITS.test(planted), planted).toBe(true);
    }
    expect(SUBMITS.test('<Button type="button" onClick={() => seed.fill(question)} />')).toBe(false);
  });

  it("says what the control is, so a submit cannot arrive by default", () => {
    // A `<button>` with no `type` inside a form submits it. The chip declares
    // `type="button"` rather than relying on never being placed in one.
    expect(code(CHIP)).toMatch(/type="button"/);
    expect(code(CHIP)).toMatch(/seed\.fill\(/);
  });

  it("keeps the filler out of the pure derivation", () => {
    // The module that decides *what* to suggest must not know how a surface
    // puts it anywhere.
    expect(code(SUGGESTIONS)).not.toMatch(/fill|onClick|useState|useRef/);
  });

  it("bounds a filled question with the same constant the query string uses", () => {
    /*
      `MAX_SEED_LENGTH` moved out of `chat/page.tsx` so the client fill and the
      `?q=` seed cannot bound the same text differently.
    */
    expect(code(SEED)).toMatch(/export const MAX_SEED_LENGTH = 240;/);
    expect(code(SEED)).toMatch(/slice\(0, MAX_SEED_LENGTH\)/);
    expect(code(PAGE)).toMatch(/MAX_SEED_LENGTH/);
    expect(code(PAGE)).not.toMatch(/const MAX_SEED_LENGTH/);
  });
});
