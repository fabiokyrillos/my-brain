import { describe, expect, it } from "vitest";
import { GOVERNED_SURFACES, SENSITIVITY_LEVELS, presentationFor } from "./contracts";
import {
  UNDETERMINED,
  deriveTaskSensitivity,
  isDerivedLevel,
  resolveTaskContent,
  toTaskSensitivity,
  type TaskSensitivity,
} from "./task-derivation";

/**
 * `2L-AUDIT-005` / `2L-PRIVACY-001`, `-002`, `-004`, `-005` — OD-2L-1 option B's
 * derivation contract, as tests written before the module existed.
 *
 * The owner signed **option B**: a task's sensitivity is *derived from its source
 * entry*, re-read rather than stored. This file pins the three answers that
 * contract has to give and the one it must be **incapable** of giving.
 */

const map = (entries: readonly (readonly [string, string | null])[]) =>
  new Map<string, string | null>(entries);

describe("2L-PRIVACY-004: a task with no source entry is undetermined, never `normal`", () => {
  it("resolves a manual task to `undetermined`", () => {
    expect(deriveTaskSensitivity(null, map([]))).toEqual({ kind: "undetermined" });
    expect(deriveTaskSensitivity(undefined, map([]))).toEqual({ kind: "undetermined" });
  });

  it("treats an empty source id as no source rather than as a lookup", () => {
    // A `""` reaching here means a caller built the id from something absent.
    // Looking it up would find nothing and silently produce the *unreadable*
    // answer, which is a different and much more protective claim than "this
    // task was never derived from anything".
    expect(deriveTaskSensitivity("", map([["", "normal"]]))).toEqual({ kind: "undetermined" });
  });

  it("cannot express `undetermined` as a level, so nothing can read it as `normal`", () => {
    const undetermined = deriveTaskSensitivity(null, map([]));
    // The property that matters is structural, not behavioural: there is no
    // `level` field to misread. A boolean flag beside a level would be one
    // careless destructure away from defaulting to `normal`.
    expect(isDerivedLevel(undetermined)).toBe(false);
    expect(Object.keys(undetermined)).toEqual(["kind"]);
    expect(UNDETERMINED).toEqual({ kind: "undetermined" });
  });
});

describe("2L-PRIVACY-001: a readable source entry decides the level", () => {
  it("derives each declared level from the source row", () => {
    for (const level of SENSITIVITY_LEVELS) {
      expect(deriveTaskSensitivity("entry-1", map([["entry-1", level]])))
        .toEqual({ kind: "derived", level });
    }
  });

  it("reads the level of *that* entry and not of another row in the page", () => {
    const levels = map([
      ["entry-1", "normal"],
      ["entry-2", "highly_sensitive"],
    ]);
    expect(deriveTaskSensitivity("entry-1", levels)).toEqual({ kind: "derived", level: "normal" });
    expect(deriveTaskSensitivity("entry-2", levels))
      .toEqual({ kind: "derived", level: "highly_sensitive" });
  });
});

describe("2L-PRIVACY-005: an unreadable source is the most protective answer", () => {
  /*
   * Removed, foreign and unreadable are **one** case here, and that is the
   * point rather than a simplification. The map is built from an owner-scoped
   * query, so a deleted entry, an entry belonging to someone else and an entry
   * the read could not return are all simply *absent from the map*. There is no
   * branch that could tell them apart, so there is no branch that could leak
   * which one it was.
   */
  it("resolves a source id absent from the owner-scoped read to `highly_sensitive`", () => {
    expect(deriveTaskSensitivity("entry-gone", map([])))
      .toEqual({ kind: "derived", level: "highly_sensitive" });
  });

  it("gives byte-identical answers for removed, foreign and unreadable sources", () => {
    const removed = deriveTaskSensitivity("removed", map([["other", "normal"]]));
    const foreign = deriveTaskSensitivity("foreign", map([["other", "normal"]]));
    const unreadable = deriveTaskSensitivity("unreadable", map([["other", "normal"]]));
    expect(JSON.stringify(removed)).toBe(JSON.stringify(foreign));
    expect(JSON.stringify(foreign)).toBe(JSON.stringify(unreadable));
  });

  it("fails closed on a row whose stored level is null or unrecognised", () => {
    // `toSensitivityLevel` already does this; asserted here because the
    // derivation is where a future caller would be tempted to default.
    expect(deriveTaskSensitivity("entry-1", map([["entry-1", null]])))
      .toEqual({ kind: "derived", level: "highly_sensitive" });
    expect(deriveTaskSensitivity("entry-1", map([["entry-1", "public"]])))
      .toEqual({ kind: "derived", level: "highly_sensitive" });
    expect(deriveTaskSensitivity("entry-1", map([["entry-1", ""]])))
      .toEqual({ kind: "derived", level: "highly_sensitive" });
  });

  it("never resolves an unreadable source to `undetermined`", () => {
    // The two absences are different claims. "I have no source" is a fact about
    // the task; "I have a source I cannot read" is a fact about the read, and
    // treating the second as the first would render content the owner asked to
    // be protected.
    const result = deriveTaskSensitivity("entry-gone", map([]));
    expect(result.kind).toBe("derived");
  });
});

describe("2L-PRIVACY-002: the value crossing a projection boundary is narrowed, fail-closed", () => {
  /*
   * `toWorkItemView` validates every other field it is handed and refuses what
   * it cannot recognise. The classification has to be narrowed the same way,
   * and the direction of the failure is the whole question: a caller that
   * forgets to derive one must not thereby publish content in the clear.
   *
   * So an unrecognised value resolves to the most protective level and **never**
   * to `undetermined`. `undetermined` is a claim about the task ("it has no
   * source"), and a missing value is a claim about the code.
   */
  it("passes a well-formed derived value through unchanged", () => {
    for (const level of SENSITIVITY_LEVELS) {
      expect(toTaskSensitivity({ kind: "derived", level })).toEqual({ kind: "derived", level });
    }
  });

  it("passes `undetermined` through unchanged", () => {
    expect(toTaskSensitivity({ kind: "undetermined" })).toEqual({ kind: "undetermined" });
    expect(toTaskSensitivity(UNDETERMINED)).toEqual({ kind: "undetermined" });
  });

  it("fails closed on anything it does not recognise", () => {
    for (const malformed of [
      undefined,
      null,
      "normal",
      {},
      { kind: "derived" },
      { kind: "derived", level: "public" },
      { kind: "derived", level: null },
      { kind: "unknown" },
      { level: "normal" },
      [],
    ]) {
      expect(toTaskSensitivity(malformed), JSON.stringify(malformed) ?? "undefined")
        .toEqual({ kind: "derived", level: "highly_sensitive" });
    }
  });

  it("never invents `undetermined` for a value it could not read", () => {
    // The failure that would matter: a missing classification quietly becoming
    // "this task was never classified", which renders in the clear.
    expect(toTaskSensitivity(undefined).kind).toBe("derived");
    expect(toTaskSensitivity({ kind: "derived", level: "nope" }).kind).toBe("derived");
  });
});

describe("2L-PRIVACY-007: list and detail resolve presentation through one function", () => {
  /*
   * The convergence requirement is not "both surfaces behave the same"; it is
   * that neither surface *decides*. `resolveTaskContent` is the single place a
   * Work surface asks what to render, so the list and the detail cannot
   * disagree without one of them ceasing to call it — which the convergence
   * guard fails on.
   */
  it("governs `work` through the central contract", () => {
    expect(GOVERNED_SURFACES).toContain("work");
    expect(presentationFor("work", "normal").outcome).toBe("show");
    expect(presentationFor("work", "private").outcome).toBe("show");
    expect(presentationFor("work", "highly_sensitive")).toEqual({ outcome: "mask", revealable: true });
  });

  it("shows a `normal` or `private` source in the clear", () => {
    for (const level of ["normal", "private"] as const) {
      expect(resolveTaskContent({ kind: "derived", level }, "task-1"))
        .toEqual({ show: true, masked: false, revealable: false });
    }
  });

  it("masks a `highly_sensitive` source in place, revealable locally", () => {
    expect(resolveTaskContent({ kind: "derived", level: "highly_sensitive" }, "task-1"))
      .toEqual({ show: false, masked: true, revealable: true });
  });

  it("reveals only the key the user acted on", () => {
    const state = { revealed: new Set(["task-1"]) };
    const masked = { kind: "derived", level: "highly_sensitive" } as const;
    expect(resolveTaskContent(masked, "task-1", state).show).toBe(true);
    expect(resolveTaskContent(masked, "task-2", state).show).toBe(false);
  });

  it("shows an undetermined task without ever asking for a level", () => {
    // `2L-PRIVACY-004`: a manual task is not artificially classified, and the
    // absence of a source is not inferred to mean `normal`. The visible result
    // matches `normal`'s; the reasoning never produces the word.
    expect(resolveTaskContent(UNDETERMINED, "task-1"))
      .toEqual({ show: true, masked: false, revealable: false });
    // Even with a reveal active for its key, nothing changes: there is nothing
    // withheld to reveal.
    expect(resolveTaskContent(UNDETERMINED, "task-1", { revealed: new Set(["task-1"]) }))
      .toEqual({ show: true, masked: false, revealable: false });
  });

  it("gives one answer per classification, whichever surface asks", () => {
    // Executed rather than asserted in prose: the same three inputs, resolved
    // twice, must be byte-identical. This is what "the list and the detail
    // converge on the same contract" means operationally.
    for (const sensitivity of [
      UNDETERMINED,
      { kind: "derived", level: "normal" } as const,
      { kind: "derived", level: "highly_sensitive" } as const,
    ]) {
      const fromList = resolveTaskContent(sensitivity, "task-1");
      const fromDetail = resolveTaskContent(sensitivity, "task-1");
      expect(JSON.stringify(fromList)).toBe(JSON.stringify(fromDetail));
    }
  });
});

describe("the derivation is pure, and stays that way", () => {
  it("is synchronous and returns a frozen-shaped value", () => {
    const result: TaskSensitivity = deriveTaskSensitivity("entry-1", map([["entry-1", "normal"]]));
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof result).toBe("object");
  });

  it("does not mutate the map it is given", () => {
    const levels = map([["entry-1", "normal"]]);
    deriveTaskSensitivity("entry-2", levels);
    expect([...levels.entries()]).toEqual([["entry-1", "normal"]]);
  });
});
