import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  TASK_COMMAND_LINKED_EFFECTS,
  getTaskCommandCopy,
  taskCommandCopy,
  type TaskCommandCopy,
} from "./copy";
import { TASK_COMMAND_APPLY_FAILURES, TASK_COMMAND_ERROR_DETAILS } from "./errors";
import { TASK_MATCH_EVIDENCE } from "./match-policy";
import {
  TASK_COMMAND_OUTCOMES,
  TASK_COMMAND_PREVIEW_DISPOSITIONS,
  TASK_COMMAND_PREVIEW_REFUSALS,
} from "./outcomes";
import { TASK_CHANGED_FIELDS, TASK_COMMAND_ACTIONS } from "./taxonomy";
import { locales, type Locale } from "@/lib/preferences";

/**
 * PRD 2E-I18N-001 / 2E-I18N-003 / 2E-UX-001.
 *
 * Every assertion below runs against a **declared code list** — the `as const`
 * arrays the vocabulary modules export — and never against a key list written
 * out here. That distinction is the whole requirement: a hand-written expected
 * set is a second declaration of the vocabulary, and the failure mode it cannot
 * catch is the one that matters, an outcome added to `outcomes.ts` and to
 * neither locale, with the test's own list quietly updated to match.
 *
 * `Record<Union, …>` already makes a missing key a compile error, so this file
 * is not re-proving the type system. It proves the two things the type cannot:
 * that the runtime object really carries no *extra* keys (a `Record` is
 * satisfied by a superset when the value is widened anywhere on the way in),
 * and that the locale coverage is exhaustive over `locales` — the source of
 * truth for how many locales exist — rather than over the two this file happens
 * to know about.
 */

const COPY_SOURCE = "src/features/task-commands/copy.ts";

/** The eight vocabularies whose keys are declared elsewhere, as data. */
const VOCABULARIES: readonly {
  readonly section: keyof TaskCommandCopy;
  readonly declared: readonly string[];
}[] = [
  { section: "outcomes", declared: TASK_COMMAND_OUTCOMES },
  { section: "dispositions", declared: TASK_COMMAND_PREVIEW_DISPOSITIONS },
  { section: "refusals", declared: TASK_COMMAND_PREVIEW_REFUSALS },
  // Slice 2E.4. The row 2E-I18N-003 is literally about: the mutation RPC's
  // closed failure vocabulary, which until this slice had no localized copy at
  // all because no code raised it yet.
  { section: "failures", declared: TASK_COMMAND_APPLY_FAILURES },
  { section: "actions", declared: TASK_COMMAND_ACTIONS },
  { section: "fields", declared: TASK_CHANGED_FIELDS },
  { section: "evidence", declared: TASK_MATCH_EVIDENCE },
  { section: "effects", declared: TASK_COMMAND_LINKED_EFFECTS },
];

/**
 * The two sections with no declared vocabulary behind them.
 *
 * Named so the coverage assertion below can prove that *every* section is
 * either pinned against a declared list or deliberately exempt — a new section
 * added to `TaskCommandCopy` fails there rather than going untested.
 */
const FREE_FORM_SECTIONS: readonly (keyof TaskCommandCopy)[] = ["values", "preview"];

type CopyLeaf = { readonly path: string; readonly value: string };

function collectLeaves(value: unknown, prefix: string, out: CopyLeaf[]): void {
  if (typeof value === "string") {
    out.push({ path: prefix, value });
    return;
  }
  if (typeof value !== "object" || value === null) {
    throw new Error(`copy entry at "${prefix}" is neither a string nor a record`);
  }
  for (const [key, child] of Object.entries(value)) {
    collectLeaves(child, prefix === "" ? key : `${prefix}.${key}`, out);
  }
}

/** Every string in a locale's record, by dotted path. */
function leaves(copy: TaskCommandCopy): readonly CopyLeaf[] {
  const out: CopyLeaf[] = [];
  collectLeaves(copy, "", out);
  return out;
}

function leafMap(copy: TaskCommandCopy): ReadonlyMap<string, string> {
  return new Map(leaves(copy).map((leaf) => [leaf.path, leaf.value]));
}

/**
 * Paths whose two locales are legitimately the same string.
 *
 * Exactly one, and it is not a copy-paste: "Status" is the word Brazilian
 * Portuguese product copy uses for that column, and translating it to
 * "Situação" to satisfy a test would make the product worse to serve the suite.
 * The exemption is held minimal by its own assertion below — the day someone
 * does translate it, this entry has to go.
 */
const IDENTICAL_ACROSS_LOCALES: readonly string[] = ["fields.status"];

describe("locale coverage (2E-I18N-001)", () => {
  it("carries exactly the declared locales, no more and no fewer", () => {
    expect(Object.keys(taskCommandCopy).sort()).toEqual([...locales].sort());
  });

  it("gives every locale a distinct record", () => {
    const records = locales.map((locale) => getTaskCommandCopy(locale));
    expect(new Set(records).size).toBe(locales.length);
  });
});

describe.each(locales)("%s is keyed by the declared vocabularies (2E-I18N-003)", (locale) => {
  const copy = getTaskCommandCopy(locale);

  it.each(VOCABULARIES)("$section is keyed exactly by its declared list", ({ section, declared }) => {
    expect(Object.keys(copy[section]).sort()).toEqual([...declared].sort());
  });

  it("has no section that escapes this file", () => {
    // Without this, a section added to `TaskCommandCopy` would be typed,
    // populated, and covered by nothing above.
    expect([...VOCABULARIES.map((entry) => entry.section), ...FREE_FORM_SECTIONS].sort()).toEqual(
      Object.keys(copy).sort(),
    );
  });

  it("resolves every string to non-empty, trimmed text", () => {
    for (const leaf of leaves(copy)) {
      expect(leaf.value, `${locale} ${leaf.path} is empty`).not.toBe("");
      expect(leaf.value.trim(), `${locale} ${leaf.path} is not trimmed`).toBe(leaf.value);
    }
  });
});

describe("the locales carry the same shape and different words", () => {
  function pathsOf(locale: Locale): readonly string[] {
    return leaves(getTaskCommandCopy(locale))
      .map((leaf) => leaf.path)
      .sort();
  }

  const ptBR = leafMap(getTaskCommandCopy("pt-BR"));
  const en = leafMap(getTaskCommandCopy("en"));

  it("gives every locale the identical set of paths", () => {
    const reference = pathsOf(locales[0]);
    expect(reference.length).toBeGreaterThan(0);
    for (const locale of locales.slice(1)) {
      expect(pathsOf(locale), locale).toEqual(reference);
    }
  });

  it("translates every string, rather than leaving English in the Portuguese block", () => {
    for (const [leafPath, value] of ptBR) {
      if (IDENTICAL_ACROSS_LOCALES.includes(leafPath)) continue;
      expect(en.get(leafPath), `${leafPath} is identical in both locales`).not.toBe(value);
    }
  });

  it("keeps the identical-string exemption minimal", () => {
    // An exemption that stopped being true is an assertion nobody is making.
    for (const leafPath of IDENTICAL_ACROSS_LOCALES) {
      expect(ptBR.get(leafPath), `${leafPath} is not a copy path`).toBeDefined();
      expect(en.get(leafPath), `${leafPath} no longer needs an exemption`).toBe(ptBR.get(leafPath));
    }
  });
});

describe("getTaskCommandCopy has no fallback", () => {
  it("returns the record the caller asked for", () => {
    expect(getTaskCommandCopy("pt-BR")).toBe(taskCommandCopy["pt-BR"]);
    expect(getTaskCommandCopy("en")).toBe(taskCommandCopy.en);
  });

  it("does not serve Portuguese to an English caller", () => {
    // The concrete defect the accessor was written against
    // (`question-preview-projection.ts:93` has the fallback this one refuses).
    expect(getTaskCommandCopy("en").outcomes.applied.title).toBe("Done");
    expect(getTaskCommandCopy("pt-BR").outcomes.applied.title).toBe("Feito");
    expect(getTaskCommandCopy("en")).not.toBe(getTaskCommandCopy("pt-BR"));
  });

  it("contains no fallback operator in its body", () => {
    // Structural, because a behavioural test cannot reach the branch: `Locale`
    // is closed, so a `?? taskCommandCopy["pt-BR"]` would be dead code that
    // only fires once an unhandled locale exists — which is exactly when it
    // would do harm, and exactly when no fixture is watching.
    const text = readFileSync(path.resolve(process.cwd(), COPY_SOURCE), "utf8");
    const body = /export function getTaskCommandCopy\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(text);
    expect(body, "getTaskCommandCopy is no longer a plain function declaration").not.toBeNull();
    // The doc comment above the function names the operator to explain why it
    // is absent, so this reads the body alone.
    expect(body?.[1]).not.toContain("??");
    expect(body?.[1]).not.toContain("||");
    expect(body?.[1]?.trim()).toBe("return taskCommandCopy[locale];");
  });
});

describe("the preview dispositions and the outcome vocabulary (2E-UX-001)", () => {
  it("shares every disposition except `previewed` with the declared outcomes", () => {
    // `outcomes.ts` asserts this containment in prose; this is its executable
    // form. `previewed` is a lifecycle state (PRD §11.1), not an outcome a
    // command comes to rest at, and the assertion is written as an equality so
    // it fails in both directions: a disposition that stopped being an outcome,
    // and `previewed` quietly becoming one.
    const declaredOutcomes: readonly string[] = TASK_COMMAND_OUTCOMES;
    const notOutcomes = TASK_COMMAND_PREVIEW_DISPOSITIONS.filter(
      (disposition) => !declaredOutcomes.includes(disposition),
    );
    expect(notOutcomes).toEqual(["previewed"]);
  });

  it("keeps a refusal vocabulary that the `refused` outcome can explain", () => {
    expect(TASK_COMMAND_PREVIEW_REFUSALS.length).toBeGreaterThan(0);
    const declaredOutcomes: readonly string[] = TASK_COMMAND_OUTCOMES;
    expect(declaredOutcomes).toContain("refused");
  });
});

describe("every declared 2E_* detail code has copy in both locales (2E-I18N-003)", () => {
  // The `failures` row of VOCABULARIES already proves the section is keyed
  // *exactly* by `TASK_COMMAND_APPLY_FAILURES`. This states the narrower
  // requirement separately, because that row would still pass if the eleven
  // database tokens were removed from the declared list along with their copy —
  // and 2E-UPDATE-017 is about those eleven specifically.
  it.each(locales)("%s localizes all eleven database tokens", (locale) => {
    const copy = getTaskCommandCopy(locale);
    for (const detail of TASK_COMMAND_ERROR_DETAILS) {
      expect(Object.keys(copy.failures), `${locale} is missing ${detail}`).toContain(detail);
    }
    // Nine after Slice 2E.4; Slice 2E.5 retired `2E_ACTION_NOT_ENABLED` and added
    // the confirmation refusal plus the two collision tokens.
    expect(TASK_COMMAND_ERROR_DETAILS).toHaveLength(11);
  });

  it("covers the failures that carry no token as well", () => {
    // A vocabulary limited to the `2E_*` tokens would leave `55P03`, `42501`,
    // `P0002` and the bare-`22023` family with no sentence at all — the four the
    // RPC signals with a SQLSTATE alone, plus this process's own fallback.
    const declared: readonly string[] = TASK_COMMAND_APPLY_FAILURES;
    const tokens: readonly string[] = TASK_COMMAND_ERROR_DETAILS;
    expect(declared.filter((failure) => !tokens.includes(failure))).toEqual([
      "unauthenticated",
      "task_not_found",
      "stale_pre_state",
      "invalid_payload",
      "undeclared_failure",
    ]);
  });

  it("names no task and no identifier in any failure sentence", () => {
    // 2E-OWNERSHIP-002: a failure is rendered on a surface that may have been
    // reached without ownership ever being established, so a sentence that
    // interpolated a title would disclose the existence of a row the caller may
    // not own. Structural, because the type is `Record<..., string>` and a
    // template function would compile just as well.
    for (const locale of locales) {
      for (const [failure, sentence] of Object.entries(getTaskCommandCopy(locale).failures)) {
        expect(typeof sentence, `${locale} ${failure}`).toBe("string");
        expect(sentence, `${locale} ${failure} interpolates a value`).not.toMatch(/\$\{|%s|\{\{/);
      }
    }
  });
});
