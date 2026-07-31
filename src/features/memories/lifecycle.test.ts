import { describe, expect, it } from "vitest";

import { isMemoryInForce, memoryLifecycleState } from "./lifecycle";

const NOW = new Date("2026-07-30T12:00:00.000Z");

describe("memoryLifecycleState", () => {
  it("treats a memory with no validity window as active", () => {
    expect(memoryLifecycleState({ valid_from: null, valid_until: null }, NOW)).toBe("active");
  });

  it("is archived once valid_until has passed", () => {
    expect(
      memoryLifecycleState({ valid_from: null, valid_until: "2026-07-29T12:00:00.000Z" }, NOW),
    ).toBe("archived");
  });

  it("is scheduled while valid_from is still in the future", () => {
    expect(
      memoryLifecycleState({ valid_from: "2026-08-01T12:00:00.000Z", valid_until: null }, NOW),
    ).toBe("scheduled");
  });

  it("is active inside an open window", () => {
    expect(
      memoryLifecycleState(
        { valid_from: "2026-07-01T00:00:00.000Z", valid_until: "2026-08-30T00:00:00.000Z" },
        NOW,
      ),
    ).toBe("active");
  });

  // The order of the two checks is the behaviour, not an implementation detail:
  // a window entirely in the past is over, and calling it "scheduled" would be
  // false in the direction that matters.
  it("reports archived, not scheduled, when the whole window is in the past", () => {
    expect(
      memoryLifecycleState(
        { valid_from: "2026-08-01T00:00:00.000Z", valid_until: "2026-07-02T00:00:00.000Z" },
        NOW,
      ),
    ).toBe("archived");
  });

  it("treats both boundaries as inclusive of the instant they name", () => {
    expect(memoryLifecycleState({ valid_from: null, valid_until: NOW.toISOString() }, NOW)).toBe("archived");
    expect(memoryLifecycleState({ valid_from: NOW.toISOString(), valid_until: null }, NOW)).toBe("active");
  });

  // A malformed timestamp compared with `<=` is always false, which would
  // silently promote a broken row to `active`. Absent is the safe reading.
  it("ignores an unparseable timestamp instead of letting it decide", () => {
    expect(memoryLifecycleState({ valid_from: null, valid_until: "not-a-date" }, NOW)).toBe("active");
    expect(memoryLifecycleState({ valid_from: "not-a-date", valid_until: null }, NOW)).toBe("active");
  });
});

describe("isMemoryInForce", () => {
  it("admits only the active state, so the badge and the retrieval filter cannot drift", () => {
    expect(isMemoryInForce({ valid_from: null, valid_until: null }, NOW)).toBe(true);
    expect(isMemoryInForce({ valid_from: null, valid_until: "2026-07-01T00:00:00.000Z" }, NOW)).toBe(false);
    expect(isMemoryInForce({ valid_from: "2026-09-01T00:00:00.000Z", valid_until: null }, NOW)).toBe(false);
  });
});
