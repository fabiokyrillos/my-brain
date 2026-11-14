import type { NotificationBulkScope } from "./bulk";

/**
 * Life Brain D.2 — what a bulk notice verb (or its undo) answered.
 *
 * Its own module because a `"use server"` file may export only async functions.
 */
export type NotificationBulkState = {
  readonly status: "idle" | "applied" | "nothing" | "undone" | "failed";
  readonly scope: NotificationBulkScope | null;
  readonly count: number;
  readonly message: string;
  /** Present only when an audit row exists to undo from. */
  readonly undo: { readonly auditId: string; readonly expiresAt: string } | null;
};

export const idleNotificationBulkState: NotificationBulkState = {
  status: "idle",
  scope: null,
  count: 0,
  message: "",
  undo: null,
};
