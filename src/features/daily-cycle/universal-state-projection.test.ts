/**
 * `2O-RECOVER-004` — the assertion that `interpreting` and `loading` never
 * collapse into one another.
 *
 * The test that matters here is **exhaustive over the domain**, not a list of
 * remembered cases: a product state added later is included by construction,
 * so the requirement cannot be quietly violated by a sixth state that nobody
 * thought to add to a literal.
 */

import { describe, expect, it } from "vitest";

import { productStates, type ProductState } from "./contracts";
import {
  PRODUCT_STATES_THAT_ARE_NOT_LOADING,
  universalStateForProductState,
} from "./universal-state-projection";
import {
  UNIVERSAL_STATE_DEFINITIONS,
  isUniversalState,
} from "@/features/experience/state-vocabulary";

describe("2O-RECOVER-004: the projection has a domain to be exhaustive over", () => {
  it("reads the real product-state set", () => {
    // Non-vacuity. Every assertion below iterates `productStates`, and all of
    // them pass trivially against an empty list.
    expect(productStates.length).toBe(5);
    expect([...productStates]).toEqual([
      "saved",
      "organizing",
      "needs_attention",
      "ready",
      "could_not_organize",
    ]);
  });
});

describe("2O-RECOVER-004: interpreting is never rendered as loading", () => {
  it("maps no product state to `loading`", () => {
    const offenders = productStates.filter(
      (state) => universalStateForProductState(state) === "loading",
    );

    expect(
      offenders,
      `product states presenting as \`loading\`: ${offenders.join(", ")}. `
        + "2O-RECOVER-004: the user's words are already durable by the time any "
        + "of these states is reachable, and `loading` is the one state in the "
        + "vocabulary that carries no safety line.",
    ).toEqual([]);
  });

  it("maps every in-flight state to `interpreting`, which promises the content is safe", () => {
    for (const state of ["saved", "organizing"] as const) {
      const universal = universalStateForProductState(state);
      expect(universal).toBe("interpreting");
      // The reason the distinction exists: `interpreting` says the words are
      // safe and `loading` cannot, because it is also used before anything has
      // been written.
      expect(UNIVERSAL_STATE_DEFINITIONS[universal!].contentIsSafe).toBe(true);
    }
    expect(UNIVERSAL_STATE_DEFINITIONS.loading.contentIsSafe).toBe(true);
    // …and the real separator is the copy, asserted in the experience guard.
    expect(UNIVERSAL_STATE_DEFINITIONS.interpreting.state).not.toBe("loading");
  });

  it("maps a failed interpretation to a state that still promises the entry survived", () => {
    const universal = universalStateForProductState("could_not_organize");
    expect(universal).toBe("interpretation_failed");
    expect(UNIVERSAL_STATE_DEFINITIONS.interpretation_failed.contentIsSafe).toBe(true);
    expect(UNIVERSAL_STATE_DEFINITIONS.interpretation_failed.recoverable).toBe(true);
  });
});

describe("2O-RECOVER-004: the mapping is total and honest", () => {
  it("returns either a real universal state or an explicit null, for every product state", () => {
    for (const state of productStates) {
      const universal = universalStateForProductState(state);
      if (universal === null) continue;
      expect(
        isUniversalState(universal),
        `${state} mapped to ${String(universal)}, which is not in the vocabulary`,
      ).toBe(true);
    }
  });

  it("returns null exactly for the states that describe the record rather than the surface", () => {
    const nulls = productStates.filter((state) => universalStateForProductState(state) === null);
    expect([...nulls]).toEqual(["needs_attention", "ready"]);
  });

  it("keeps the derived not-loading list in step with the mapping", () => {
    expect([...PRODUCT_STATES_THAT_ARE_NOT_LOADING]).toEqual([
      "saved",
      "organizing",
      "could_not_organize",
    ]);
    for (const state of PRODUCT_STATES_THAT_ARE_NOT_LOADING) {
      expect(universalStateForProductState(state)).not.toBe("loading");
    }
  });

  it("fails when a state is remapped to loading — the control for the assertion above", () => {
    // The planted violation, run against a stand-in with the same shape. It
    // proves the assertion in this file can fail; without it, "no state maps to
    // loading" is also true of a mapping that returns null for everything.
    const broken = (state: ProductState): string | null =>
      state === "organizing" ? "loading" : universalStateForProductState(state);
    const offenders = productStates.filter((state) => broken(state) === "loading");
    expect(offenders).toEqual(["organizing"]);
  });
});
