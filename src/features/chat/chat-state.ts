/**
 * What `sendChatMessage` returns when it does not redirect.
 *
 * This type used to live in `chat-form.tsx`, the client component that rendered
 * it. Slice E's unified composer replaced that component — one composer now
 * owns every text entry on the chat routes — and the type outlived it, because
 * `sendChatMessage` still returns this shape to whoever calls it.
 *
 * Kept as its own module rather than moved into `actions.ts`, which is
 * `"use server"` and may therefore export only async functions.
 *
 * `idle` never actually reaches a caller: a successful answer finishes by
 * redirecting into the thread. It is the seed value the action is invoked with.
 */
import type { ChatFailureClass } from "./diagnostics";

export type ChatState = {
  status: "idle" | "error";
  message: string;
  /**
   * `2P-CHAT-002` — which of the five classes this was, as a value.
   *
   * The message already says the right sentence, so this is not what renders.
   * It exists because a caller that wants to behave differently per class —
   * offer a route to Settings, offer a retry, offer neither — must not have to
   * re-derive the class by matching on prose. `null` on refusals decided before
   * the diagnostic path (an empty question, an expired session), which are not
   * failures of the conversation.
   */
  failure?: ChatFailureClass | null;
  /**
   * `2P-CHAT-003` — the correlation id of the `error_events` row this failure
   * wrote, so the owner can report a failure that is actually findable.
   *
   * Null when nothing was recorded, which is only the pre-diagnostic refusals
   * above. It is never a session, cookie or token value (`T-2H-09`): the sink
   * mints a fresh UUID.
   */
  reference?: string | null;
};
