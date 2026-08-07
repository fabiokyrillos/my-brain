import { afterEach, describe, expect, it, vi } from "vitest";

import {
  classifyError,
  recordErrorEvent,
  resetSinkWriteFailures,
  sinkWriteFailures,
  SINK_WRITE_FAILED_MARKER,
} from "./error-sink";

/**
 * 2H-SINK-002 and 2H-SINK-003 at the application boundary.
 *
 * The assertions are about **what left the process**, not about return values.
 * A writer that classified correctly and then sent the original message anyway
 * would pass a return-value test and fail every one of these.
 */

afterEach(() => {
  resetSinkWriteFailures();
  vi.restoreAllMocks();
});

function recordingClient(behaviour: "ok" | "error" | "throw" = "ok") {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    client: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, ...args });
        if (behaviour === "throw") throw new Error("network down");
        if (behaviour === "error") return { data: null, error: { message: "boom", code: "XX000" } };
        return { data: "00000000-0000-4000-8000-000000000001", error: null };
      },
    } as never,
  };
}

describe("2H-SINK-002: nothing but the classification leaves the process", () => {
  it("sends only the four declared fields, and none of them is the message", async () => {
    const { client, calls } = recordingClient();
    const thrown = Object.assign(
      new Error('OpenAI: could not process "reuniao com a Maria sobre o orcamento"'),
      { status: 500 },
    );

    await recordErrorEvent(client, {
      surface: "server_action",
      operation: "capture_entry",
      error: thrown,
    });

    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0]).sort()).toEqual([
      "name",
      "p_correlation_id",
      "p_operation",
      "p_reason",
      "p_surface",
    ]);
    expect(calls[0].p_reason).toBe("provider_error");

    // The sentinel test: the user's own words, and the provider's message, are
    // nowhere in the payload — checked over the serialised call, so a field
    // added later cannot smuggle one in.
    const payload = JSON.stringify(calls[0]);
    for (const sentinel of ["Maria", "orcamento", "OpenAI", "could not process"]) {
      expect(payload, `"${sentinel}" reached the sink`).not.toContain(sentinel);
    }
  });

  it("mints a correlation id that is not derived from anything it was given", async () => {
    const { client, calls } = recordingClient();
    const sessionish = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.session-token";

    const first = await recordErrorEvent(client, {
      surface: "route_handler",
      operation: "chat_answer",
      error: { status: 500, message: sessionish },
    });
    const second = await recordErrorEvent(client, {
      surface: "route_handler",
      operation: "chat_answer",
      error: { status: 500, message: sessionish },
    });

    // T-2H-09: independent of any session value, and independent per call.
    expect(first.correlationId).not.toBe(second.correlationId);
    expect(JSON.stringify(calls)).not.toContain("eyJhbGci");
  });

  it("refuses a caller-supplied correlation id that is not a UUID", async () => {
    const { client, calls } = recordingClient();
    await recordErrorEvent(client, {
      surface: "worker",
      operation: "interpret_entry",
      reason: "timeout",
      correlationId: "session:abc123",
    });
    expect(calls[0].p_correlation_id).not.toBe("session:abc123");
    expect(String(calls[0].p_correlation_id)).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("uses a caller-supplied correlation id when it IS a UUID", async () => {
    // The calibration for the test above: the refusal is the shape check, not
    // the parameter being ignored.
    const { client, calls } = recordingClient();
    const given = "3f2a1c4e-0000-4000-8000-000000000009";
    await recordErrorEvent(client, {
      surface: "worker",
      operation: "interpret_entry",
      reason: "timeout",
      correlationId: given,
    });
    expect(calls[0].p_correlation_id).toBe(given);
  });
});

describe("2H-SINK-003: the writer cannot fail the operation that is already failing", () => {
  it("swallows an RPC error and counts it", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = recordingClient("error");

    const result = await recordErrorEvent(client, {
      surface: "server_action",
      operation: "capture_entry",
      reason: "provider_error",
    });

    expect(result.recorded).toBe(false);
    expect(result.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
    // A broken sink must be visible; silence is how a sink reads as "no errors".
    expect(sinkWriteFailures()).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(SINK_WRITE_FAILED_MARKER, expect.objectContaining({
      surface: "server_action",
      operation: "capture_entry",
      failures: 1,
    }));
  });

  it("swallows a thrown transport failure and counts it too", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = recordingClient("throw");

    await expect(
      recordErrorEvent(client, { surface: "worker", operation: "job_drain", reason: "timeout" }),
    ).resolves.toEqual(expect.objectContaining({ recorded: false }));
    expect(sinkWriteFailures()).toBe(1);
  });

  it("counts every failure, so a persistently broken sink is loud rather than quiet", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = recordingClient("error");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await recordErrorEvent(client, { surface: "worker", operation: "job_drain", reason: "timeout" });
    }
    expect(sinkWriteFailures()).toBe(5);
  });

  it("CONTROL: a working sink increments nothing", async () => {
    // Without this, the counter assertions above are satisfied by a counter
    // that increments on every call.
    const { client } = recordingClient("ok");
    await recordErrorEvent(client, { surface: "worker", operation: "job_drain", reason: "timeout" });
    expect(sinkWriteFailures()).toBe(0);
  });
});

describe("classifyError reduces anything to one declared reason", () => {
  it("reads the product's own declared refusals before anything generic", () => {
    // A quota refusal filed as a database fault would be lost among them, and
    // the ordering that prevents that is worth a test rather than a comment.
    expect(classifyError({ code: "P0001", detail: "QUOTA_ENTRIES_EXCEEDED" })).toBe("quota_exceeded");
    expect(classifyError({ code: "P0001", detail: "AUTH_EVENT_THROTTLED" })).toBe("throttled");
    expect(classifyError({ code: "P0001", detail: "ACCOUNT_LIFECYCLE_NOT_ACTIVE" }))
      .toBe("lifecycle_blocked");
  });

  it("maps the SQLSTATEs this product raises on purpose", () => {
    expect(classifyError({ code: "42501" })).toBe("permission_denied");
    expect(classifyError({ code: "22023" })).toBe("validation_failed");
    expect(classifyError({ code: "23514" })).toBe("validation_failed");
    expect(classifyError({ code: "55P03" })).toBe("conflict");
    expect(classifyError({ code: "57014" })).toBe("timeout");
  });

  it("files an unnamed SQLSTATE as a database error rather than as unclassified", () => {
    // Otherwise a whole class of database refusals disappears into the bucket
    // that means "we have no idea", and the sink stops distinguishing them.
    expect(classifyError({ code: "XX000" })).toBe("database_error");
  });

  it("maps HTTP statuses without reading the body", () => {
    expect(classifyError({ status: 429 })).toBe("provider_rate_limited");
    expect(classifyError({ status: 504 })).toBe("provider_timeout");
    expect(classifyError({ status: 503 })).toBe("provider_error");
    expect(classifyError({ status: 422 })).toBe("validation_failed");
  });

  it("answers for values that are not errors at all", () => {
    // It is called from `catch`, where the value can genuinely be anything.
    for (const value of [null, undefined, "boom", 42, [], new Error("boom")]) {
      expect(typeof classifyError(value)).toBe("string");
    }
    expect(classifyError(null)).toBe("unclassified");
    expect(classifyError("boom")).toBe("unclassified");
  });
});
