import { describe, expect, it, vi } from "vitest";
import { kickEntryInterpretationWorker } from "./entry-worker";

const jobId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";

function clientWithSession(invokeResult: { data: unknown; error: unknown } = { data: { ok: true }, error: null }) {
  const invoke = vi.fn().mockResolvedValue(invokeResult);
  return {
    client: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "access-token" } }, error: null }),
      },
      functions: { invoke },
    },
    invoke,
  };
}

describe("kickEntryInterpretationWorker", () => {
  it("invokes process-jobs with the job id and the caller's bearer token", async () => {
    const { client, invoke } = clientWithSession();

    await kickEntryInterpretationWorker(client as never, jobId);

    expect(invoke).toHaveBeenCalledWith("process-jobs", {
      body: { jobId },
      headers: { authorization: "Bearer access-token" },
    });
  });

  it("does nothing when there is no active session", async () => {
    const invoke = vi.fn();
    const client = {
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) },
      functions: { invoke },
    };

    await kickEntryInterpretationWorker(client as never, jobId);

    expect(invoke).not.toHaveBeenCalled();
  });

  it("swallows a failed invoke instead of throwing", async () => {
    const { client } = clientWithSession({ data: null, error: { message: "boom" } });

    await expect(kickEntryInterpretationWorker(client as never, jobId)).resolves.toBeUndefined();
  });

  it("swallows a thrown error instead of propagating it to the caller", async () => {
    const client = {
      auth: { getSession: vi.fn().mockRejectedValue(new Error("network down")) },
      functions: { invoke: vi.fn() },
    };

    await expect(kickEntryInterpretationWorker(client as never, jobId)).resolves.toBeUndefined();
  });
});
