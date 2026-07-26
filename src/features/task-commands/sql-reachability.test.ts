import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { TASK_MATCH_LIMITS, TASK_MATCH_PREFILTER_TIERS } from "./match-policy";
import { describeUnreachableCandidates, type TaskCandidateShape } from "./matching";

/**
 * PRD 2E-MATCH-005/007 — the scorer's inputs are ones SQL can actually emit.
 *
 * `scoreRow` reads `prefilterTier`, `tokenOverlap` and `queryTokenCount` as the
 * authoritative normalizer's verdict and never re-derives them. That is the
 * right design — re-deriving is exactly the divergence 2E-MATCH-008 exists to
 * characterize — but it leaves the scorer trusting triples it cannot check, and
 * a review observed that both fixture corpora invent those numbers by hand. A
 * fixture asserting an outcome for a tier-0 row with zero token overlap would be
 * measuring behaviour against an input `list_task_command_candidates` has no
 * execution that produces.
 *
 * So the rules are written down once, checked against the migration text that
 * implements them, and applied to every fixture in `matching.test.ts` and
 * `match-baseline.test.ts`. The migration anchors are the load-bearing half: the
 * rules below are a *claim* about SQL, and a claim about SQL that nothing ties
 * to the SQL is how the two files drift together into agreeing on something
 * false.
 */

const MIGRATION_PATH =
  "supabase/migrations/202607250056_phase_2e_task_command_matching.sql";

function source(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

/** Every field the rules constrain, with values that are reachable. */
function shape(overrides: Partial<TaskCandidateShape> = {}): TaskCandidateShape {
  return {
    prefilterTier: TASK_MATCH_PREFILTER_TIERS.exactTitle,
    tokenOverlap: 1,
    queryTokenCount: 1,
    projectHintMatched: false,
    contextHintMatched: false,
    personHintMatched: false,
    effectiveLimit: TASK_MATCH_LIMITS.candidates,
    ...overrides,
  };
}

describe("the rules match the SQL that produces the rows", () => {
  const migration = source(MIGRATION_PATH);

  it("tier 0 is the whole normalized hint equalling the whole normalized title", () => {
    expect(migration).toContain("when q.q <> '' and s.nt = q.q then 0");
  });

  it("tier 1 is whole-word containment of the whole hint", () => {
    expect(migration).toMatch(/when q\.q <> ''\s*\n\s*and length\(q\.q\) >= 3/);
    expect(migration).toContain("like '% ' || q.q || ' %' then 1");
  });

  it("tier 2 is a shared token or a relation hit, and nothing else", () => {
    expect(migration).toContain("when (q.q <> '' and o.overlap > 0)");
    expect(migration).toContain("or s.project_hit or s.context_hit or s.person_hit then 2");
  });

  it("tier 3 is returned only when every hint was empty", () => {
    expect(migration).toContain("else 3");
    expect(migration).toContain(
      "(q.q = '' and q.project_q = '' and q.context_q = '' and q.person_q = '')",
    );
    expect(migration).toContain("or tr.tier <= 2");
  });

  it("overlap counts a subset of the hint's own token array", () => {
    expect(migration).toContain("count(*)::integer as overlap");
    expect(migration).toContain("from unnest(q.tokens) as tok");
    expect(migration).toContain("cardinality(q.tokens) as query_tokens");
  });

  it("the token array is bounded at the count the rules assume", () => {
    // The bound the reachability rule enforces lives in `matching.ts` rather
    // than in the policy digest, so this is what stops the two drifting.
    expect(migration).toMatch(/order by tok\s*\n\s*limit 16/);
  });

  it("the limit is clamped to the range the rules assume", () => {
    expect(migration).toContain("least(greatest(coalesce(p_limit, 25), 1), 100) as lim");
  });
});

describe("triples SQL can emit are accepted", () => {
  const reachable: ReadonlyArray<readonly [string, TaskCandidateShape]> = [
    ["an exact title with a single-token hint", shape()],
    [
      "an exact title with a multi-token hint, wholly overlapping",
      shape({ prefilterTier: 0, tokenOverlap: 4, queryTokenCount: 4 }),
    ],
    [
      "a phrase hit, which also carries every hint token",
      shape({ prefilterTier: 1, tokenOverlap: 3, queryTokenCount: 3 }),
    ],
    [
      "a partial token overlap at tier 2",
      shape({ prefilterTier: 2, tokenOverlap: 1, queryTokenCount: 5 }),
    ],
    [
      "a relation hit with no lexical hint at all, which is how tier 2 is reached without tokens",
      shape({
        prefilterTier: 2,
        tokenOverlap: 0,
        queryTokenCount: 0,
        projectHintMatched: true,
      }),
    ],
    [
      "a person hit with a title hint that shares nothing",
      shape({ prefilterTier: 2, tokenOverlap: 0, queryTokenCount: 3, personHintMatched: true }),
    ],
    [
      "an unconnected row from a command that carried no hint",
      shape({ prefilterTier: 3, tokenOverlap: 0, queryTokenCount: 0 }),
    ],
    ["the token array at its bound", shape({ prefilterTier: 0, tokenOverlap: 16, queryTokenCount: 16 })],
    ["the smallest limit SQL will clamp to", shape({ effectiveLimit: 1 })],
    ["the largest limit SQL will clamp to", shape({ effectiveLimit: 100 })],
  ];

  it.each(reachable)("%s", (_label, row) => {
    expect(describeUnreachableCandidates([row])).toBeNull();
  });

  it("accepts a whole set that agrees on the query's token count", () => {
    expect(
      describeUnreachableCandidates([
        shape({ prefilterTier: 0, tokenOverlap: 3, queryTokenCount: 3 }),
        shape({ prefilterTier: 2, tokenOverlap: 1, queryTokenCount: 3 }),
      ]),
    ).toBeNull();
  });
});

describe("triples SQL cannot emit are refused", () => {
  const unreachable: ReadonlyArray<readonly [string, TaskCandidateShape, RegExp]> = [
    [
      "an exact title that carries only some of the hint's tokens",
      shape({ prefilterTier: 0, tokenOverlap: 1, queryTokenCount: 4 }),
      /tier 0 carries every hint token/,
    ],
    [
      "a phrase hit that carries only some of them",
      shape({ prefilterTier: 1, tokenOverlap: 2, queryTokenCount: 3 }),
      /tier 1 carries every hint token/,
    ],
    [
      "an exact title with no hint at all",
      shape({ prefilterTier: 0, tokenOverlap: 0, queryTokenCount: 0 }),
      /tier 0 requires a non-empty normalized hint/,
    ],
    [
      "a phrase hit with no hint at all",
      shape({ prefilterTier: 1, tokenOverlap: 0, queryTokenCount: 0 }),
      /tier 1 requires a non-empty normalized hint/,
    ],
    [
      "a tier-2 row with neither a shared token nor a relation hit",
      shape({ prefilterTier: 2, tokenOverlap: 0, queryTokenCount: 4 }),
      /tier 2 is reached by a shared token or a relation hit/,
    ],
    [
      "a tier-3 row carrying a relation hit",
      shape({ prefilterTier: 3, tokenOverlap: 0, queryTokenCount: 0, contextHintMatched: true }),
      /tier 3 cannot carry a relation hit/,
    ],
    [
      "a tier-3 row reporting query tokens",
      shape({ prefilterTier: 3, tokenOverlap: 0, queryTokenCount: 2 }),
      /tier 3 is only returned when the command carried no hint/,
    ],
    [
      "an overlap larger than the token array it counts",
      shape({ prefilterTier: 2, tokenOverlap: 5, queryTokenCount: 4 }),
      /exceeds the query's 4 tokens/,
    ],
    [
      "a token count above the hint CTE's bound",
      shape({ prefilterTier: 0, tokenOverlap: 17, queryTokenCount: 17 }),
      /exceeds the 16-token bound/,
    ],
    [
      "a tier outside the declared vocabulary",
      shape({ prefilterTier: 4 }),
      /is not one of the declared tiers/,
    ],
    [
      "a fractional tier",
      shape({ prefilterTier: 1.5 }),
      /is not one of the declared tiers/,
    ],
    [
      "a negative overlap",
      shape({ prefilterTier: 2, tokenOverlap: -1, queryTokenCount: 3 }),
      /is not a non-negative integer/,
    ],
    [
      "a negative token count",
      shape({ prefilterTier: 3, tokenOverlap: 0, queryTokenCount: -1 }),
      /is not a non-negative integer/,
    ],
    [
      "a limit below the clamp",
      shape({ effectiveLimit: 0 }),
      /outside the clamp SQL applies/,
    ],
    [
      "a limit above the clamp",
      shape({ effectiveLimit: 101 }),
      /outside the clamp SQL applies/,
    ],
  ];

  it.each(unreachable)("%s", (_label, row, reason) => {
    expect(describeUnreachableCandidates([row])).toMatch(reason);
  });

  it("names the row that is wrong, not merely that one is", () => {
    const reason = describeUnreachableCandidates([
      shape(),
      shape({ prefilterTier: 0, tokenOverlap: 0, queryTokenCount: 1 }),
    ]);

    expect(reason).toMatch(/^row 1: /);
  });

  it("refuses a set whose rows disagree about the query's token count", () => {
    // Every row is individually reachable; the *set* is not, because
    // `query_token_count` is computed once and cross-joined onto all of them.
    const reason = describeUnreachableCandidates([
      shape({ prefilterTier: 0, tokenOverlap: 1, queryTokenCount: 1 }),
      shape({ prefilterTier: 3, tokenOverlap: 0, queryTokenCount: 0 }),
    ]);

    expect(reason).toMatch(/query token count differs across one result set \(0, 1\)/);
  });

  it("has nothing to refuse about an empty set", () => {
    expect(describeUnreachableCandidates([])).toBeNull();
  });
});
