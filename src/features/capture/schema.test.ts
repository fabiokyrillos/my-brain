import { describe, expect, it } from "vitest";
import { captureEntrySchema } from "./schema";

describe("captureEntrySchema", () => {
  it("trims a valid web capture", () => {
    expect(captureEntrySchema.parse({ content: "  Jaime pediu o relatório.  ", locale: "pt-BR", source: "web" }))
      .toEqual({ content: "Jaime pediu o relatório.", locale: "pt-BR", source: "web" });
  });

  it("rejects blank entries", () => {
    expect(captureEntrySchema.safeParse({ content: "   ", locale: "pt-BR", source: "web" }).success).toBe(false);
  });

  it("rejects entries larger than the database limit", () => {
    expect(captureEntrySchema.safeParse({ content: "a".repeat(12001), locale: "pt-BR", source: "web" }).success).toBe(false);
  });
});
