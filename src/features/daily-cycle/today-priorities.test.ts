/**
 * `2J-HOJE-003` … `2J-HOJE-006` — the deterministic priority contract's tests.
 *
 * The assertions that matter most are the negative ones: that the list refuses
 * to pad, and that the same input always produces the same order. A ranking
 * that quietly fills three slots is the failure OD-2J-3 was written against.
 */

import { describe, expect, it } from "vitest";

import type { WorkItemView } from "./contracts";
import {
  MAX_TODAY_PRIORITIES,
  dueState,
  localDayBounds,
  selectTodayPriorities,
} from "./today-priorities";

const SAO_PAULO = "America/Sao_Paulo";
/** 2026-08-08 14:00 in São Paulo (UTC-3). */
const NOW = new Date("2026-08-08T17:00:00.000Z");

function task(overrides: Partial<WorkItemView> & { taskId: string }): WorkItemView {
  return {
    title: `Task ${overrides.taskId}`,
    intentionalNoDue: false,
    humanState: "not_started",
    origin: "manual",
    availableActions: [],
    projects: [],
    contexts: [],
    people: [],
    waitingOnPeople: [],
    ...overrides,
  } as WorkItemView;
}

describe("2J-HOJE-003: overdue is distinguishable from due today", () => {
  const bounds = localDayBounds(NOW, SAO_PAULO);

  it("separates the two states rather than collapsing them into 'has a date'", () => {
    expect(dueState("2026-08-07T12:00:00.000Z", bounds)).toBe("overdue");
    expect(dueState("2026-08-08T20:00:00.000Z", bounds)).toBe("due_today");
    expect(dueState("2026-08-09T12:00:00.000Z", bounds)).toBe("later");
    expect(dueState(undefined, bounds)).toBe("none");
  });

  it("uses the user's timezone, not the server's", () => {
    // 2026-08-09T01:00Z is still 2026-08-08 22:00 in Sao Paulo, so it is due
    // TODAY for this user even though UTC has already rolled over. Getting this
    // wrong makes the evening of every day look empty.
    expect(dueState("2026-08-09T01:00:00.000Z", bounds)).toBe("due_today");
    const tokyo = localDayBounds(NOW, "Asia/Tokyo");
    // The same instant in Tokyo is 2026-08-09 10:00 -- already tomorrow.
    expect(dueState("2026-08-09T01:00:00.000Z", tokyo)).toBe("due_today");
    expect(dueState("2026-08-08T02:00:00.000Z", tokyo)).toBe("overdue");
  });

  it("treats an unparseable date as no date rather than as overdue", () => {
    // Failing the other way would put a corrupt row at the top of every user's
    // day, permanently, with no way to clear it.
    expect(dueState("not-a-date", bounds)).toBe("none");
  });
});

describe("2J-HOJE-006: the list refuses to pad", () => {
  it("returns fewer than three when fewer than three qualify", () => {
    const result = selectTodayPriorities(
      [
        task({ taskId: "a", dueAt: "2026-08-07T12:00:00.000Z" }),
        task({ taskId: "b", dueAt: "2026-09-01T12:00:00.000Z" }),
        task({ taskId: "c" }),
      ],
      { now: NOW, timeZone: SAO_PAULO },
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.item.taskId).toBe("a");
  });

  it("returns nothing when nothing qualifies", () => {
    const result = selectTodayPriorities(
      [
        task({ taskId: "a", dueAt: "2026-09-01T12:00:00.000Z" }),
        task({ taskId: "b", priority: "low" }),
        task({ taskId: "c", priority: "medium" }),
      ],
      { now: NOW, timeZone: SAO_PAULO },
    );
    expect(result).toEqual([]);
  });

  it("never exceeds the ceiling however many qualify", () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      task({ taskId: `t${index}`, dueAt: "2026-08-07T12:00:00.000Z" }),
    );
    expect(selectTodayPriorities(many, { now: NOW, timeZone: SAO_PAULO })).toHaveLength(
      MAX_TODAY_PRIORITIES,
    );
  });
});

describe("2J-HOJE-004: qualification is by rule, and the order is explainable", () => {
  it("puts overdue first, then due today, then explicitly marked", () => {
    const result = selectTodayPriorities(
      [
        task({ taskId: "marked", priority: "urgent" }),
        task({ taskId: "today", dueAt: "2026-08-08T20:00:00.000Z" }),
        task({ taskId: "late", dueAt: "2026-08-01T12:00:00.000Z" }),
      ],
      { now: NOW, timeZone: SAO_PAULO },
    );
    expect(result.map((entry) => entry.item.taskId)).toEqual(["late", "today", "marked"]);
    expect(result.map((entry) => entry.reason)).toEqual(["overdue", "due_today", "marked_urgent"]);
  });

  it("admits only urgent and high as a standalone reason", () => {
    const result = selectTodayPriorities(
      [
        task({ taskId: "urgent", priority: "urgent" }),
        task({ taskId: "high", priority: "high" }),
        task({ taskId: "medium", priority: "medium" }),
        task({ taskId: "low", priority: "low" }),
      ],
      { now: NOW, timeZone: SAO_PAULO },
    );
    expect(result.map((entry) => entry.item.taskId)).toEqual(["urgent", "high"]);
  });

  it("prefers a due date over a manual flag when a task has both", () => {
    // The reason shown must be the strongest true one. A late task labelled
    // "marcada como urgente" would understate why it is there.
    const result = selectTodayPriorities(
      [task({ taskId: "both", dueAt: "2026-08-01T12:00:00.000Z", priority: "low" })],
      { now: NOW, timeZone: SAO_PAULO },
    );
    expect(result[0]?.reason).toBe("overdue");
  });
});

describe("deterministic means deterministic", () => {
  const items = [
    task({ taskId: "zzz", dueAt: "2026-08-01T12:00:00.000Z" }),
    task({ taskId: "aaa", dueAt: "2026-08-01T12:00:00.000Z" }),
    task({ taskId: "mmm", dueAt: "2026-08-01T12:00:00.000Z" }),
  ];

  it("breaks exact ties on the id, so row order cannot change the answer", () => {
    const forward = selectTodayPriorities(items, { now: NOW, timeZone: SAO_PAULO });
    const reversed = selectTodayPriorities([...items].reverse(), { now: NOW, timeZone: SAO_PAULO });
    expect(forward.map((entry) => entry.item.taskId)).toEqual(["aaa", "mmm", "zzz"]);
    expect(reversed.map((entry) => entry.item.taskId)).toEqual(forward.map((e) => e.item.taskId));
  });

  it("uses no clock of its own", async () => {
    // A module that read the time itself would render differently on two
    // requests one midnight apart, and would be untestable without faking
    // globals. `now` is a parameter for exactly that reason.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(__dirname, "today-priorities.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(source).not.toMatch(/Date\.now\(\)|new Date\(\s*\)/);
  });

  it("makes no model call and reads no priority store", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(__dirname, "today-priorities.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // OD-2J-3: no model, and no new persistence.
    expect(source).not.toMatch(/openai|AIProvider|embed|supabase|from\(["'`]/i);
  });
});
