import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  HISTORY_SUBJECT_ROUTES,
  LINKABLE_ENTITY_TYPES,
  subjectHref,
} from "./subject-route";
import { HISTORY_ENTITY_TYPES, type HistoryEntityType } from "./vocabulary";

describe("history subject routes", () => {
  it("answers for every entity type, so a new one cannot be silently unlinkable", () => {
    expect(Object.keys(HISTORY_SUBJECT_ROUTES).sort()).toEqual([...HISTORY_ENTITY_TYPES].sort());
  });

  it("only links to routes that exist on disk", () => {
    // A link is a promise the destination exists. This checks the promise
    // against the App Router tree rather than against anyone's memory of it.
    const segments: Record<(typeof LINKABLE_ENTITY_TYPES)[number], string> = {
      task: join("work", "[taskId]"),
      entry: join("inbox", "[entryId]"),
      memory: join("memories", "[memoryId]"),
      project: join("projects", "[projectId]"),
      person: join("people", "[personId]"),
      conversation: join("chat", "[conversationId]"),
      // Slice G5. The reminders route is a list, not a `[id]` page — the link
      // carries a `#reminder-<uuid>` fragment to the row instead. The promise
      // being checked here is still the same one: the page it lands on exists.
      reminder: "reminders",
      // EGC.1. Both routes are created in the same change that makes these two
      // linkable, so this assertion is the one that would have caught a link
      // added ahead of its page.
      organization: join("organizations", "[organizationId]"),
      context: join("contexts", "[contextId]"),
    };

    for (const entityType of LINKABLE_ENTITY_TYPES) {
      const route = join(
        process.cwd(),
        "src",
        "app",
        "[locale]",
        "app",
        segments[entityType],
        "page.tsx",
      );
      expect(existsSync(route), `${entityType} links to a route that does not exist`).toBe(true);
    }
  });

  it("builds the locale-correct href for a linkable subject", () => {
    expect(subjectHref("task", "task-1", "pt-BR")).toBe("/pt-BR/app/work/task-1");
    expect(subjectHref("memory", "mem-1", "en")).toBe("/en/app/memories/mem-1");
    expect(subjectHref("person", "person-1", "pt-BR")).toBe("/pt-BR/app/people/person-1");
    expect(subjectHref("organization", "org-1", "en")).toBe("/en/app/organizations/org-1");
    expect(subjectHref("context", "ctx-1", "pt-BR")).toBe("/pt-BR/app/contexts/ctx-1");
  });

  it("returns null for the kinds with no detail page", () => {
    for (const entityType of [
      "entry_interpretation",
      "entry_task_candidate_resolution",
      "pending_question",
    ] as const satisfies readonly HistoryEntityType[]) {
      expect(subjectHref(entityType, "some-id", "pt-BR")).toBeNull();
    }
  });

  it("returns null when there is no id or no recognised type", () => {
    expect(subjectHref("task", null, "pt-BR")).toBeNull();
    expect(subjectHref(null, "task-1", "pt-BR")).toBeNull();
  });
});
