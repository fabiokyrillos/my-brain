import { describe, expect, it, vi } from "vitest";

type Snapshot = {
  version: number;
  summary: string;
  concepts: string[];
  occurredAt: string;
  extractedDates: Array<{ value: string; label?: string | null }>;
  entityLinks: Array<{ entityType: string; entityId: string; name: string }>;
  classifications: Record<string, string>;
};
type ComparisonModule = {
  compareInterpretationVersions?: (previous: Snapshot, current: Snapshot) => Array<{
    field: string;
    before: unknown;
    after: unknown;
  }>;
};

const modulePath = `./version-${"comparison"}.ts`;
const comparison = await vi.importActual<ComparisonModule>(modulePath).catch(() => ({})) as ComparisonModule;
const base: Snapshot = {
  version: 1,
  summary: "Conversei com Marina.",
  concepts: ["person_note"],
  occurredAt: "2026-07-17T12:00:00Z",
  extractedDates: [],
  entityLinks: [{ entityType: "person", entityId: "p1", name: "Marina" }],
  classifications: { summary: "fact" },
};

describe("interpretation version comparison", () => {
  it("returns no changes for equivalent snapshots regardless of array order", () => {
    const equivalent = {
      ...base,
      version: 2,
      concepts: [...base.concepts].reverse(),
      entityLinks: [...base.entityLinks].reverse(),
    };
    expect(comparison.compareInterpretationVersions).toBeTypeOf("function");
    expect(comparison.compareInterpretationVersions?.(base, equivalent)).toEqual([]);
  });

  it("reports summary, concepts, dates, entity links, and classifications", () => {
    const current: Snapshot = {
      version: 2,
      summary: "Conversei com Beatriz e registrei a decisão.",
      concepts: ["decision", "person_note"],
      occurredAt: "2026-07-16T12:00:00Z",
      extractedDates: [{ value: "2026-07-20", label: "prazo" }],
      entityLinks: [{ entityType: "person", entityId: "p2", name: "Beatriz" }],
      classifications: { summary: "interpretation", entities: "fact" },
    };
    expect(comparison.compareInterpretationVersions?.(base, current).map((change) => change.field)).toEqual([
      "summary",
      "concepts",
      "occurredAt",
      "extractedDates",
      "entityLinks",
      "classifications",
    ]);
  });
});
