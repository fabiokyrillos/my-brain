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
import type { MemoryProposal } from "./memory-proposal";

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
 * - `memory_intent` — recognised as a request to remember. Carries a **proposal**
 *   and writes nothing by itself; only the owner's explicit confirmation on that
 *   proposal persists anything (DEC-5).
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
  /**
   * `capture_intent` — recognised as a request to file the owner's own words
   * as an entry, and **the one composer route that writes on the turn that
   * recognises it** (2G-CAPTURE-001). It is the capture page's posture reached
   * by sentence rather than by navigation: the text is the owner's, so there
   * is nothing to confirm about it, and the acknowledgment names the object it
   * became and links to it.
   *
   * `capture_ambiguous` — the sentence opened with a filing imperative *and*
   * named a task, so it asks which was meant instead of guessing
   * (2G-CAPTURE-002, study R6). Writes nothing.
   */
  "capture_intent",
  "capture_ambiguous",
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
 * `nextStep` is a link rather than an action on purpose: it navigates, and
 * nothing reachable through it writes. The memory route now carries its write
 * separately, in `proposal` — a distinct control with its own confirmation —
 * precisely so this stays a promise the notice can keep.
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
  /**
   * The memory offered for confirmation, on the `memory_intent` route only
   * (DEC-5).
   *
   * Non-null means **nothing has been written** and the owner is being asked.
   * It is deliberately not folded into `notice`: a notice is prose, and this is
   * a payload that a form posts back verbatim, so keeping them apart is what
   * stops a rendering change from silently altering what gets stored.
   *
   * `null` on a `memory_intent` turn is the case where the opener was the whole
   * utterance — there is nothing to propose, and the notice says so.
   */
  readonly proposal: MemoryProposal | null;
  /** What a polite live region announces once the turn resolves. */
  readonly announcement: string;
};

export const idleAssistantComposerState: AssistantComposerState = {
  route: "idle",
  command: idleTaskCommandState,
  notice: null,
  echo: null,
  proposal: null,
  announcement: "",
};
