/**
 * Life Brain E.5 part 2 (ADR-175) — the provider half of the streamed answer.
 *
 * The streamed call is the same request as `answerFromKnowledge` (same prompt,
 * same schema, same output ceiling) with `stream: true`. It forwards only the
 * `answer` string's characters, and returns the complete output UNVALIDATED
 * with its usage, so the caller can record the bill before deciding whether
 * the object is valid.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const create = vi.fn();
const parse = vi.fn();
vi.mock("openai", () => ({
  default: class {
    responses = { create, parse };
  },
}));

import { CHAT_ANSWER_MAX_OUTPUT_TOKENS, OpenAIProvider } from "./openai-provider";

const input = {
  question: "O que ficou pendente com a Ana?",
  locale: "pt-BR" as const,
  timezone: "America/Sao_Paulo",
  sources: [{ id: "entry:1", type: "entry" as const, content: "Ana", occurredAt: "2026-11-01T10:00:00Z", similarity: 0.9 }],
};

const completed = {
  id: "resp_1",
  model: "gpt-5.6-terra",
  usage: { input_tokens: 120, output_tokens: 30, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 4 } },
};

async function* events(list: readonly unknown[]) {
  for (const event of list) yield event;
}

function deltas(json: string, size: number) {
  const out: unknown[] = [];
  for (let index = 0; index < json.length; index += size) {
    out.push({ type: "response.output_text.delta", delta: json.slice(index, index + size) });
  }
  return out;
}

function provider() {
  return new OpenAIProvider({ apiKey: "sk-test", model: "gpt-5.6-terra" });
}

beforeEach(() => {
  create.mockReset();
  parse.mockReset();
});

describe("streamAnswerFromKnowledge", () => {
  it("sends the same request as the non-streamed answer, with stream on and the caller's signal", async () => {
    const json = JSON.stringify({ answer: "Falta o contrato.", citedSourceIds: ["entry:1"] });
    create.mockResolvedValue(events([...deltas(json, 4), { type: "response.completed", response: completed }]));
    parse.mockResolvedValue({ ...completed, output_parsed: { answer: "x", citedSourceIds: [] } });
    const controller = new AbortController();

    await provider().streamAnswerFromKnowledge(input, { onAnswerDelta: () => undefined, signal: controller.signal });
    await provider().answerFromKnowledge(input);

    const [streamed, options] = create.mock.calls[0]!;
    const [plain] = parse.mock.calls[0]!;
    expect(streamed.stream).toBe(true);
    expect(options).toEqual({ signal: controller.signal });
    expect(streamed.max_output_tokens).toBe(CHAT_ANSWER_MAX_OUTPUT_TOKENS);
    expect(JSON.stringify({ ...streamed, stream: undefined })).toBe(JSON.stringify(plain));
  });

  it("forwards only the answer's characters, and returns the whole output with its usage", async () => {
    const json = JSON.stringify({ answer: "Falta o \"contrato\".\nDepois, o PIX.", citedSourceIds: ["entry:1"] });
    create.mockResolvedValue(events([...deltas(json, 3), { type: "response.completed", response: completed }]));
    const pieces: string[] = [];

    const result = await provider().streamAnswerFromKnowledge(input, { onAnswerDelta: (text) => pieces.push(text) });

    expect(pieces.join("")).toBe("Falta o \"contrato\".\nDepois, o PIX.");
    expect(pieces.join("")).not.toContain("entry:1");
    expect(result.output).toEqual(JSON.parse(json));
    expect(result).toMatchObject({ model: "gpt-5.6-terra", providerRequestId: "resp_1", inputTokens: 120, outputTokens: 30, reasoningTokens: 4 });
  });

  it("returns a truncated output's usage with an unparseable output, so the bill is still recorded", async () => {
    create.mockResolvedValue(events([...deltas('{"answer":"Começo', 5), { type: "response.incomplete", response: completed }]));

    const result = await provider().streamAnswerFromKnowledge(input, { onAnswerDelta: () => undefined });

    expect(result.output).toBeNull();
    expect(result.outputTokens).toBe(30);
  });

  it("throws when the stream ends without a final response, or reports a failure", async () => {
    create.mockResolvedValue(events(deltas('{"answer":"meio', 4)));
    await expect(provider().streamAnswerFromKnowledge(input, { onAnswerDelta: () => undefined })).rejects.toThrow();

    create.mockResolvedValue(events([{ type: "response.failed", response: completed }]));
    await expect(provider().streamAnswerFromKnowledge(input, { onAnswerDelta: () => undefined })).rejects.toThrow();
  });

  it("propagates an abort from the transport", async () => {
    const aborted = Object.assign(new Error("Request was aborted."), { name: "AbortError" });
    create.mockImplementation(async () => {
      async function* failing() {
        yield { type: "response.output_text.delta", delta: '{"answer":"Fal' };
        throw aborted;
      }
      return failing();
    });
    const pieces: string[] = [];
    await expect(
      provider().streamAnswerFromKnowledge(input, { onAnswerDelta: (text) => pieces.push(text) }),
    ).rejects.toBe(aborted);
    expect(pieces).toEqual(["Fal"]);
  });
});
