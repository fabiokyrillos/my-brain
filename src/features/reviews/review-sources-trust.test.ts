/**
 * Phase 2Q slice 2Q.3 — **when the record is gone, hidden, or not theirs.**
 *
 * `2Q-TRUST-001` … `-009`.
 *
 * ## Why this file asserts EQUALITIES rather than passing cases
 *
 * The traceability contract refuses *"an indistinguishability requirement proved
 * by separate passing expectations rather than by an asserted equality"*, and
 * says why: `2Q-TRUST-003` and `-004` are properties about **two outputs being
 * the same**, and three green tests are not that property. Three tests can each
 * pass while producing three different outputs — which is exactly how a page
 * becomes a probe for whether another account's id is real.
 *
 * So every indistinguishability below is `expect(a).toEqual(b)` over the **whole
 * resolved output**, driven with the **same id** under different conditions, so
 * the comparison has nothing incidental in it to differ on.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { buildCitationsEnvelope, REVIEW_REACH } from "@/features/conversation-sources/contracts";

import { resolveReviewSources } from "./review-sources";

vi.mock("server-only", () => ({}));

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

const OWNER = "11111111-1111-4111-8111-111111111111";
const ENTRY = "22222222-2222-4222-8222-222222222222";
const TASK = "33333333-3333-4333-8333-333333333333";
const MEMORY = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-08-21T12:00:00.000Z");

/**
 * A client whose reads can be made to **succeed**, **return nothing**, or
 * **fail** — the three conditions `2Q-TRUST-003` compares.
 *
 * `.eq("user_id", …)` is honoured, so "belongs to another account" is modelled
 * the way the database models it: the row exists, and the owner-scoped read
 * simply does not return it. Nothing about foreignness is faked.
 */
function client(rows: Record<string, { id: string; user_id: string; [key: string]: unknown }[]>, failing: readonly string[] = []) {
  return {
    from: (table: string) => {
      let scopedTo: string | null = null;
      const stub: Record<string, unknown> = {};
      stub.select = () => stub;
      stub.eq = (column: string, value: string) => {
        if (column === "user_id") scopedTo = value;
        return stub;
      };
      stub.in = (_column: string, ids: string[]) =>
        Promise.resolve(
          failing.includes(table)
            ? { data: null, error: { message: "read failed" } }
            : {
              data: (rows[table] ?? []).filter((row) => row.user_id === scopedTo && ids.includes(row.id)),
              error: null,
            },
        );
      return stub;
    },
  };
}

const taskRef = { id: `task:${TASK}`, type: "task" as const, sourceId: TASK, support: "product_state" as const };
const entryRef = { id: `entry:${ENTRY}`, type: "entry" as const, sourceId: ENTRY, support: "direct_record" as const };
const memoryRef = { id: `memory:${MEMORY}`, type: "memory" as const, sourceId: MEMORY, support: "product_state" as const };

const envelope = (...sources: (typeof taskRef | typeof entryRef | typeof memoryRef)[]) =>
  buildCitationsEnvelope({ retrievedAnyQualifyingSource: true, sources, reach: REVIEW_REACH });

const resolve = (supabase: unknown, citations: unknown) =>
  resolveReviewSources(supabase as never, OWNER, citations, "pt-BR", NOW);

describe("2Q-TRUST-003/-004: removed, unreadable, foreign and never-existed are ONE outcome", () => {
  /*
   * All four drive **the same citation** — `taskRef` — so the outputs have
   * nothing incidental to differ on. What varies is only the world the read
   * happens in.
   */
  const cited = envelope(taskRef);

  it("produces output that is EQUAL across all four, not merely passing in each", async () => {
    const removed = await resolve(client({ tasks: [] }), cited);
    const unreadable = await resolve(client({ tasks: [{ id: TASK, user_id: OWNER, updated_at: "x" }] }, ["tasks"]), cited);
    const foreign = await resolve(
      client({ tasks: [{ id: TASK, user_id: "99999999-9999-4999-8999-999999999999", updated_at: "x" }] }),
      cited,
    );
    const neverExisted = await resolve(client({}), cited);

    // The load-bearing assertion of this slice, stated once over whole outputs.
    expect(unreadable, "an unreadable record is distinguishable from a removed one").toEqual(removed);
    expect(foreign, "a foreign record is distinguishable from a removed one").toEqual(removed);
    expect(neverExisted, "a nonexistent id is distinguishable from a foreign one").toEqual(foreign);

    // And the shape they all share: refused, with no href and no date.
    expect(removed.rows).toEqual([
      { key: `task:${TASK}`, type: "task", available: false, href: null, occurredAt: null },
    ]);
  });

  it("is not vacuous: the SAME citation resolves when the record is the owner's and readable", async () => {
    /*
     * The control. Without it every equality above would hold trivially for a
     * resolver that returned the refused shape unconditionally — which is the
     * shape of a fix that fixes nothing, and the one that would make this whole
     * file worthless.
     */
    const present = await resolve(
      client({ tasks: [{ id: TASK, user_id: OWNER, updated_at: "2026-08-20T10:00:00Z" }] }),
      cited,
    );
    expect(present.rows).toEqual([
      { key: `task:${TASK}`, type: "task", available: true, href: `/pt-BR/app/work/${TASK}`, occurredAt: "2026-08-20T10:00:00Z" },
    ]);
    const removed = await resolve(client({ tasks: [] }), cited);
    expect(present, "the refused and resolved outputs are identical").not.toEqual(removed);
  });

  it("holds the equality for an ENTRY too, so it is a property and not a task quirk", async () => {
    // Refusal 14: single-type evidence proves the wrong half.
    const cited = envelope(entryRef);
    const removed = await resolve(client({ entries: [] }), cited);
    const unreadable = await resolve(client({ entries: [{ id: ENTRY, user_id: OWNER, occurred_at: "x" }] }, ["entries"]), cited);
    const foreign = await resolve(
      client({ entries: [{ id: ENTRY, user_id: "99999999-9999-4999-8999-999999999999", occurred_at: "x" }] }),
      cited,
    );
    expect(unreadable).toEqual(removed);
    expect(foreign).toEqual(removed);
  });

  it("a failed read on one table does not delete the other table's evidence", async () => {
    /*
     * The half that a blanket "everything is unavailable on error" would have
     * quietly satisfied. A transient failure reading tasks must not make the
     * review's entry citations vanish too — that would let one flaky read erase
     * the product's own report.
     */
    const both = await resolve(
      client(
        {
          entries: [{ id: ENTRY, user_id: OWNER, occurred_at: "2026-08-19T10:00:00Z" }],
          tasks: [{ id: TASK, user_id: OWNER, updated_at: "2026-08-20T10:00:00Z" }],
        },
        ["tasks"],
      ),
      envelope(entryRef, taskRef),
    );
    expect(both.rows[0]).toMatchObject({ type: "entry", available: true });
    expect(both.rows[1]).toMatchObject({ type: "task", available: false, href: null });
  });
});

describe("2Q-TRUST-001: the stored envelope is a claim, never proof the row exists", () => {
  it("refuses a stale envelope whose record has since been deleted", async () => {
    // The envelope is well-formed and names a real-looking id; the world simply
    // no longer contains it. The claim loses to the read, every time.
    const stale = await resolve(client({ tasks: [] }), envelope(taskRef));
    expect(stale.rows[0]?.available).toBe(false);
    expect(stale.rows[0]?.href).toBeNull();
  });

  it("scopes every re-read to the reader, so a foreign row cannot come back", async () => {
    const supabase = client({
      tasks: [{ id: TASK, user_id: "99999999-9999-4999-8999-999999999999", updated_at: "2026-08-20T10:00:00Z" }],
    });
    const foreign = await resolve(supabase, envelope(taskRef));
    expect(foreign.rows[0]?.available).toBe(false);
    // Two-sided: the same row, owned by the reader, does come back — so the
    // refusal is about ownership rather than about a stub that returns nothing.
    const own = await resolve(
      client({ tasks: [{ id: TASK, user_id: OWNER, updated_at: "2026-08-20T10:00:00Z" }] }),
      envelope(taskRef),
    );
    expect(own.rows[0]?.available).toBe(true);
  });
});

describe("2Q-TRUST-005: an archived memory stops being offered as a source", () => {
  /*
   * **Classed `baseline`, and made true rather than left vacuous.**
   *
   * `OD-2Q-2` means no memory can reach this resolver from `generateReview`
   * today. The lifecycle columns were already being read, though, so the check
   * either exists or the requirement is satisfied by nothing happening. Slice
   * 2Q.3 applies it, and these fixtures are what prove it applies.
   */
  const active = { id: MEMORY, user_id: OWNER, valid_from: "2026-01-01T00:00:00Z", valid_until: null, created_at: "2026-01-01T00:00:00Z" };
  const archived = { ...active, valid_until: "2026-08-01T00:00:00Z" };

  it("refuses an out-of-force memory with the SAME output a deleted one gets", async () => {
    const outOfForce = await resolve(client({ memories: [archived] }), envelope(memoryRef));
    const deleted = await resolve(client({ memories: [] }), envelope(memoryRef));
    expect(outOfForce, "an archived memory is distinguishable from a deleted one").toEqual(deleted);
    expect(outOfForce.rows[0]?.available).toBe(false);
  });

  it("is not vacuous: an in-force memory resolves through the same path", async () => {
    const inForce = await resolve(client({ memories: [active] }), envelope(memoryRef));
    expect(inForce.rows[0]).toMatchObject({
      type: "memory",
      available: true,
      href: `/pt-BR/app/memories/${MEMORY}`,
    });
  });

  it("uses the shared predicate rather than a second notion of in-force", () => {
    // One predicate, shared with chat's resolver, the SQL retrieval bound and
    // the badge the owner reads — so none of the four can disagree.
    expect(read("src/features/reviews/review-sources.ts")).toContain("isMemoryInForce");
  });
});

describe("2Q-TRUST-006: a row cannot disclose a classification by its shape", () => {
  it("produces rows for a normal and a highly_sensitive record that are EQUAL but for the href id", async () => {
    /*
     * The property, asserted as an equality over the resolved rows.
     *
     * The two fixtures differ **only** in the classification their underlying
     * record carries — same kind, same date — and the resolver never reads that
     * column, so the outputs must be identical apart from the identifier the
     * href names. A list that identified ordinary records and withheld
     * identification for sensitive ones would leak the classification through
     * the protection rather than through the exposure.
     */
    const SENSITIVE = "55555555-5555-4555-8555-555555555555";
    const WHEN = "2026-08-19T10:00:00Z";
    const normal = await resolve(
      client({ entries: [{ id: ENTRY, user_id: OWNER, occurred_at: WHEN, sensitivity: "normal" }] }),
      envelope(entryRef),
    );
    const sensitive = await resolve(
      client({ entries: [{ id: SENSITIVE, user_id: OWNER, occurred_at: WHEN, sensitivity: "highly_sensitive" }] }),
      envelope({ ...entryRef, id: `entry:${SENSITIVE}`, sourceId: SENSITIVE }),
    );

    const withoutIdentity = (rows: readonly unknown[]) =>
      (rows as { href: string | null; key: string }[]).map((row) => ({
        ...row,
        href: row.href?.replace(/[^/]+$/, "{id}") ?? null,
        key: row.key.replace(/:.+$/, ":{id}"),
      }));

    expect(withoutIdentity(sensitive.rows), "the row's shape varies with the classification")
      .toEqual(withoutIdentity(normal.rows));
    // …and the only thing that did differ is the identifier.
    expect(sensitive.rows[0]?.href).not.toBe(normal.rows[0]?.href);
  });

  it("never reads a classification at all, which is why it cannot vary on one", () => {
    const source = read("src/features/reviews/review-sources.ts");
    // Asserted on the QUERY. A `select` carrying `sensitivity` would put the
    // classification one edit from a branch even with nothing branching today.
    for (const select of [...source.matchAll(/\.select\("([^"]+)"\)/g)].map((m) => m[1])) {
      expect(select, `a resolver query selects ${select}`).not.toContain("sensitivity");
    }
  });

  it("leaves the inherited convergence guard unweakened, with its reviews file list unchanged", () => {
    /*
     * `2Q-TRUST-006`'s second observable, asserted as a **byte** property rather
     * than by re-running the guard: the three files it names must still be
     * exactly those three, and the assertion must still forbid both tokens.
     *
     * The new files are deliberately NOT added. Two reasons that agree: the
     * requirement says the list stays unchanged, and that guard does not strip
     * comments — so it would fail on the very paragraphs explaining why
     * `resolveContent` is never called.
     */
    const guard = read("src/lib/closeout/sensitivity-convergence.test.ts");
    const at = guard.indexOf("no reviews surface fabricates");
    expect(at, "the inherited assertion is gone").toBeGreaterThan(-1);
    const block = guard.slice(at, guard.indexOf("});", at));
    const files = [...block.matchAll(/"(src\/[^"]+\.tsx?)"/g)].map((match) => match[1]);
    expect(files, "the reviews file list moved").toEqual([
      "src/app/[locale]/app/reviews/[reviewId]/page.tsx",
      "src/features/reviews/review-presentation.ts",
      "src/features/reviews/review-list.ts",
    ]);
    expect(block, "the assertion no longer forbids both tokens")
      .toContain("not.toMatch(/resolveContent");
    expect(block).toContain('"highly_sensitive"');
  });
});

describe("2Q-TRUST-007: the phase adds no second sensitivity derivation", () => {
  const contracts = () => read("src/features/sensitivity/contracts.ts");

  it("leaves the RULES row for review_summary byte-unchanged", () => {
    expect(contracts())
      .toContain("review_summary: { normal: SHOW, private: SHOW, highly_sensitive: MASK },");
  });

  it("leaves GOVERNED_SURFACES byte-unchanged", () => {
    const source = contracts();
    const start = source.indexOf("export const GOVERNED_SURFACES = [");
    const list = source.slice(start, source.indexOf("] as const", start));
    /*
     * The whole list, in order, rather than a count or a spot-check. A count
     * passes on a surface swapped for another; a spot-check on `review_summary`
     * passes on twelve surfaces silently disappearing. This phase must move none
     * of them, so it pins all of them.
     */
    expect([...list.matchAll(/"([a-z_]+)"/g)].map((match) => match[1])).toEqual([
      "hoje", "attention", "capture_receipt", "review_summary", "notification",
      "chat", "work", "calendar", "person", "project", "memory", "file", "graph",
    ]);
  });

  it("introduces no new presentation variant", () => {
    // `MASK` carries `revealable: true`, which is why option C avoids masking on
    // this path entirely rather than trying to suppress the affordance.
    const source = contracts();
    const variants = [...source.matchAll(/^const ([A-Z_]+): Presentation = (\{[^}]+\})/gm)]
      .map((match) => `${match[1]} ${match[2]}`);
    // Pinned with their bodies, not just their names. `MASK` carrying
    // `revealable: true` is the exact fact that made option C the only way to
    // honour "no reveal control" without editing the RULES table — so a variant
    // whose body changed would matter as much as one added.
    expect(variants).toEqual([
      'SHOW { outcome: "show", revealable: false }',
      'MASK { outcome: "mask", revealable: true }',
      'OMIT { outcome: "omit", revealable: false }',
    ]);
  });

  it("keeps deriveTaskSensitivity the only task derivation, and does not use it here", () => {
    const reviews = read("src/features/reviews/review-sources.ts");
    expect(reviews, "the review path derives a task's classification")
      .not.toContain("deriveTaskSensitivity");
    // Two-sided: the derivation really does exist elsewhere, so its absence here
    // is a fact about this path rather than about a token nobody uses.
    expect(read("src/features/daily-cycle/task-detail-projection.ts")).toContain("deriveTaskSensitivity");
  });
});

describe("2Q-TRUST-008: a malformed envelope is refused as a whole", () => {
  const good = envelope(entryRef, taskRef);

  it("refuses all four references when one is corrupt", async () => {
    const corrupt = {
      ...good,
      sources: [entryRef, taskRef, { ...taskRef, sourceId: "not-a-uuid" }, entryRef],
    };
    const supabase = client({
      entries: [{ id: ENTRY, user_id: OWNER, occurred_at: "2026-08-19T10:00:00Z" }],
      tasks: [{ id: TASK, user_id: OWNER, updated_at: "2026-08-20T10:00:00Z" }],
    });
    const resolved = await resolve(supabase, corrupt);
    expect(resolved.rows, "three references were salvaged from a broken envelope").toEqual([]);
    // And the row is reported as UNRECORDED rather than as "found nothing",
    // because a broken envelope records nothing about what retrieval found.
    expect(resolved.unrecorded).toBe(true);
  });

  it("refuses a reference carrying content, rather than stripping the field", async () => {
    const smuggled = { ...good, sources: [{ ...taskRef, excerpt: "texto do registro" }] };
    const resolved = await resolve(client({}), smuggled);
    expect(resolved.rows).toEqual([]);
    expect(JSON.stringify(resolved)).not.toContain("texto do registro");
  });

  it("is not vacuous: the same envelope without the corruption resolves both references", async () => {
    const supabase = client({
      entries: [{ id: ENTRY, user_id: OWNER, occurred_at: "2026-08-19T10:00:00Z" }],
      tasks: [{ id: TASK, user_id: OWNER, updated_at: "2026-08-20T10:00:00Z" }],
    });
    const resolved = await resolve(supabase, good);
    expect(resolved.rows).toHaveLength(2);
    expect(resolved.rows.every((row) => row.available)).toBe(true);
  });
});

describe("2Q-TRUST-009: no reveal control exists anywhere on the citation path", () => {
  it("renders no control-bearing markup in any of the three files", () => {
    /*
     * The render-side assertion lives in `review-sources-list.test.tsx`, where a
     * **planted reveal button** proves the scan can fail. This is the source
     * side: the path contains no reveal affordance to render in the first place.
     */
    const strip = (source: string) =>
      source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
        .join("\n");
    for (const file of [
      "src/features/reviews/review-sources.ts",
      "src/features/reviews/review-sources-list.tsx",
      "src/features/reviews/citation-routes.ts",
    ]) {
      const code = strip(read(file));
      for (const token of ["<button", "onClick", "useState", "revealable", "Mostrar", "Show anyway"]) {
        expect(code, `${file} carries ${token}`).not.toContain(token);
      }
    }
  });
});
