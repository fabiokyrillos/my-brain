import { describe, expect, it } from "vitest";

import { formatRate, formatUsd, usdToNano, withShares } from "./summary";

const item = (key: string, costNanoUsd: number) => ({ key, costNanoUsd, calls: 1, inputTokens: 10, outputTokens: 5 });

describe("formatUsd", () => {
  it("prints two decimals from one cent up, in the reader's format", () => {
    expect(formatUsd(12_840_000_000, "pt-BR")).toBe("US$ 12,84");
    expect(formatUsd(12_840_000_000, "en")).toBe("$12.84");
  });

  it("keeps the precision a sub-cent amount needs", () => {
    expect(formatUsd(4_200_000, "en")).toBe("$0.0042");
  });

  it("says an amount below its smallest figure as a bound, never as zero", () => {
    expect(formatUsd(50, "en")).toBe("< $0.0001");
    expect(formatUsd(50, "pt-BR")).toBe("< US$ 0,0001");
  });

  it("prints a real zero as zero", () => {
    expect(formatUsd(0, "en")).toBe("$0.00");
  });
});

describe("usdToNano", () => {
  it("reads the ledger's numeric string", () => {
    expect(usdToNano("0.012300")).toBe(12_300_000);
    expect(usdToNano(null)).toBe(0);
  });
});

describe("withShares", () => {
  it("gives each row its part of the total, in the order it arrived", () => {
    const rows = withShares([item("chat", 750), item("review", 250)], 1000);
    expect(rows.map((row) => [row.key, row.percent, row.width])).toEqual([
      ["chat", "75%", 75],
      ["review", "25%", 25],
    ]);
  });

  it("never draws a row that cost something as nothing", () => {
    const [row] = withShares([item("semantic_search", 2)], 1000);
    expect(row.percent).toBe("<1%");
    expect(row.width).toBe(1);
  });

  it("draws a row that cost nothing as nothing", () => {
    const [row] = withShares([item("background", 0)], 1000);
    expect(row.percent).toBe("0%");
    expect(row.width).toBe(0);
  });

  it("survives a total of zero", () => {
    const [row] = withShares([item("chat", 0)], 0);
    expect(row.percent).toBe("0%");
    expect(row.width).toBe(0);
  });

  it("caps a row at the whole", () => {
    expect(withShares([item("chat", 1200)], 1000)[0].width).toBe(100);
  });
});

describe("formatRate", () => {
  it("drops the zeros a price does not need", () => {
    expect(formatRate("2.500")).toBe("$2.5");
    expect(formatRate("15")).toBe("$15");
    expect(formatRate(0.075)).toBe("$0.075");
  });
});
