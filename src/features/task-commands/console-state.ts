/**
 * The command console's state contract.
 *
 * Separate from `actions.ts` because a `"use server"` file may export **only**
 * async functions — Next.js refuses the build otherwise, since every export of
 * such a module becomes a callable server reference and a plain object cannot
 * be one. So the vocabulary, the state shape and the idle value live here, and
 * `actions.ts` holds nothing but the Server Actions themselves.
 *
 * It is also the module the client component imports, which keeps the console
 * from importing the action module for a type and dragging the server graph
 * behind it.
 */

import type { TaskCommandCreationPreview } from "./creation";
import type { TaskDisambiguationView } from "./disambiguation";
import type { TaskCommandPreview } from "./preview";
import type { TaskCommandUnsupportedReason } from "./taxonomy";

/**
 * Which control the surface should render.
 *
 * Decided on the server rather than inferred in the component.
 * `ENGINEERING_STANDARDS` keeps domain rules out of React, and "may this be
 * applied in one step" is a domain rule with a destructive-action guarantee
 * behind it — a component that re-derived it from `preview.disposition` would
 * be a second place the confirmation requirement is decided.
 */
export const TASK_COMMAND_CONTROLS = [
  "none",
  "apply",
  "confirm",
  "create",
  "choose",
  "clarify",
] as const;

export type TaskCommandControl = (typeof TASK_COMMAND_CONTROLS)[number];

/**
 * The console's declared intents.
 *
 * Validated against this closed list by the dispatcher, so an unknown value is
 * refused rather than falling through to whichever branch happened to be last.
 */
export const TASK_COMMAND_INTENTS = [
  "start",
  "select",
  "apply",
  "confirm",
  "clarify",
  "create",
  "undo",
  "restore",
  /**
   * `2K-ACT-003/004` — correct one parameter and see the command again.
   *
   * It lives here rather than in a new module because `2K-CARD-005` forbids a
   * second implementation of the preview pipeline: an edit is one validated
   * value written into the envelope and handed back to `deriveTaskCommand`,
   * which is exactly the shape `clarify` already has. Which parameters an
   * action admits is **not** decided here — `conversation-cards/
   * editable-parameters.ts` narrows the taxonomy's own `allowedPatchFields`,
   * and this intent asks it.
   */
  "edit",
  /**
   * `2K-ACT-002` — walk away, leaving nothing behind.
   *
   * Distinct from an expired session, which is a fact the server reports. This
   * is the user's own decision, and it must write nothing and record no
   * intent — which is why its handler takes no Supabase client at all.
   */
  "discard",
] as const;

export type TaskCommandIntent = (typeof TASK_COMMAND_INTENTS)[number];

export type TaskCommandUndoAffordance = {
  readonly undoId: string;
  readonly label: string;
};

export type TaskCommandConsoleState = {
  readonly status: "idle" | "resolved";
  /** What a polite live region announces (2E-A11Y-003). */
  readonly announcement: string;
  readonly heading: string;
  readonly detail: string;
  /** The reason sentence under the heading, when the outcome has one. */
  readonly reason: string | null;
  /** The envelope for the next step, or null when the command came to rest. */
  readonly session: string | null;
  readonly disambiguation: TaskDisambiguationView | null;
  readonly preview: TaskCommandPreview | null;
  readonly creation: TaskCommandCreationPreview | null;
  readonly undo: TaskCommandUndoAffordance | null;
  readonly control: TaskCommandControl;
  /**
   * Whether resubmitting can succeed (2E-UX-002).
   *
   * Read from `TASK_COMMAND_FAILURE_POLICY[failure].retryable`, never from the
   * outcome: `undeclared_failure` is `refused` *and* retryable, and keying off
   * the outcome would render a lost response as a dead end.
   */
  readonly retryable: boolean;
  /** True when nothing further can be done with this command. */
  readonly terminal: boolean;
  /**
   * Why the command was refused as unsupported, as a value rather than as prose.
   *
   * `reason` above is already localized — `copy.unsupportedReasons[…]` — so a
   * caller that needed to branch on *which* refusal this is would be matching
   * translated sentences. The unified composer needs exactly that branch: it
   * falls through to the knowledge answer on `not_a_task_command` and on
   * nothing else, so the condition has to come from the closed vocabulary the
   * model answered with.
   *
   * `null` on every other state, including the two failure kinds that sit next
   * to this one in `startTaskCommand` — a provider fault and invalid model
   * output are *not* refusals and must never be read as one.
   */
  readonly unsupportedReason: TaskCommandUnsupportedReason | null;
};

export const idleTaskCommandState: TaskCommandConsoleState = {
  status: "idle",
  announcement: "",
  heading: "",
  detail: "",
  reason: null,
  session: null,
  disambiguation: null,
  preview: null,
  creation: null,
  undo: null,
  control: "none",
  retryable: false,
  terminal: false,
  unsupportedReason: null,
};
