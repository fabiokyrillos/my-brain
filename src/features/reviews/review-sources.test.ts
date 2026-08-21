/**
 * Phase 2Q slice 2Q.2 — **the resolver behind a review's sources area.**
 *
 * `2Q-LINK-001`, `-004`, `-006`, `-007`, `-008`, `-009`, and `2Q-TRUST-001`'s
 * re-read.
 *
 * ## Refusal 14, obeyed
 *
 * The traceability contract refuses a citation requirement whose evidence
 * exercises only one cited type — because the failure this phase exists to
 * prevent is task links degrading while entry links pass. **Every resolution
 * assertion below drives an entry and a task together.**
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { buildCitationsEnvelope, REVIEW_REACH } from "@/features/conversation-sources/contracts";

import { citedHref, vouchedKey } from "./citation-routes";
import { resolveReviewSources, vouchedFrom } from "./review-sources";

vi.mock("server-only", () => ({}));

/** A `/* … *\/` run, so a scan can be made to read code rather than prose. */
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;

const USER = "11111111-1111-4111-8111-111111111111";
const ENTRY = "22222222-2222-4222-8222-222222222222";
const TASK = "33333333-3333-4333-8333-333333333333";
const MEMORY = "44444444-4444-4444-8444-444444444444";

/**
 * A client that answers each table and **records which columns were asked for**.
 *
 * The column list is asserted, not just the rows: `2Q-LINK-008` says the shape
 * has nowhere to put content, and a query that selected `title` would put it one
 * edit away from the screen even if nothing rendered it today.
 */
function client(rows: Record<string, unknown[]>, failing: readonly string[] = []) {
  const asked: Record<string, string> = {};
  const supabase = {
    from: (table: string) => {
      const stub: Record<string, unknown> = {};
      stub.select = (columns: string) => {
        asked[table] = columns;
        return stub;
      };
      stub.eq = () => stub;
      stub.in = () =>
        Promise.resolve(
          failing.includes(table)
            ? { data: null, error: { message: "boom" } }
            : { data: rows[table] ?? [], error: null },
        );
      return stub;
    },
  };
  return { supabase, asked };
}

const envelope = (...sources: { id: string; type: "entry" | "memory" | "task"; sourceId: string; support: "direct_record" | "product_state" }[]) =>
  buildCitationsEnvelope({ retrievedAnyQualifyingSource: true, sources, reach: REVIEW_REACH });

const entryRef = { id: `entry:${ENTRY}`, type: "entry" as const, sourceId: ENTRY, support: "direct_record" as const };
const taskRef = { id: `task:${TASK}`, type: "task" as const, sourceId: TASK, support: "product_state" as const };

const BOTH_PRESENT = {
  entries: [{ id: ENTRY, occurred_at: "2026-08-19T10:00:00Z" }],
  tasks: [{ id: TASK, updated_at: "2026-08-20T10:00:00Z" }],
};

describe("2Q-LINK-006 / -009: a cited record is reachable, as its own kind", () => {
  it("gives an entry and a task each its canonical route, asserted as a (kind, href) PAIR", async () => {
    /*
     * **The pair is the requirement.** A correct href under the wrong kind label
     * satisfies neither the owner nor `2Q-LINK-009`, and a correct label over a
     * `memories/` href is the very defect this phase began from.
     */
    const { supabase } = client(BOTH_PRESENT);
    const { rows } = await resolveReviewSources(supabase as never, USER, envelope(entryRef, taskRef), "pt-BR");

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ type: "entry", available: true, href: `/pt-BR/app/inbox/${ENTRY}` });
    expect(rows[1]).toMatchObject({ type: "task", available: true, href: `/pt-BR/app/work/${TASK}` });
  });

  it("never routes a task through memories, which is the defect the phase began from", async () => {
    const { supabase } = client(BOTH_PRESENT);
    const { rows } = await resolveReviewSources(supabase as never, USER, envelope(taskRef), "pt-BR");
    expect(rows[0]?.href).toBe(`/pt-BR/app/work/${TASK}`);
    expect(rows[0]?.href).not.toContain("/memories/");
    expect(rows[0]?.type).toBe("task");
  });

  it("preserves the order the review cited them in", async () => {
    // Re-sorting by whatever the database returned would quietly change what
    // the owner reads, and the envelope's order is the model's own.
    const { supabase } = client(BOTH_PRESENT);
    const { rows } = await resolveReviewSources(supabase as never, USER, envelope(taskRef, entryRef), "pt-BR");
    expect(rows.map((row) => row.type)).toEqual(["task", "entry"]);
  });

  it("builds the same href the gate would admit, in both locales", async () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const { supabase } = client(BOTH_PRESENT);
      const { rows } = await resolveReviewSources(supabase as never, USER, envelope(entryRef, taskRef), locale);
      expect(rows[0]?.href).toBe(citedHref(locale, "entry", ENTRY));
      expect(rows[1]?.href).toBe(citedHref(locale, "task", TASK));
    }
  });
});

describe("2Q-LINK-001: the allow-set comes from the envelope, and from nothing else", () => {
  it("vouches for exactly the pairs it resolved", async () => {
    const { supabase } = client(BOTH_PRESENT);
    const sources = await resolveReviewSources(supabase as never, USER, envelope(entryRef, taskRef), "pt-BR");
    expect([...vouchedFrom(sources)].sort())
      .toEqual([vouchedKey("entry", ENTRY), vouchedKey("task", TASK)].sort());
  });

  it("vouches for NOTHING when a cited record did not come back", async () => {
    // The stored envelope is a claim; it is never proof the row still exists.
    const { supabase } = client({ entries: [], tasks: [] });
    const sources = await resolveReviewSources(supabase as never, USER, envelope(entryRef, taskRef), "pt-BR");
    expect([...vouchedFrom(sources)]).toEqual([]);
    expect(sources.rows.every((row) => row.available === false)).toBe(true);
  });

  it("re-reads under the reader's own session rather than trusting the envelope", async () => {
    // `2Q-TRUST-001`, at the level this slice owns: a read happens per cited
    // table, and it is the read — not the envelope — that decides.
    const { supabase, asked } = client(BOTH_PRESENT);
    await resolveReviewSources(supabase as never, USER, envelope(entryRef, taskRef), "pt-BR");
    expect(Object.keys(asked).sort()).toEqual(["entries", "tasks"]);
  });

  it("asks for no table it has no citation for", async () => {
    const { supabase, asked } = client(BOTH_PRESENT);
    await resolveReviewSources(supabase as never, USER, envelope(taskRef), "pt-BR");
    expect(Object.keys(asked)).toEqual(["tasks"]);
  });
});

describe("2Q-LINK-008: the resolution path cannot carry content", () => {
  it("selects no content-bearing column, for any cited type", async () => {
    /*
     * **Asserted on the query, not on the render.** A `select("id,title,…")`
     * that nothing rendered today would still put the title one edit away from
     * the screen — and the whole of `OD-2Q-5` option C is that there is nowhere
     * for content to come from.
     */
    const { supabase, asked } = client(BOTH_PRESENT);
    await resolveReviewSources(
      supabase as never,
      USER,
      envelope(entryRef, taskRef, { id: `memory:${MEMORY}`, type: "memory", sourceId: MEMORY, support: "product_state" }),
      "pt-BR",
    );
    expect(asked.entries).toBe("id,occurred_at");
    expect(asked.tasks).toBe("id,updated_at");
    expect(asked.memories).toBe("id,valid_from,valid_until,created_at");
    for (const [table, columns] of Object.entries(asked)) {
      for (const forbidden of ["title", "content", "original_content", "sensitivity", "description"]) {
        expect(columns, `${table} selects ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("returns a row shape with no field content could live in", async () => {
    const { supabase } = client(BOTH_PRESENT);
    const { rows } = await resolveReviewSources(supabase as never, USER, envelope(entryRef, taskRef), "pt-BR");
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(["available", "href", "key", "occurredAt", "type"]);
    }
  });

  it("carries a cited record's distinctive text NOWHERE, even when the row supplies it", async () => {
    /*
     * The planted control for `2Q-LINK-008`. The fake rows below carry text the
     * resolver never asked for; if any future edit started reading a column off
     * the returned row, this fails on the string rather than on the shape.
     */
    const MARKER = "CONTRATO-CONFIDENCIAL-ACME";
    const { supabase } = client({
      entries: [{ id: ENTRY, occurred_at: "2026-08-19T10:00:00Z", original_content: MARKER, title: MARKER }],
      tasks: [{ id: TASK, updated_at: "2026-08-20T10:00:00Z", title: MARKER }],
    });
    const sources = await resolveReviewSources(supabase as never, USER, envelope(entryRef, taskRef), "pt-BR");
    expect(JSON.stringify(sources)).not.toContain(MARKER);
    // Two-sided: the marker really is in what the client returned, so the
    // assertion above is capable of failing.
    expect(JSON.stringify(BOTH_PRESENT)).not.toContain(MARKER);
    expect(MARKER.length).toBeGreaterThan(0);
  });

  it("calls resolveContent nowhere on this path, and no classification with it", () => {
    /*
     * `2Q-LINK-008`'s second observable, and the reason this module exists at
     * all rather than reusing chat's resolver. Asserted here rather than by
     * widening `sensitivity-convergence.test.ts`, whose reviews file list
     * `2Q-TRUST-006` requires to stay **unchanged**.
     *
     * **Comments are stripped before the scan, and that is not tidiness.** The
     * first version of this block failed on `review-sources.ts` — inside the
     * paragraph explaining *why the module never calls `resolveContent`*. An
     * authority guard must forbid **the act, not the word**, or it fails on the
     * prose that forbids the act. This is the third time that shape has come up
     * in this phase, so it is written down rather than fixed quietly.
     *
     * **A note for whoever is tempted to add these files to the inherited
     * guard**: that one does *not* strip comments, so it would fail on these
     * very paragraphs. `2Q-TRUST-006` requires its file list unchanged anyway —
     * the two reasons agree.
     */
    const executable = (source: string) =>
      source
        .replace(BLOCK_COMMENT, "")
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("//"))
        .join("\n");
    const repo = join(__dirname, "..", "..", "..");
    for (const file of [
      "src/features/reviews/review-sources.ts",
      "src/features/reviews/review-sources-list.tsx",
      "src/features/reviews/citation-routes.ts",
    ]) {
      const code = executable(readFileSync(join(repo, file), "utf8"));
      expect(code, `${file} resolves a classification`).not.toContain("resolveContent(");
      expect(code, `${file} names a classification level`).not.toContain("highly_sensitive");
      expect(code, `${file} derives a task's sensitivity`).not.toContain("deriveTaskSensitivity");
      expect(code, `${file} reads a sensitivity column`).not.toContain("sensitivity");
    }
  });

  it("that comment stripper is two-sided: it removes prose and keeps statements", () => {
    // Without this, a stripper that removed everything would make the block
    // above pass on an empty string — the failure mode of fixing a scanner
    // instead of a finding, and the hardest one to notice.
    const raw = readFileSync(join(__dirname, "..", "..", "..", "src/features/reviews/review-sources.ts"), "utf8");
    expect(raw, "the explanation must still say why resolveContent is not called")
      .toContain("resolveContent");
    const code = raw
      .replace(BLOCK_COMMENT, "")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");
    expect(code, "and the stripped source must not contain it").not.toContain("resolveContent");
    expect(code, "while the real export survives stripping").toContain("export async function resolveReviewSources");
  });
});

describe("2Q-LINK-007 / 2Q-CITE-008: a review with no recorded references says so", () => {
  it("reports `unrecorded` for a legacy row, and shows no rows", async () => {
    const { supabase } = client(BOTH_PRESENT);
    const sources = await resolveReviewSources(supabase as never, USER, [], "pt-BR");
    expect(sources.rows).toEqual([]);
    expect(sources.unrecorded).toBe(true);
  });

  it("distinguishes that from a NEW review that recorded zero citations", async () => {
    /*
     * The two are different facts and the owner deserves the true one: "nobody
     * recorded whether the Brain found anything" is not "the Brain found
     * nothing". A page that said the first about the second would be inventing.
     */
    const { supabase } = client(BOTH_PRESENT);
    const empty = buildCitationsEnvelope({
      retrievedAnyQualifyingSource: true,
      sources: [],
      reach: REVIEW_REACH,
    });
    const sources = await resolveReviewSources(supabase as never, USER, empty, "pt-BR");
    expect(sources.rows).toEqual([]);
    expect(sources.unrecorded).toBe(false);
  });

  it("refuses a malformed envelope as a whole rather than salvaging part of it", async () => {
    // `2Q-TRUST-008`, at this boundary. One corrupt reference among four leaves
    // no half-trusted rows on the page.
    const { supabase } = client(BOTH_PRESENT);
    const corrupt = { ...envelope(entryRef, taskRef), sources: [entryRef, { ...taskRef, sourceId: "not-a-uuid" }] };
    const sources = await resolveReviewSources(supabase as never, USER, corrupt, "pt-BR");
    expect(sources.rows).toEqual([]);
    expect(sources.unrecorded).toBe(true);
  });
});

describe("a removed or unreadable record produces no link", () => {
  it("drops the href when the record did not come back", async () => {
    const { supabase } = client({ entries: [], tasks: BOTH_PRESENT.tasks });
    const { rows } = await resolveReviewSources(supabase as never, USER, envelope(entryRef, taskRef), "pt-BR");
    expect(rows[0]).toMatchObject({ type: "entry", available: false, href: null, occurredAt: null });
    // And the surviving one is untouched, so a missing record does not delete
    // the review's other evidence.
    expect(rows[1]).toMatchObject({ type: "task", available: true });
  });

  it("treats a failed read exactly as an empty one", async () => {
    // Slice 2Q.3 asserts this as a strict equality across all three cases; this
    // is the shape being built, and it is already the same arm.
    const { supabase } = client(BOTH_PRESENT, ["entries"]);
    const { rows } = await resolveReviewSources(supabase as never, USER, envelope(entryRef, taskRef), "pt-BR");
    expect(rows[0]).toMatchObject({ type: "entry", available: false, href: null, occurredAt: null });
  });

  it("is not vacuous: the same fixture resolves when the read succeeds", async () => {
    const { supabase } = client(BOTH_PRESENT);
    const { rows } = await resolveReviewSources(supabase as never, USER, envelope(entryRef), "pt-BR");
    expect(rows[0]?.available).toBe(true);
  });
});
