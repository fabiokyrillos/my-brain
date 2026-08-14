import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_LINK_LIMIT,
  LINKED_ENTITY_TYPES,
  PAGE_LINK_LIMIT,
  REVERSE_LINKED_ENTITY_TYPES,
  isLinkedEntityType,
  linksByAttachment,
  narrowAttachmentLinks,
  toLinkOutcome,
} from "./link-contracts";

/**
 * `2N-FILES-003`, `2N-FILES-005`, `2N-FILES-009`, `2N-PERSON-008` — the rules
 * the first reader of `entity_attachments` decides by.
 *
 * Four properties carry the requirement and each is asserted the way it can
 * actually fail: the **type narrowing** as behaviour over rows the column's own
 * CHECK admits, the **bound** as the probe row not being rendered, the
 * **failure** as an outcome distinguishable from an empty result, and the
 * **absence of a writer** as a closed export surface rather than a hopeful name
 * pattern.
 */

const row = (overrides: Record<string, unknown> = {}) => ({
  attachment_id: "file-1",
  entity_type: "person",
  entity_id: "person-1",
  ...overrides,
});

describe("2N-FILES-003: only the types this product can resolve are read", () => {
  it("names exactly the three the requirement names", () => {
    expect([...LINKED_ENTITY_TYPES]).toEqual(["entry", "person", "project"]);
  });

  it("is narrower than the column's own CHECK constraint", () => {
    // `202607160007:122` admits eight. Five of them have no page to open, and a
    // link the product cannot navigate to is not a navigation aid.
    for (const excluded of ["task", "conversation", "reminder", "decision", "activity"]) {
      expect(isLinkedEntityType(excluded)).toBe(false);
    }
  });

  it("accepts each authorized type", () => {
    for (const allowed of LINKED_ENTITY_TYPES) expect(isLinkedEntityType(allowed)).toBe(true);
  });

  it("offers the reverse direction only for the two kinds with a page", () => {
    expect([...REVERSE_LINKED_ENTITY_TYPES]).toEqual(["person", "project"]);
  });

  it("drops a row whose entity_type is outside the authorized list", () => {
    expect(narrowAttachmentLinks([row({ entity_type: "task" })])).toEqual([]);
  });

  it("drops a row missing either id rather than rendering half a link", () => {
    expect(narrowAttachmentLinks([row({ attachment_id: null })])).toEqual([]);
    expect(narrowAttachmentLinks([row({ entity_id: null })])).toEqual([]);
  });

  it("keeps a well-formed row", () => {
    expect(narrowAttachmentLinks([row()])).toEqual([
      { attachmentId: "file-1", entityType: "person", entityId: "person-1" },
    ]);
  });

  it("tolerates a null read without inventing rows", () => {
    expect(narrowAttachmentLinks(null)).toEqual([]);
    expect(narrowAttachmentLinks(undefined)).toEqual([]);
  });
});

describe("linksByAttachment groups without losing a link", () => {
  it("keeps every link of a file together", () => {
    const links = narrowAttachmentLinks([
      row(),
      row({ entity_type: "project", entity_id: "project-1" }),
      row({ attachment_id: "file-2", entity_id: "person-2" }),
    ]);
    const grouped = linksByAttachment(links);
    expect(grouped.get("file-1")).toHaveLength(2);
    expect(grouped.get("file-2")).toHaveLength(1);
  });

  it("leaves a file with no links absent rather than present and empty", () => {
    expect(linksByAttachment([]).has("file-1")).toBe(false);
  });
});

describe("2N-KNOWS-008: the bound is measured, and the probe is not rendered", () => {
  it("reports bounded and trims the probe when the limit is exceeded", () => {
    const rows = Array.from({ length: ATTACHMENT_LINK_LIMIT + 1 }, (_, index) =>
      row({ attachment_id: `file-${index}` }),
    );
    const outcome = toLinkOutcome(rows, null, ATTACHMENT_LINK_LIMIT);
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.list.bounded).toBe(true);
    expect(outcome.list.items).toHaveLength(ATTACHMENT_LINK_LIMIT);
  });

  it("does not claim a bound at exactly the limit", () => {
    const rows = Array.from({ length: ATTACHMENT_LINK_LIMIT }, (_, index) =>
      row({ attachment_id: `file-${index}` }),
    );
    const outcome = toLinkOutcome(rows, null, ATTACHMENT_LINK_LIMIT);
    expect(outcome.status === "ok" && outcome.list.bounded).toBe(false);
  });

  it("reports the bound even when the rows that filled it were unrenderable", () => {
    // The read hit its limit with rows this module will not render. Counting
    // only the renderable ones would report a complete list off a truncated read.
    const rows = Array.from({ length: PAGE_LINK_LIMIT + 1 }, (_, index) =>
      row({ attachment_id: `file-${index}`, entity_type: "task" }),
    );
    const outcome = toLinkOutcome(rows, null, PAGE_LINK_LIMIT);
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.list.items).toEqual([]);
    expect(outcome.list.bounded).toBe(true);
  });

  it("does not report a bound merely because rows were dropped", () => {
    // The mutation control for the case above: three rows read, two dropped, no
    // limit hit. A `bounded` here would mean every page with one `task` link
    // claimed to be truncated.
    const outcome = toLinkOutcome(
      [row(), row({ entity_type: "task" }), row({ entity_type: "reminder" })],
      null,
      PAGE_LINK_LIMIT,
    );
    expect(outcome.status === "ok" && outcome.list.bounded).toBe(false);
  });
});

describe("a failed read is a named outcome, never an empty list", () => {
  it("says failed when the query errored", () => {
    expect(toLinkOutcome(null, { message: "boom" }, ATTACHMENT_LINK_LIMIT).status).toBe("failed");
  });

  it("says failed when the response carried no data at all", () => {
    expect(toLinkOutcome(null, null, ATTACHMENT_LINK_LIMIT).status).toBe("failed");
  });

  it("says failed even when an error arrived beside rows", () => {
    expect(toLinkOutcome([row()], { message: "partial" }, ATTACHMENT_LINK_LIMIT).status).toBe(
      "failed",
    );
  });

  it("says ok with an empty list when the read genuinely found nothing", () => {
    const outcome = toLinkOutcome([], null, ATTACHMENT_LINK_LIMIT);
    expect(outcome.status).toBe("ok");
    expect(outcome.status === "ok" && outcome.list.items).toEqual([]);
  });
});

describe("the contract module ships no writer", () => {
  /*
   * Asserted as the **whole** export surface rather than as a name pattern.
   *
   * A pattern would have to be permissive enough to accept `linksByAttachment`,
   * which leaves it accepting `linkAttachment` too — the exact name a writer
   * would take. A closed list cannot: adding any export at all fails this test,
   * and whoever adds one has to state whether it writes.
   */
  it("exports exactly the read surface, and nothing else", async () => {
    const module = await import("./link-contracts");
    expect(Object.keys(module).sort()).toEqual(
      [
        "ATTACHMENT_LINK_LIMIT",
        "LINKED_ENTITY_TYPES",
        "PAGE_LINK_LIMIT",
        "REVERSE_LINKED_ENTITY_TYPES",
        "isLinkedEntityType",
        "linksByAttachment",
        "narrowAttachmentLinks",
        "toLinkOutcome",
      ].sort(),
    );
  });
});
