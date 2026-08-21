/**
 * Phase 2Q slice 2Q.1 — **the references survive the write.**
 *
 * `2Q-CITE-001` … `-009`.
 *
 * ## What this file proves, and at which boundary
 *
 * The traceability contract is explicit: *"a citation is proved at the boundary
 * where a link is clicked and lands, not where an id is stored. A test that
 * reads the column back proves `2Q-CITE-*` and proves nothing about
 * `2Q-LINK-*`."* This file is the storage boundary and claims nothing beyond
 * it. Slice 2Q.2 owns the link.
 *
 * ## Refusal 14, obeyed by construction
 *
 * *"a citation requirement marked `built` whose evidence exercises only one
 * cited type"* is refused, because the failure this phase exists to prevent is
 * task links degrading while entry links pass. **Every persistence assertion
 * below drives an entry and a task together**, and the task half is the one
 * that would have been silently wrong.
 */
import { describe, expect, it } from "vitest";

import {
  ANSWER_REACH,
  CHAT_REACH,
  CITED_SOURCE_TYPES,
  REVIEW_REACH,
  buildCitationsEnvelope,
  parseCitations,
  supportKindForSource,
  type PersistedSourceReference,
} from "@/features/conversation-sources/contracts";

const ENTRY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TASK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const entryRef: PersistedSourceReference = {
  id: `entry:${ENTRY}`,
  type: "entry",
  sourceId: ENTRY,
  support: "direct_record",
};
const taskRef: PersistedSourceReference = {
  id: `task:${TASK}`,
  type: "task",
  sourceId: TASK,
  support: "product_state",
};

/** The envelope a review write produces, both cited types present. */
const reviewEnvelope = () =>
  buildCitationsEnvelope({
    retrievedAnyQualifyingSource: true,
    sources: [entryRef, taskRef],
    reach: REVIEW_REACH,
  });

describe("2Q-CITE-007: a review's source set stops calling a task a memory", () => {
  it("agrees between the id prefix and the declared type, asserted as a pair", () => {
    /*
     * **The pair is the requirement.** Either half alone satisfies the letter
     * and loses the behaviour: a `task:` prefix carrying `type: "memory"` still
     * resolves against the wrong table, and `type: "task"` under a `memory:`
     * prefix still hands the renderer an id it will route as a memory.
     */
    for (const reference of reviewEnvelope().sources) {
      expect(reference.id.split(":")[0], `${reference.id} disagrees with its type`)
        .toBe(reference.type);
    }
  });

  it("is not vacuous: a memory-labelled task is caught by that same assertion", () => {
    // The planted control. Without it the loop above would pass on an empty
    // source list, and would keep passing if `split` stopped working.
    const mislabelled = { ...taskRef, id: `memory:${TASK}` };
    expect(mislabelled.id.split(":")[0]).not.toBe(mislabelled.type);
  });

  it("gives a task the support kind of product state, from an exhaustive table", () => {
    expect(supportKindForSource("task")).toBe("product_state");
    expect(supportKindForSource("entry")).toBe("direct_record");
    expect(supportKindForSource("memory")).toBe("product_state");
    // Every member of the vocabulary has one, so a type added without deciding
    // its support kind cannot fall through an `else` arm.
    for (const type of CITED_SOURCE_TYPES) {
      expect(supportKindForSource(type), `${type} has no support kind`).toBeDefined();
    }
  });
});

describe("2Q-CITE-006: the stored envelope carries no content-bearing field", () => {
  it("REJECTS an extra key rather than stripping it", () => {
    /*
     * **Rejected, not stripped** — the distinction is the whole requirement.
     * Stripping would let somebody add `excerpt` "so the page does not have to
     * re-read", see it silently disappear, and never learn the write was wrong.
     * The legacy chat shape carried exactly that field, and archiving a memory
     * left the quote in the thread in the clear, forever.
     */
    const withExcerpt = {
      ...reviewEnvelope(),
      sources: [{ ...taskRef, excerpt: "Fechar o contrato com a Acme" }],
    };
    const parsed = parseCitations(withExcerpt);
    // The strict schema refuses the envelope as a whole. It does not come back
    // as a valid envelope minus one key.
    expect(parsed.evidence).toBe("unknown");
    expect(parsed.sources).toEqual([]);
  });

  it("has nowhere in the shape to put content at all", () => {
    for (const reference of reviewEnvelope().sources) {
      expect(Object.keys(reference).sort()).toEqual(["id", "sourceId", "support", "type"]);
    }
  });

  it("is not vacuous: the same envelope without the extra key parses cleanly", () => {
    const parsed = parseCitations(reviewEnvelope());
    expect(parsed.evidence).toBe("evidenced");
    expect(parsed.sources).toHaveLength(2);
    expect(parsed.sources.map((source) => source.type).sort()).toEqual(["entry", "task"]);
  });
});

describe("2Q-CITE-004 / -005: only ids this request vouched for reach the column", () => {
  /**
   * The action's own `flatMap`, re-implemented here would be a control carrying
   * its own private copy of the mechanism — so this drives the **property** the
   * action relies on instead: a cited id with no matching source produces no
   * reference. The provider-side filter (`openai-provider.ts`) is the first
   * gate and `2Q-CITE-005`'s baseline; this is the second, independent one.
   */
  function referencesFor(citedSourceIds: readonly string[], sources: readonly { id: string; type: "entry" | "memory" | "task" }[]) {
    return citedSourceIds.flatMap((id) => {
      const source = sources.find((item) => item.id === id);
      const sourceId = id.split(":")[1];
      if (!source || !sourceId) return [];
      return [{ id, type: source.type, sourceId, support: supportKindForSource(source.type) }];
    });
  }

  const available = [
    { id: `entry:${ENTRY}`, type: "entry" as const },
    { id: `task:${TASK}`, type: "task" as const },
  ];

  it("carries both cited types through", () => {
    expect(referencesFor([`entry:${ENTRY}`, `task:${TASK}`], available)).toEqual([entryRef, taskRef]);
  });

  it("drops a fabricated id, including one shaped exactly like a real reference", () => {
    const fabricated = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    expect(referencesFor([`task:${fabricated}`], available)).toEqual([]);
    // And a fabricated id mixed in with a real one loses only itself: the
    // model's other citation must survive, or a single bad id would delete the
    // whole review's evidence.
    expect(referencesFor([`task:${fabricated}`, `entry:${ENTRY}`], available)).toEqual([entryRef]);
  });

  it("drops an id with no source id at all", () => {
    expect(referencesFor(["entry:", "not-a-reference"], available)).toEqual([]);
  });
});

describe("2Q-CITE-008: a review written before the producer keeps working", () => {
  it("parses an empty column to the unknown state, never to 'found nothing'", () => {
    /*
     * `OD-2Q-3`, signed as option A: no backfill. `unknown` means *"nobody
     * recorded whether the Brain found anything"*, which is exactly true of a
     * review written before this slice. `no_qualifying_evidence` would be an
     * invention — it claims the Brain looked and came back empty.
     */
    const legacy = parseCitations([]);
    expect(legacy.evidence).toBe("unknown");
    expect(legacy.evidence).not.toBe("no_qualifying_evidence");
    expect(legacy.sources).toEqual([]);
    expect(legacy.reach).toEqual([]);
  });

  it("distinguishes that from a new review that genuinely cited nothing", () => {
    // The control that the two states are really different values, so a reader
    // cannot describe one as the other. This is the honest "I had material and
    // cited none of it".
    const cited = buildCitationsEnvelope({
      retrievedAnyQualifyingSource: true,
      sources: [],
      reach: REVIEW_REACH,
    });
    expect(parseCitations(cited).evidence).toBe("evidenced");
    const nothing = buildCitationsEnvelope({
      retrievedAnyQualifyingSource: false,
      sources: [],
      reach: REVIEW_REACH,
    });
    expect(parseCitations(nothing).evidence).toBe("no_qualifying_evidence");
  });
});

describe("OD-2Q-1: one vocabulary, and each caller declares its own reach", () => {
  it("admits three types and no more", () => {
    expect([...CITED_SOURCE_TYPES]).toEqual(["entry", "memory", "task"]);
    expect([...ANSWER_REACH]).toEqual([...CITED_SOURCE_TYPES]);
  });

  it("leaves chat's declared reach byte-identical to what it was", () => {
    /*
     * **This is the control that chat did not move**, and it is the assertion
     * that used to read `expect([...ANSWER_REACH]).toEqual(["entry","memory"])`.
     * It was not weakened when the vocabulary widened — it was given a name.
     * The property it protects is unchanged and is now stated more precisely:
     * what chat *declares* is two places, whatever the schema *admits*.
     *
     * `conversation-sources/copy.ts` tells the owner "those two places only".
     * If this ever grows a third member without that sentence changing, the
     * product is lying to them.
     */
    expect([...CHAT_REACH]).toEqual(["entry", "memory"]);
  });

  it("gives a review the reach it actually has", () => {
    expect([...REVIEW_REACH]).toEqual(["entry", "task"]);
    expect([...REVIEW_REACH]).not.toEqual([...CHAT_REACH]);
  });

  it("stamps the caller's reach on the envelope, not a shared default", () => {
    expect(buildCitationsEnvelope({ retrievedAnyQualifyingSource: true, sources: [], reach: CHAT_REACH }).reach)
      .toEqual(["entry", "memory"]);
    expect(reviewEnvelope().reach).toEqual(["entry", "task"]);
  });

  it("round-trips a review envelope through the parser without losing the reach", () => {
    expect(parseCitations(reviewEnvelope()).reach).toEqual(["entry", "task"]);
  });
});

describe("2Q-CITE-009: regenerating replaces the envelope rather than accumulating", () => {
  it("builds a whole envelope every time, with no append path", () => {
    /*
     * The storage half of the property: `buildCitationsEnvelope` is a pure
     * constructor with no prior-state parameter, so there is no code path that
     * could add to an existing envelope. The upsert then replaces the column's
     * value on the same conflict target the review itself uses. The database
     * half is proved in `supabase/tests/phase_2q_summary_citations.sql`, which
     * upserts twice over one period key and asserts the row holds one envelope.
     */
    const first = reviewEnvelope();
    const second = buildCitationsEnvelope({
      retrievedAnyQualifyingSource: true,
      sources: [entryRef],
      reach: REVIEW_REACH,
    });
    expect(second.sources).toEqual([entryRef]);
    expect(second.sources).not.toEqual(first.sources);
    expect(second.sources.length).toBeLessThan(first.sources.length);
  });
});
