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
export type ChatState = { status: "idle" | "error"; message: string };
