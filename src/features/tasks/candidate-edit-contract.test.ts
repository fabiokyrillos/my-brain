import { describe, expect, it } from "vitest";
import {
  candidateEditArraySchema,
  normalizeCandidateEdits,
  serializeCandidateEdits,
  type CandidateEditCommand,
  type CandidateEditSuggestion,
} from "./candidate-edit-contract";

const suggestions: CandidateEditSuggestion[] = [
  {
    candidateIndex: 0,
    title: "Send the report",
    description: "By email",
    dueAt: "2026-07-21T17:30:00-03:00",
  },
  {
    candidateIndex: 1,
    title: "Book the room",
    description: null,
    dueAt: null,
  },
];

function normalize(
  edits: unknown,
  selectedCandidateIndexes: readonly number[] = [0, 1],
) {
  return normalizeCandidateEdits({
    edits,
    selectedCandidateIndexes,
    suggestions,
  });
}

describe("candidate edit contract", () => {
  it("canonicalizes a title-only edit", () => {
    expect(normalize([{ candidateIndex: 0, changes: { title: "  Send the signed report  " } }])).toEqual({
      edits: [{ candidateIndex: 0, changes: { title: "Send the signed report" } }],
      editedCandidateCount: 1,
      editedFieldCount: 1,
    });
  });

  it("canonicalizes a description-only edit", () => {
    expect(normalize([{ candidateIndex: 0, changes: { description: "  Send before lunch  " } }])).toEqual({
      edits: [{ candidateIndex: 0, changes: { description: "Send before lunch" } }],
      editedCandidateCount: 1,
      editedFieldCount: 1,
    });
  });

  it("canonicalizes a due-date-only edit", () => {
    expect(normalize([{ candidateIndex: 0, changes: { dueAt: "2026-07-22T09:00:00-03:00" } }])).toEqual({
      edits: [{ candidateIndex: 0, changes: { dueAt: "2026-07-22T09:00:00-03:00" } }],
      editedCandidateCount: 1,
      editedFieldCount: 1,
    });
  });

  it("canonicalizes all three editable fields without adding later-phase fields", () => {
    expect(normalize([{
      candidateIndex: 0,
      changes: {
        title: "  Send the signed report ",
        description: "  Use the final attachment ",
        dueAt: "2026-07-22T09:00:00-03:00",
      },
    }])).toEqual({
      edits: [{
        candidateIndex: 0,
        changes: {
          title: "Send the signed report",
          description: "Use the final attachment",
          dueAt: "2026-07-22T09:00:00-03:00",
        },
      }],
      editedCandidateCount: 1,
      editedFieldCount: 3,
    });
  });

  it("keeps omitted fields absent from canonical changes", () => {
    const result = normalize([{ candidateIndex: 0, changes: { title: "Send the signed report" } }]);

    expect(result.edits[0]?.changes).toEqual({ title: "Send the signed report" });
    expect(result.edits[0]?.changes).not.toHaveProperty("description");
    expect(result.edits[0]?.changes).not.toHaveProperty("dueAt");
  });

  it("removes unchanged values from canonical changes", () => {
    expect(normalize([{
      candidateIndex: 0,
      changes: {
        title: "Send the report",
        description: "By email",
        dueAt: "2026-07-21T17:30:00-03:00",
      },
    }])).toEqual({ edits: [], editedCandidateCount: 0, editedFieldCount: 0 });
  });

  it("represents reset-to-suggestion by removing the override", () => {
    expect(normalize([{
      candidateIndex: 0,
      changes: {
        title: "  Send the report  ",
        description: "  By email  ",
        dueAt: "2026-07-21T17:30:00-03:00",
      },
    }]).edits).toEqual([]);
  });

  it("normalizes an empty description to explicit null", () => {
    expect(normalize([{ candidateIndex: 0, changes: { description: "" } }]).edits).toEqual([
      { candidateIndex: 0, changes: { description: null } },
    ]);
  });

  it("normalizes a whitespace-only description to explicit null", () => {
    expect(normalize([{ candidateIndex: 0, changes: { description: "   " } }]).edits).toEqual([
      { candidateIndex: 0, changes: { description: null } },
    ]);
  });

  it("preserves an explicit description clear as null", () => {
    expect(normalize([{ candidateIndex: 0, changes: { description: null } }]).edits).toEqual([
      { candidateIndex: 0, changes: { description: null } },
    ]);
  });

  it("canonicalizes explicit null away when the suggestion is already null", () => {
    expect(normalize([{ candidateIndex: 1, changes: { description: null } }]).edits).toEqual([]);
  });

  it("preserves an explicit due-date clear as null", () => {
    expect(normalize([{ candidateIndex: 0, changes: { dueAt: null } }]).edits).toEqual([
      { candidateIndex: 0, changes: { dueAt: null } },
    ]);
  });

  it("rejects an empty title", () => {
    expect(() => normalize([{ candidateIndex: 0, changes: { title: "" } }])).toThrow();
  });

  it("rejects a whitespace-only title after trimming", () => {
    expect(() => normalize([{ candidateIndex: 0, changes: { title: "   \t  " } }])).toThrow();
  });

  it("rejects a null title", () => {
    expect(candidateEditArraySchema.safeParse([
      { candidateIndex: 0, changes: { title: null } },
    ]).success).toBe(false);
  });

  it("trims a title before comparing and returning it", () => {
    expect(normalize([{ candidateIndex: 0, changes: { title: "  Final title  " } }]).edits).toEqual([
      { candidateIndex: 0, changes: { title: "Final title" } },
    ]);
  });

  it("accepts a title at the 240-character maximum", () => {
    const title = "t".repeat(240);
    expect(normalize([{ candidateIndex: 0, changes: { title } }]).edits[0]?.changes.title).toBe(title);
  });

  it("rejects a title over 240 characters", () => {
    expect(() => normalize([{ candidateIndex: 0, changes: { title: "t".repeat(241) } }])).toThrow();
  });

  it("trims a description before comparing and returning it", () => {
    expect(normalize([{ candidateIndex: 0, changes: { description: "  Final description  " } }]).edits).toEqual([
      { candidateIndex: 0, changes: { description: "Final description" } },
    ]);
  });

  it("accepts a description at the 2000-character maximum", () => {
    const description = "d".repeat(2_000);
    expect(normalize([{ candidateIndex: 0, changes: { description } }]).edits[0]?.changes.description).toBe(description);
  });

  it("rejects a description over 2000 characters", () => {
    expect(() => normalize([{ candidateIndex: 0, changes: { description: "d".repeat(2_001) } }])).toThrow();
  });

  it("rejects an unknown edit field", () => {
    expect(candidateEditArraySchema.safeParse([
      { candidateIndex: 0, changes: { priority: "high" } },
    ]).success).toBe(false);
  });

  it("rejects an unknown top-level edit key", () => {
    expect(candidateEditArraySchema.safeParse([
      { candidateIndex: 0, changes: { title: "Final title" }, status: "todo" },
    ]).success).toBe(false);
  });

  it("rejects a non-array edit payload", () => {
    expect(candidateEditArraySchema.safeParse({ candidateIndex: 0, changes: {} }).success).toBe(false);
  });

  it.each([
    ["missing changes", { candidateIndex: 0 }],
    ["null changes", { candidateIndex: 0, changes: null }],
    ["array changes", { candidateIndex: 0, changes: [] }],
    ["string changes", { candidateIndex: 0, changes: "title" }],
  ])("rejects an edit with %s", (_label, edit) => {
    expect(candidateEditArraySchema.safeParse([edit]).success).toBe(false);
  });

  it.each([
    ["title", { title: 42 }],
    ["description", { description: false }],
    ["dueAt", { dueAt: 1_234 }],
  ])("rejects a wrong scalar type for %s", (_field, changes) => {
    expect(candidateEditArraySchema.safeParse([{ candidateIndex: 0, changes }]).success).toBe(false);
  });

  it.each([
    ["malformed", "not-an-instant"],
    ["offsetless", "2026-07-22T09:00:00"],
  ])("rejects a %s dueAt string", (_label, dueAt) => {
    expect(candidateEditArraySchema.safeParse([
      { candidateIndex: 0, changes: { dueAt } },
    ]).success).toBe(false);
  });

  it("rejects duplicate candidate indices", () => {
    expect(candidateEditArraySchema.safeParse([
      { candidateIndex: 0, changes: { title: "First" } },
      { candidateIndex: 0, changes: { title: "Second" } },
    ]).success).toBe(false);
  });

  it("rejects a negative candidate index", () => {
    expect(candidateEditArraySchema.safeParse([
      { candidateIndex: -1, changes: { title: "Final title" } },
    ]).success).toBe(false);
  });

  it("rejects a non-integer candidate index", () => {
    expect(candidateEditArraySchema.safeParse([
      { candidateIndex: 0.5, changes: { title: "Final title" } },
    ]).success).toBe(false);
  });

  it("rejects an edit for an unselected candidate", () => {
    expect(() => normalize(
      [{ candidateIndex: 1, changes: { title: "Final title" } }],
      [0],
    )).toThrow();
  });

  it("rejects duplicate selected candidate indices", () => {
    expect(() => normalize(
      [{ candidateIndex: 0, changes: { title: "Final title" } }],
      [0, 0],
    )).toThrow();
  });

  it("rejects an empty selected candidate list", () => {
    expect(() => normalizeCandidateEdits({
      edits: [],
      selectedCandidateIndexes: [],
      suggestions,
    })).toThrow();
  });

  it("rejects more than 50 selected candidate indices", () => {
    const suggestions = Array.from({ length: 51 }, (_, candidateIndex) => ({
      candidateIndex,
      title: `Candidate ${candidateIndex}`,
      description: null,
      dueAt: null,
    }));

    expect(() => normalizeCandidateEdits({
      edits: [],
      selectedCandidateIndexes: suggestions.map(({ candidateIndex }) => candidateIndex),
      suggestions,
    })).toThrow();
  });

  it("rejects a selected candidate index without an immutable suggestion", () => {
    expect(() => normalize(
      [{ candidateIndex: 2, changes: { title: "Unknown candidate" } }],
      [2],
    )).toThrow();
  });

  it("accepts at most 50 candidate edits", () => {
    const boundedSuggestions = Array.from({ length: 50 }, (_, candidateIndex) => ({
      candidateIndex,
      title: `Candidate ${candidateIndex}`,
      description: null,
      dueAt: null,
    }));
    const result = normalizeCandidateEdits({
      edits: boundedSuggestions.map(({ candidateIndex }) => ({
        candidateIndex,
        changes: { title: `Edited candidate ${candidateIndex}` },
      })),
      selectedCandidateIndexes: boundedSuggestions.map(({ candidateIndex }) => candidateIndex),
      suggestions: boundedSuggestions,
    });

    expect(result.editedCandidateCount).toBe(50);
  });

  it("rejects more than 50 candidate edits", () => {
    const edits = Array.from({ length: 51 }, (_, candidateIndex) => ({
      candidateIndex,
      changes: { title: `Edited candidate ${candidateIndex}` },
    }));

    expect(candidateEditArraySchema.safeParse(edits).success).toBe(false);
  });

  it("sorts candidate edits canonically by candidate index", () => {
    expect(normalize([
      { candidateIndex: 1, changes: { title: "Book the larger room" } },
      { candidateIndex: 0, changes: { title: "Send the signed report" } },
    ]).edits.map((edit) => edit.candidateIndex)).toEqual([0, 1]);
  });

  it("counts edited candidates", () => {
    expect(normalize([
      { candidateIndex: 0, changes: { title: "Send the signed report" } },
      { candidateIndex: 1, changes: { description: "For ten people" } },
    ]).editedCandidateCount).toBe(2);
  });

  it("counts edited fields after canonicalization", () => {
    expect(normalize([
      {
        candidateIndex: 0,
        changes: {
          title: "Send the signed report",
          description: "By email",
          dueAt: null,
        },
      },
      { candidateIndex: 1, changes: { description: "For ten people" } },
    ]).editedFieldCount).toBe(3);
  });

  it("canonicalizes an empty changes object away", () => {
    expect(normalize([{ candidateIndex: 0, changes: {} }])).toEqual({
      edits: [],
      editedCandidateCount: 0,
      editedFieldCount: 0,
    });
  });

  it("treats a normalized value equal to the suggestion as unchanged", () => {
    expect(normalize([{
      candidateIndex: 0,
      changes: { title: "  Send the report  ", description: "  By email " },
    }]).edits).toEqual([]);
  });

  it("serializes only the canonical edit array", () => {
    const edits: CandidateEditCommand[] = [
      { candidateIndex: 0, changes: { description: null, title: "Final title" } },
    ];

    expect(serializeCandidateEdits(edits)).toBe(
      '[{"candidateIndex":0,"changes":{"title":"Final title","description":null}}]',
    );
  });

  it("serializes every editable field in canonical candidate and field order", () => {
    const edits: CandidateEditCommand[] = [
      { candidateIndex: 1, changes: { dueAt: null, title: "Second" } },
      {
        candidateIndex: 0,
        changes: {
          dueAt: "2026-07-22T09:00:00-03:00",
          description: null,
          title: "First",
        },
      },
    ];

    expect(serializeCandidateEdits(edits)).toBe(
      '[{"candidateIndex":0,"changes":{"title":"First","description":null,"dueAt":"2026-07-22T09:00:00-03:00"}},{"candidateIndex":1,"changes":{"title":"Second","dueAt":null}}]',
    );
  });

  it("enforces the 131072-byte UTF-8 serialized payload limit", () => {
    const edits: CandidateEditCommand[] = Array.from({ length: 50 }, (_, candidateIndex) => ({
      candidateIndex,
      changes: { description: "🧠".repeat(1_000) },
    }));

    expect(() => serializeCandidateEdits(edits)).toThrow(/131072|bytes|size/i);
  });
});

describe("candidate edit contract — planning, priority, and no-due (Slice 2C.2)", () => {
  it("canonicalizes a planned-date-only edit", () => {
    expect(normalize([{ candidateIndex: 0, changes: { plannedAt: "2026-08-01T09:00:00-03:00" } }])).toEqual({
      edits: [{ candidateIndex: 0, changes: { plannedAt: "2026-08-01T09:00:00-03:00" } }],
      editedCandidateCount: 1,
      editedFieldCount: 1,
    });
  });

  it("canonicalizes a manual-priority-only edit", () => {
    expect(normalize([{ candidateIndex: 0, changes: { manualPriority: "urgent" } }])).toEqual({
      edits: [{ candidateIndex: 0, changes: { manualPriority: "urgent" } }],
      editedCandidateCount: 1,
      editedFieldCount: 1,
    });
  });

  it("rejects an unknown manual priority value", () => {
    expect(candidateEditArraySchema.safeParse([
      { candidateIndex: 0, changes: { manualPriority: "asap" } },
    ]).success).toBe(false);
  });

  it("accepts every allowed manual priority value", () => {
    for (const manualPriority of ["low", "medium", "high", "urgent"] as const) {
      expect(candidateEditArraySchema.safeParse([
        { candidateIndex: 0, changes: { manualPriority } },
      ]).success).toBe(true);
    }
  });

  it("canonicalizes an intentional-no-due edit with a reason", () => {
    expect(normalize([{
      candidateIndex: 1,
      changes: { intentionalNoDue: true, noDueReason: "Someday, not now" },
    }])).toEqual({
      edits: [{ candidateIndex: 1, changes: { intentionalNoDue: true, noDueReason: "Someday, not now" } }],
      editedCandidateCount: 1,
      editedFieldCount: 2,
    });
  });

  it("canonicalizes intentionalNoDue false away as unchanged", () => {
    expect(normalize([{ candidateIndex: 1, changes: { intentionalNoDue: false } }])).toEqual({
      edits: [],
      editedCandidateCount: 0,
      editedFieldCount: 0,
    });
  });

  it("normalizes an empty no-due reason to explicit null", () => {
    expect(normalize([{
      candidateIndex: 1,
      changes: { intentionalNoDue: true, noDueReason: "" },
    }]).edits).toEqual([{ candidateIndex: 1, changes: { intentionalNoDue: true } }]);
  });

  it("rejects an over-long no-due reason", () => {
    expect(() => normalize([{
      candidateIndex: 1,
      changes: { intentionalNoDue: true, noDueReason: "r".repeat(2_001) },
    }])).toThrow();
  });

  it("accepts a no-due reason at the 2000-character maximum", () => {
    const noDueReason = "r".repeat(2_000);
    expect(normalize([{
      candidateIndex: 1,
      changes: { intentionalNoDue: true, noDueReason },
    }]).edits[0]?.changes.noDueReason).toBe(noDueReason);
  });

  it("rejects intentionalNoDue true together with an effective due date (from the suggestion)", () => {
    expect(() => normalize([{ candidateIndex: 0, changes: { intentionalNoDue: true } }])).toThrow();
  });

  it("rejects intentionalNoDue true together with an explicitly-edited due date", () => {
    expect(() => normalize([{
      candidateIndex: 1,
      changes: { intentionalNoDue: true, dueAt: "2026-08-01T09:00:00-03:00" },
    }])).toThrow();
  });

  it("accepts intentionalNoDue true when the effective due date is explicitly cleared", () => {
    expect(normalize([{
      candidateIndex: 0,
      changes: { intentionalNoDue: true, dueAt: null },
    }]).edits).toEqual([
      { candidateIndex: 0, changes: { dueAt: null, intentionalNoDue: true } },
    ]);
  });

  it("rejects a no-due reason without the intentional-no-due flag", () => {
    expect(() => normalize([{
      candidateIndex: 1,
      changes: { noDueReason: "Waiting on scope" },
    }])).toThrow();
  });

  it("resets planned date, priority, and no-due state to the neutral baseline (no AI suggestion exists for them)", () => {
    expect(normalize([{
      candidateIndex: 0,
      changes: { plannedAt: null, manualPriority: null, intentionalNoDue: false, noDueReason: null },
    }])).toEqual({ edits: [], editedCandidateCount: 0, editedFieldCount: 0 });
  });

  it("serializes plannedAt, manualPriority, intentionalNoDue, and noDueReason in canonical field order", () => {
    const edits: CandidateEditCommand[] = [
      {
        candidateIndex: 0,
        changes: {
          noDueReason: "Someday",
          intentionalNoDue: true,
          manualPriority: "high",
          plannedAt: "2026-08-01T09:00:00-03:00",
          dueAt: null,
        },
      },
    ];

    expect(serializeCandidateEdits(edits)).toBe(
      '[{"candidateIndex":0,"changes":{"dueAt":null,"plannedAt":"2026-08-01T09:00:00-03:00","manualPriority":"high","intentionalNoDue":true,"noDueReason":"Someday"}}]',
    );
  });
});

describe("candidate edit contract — owned relations (Slice 2C.3)", () => {
  const projectA = "11111111-1111-4111-8111-111111111111";
  const projectB = "22222222-2222-4222-8222-222222222222";
  const personA = "33333333-3333-4333-8333-333333333333";
  const personB = "44444444-4444-4444-8444-444444444444";
  const contextA = "55555555-5555-4555-8555-555555555555";

  it("canonicalizes a project-only edit", () => {
    expect(normalize([{ candidateIndex: 0, changes: { projectIds: [projectA] } }])).toEqual({
      edits: [{ candidateIndex: 0, changes: { projectIds: [projectA] } }],
      editedCandidateCount: 1,
      editedFieldCount: 1,
    });
  });

  it("sorts relation IDs canonically regardless of submission order", () => {
    expect(normalize([{
      candidateIndex: 0,
      changes: { projectIds: [projectB, projectA] },
    }]).edits).toEqual([
      { candidateIndex: 0, changes: { projectIds: [projectA, projectB] } },
    ]);
  });

  it("canonicalizes context, person, and waiting-on edits together", () => {
    expect(normalize([{
      candidateIndex: 1,
      changes: {
        contextIds: [contextA],
        personIds: [personA, personB],
        waitingOnPersonIds: [personA],
      },
    }])).toEqual({
      edits: [{
        candidateIndex: 1,
        changes: {
          contextIds: [contextA],
          personIds: [personA, personB],
          waitingOnPersonIds: [personA],
        },
      }],
      editedCandidateCount: 1,
      editedFieldCount: 3,
    });
  });

  it("treats an empty relation array as unchanged (no AI suggestion exists for relations)", () => {
    expect(normalize([{ candidateIndex: 0, changes: { projectIds: [] } }])).toEqual({
      edits: [],
      editedCandidateCount: 0,
      editedFieldCount: 0,
    });
  });

  it("rejects a malformed relation ID", () => {
    expect(candidateEditArraySchema.safeParse([
      { candidateIndex: 0, changes: { projectIds: ["not-a-uuid"] } },
    ]).success).toBe(false);
  });

  it("rejects duplicate relation IDs within the same field", () => {
    expect(candidateEditArraySchema.safeParse([
      { candidateIndex: 0, changes: { personIds: [personA, personA] } },
    ]).success).toBe(false);
  });

  it("rejects more than 20 relation IDs", () => {
    const tooMany = Array.from({ length: 21 }, (_, index) => (
      `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`
    ));
    expect(candidateEditArraySchema.safeParse([
      { candidateIndex: 0, changes: { projectIds: tooMany } },
    ]).success).toBe(false);
  });

  it("accepts exactly 20 relation IDs", () => {
    const exactlyMax = Array.from({ length: 20 }, (_, index) => (
      `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`
    ));
    expect(candidateEditArraySchema.safeParse([
      { candidateIndex: 0, changes: { projectIds: exactlyMax } },
    ]).success).toBe(true);
  });

  it("serializes relation fields in canonical field order, sorted and deduplicated", () => {
    const edits: CandidateEditCommand[] = [
      {
        candidateIndex: 0,
        changes: {
          waitingOnPersonIds: [personA],
          personIds: [personB, personA],
          contextIds: [contextA],
          projectIds: [projectB, projectA],
        },
      },
    ];

    expect(serializeCandidateEdits(edits)).toBe(
      `[{"candidateIndex":0,"changes":{"projectIds":["${projectA}","${projectB}"],"contextIds":["${contextA}"],"personIds":["${personA}","${personB}"],"waitingOnPersonIds":["${personA}"]}}]`,
    );
  });
});

describe("candidate edit contract — task graph (Slice 2C.5)", () => {
  const taskT1 = "66666666-6666-4666-8666-666666666666";
  const taskT2 = "77777777-7777-4777-8777-777777777777";

  it("canonicalizes a parentRef edit targeting a sibling candidate", () => {
    expect(normalize([{
      candidateIndex: 0,
      changes: { parentRef: { type: "candidateIndex", value: 1 } },
    }])).toEqual({
      edits: [{ candidateIndex: 0, changes: { parentRef: { type: "candidateIndex", value: 1 } } }],
      editedCandidateCount: 1,
      editedFieldCount: 1,
    });
  });

  it("canonicalizes a parentRef edit targeting an existing task", () => {
    expect(normalize([{
      candidateIndex: 0,
      changes: { parentRef: { type: "taskId", value: taskT1 } },
    }])).toEqual({
      edits: [{ candidateIndex: 0, changes: { parentRef: { type: "taskId", value: taskT1 } } }],
      editedCandidateCount: 1,
      editedFieldCount: 1,
    });
  });

  it("treats a null parentRef as unchanged (no AI suggestion exists for a parent)", () => {
    expect(normalize([{ candidateIndex: 0, changes: { parentRef: null } }])).toEqual({
      edits: [],
      editedCandidateCount: 0,
      editedFieldCount: 0,
    });
  });

  it("canonicalizes dependsOn, sorting targets regardless of submission order", () => {
    expect(normalize([{
      candidateIndex: 0,
      changes: {
        dependsOn: [
          { target: { type: "taskId", value: taskT2 }, type: "blocks" },
          { target: { type: "candidateIndex", value: 1 }, type: "requires" },
        ],
      },
    }])).toEqual({
      edits: [{
        candidateIndex: 0,
        changes: {
          dependsOn: [
            { target: { type: "candidateIndex", value: 1 }, type: "requires" },
            { target: { type: "taskId", value: taskT2 }, type: "blocks" },
          ],
        },
      }],
      editedCandidateCount: 1,
      editedFieldCount: 1,
    });
  });

  it("treats an empty dependsOn array as unchanged", () => {
    expect(normalize([{ candidateIndex: 0, changes: { dependsOn: [] } }])).toEqual({
      edits: [],
      editedCandidateCount: 0,
      editedFieldCount: 0,
    });
  });

  it("rejects a malformed graph reference type", () => {
    expect(candidateEditArraySchema.safeParse([
      { candidateIndex: 0, changes: { parentRef: { type: "other", value: 1 } } },
    ]).success).toBe(false);
  });

  it("rejects a taskId reference that is not a well-formed UUID", () => {
    expect(candidateEditArraySchema.safeParse([
      { candidateIndex: 0, changes: { parentRef: { type: "taskId", value: "not-a-uuid" } } },
    ]).success).toBe(false);
  });

  it("rejects duplicate dependency targets", () => {
    expect(candidateEditArraySchema.safeParse([
      {
        candidateIndex: 0,
        changes: {
          dependsOn: [
            { target: { type: "taskId", value: taskT1 }, type: "blocks" },
            { target: { type: "taskId", value: taskT1 }, type: "requires" },
          ],
        },
      },
    ]).success).toBe(false);
  });

  it("rejects more than 20 dependency entries", () => {
    const tooMany = Array.from({ length: 21 }, (_, index) => ({
      target: { type: "candidateIndex" as const, value: index },
      type: "blocks" as const,
    }));
    expect(candidateEditArraySchema.safeParse([
      { candidateIndex: 0, changes: { dependsOn: tooMany } },
    ]).success).toBe(false);
  });

  it("serializes parentRef and dependsOn in canonical field order", () => {
    const edits: CandidateEditCommand[] = [
      {
        candidateIndex: 0,
        changes: {
          dependsOn: [
            { target: { type: "taskId", value: taskT2 }, type: "blocks" },
            { target: { type: "candidateIndex", value: 1 }, type: "requires" },
          ],
          parentRef: { type: "taskId", value: taskT1 },
        },
      },
    ];

    expect(serializeCandidateEdits(edits)).toBe(
      `[{"candidateIndex":0,"changes":{"parentRef":{"type":"taskId","value":"${taskT1}"},"dependsOn":[{"target":{"type":"candidateIndex","value":1},"type":"requires"},{"target":{"type":"taskId","value":"${taskT2}"},"type":"blocks"}]}}]`,
    );
  });
});
