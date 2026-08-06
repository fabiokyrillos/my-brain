/**
 * Where one composer turn goes, decided as data.
 *
 * Pure and synchronous — no clock, no I/O, no Supabase, no provider. The two
 * decisions this module owns are the whole of DEC-3's routing, and both are
 * expressed as *classifications* rather than as control flow in a Server
 * Action, so each can be tested against the taxonomy directly.
 *
 * The invariant worth stating once: **a broad `catch` is never intent routing.**
 * The command pipeline reports its own outcome as a declared value, and only one
 * of those values means "this was not a command at all". Everything else — a
 * refusal, a preview waiting for confirmation, a provider fault, invalid model
 * output — stays with the pipeline and stays visible as itself.
 */

import type { TaskCommandConsoleState } from "@/features/task-commands/console-state";
// The provider-side bound, imported from the module that declares it rather
// than restated. `task-command-schema.ts` is deliberately not `server-only`
// (see its header) precisely so callers outside the provider can share it.
import { MAX_COMMAND_TEXT_LENGTH } from "@/lib/ai/task-command-schema";

import { classifyCaptureIntent } from "./capture-intent";
import { looksLikeMemoryIntent } from "./memory-intent";

export type AssistantDecision =
  | { readonly kind: "memory_intent" }
  | { readonly kind: "capture_intent" }
  | { readonly kind: "capture_ambiguous" }
  | { readonly kind: "knowledge"; readonly reason: "too_long_for_command" }
  | { readonly kind: "command_first" };

/**
 * The pre-provider decision: what can be settled before spending a model call.
 *
 * Order matters and is deliberate. The memory branch is first because it is
 * free and because DEC-5's guarantee is easiest to keep when the branch that
 * writes nothing is reached before anything else runs. The length skip is
 * second because it is contractual rather than heuristic: the provider refuses
 * anything past `MAX_COMMAND_TEXT_LENGTH` with `command_text_too_long` before
 * it is billed (`task-command-schema.ts:171`), so longer text cannot be a
 * command, and sending it would buy a refusal the cap already guaranteed.
 *
 * Everything else tries the command path first. That ordering is not a
 * preference — it is the only safe one. The command path is read-only until the
 * user confirms, whereas the knowledge path persists a conversation, a message
 * and an audit row before it answers; running it first would leave that residue
 * behind every mistyped command.
 */
export function decideAssistantRoute(text: string): AssistantDecision {
  if (looksLikeMemoryIntent(text)) return { kind: "memory_intent" };
  // Capture is second, and its position is the decision worth defending: it is
  // the only branch here that writes on the turn that selects it, so it must
  // sit behind the free branch and ahead of the billed one. Ahead of the
  // command parse, because an explicit "registre que…" is not a task command
  // and sending it to the model would buy a refusal this rule already knows;
  // behind memory, because "lembre disso" is the narrower instruction and its
  // branch persists nothing.
  //
  // The ambiguous verdict is deliberately *not* folded into `command_first`.
  // Falling through would let the model classify the sentence as a creation,
  // which is precisely the silent object substitution 2G-CAPTURE-002 exists to
  // prevent — the user asked for two things and the honest answer is to ask.
  const capture = classifyCaptureIntent(text);
  if (capture === "capture") return { kind: "capture_intent" };
  if (capture === "ambiguous") return { kind: "capture_ambiguous" };
  if (text.length > MAX_COMMAND_TEXT_LENGTH) {
    return { kind: "knowledge", reason: "too_long_for_command" };
  }
  return { kind: "command_first" };
}

/**
 * The post-provider decision: may this turn continue to the knowledge answer?
 *
 * Exactly one condition, and it is a value from the model's own closed
 * vocabulary. Written as an equality rather than as a set membership so that
 * adding a reason to `TASK_COMMAND_UNSUPPORTED_REASONS` later keeps the command
 * pipeline's outcome by default — the failure mode of a new reason must be
 * "shown as unsupported", never "silently answered as a question".
 *
 * Note what is *not* here. `retryable`, `terminal` and `control` are ignored on
 * purpose: a provider fault and invalid model output both carry
 * `unsupportedReason: null`, so neither can reach the knowledge branch, and a
 * preview waiting on Apply or Confirm cannot either.
 */
export function commandTurnFallsThrough(state: TaskCommandConsoleState): boolean {
  return state.unsupportedReason === "not_a_task_command";
}
