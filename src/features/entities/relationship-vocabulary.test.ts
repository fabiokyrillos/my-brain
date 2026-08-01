import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  RELATIONSHIP_TYPES,
  RELATIONSHIP_VOCABULARY_VERSION,
  asRelationshipType,
  canonicalRelationshipTerms,
  describeRelationshipType,
  relationshipOptions,
} from "./relationship-vocabulary";

/**
 * EGC-REL-003: the version moves when the vocabulary moves, **enforced by test**.
 *
 * A format regex over the version constant does not enforce that — Slice 2E.8
 * proved it by rewriting a policy table with a fully green suite. What enforces
 * it is a digest over the **term mappings**, so re-pointing `spouse` from
 * `Esposa/Esposo` to something else moves the digest, the commit cannot land
 * until the author updates it, and updating it is the moment they are asked
 * whether the version moved too.
 *
 * Digesting the database literals alone would be the exact defect 2E.8 found:
 * the literals do not move when a term is re-pointed, so the lock would stay
 * green through the change it exists to catch.
 *
 * When you legitimately change the vocabulary: bump
 * `RELATIONSHIP_VOCABULARY_VERSION`, run this file, and paste the reported
 * digest in.
 */
function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

describe("the relationship vocabulary policy lock", () => {
  it("pins the term mappings to their declared version", () => {
    expect({
      version: RELATIONSHIP_VOCABULARY_VERSION,
      digest: digest(canonicalRelationshipTerms()),
    }).toEqual({
      version: "2026-07-31.1",
      digest: "17f725f2b5ca40f7",
    });
  });

  it("moves when a term is re-pointed, which digesting the literals alone would not", () => {
    // The mutation executed rather than described. `RELATIONSHIP_TYPES` is
    // unchanged in both branches — only a *term* differs — so a lock over the
    // literals would report both as identical.
    const original = canonicalRelationshipTerms();
    const repointed = original.map(([member, pt, en]) =>
      member === "spouse" ? ([member, "Cônjuge", en] as const) : ([member, pt, en] as const),
    );

    expect(digest(repointed)).not.toBe(digest(original));
    expect(repointed.map(([member]) => member)).toEqual(original.map(([member]) => member));
  });
});

describe("the relationship vocabulary", () => {
  it("carries the fourteen members EGC-REL-004 requires", () => {
    expect([...RELATIONSHIP_TYPES]).toEqual([
      "spouse",
      "partner",
      "parent",
      "child",
      "sibling",
      "other_family",
      "friend",
      "colleague",
      "manager",
      "report",
      "client",
      "vendor",
      "mentor",
      "other",
    ]);
  });

  it("renders spouse as the Camila scenario requires, in both locales", () => {
    // pt-BR names both forms because the product does not know anyone's gender
    // and is not adding a field to render a label. `Esposa` is present, which is
    // what the scenario asks to see.
    expect(describeRelationshipType("pt-BR", "spouse")).toContain("Esposa");
    expect(describeRelationshipType("en", "spouse")).toBe("Spouse");
  });

  it("gives every member a distinct term in each locale", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const terms = RELATIONSHIP_TYPES.map((type) => describeRelationshipType(locale, type));
      expect(terms.every((term) => typeof term === "string" && term.length > 0)).toBe(true);
      expect(new Set(terms).size, `${locale} has a duplicated term`).toBe(RELATIONSHIP_TYPES.length);
    }
  });

  it("returns null for a stored value outside the set rather than guessing or throwing", () => {
    // EGC-REL-006. The column has no CHECK on purpose: an extraction pass that
    // writes `godparent` must leave a row that renders oddly, not a row that
    // fails to insert and takes an interpretation down with it.
    expect(describeRelationshipType("pt-BR", "godparent")).toBeNull();
    expect(describeRelationshipType("en", "")).toBeNull();
    expect(describeRelationshipType("en", null)).toBeNull();
    expect(describeRelationshipType("en", 7)).toBeNull();
    expect(asRelationshipType("godparent")).toBeNull();
  });

  it("offers the members in declared order, so the selector is not alphabetised by accident", () => {
    const options = relationshipOptions("pt-BR");
    expect(options.map((option) => option.value)).toEqual([...RELATIONSHIP_TYPES]);
    expect(options[0]!.label).toContain("Esposa");
  });
});
