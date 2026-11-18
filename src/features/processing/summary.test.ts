import { describe, expect, it } from "vitest";

import { getProcessingCopy } from "./copy";
import { groupJobs, processingState } from "./summary";

const job = (id: string, status: string) => ({ id, status });

describe("groupJobs", () => {
  it("sorts rows by what they ask of the reader, keeping each group's order", () => {
    const groups = groupJobs([
      job("a", "running"),
      job("b", "completed"),
      job("c", "failed"),
      job("d", "pending"),
      job("e", "cancelled"),
      job("f", "failed"),
    ]);
    expect(groups.failed.map((row) => row.id)).toEqual(["c", "f"]);
    expect(groups.active.map((row) => row.id)).toEqual(["a", "d"]);
    expect(groups.finished.map((row) => row.id)).toEqual(["b", "e"]);
  });

  it("files a status it was never taught with the finished rows, not the failures", () => {
    const groups = groupJobs([job("a", "archived")]);
    expect(groups.finished).toHaveLength(1);
    expect(groups.failed).toHaveLength(0);
  });
});

describe("processingState", () => {
  it("is empty with no rows — not a claim that work finished", () => {
    expect(processingState(groupJobs([]))).toEqual({ kind: "empty" });
  });

  it("is settled when nothing is failed or in flight", () => {
    expect(processingState(groupJobs([job("a", "completed"), job("b", "cancelled")]))).toEqual({ kind: "settled" });
  });

  it("counts what is in flight and what failed", () => {
    expect(
      processingState(groupJobs([job("a", "running"), job("b", "pending"), job("c", "failed"), job("d", "completed")])),
    ).toEqual({ kind: "unsettled", active: 2, failed: 1 });
  });
});

describe("the opening sentence", () => {
  const pt = getProcessingCopy("pt-BR");
  const en = getProcessingCopy("en");

  it("says both counts when both exist", () => {
    expect(pt.lead(2, 1)).toBe("2 itens em processamento, 1 com falha.");
    expect(en.lead(2, 1)).toBe("2 items processing, 1 failed.");
  });

  it("says one count alone, in the singular where it is one", () => {
    expect(pt.lead(1, 0)).toBe("1 item em processamento.");
    expect(pt.lead(0, 1)).toBe("1 item com falha.");
    expect(pt.lead(0, 3)).toBe("3 itens com falha.");
    expect(en.lead(1, 0)).toBe("1 item processing.");
    expect(en.lead(0, 2)).toBe("2 items failed.");
  });
});
