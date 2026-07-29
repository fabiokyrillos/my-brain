/**
 * The data-access half of Phase 2E's destructive confirmation: it calls
 * `public.issue_task_command_confirmation` (migration `202607260059`) and
 * validates what comes back.
 *
 * PRD 2E-DESTRUCTIVE-002: "Confirmation uses a server-issued, single-use token
 * bound to one preview fingerprint, owner and operation key; a client-derivable
 * value is not confirmation evidence."
 *
 * **This module holds no evidence and proves nothing.** It sends the same seven
 * values `applyTaskCommand` sends and reads back an identifier. The binding is
 * derived inside the RPC from those seven values through
 * `public.task_command_fingerprint`, and the confirmation is resolved and
 * consumed inside `public.apply_task_command` by `(auth.uid(), operation key)` —
 * so nothing this process returns is presented back as authorization, and a
 * caller that skipped this call entirely is refused by the database with
 * `2E_CONFIRMATION_REQUIRED` rather than by anything here.
 *
 * That is why the returned id is reported and not required: a surface shows the
 * user that confirmation was recorded, and the apply looks it up itself. There
 * is deliberately no way to pass a token to `applyTaskCommand`, because a token
 * a caller can name is a token a caller can guess at.
 *
 * Injected client and no `import "server-only"`, for the reason `apply.ts:5-12`
 * records: every branch of this module is exercisable by Vitest without a
 * database and without a network.
 */

import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";

import {
  TaskCommandApplyError,
  buildApplyPayload,
  mapTaskCommandApplyError,
  type TaskCommandApplyFailed,
  type TaskCommandApplyInput,
} from "./apply";
import { actionPolicy, type TaskCommandAction } from "./taxonomy";

type IssueArgs = Database["public"]["Functions"]["issue_task_command_confirmation"]["Args"];

export type TaskCommandConfirmationClient = {
  rpc(
    fn: "issue_task_command_confirmation",
    args: IssueArgs,
  ): PromiseLike<{
    data: unknown;
    error: { message: string; code?: string; details?: string } | null;
  }>;
};

/** A confirmation exists for this exact request, and has or has not been spent. */
export type TaskCommandConfirmationIssued = {
  readonly outcome: "issued";
  readonly confirmationId: string;
  readonly taskId: string;
  readonly action: TaskCommandAction;
  readonly requestFingerprint: string;
  /**
   * Whether the confirmation has already authorized an apply.
   *
   * Reported rather than hidden. A `consumed` row reached through a re-issuance
   * means the apply this confirmation was minted for already succeeded, and the
   * honest thing for a surface to do is say so instead of offering a Confirm
   * control that will resolve to a replayed outcome.
   */
  readonly consumed: boolean;
  /** True when this call did not mint the row — the key was already reserved. */
  readonly replayed: boolean;
};

export type TaskCommandConfirmationResult =
  | TaskCommandConfirmationIssued
  | TaskCommandApplyFailed;

const issuedSchema = z
  .object({
    confirmation_id: z.string().uuid(),
    task_id: z.string().uuid(),
    action: z.literal("cancel_task"),
    request_fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    status: z.enum(["issued", "consumed"]),
    replayed: z.boolean(),
  })
  .strict();

/**
 * Issues confirmation for a destructive command.
 *
 * Takes the same input `applyTaskCommand` takes, and reuses `buildApplyPayload`
 * to derive the arguments — not for brevity, but because the two calls **must**
 * send byte-identical values or the digest the RPC stores is not the digest the
 * apply derives, and the gate refuses a request the user genuinely confirmed.
 * Building the payload twice from one function is what makes that
 * unrepresentable; two payload builders is exactly the divergence
 * `normalizeTaskCommandOperationKey` (`apply.ts:97-122`) exists to prevent one
 * layer down.
 *
 * Refuses locally, before any call, when the action does not require
 * confirmation. That is not a second opinion on the taxonomy — the RPC refuses
 * it too — but issuing confirmation for an action that needs none would leave a
 * row nothing can ever consume, and a caller doing it has a bug worth naming.
 */
export async function issueTaskCommandConfirmation(
  client: TaskCommandConfirmationClient,
  input: TaskCommandApplyInput,
): Promise<TaskCommandConfirmationResult> {
  const { action } = input.source;
  if (!actionPolicy(action).requiresConfirmation) {
    throw new TaskCommandApplyError(
      `${action} does not require confirmation, so issuing one would strand a row no apply can consume`,
      "confirmation_not_required",
    );
  }

  const payload = buildApplyPayload(input);
  const result = await client.rpc("issue_task_command_confirmation", payload);
  // Error preferred over data when both arrive, exactly as `apply.ts:441-445`
  // prefers it, and mapped through the one failure vocabulary so a surface has a
  // single set of sentences for both calls.
  if (result.error) return mapTaskCommandApplyError(result.error);

  const parsed = issuedSchema.safeParse(result.data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const issuePath = (issue?.path ?? []).join(".");
    throw new TaskCommandApplyError(
      `issue_task_command_confirmation returned an unexpected result shape at ${issuePath || "<root>"}`,
      "invalid_result_shape",
    );
  }

  return {
    outcome: "issued",
    confirmationId: parsed.data.confirmation_id,
    taskId: parsed.data.task_id,
    action: parsed.data.action,
    requestFingerprint: parsed.data.request_fingerprint,
    consumed: parsed.data.status === "consumed",
    replayed: parsed.data.replayed,
  };
}
