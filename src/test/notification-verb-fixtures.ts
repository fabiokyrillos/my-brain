/**
 * Fixtures for the notice verbs, shared by every surface that mounts them.
 *
 * ## Why they are shared rather than copied
 *
 * `2S-ACT-011` says the two surfaces must offer the same verbs with the same
 * meanings. A test file that built its own row would be free to build one the
 * projection never produces — and then it would be asserting agreement between
 * a surface and a fiction. `noticeRow` runs the **real** `verbsForRow`, so a
 * fixture cannot claim a verb the authority would have refused.
 *
 * The handlers are spies rather than stubs of the real Server Actions: what the
 * surfaces are responsible for is *which* authority they reach and *what* they
 * send it. What each authority then does is that authority's own tested
 * behaviour, and re-asserting it here would be a second copy of it.
 */

import { vi } from "vitest";

import type { NotificationVerbHandlers } from "@/features/notifications/notification-row-actions";
import type { NotificationRowSource, NotificationRowView } from "@/features/notifications/row-projection";
import { deriveNotificationSubject } from "@/features/notifications/subject";
import { menuVerbsFor, primaryVerbFor, verbsForRow } from "@/features/notifications/verbs";

export type NoticeHandlerSpies = {
  readonly handlers: NotificationVerbHandlers;
  readonly markAction: ReturnType<typeof vi.fn>;
  readonly suppressAction: ReturnType<typeof vi.fn>;
  readonly workAction: ReturnType<typeof vi.fn>;
  readonly detailAction: ReturnType<typeof vi.fn>;
  readonly undoAction: ReturnType<typeof vi.fn>;
};

export function noticeHandlerSpies(): NoticeHandlerSpies {
  const markAction = vi.fn(async () => {});
  const suppressAction = vi.fn(async () => ({ ok: true as const, suppressionId: "s1", undo: null, replaced: false }));
  const workAction = vi.fn(async (state: unknown) => state);
  const detailAction = vi.fn(async (state: unknown) => state);
  const undoAction = vi.fn(async (state: unknown) => state);
  return {
    handlers: {
      markAction,
      suppressAction,
      workAction,
      detailAction,
      undoAction,
    } as unknown as NotificationVerbHandlers,
    markAction,
    suppressAction,
    workAction,
    detailAction,
    undoAction,
  };
}

const TASK_ID = "11111111-1111-4111-8111-111111111111";

export function noticeSource(overrides: Partial<NotificationRowSource> = {}): NotificationRowSource {
  return {
    id: "aaaaaaaa-1111-4111-8111-111111111111",
    type: "task_overdue",
    title: "Uma tarefa passou do prazo",
    body: "Pagar o aluguel",
    action_url: null,
    status: "unread",
    created_at: "2026-08-24T12:00:00.000Z",
    dedupe_key: `overdue:${TASK_ID}:2026-08-24`,
    ...overrides,
  };
}

/**
 * One projected row, with its verbs decided by the **real** authority.
 *
 * `subjectStatus` is the subject's own status — `null` means the subject could
 * not be resolved, which is the fail-closed case `2S-REACH-004` describes and
 * the one that must offer no task verb at all.
 */
export function noticeRow(options: {
  readonly source?: Partial<NotificationRowSource>;
  readonly subjectStatus?: string | null;
  readonly subjectLabel?: string;
} = {}): NotificationRowView {
  const notification = noticeSource(options.source);
  const subject = deriveNotificationSubject(notification);
  /*
    `todo` rather than an invented word. The first draft of this fixture said
    "pending", which is not a member of the task status vocabulary at all — so
    `isEligibleStatus` refused both task verbs and every default row silently
    exercised the unresolvable-subject branch. A fixture whose status the
    authority does not recognise is a fixture that tests the wrong thing.
  */
  const subjectStatus = options.subjectStatus === undefined ? "todo" : options.subjectStatus;
  const verbs = verbsForRow({
    subjectType: subjectStatus === null ? null : (subject?.subjectType ?? null),
    subjectStatus,
    noticeStatus: notification.status,
  });
  return {
    notification,
    subject,
    subjectStatus,
    subjectLabel: options.subjectLabel ?? notification.body,
    verbs,
    primaryVerb: primaryVerbFor(verbs),
    menuVerbs: menuVerbsFor(verbs),
  };
}
