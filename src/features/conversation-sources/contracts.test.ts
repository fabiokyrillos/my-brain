/**
 * `2K-SRC-003/005/006`, `2K-PRIVACY-003` — the source contract.
 *
 * The load-bearing assertions are the two negatives: the persisted shape has
 * **nowhere to put content**, and a legacy row's excerpt is **discarded rather
 * than read**. Everything else follows from those.
 */

import { describe, expect, it } from "vitest";

import {
  ANSWER_REACH,
  ANSWER_SUPPORT_KIND,
  CHAT_REACH,
  CITATIONS_ENVELOPE_VERSION,
  NO_CITATIONS,
  REVIEW_REACH,
  SUPPORT_KINDS,
  buildCitationsEnvelope,
  parseCitations,
  supportKindForSource,
} from "./contracts";
import { getConversationSourcesCopy } from "./copy";

const SOURCE_ID = "44444444-4444-4444-8444-444444444444";

const reference = {
  id: `entry:${SOURCE_ID}`,
  type: "entry" as const,
  sourceId: SOURCE_ID,
  support: "direct_record" as const,
};

describe("2K-SRC-003: support kind is a closed vocabulary, decided server-side", () => {
  it("declares the three kinds the PRD names", () => {
    expect([...SUPPORT_KINDS].sort()).toEqual(["direct_record", "inference", "product_state"]);
  });

  it("maps each retrievable source type to exactly one kind", () => {
    expect(supportKindForSource("entry")).toBe("direct_record");
    expect(supportKindForSource("memory")).toBe("product_state");
  });

  it("reserves `inference` for the answer, so no member is declared and unused", () => {
    // No *source* is ever an inference — the composition is. Using the third
    // member for the answer is what stops it being a vocabulary entry nothing
    // produces, which is a shape this repository has paid for before.
    expect(ANSWER_SUPPORT_KIND).toBe("inference");
    expect(SUPPORT_KINDS).toContain(ANSWER_SUPPORT_KIND);
    for (const type of ["entry", "memory"] as const) {
      expect(supportKindForSource(type)).not.toBe("inference");
    }
  });
});

describe("2K-PRIVACY-003: the persisted payload has nowhere to put content", () => {
  it("refuses an excerpt planted on a reference, and the refusal is total", () => {
    const planted = {
      v: CITATIONS_ENVELOPE_VERSION,
      evidence: "evidenced",
      reach: ["entry"],
      sources: [{ ...reference, excerpt: "resultado do exame" }],
    };
    /*
     * Not "ignored" and not "stripped" — the whole envelope fails to parse, so
     * **nothing** from it reaches the surface. `.strict()` is what makes that
     * structural rather than a caller's promise.
     *
     * The refusal is deliberately total rather than field-wise: a payload that
     * carried content is a payload written by something this contract does not
     * recognise, and salvaging the rest of it would be trusting a writer that
     * has already broken the shape.
     */
    expect(parseCitations(planted)).toEqual(NO_CITATIONS);
    expect(JSON.stringify(parseCitations(planted))).not.toContain("resultado do exame");
  });

  it("refuses every content-shaped field name, not just `excerpt`", () => {
    for (const field of ["excerpt", "content", "snippet", "title", "text", "preview"]) {
      const planted = {
        v: CITATIONS_ENVELOPE_VERSION,
        evidence: "evidenced",
        reach: ["entry"],
        sources: [{ ...reference, [field]: "leaked" }],
      };
      expect(parseCitations(planted), field).toEqual(NO_CITATIONS);
    }
  });

  it("builds an envelope that carries no content", () => {
    const envelope = buildCitationsEnvelope({
      retrievedAnyQualifyingSource: true,
      sources: [reference],
      reach: CHAT_REACH,
    });
    expect(JSON.stringify(envelope)).not.toMatch(/excerpt|content|snippet/);
    expect(Object.keys(envelope.sources[0]!).sort()).toEqual(["id", "sourceId", "support", "type"]);
  });
});

describe("2K-PRIVACY-004: a legacy row's excerpt is discarded, never read", () => {
  const legacy = [
    { id: `entry:${SOURCE_ID}`, type: "entry", sourceId: SOURCE_ID, excerpt: "resultado do exame" },
  ];

  it("keeps the reference and drops the stored content", () => {
    const parsed = parseCitations(legacy);
    expect(parsed.sources).toEqual([
      { id: `entry:${SOURCE_ID}`, type: "entry", sourceId: SOURCE_ID, support: "direct_record" },
    ]);
    expect(JSON.stringify(parsed)).not.toContain("resultado do exame");
  });

  it("marks the row legacy, so the surface can say less rather than guess", () => {
    expect(parseCitations(legacy).legacy).toBe(true);
  });

  it("never claims a legacy row found nothing", () => {
    // `unknown`, not `no_qualifying_evidence`. Nobody recorded what retrieval
    // found for these rows, and saying "I had nothing" about a row that may
    // have had plenty would be an invention.
    expect(parseCitations(legacy).evidence).toBe("unknown");
    expect(parseCitations([]).evidence).toBe("unknown");
  });
});

describe("2K-SRC-005: insufficiency comes from retrieval, never from the count", () => {
  it("records `no_qualifying_evidence` when retrieval found nothing", () => {
    const envelope = buildCitationsEnvelope({ retrievedAnyQualifyingSource: false, sources: [], reach: CHAT_REACH });
    expect(envelope.evidence).toBe("no_qualifying_evidence");
  });

  it("records `evidenced` when retrieval found something the model then cited none of", () => {
    /*
     * The case slice 2K.0 measured and the reason this field exists.
     * `sources.length === 0` here, and the honest answer is still "I had
     * evidence" — deriving insufficiency from the count would report the
     * opposite of what happened.
     */
    const envelope = buildCitationsEnvelope({ retrievedAnyQualifyingSource: true, sources: [], reach: CHAT_REACH });
    expect(envelope.evidence).toBe("evidenced");
    expect(envelope.sources).toEqual([]);
  });

  it("round-trips both states through the parser", () => {
    for (const retrieved of [true, false]) {
      const envelope = buildCitationsEnvelope({ retrievedAnyQualifyingSource: retrieved, sources: [reference], reach: CHAT_REACH });
      expect(parseCitations(envelope).evidence).toBe(retrieved ? "evidenced" : "no_qualifying_evidence");
    }
  });
});

describe("2K-SRC-006: the answer discloses its actual reach", () => {
  /*
   * **THIS BLOCK IS THE CONTROL THAT `OD-2Q-1` DID NOT MOVE CHAT.**
   *
   * Phase 2Q widened the citation **type** vocabulary to `entry | memory | task`
   * so a review could stop storing a task as a memory. It did **not** widen what
   * chat retrieves, and `conversation-sources/copy.ts` still tells the owner
   * *"I looked in your records and your memories — those two places only."*
   *
   * The assertion below used to read
   * `expect([...ANSWER_REACH]).toEqual(["entry","memory"])`. It was **not
   * weakened when the vocabulary widened — it was given the right name.**
   * `ANSWER_REACH` is now what the envelope schema *admits*; `CHAT_REACH` is
   * what chat *declares*. Those were always two different facts sharing one
   * constant, and a review stamped with chat's reach would have told the owner
   * the Brain read their memories when it read their tasks.
   *
   * The property this file protects is unchanged and now stated precisely, with
   * the admissible set asserted alongside it so neither can drift unnoticed.
   */
  it("names exactly the two source types chat's retrieval covers", () => {
    expect([...CHAT_REACH].sort()).toEqual(["entry", "memory"]);
    // And the copy the owner actually reads still says two places, so the
    // sentence and the stamped fact cannot disagree.
    for (const locale of ["pt-BR", "en"] as const) {
      expect(getConversationSourcesCopy(locale).reach.toLowerCase())
        .toMatch(locale === "pt-BR" ? /só nesses dois lugares/ : /those two places only/);
    }
  });

  it("keeps the admissible vocabulary separate from what chat declares", () => {
    expect([...ANSWER_REACH]).toEqual(["entry", "memory", "task"]);
    expect([...ANSWER_REACH]).not.toEqual([...CHAT_REACH]);
    // The control that the separation is real: a review declares the other pair.
    expect([...REVIEW_REACH]).toEqual(["entry", "task"]);
  });

  it("stamps the reach on every new envelope", () => {
    expect(buildCitationsEnvelope({ retrievedAnyQualifyingSource: true, sources: [], reach: CHAT_REACH }).reach)
      .toEqual(["entry", "memory"]);
  });

  it("claims no reach for a legacy row, which never recorded one", () => {
    expect(parseCitations([]).reach).toEqual([]);
  });
});

describe("the parser is total", () => {
  it("returns the empty view for anything that is neither shape", () => {
    for (const raw of [null, undefined, 0, "", "citations", {}, { v: "old" }]) {
      expect(parseCitations(raw), String(raw)).toEqual(NO_CITATIONS);
    }
  });
});
