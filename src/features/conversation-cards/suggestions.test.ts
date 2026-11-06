/**
 * `2K-SUGG-001` … `2K-SUGG-005` — deterministic, capped, and cheap.
 *
 * Life Brain B.7 (T7) adds the time and state categories and the two properties
 * they bring with them: **urgency decides the order**, and **a classified row
 * can never be named here** when the Home would have masked it.
 */

import { describe, expect, it } from "vitest";

import type { TaskSensitivity } from "@/features/sensitivity/task-derivation";

import {
  MAX_SUGGESTIONS,
  SUGGESTION_CATEGORIES,
  deriveConversationSuggestions,
  suggestionTelemetryCategory,
  type SuggestionItem,
} from "./suggestions";

const people = [
  { id: "p1", name: "Marina" },
  { id: "p2", name: "Ana" },
  { id: "p3", name: "Bruno" },
];
const projects = [
  { id: "j1", name: "Aurora" },
  { id: "j2", name: "Relatório trimestral" },
];

const NORMAL: TaskSensitivity = { kind: "derived", level: "normal" };
const PRIVATE: TaskSensitivity = { kind: "derived", level: "private" };
const SECRET: TaskSensitivity = { kind: "derived", level: "highly_sensitive" };
const UNCLASSIFIED: TaskSensitivity = { kind: "undetermined" };

function item(
  id: string,
  name: string,
  at: string,
  sensitivity: TaskSensitivity = NORMAL,
): SuggestionItem {
  return { id, name, at, sensitivity };
}

describe("2K-SUGG-001: at most three, always", () => {
  it("caps a state that could produce five", () => {
    const suggestions = deriveConversationSuggestions({ people, projects });
    expect(suggestions).toHaveLength(MAX_SUGGESTIONS);
    expect(MAX_SUGGESTIONS).toBe(3);
  });

  it("caps when one source alone exceeds the ceiling", () => {
    expect(deriveConversationSuggestions({ people, projects: [] })).toHaveLength(3);
  });

  it("returns fewer when there is less to say", () => {
    expect(deriveConversationSuggestions({ people: [people[0]!], projects: [] })).toHaveLength(1);
    expect(deriveConversationSuggestions({ people: [people[0]!], projects: [projects[0]!] }))
      .toHaveLength(2);
  });

  it("returns ZERO when nothing is honestly appropriate", () => {
    // OD-2K-4: show none rather than invent one. This is the case the
    // hard-coded example used to fill with a person the user may not have.
    expect(deriveConversationSuggestions({ people: [], projects: [] })).toEqual([]);
  });

  it("drops a name that names nothing", () => {
    expect(deriveConversationSuggestions({ people: [{ id: "p", name: "   " }], projects: [] }))
      .toEqual([]);
  });

  it("still caps at three when every urgent bucket has something", () => {
    expect(deriveConversationSuggestions({
      people,
      projects,
      overdueTasks: [item("t1", "Pagar a escola", "2026-11-01T12:00:00Z")],
      tasksDueToday: [item("t2", "Levar o carro", "2026-11-05T12:00:00Z")],
      remindersSoon: [item("r1", "Consulta da Ana", "2026-11-06T09:00:00Z")],
      birthdaysSoon: [item("b1", "Ana", "2026-11-07T00:00:00Z")],
      openQuestions: [item("q1", "Qual escola?", "2026-11-02T12:00:00Z")],
      unreviewedEntries: [item("e1", "Fui ao mercado", "2026-11-03T12:00:00Z")],
    })).toHaveLength(MAX_SUGGESTIONS);
  });
});

describe("2K-SUGG-002: deterministic", () => {
  it("produces the identical result for the identical input, every time", () => {
    const once = deriveConversationSuggestions({ people, projects });
    for (let run = 0; run < 5; run += 1) {
      expect(deriveConversationSuggestions({ people, projects })).toEqual(once);
    }
  });

  it("spends the cap on variety rather than on the first source", () => {
    /*
     * Three slots, two sources. Taking every person first would let a user with
     * three people never see a project suggestion at all, which makes the
     * feature look like it only knows one kind of thing.
     */
    expect(deriveConversationSuggestions({ people, projects }).map((s) => s.category))
      .toEqual(["person", "project", "person"]);
  });

  it("keeps going cleanly when one source is empty", () => {
    expect(deriveConversationSuggestions({ people: [], projects }).map((s) => s.category))
      .toEqual(["project", "project"]);
  });

  it("preserves the caller's order, which is already deterministic", () => {
    expect(deriveConversationSuggestions({ people, projects }).map((s) => s.name))
      .toEqual(["Marina", "Aurora", "Ana"]);
  });

  it("is a pure function of its input", () => {
    const inputs = {
      people: [...people],
      projects: [...projects],
      overdueTasks: [item("t2", "B", "2026-11-02T12:00:00Z"), item("t1", "A", "2026-11-01T12:00:00Z")],
    };
    const snapshot = JSON.stringify(inputs);
    deriveConversationSuggestions(inputs);
    expect(JSON.stringify(inputs)).toBe(snapshot);
  });
});

describe("LB-SUGG-001: urgency decides the order, and nothing scores", () => {
  it("puts overdue ahead of today, today ahead of what is coming", () => {
    expect(deriveConversationSuggestions({
      people: [],
      projects: [],
      remindersSoon: [item("r1", "Consulta", "2026-11-06T09:00:00Z")],
      tasksDueToday: [item("t2", "Levar o carro", "2026-11-05T12:00:00Z")],
      overdueTasks: [item("t1", "Pagar a escola", "2026-11-01T12:00:00Z")],
    }).map((s) => s.category)).toEqual(["overdue_task", "due_today", "reminder_soon"]);
  });

  it("declares the precedence as the order of the vocabulary itself", () => {
    // The array is the rule: a reader does not have to find a comparator to
    // know which category wins, and an edit that reorders it is visible as a
    // reordered list rather than as a changed number.
    expect([...SUGGESTION_CATEGORIES]).toEqual([
      "overdue_task",
      "due_today",
      "reminder_soon",
      "birthday_soon",
      "open_question",
      "unreviewed_entry",
      "person",
      "project",
    ]);
  });

  it("takes at most one from each urgent bucket, so three slots show three kinds", () => {
    const suggestions = deriveConversationSuggestions({
      people,
      projects,
      overdueTasks: [
        item("t1", "Pagar a escola", "2026-11-01T12:00:00Z"),
        item("t2", "Trocar o pneu", "2026-11-02T12:00:00Z"),
        item("t3", "Ligar para o banco", "2026-11-03T12:00:00Z"),
      ],
    });
    expect(suggestions.map((s) => s.category)).toEqual(["overdue_task", "person", "project"]);
  });

  it("orders within a bucket by instant, then by id, whatever order it arrives in", () => {
    const [first] = deriveConversationSuggestions({
      people: [],
      projects: [],
      overdueTasks: [
        item("t9", "Depois", "2026-11-03T12:00:00Z"),
        item("t1", "Antes", "2026-11-01T12:00:00Z"),
      ],
    });
    expect(first?.name).toBe("Antes");
  });

  it("breaks an exact tie on the id, so two rows at the same instant never swap", () => {
    const sameInstant = "2026-11-01T12:00:00Z";
    const [first] = deriveConversationSuggestions({
      people: [],
      projects: [],
      remindersSoon: [item("r2", "Segundo", sameInstant), item("r1", "Primeiro", sameInstant)],
    });
    expect(first?.name).toBe("Primeiro");
  });

  it("lets people and projects fill the slots urgency did not use", () => {
    expect(deriveConversationSuggestions({
      people: [people[0]!],
      projects: [],
      birthdaysSoon: [item("b1", "Ana", "2026-11-07T00:00:00Z")],
    }).map((s) => s.category)).toEqual(["birthday_soon", "person"]);
  });

  it("invents nothing when a bucket is empty: zero stays a legitimate answer", () => {
    expect(deriveConversationSuggestions({
      people: [],
      projects: [],
      overdueTasks: [],
      tasksDueToday: [],
      remindersSoon: [],
      birthdaysSoon: [],
      openQuestions: [],
      unreviewedEntries: [],
    })).toEqual([]);
  });
});

describe("LB-SUGG-002: a suggestion never walks around the Home's mask", () => {
  /*
    The module's own header says people and projects carry no classification, so
    there is nothing to mask for them. That reasoning does NOT transfer: a task,
    a reminder, a question and a record all derive a level from their source
    entry, and the Home already withholds a `highly_sensitive` one behind
    "Conteúdo muito sensível, oculto". A suggestion that printed the same title
    on the opening screen would be that mask, walked around.
  */
  const buckets = [
    "overdueTasks",
    "tasksDueToday",
    "remindersSoon",
    "birthdaysSoon",
    "openQuestions",
    "unreviewedEntries",
  ] as const;

  it("drops a highly sensitive row from every classified bucket", () => {
    for (const bucket of buckets) {
      expect(
        deriveConversationSuggestions({
          people: [],
          projects: [],
          [bucket]: [item("x1", "Resultado da biópsia", "2026-11-01T12:00:00Z", SECRET)],
        }),
        bucket,
      ).toEqual([]);
    }
  });

  it("is not vacuous: the identical row shows when its source is not sensitive", () => {
    for (const bucket of buckets) {
      expect(
        deriveConversationSuggestions({
          people: [],
          projects: [],
          [bucket]: [item("x1", "Resultado da biópsia", "2026-11-01T12:00:00Z", NORMAL)],
        }).map((s) => s.name),
        bucket,
      ).toEqual(["Resultado da biópsia"]);
    }
  });

  it("shows a `private` row, because the owner's own screen is where private belongs", () => {
    // The contract's chat rule is `private: SHOW`. Stated as a test so a future
    // edit to the rule is visible here rather than only in the table.
    expect(deriveConversationSuggestions({
      people: [],
      projects: [],
      overdueTasks: [item("t1", "Consulta", "2026-11-01T12:00:00Z", PRIVATE)],
    }).map((s) => s.name)).toEqual(["Consulta"]);
  });

  it("shows a row with no source at all, and does not read that absence as sensitive", () => {
    // OD-2L-1 B: a hand-made task has no classification to derive, and the
    // absence is never inferred — in either direction.
    expect(deriveConversationSuggestions({
      people: [],
      projects: [],
      tasksDueToday: [item("t1", "Levar o carro", "2026-11-05T12:00:00Z", UNCLASSIFIED)],
    }).map((s) => s.name)).toEqual(["Levar o carro"]);
  });

  it("drops a sensitive row without taking its slot, so the next kind is offered", () => {
    // Withholding must not also cost the owner a suggestion they could read.
    expect(deriveConversationSuggestions({
      people: [],
      projects: [],
      overdueTasks: [item("t1", "Oculto", "2026-11-01T12:00:00Z", SECRET)],
      tasksDueToday: [item("t2", "Levar o carro", "2026-11-05T12:00:00Z", NORMAL)],
    }).map((s) => s.category)).toEqual(["due_today"]);
  });

  it("picks the next readable row inside the same bucket", () => {
    expect(deriveConversationSuggestions({
      people: [],
      projects: [],
      overdueTasks: [
        item("t1", "Oculto", "2026-11-01T12:00:00Z", SECRET),
        item("t2", "Pagar a escola", "2026-11-02T12:00:00Z", NORMAL),
      ],
    }).map((s) => s.name)).toEqual(["Pagar a escola"]);
  });
});

describe("LB-SUGG-003: a scoped conversation gets scoped suggestions, or none", () => {
  /*
    The owner's finding of 5 November: in "Perguntando sobre Família" the chips
    still read "Quando fui ao médico pela última vez?" and "O que ficou pendente
    com Ana?" — neither about Família. A suggestion that ignores the scope is
    worse than no suggestion, because the banner above it says the conversation
    has one.
  */
  it("keeps only the scoped person", () => {
    const suggestions = deriveConversationSuggestions({
      people,
      projects,
      scope: { type: "person", id: "p2" },
    });
    expect(suggestions).toEqual([{ category: "person", id: "p2", name: "Ana" }]);
  });

  it("keeps only the scoped project", () => {
    expect(deriveConversationSuggestions({
      people,
      projects,
      scope: { type: "project", id: "j2" },
    })).toEqual([{ category: "project", id: "j2", name: "Relatório trimestral" }]);
  });

  it("offers none for a scope no category can speak about", () => {
    // An area ("Família") and an organization have no suggestion sentence, so
    // the honest answer is silence rather than a generic question.
    for (const type of ["context", "organization"] as const) {
      expect(deriveConversationSuggestions({
        people,
        projects,
        scope: { type, id: "c1" },
      }), type).toEqual([]);
    }
  });

  it("drops the urgent categories under a scope, since none is known to be in it", () => {
    expect(deriveConversationSuggestions({
      people: [people[1]!],
      projects: [],
      overdueTasks: [item("t1", "Pagar a escola", "2026-11-01T12:00:00Z")],
      birthdaysSoon: [item("b1", "Ana", "2026-11-07T00:00:00Z")],
      scope: { type: "person", id: "p2" },
    }).map((s) => s.category)).toEqual(["person"]);
  });

  it("offers none when the scope names something the reader does not have", () => {
    expect(deriveConversationSuggestions({
      people,
      projects,
      scope: { type: "person", id: "p-not-mine" },
    })).toEqual([]);
  });

  it("behaves exactly as before when there is no scope", () => {
    expect(deriveConversationSuggestions({ people, projects, scope: null }))
      .toEqual(deriveConversationSuggestions({ people, projects }));
  });
});

describe("2K-SUGG-005: the category is all telemetry may know", () => {
  it("declares a closed vocabulary", () => {
    expect([...SUGGESTION_CATEGORIES].sort()).toEqual([
      "birthday_soon",
      "due_today",
      "open_question",
      "overdue_task",
      "person",
      "project",
      "reminder_soon",
      "unreviewed_entry",
    ]);
  });

  it("narrows a suggestion to its category and nothing else", () => {
    const [suggestion] = deriveConversationSuggestions({ people, projects });
    const payload = suggestionTelemetryCategory(suggestion!);
    expect(Object.keys(payload)).toEqual(["category"]);
    expect(payload).toEqual({ category: "person" });
  });

  it("cannot carry the name, by shape", () => {
    // The property `2K-SUGG-005` needs. The return type has no field a name
    // could occupy, so "log the category, never the name" is enforced by the
    // signature rather than by each call site's care.
    const [suggestion] = deriveConversationSuggestions({ people, projects });
    expect(JSON.stringify(suggestionTelemetryCategory(suggestion!))).not.toContain("Marina");
    expect(JSON.stringify(suggestionTelemetryCategory(suggestion!))).not.toContain(suggestion!.id);
  });

  it("carries no name for a classified row either", () => {
    const [suggestion] = deriveConversationSuggestions({
      people: [],
      projects: [],
      overdueTasks: [item("t1", "Resultado do exame", "2026-11-01T12:00:00Z", PRIVATE)],
    });
    expect(suggestionTelemetryCategory(suggestion!)).toEqual({ category: "overdue_task" });
    expect(JSON.stringify(suggestionTelemetryCategory(suggestion!)))
      .not.toContain("Resultado do exame");
  });

  it("keeps the name and the category apart on the value itself", () => {
    const [suggestion] = deriveConversationSuggestions({ people, projects });
    expect(Object.keys(suggestion!).sort()).toEqual(["category", "id", "name"]);
    // A rendered sentence could be logged whole; a pair cannot.
    expect(typeof suggestion!.category).toBe("string");
    expect(suggestion).not.toHaveProperty("text");
  });

  it("carries no classification out of the derivation", () => {
    // The level was consulted here and has no business on a rendered value: a
    // surface holding one would be a surface that could decide for itself.
    const [suggestion] = deriveConversationSuggestions({
      people: [],
      projects: [],
      overdueTasks: [item("t1", "Pagar a escola", "2026-11-01T12:00:00Z", NORMAL)],
    });
    expect(suggestion).not.toHaveProperty("sensitivity");
    expect(suggestion).not.toHaveProperty("at");
  });
});
