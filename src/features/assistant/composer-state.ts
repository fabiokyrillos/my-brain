/**
 * The unified composer's state contract.
 *
 * Separate from `actions.ts` for the reason `task-commands/console-state.ts`
 * states: a `"use server"` module may export only async functions, so the
 * vocabulary, the shape and the idle value live here and the client component
 * imports them without dragging the server graph behind it.
 *
 * The shape is **a wrapper, not a replacement**. `command` is the unchanged
 * `TaskCommandConsoleState`, so the console's existing renderer draws every
 * preview, disambiguation, confirmation dialog and undo affordance exactly as
 * it does on Work. A composer that re-modelled those would be a second place
 * the destructive-confirmation requirement is decided, which is precisely what
 * `command-console.tsx:3-21` warns against.
 */

import { idleTaskCommandState, type TaskCommandConsoleState } from "@/features/task-commands/console-state";

/**
 * Where the turn went, as a declared value.
 *
 * The point of this list is that routing is *classified*, never implied by a
 * `catch`. Each member names one destination, and a turn that reaches none of
 * them is `invalid` rather than quietly the last branch.
 *
 * - `idle` — nothing submitted yet.
 * - `command` — the task-command pipeline owns the turn. Covers every outcome
 *   it can produce: preview, disambiguation, confirmation, creation offer,
 *   clarification, undo, refusal, **and every unsupported reason except the one
 *   that means "this was not a command at all"**.
 * - `memory_intent` — recognised as a request to remember. Proposes; writes
 *   nothing (DEC-5).
 * - `knowledge_failed` — the knowledge answer was attempted and failed. A
 *   *successful* answer never appears here: it redirects into the thread, which
 *   is the pre-existing behaviour of `sendChatMessage`.
 * - `invalid` — the submission itself was malformed (empty, over-long, or an
 *   intent outside the closed list).
 */
export const ASSISTANT_ROUTES = [
  "idle",
  "command",
  "memory_intent",
  "knowledge_failed",
  "invalid",
] as const;

export type AssistantRoute = (typeof ASSISTANT_ROUTES)[number];

/**
 * The composer's own intents, on top of the console's eight.
 *
 * `ask` is the only one this slice adds: it is what the single text field
 * submits. Every other intent belongs to the command pipeline and is forwarded
 * to `runTaskCommand` untouched, which is how Apply, Confirm, Choose, Clarify,
 * Create, Undo and Restore keep working without a second implementation.
 */
export const ASSISTANT_COMPOSER_INTENTS = ["ask"] as const;

export type AssistantComposerIntent = (typeof ASSISTANT_COMPOSER_INTENTS)[number];

/**
 * What the composer says about a turn the command pipeline did not render.
 *
 * `nextStep` is a link rather than an action on purpose. The two routes that
 * use this — a proposed memory and a failed answer — must not write, and a
 * button that looked like it might would be the wrong promise.
 */
export type AssistantNotice = {
  readonly heading: string;
  readonly detail: string;
  readonly nextStep: { readonly href: string; readonly label: string } | null;
};

export type AssistantComposerState = {
  readonly route: AssistantRoute;
  /** The command pipeline's own state, idle when this turn was not a command. */
  readonly command: TaskCommandConsoleState;
  readonly notice: AssistantNotice | null;
  /**
   * What the user wrote, echoed back on the routes that do not otherwise show
   * it.
   *
   * The composer has to distinguish "what you wrote" from "what I understood",
   * and on a memory proposal the two are different sentences. The command
   * routes need no echo: the preview already renders the task and the deltas.
   */
  readonly echo: string | null;
  /** What a polite live region announces once the turn resolves. */
  readonly announcement: string;
};

export const idleAssistantComposerState: AssistantComposerState = {
  route: "idle",
  command: idleTaskCommandState,
  notice: null,
  echo: null,
  announcement: "",
};
