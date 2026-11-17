import { describe, expect, it } from "vitest";

import { parseCitations, NO_CITATIONS } from "@/features/conversation-sources/contracts";

import { buildFailedTurnEnvelope, FAILED_TURN_ENVELOPE_VERSION, isFailedTurn } from "./failed-turn";

const reference = "33333333-3333-4333-8333-333333333333";

describe("the failed-turn mark (ADR-194)", () => {
  it("builds a mark with the class and the reference, and nothing else", () => {
    expect(buildFailedTurnEnvelope({ failure: "provider", reference })).toEqual({
      v: FAILED_TURN_ENVELOPE_VERSION,
      turn: "failed",
      failure: "provider",
      reference,
    });
    expect(buildFailedTurnEnvelope({ failure: undefined, reference: undefined })).toEqual({
      v: FAILED_TURN_ENVELOPE_VERSION,
      turn: "failed",
      failure: null,
      reference: null,
    });
  });

  it("recognises its own mark and nothing else", () => {
    expect(isFailedTurn(buildFailedTurnEnvelope({ failure: "quota", reference: null }))).toBe(true);
    for (const raw of [
      null,
      [],
      {},
      { turn: "failed" },
      { v: FAILED_TURN_ENVELOPE_VERSION, turn: "answered", failure: null, reference: null },
      { v: FAILED_TURN_ENVELOPE_VERSION, turn: "failed", failure: "invented", reference: null },
      { v: FAILED_TURN_ENVELOPE_VERSION, turn: "failed", failure: null, reference: null, sources: [] },
      { v: "2026-08-09.1", evidence: "evidenced", reach: [], sources: [] },
    ]) {
      expect(isFailedTurn(raw)).toBe(false);
    }
  });

  it("reads as no citations to the source renderer, so a failure draws no source block", () => {
    expect(parseCitations(buildFailedTurnEnvelope({ failure: "provider", reference }))).toEqual(NO_CITATIONS);
  });
});
