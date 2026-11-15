import { describe, expect, it } from "vitest";

import { projectPersonLinks, repeatsLiveLink, type PersonLinkSourceRow } from "./person-links-projection";
import { PERSON_LINK_TYPES, inversePersonLinkType } from "./relationship-vocabulary";

const CAMILA = "c0000000-0000-4000-8000-000000000001";
const LAURA = "c0000000-0000-4000-8000-000000000002";
const PEDRO = "c0000000-0000-4000-8000-000000000003";
const names = new Map([
  [CAMILA, "Camila"],
  [LAURA, "Laura"],
  [PEDRO, "Pedro"],
]);

// "Camila is parent of Laura": written from Laura's page as Camila → Laura.
const parent: PersonLinkSourceRow = { id: "r1", person_id: CAMILA, related_person_id: LAURA, relationship_type: "parent" };

describe("one stored link reads correctly on both people's pages (Life Brain E.2)", () => {
  it("names the other end with the stored type on the related person's page", () => {
    expect(projectPersonLinks(LAURA, [parent], names)).toEqual([
      { id: "r1", otherId: CAMILA, otherName: "Camila", type: "parent" },
    ]);
  });

  it("names the other end with the reciprocal type on the person's own page", () => {
    expect(projectPersonLinks(CAMILA, [parent], names)).toEqual([
      { id: "r1", otherId: LAURA, otherName: "Laura", type: "child" },
    ]);
  });

  it("reads symmetric types the same from both ends", () => {
    const spouse = { ...parent, relationship_type: "spouse" };
    expect(projectPersonLinks(LAURA, [spouse], names)[0].type).toBe("spouse");
    expect(projectPersonLinks(CAMILA, [spouse], names)[0].type).toBe("spouse");
  });

  it("ignores relationships to the owner, a third pair, a self-link and unknown types", () => {
    const rows: PersonLinkSourceRow[] = [
      { id: "owner", person_id: CAMILA, related_person_id: null, relationship_type: "spouse" },
      { id: "other-pair", person_id: LAURA, related_person_id: PEDRO, relationship_type: "sibling" },
      { id: "self", person_id: CAMILA, related_person_id: CAMILA, relationship_type: "friend" },
      { id: "unknown", person_id: PEDRO, related_person_id: CAMILA, relationship_type: "godparent" },
      { id: "work", person_id: PEDRO, related_person_id: CAMILA, relationship_type: "manager" },
    ];
    expect(projectPersonLinks(CAMILA, rows, names)).toEqual([]);
  });

  it("drops a link whose other end the owner-scoped read did not return", () => {
    expect(projectPersonLinks(LAURA, [parent], new Map([[LAURA, "Laura"]]))).toEqual([]);
  });

  it("sorts by the other person's name", () => {
    const rows: PersonLinkSourceRow[] = [
      { id: "a", person_id: PEDRO, related_person_id: LAURA, relationship_type: "friend" },
      parent,
    ];
    expect(projectPersonLinks(LAURA, rows, names).map((link) => link.otherName)).toEqual(["Camila", "Pedro"]);
  });
});

describe("the reciprocal is an involution over the link types", () => {
  it("returns every type to itself after two inversions", () => {
    for (const type of PERSON_LINK_TYPES) expect(inversePersonLinkType(inversePersonLinkType(type))).toBe(type);
  });

  it("swaps only parent and child", () => {
    expect(PERSON_LINK_TYPES.filter((type) => inversePersonLinkType(type) !== type)).toEqual(["parent", "child"]);
  });
});

describe("a new link that repeats a live one is recognised in either direction", () => {
  it("catches the same link written the same way", () => {
    expect(repeatsLiveLink(LAURA, CAMILA, "parent", [parent])).toBe(true);
  });

  it("catches the same link written from the other page", () => {
    // From Camila's page: "Laura is child of Camila" is the stored row read backwards.
    expect(repeatsLiveLink(CAMILA, LAURA, "child", [parent])).toBe(true);
  });

  it("lets a different link between the same two people through", () => {
    expect(repeatsLiveLink(LAURA, CAMILA, "friend", [parent])).toBe(false);
  });
});
