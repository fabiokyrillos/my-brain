import { describe, expect, it } from "vitest";

import { createAnswerFieldExtractor } from "./answer-stream";

/** Feeds `chunks` one by one and returns what each push emitted. */
function feed(chunks: readonly string[]): string[] {
  const extractor = createAnswerFieldExtractor();
  return chunks.map((chunk) => extractor.push(chunk));
}

/** Every split of `json` into pieces of `size` characters. */
function pieces(json: string, size: number): string[] {
  const out: string[] = [];
  for (let index = 0; index < json.length; index += size) out.push(json.slice(index, index + size));
  return out;
}

describe("createAnswerFieldExtractor (Life Brain E.5 part 2, ADR-175)", () => {
  it("forwards only the answer string's characters, as they arrive", () => {
    const emitted = feed(['{"ans', 'wer":"Olá', ", Ana", '","citedSourceIds":["entry:1"]}']);
    expect(emitted).toEqual(["", "Olá", ", Ana", ""]);
  });

  it("decodes escapes, including one split across chunks", () => {
    const value = 'linha 1\nlinha 2\t"citação" \\ barra / fim';
    const json = JSON.stringify({ answer: value, citedSourceIds: [] });
    for (const size of [1, 2, 3, 5, 7, 64]) {
      expect(feed(pieces(json, size)).join(""), `chunk size ${size}`).toBe(value);
    }
  });

  it("decodes \\u escapes and surrogate pairs whatever the chunking", () => {
    const value = "café — 😀 ação";
    // Force every non-ASCII character through a \u escape, as some encoders do.
    const json = `{"answer":"${[...value]
      .map((char) => (char.charCodeAt(0) < 128 ? char : char.split("").map((unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, "0")}`).join("")))
      .join("")}","citedSourceIds":[]}`;
    for (const size of [1, 2, 3, 4, 6, 11]) {
      expect(feed(pieces(json, size)).join(""), `chunk size ${size}`).toBe(value);
    }
  });

  it("finds the answer when it is not the first key, and ignores a nested key of the same name", () => {
    const json = '{"citedSourceIds":["answer"],"meta":{"answer":"não"},"answer":"sim"}';
    expect(feed(pieces(json, 3)).join("")).toBe("sim");
  });

  it("ignores whitespace between tokens", () => {
    expect(feed(['{ "answer" : ', ' "ok" , "citedSourceIds" : [ ] }']).join("")).toBe("ok");
  });

  it("emits nothing for output that never reaches an answer string", () => {
    expect(feed(['{"answer":', "null}"]).join("")).toBe("");
    expect(feed(["not json at all"]).join("")).toBe("");
  });

  it("emits the answer once, even if a second answer key follows", () => {
    expect(feed(['{"answer":"um","answer":"dois"}']).join("")).toBe("um");
  });
});
