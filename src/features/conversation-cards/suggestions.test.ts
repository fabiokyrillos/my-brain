/**
 * `2K-SUGG-001` … `2K-SUGG-005` — deterministic, capped, and cheap.
 */

import { describe, expect, it } from "vitest";

import {
  MAX_SUGGESTIONS,
  SUGGESTION_CATEGORIES,
  deriveConversationSuggestions,
  suggestionTelemetryCategory,
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

  it("falls back cleanly when one source is empty", () => {
    expect(deriveConversationSuggestions({ people: [], projects }).map((s) => s.category))
      .toEqual(["project", "project"]);
  });

  it("preserves the caller's order, which is already deterministic", () => {
    expect(deriveConversationSuggestions({ people, projects }).map((s) => s.name))
      .toEqual(["Marina", "Aurora", "Ana"]);
  });

  it("is a pure function of its input", () => {
    const inputs = { people: [...people], projects: [...projects] };
    const snapshot = JSON.stringify(inputs);
    deriveConversationSuggestions(inputs);
    expect(JSON.stringify(inputs)).toBe(snapshot);
  });
});

describe("2K-SUGG-005: the category is all telemetry may know", () => {
  it("declares a closed vocabulary", () => {
    expect([...SUGGESTION_CATEGORIES].sort()).toEqual(["person", "project"]);
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

  it("keeps the name and the category apart on the value itself", () => {
    const [suggestion] = deriveConversationSuggestions({ people, projects });
    expect(Object.keys(suggestion!).sort()).toEqual(["category", "id", "name"]);
    // A rendered sentence could be logged whole; a pair cannot.
    expect(typeof suggestion!.category).toBe("string");
    expect(suggestion).not.toHaveProperty("text");
  });
});
