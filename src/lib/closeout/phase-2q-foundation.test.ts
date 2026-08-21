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
 * `2Q-FOUNDATION-003` and `-004` assert behaviour that is **wrong**, by
 * executing it. That is the point: the phase begins from a demonstrated defect
 * rather than from an argument, and slices 2Q.1 and 2Q.2 invert these blocks
 * rather than deleting them. A test that only ever described the fixed state
 * could never show that the defect was real.
 *
 * **When you come here to invert one, invert it — do not delete it.** An absence
 * nobody asserts is an absence nobody notices disappearing, which is the rule
 * this repository has held since Phase 2N.
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

/** The line a pattern is on, 1-indexed, so a finding is recorded as a location. */
function lineOf(relative: string, pattern: RegExp): number {
  const lines = read(relative).split("\n");
  const index = lines.findIndex((line) => pattern.test(line));
  expect(index, `${relative} no longer contains ${pattern}`).toBeGreaterThan(-1);
  return index + 1;
}

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

    // Recorded as locations, because a finding without one is an opinion.
    expect(lineOf(AGENT_ACTIONS, /\.from\("entries"\)/)).toBe(932);
    expect(lineOf(AGENT_ACTIONS, /\.from\("tasks"\)/)).toBe(939);
  });

  it("never mentions citedSourceIds anywhere in the action file", () => {
    /*
     * The strongest available form of "it is discarded": the provider returns
     * the field, `generateReview` holds the whole answer in `answer`, and the
     * identifier does not occur in the file at all. There is no partial read to
     * miss, and no code path that could be quietly carrying it.
     */
    expect(read(AGENT_ACTIONS)).not.toContain("citedSourceIds");
  });

  it("writes a summaries row that carries no citation field", () => {
    const body = generateReviewBody();
    const upsert = body.slice(body.indexOf('.from("summaries")'));
    for (const forbidden of ["citations", "cited_source", "sources:"]) {
      expect(upsert, `the write already carries ${forbidden}`).not.toContain(forbidden);
    }
    expect(lineOf(AGENT_ACTIONS, /\.from\("summaries"\)/)).toBe(1045);
  });

  it("labels a task with the memory prefix, which is the finding that matters", () => {
    const body = generateReviewBody();
    expect(body, "the task branch stopped calling itself a memory")
      .toMatch(/id: `memory:\$\{item\.id\}`/);
    expect(body, "the task branch stopped declaring the memory type")
      .toMatch(/type: "memory" as const/);
    // And it is the *task* query it is built from — the mislabel, located.
    expect(body.indexOf('.from("tasks")')).toBeLessThan(body.indexOf("id: `memory:"));
    expect(lineOf(AGENT_ACTIONS, /id: `memory:\$\{item\.id\}`/)).toBe(970);
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

  it("carries exactly fourteen columns, none of which can hold a reference", () => {
    const columns = [...summariesRow().matchAll(/^ {10}([a-z_]+):/gm)].map((match) => match[1]);
    expect(columns.sort()).toEqual([
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
    expect(columns).toHaveLength(14);
  });

  it("declares no relationship, so there is no join table either", () => {
    const types = read(TYPES);
    const at = types.indexOf("      summaries: {");
    const block = types.slice(at, types.indexOf("      tags: {", at));
    expect(block).toContain("Relationships: []");
  });

  it("has no migration creating a citations column or a summary join table", () => {
    // Read from the migration chain rather than from the types, because the
    // types are a generated artifact and could in principle lag the schema.
    const migrations = join(REPO, "supabase", "migrations");
    const hits: string[] = [];
    for (const name of readdirSync(migrations)) {
      const sql = readFileSync(join(migrations, name), "utf8");
      if (/summaries[\s\S]{0,200}?citation/i.test(sql) || /summary_(citations|sources)/i.test(sql)) {
        hits.push(name);
      }
    }
    expect(hits, "a citation store for summaries already exists").toEqual([]);
  });

  it("and the review page therefore vouches for nothing", () => {
    expect(read(REVIEW_PAGE)).toContain("allowedIds: new Set<string>()");
    expect(lineOf(REVIEW_PAGE, /allowedIds: new Set<string>\(\)/)).toBe(125);
  });
});

describe("2Q-FOUNDATION-003: a task uuid stored as a memory resolves to unavailable — EXECUTED", () => {
  /*
   * **This block asserts a defect.** It is the failure the phase exists to
   * prevent: reuse the chat envelope verbatim, and every task citation degrades
   * in silence while every entry citation passes.
   *
   * Slice 2Q.1 widens the vocabulary to `entry | memory | task`. When it does,
   * this block is **inverted** — the same fixture must then resolve to a task
   * card — not removed.
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

  it("resolves the mislabelled task to unavailable, silently", async () => {
    const { supabase, asked } = client({
      // The task row exists and is the owner's. Nothing looks for it.
      tasks: [{ id: TASK, title: "Fechar o contrato", status: "done" }],
      memories: [],
    });
    const [source] = await resolveSources(
      supabase as never,
      USER,
      citations({ id: `memory:${TASK}`, type: "memory", sourceId: TASK, support: "product_state" }),
      "pt-BR",
      NOW,
    );
    expect(source?.card.state).toBe("unavailable");
    // The whole finding in one assertion: the resolver never asks `tasks`.
    expect(asked, "the resolver already reads tasks").not.toContain("tasks");
    expect(asked).toContain("memories");
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
        { id: `memory:${TASK}`, type: "memory", sourceId: TASK, support: "product_state" },
      ),
      "pt-BR",
      NOW,
    );
    expect(entry?.card.state).toBe("previewed");
    expect(task?.card.state).toBe("unavailable");
  });

  it("and the vocabulary that causes it is pinned in TypeScript, not in SQL", () => {
    const contracts = read(CONTRACTS);
    expect(contracts).toContain('export type CitedSourceType = "entry" | "memory";');
    expect(contracts).toContain('export const ANSWER_REACH = ["entry", "memory"] as const;');
    // Twice: the current `referenceSchema` and the legacy recogniser.
    expect([...contracts.matchAll(/z\.enum\(\["entry", "memory"\]\)/g)]).toHaveLength(2);
    // The deployed column carries no check constraint, so widening costs zero
    // migrations. Proved from the migration that created it, not from memory.
    const chat = read("supabase/migrations/202607160006_chat_memory.sql");
    expect(chat).toMatch(/citations jsonb not null default '\[\]'::jsonb/);
    expect(chat, "a deployed constraint would make the vocabulary a migration")
      .not.toMatch(/citations[^\n]*check/i);
  });
});

describe("2Q-FOUNDATION-004: an entry-vouched id authorizes a task route — EXECUTED", () => {
  /*
   * **This block asserts a defect too.** `authorizeHref`'s allow-set is keyed on
   * the uuid alone and `INTERNAL_ROUTE`'s surface segment is `[a-z-]+`, so an
   * envelope vouching for entry `X` also authorizes `/pt-BR/app/work/X`.
   *
   * **Inert today** — the review page passes an empty set — and **live the
   * moment slice 2Q.1 populates it. Slice 2Q.2 inverts this block.**
   */
  const ID = "44444444-4444-4444-8444-444444444444";
  const vouched = new Set([ID]);

  it("admits the same id on every surface, which is the gap", () => {
    for (const surface of ["inbox", "work", "people", "projects", "memories"]) {
      expect(
        authorizeHref(`/pt-BR/app/${surface}/${ID}`, vouched),
        `${surface} is already refused — the gate now binds more than the uuid`,
      ).toBe(`/pt-BR/app/${surface}/${ID}`);
    }
  });

  it("is not vacuous: an id nobody vouched for is refused on every one of them", () => {
    const other = "55555555-5555-4555-8555-555555555555";
    for (const surface of ["inbox", "work", "people", "projects", "memories"]) {
      expect(authorizeHref(`/pt-BR/app/${surface}/${other}`, vouched)).toBeNull();
    }
  });

  it("takes no type at all, which is why it cannot bind one", () => {
    expect(read("src/features/reviews/markdown.ts"))
      .toContain("export function authorizeHref(href: string, allowedIds: ReadonlySet<string>): string | null {");
    expect(lineOf("src/features/reviews/markdown.ts", /^export function authorizeHref\(/)).toBe(135);
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
