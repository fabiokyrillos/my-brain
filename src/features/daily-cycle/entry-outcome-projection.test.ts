import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { toEntryOutcomeView, type EntryOutcomeProjectionInput } from "./entry-outcome-projection";

const ENTRY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TASK = "11111111-1111-4111-8111-111111111111";
const REMINDER = "22222222-2222-4222-8222-222222222222";
const MEMORY = "33333333-3333-4333-8333-333333333333";
const PERSON = "44444444-4444-4444-8444-444444444444";
const PROJECT = "55555555-5555-4555-8555-555555555555";
const CONTEXT = "66666666-6666-4666-8666-666666666666";
const ORGANIZATION = "77777777-7777-4777-8777-777777777777";

function build(overrides: Partial<EntryOutcomeProjectionInput> = {}): EntryOutcomeProjectionInput {
  return {
    entryId: ENTRY,
    locale: "pt-BR",
    timezone: "America/Sao_Paulo",
    tasks: [],
    reminders: [],
    memories: [],
    entities: [],
    ...overrides,
  };
}

describe("what now exists because of an entry", () => {
  it("says nothing was created rather than going silent", () => {
    const view = toEntryOutcomeView(build());

    expect(view.isEmpty).toBe(true);
    expect(view.groups).toEqual([]);
    expect(view.entryId).toBe(ENTRY);
  });

  it("drops a family with no rows instead of rendering an empty heading", () => {
    const view = toEntryOutcomeView(
      build({ tasks: [{ id: TASK, title: "Ligar para a Marina", status: "todo", due_at: null }] }),
    );

    expect(view.isEmpty).toBe(false);
    expect(view.groups.map((group) => group.family)).toEqual(["task"]);
  });

  it("keeps the four families in a fixed order so the page does not reshuffle", () => {
    const view = toEntryOutcomeView(
      build({
        tasks: [{ id: TASK, title: "Tarefa", status: "todo", due_at: null }],
        reminders: [{ id: REMINDER, title: "Lembrete", status: "scheduled", remind_at: "2026-08-01T12:00:00Z" }],
        memories: [{ id: MEMORY, content: "Memória", kind: "fact" }],
        entities: [{ entity_id: PERSON, entity_type: "person", mention: "Marina", name: "Marina" }],
      }),
    );

    expect(view.groups.map((group) => group.family)).toEqual(["task", "reminder", "memory", "entity"]);
  });

  describe("destinations", () => {
    /**
     * The finding underneath UX-04's "what was created" was that a confirmed
     * task was not linkable. It is the same defect UX-19 named from the other
     * side: `open_task` was a declared action with no route. Both are answered
     * by pointing at the detail page D1 shipped.
     */
    it("links a created task to its detail route", () => {
      const view = toEntryOutcomeView(
        build({ tasks: [{ id: TASK, title: "Tarefa", status: "todo", due_at: null }] }),
      );

      expect(view.groups[0]!.items[0]!.href).toBe(`/pt-BR/app/work/${TASK}`);
    });

    it("links a memory to its detail route and a reminder to the list it lives on", () => {
      const view = toEntryOutcomeView(
        build({
          reminders: [{ id: REMINDER, title: "Lembrete", status: "scheduled", remind_at: "2026-08-01T12:00:00Z" }],
          memories: [{ id: MEMORY, content: "Memória", kind: "fact" }],
        }),
      );

      const [reminders, memories] = view.groups;
      expect(reminders!.items[0]!.href).toBe("/pt-BR/app/reminders");
      expect(memories!.items[0]!.href).toBe(`/pt-BR/app/memories/${MEMORY}`);
    });

    /**
     * **Amended by EGC.1.** This used to assert that a context rendered as plain
     * text because it had no route, which was true and is no longer: EGC.1 gave
     * organizations and contexts detail pages, so the honest answer moved with
     * the fact. What the test is *for* has not moved — an `entity_type` with no
     * route must still degrade rather than have a URL guessed for it — so the
     * unrouted case is now carried by a type no route exists for at all.
     */
    it("links only the entity types that have a route, and never invents one", () => {
      const view = toEntryOutcomeView(
        build({
          entities: [
            { entity_id: PERSON, entity_type: "person", mention: "Marina", name: "Marina" },
            { entity_id: PROJECT, entity_type: "project", mention: "Atlas", name: "Atlas" },
            { entity_id: CONTEXT, entity_type: "context", mention: "trabalho", name: "Trabalho" },
            { entity_id: ORGANIZATION, entity_type: "organization", mention: "Acme", name: "Acme" },
            { entity_id: PERSON, entity_type: "widget", mention: "algo", name: "Algo" },
          ],
        }),
      );

      expect(view.groups[0]!.items.map((item) => item.href)).toEqual([
        `/pt-BR/app/people/${PERSON}`,
        `/pt-BR/app/projects/${PROJECT}`,
        `/pt-BR/app/contexts/${CONTEXT}`,
        `/pt-BR/app/organizations/${ORGANIZATION}`,
        null,
      ]);
    });

    /**
     * G4 caught itself linking a deleted history subject to a 404. The same
     * shape exists here: `entry_entities` keeps the link after the entity row
     * is gone, so a name that could not be loaded must not become a link.
     */
    it("falls back to the mention and drops the link when the entity no longer exists", () => {
      const view = toEntryOutcomeView(
        build({ entities: [{ entity_id: PERSON, entity_type: "person", mention: "a Marina", name: null }] }),
      );

      const item = view.groups[0]!.items[0]!;
      expect(item.title).toBe("a Marina");
      expect(item.href).toBeNull();
    });
  });

  describe("vocabulary", () => {
    it("localizes a task's state and never renders the stored value", () => {
      const pt = toEntryOutcomeView(
        build({ tasks: [{ id: TASK, title: "Tarefa", status: "in_progress", due_at: null }] }),
      );
      const en = toEntryOutcomeView(
        build({ locale: "en", tasks: [{ id: TASK, title: "Tarefa", status: "in_progress", due_at: null }] }),
      );

      expect(pt.groups[0]!.items[0]!.detail).toBe("Em andamento");
      expect(en.groups[0]!.items[0]!.detail).toBe("In progress");
    });

    it("localizes a memory's kind and an entity's type", () => {
      const view = toEntryOutcomeView(
        build({
          locale: "en",
          memories: [{ id: MEMORY, content: "Prefere áudio", kind: "recurring_info" }],
          entities: [{ entity_id: PROJECT, entity_type: "project", mention: "Atlas", name: "Atlas" }],
        }),
      );

      expect(view.groups[0]!.items[0]!.detail).toBe("Recurring information");
      expect(view.groups[1]!.items[0]!.detail).toBe("Project");
    });

    it("shows a sentence, not the byte, when a stored value is outside its constraint", () => {
      const view = toEntryOutcomeView(
        build({ tasks: [{ id: TASK, title: "Tarefa", status: "abandoned", due_at: null }] }),
      );

      expect(view.groups[0]!.items[0]!.detail).toBe("Situação desconhecida");
    });

    it("localizes every reminder state the lifecycle allows", () => {
      const states = ["scheduled", "sent", "cancelled", "snoozed"];
      const view = toEntryOutcomeView(
        build({
          locale: "en",
          reminders: states.map((status, index) => ({
            id: `${REMINDER}-${index}`,
            title: `Lembrete ${index}`,
            status,
            remind_at: "2026-08-01T12:00:00Z",
          })),
        }),
      );

      const details = view.groups[0]!.items.map((item) => item.detail?.split(" · ")[0]);
      expect(details).toEqual(["Scheduled", "Delivered", "Cancelled", "Snoozed"]);
    });
  });

  describe("instants", () => {
    it("renders a due date in the owner's own zone, beside the state", () => {
      const view = toEntryOutcomeView(
        build({
          timezone: "America/Sao_Paulo",
          tasks: [{ id: TASK, title: "Tarefa", status: "todo", due_at: "2026-08-01T02:00:00Z" }],
        }),
      );

      // 02:00 UTC is 23:00 on 31 July in São Paulo — the date itself differs, so
      // formatting in UTC would show the owner the wrong day.
      expect(view.groups[0]!.items[0]!.detail).toContain("31");
      expect(view.groups[0]!.items[0]!.detail).toContain("A fazer");
    });

    it("carries the state alone when there is no date", () => {
      const view = toEntryOutcomeView(
        build({ tasks: [{ id: TASK, title: "Tarefa", status: "todo", due_at: null }] }),
      );

      expect(view.groups[0]!.items[0]!.detail).toBe("A fazer");
    });

    /**
     * A stored instant that `Intl` refuses is a data fault, and the page must
     * still render — the same rule `reminder-list.tsx` learned in G5, where a
     * timestamp with fractional seconds took the whole page down.
     */
    it("survives an instant that cannot be formatted", () => {
      const view = toEntryOutcomeView(
        build({ tasks: [{ id: TASK, title: "Tarefa", status: "todo", due_at: "not-an-instant" }] }),
      );

      expect(view.groups[0]!.items[0]!.detail).toBe("A fazer");
    });
  });

  it("gives every item a key unique across families", () => {
    const shared = "77777777-7777-4777-8777-777777777777";
    const view = toEntryOutcomeView(
      build({
        tasks: [{ id: shared, title: "Tarefa", status: "todo", due_at: null }],
        memories: [{ id: shared, content: "Memória", kind: "fact" }],
      }),
    );

    const keys = view.groups.flatMap((group) => group.items.map((item) => item.key));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
