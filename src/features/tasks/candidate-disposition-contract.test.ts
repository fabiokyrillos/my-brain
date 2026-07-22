import { describe, expect, it, vi } from "vitest";

type CandidateResolution = {
  candidateIndex: number;
  disposition: "confirmed" | "rejected" | "retained" | "dismissed";
};

type DispositionContractModule = {
  candidateDispositionValues?: readonly string[];
  candidateResolutionArraySchema?: {
    safeParse: (input: unknown) => { success: boolean };
  };
  normalizeCandidateResolutionCommand?: (input: {
    resolutions: unknown;
    edits: unknown;
  }) => {
    resolutions: CandidateResolution[];
    edits: Array<{ candidateIndex: number; changes: Record<string, unknown> }>;
  };
  serializeCandidateResolutions?: (resolutions: readonly CandidateResolution[]) => string;
};

const contractPath = `./${"candidate-disposition-contract"}.ts`;
const contract = await vi
  .importActual<DispositionContractModule>(contractPath)
  .catch(() => ({})) as DispositionContractModule;

function normalize(input: { resolutions: unknown; edits?: unknown }) {
  expect(contract.normalizeCandidateResolutionCommand).toBeTypeOf("function");
  return contract.normalizeCandidateResolutionCommand?.({
    resolutions: input.resolutions,
    edits: input.edits ?? [],
  });
}

describe("candidate disposition contract", () => {
  it("exposes exactly the four terminal dispositions and never cancelled", () => {
    expect(contract.candidateDispositionValues).toEqual([
      "confirmed",
      "rejected",
      "retained",
      "dismissed",
    ]);
    expect(contract.candidateDispositionValues).not.toContain("cancelled");
  });

  it("normalizes mixed resolutions into deterministic candidate-index order", () => {
    expect(normalize({
      resolutions: [
        { candidateIndex: 3, disposition: "dismissed" },
        { candidateIndex: 0, disposition: "confirmed" },
        { candidateIndex: 2, disposition: "retained" },
        { candidateIndex: 1, disposition: "rejected" },
      ],
    })?.resolutions).toEqual([
      { candidateIndex: 0, disposition: "confirmed" },
      { candidateIndex: 1, disposition: "rejected" },
      { candidateIndex: 2, disposition: "retained" },
      { candidateIndex: 3, disposition: "dismissed" },
    ]);
  });

  it("serializes the canonical resolution fields in stable order", () => {
    expect(contract.serializeCandidateResolutions).toBeTypeOf("function");
    expect(contract.serializeCandidateResolutions?.([
      { candidateIndex: 2, disposition: "retained" },
      { candidateIndex: 0, disposition: "confirmed" },
    ])).toBe(
      '[{"candidateIndex":0,"disposition":"confirmed"},{"candidateIndex":2,"disposition":"retained"}]',
    );
  });

  it.each([
    ["cancelled", [{ candidateIndex: 0, disposition: "cancelled" }]],
    ["unknown disposition", [{ candidateIndex: 0, disposition: "ignored" }]],
    ["unknown top-level field", [{ candidateIndex: 0, disposition: "rejected", reason: "wrong" }]],
    ["missing disposition", [{ candidateIndex: 0 }]],
    ["negative candidate index", [{ candidateIndex: -1, disposition: "rejected" }]],
    ["duplicate candidate index", [
      { candidateIndex: 0, disposition: "confirmed" },
      { candidateIndex: 0, disposition: "rejected" },
    ]],
    ["empty resolution batch", []],
    ["more than fifty resolutions", Array.from({ length: 51 }, (_, candidateIndex) => ({
      candidateIndex,
      disposition: "rejected",
    }))],
  ])("rejects %s", (_label, resolutions) => {
    expect(contract.candidateResolutionArraySchema).toBeDefined();
    expect(contract.candidateResolutionArraySchema?.safeParse(resolutions).success).toBe(false);
  });

  it("accepts edits only for candidates resolved as confirmed", () => {
    expect(normalize({
      resolutions: [
        { candidateIndex: 0, disposition: "confirmed" },
        { candidateIndex: 1, disposition: "rejected" },
      ],
      edits: [{ candidateIndex: 0, changes: { title: "Final title" } }],
    })?.edits).toEqual([
      { candidateIndex: 0, changes: { title: "Final title" } },
    ]);

    expect(() => normalize({
      resolutions: [
        { candidateIndex: 0, disposition: "confirmed" },
        { candidateIndex: 1, disposition: "rejected" },
      ],
      edits: [{ candidateIndex: 1, changes: { title: "Must not be sent" } }],
    })).toThrow(/confirmed/i);
  });

  it("rejects an edit whose candidate is absent from the resolution batch", () => {
    expect(() => normalize({
      resolutions: [{ candidateIndex: 0, disposition: "confirmed" }],
      edits: [{ candidateIndex: 1, changes: { title: "Out of batch" } }],
    })).toThrow(/resolution/i);
  });
});
