import { z } from "zod";

import { CHAT_FAILURE_CLASSES, type ChatFailureClass } from "./diagnostics";

/**
 * Life Brain ADR-194 — a turn that failed after its question was saved leaves
 * an assistant row, so the thread says what happened instead of waiting.
 *
 * Before this, the question row stayed the thread's last message: a reload
 * showed "pensando" for three minutes (ADR-173 Decision 1) and then "ficou sem
 * resposta", although the turn had already failed and its sentence existed.
 * `conversation_messages` has no status column, and adding one is a migration,
 * so the mark lives where each message's metadata already lives: the
 * `citations` jsonb. It holds the failure class and the `error_events`
 * correlation id — never a provider string, never a fragment of the answer
 * that was being written.
 *
 * The mark is not a citations envelope: `parseCitations` reads it as no
 * citations at all, so a failure draws no source block. It is excluded from the
 * history the model reads and from "has this conversation an earlier turn"
 * (`LB-B-008`), because a failure is not something the assistant said.
 */
export const FAILED_TURN_ENVELOPE_VERSION = "2026-11-17.1";

const failedTurnSchema = z
  .object({
    v: z.literal(FAILED_TURN_ENVELOPE_VERSION),
    turn: z.literal("failed"),
    failure: z.enum(CHAT_FAILURE_CLASSES).nullable(),
    reference: z.string().uuid().nullable(),
  })
  .strict();

export type FailedTurnEnvelope = z.infer<typeof failedTurnSchema>;

export function buildFailedTurnEnvelope(input: {
  readonly failure: ChatFailureClass | null | undefined;
  readonly reference: string | null | undefined;
}): FailedTurnEnvelope {
  return {
    v: FAILED_TURN_ENVELOPE_VERSION,
    turn: "failed",
    failure: input.failure ?? null,
    reference: input.reference ?? null,
  };
}

/** True only for this module's own mark. */
export function isFailedTurn(raw: unknown): boolean {
  return failedTurnSchema.safeParse(raw).success;
}
