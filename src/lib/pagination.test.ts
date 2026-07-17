import { describe, expect, it } from "vitest";
import { PAGE_SIZE, pageRange, paginateRows, parsePage } from "./pagination";

describe("pagination", () => {
  it.each([undefined, "", "0", "-2", "1.5", "abc", ["2"]])(
    "falls back to page one for invalid input: %j",
    (value) => expect(parsePage(value)).toBe(1),
  );

  it("accepts and caps positive integer pages", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("999999")).toBe(10_000);
  });

  it("requests one look-ahead row for the requested page", () => {
    expect(pageRange(1)).toEqual({ from: 0, to: PAGE_SIZE });
    expect(pageRange(2)).toEqual({ from: PAGE_SIZE, to: PAGE_SIZE * 2 });
  });

  it("removes the look-ahead row and reports whether another page exists", () => {
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, index) => index);
    expect(paginateRows(rows)).toEqual({ items: rows.slice(0, PAGE_SIZE), hasNext: true });
    expect(paginateRows(rows.slice(0, 12))).toEqual({ items: rows.slice(0, 12), hasNext: false });
  });
});
