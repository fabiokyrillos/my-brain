import { describe, expect, it } from "vitest";

import { boundedList, CONTEXTUAL_LIMIT } from "@/features/bounds/contracts";
import { getHistoryCopy } from "@/features/history/copy";

import {
  DECISION_CONCEPT,
  decisionEntryIds,
  deriveProjectState,
  describeProjectChanges,
  TERMINAL_TASK_STATUSES,
  type ProjectChangeRow,
} from "./project-context";

const copy = getHistoryCopy("pt-BR", "Cérebro");
const formatDate = (iso: string) => `«${iso}»`;

function task(status: string) {
  return { id: status, status };
}

function changeRow(overrides: Partial<ProjectChangeRow> = {}): ProjectChangeRow {
  return {
    id: "row-1",
    action_type: "update_project",
    entity_type: "project",
    entity_id: "project-1",
    actor: "user",
    before_state: null,
    after_state: null,
    created_at: "2026-08-13T12:00:00+00:00",
    ...overrides,
  };
}

describe("2N-PROJECT-003: current state is counted, never estimated", () => {
  it("counts every task that is neither completed nor cancelled", () => {
    const tasks = boundedList(
      [task("inbox"), task("todo"), task("in_progress"), task("waiting"), task("blocked"), task("deferred"), task("completed"), task("cancelled")],
      CONTEXTUAL_LIMIT,
    );
    const state = deriveProjectState({ tasks, entries: boundedList([], CONTEXTUAL_LIMIT) });

    expect(state.openTasks).toBe(6);
    expect(state.openTasksAtLeast).toBe(false);
  });

  it("uses only statuses the task vocabulary already contains", () => {
    // The negative control for "no new status vocabulary is invented": the set
    // this module closes over must be a subset of the stored `check` literals,
    // not two words chosen here.
    for (const status of TERMINAL_TASK_STATUSES) {
      expect(["completed", "cancelled"]).toContain(status);
    }
    expect(TERMINAL_TASK_STATUSES).toHaveLength(2);
  });

  it("reports the count as a floor when the list hit its bound", () => {
    /*
     * The failure this prevents: 140 linked tasks, 100 read, 3 of those open —
     * printing "3 open" states a total nobody counted. The dropped 40 may hold
     * more, so the only true sentence is "at least 3".
     */
    const rows = Array.from({ length: 4 }, () => task("todo"));
    const tasks = boundedList(rows, 3);

    const state = deriveProjectState({ tasks, entries: boundedList([], 3) });
    expect(state.openTasks).toBe(3);
    expect(state.openTasksAtLeast).toBe(true);
  });

  it("carries the upstream bound too, not just its own overflow", () => {
    // The link table can be the half that truncated: 101 `task_projects` rows
    // whose tasks all resolve leaves this list short of its own limit while more
    // genuinely exist.
    const tasks = boundedList([task("todo")], CONTEXTUAL_LIMIT, true);
    const state = deriveProjectState({ tasks, entries: boundedList([], CONTEXTUAL_LIMIT) });

    expect(state.openTasks).toBe(1);
    expect(state.openTasksAtLeast).toBe(true);
  });

  it("takes the newest entry by instant rather than by position", () => {
    const entries = boundedList(
      [
        { occurred_at: "2026-08-01T10:00:00+00:00" },
        { occurred_at: "2026-08-09T10:00:00+00:00" },
        { occurred_at: "2026-08-05T10:00:00+00:00" },
      ],
      CONTEXTUAL_LIMIT,
    );

    const state = deriveProjectState({ tasks: boundedList([], CONTEXTUAL_LIMIT), entries });
    expect(state.lastEntryAt).toBe("2026-08-09T10:00:00+00:00");
  });

  it("has no last entry when nothing is linked", () => {
    const state = deriveProjectState({
      tasks: boundedList([], CONTEXTUAL_LIMIT),
      entries: boundedList([], CONTEXTUAL_LIMIT),
    });
    expect(state.lastEntryAt).toBeNull();
    expect(state.openTasks).toBe(0);
    expect(state.openTasksAtLeast).toBe(false);
  });
});

describe("2N-PROJECT-004: changes are described from the audit trail, newest first", () => {
  it("orders by when it happened, not by the order the two queries returned", () => {
    const events = describeProjectChanges(
      [
        changeRow({ id: "old", created_at: "2026-08-01T10:00:00+00:00" }),
        changeRow({ id: "new", created_at: "2026-08-12T10:00:00+00:00" }),
        changeRow({ id: "middle", created_at: "2026-08-06T10:00:00+00:00" }),
      ],
      copy,
      formatDate,
    );

    expect(events.map((event) => event.id)).toEqual(["new", "middle", "old"]);
  });

  it("does not mutate the array it was given", () => {
    const rows = [
      changeRow({ id: "old", created_at: "2026-08-01T10:00:00+00:00" }),
      changeRow({ id: "new", created_at: "2026-08-12T10:00:00+00:00" }),
    ];
    describeProjectChanges(rows, copy, formatDate);
    expect(rows.map((row) => row.id)).toEqual(["old", "new"]);
  });

  it("names the project once, in the heading, and not in every sentence", () => {
    const [event] = describeProjectChanges([changeRow()], copy, formatDate);
    expect(event!.sentence).toBe("Você alterou o projeto");
    expect(event!.sentence).not.toContain("“");
  });

  it("still calls the subject resolved, because the page just loaded it", () => {
    // `label: null` chooses the phrasing; it must not be mistaken for
    // `found: false`, which would print "unavailable" beside a project the
    // reader is currently looking at.
    const [event] = describeProjectChanges([changeRow()], copy, formatDate);
    expect(event!.subject).toBe("resolved");
  });

  it("describes what actually changed when the payloads say so", () => {
    const [event] = describeProjectChanges(
      [
        changeRow({
          before_state: { name: "Mudança", description: "antes", status: "active", organization_id: null },
          after_state: { name: "Mudança", description: "antes", status: "paused", organization_id: null },
        }),
      ],
      copy,
      formatDate,
    );

    expect(event!.sentence).toBe("Você alterou a situação de Ativo para Pausado");
  });

  it("renders an association change without leaking what the role said", () => {
    /*
     * `associations.ts` records `has_role` rather than the role text on purpose
     * (EGC-ASSOC-004). This asserts the consequence at the surface: the sentence
     * says a role changed and nothing the owner typed reaches the list.
     */
    const [event] = describeProjectChanges(
      [
        changeRow({
          action_type: "update_person_project_role",
          entity_type: "person_project",
          entity_id: "link-1",
          before_state: { has_role: false },
          after_state: { has_role: true },
        }),
      ],
      copy,
      formatDate,
    );

    expect(event!.sentence).toBe("Você alterou o papel de uma pessoa em um projeto");
    expect(event!.changes).toEqual([]);
    expect(event!.subject).toBe("no-route");
  });

  it("falls back to a neutral sentence for an action type it does not know", () => {
    // A raw token would leak an internal name; dropping the row would hide a
    // real change from an audit trail. The describer already answers this, and
    // this asserts the project surface inherits that answer.
    const [event] = describeProjectChanges(
      [changeRow({ action_type: "some_future_action" })],
      copy,
      formatDate,
    );

    expect(event!.sentence).toBe("Você registrou uma alteração");
    expect(event!.sentence).not.toContain("some_future_action");
    expect(event!.actionType).toBeNull();
  });
});

describe("2N-PROJECT-005: a decision is a stored concept, never a phrase", () => {
  it("selects the entries whose current interpretation recorded one", () => {
    const ids = decisionEntryIds([
      { entry_id: "entry-1", concepts: ["raw_record", DECISION_CONCEPT] },
      { entry_id: "entry-2", concepts: ["raw_record"] },
      { entry_id: "entry-3", concepts: [DECISION_CONCEPT] },
    ]);

    expect([...ids].sort()).toEqual(["entry-1", "entry-3"]);
  });

  it("treats a blocker as a blocker, not as a risk in disguise", () => {
    /*
     * The mutation control for the `not-built-by-rule` classification of the
     * risk half. There is no risk concept; the nearest members are these three,
     * and if any of them were quietly mapped onto "decision" — or onto a risk —
     * this would fail.
     */
    const ids = decisionEntryIds([
      { entry_id: "blocked", concepts: ["blocker"] },
      { entry_id: "waiting", concepts: ["waiting_for_third_party"] },
      { entry_id: "depends", concepts: ["dependency"] },
    ]);

    expect(ids.size).toBe(0);
  });

  it("returns nothing for absent, null or malformed concepts", () => {
    const ids = decisionEntryIds([
      { entry_id: "a", concepts: null },
      { entry_id: "b", concepts: [] },
      { entry_id: null, concepts: [DECISION_CONCEPT] },
      { entry_id: "d", concepts: "decision" as unknown as readonly string[] },
    ]);

    expect(ids.size).toBe(0);
  });

  it("handles a missing result set without throwing", () => {
    expect(decisionEntryIds(null).size).toBe(0);
    expect(decisionEntryIds(undefined).size).toBe(0);
  });

  it("matches the whole concept and not a substring of one", () => {
    // "decision" must not be found inside a longer member a later vocabulary
    // might add — `includes` on the array, never on a joined string.
    const ids = decisionEntryIds([{ entry_id: "e", concepts: ["decision_pending"] }]);
    expect(ids.size).toBe(0);
  });
});
