import "server-only";

/**
 * **The five authorities a notice's verbs dispatch to — named once, for every
 * surface.**
 *
 * `2S-TRUST-010` is the requirement this module exists to make checkable: *"A
 * census names every Server Action the new surface dispatches to, and each
 * already existed before this phase. A requirement that needs a new writer is a
 * stop condition that halts the phase."*
 *
 * Two surfaces each assembling their own bundle from the same five imports
 * would satisfy that census today and stop satisfying it the first time one of
 * them added a sixth destination. One bundle cannot diverge: a surface that
 * wanted a different writer would have to stop importing this constant, which
 * is what `phase-2s-verb-authority.test.ts` looks for.
 *
 * ## Every one of the five predates Phase 2S
 *
 * | verb | authority | shipped in |
 * |---|---|---|
 * | *Concluir* | `applyWorkItemAction` | the Work surface |
 * | *Reagendar* | `applyTaskDetailCommand` | the task detail surface |
 * | *Lida* · *Descartar* | `markNotification` | slice 2M.4b |
 * | *Silenciar* | `suppressNotificationSubject` | slice **2S.1**, and it is an adapter to that slice's RPC rather than a writer of its own |
 * | the undo | `undoWorkOperation` | the Work surfaces' own undo |
 *
 * `suppressNotificationSubject` is the one that needs saying out loud: it was
 * added by this phase's **first** slice, which is the slice that spent the one
 * migration. It is not a new authority created to make these controls possible —
 * it is the caller the RPC shipped without.
 */

import { markNotification } from "@/features/agent/actions";
import { applyWorkItemAction } from "@/features/operations/actions";
import { undoWorkOperation } from "@/features/task-commands/actions";
import { applyTaskDetailCommand } from "@/features/task-commands/detail-actions";

import { suppressNotificationSubject } from "./actions";
import type { NotificationVerbHandlers } from "./notification-row-actions";

export const NOTIFICATION_VERB_HANDLERS: NotificationVerbHandlers = {
  markAction: markNotification,
  suppressAction: suppressNotificationSubject,
  workAction: applyWorkItemAction,
  detailAction: applyTaskDetailCommand,
  undoAction: undoWorkOperation,
};
