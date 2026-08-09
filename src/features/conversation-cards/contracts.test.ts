/**
 * `2K-CARD-001` … `2K-CARD-009` — the card contract's own tests.
 *
 * The vocabulary is closed, the mutability is declared per type rather than
 * per call site, and reversibility is read from the card's own value. Every
 * assertion here is about a property the renderer is then forbidden to
 * re-decide (`card.test.tsx`, `phase-2k-card-guard.test.ts`).
 */

import { describe, expect, it } from "vitest";

import {
  CONVERSATION_CARD_SNIPPET_LIMIT,
  CONVERSATION_CARD_STATES,
  CONVERSATION_CARD_TYPES,
  MUTABLE_CONVERSATION_CARD_TYPES,
  READ_ONLY_CONVERSATION_CARD_TYPES,
  advertisesReversal,
  boundSnippet,
  cardMutability,
  isConversationCardState,
  mayRenderMutatingControl,
  readOnlyPreviewCard,
  unavailableCard,
  type ConversationCardType,
} from "./contracts";

describe("2K-CARD-001: the card state vocabulary is closed", () => {
  it("declares every state the phase can produce", () => {
    // Named individually rather than by count: a member silently dropped in a
    // refactor would still satisfy a length assertion if another arrived.
    for (const state of [
      "pending",
      "previewed",
      "requires_confirmation",
      "accepted",
      "refused",
      "failed",
      "undone",
      "expired",
      "no_change",
      "unavailable",
    ]) {
      expect(CONVERSATION_CARD_STATES).toContain(state);
    }
  });

  it("has no duplicates, so a `Record` keyed by it cannot lose an arm", () => {
    expect(new Set(CONVERSATION_CARD_STATES).size).toBe(CONVERSATION_CARD_STATES.length);
  });

  it("refuses a value outside the vocabulary", () => {
    expect(isConversationCardState("previewed")).toBe(true);
    // The two shapes a drift would take: an outcome borrowed from another
    // vocabulary, and a plausible-sounding invention.
    expect(isConversationCardState("rejected_stale")).toBe(false);
    expect(isConversationCardState("done")).toBe(false);
    expect(isConversationCardState("")).toBe(false);
  });
});

describe("2K-CARD-003/007/008: mutability is a property of the type, not of the call site", () => {
  it("partitions every declared card type exactly once", () => {
    const partitioned = [...MUTABLE_CONVERSATION_CARD_TYPES, ...READ_ONLY_CONVERSATION_CARD_TYPES];
    expect([...partitioned].sort()).toEqual([...CONVERSATION_CARD_TYPES].sort());
    expect(new Set(partitioned).size).toBe(partitioned.length);
  });

  it("declares tasks and memories mutable and nothing else (OD-2K-B)", () => {
    expect([...MUTABLE_CONVERSATION_CARD_TYPES].sort()).toEqual(["memory", "task"]);
  });

  it("declares entries, people, projects, organizations and files read-only", () => {
    expect([...READ_ONLY_CONVERSATION_CARD_TYPES].sort())
      .toEqual(["entry", "file", "organization", "person", "project"]);
  });

  it("answers `mayRenderMutatingControl` from the type, for every type", () => {
    for (const type of CONVERSATION_CARD_TYPES) {
      // A readable card of each type. `unavailableCard` would answer `false`
      // for every type — correctly, because an object nobody could read has
      // proved no ownership — and would make this assertion vacuous.
      const card = { ...unavailableCard(type), state: "requires_confirmation" as const };
      expect(mayRenderMutatingControl(card), type)
        .toBe(cardMutability(type as ConversationCardType) === "mutable");
    }
  });

  it("refuses a control on an unavailable card even for a mutable type", () => {
    for (const type of MUTABLE_CONVERSATION_CARD_TYPES) {
      expect(mayRenderMutatingControl(unavailableCard(type)), type).toBe(false);
    }
  });

  it("no builder can produce a mutable card for a type OD-2K-B keeps read-only", () => {
    /*
     * The type-level guarantee, asserted at the builders rather than at the
     * renderer. `mayRenderMutatingControl` reads the card's own `mutability`
     * field — because a memory reached as a *reference* is read-only even
     * though a memory card in its own right may mutate (slice 2K.3) — so what
     * must hold is that nothing can *write* `mutable` for these five.
     */
    for (const type of READ_ONLY_CONVERSATION_CARD_TYPES) {
      expect(readOnlyPreviewCard({ cardType: type, objectId: "id" }).mutability, type).toBe("read_only");
      expect(unavailableCard(type).mutability, type).toBe("read_only");
    }
  });

  it("makes a reference to a mutable type read-only, which is the 2K.3 case", () => {
    // A memory cited by an answer, or shown on a resumed card, is something the
    // conversation pointed at — not something it proposes to change.
    const reference = readOnlyPreviewCard({ cardType: "memory", objectId: "m1" });
    expect(reference.mutability).toBe("read_only");
    expect(mayRenderMutatingControl(reference)).toBe(false);
    // And the type itself is still mutable, so this is a property of the role.
    expect(cardMutability("memory")).toBe("mutable");
  });

  it("says read-only for every read-only type, which is the rule 2K-CARD-008 renders", () => {
    for (const type of READ_ONLY_CONVERSATION_CARD_TYPES) {
      expect(cardMutability(type), type).toBe("read_only");
      expect(mayRenderMutatingControl(readOnlyPreviewCard({ cardType: type, objectId: "id" })), type)
        .toBe(false);
    }
  });
});

describe("2K-CARD-009: reversibility is read from the card's own value", () => {
  it("does not advertise reversal for a card that has none", () => {
    expect(advertisesReversal({ kind: "none" })).toBe(false);
  });

  it("advertises the two reversals the domain can truthfully perform", () => {
    expect(advertisesReversal({ kind: "undo_window", windowHours: 24 })).toBe(true);
    expect(advertisesReversal({ kind: "archival" })).toBe(true);
  });

  it("gives a read-only preview no reversal at all, because there is nothing to reverse", () => {
    expect(readOnlyPreviewCard({ cardType: "person", objectId: "p1" }).reversal)
      .toEqual({ kind: "none" });
  });
});

describe("2K-CARD-007: a read-only preview carries a link and a bounded snippet, and nothing else", () => {
  const card = readOnlyPreviewCard({
    cardType: "entry",
    objectId: "e1",
    snippet: "o contrato da Aurora",
    sensitivity: "private",
    href: "/pt-BR/app/inbox/e1",
  });

  it("is `previewed`, read-only, and irreversible", () => {
    expect(card.state).toBe("previewed");
    expect(card.mutability).toBe("read_only");
    expect(card.reversal).toEqual({ kind: "none" });
  });

  it("carries the object it points at", () => {
    expect(card.objectId).toBe("e1");
    expect(card.href).toBe("/pt-BR/app/inbox/e1");
    expect(card.snippet).toBe("o contrato da Aurora");
    expect(card.sensitivity).toBe("private");
  });

  it("bounds the snippet rather than trusting the caller to", () => {
    const long = "x".repeat(CONVERSATION_CARD_SNIPPET_LIMIT + 500);
    const bounded = readOnlyPreviewCard({ cardType: "entry", objectId: "e1", snippet: long });
    expect(bounded.snippet?.length).toBeLessThanOrEqual(CONVERSATION_CARD_SNIPPET_LIMIT + 1);
    expect(boundSnippet(long)?.length).toBeLessThanOrEqual(CONVERSATION_CARD_SNIPPET_LIMIT + 1);
    expect(boundSnippet(null)).toBeNull();
    expect(boundSnippet("   ")).toBeNull();
  });

  it("defaults an unclassified source to the most protective level (2K-PRIVACY-005)", () => {
    // The caller omitted the classification. Failing open here would print a
    // snippet nobody classified; failing closed masks it until somebody does.
    expect(readOnlyPreviewCard({ cardType: "file", objectId: "f1", snippet: "x" }).sensitivity)
      .toBe("highly_sensitive");
  });

  it("carries no free-text label: the label is the type's, resolved by copy", () => {
    // A person's name is content and would need the sensitivity contract. The
    // card therefore carries the *type* and the snippet, and the surface reads
    // the label from `copy.types[cardType]`.
    expect(Object.keys(card).sort()).toEqual([
      "cardType",
      "href",
      "mutability",
      "objectId",
      "reversal",
      "sensitivity",
      "snippet",
      "state",
    ]);
  });
});

describe("2K-CONT-008 groundwork: `unavailable` is one shape, not a family", () => {
  it("carries nothing about the object it could not read", () => {
    const card = unavailableCard("person");
    expect(card.state).toBe("unavailable");
    expect(card.objectId).toBeNull();
    expect(card.snippet).toBeNull();
    expect(card.href).toBeNull();
    expect(card.sensitivity).toBe("highly_sensitive");
  });

  it("is byte-identical for the same type regardless of why it was unreadable", () => {
    // Deleted, foreign and suspended are three causes with one output. The
    // builder takes no cause parameter, which is how that stays true.
    expect(JSON.stringify(unavailableCard("entry"))).toBe(JSON.stringify(unavailableCard("entry")));
    expect(unavailableCard.length).toBe(1);
  });

  it("exposes no mutating control even for a type that is otherwise mutable", () => {
    // An unreadable object cannot be acted on: there is nothing proved about
    // ownership. The mutability is still the type's, but the state is what the
    // renderer draws, and `unavailable` draws no control (`card.test.tsx`).
    expect(unavailableCard("task").state).toBe("unavailable");
  });
});
