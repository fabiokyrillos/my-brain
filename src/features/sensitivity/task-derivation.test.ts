import { describe, expect, it } from "vitest";
import { SENSITIVITY_LEVELS } from "./contracts";
import {
  UNDETERMINED,
  deriveTaskSensitivity,
  isDerivedLevel,
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
