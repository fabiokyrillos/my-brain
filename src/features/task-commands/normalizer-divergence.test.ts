import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { normalizeEntityName } from "../interpretations/entity-resolution";

/**
 * PRD 2E-MATCH-007 / 2E-MATCH-008.
 *
 * Two normalizers exist in this repository and they are not the same function.
 * `public.normalize_entity_alias` folds accents through a hand-written
 * `translate` map covering Western European Latin-1; `normalizeEntityName`
 * strips combining marks after NFD normalization and therefore folds any
 * script. PRD revision 2 asserted they were mirrors. They are not, and revision
 * 3 corrected it: the SQL one is **authoritative**, because it is the only
 * `immutable` one and therefore the only one that can appear in an index and in
 * the ORDER BY that 2E-MATCH-003 requires before truncation.
 *
 * This file deliberately does *not* assert that the two agree. Revision 2
 * mandated a parity test whose own corpus made it unsatisfiable. What it does
 * instead:
 *
 *   1. pins the authoritative output for a corpus that includes the cases where
 *      they diverge - the same corpus `supabase/tests/
 *      phase_2e_task_command_matching.sql` runs against the real function, so
 *      the values below are proven and not merely believed;
 *   2. proves the two files carry the *same* corpus, so neither can be tuned
 *      until it passes on its own;
 *   3. characterizes each divergence, naming which side yields what;
 *   4. proves the non-authoritative normalizer is not consulted for candidacy -
 *      in Phase 2E's matcher it is not consulted at all.
 *
 * Every string below is written with `\uXXXX` escapes and this file is
 * ASCII-only on purpose. The third entry differs from the second by Unicode
 * normalization form alone, and an editor that helpfully re-encoded the file
 * would silently turn the headline divergence case into a duplicate of the one
 * above it.
 */

type CorpusEntry = {
  readonly id: string;
  readonly input: string;
  /** What `public.normalize_entity_alias` returns. The authority. */
  readonly authoritative: string;
  /** What `normalizeEntityName` returns, which is not always the same thing. */
  readonly typescript: string;
};

const CORPUS: readonly CorpusEntry[] = [
  {
    id: "western-european-accents",
    input: "Relat\u00F3rio Final",
    authoritative: "relatorio final",
    typescript: "relatorio final",
  },
  {
    id: "nfc-n-tilde",
    input: "se\u00F1or",
    authoritative: "senor",
    typescript: "senor",
  },
  {
    // The headline divergence, and the reason candidacy may only ever be
    // decided in SQL: the same word, typed two ways, becomes one token or two.
    // The SQL normalizer has no concept of a combining mark, so it replaces
    // U+0303 with a space and splits the word in half.
    id: "nfd-n-tilde",
    input: "sen\u0303or",
    authoritative: "sen or",
    typescript: "senor",
  },
  {
    // U+0178 is missing from the translate map's uppercase run, which stops at
    // U+00DD. It survives `translate`, lowercases to U+00FF, and is then erased
    // by `[^a-z0-9]+`.
    id: "u0178-latin-capital-y-diaeresis",
    input: "\u0178",
    authoritative: "",
    typescript: "y",
  },
  {
    // A diacritic outside Western European Latin-1: the SQL side drops the
    // letter entirely, the TypeScript side folds it to its base.
    id: "polish-outside-latin1",
    input: "\u0142\u00F3d\u017A",
    authoritative: "od",
    typescript: "odz",
  },
  {
    id: "nfc-e-acute",
    input: "caf\u00E9",
    authoritative: "cafe",
    typescript: "cafe",
  },
  {
    // Load-bearing: a project named this normalizes to the empty string, which
    // is why every hint comparison in the candidate query is gated on the
    // normalized hint being non-empty. Without that gate an empty hint would
    // match it, and a task in it would qualify for every command.
    id: "punctuation-only",
    input: "!!!",
    authoritative: "",
    typescript: "",
  },
  {
    id: "uppercase-y-acute",
    input: "\u00DDY",
    authoritative: "yy",
    typescript: "yy",
  },
];

/** Resolved from the repository root, the convention the other source-reading tests use. */
function source(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

const FEATURE_DIR = "src/features/task-commands";
const PGTAP_PATH = "supabase/tests/phase_2e_task_command_matching.sql";

/** The `U&'...'` form, so the pgTAP file never depends on its own file encoding. */
function sqlUnicodeLiteral(value: string): string {
  let out = "";
  for (const char of value) {
    if (char === "'" || char === "\\") {
      throw new Error(`corpus entry ${JSON.stringify(value)} needs escaping this encoder refuses`);
    }
    const code = char.codePointAt(0) ?? 0;
    if (code < 128) {
      out += char;
      continue;
    }
    if (code > 0xffff) {
      throw new Error(`corpus entry ${JSON.stringify(value)} needs the backslash-plus form`);
    }
    out += `\\${code.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return `U&'${out}'`;
}

describe("normalizer divergence (2E-MATCH-008)", () => {
  const pgTap = source(PGTAP_PATH);

  it("is ASCII-only, so normalization form is never decided by an editor", () => {
    const text = source(`${FEATURE_DIR}/normalizer-divergence.test.ts`);
    expect(text).toMatch(/^[\x00-\x7F]*$/);
  });

  it.each(CORPUS)("$id is pinned identically in the pgTAP corpus", (entry) => {
    // The pgTAP file is what proves the `authoritative` column above against a
    // real Postgres. If the two corpora drift, one of them is asserting values
    // nothing checks.
    //
    // Anchored on the whole assertion, not on a fragment: `toContain` alone was
    // satisfied by the substring appearing anywhere at all - inside a comment,
    // or inside an assertion whose expected value had been changed - so a
    // *commented-out* corpus line would still have passed this.
    const expected =
      `select is(public.normalize_entity_alias(${sqlUnicodeLiteral(entry.input)}), `
      + `${sqlUnicodeLiteral(entry.authoritative)},`;
    expect(pgTap).toMatch(
      new RegExp(`^${expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m"),
    );
  });

  it("runs every corpus entry in SQL and nothing else", () => {
    // The count is what closes co-drift. Both corpora agreeing is only evidence
    // if the SQL side is *executing* all of them: without this, deleting an
    // entry from both files leaves the suite green, and so does adding one to
    // this file that pgTAP never runs. The runtime proof is pgTAP's; this makes
    // sure the proof covers the whole corpus.
    const executed = pgTap.match(/^select is\(public\.normalize_entity_alias\(/gm) ?? [];
    expect(executed).toHaveLength(CORPUS.length);
  });

  it("gives every corpus entry a distinct input", () => {
    // Two entries with the same input would satisfy the count above while
    // leaving a case unproven.
    expect(new Set(CORPUS.map((entry) => entry.input)).size).toBe(CORPUS.length);
    expect(new Set(CORPUS.map((entry) => entry.id)).size).toBe(CORPUS.length);
  });

  it("covers every case PRD revision 3 named", () => {
    const ids = CORPUS.map((entry) => entry.id);
    expect(ids).toContain("nfc-n-tilde");
    expect(ids).toContain("nfd-n-tilde");
    expect(ids).toContain("u0178-latin-capital-y-diaeresis");
    expect(ids).toContain("polish-outside-latin1");
  });

  it("keeps the two n-tilde entries genuinely different strings", () => {
    const nfc = CORPUS.find((entry) => entry.id === "nfc-n-tilde");
    const nfd = CORPUS.find((entry) => entry.id === "nfd-n-tilde");
    expect(nfc?.input).not.toBe(nfd?.input);
    expect(nfc?.input.normalize("NFC")).toBe(nfd?.input.normalize("NFC"));
  });

  it.each(CORPUS)("$id characterizes what the non-authoritative normalizer does", (entry) => {
    expect(normalizeEntityName(entry.input)).toBe(entry.typescript);
  });

  it("records that the two disagree, rather than asserting they agree", () => {
    const diverging = CORPUS.filter((entry) => entry.authoritative !== entry.typescript);
    expect(diverging.map((entry) => entry.id)).toEqual([
      "nfd-n-tilde",
      "u0178-latin-capital-y-diaeresis",
      "polish-outside-latin1",
    ]);
  });
});

describe("the authoritative normalizer is the only one matching consults", () => {
  const sources = ["matching.ts", "candidates.ts", "match-policy.ts"] as const;

  it.each(sources)("%s neither imports nor calls the TypeScript normalizer", (file) => {
    const text = source(`${FEATURE_DIR}/${file}`);
    // Matched as an import and as a call rather than as a substring: these
    // modules carry comments explaining *why* they do not use it, and a
    // substring check would forbid the explanation along with the behaviour.
    expect(text).not.toMatch(/from\s+["'][^"']*entity-resolution["']/);
    expect(text).not.toMatch(/normalizeEntityName\s*\(/);
  });

  it("and does not re-implement one either", () => {
    const text = source(`${FEATURE_DIR}/matching.ts`);
    // The two moves that would quietly recreate a normalizer: NFD folding and
    // the alphanumeric squeeze. Both belong to SQL in Phase 2E.
    expect(text).not.toContain('normalize("NFD")');
    expect(text).not.toContain("[^a-z0-9]");
  });

  it.each(sources)("%s decides no text comparison against the host's ICU data", (file) => {
    // The third re-implementation move, and the one a mutation run proved the
    // behavioural fixtures could not catch: `rankEntityCandidates` breaks its
    // ties with `localeCompare`, and copying that here would make the 2E-MATCH-009
    // ordering resolve against whatever collation the machine happens to carry.
    // Unlike the two above this is not a normalizer, so it needs its own guard,
    // and unlike a fixture, a structural check cannot be defeated by two strings
    // that happen to collate the same way.
    //
    // Matched as a call, for the reason the assertion above is: `matching.ts`
    // documents at length why its comparator does not use `localeCompare`, and
    // a substring check would forbid the explanation along with the behaviour.
    const text = source(`${FEATURE_DIR}/${file}`);
    expect(text).not.toMatch(/\.localeCompare\s*\(/);
    expect(text).not.toMatch(/Intl\.Collator\s*\(/);
  });
});
