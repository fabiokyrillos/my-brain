import { describe, expect, it } from "vitest";

import {
  CONFLICT_KINDS,
  detectMemoryValidityConflicts,
  isInvertedValidityWindow,
  type MemoryConflictSource,
} from "./conflict-detection";

/**
 * The detector is pure, so every case here is a table row rather than a fixture.
 * There is no clock: an inverted window is inverted at every instant, and a rule
 * that consulted `now()` would make the same row a conflict on Tuesday and not
 * on Wednesday.
 */

const INVERTED = {
  memoryId: "11111111-1111-4111-8111-111111111111",
  content: "Trabalho na Acme",
  sensitivity: "normal",
  validFrom: "2026-09-01T00:00:00.000Z",
  validUntil: "2026-08-01T00:00:00.000Z",
} satisfies MemoryConflictSource;

function source(overrides: Partial<MemoryConflictSource> = {}): MemoryConflictSource {
  return { ...INVERTED, ...overrides };
}

describe("isInvertedValidityWindow", () => {
  it("is true when the start is strictly after the end", () => {
    expect(isInvertedValidityWindow({ valid_from: "2026-09-01T00:00:00Z", valid_until: "2026-08-01T00:00:00Z" })).toBe(true);
  });

  it("is false when the start precedes the end", () => {
    expect(isInvertedValidityWindow({ valid_from: "2026-08-01T00:00:00Z", valid_until: "2026-09-01T00:00:00Z" })).toBe(false);
  });

  /**
   * Excluded deliberately, and this is the sibling table's own rule:
   * `entity_aliases_check` permits `valid_to >= valid_from`. A memory true for a
   * single instant is unusual, not impossible — and calling it a contradiction
   * would put an item in the queue whose only honest action is "nothing is
   * wrong".
   */
  it("is false when the two instants are equal", () => {
    expect(isInvertedValidityWindow({ valid_from: "2026-08-01T00:00:00Z", valid_until: "2026-08-01T00:00:00Z" })).toBe(false);
  });

  it("is false when the two instants are equal but differently spelled", () => {
    expect(isInvertedValidityWindow({ valid_from: "2026-08-01T00:00:00Z", valid_until: "2026-08-01T00:00:00.000+00:00" })).toBe(false);
  });

  it("is false when only the start is set", () => {
    expect(isInvertedValidityWindow({ valid_from: "2026-09-01T00:00:00Z", valid_until: null })).toBe(false);
  });

  it("is false when only the end is set — a correctly archived memory", () => {
    expect(isInvertedValidityWindow({ valid_from: null, valid_until: "2026-08-01T00:00:00Z" })).toBe(false);
  });

  it("is false when both are absent", () => {
    expect(isInvertedValidityWindow({ valid_from: null, valid_until: null })).toBe(false);
  });

  /**
   * Fail-closed, and the same posture `memoryLifecycleState` already takes for
   * the same columns. An unparseable timestamp is a data fault; turning it into
   * an accusation about the owner's dates would be inventing a conflict out of a
   * value nobody can read.
   */
  it("is false when either instant is unreadable", () => {
    expect(isInvertedValidityWindow({ valid_from: "not-a-date", valid_until: "2026-08-01T00:00:00Z" })).toBe(false);
    expect(isInvertedValidityWindow({ valid_from: "2026-09-01T00:00:00Z", valid_until: "not-a-date" })).toBe(false);
    expect(isInvertedValidityWindow({ valid_from: "not-a-date", valid_until: "also-not" })).toBe(false);
  });

  it("does not consult a clock — the same row is a conflict at any instant", () => {
    const window = { valid_from: "2026-09-01T00:00:00Z", valid_until: "2026-08-01T00:00:00Z" };
    expect(isInvertedValidityWindow(window)).toBe(true);
    expect(isInvertedValidityWindow(window)).toBe(true);
    expect(isInvertedValidityWindow.length).toBe(1);
  });
});

describe("detectMemoryValidityConflicts", () => {
  it("derives one conflict from an inverted window, carrying both dates", () => {
    const [conflict, ...rest] = detectMemoryValidityConflicts([source()]);
    expect(rest).toHaveLength(0);
    expect(conflict.kind).toBe("memory_validity_window");
    expect(conflict.memoryId).toBe(INVERTED.memoryId);
    expect(conflict.validFrom).toBe(INVERTED.validFrom);
    expect(conflict.validUntil).toBe(INVERTED.validUntil);
  });

  it("derives nothing from a coherent window", () => {
    expect(detectMemoryValidityConflicts([source({ validFrom: "2026-08-01T00:00:00Z", validUntil: "2026-09-01T00:00:00Z" })])).toEqual([]);
  });

  it("derives nothing from a correctly archived memory", () => {
    expect(detectMemoryValidityConflicts([source({ validFrom: null })])).toEqual([]);
  });

  it("derives nothing from a correctly scheduled memory", () => {
    expect(detectMemoryValidityConflicts([source({ validUntil: null })])).toEqual([]);
  });

  it("derives nothing from a memory with no window at all", () => {
    expect(detectMemoryValidityConflicts([source({ validFrom: null, validUntil: null })])).toEqual([]);
  });

  it("derives nothing from an empty read — absent and foreign are the same shape", () => {
    expect(detectMemoryValidityConflicts([])).toEqual([]);
  });

  it("emits one conflict per memory and never two for the same id", () => {
    const conflicts = detectMemoryValidityConflicts([source(), source()]);
    expect(conflicts).toHaveLength(1);
    expect(new Set(conflicts.map((conflict) => conflict.key)).size).toBe(1);
  });

  it("keys each conflict by its memory and kind, so two memories are two items", () => {
    const other = source({ memoryId: "22222222-2222-4222-8222-222222222222" });
    const conflicts = detectMemoryValidityConflicts([source(), other]);
    expect(conflicts.map((conflict) => conflict.key)).toEqual([
      `${INVERTED.memoryId}:memory_validity_window`,
      `${other.memoryId}:memory_validity_window`,
    ]);
  });

  /**
   * `2N-CONFLICT-005`. Not a formatting detail — it is the rule that keeps the
   * queue honest, asserted on the shape the surface consumes.
   */
  it("gives every derived conflict an action", () => {
    for (const conflict of detectMemoryValidityConflicts([source()])) {
      expect(conflict.action.id).toBe("resolve_validity_conflict");
      expect(conflict.action.href).toBe(`/app/memories/${INVERTED.memoryId}`);
    }
  });

  it("classifies fail-closed, so an unrecognised sensitivity is not treated as normal", () => {
    const [conflict] = detectMemoryValidityConflicts([source({ sensitivity: "something-new" })]);
    expect(conflict.sensitivity).toBe("highly_sensitive");
  });

  it("carries the memory's own classification when it is recognised", () => {
    const [conflict] = detectMemoryValidityConflicts([source({ sensitivity: "private" })]);
    expect(conflict.sensitivity).toBe("private");
  });

  it("drops a row whose id or content cannot be read, rather than rendering a blank item", () => {
    expect(detectMemoryValidityConflicts([source({ memoryId: "  " })])).toEqual([]);
    expect(detectMemoryValidityConflicts([source({ content: "   " })])).toEqual([]);
  });

  it("is pure — the same input twice produces equal output and the input is untouched", () => {
    const input = [source()];
    const frozen = JSON.stringify(input);
    expect(detectMemoryValidityConflicts(input)).toEqual(detectMemoryValidityConflicts(input));
    expect(JSON.stringify(input)).toBe(frozen);
  });

  it("exposes a closed kind vocabulary with exactly one member", () => {
    expect(CONFLICT_KINDS).toEqual(["memory_validity_window"]);
  });
});
