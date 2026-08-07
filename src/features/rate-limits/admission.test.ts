import { describe, expect, it, vi } from "vitest";
import { claimRateLimitSlot } from "./admission";
import { readRateLimitVerdict } from "./refusal";
import { RATE_LIMITS } from "@/lib/rate-limits";

/**
 * Fail-closed, proved by running it — `2H-RATE-005`.
 *
 * The requirement is that unreadable limiter state refuses rather than admits.
 * The database half is asserted in pgTAP by making the table unreadable inside a
 * transaction; this file asserts the *other* half, which pgTAP cannot reach: the
 * application must also refuse when the database never answered, when it
 * answered with a shape nobody expected, and when it named a refusal this
 * process does not know.
 *
 * Every case below is a way the ceiling was **not verified**, and the property
 * under test is that none of them produces an admission.
 */

function client(response: { data?: unknown; error?: unknown } | (() => never)) {
  return {
    rpc: vi.fn(async () => {
      if (typeof response === "function") response();
      return response as { data: unknown; error: unknown };
    }),
  };
}

describe("2H-RATE-002 — the ceiling and the window are passed, never defaulted", () => {
  it("sends the signed AI ceiling and the rolling window on every claim", async () => {
    const stub = client({ data: [{ admitted: true, slot_id: "a", refusal: null }], error: null });
    await claimRateLimitSlot(stub, "ai");

    expect(stub.rpc).toHaveBeenCalledWith("claim_rate_limit_slot", {
      p_bucket: "ai",
      p_ceiling: RATE_LIMITS.aiOperationsPerHour,
      p_window: `${RATE_LIMITS.rollingWindowSeconds} seconds`,
    });
  });

  it("sends the signed upload ceiling for the upload bucket", async () => {
    const stub = client({ data: [{ admitted: true, slot_id: "b", refusal: null }], error: null });
    await claimRateLimitSlot(stub, "upload");

    expect(stub.rpc).toHaveBeenCalledWith(
      "claim_rate_limit_slot",
      expect.objectContaining({ p_bucket: "upload", p_ceiling: RATE_LIMITS.uploadsPerHour }),
    );
  });
});

describe("2H-RATE-001 — a well-formed admission is an admission", () => {
  it("admits and carries the slot id", async () => {
    const verdict = await claimRateLimitSlot(
      client({ data: [{ admitted: true, slot_id: "slot-1", refusal: null }], error: null }),
      "ai",
    );
    expect(verdict).toEqual({ admitted: true, slotId: "slot-1" });
  });

  it("carries the ceiling refusal and the refused row's id", async () => {
    const verdict = await claimRateLimitSlot(
      client({ data: [{ admitted: false, slot_id: "refused-1", refusal: "RATE_LIMIT_AI" }], error: null }),
      "ai",
    );
    expect(verdict).toEqual({ admitted: false, refusal: "RATE_LIMIT_AI", slotId: "refused-1" });
  });
});

describe("2H-RATE-005 — everything that is not an admission refuses", () => {
  const notAdmissions: ReadonlyArray<readonly [string, { data?: unknown; error?: unknown }]> = [
    ["a transport error", { data: null, error: { message: "network" } }],
    ["a null payload", { data: null, error: null }],
    ["an empty row set", { data: [], error: null }],
    ["a row that is not an object", { data: ["yes"], error: null }],
    ["a row with no verdict at all", { data: [{}], error: null }],
    ["a truthy-but-not-true admitted", { data: [{ admitted: "true" }], error: null }],
    ["admitted: 1", { data: [{ admitted: 1 }], error: null }],
    ["a refusal string this process does not know", { data: [{ admitted: false, refusal: "RATE_LIMIT_MOON" }], error: null }],
  ];

  for (const [name, response] of notAdmissions) {
    it(`refuses on ${name}`, async () => {
      const verdict = await claimRateLimitSlot(client(response), "ai");
      expect(verdict.admitted).toBe(false);
    });
  }

  it("refuses when the client throws instead of answering", async () => {
    const verdict = await claimRateLimitSlot(
      client(() => {
        throw new Error("connection reset");
      }),
      "upload",
    );
    expect(verdict).toEqual({ admitted: false, refusal: "RATE_LIMIT_STATE_UNAVAILABLE", slotId: null });
  });

  it("reports an unknown refusal as unavailable rather than as a ceiling", async () => {
    // The distinction matters for copy: telling somebody they reached a limit
    // when the limiter could not be read is the product inventing a fact.
    const verdict = readRateLimitVerdict(null, [{ admitted: false, refusal: "RATE_LIMIT_MOON" }]);
    expect(verdict).toEqual({
      admitted: false,
      refusal: "RATE_LIMIT_STATE_UNAVAILABLE",
      slotId: null,
    });
  });
});

describe("the discriminating control", () => {
  it("does not refuse everything", async () => {
    // Six refusals are satisfied equally by a limiter that refuses always, which
    // is a limiter that has broken the product. This is the control that makes
    // the assertions above mean what they say.
    const verdict = await claimRateLimitSlot(
      client({ data: [{ admitted: true, slot_id: null, refusal: null }], error: null }),
      "ai",
    );
    expect(verdict.admitted).toBe(true);
  });
});
