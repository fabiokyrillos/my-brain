import { describe, expect, it } from "vitest";

import { noticeRow } from "@/test/notification-verb-fixtures";

import { noticedTaskIds, withoutNoticedTasks } from "./noticed-tasks";

const TASK_A = "11111111-1111-4111-8111-111111111111";
const TASK_B = "22222222-2222-4222-8222-222222222222";
const REMINDER = "33333333-3333-4333-8333-333333333333";

const tasks = [
  { taskId: TASK_A, title: "Cancelar o Claude Code" },
  { taskId: TASK_B, title: "Pagar o aluguel" },
  { taskId: "task-c", title: "Ligar para a Marina" },
];

function overdueNotice(taskId: string, subjectStatus: string | null = "todo") {
  return noticeRow({
    source: { id: `aaaaaaaa-0000-4000-8000-${taskId.slice(-12)}`, dedupe_key: `overdue:${taskId}:2026-11-17` },
    subjectStatus,
  });
}

describe("withoutNoticedTasks", () => {
  it("drops the task an overdue notice is about and keeps the rest in order", () => {
    expect(withoutNoticedTasks(tasks, [overdueNotice(TASK_A)]).map((task) => task.taskId)).toEqual([
      TASK_B,
      "task-c",
    ]);
  });

  it("treats a stale-task notice the same way", () => {
    const stale = noticeRow({
      source: { type: "task_stale", dedupe_key: `stale:${TASK_B}:2026-11-17` },
    });

    expect(withoutNoticedTasks(tasks, [stale]).map((task) => task.taskId)).toEqual([TASK_A, "task-c"]);
  });

  it("returns the same list when no notice is about a task", () => {
    expect(withoutNoticedTasks(tasks, [])).toBe(tasks);
  });

  it("does not hide a task because of a reminder notice, even one sharing its id", () => {
    // A reminder's id is a reminder's. If the two ever collided the task must
    // still be listed: the reminder row offers no verb that acts on the task.
    const reminder = noticeRow({
      source: { type: "reminder", dedupe_key: `reminder:${REMINDER}` },
      subjectStatus: "scheduled",
    });
    const collided = noticeRow({
      source: { type: "reminder", dedupe_key: `reminder:${TASK_A}` },
      subjectStatus: "scheduled",
    });

    expect(reminder.subject?.subjectType).toBe("reminder");
    expect(withoutNoticedTasks(tasks, [reminder, collided])).toHaveLength(tasks.length);
  });

  it("does not hide a task on the word of a notice whose subject did not resolve", () => {
    // `subjectStatus: null` is what the projection leaves when the parsed id
    // matched no task of this owner's. That row renders no task verb.
    const unresolved = overdueNotice(TASK_A, null);

    expect(unresolved.subject?.subjectId).toBe(TASK_A);
    expect(withoutNoticedTasks(tasks, [unresolved])).toHaveLength(tasks.length);
  });

  it("does not hide a task for a notice with no readable subject at all", () => {
    const unreadable = noticeRow({ source: { dedupe_key: null } });
    const foreign = noticeRow({ source: { type: "reminder_due", dedupe_key: `overdue:${TASK_A}:2026-11-17` } });

    expect(unreadable.subject).toBeNull();
    expect(foreign.subject).toBeNull();
    expect(withoutNoticedTasks(tasks, [unreadable, foreign])).toHaveLength(tasks.length);
  });

  it("only knows the notices it is given — one that is not on the page hides nothing", () => {
    const rendered = [overdueNotice(TASK_A)];
    // TASK_B has a notice too, but it is past the bound Hoje renders.
    expect(withoutNoticedTasks(tasks, rendered).map((task) => task.taskId)).toContain(TASK_B);
  });
});

describe("noticedTaskIds", () => {
  it("collects each task once, however many notices name it", () => {
    const ids = noticedTaskIds([
      overdueNotice(TASK_A),
      noticeRow({ source: { type: "task_stale", dedupe_key: `stale:${TASK_A}:2026-11-16` } }),
      overdueNotice(TASK_B),
    ]);

    expect([...ids].sort()).toEqual([TASK_A, TASK_B]);
  });
});
