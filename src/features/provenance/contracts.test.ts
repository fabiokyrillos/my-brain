/**
 * `2N-PROV-001`…`-006`, `2N-RELATION-002`/`-008` — the provenance contract.
 *
 * The cases that matter here are the ones that assert something is **NOT**
 * distinguishable, because those are the ones a plausible refactor breaks while
 * every happy path keeps passing.
 */

import { describe, expect, it } from "vitest";

import {
  deriveClaimProvenance,
  isOpenable,
  OWNER_AUTHORED_TABLES,
  ownerAuthored,
  resolvableEntryIdsOf,
} from "./contracts";

const ENTRY = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("2N-PROV-001: a claim points at a record only when there is one", () => {
  it("resolves to the entry when the caller actually read it", () => {
    const provenance = deriveClaimProvenance(ENTRY, new Set([ENTRY]));
    expect(provenance).toEqual({ kind: "sourced", entryId: ENTRY });
    expect(isOpenable(provenance)).toBe(true);
  });

  it("is unsourced when the id was declared but the row never came back", () => {
    // Fail-closed (`2N-PROV-004`): the id is on the page, the row is not.
    const provenance = deriveClaimProvenance(ENTRY, new Set([OTHER]));
    expect(provenance).toEqual({ kind: "unsourced" });
    expect(isOpenable(provenance)).toBe(false);
  });
});

describe("2N-PROV-004: no origin is fabricated for an absent source", () => {
  /*
   * The single most important test in this file.
   *
   * `memories.source_entry_id` and `tasks.source_entry_id` are both declared
   * `on delete set null`, so a NULL means EITHER "nothing recorded a source" OR
   * "the source entry was deleted and the FK nulled the column". The tempting
   * arm is to call null owner-authored and print "informed by you" — which, for
   * a memory whose entry the owner deleted, is simply false, and false in the
   * direction that turns an absence into a positive claim about where knowledge
   * came from.
   */
  it.each([[null], [undefined], [""]])("treats %p as unsourced, never as owner-authored", (value) => {
    const provenance = deriveClaimProvenance(value, new Set([ENTRY]));
    expect(provenance).toEqual({ kind: "unsourced" });
    expect(provenance.kind).not.toBe("owner-authored");
  });

  it("cannot be asked to call a memory owner-authored", () => {
    /*
     * A type-level guarantee, asserted here as documentation of intent: the
     * union `ownerAuthored` accepts contains only tables that carry no
     * provenance column at all. `ownerAuthored("memories")` does not compile,
     * and `memories` is exactly the table where the answer would be invented.
     */
    expect(OWNER_AUTHORED_TABLES).toEqual([
      "person_relationships",
      "person_projects",
      "person_contexts",
    ]);
    expect(OWNER_AUTHORED_TABLES).not.toContain("memories");
    expect(OWNER_AUTHORED_TABLES).not.toContain("tasks");
  });
});

describe("2N-PROV-004 / 2N-PRIVACY-005: removed, foreign and unreadable are one answer", () => {
  it("gives byte-identical results for all four absences", () => {
    /*
     * The four ways a source can fail to be there, as the caller would actually
     * produce them. If any future branch told them apart, the rendered page
     * would become an oracle: a reader could learn that an id exists but belongs
     * to someone else, which is precisely what the arm collapse prevents.
     */
    const deleted = deriveClaimProvenance(ENTRY, resolvableEntryIdsOf([]));
    const foreign = deriveClaimProvenance(ENTRY, resolvableEntryIdsOf([{ id: OTHER }]));
    const unreadable = deriveClaimProvenance(ENTRY, resolvableEntryIdsOf(null));
    const neverSet = deriveClaimProvenance(null, resolvableEntryIdsOf([{ id: OTHER }]));

    for (const answer of [foreign, unreadable, neverSet]) {
      expect(JSON.stringify(answer)).toBe(JSON.stringify(deleted));
    }
  });
});

describe("2N-SEC-002: the set is built from rows that came back", () => {
  it("ignores rows without a usable id", () => {
    // A row that arrived without an id cannot be opened and must not become a
    // link — the honest reading is that it is not resolvable.
    expect(resolvableEntryIdsOf([{ id: ENTRY }, { id: null }, { id: "" }])).toEqual(new Set([ENTRY]));
  });

  it("is empty for a failed read rather than permissive", () => {
    expect(resolvableEntryIdsOf(null)).toEqual(new Set());
    expect(resolvableEntryIdsOf(undefined)).toEqual(new Set());
  });
});

describe("2N-RELATION-008: relations are owner-authored by construction", () => {
  it("names the table it is asserting about", () => {
    expect(ownerAuthored("person_relationships")).toEqual({
      kind: "owner-authored",
      table: "person_relationships",
    });
  });

  it("is never openable, because there is nothing to open", () => {
    for (const table of OWNER_AUTHORED_TABLES) {
      expect(isOpenable(ownerAuthored(table))).toBe(false);
    }
  });
});
