/**
 * `2O-RECOVER-004` — the product's own lifecycle, expressed in the universal
 * state vocabulary.
 *
 * ## Why this mapping is a module and not an inline ternary
 *
 * `2O-RECOVER-004` says *"`interpreting` is never rendered as `loading`,
 * because the user's words are already durable and a spinner would say
 * otherwise."* That is a claim about **every** surface that renders an entry
 * mid-flight, and a claim of that shape cannot be held by each surface
 * remembering it. Written once, it can be asserted once — and
 * `universal-state-projection.test.ts` proves the two states never collapse by
 * checking the whole `ProductState` domain rather than the cases somebody
 * happened to think of.
 *
 * ## Two product states are deliberately not universal states
 *
 * `needs_attention` and `ready` describe what the *record* is, not what the
 * *surface is doing*. A record that needs attention is fully loaded, fully
 * interpreted and waiting on a person; rendering it as a universal state would
 * say the page is still working when the page is finished and the reader is
 * the one who is not. They map to `null`, and the surface renders its own
 * domain content — which is the honest answer and the reason this returns a
 * nullable rather than reaching for a seventh state that would have to be
 * invented.
 *
 * ## `saved` is `interpreting`, and that is the whole point of the requirement
 *
 * Since Phase 2X `captureEntry` persists the user's words and returns **before**
 * the AI has run, so `saved` means *durable, not yet read*. The natural reflex
 * is to render that as `loading`; `loading` carries no safety line, and the one
 * sentence this state owes the reader is that nothing is at risk.
 */

import type { ProductState } from "./contracts";
import type { UniversalState } from "@/features/experience/state-vocabulary";

/**
 * The universal state a product state presents as, or `null` when the record's
 * state is a fact about the record rather than about the surface.
 */
export function universalStateForProductState(state: ProductState): UniversalState | null {
  switch (state) {
    // Durable, and the AI has not read it yet. NOT `loading`.
    case "saved":
      return "interpreting";
    // Being read right now. NOT `loading`.
    case "organizing":
      return "interpreting";
    // The interpretation failed; the entry did not. The vocabulary's
    // `interpretation_failed` is `contentIsSafe`, which is the difference
    // between this and a generic error.
    case "could_not_organize":
      return "interpretation_failed";
    // Facts about the record, not about the surface.
    case "needs_attention":
    case "ready":
      return null;
  }
}

/**
 * The product states that must never present as `loading`.
 *
 * Derived from the mapping rather than listed, so the guard cannot drift from
 * the implementation it guards.
 */
export const PRODUCT_STATES_THAT_ARE_NOT_LOADING: readonly ProductState[] = (
  ["saved", "organizing", "could_not_organize"] as const
).filter((state) => universalStateForProductState(state) !== null);
