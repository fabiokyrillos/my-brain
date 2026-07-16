import { describe, expect, it } from "vitest";
import { chatAnswerSchema } from "./chat-schema";

describe("chatAnswerSchema", () => {
  it("accepts an answer grounded in internal source ids", () => {
    expect(chatAnswerSchema.parse({ answer: "Marina está ligada ao projeto Atlas.", citedSourceIds: ["entry:123"] }))
      .toEqual({ answer: "Marina está ligada ao projeto Atlas.", citedSourceIds: ["entry:123"] });
  });

  it("permits an explicit no-evidence answer", () => {
    expect(chatAnswerSchema.parse({ answer: "Não encontrei isso no seu histórico.", citedSourceIds: [] }).citedSourceIds).toEqual([]);
  });
});
