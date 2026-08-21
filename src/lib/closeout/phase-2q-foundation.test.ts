/**
 * Phase 2Q slice 2Q.0 — **what is true right now**.
 *
 * `2Q-FOUNDATION-001` … `-005`.
 *
 * ## Why a whole slice exists to prove things nobody disputes
 *
 * The Phase 2Q package rests on five measured findings. Every one of them was
 * measured against `main` **`beef7fa`**, and the phase builds on the `main` the
 * planning package merged into — `a0295a2`. A finding trusted from a document is
 * a premise; a finding with a test that fails when it stops being true is a
 * fact. §11 of the roadmap design asks for the second, and this repository has
 * caught a stale premise in every phase since 2M by asking.
 *
 * ## Two of the five are asserted as DEFECTS, deliberately
 *
 * `2Q-FOUNDATION-003` and `-004` asserted behaviour that was **wrong**, by
 * executing it. That was the point: the phase began from a demonstrated defect
 * rather than from an argument.
 *
 * **Both are now INVERTED — by slices 2Q.1 and 2Q.2 — and neither was deleted.**
 * Every inverted block says so in its own body, names the slice that turned it,
 * and forbids the old shape **by name**, so a revert cannot pass quietly. An
 * absence nobody asserts is an absence nobody notices disappearing, which is the
 * rule this repository has held since Phase 2N.
 *
 * **`-003` did not invert in the direction slice 2Q.0 predicted**, and its body
 * explains why at length: `OD-2Q-5` was signed as option C, which removed the
 * consumer that prediction assumed. The divergence is recorded there rather than
 * smoothed over here.
 *
 * ## What this file is not
 *
 * It changes no product behaviour, creates no column and touches no hosted data.
 * ADR-128 authorizes implementation of the phase; this slice spends none of it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { authorizeHref } from "@/features/reviews/markdown";
import { resolveSources } from "@/features/conversation-sources/resolve-sources";
import type { ParsedCitations } from "@/features/conversation-sources/contracts";

vi.mock("server-only", () => ({}));

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

const AGENT_ACTIONS = "src/features/agent/actions.ts";
const TYPES = "src/lib/supabase/database.types.ts";
const REVIEW_PAGE = "src/app/[locale]/app/reviews/[reviewId]/page.tsx";
const CONTRACTS = "src/features/conversation-sources/contracts.ts";
const CANDIDATE_SPEC = "e2e/editable-candidate-confirmation.spec.ts";

/**
 * A source file with its comments removed — **code, not prose.**
 *
 * ## Why this exists, and why it is written down rather than inlined
 *
 * This is the **fourth** time in Phase 2Q that a guard scanning for a forbidden
 * construct failed on the paragraph explaining why the construct is forbidden:
 *
 *   1. the migration-refusal scan, on `on delete set null` inside a `--` comment;
 *   2. the same scan again, on `foreign key` inside `comment on column`, which
 *      is prose living inside a **statement**;
 *   3. `review-sources.test.ts`, on `resolveContent` inside the paragraph saying
 *      the module never calls it;
 *   4. here, on `new Set<string>()` inside the sentence saying the page no
 *      longer passes one.
 *
 * The rule under all four: **an authority guard must forbid the act, not the
 * word.** The tempting repair each time is to reword the explanation until the
 * scanner agrees — which is fixing the evidence to fit the test, and leaves the
 * next reader with a comment that says less than it should.
 *
 * Callers that use this must pair it with a **two-sided** control proving it
 * removes prose and keeps statements; a stripper that removed everything would
 * make every refusal pass on an empty string.
 */
function executable(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

/*
 * `lineOf` lived here and is **gone, deliberately, with its last caller.**
 *
 * Slice 2Q.0 pinned findings to line numbers, because a finding without a
 * location is an opinion. Slices 2Q.1 and 2Q.2 then edited every file it pointed
 * at, and a pin that has to be re-typed on each edit teaches the next reader to
 * re-type it without looking — which is how a pin stops being a check.
 *
 * The provenance did not disappear: `PHASE_2Q_SLICE_00_ACCEPTANCE.md` states the
 * lines **as measured on `a0295a2`**, which stays true of `a0295a2` forever, and
 * one assertion above reads that record back. What is asserted live is the
 * property.
 */

/** `generateReview`'s body, isolated from the rest of a 1000-line action file. */
function generateReviewBody(): string {
  const source = read(AGENT_ACTIONS);
  const start = source.indexOf("export async function generateReview(");
  expect(start, "generateReview is gone").toBeGreaterThan(-1);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

describe("2Q-FOUNDATION-001: generateReview retrieves entries and tasks, and discards the citations", () => {
  it("reads exactly two tables into the model's source set", () => {
    const body = generateReviewBody();
    /*
     * The claim is about the **source set**, not about every read the action
     * makes. `generateReview` also reads `profiles` and `agent_preferences` —
     * for the timezone the period is computed in and the model to route to —
     * and neither reaches the prompt as a source. A first version of this
     * assertion counted every `.from(...)` and was wrong for that reason; it is
     * recorded rather than quietly narrowed, because the narrowing is the
     * finding's actual shape.
     */
    const literal = body.slice(
      body.indexOf("const sources: ChatSource[] = ["),
      body.indexOf("const prompts = {"),
    );
    expect(literal, "the source-set literal is gone").toContain("ChatSource[]");
    const fed = [...literal.matchAll(/\(([a-zA-Z]+)Result\.data \?\? \[\]\)/g)].map((match) => match[1]);
    expect(fed.sort()).toEqual(["entries", "tasks"]);

    // And those two results come from those two tables, in this action.
    const tables = [...body.matchAll(/\.from\("([a-z_]+)"\)/g)].map((match) => match[1]);
    expect(tables.sort()).toEqual(["agent_preferences", "entries", "profiles", "summaries", "tasks"]);

    /*
     * **The line pins moved to the acceptance record, and this is why.**
     *
     * Slice 2Q.0 pinned `:932` and `:939` because a finding without a location
     * is an opinion. Slice 2Q.1 edits this very file, so a live line number now
     * churns with every comment added above it — and a guard that must be
     * re-numbered on each edit teaches the next reader to re-number it without
     * looking, which is how a pin stops being a check.
     *
     * The provenance is kept where it cannot rot: the acceptance record states
     * the lines **as measured on `a0295a2`**, and that stays true of `a0295a2`
     * forever. What is asserted live is the property, above.
     */
    expect(read("docs/reports/phase-2q/PHASE_2Q_SLICE_00_ACCEPTANCE.md"))
      .toContain("src/features/agent/actions.ts:932");
  });

  it("READS citedSourceIds, where it used to discard them — INVERTED by slice 2Q.1", () => {
    /*
     * **Inverted, not deleted.**
     *
     * As shipped through `a0295a2` this asserted that the identifier
     * `citedSourceIds` did not occur **anywhere** in the file — the strongest
     * available form of "it is discarded", and the finding `2Q-FOUNDATION-001`
     * recorded. Slice 2Q.1 made the action read it (`2Q-CITE-004`), so the
     * assertion now requires the occurrence it used to forbid.
     *
     * The property being protected never changed: **whether the provider's
     * validated ids survive the write.** Only the answer did.
     */
    expect(read(AGENT_ACTIONS), "the action went back to discarding the cited ids")
      .toContain("citedSourceIds");
  });

  it("labels a task AS A TASK — INVERTED by slice 2Q.1", () => {
    /*
     * **This assertion was the mislabel, and it is inverted rather than
     * deleted** — the rule this file's header states.
     *
     * As shipped through `a0295a2` it required `id: \`memory:${item.id}\`` and
     * `type: "memory" as const` on the branch built from the `tasks` query, and
     * that is what `2Q-FOUNDATION-001` recorded. Slice 2Q.1 corrected it
     * (`2Q-CITE-007`), so the same block now requires the opposite, **and
     * forbids the old shape by name** so a revert cannot pass quietly.
     */
    const body = generateReviewBody();
    expect(body, "the task branch stopped calling itself a task")
      .toMatch(/id: `task:\$\{item\.id\}`/);
    expect(body, "the task branch stopped declaring the task type")
      .toMatch(/type: "task" as const/);
    expect(body, "the memory mislabel came back")
      .not.toMatch(/id: `memory:\$\{item\.id\}`/);
    // And it is the *task* query it is built from — the label, located.
    expect(body.indexOf('.from("tasks")')).toBeLessThan(body.indexOf("id: `task:"));
  });

  it("persists the envelope in the same write as the review — ADDED by slice 2Q.1", () => {
    /*
     * The inverse of "never mentions citedSourceIds", which is the assertion
     * above and stays inverted with it. The identifier is now read, filtered
     * through the same `flatMap` chat uses, and written into the upsert — so a
     * review cannot exist without the references it was written from.
     */
    const body = generateReviewBody();
    expect(body, "the action stopped reading the provider's cited ids")
      .toContain("answer.citedSourceIds.flatMap");
    const upsert = body.slice(body.indexOf('.from("summaries")'));
    expect(upsert, "the envelope is not in the write").toContain("citations: buildCitationsEnvelope(");
    expect(upsert, "the review must declare ITS reach, never chat's").toContain("reach: REVIEW_REACH");
    expect(upsert, "the conflict target moved, which would break 2Q-CITE-009")
      .toContain('onConflict: "user_id,period_type,period_start,period_end"');
  });
});

describe("2Q-FOUNDATION-002: summaries has no column able to hold a citation", () => {
  /** The generated `summaries.Row` block, read from the checked-in types. */
  function summariesRow(): string {
    const types = read(TYPES);
    const at = types.indexOf("      summaries: {");
    expect(at, "the summaries table is gone from the generated types").toBeGreaterThan(-1);
    const row = types.slice(types.indexOf("Row: {", at), types.indexOf("Insert: {", at));
    return row;
  }

  it("carries fifteen columns — the fourteen it had, plus the allocated one — INVERTED by slice 2Q.1", () => {
    /*
     * **Inverted, not deleted.** Slice 2Q.0 recorded fourteen columns and no
     * place to put a citation; that was the finding that justified the one
     * migration `OD-2Q-7` allocates. Slice 2Q.1 spends it, so the count is now
     * fifteen — and the list is spelled out in full so a **sixteenth** arriving
     * unnoticed fails here. A second migration of any kind is a stop condition,
     * and this is one of the three places that would catch one.
     */
    const columns = [...summariesRow().matchAll(/^ {10}([a-z_]+):/gm)].map((match) => match[1]);
    expect(columns.sort()).toEqual([
      "citations",
      "content",
      "generated_at",
      "id",
      "input_tokens",
      "model",
      "original_content",
      "output_tokens",
      "period_end",
      "period_start",
      "period_type",
      "status",
      "title",
      "updated_at",
      "user_id",
    ]);
    expect(columns).toHaveLength(15);
  });

  it("declares no relationship, so there is no join table either", () => {
    const types = read(TYPES);
    const at = types.indexOf("      summaries: {");
    const block = types.slice(at, types.indexOf("      tags: {", at));
    expect(block).toContain("Relationships: []");
  });

  it("has EXACTLY ONE migration creating that column — INVERTED by slice 2Q.1", () => {
    /*
     * **The ceiling, not the absence.** Slice 2Q.0 asserted zero, because
     * nothing was authorized to be spent. `OD-2Q-7` allocates one and slice
     * 2Q.1 spends it, so what is worth holding for the rest of the phase is
     * that there is **never a second** — a stop condition rather than an
     * overrun, `OD-2Q-4` being signed as option A.
     *
     * Read from the migration chain rather than from the generated types,
     * because the types are an artifact and could in principle lag the schema.
     */
    const migrations = join(REPO, "supabase", "migrations");
    const hits: string[] = [];
    for (const name of readdirSync(migrations)) {
      const sql = readFileSync(join(migrations, name), "utf8");
      if (/summaries[\s\S]{0,200}?citation/i.test(sql) || /summary_(citations|sources)/i.test(sql)) {
        hits.push(name);
      }
    }
    expect(hits, `the allocation is one; found ${hits.join(", ")}`)
      .toEqual(["202608210100_phase_2q_slice_1_summary_citations.sql"]);
  });

  it("and the review page now vouches FROM the stored envelope — INVERTED by slice 2Q.2", () => {
    /*
     * **Inverted, not deleted.**
     *
     * Slice 2Q.0 recorded `allowedIds: new Set<string>()` — the page had nothing
     * to vouch for, so every link a model wrote collapsed into text. Slice 2Q.1
     * filled the column and deliberately **left this line alone**, because a
     * migration whose consumer shipped early would have made it a lie one slice
     * sooner. Slice 2Q.2 is what feeds it, so the assertion now requires the
     * opposite and **forbids the empty set by name**.
     */
    const page = read(REVIEW_PAGE);
    // Comments stripped — see `executable`. The page's own comment says what the
    // allow-set *used to be*, and a guard that tripped on that sentence would be
    // forbidding the word rather than the act.
    expect(executable(page), "the page went back to vouching for nothing")
      .not.toContain("new Set<string>()");
    expect(page, "the allow-set must come from the resolved sources and nothing else")
      .toContain("vouchedFor: vouchedFrom(sources)");
    expect(page, "and those sources must be RE-READ, never taken from the envelope alone")
      .toContain("await resolveReviewSources(supabase, user.id, row.citations, locale)");
    expect(page, "the citations column must actually be selected")
      .toMatch(/\.select\("[^"]*citations[^"]*"\)/);
  });

  it("that stripper is two-sided: it removes prose and keeps statements", () => {
    // Without this the assertion above would pass on an empty string, which is
    // the failure mode of fixing a scanner instead of a finding.
    const page = read(REVIEW_PAGE);
    expect(page, "the page must still explain what the allow-set used to be")
      .toContain("new Set<string>()");
    expect(executable(page)).not.toContain("new Set<string>()");
    expect(executable(page), "the stripper ate the page itself")
      .toContain("export default async function ReviewDetailPage");
  });
});

describe("2Q-FOUNDATION-003: the mislabel is removed at its producer — INVERTED by slice 2Q.1", () => {
  /*
   * **Inverted, and not in the direction slice 2Q.0 predicted. Read this.**
   *
   * 2Q.0's header said: *"the same fixture must then resolve to a task card"*.
   * It does not, and forcing it to would have broken a signed decision. What
   * actually changed is better, and the difference is worth the paragraph.
   *
   * ## What the fix is
   *
   * The defect was never that `resolveSources` lacked a task branch. It was
   * that **`generateReview` produced a reference that lied about its own
   * type** — `memory:<task-uuid>` — and the resolver then dutifully looked a
   * task up in `memories`, missed, and returned `unavailable` for every task
   * citation. Slice 2Q.1 fixes it at the producer (`2Q-CITE-007`): the label is
   * now `task:` and the type is `task`, asserted as a pair. **The mislabelled
   * reference this block used to execute can no longer be written.**
   *
   * ## Why the resolver REFUSES a task instead of rendering one
   *
   * ADR-127 Decision 1 says `resolve-sources.ts` "gains a `task` branch". That
   * sentence was written for the option that was **recommended** — option A,
   * where the sources area showed a preview of each cited record. Decision 5 of
   * the same ADR signed **option C** instead, and Decision 5.1 states the
   * consequence in the owner's own terms: *"a source list carrying no governed
   * content never calls `resolveContent` at all."*
   *
   * That is not a preference here, it is mechanical. `readOnlyPreviewCard` —
   * the only thing this module builds a resolved source out of — **requires** a
   * `snippet` and a `sensitivity`. For a task those are the task's **title**
   * (content, forbidden on this surface by `2Q-LINK-008`) and a classification
   * derived from `source_entry_id` (a second derivation, forbidden by
   * `2Q-TRUST-007`). A task branch that rendered would have manufactured
   * exactly the two things the signature removed, in a module chat owns and a
   * review must not use.
   *
   * So: chat does not retrieve tasks (`OD-2Q-2`, option A), no chat envelope can
   * contain one, and the branch **refuses** — returning the same `unavailable`
   * shape a deleted record gets. The review page gets its own content-free
   * resolver in slice 2Q.2. The vocabulary is shared, exactly as `OD-2Q-1`
   * signed; only the renderer is not.
   *
   * ## What this block asserts now
   *
   * That the misroute is impossible in **both** directions: the producer cannot
   * emit it, and if a hand-written row ever carried one the resolver refuses it
   * explicitly rather than silently searching the wrong table.
   */
  const USER = "11111111-1111-4111-8111-111111111111";
  const TASK = "22222222-2222-4222-8222-222222222222";
  const ENTRY = "33333333-3333-4333-8333-333333333333";
  const NOW = new Date("2026-08-21T12:00:00.000Z");

  /** Answers `entries` and `memories`; a `tasks` read would be visible as a miss. */
  function client(rows: Record<string, unknown[]>) {
    const asked: string[] = [];
    return {
      asked,
      supabase: {
        from: (table: string) => {
          asked.push(table);
          const stub: Record<string, unknown> = {};
          stub.select = () => stub;
          stub.eq = () => stub;
          stub.in = () => Promise.resolve({ data: rows[table] ?? [], error: null });
          return stub;
        },
      },
    };
  }

  const citations = (...sources: ParsedCitations["sources"]): ParsedCitations => ({
    evidence: "evidenced",
    reach: ["entry", "memory"],
    sources,
    explanation: null,
    legacy: false,
  });

  it("no longer produces the mislabel at all — the defect is gone at its source", () => {
    const actions = read(AGENT_ACTIONS);
    expect(actions, "the review generator went back to labelling a task a memory")
      .not.toContain("id: `memory:${item.id}`");
    expect(actions, "the task branch must declare the task type").toContain('type: "task" as const');
  });

  it("refuses a hand-written task reference rather than searching memories for it", async () => {
    const { supabase, asked } = client({
      tasks: [{ id: TASK, title: "Fechar o contrato", status: "completed" }],
      memories: [],
    });
    const [source] = await resolveSources(
      supabase as never,
      USER,
      citations({ id: `task:${TASK}`, type: "task", sourceId: TASK, support: "product_state" }),
      "pt-BR",
      NOW,
    );
    // Refused, in the shape a deleted record gets — never resolved into a card
    // carrying the task's title.
    expect(source?.card.state).toBe("unavailable");
    expect(source?.card.snippet, "a task's title reached a chat card").toBeNull();
    // And it does NOT go looking in the wrong table, which was the whole defect.
    expect(asked, "a task reference is being looked up in memories again")
      .not.toContain("memories");
    expect(asked, "and it must not read tasks here either — that is 2Q.2's own resolver")
      .not.toContain("tasks");
  });

  it("is not vacuous: an entry citation resolves in the same call", async () => {
    /*
     * The control. Without it this block would keep passing if `resolveSources`
     * started returning `unavailable` for everything — which is exactly the
     * shape of a fix that fixes nothing.
     */
    const { supabase } = client({
      entries: [{ id: ENTRY, original_content: "reunião com a Ana", sensitivity: "normal", occurred_at: "2026-08-20T10:00:00Z" }],
      memories: [],
    });
    const [entry, task] = await resolveSources(
      supabase as never,
      USER,
      citations(
        { id: `entry:${ENTRY}`, type: "entry", sourceId: ENTRY, support: "direct_record" },
        { id: `task:${TASK}`, type: "task", sourceId: TASK, support: "product_state" },
      ),
      "pt-BR",
      NOW,
    );
    expect(entry?.card.state).toBe("previewed");
    expect(task?.card.state).toBe("unavailable");
  });

  it("and the widened vocabulary is still pinned in TypeScript, not in SQL", () => {
    const contracts = read(CONTRACTS);
    // Inverted with the rest: the vocabulary is now three, and it lives in one
    // constant so a fourth cannot be added in one place and missed in another.
    expect(contracts).toContain('export const CITED_SOURCE_TYPES = ["entry", "memory", "task"] as const;');
    expect(contracts).toContain("export type CitedSourceType = (typeof CITED_SOURCE_TYPES)[number];");
    expect(contracts, "the schema must read the constant, not a second literal")
      .toContain("type: z.enum(CITED_SOURCE_TYPES)");
    // Once, and only for the legacy recogniser — a legacy row can never carry a
    // task, because the path that wrote those rows never retrieved one.
    expect([...contracts.matchAll(/z\.enum\(\["entry", "memory"\]\)/g)]).toHaveLength(1);
    // The deployed column carries no check constraint, so widening costs zero
    // migrations. Proved from the migration that created it, not from memory.
    const chat = read("supabase/migrations/202607160006_chat_memory.sql");
    expect(chat).toMatch(/citations jsonb not null default '\[\]'::jsonb/);
    expect(chat, "a deployed constraint would make the vocabulary a migration")
      .not.toMatch(/citations[^\n]*check/i);
  });
});

describe("2Q-FOUNDATION-004: the link gate binds the PAIR — INVERTED by slice 2Q.2", () => {
  /*
   * **This block asserted a defect, and the defect is gone.**
   *
   * As recorded: `authorizeHref`'s allow-set was keyed on the uuid alone and
   * `INTERNAL_ROUTE`'s surface segment was `[a-z-]+` and never read, so an
   * envelope vouching for entry `X` also authorized `/pt-BR/app/work/X`. It was
   * **inert** while the review page passed an empty set, and it went **live the
   * moment slice 2Q.1 filled the column** — which is why slice 2Q.2 closed it in
   * the very next unit rather than at closeout.
   *
   * The set below now holds a `type:id` **pair**, as `vouchedKey` builds it.
   */
  const ID = "44444444-4444-4444-8444-444444444444";
  const vouched = new Set([`task:${ID}`]);

  it("admits ONLY the surface the id was vouched for — INVERTED by slice 2Q.2", () => {
    /*
     * **The inversion this block was written for.** As shipped through
     * `c7c8db0` it asserted the defect: one vouched-for uuid opened `inbox/`,
     * `work/`, `people/`, `projects/` **and** `memories/`, because the allow-set
     * was keyed on the uuid alone and the surface segment was never read.
     *
     * Slice 2Q.2 binds the pair. The id is vouched for **as a task**, so exactly
     * one of those five is admitted and the other four — every one of which used
     * to pass — is refused **by name**, so a regression says which it re-opened.
     */
    expect(authorizeHref(`/pt-BR/app/work/${ID}`, vouched)).toBe(`/pt-BR/app/work/${ID}`);
    for (const surface of ["inbox", "memories", "people", "projects"]) {
      expect(
        authorizeHref(`/pt-BR/app/${surface}/${ID}`, vouched),
        `a task-vouched id still opens ${surface}/ — the gap is back`,
      ).toBeNull();
    }
  });

  it("is not vacuous: an id nobody vouched for is refused on every one of them", () => {
    const other = "55555555-5555-4555-8555-555555555555";
    for (const surface of ["inbox", "work", "people", "projects", "memories"]) {
      expect(authorizeHref(`/pt-BR/app/${surface}/${other}`, vouched)).toBeNull();
    }
  });

  it("reads the surface back to a type, which is what lets it bind one — INVERTED by slice 2Q.2", () => {
    /*
     * The mechanism, not just the outcome. Slice 2Q.0 recorded that
     * `authorizeHref` took **no type at all**, which is why it could not bind
     * one. It now maps the surface segment through `citation-routes.ts` — **one
     * map, shared with the code that BUILDS the hrefs**, so the gate and the
     * renderer cannot drift into disagreeing about a route.
     */
    const markdown = read("src/features/reviews/markdown.ts");
    expect(markdown)
      .toContain("export function authorizeHref(href: string, vouchedFor: ReadonlySet<string>): string | null {");
    expect(markdown, "the surface segment must be captured, not skipped")
      .toContain("const type = citedTypeForSegment(match[1]);");
    expect(markdown, "a segment naming no citable type must be refused outright")
      .toContain("if (!type) return null;");
    expect(markdown, "and the pair must be the key")
      .toContain("vouchedFor.has(vouchedKey(type, match[2]))");
    // One map, two consumers — asserted so a second, private copy of the route
    // table cannot appear beside it.
    const routes = read("src/features/reviews/citation-routes.ts");
    expect(routes).toContain('entry: "inbox"');
    expect(routes).toContain('memory: "memories"');
    expect(routes).toContain('task: "work"');
  });
});

describe("2Q-FOUNDATION-005: 2P-ATTENTION-008's browser half, re-audited", () => {
  /*
   * **The verdict, recorded in the direction the evidence points.**
   *
   * Phase 2P closed this requirement `partial`, with the remainder *"refresh and
   * back navigation proved only at the data layer"*. Re-audited against the
   * current suite that is **half right, and the half that is right is not the
   * half the remainder names.**
   *
   *  - **Refresh IS proved in a browser.** `editable-candidate-confirmation.spec.ts`
   *    reloads the `needs-you` queue inside an `expect.poll` and asserts the row
   *    count, against a hosted disposable fixture.
   *  - **Back navigation is NOT proved, anywhere.** No spec that touches
   *    `needs-you` calls `goBack()`, in that file or in any other.
   *
   * So the remainder is narrower than recorded, and it is still open. Recording
   * it in either direction is what `2Q-FOUNDATION-005` asks for; **it is not
   * this phase's job to discharge it**, and nothing here does.
   */
  const NEEDS_YOU_SPECS = [
    CANDIDATE_SPEC,
    "e2e/intelligent-capture.spec.ts",
    "e2e/online-mobile-navigation.spec.ts",
    "e2e/online-phase-2n-conflicts.spec.ts",
  ] as const;

  it("finds the refresh assertion, named and located", () => {
    const spec = read(CANDIDATE_SPEC);
    expect(spec).toContain("await page.goto(`/${locale}/app/inbox?view=needs-you`);");
    expect(spec, "the reload-inside-poll assertion is the browser proof of refresh")
      .toMatch(/await expect\.poll\(async \(\) => \{\s*await page\.reload\(\);\s*return row\.count\(\);/);
  });

  it("finds no back-navigation assertion on any needs-you surface", () => {
    for (const spec of NEEDS_YOU_SPECS) {
      expect(read(spec), `${spec} now exercises back navigation — re-audit the verdict`)
        .not.toContain("goBack");
    }
  });

  it("is two-sided: the same scan does find goBack where it exists", () => {
    // Without this the assertion above would keep passing if the scan broke.
    expect(read("e2e/online-phase-2p-reviews.spec.ts")).toContain("goBack");
  });
});
