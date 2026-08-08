/**
 * `2J-VOICE-003`/`004` — the transcription contract, pinned to the SDK.
 *
 * The model is a constant in this repository and a union in the provider's SDK.
 * Those two facts drift independently: an SDK upgrade can retire a model
 * without any code here changing, and the first sign would be a user's first
 * recording failing on their own credential. This test makes that a build
 * failure instead.
 */

import { describe, expect, it } from "vitest";

import { TRANSCRIPTION_MODEL_ID } from "./model-routing";
import type { AIProvider } from "./provider";

describe("2J-VOICE-004: the pinned transcription model exists in the SDK", () => {
  it("is a member of the SDK's own AudioModel union", async () => {
    // Read from the installed SDK rather than from a copy of the list. A
    // hand-maintained mirror would pass forever after the SDK changed.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    // Read the declaration file straight from `node_modules`.
    //
    // Neither resolver route works here: `require.resolve` on a `.d.ts` path
    // appends `.js`, and `openai/package.json` is not listed in the package's
    // `exports`. The repository has no workspaces, so the install is flat and
    // this path is stable -- and if it ever is not, this test fails loudly
    // rather than silently stopping checking.
    const audioTypes = readFileSync(
      join(__dirname, "..", "..", "..", "node_modules", "openai", "resources", "audio", "audio.d.ts"),
      "utf8",
    );
    const union = audioTypes.match(/export type AudioModel = ([^;]+);/)?.[1] ?? "";
    expect(union, "AudioModel union not found in the installed SDK").not.toBe("");
    expect(union).toContain(`'${TRANSCRIPTION_MODEL_ID}'`);
  });

  it("is pinned as a constant rather than routed per user", async () => {
    // `2J-VOICE-004`. A seventh `agent_preferences` model column would be a
    // migration for a preference nobody asked for.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const routing = readFileSync(join(__dirname, "model-routing.ts"), "utf8");
    expect(routing).toMatch(/export const TRANSCRIPTION_MODEL_ID = "[^"]+" as const;/);
    // The routes record must NOT have grown a transcription slot.
    const routes = routing.match(/export type AIRoutes[\s\S]*?\};/)?.[0] ?? routing;
    expect(routes.toLowerCase()).not.toContain("transcription");
  });
});

describe("2J-VOICE-003: the capability is on the interface, not in a call site", () => {
  it("declares transcribeAudio on AIProvider", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const provider = readFileSync(join(__dirname, "provider.ts"), "utf8");
    expect(provider).toMatch(/transcribeAudio\(input: TranscriptionInput\): Promise<TranscriptionResult>;/);
  });

  it("keeps the input free of anything but the recording and a locale", async () => {
    // The provider gets audio and a language. No entry id, no user id, no
    // prompt, no other content -- the same discipline `TaskCommandParseInput`
    // documents for the command parser.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const types = readFileSync(join(__dirname, "types.ts"), "utf8");
    const input = types.match(/export type TranscriptionInput = \{[\s\S]*?\};/)?.[0] ?? "";
    expect(input).not.toBe("");
    const fields = [...input.matchAll(/^\s{2}(\w+):/gm)].map((match) => match[1]);
    expect(fields.sort()).toEqual(["audio", "locale", "mimeType"]);
  });

  it("is structurally satisfiable by the interface it claims to implement", () => {
    // A compile-time assertion: if `transcribeAudio` left the interface or
    // changed shape, this stops type-checking.
    const shape: Pick<AIProvider, "transcribeAudio"> = {
      transcribeAudio: async () => ({
        text: "ok",
        model: "gpt-4o-mini-transcribe",
        providerRequestId: null,
        transportRequestId: null,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
      }),
    };
    expect(typeof shape.transcribeAudio).toBe("function");
  });
});
