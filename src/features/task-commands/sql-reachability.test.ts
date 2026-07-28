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
  // The CURRENT definition. `202607260059` amended this function's body by
  // `create or replace` to exclude creation-undone tasks (2E-DESTRUCTIVE-009), so
  // `202607250056`'s text is superseded and every assertion below would be
  // describing SQL the database no longer runs.
  "supabase/migrations/202607260059_phase_2e_destructive_confirmation.sql";

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
    observedBefore: "2026-07-25T12:00:00.000Z",
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
    // Anchored as the *whole* predicate, not as two independent substrings.
    // The tier-3 rule below is the one whose violation is a production raise,
    // and it depends on this WHERE having exactly these two branches: a third
    // OR-branch would leave two `toContain` assertions green while making
    // tier-3 rows returnable alongside a hint.
    expect(migration).toMatch(
      /where\s*\n\s*\(q\.q = '' and q\.project_q = '' and q\.context_q = '' and q\.person_q = ''\)\s*\n\s*or tr\.tier <= 2\s*\n/,
    );
  });

  it("eligible statuses are bounded before they are scanned", () => {
    // The bound is on the input array, not the result: `distinct` over a
    // million elements does the work whatever the output size.
    expect(migration).toContain("unnest((coalesce(p_eligible_statuses, '{}'::text[]))[1:32])");
  });

  it("every hint is truncated to the column it is compared against", () => {
    // Pinned by nothing before this. These lengths are what stop an unbounded
    // model-supplied hint turning the token lateral into an unbounded number of
    // LIKE comparisons per candidate.
    expect(migration).toContain("left(coalesce(p_title_query, ''), 240)");
    expect(migration).toContain("left(coalesce(p_project_hint, ''), 160)");
    expect(migration).toContain("left(coalesce(p_context_hint, ''), 120)");
    expect(migration).toContain("left(coalesce(p_person_hint, ''), 160)");
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

  it("the patch's references are resolved by the shared resolver, not a second copy", () => {
    // ADR-021 records entity-resolution duplication as a source of silent
    // divergence, and `normalizer-divergence.test.ts` already forbids a second
    // normalizer in TypeScript. This is the SQL-side half: a hand-rolled
    // `select id from public.projects where normalize_entity_alias(name) = ...`
    // would pass every other assertion in this file while dropping the alias
    // window and the exactly-one rule that make a null reference *mean*
    // something.
    expect(migration).toContain("public.resolve_owned_entity_exact(");
    expect(migration).toContain("cl.id, 'project', left(coalesce(p_project_ref, ''), 160)");
    expect(migration).toContain("cl.id, 'context', left(coalesce(p_context_ref, ''), 120)");
    expect(migration).toContain("cl.id, 'person', left(coalesce(p_person_ref, ''), 160)");
  });

  it("the references are resolved once per query, before anything is scanned", () => {
    // The three `*_ref_id` values are query-scalars, and `candidates.ts` raises
    // `unreachable_row_shape` on a set whose rows disagree about one. That claim
    // is only true while the resolution happens in its own CTE ahead of
    // `scanned` — moving it into a lateral would make it per-row, and the
    // TypeScript defence would then reject legal result sets.
    const refs = migration.indexOf("\n  refs as (");
    const scanned = migration.indexOf("\n  scanned as (");
    expect(refs).toBeGreaterThan(-1);
    expect(scanned).toBeGreaterThan(-1);
    expect(refs).toBeLessThan(scanned);
  });

  it("the ids are resolved before the names that are read from them", () => {
    // `ref_ids` calls the resolver; `refs` reads each resolved entity's stored
    // name from it. The split is what keeps the six values one single-row cross
    // join rather than two — and therefore what puts the names on the same
    // query-scalar footing as the ids, which is the ground `candidates.ts`
    // refuses a disagreeing set on.
    const refIds = migration.indexOf("\n  ref_ids as (");
    const refs = migration.indexOf("\n  refs as (");
    const scanned = migration.indexOf("\n  scanned as (");
    expect(refIds).toBeGreaterThan(-1);
    expect(refs).toBeGreaterThan(refIds);
    expect(refs).toBeLessThan(scanned);
  });

  it("every name is read under the owner predicate, not from the id alone", () => {
    // This is a `security definer` function, so the predicate *is* the ownership
    // control — RLS is not a second wall inside it. The id already came from an
    // owner-scoped resolver, which is exactly why a reader could delete these
    // predicates as redundant and every other assertion in this file would stay
    // green while the only control there is had been narrowed to one layer.
    expect(migration).toMatch(
      /select p\.name from public\.projects p\s*\n\s*where p\.id = ri\.project_ref_id and p\.user_id = ri\.owner_id/,
    );
    expect(migration).toMatch(
      /select c\.name from public\.contexts c\s*\n\s*where c\.id = ri\.context_ref_id and c\.user_id = ri\.owner_id/,
    );
    expect(migration).toMatch(
      /select pe\.name from public\.people pe\s*\n\s*where pe\.id = ri\.person_ref_id and pe\.user_id = ri\.owner_id/,
    );
  });

  it("the reminder count is projected without an unreachable coalesce", () => {
    // `count(*)` over an empty set is 0, not null, and an aggregate subquery with
    // no GROUP BY always returns exactly one row — so the `left join lateral`
    // cannot null it, and the guard that used to be here claimed something the
    // data cannot do. Pinned rather than merely deleted: `candidates.ts` parses
    // this column as a non-negative integer and *not* nullable, so a coalesce
    // reappearing would be the visible sign that someone believed otherwise.
    expect(migration).not.toContain("coalesce(rm.scheduled_count");
    expect(migration).toMatch(/\n\s*rm\.scheduled_count,\s*\n\s*rm\.next_remind_at\s*\n/);
  });

  it("the references never reach the scanning or ranking path", () => {
    // 2E-MATCH-005 in its sharpest form: the relation a command is *adding* must
    // not qualify or boost the task that already holds it — the defect
    // `writesRelation` exists to prevent, which a review proved had reached a
    // one-step apply. Keeping the arguments out of the whole region that selects
    // candidates, tiers them and orders them is what makes that structural
    // rather than a promise. The region is bounded by the CTE that first touches
    // `public.tasks` and by the final projection.
    const scanned = migration.indexOf("\n  scanned as (");
    const projection = migration.indexOf("\n  select\n    r.id,");
    expect(scanned).toBeGreaterThan(-1);
    expect(projection).toBeGreaterThan(scanned);

    const candidacy = migration.slice(scanned, projection);
    expect(candidacy).toContain("tiered as (");
    expect(candidacy).toContain("ranked as (");
    for (const argument of ["p_project_ref", "p_context_ref", "p_person_ref"]) {
      expect(candidacy).not.toContain(argument);
    }
  });

  it("only scheduled reminders are counted, because only they can fire", () => {
    // Every heartbeat path selects `scheduled` and no other status, so a
    // `snoozed` row is inert, a `sent` one has already fired, and a `cancelled`
    // one is already where the transition would put it. Counting any of them
    // would make the preview disclose an effect that cannot happen.
    expect(migration).toMatch(
      /from public\.reminders rem\s*\n\s*where rem\.task_id = r\.id\s*\n\s*and rem\.user_id = r\.user_id\s*\n\s*and rem\.status = 'scheduled'/,
    );
    expect(migration).toContain("count(*)::integer as scheduled_count");
    expect(migration).toContain("min(rem.remind_at) as next_remind_at");
  });

  it("none of the preview columns appears in either ordering key", () => {
    // 2E-MATCH-003 is "ordered totally and deterministically *before* it
    // truncates", and the migration repeats the same key after the joins so the
    // truncated set and the returned set agree. Both are checked, because a
    // preview column reaching either would make which candidates survive depend
    // on the patch's own references, or on reminder state the heartbeat mutates
    // hourly with no user act — a set of matches that changed on a cron tick.
    //
    // Matched on `order by` at the start of a line, which is the multi-line
    // ranking key; the single-line `order by tok` and the `array_agg(... order
    // by ...)` aggregates are ordering rows within a value, not candidates
    // against each other.
    const keys = [...migration.matchAll(/\n\s*order by\n([\s\S]*?)(?=\n\s*limit|;)/g)]
      .map((match) => match[1]);
    expect(keys).toHaveLength(2);

    for (const key of keys) {
      expect(key).toContain("tier,");
      for (const column of [
        "project_ref_id",
        "context_ref_id",
        "person_ref_id",
        // The names travel with their ids and are excluded on the same ground.
        // Ordering on one would be the same defect wearing a different column:
        // which candidates survive truncation would depend on what the command is
        // trying to assign, which is what `writesRelation` exists to prevent.
        "project_ref_name",
        "context_ref_name",
        "person_ref_name",
        "scheduled_reminder_count",
        "next_reminder_at",
      ]) {
        expect(key).not.toContain(column);
      }
    }
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
