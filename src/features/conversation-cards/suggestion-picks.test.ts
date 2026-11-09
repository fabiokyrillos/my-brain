/**
 * Life Brain B.8 (ADR-163) — what the model may choose from, and how its choice
 * is resolved. Both are pure: the model can only ever pick among rows the
 * derivation already offered, under the same sensitivity rule.
 */

import { describe, expect, it } from "vitest";

import type { TaskSensitivity } from "@/features/sensitivity/task-derivation";

import {
  MAX_SUGGESTIONS,
  deriveConversationSuggestions,
  suggestionCandidates,
  suggestionsFromPicks,
  type SuggestionItem,
} from "./suggestions";

const NORMAL: TaskSensitivity = { kind: "derived", level: "normal" };
const SECRET: TaskSensitivity = { kind: "derived", level: "highly_sensitive" };

function item(id: string, name: string, at: string, sensitivity: TaskSensitivity = NORMAL): SuggestionItem {
  return { id, name, at, sensitivity };
}

const people = [{ id: "p1", name: "Marina" }, { id: "p2", name: "Ana" }];
const projects = [{ id: "j1", name: "Aurora" }];

describe("suggestionCandidates: every row the derivation could name, and nothing else", () => {
  it("offers every readable row of a dated bucket, not only its earliest", () => {
    const candidates = suggestionCandidates({
      people,
      projects,
      overdueTasks: [item("t2", "Pagar IPTU", "2026-11-02"), item("t1", "Renovar passaporte", "2026-11-01")],
    });
    expect(candidates.filter((candidate) => candidate.category === "overdue_task").map((c) => c.id)).toEqual(["t1", "t2"]);
    expect(candidates.map((candidate) => candidate.category)).toEqual([
      "overdue_task",
      "overdue_task",
      "person",
      "person",
      "project",
    ]);
  });

  it("never offers a highly sensitive row, so the model cannot choose one", () => {
    const candidates = suggestionCandidates({
      people: [],
      projects: [],
      tasksDueToday: [item("t1", "Exame", "2026-11-09", SECRET), item("t2", "Mercado", "2026-11-09")],
    });
    expect(candidates.map((candidate) => candidate.id)).toEqual(["t2"]);
  });

  it("drops a blank name, as the derivation does", () => {
    expect(suggestionCandidates({ people: [{ id: "p1", name: "  " }], projects: [] })).toEqual([]);
  });

  it("offers a scoped conversation its subject and nothing else", () => {
    const candidates = suggestionCandidates({
      people,
      projects,
      overdueTasks: [item("t1", "Renovar passaporte", "2026-11-01")],
      scope: { type: "person", id: "p2" },
    });
    expect(candidates).toEqual([{ category: "person", id: "p2", name: "Ana" }]);
  });

  it("contains everything the derivation itself would show", () => {
    const inputs = {
      people,
      projects,
      remindersSoon: [item("r1", "Consulta", "2026-11-10")],
      birthdaysSoon: [item("p1", "Marina", "2026-11-12")],
    };
    const candidates = suggestionCandidates(inputs);
    for (const shown of deriveConversationSuggestions(inputs)) {
      expect(candidates).toContainEqual(shown);
    }
  });
});

describe("suggestionsFromPicks: the model's choice, resolved against today's rows", () => {
  const candidates = suggestionCandidates({
    people,
    projects,
    overdueTasks: [item("t1", "Renovar passaporte", "2026-11-01")],
  });

  it("keeps the model's order and takes the name from today's row", () => {
    expect(
      suggestionsFromPicks(
        [{ category: "project", id: "j1" }, { category: "overdue_task", id: "t1" }],
        candidates,
      ),
    ).toEqual([
      { category: "project", id: "j1", name: "Aurora" },
      { category: "overdue_task", id: "t1", name: "Renovar passaporte" },
    ]);
  });

  it("drops a pick that today's rows no longer offer", () => {
    expect(suggestionsFromPicks([{ category: "overdue_task", id: "gone" }], candidates)).toEqual([]);
  });

  it("drops a pick whose category does not match its row", () => {
    expect(suggestionsFromPicks([{ category: "person", id: "t1" }], candidates)).toEqual([]);
  });

  it("drops repeats and holds the cap", () => {
    const picks = [
      { category: "person" as const, id: "p1" },
      { category: "person" as const, id: "p1" },
      { category: "person" as const, id: "p2" },
      { category: "project" as const, id: "j1" },
      { category: "overdue_task" as const, id: "t1" },
    ];
    const chosen = suggestionsFromPicks(picks, candidates);
    expect(chosen).toHaveLength(MAX_SUGGESTIONS);
    expect(chosen.map((suggestion) => suggestion.id)).toEqual(["p1", "p2", "j1"]);
  });
});
