import { describe, expect, it } from "vitest";

import { MEMORY_SEGMENTS, areaByEntry, groupBySegment, memorySegment, type SegmentArea } from "./segments";

const NONE = new Map<string, SegmentArea>();
const memory = (kind: string, extra: { person_id?: string | null; source_entry_id?: string | null } = {}) => ({
  kind,
  person_id: extra.person_id ?? null,
  source_entry_id: extra.source_entry_id ?? null,
});

describe("every memory lands in exactly one segment (Life Brain E.4)", () => {
  it("takes the life area of the record it came from first", () => {
    const areas = new Map<string, SegmentArea>([["e1", "health"]]);
    expect(memorySegment(memory("fact", { source_entry_id: "e1" }), areas)).toBe("health");
    // Even a preference, and even one about a person: the area is the most specific fact.
    expect(memorySegment(memory("preference", { source_entry_id: "e1", person_id: "p1" }), areas)).toBe("health");
  });

  it("puts a professional context in work when the record has no area", () => {
    expect(memorySegment(memory("professional_context"), NONE)).toBe("work");
  });

  it("puts a memory about one of your people in Pessoas", () => {
    expect(memorySegment(memory("fact", { person_id: "p1" }), NONE)).toBe("people");
    expect(memorySegment(memory("relationship"), NONE)).toBe("people");
  });

  it("puts preferences, habits, rules, restrictions and goals in Sobre você", () => {
    for (const kind of ["preference", "habit", "rule", "restriction", "goal"]) {
      expect(memorySegment(memory(kind), NONE)).toBe("self");
    }
  });

  it("puts everything else, including an unknown kind, in Outras", () => {
    for (const kind of ["fact", "responsibility", "recurring_info", "something_new"]) {
      expect(memorySegment(memory(kind), NONE)).toBe("other");
    }
  });

  it("ignores a source record whose area it does not know", () => {
    expect(memorySegment(memory("goal", { source_entry_id: "missing" }), NONE)).toBe("self");
  });
});

describe("a record linked to several areas gets one, independent of row order", () => {
  it("keeps the first area in segment order", () => {
    const forward = areaByEntry([{ entryId: "e1", kind: "work" }, { entryId: "e1", kind: "health" }]);
    const backward = areaByEntry([{ entryId: "e1", kind: "health" }, { entryId: "e1", kind: "work" }]);
    expect(forward.get("e1")).toBe("health");
    expect(backward.get("e1")).toBe("health");
  });

  it("ignores contexts that are not areas", () => {
    expect(areaByEntry([{ entryId: "e1", kind: "custom" }, { entryId: "e2", kind: "personal" }]).size).toBe(0);
  });
});

describe("grouping keeps segment order and the order inside each group", () => {
  it("leaves empty segments out and keeps each item once", () => {
    const items = [
      { id: "a", segment: "other" as const },
      { id: "b", segment: "self" as const },
      { id: "c", segment: "other" as const },
    ];
    const groups = groupBySegment(items, (item) => item.segment);
    expect(groups.map((group) => group.segment)).toEqual(["self", "other"]);
    expect(groups[1].items.map((item) => item.id)).toEqual(["a", "c"]);
    expect(groups.flatMap((group) => group.items)).toHaveLength(items.length);
  });

  it("starts with Sobre você and ends with Outras", () => {
    expect(MEMORY_SEGMENTS[0]).toBe("self");
    expect(MEMORY_SEGMENTS[MEMORY_SEGMENTS.length - 1]).toBe("other");
  });
});
