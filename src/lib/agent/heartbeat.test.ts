import { describe, expect, it } from "vitest";
import { isStaleTask, isWithinQuietHours } from "./heartbeat";

describe("heartbeat rules", () => {
  const now = new Date("2026-07-16T15:00:00.000Z");

  it("uses the configured stale threshold by priority", () => {
    expect(isStaleTask({ priority: "high", updatedAt: "2026-07-13T14:59:00.000Z" }, now)).toBe(true);
    expect(isStaleTask({ priority: "medium", updatedAt: "2026-07-10T15:00:00.000Z" }, now)).toBe(false);
    expect(isStaleTask({ priority: "low", updatedAt: "2026-07-01T14:59:00.000Z" }, now)).toBe(true);
  });

  it("treats quiet periods that cross midnight correctly", () => {
    expect(isWithinQuietHours("23:30", "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours("06:30", "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours("12:00", "22:00", "07:00")).toBe(false);
  });
});
