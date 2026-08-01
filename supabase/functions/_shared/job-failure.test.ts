import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  CONFIGURATION_FAILURE_CODES,
  classifyJobFailure,
  classifyProviderResponse,
  classifyTransportError,
  failJob,
  isJobFailureCode,
  isTerminalJobFailureCode,
  JOB_FAILURE_CODES,
  JobFailure,
  RETRYABLE_JOB_FAILURE_CODES,
  TERMINAL_JOB_FAILURE_CODES,
  type JobFailureCode,
} from "./job-failure.ts";

/**
 * `BYOK-JOBS-003`, `004` and `005` — executed, not asserted by construction.
 *
 * Gate D5 wants a configuration failure that consumes no retry and a transient
 * one that does; gate D6 wants `jobs.error` to carry no secret and no provider
 * text over every failure class. Both are properties of this module, so both are
 * proven here against a recording double rather than described in a report.
 */

// ---------------------------------------------------------------------------
// The vocabulary itself.
// ---------------------------------------------------------------------------

Deno.test("the vocabulary is closed, disjoint and free of anything that could carry a message", () => {
  const terminal = new Set<string>(TERMINAL_JOB_FAILURE_CODES);
  const retryable = new Set<string>(RETRYABLE_JOB_FAILURE_CODES);

  for (const code of terminal) {
    assert(!retryable.has(code), `${code} cannot be both terminal and retryable`);
  }
  assertEquals(JOB_FAILURE_CODES.length, terminal.size + retryable.size);
  assertEquals(new Set(JOB_FAILURE_CODES).size, JOB_FAILURE_CODES.length, "no duplicates");

  for (const code of JOB_FAILURE_CODES) {
    // A code is a slug. Anything that can hold an excerpt of the thing that
    // failed — whitespace, punctuation, a quote, a digit from a status line —
    // is exactly what this shape excludes.
    assert(
      /^[a-z][a-z_]{2,39}$/.test(code),
      `${code} must be a short lowercase slug, not prose`,
    );
  }
});

Deno.test("the configuration subset is a strict subset of the terminal set", () => {
  // If a configuration code were retryable, the worker would spend a retry
  // budget on a missing key. If it were not terminal at all, the entry would
  // never reach the awaiting state.
  for (const code of CONFIGURATION_FAILURE_CODES) {
    assert(
      (TERMINAL_JOB_FAILURE_CODES as readonly string[]).includes(code),
      `${code} is a configuration failure and must be terminal`,
    );
  }
  assert(CONFIGURATION_FAILURE_CODES.size < TERMINAL_JOB_FAILURE_CODES.length);

  // The five credential states plus the owner's quota decision (`BYOK-DEC-10`).
  assertEquals(CONFIGURATION_FAILURE_CODES.size, 6);
});

Deno.test("isJobFailureCode refuses anything outside the list", () => {
  for (const code of JOB_FAILURE_CODES) assert(isJobFailureCode(code));
  for (
    const value of [
      "",
      "Credential_Required",
      "credential_required ",
      "OpenAI entry extraction failed with 401",
      "sk-proj-0000000000000000",
      null,
      undefined,
      42,
      { code: "credential_required" },
    ]
  ) {
    assert(!isJobFailureCode(value), `${String(value)} must not pass as a declared code`);
  }
});

// ---------------------------------------------------------------------------
// Classification.
// ---------------------------------------------------------------------------

Deno.test("an unclassified throw becomes unexpected_error, and unexpected_error retries", () => {
  // Deliberately including the shapes that used to reach `jobs.error` verbatim.
  for (
    const thrown of [
      new Error("OpenAI entry extraction failed with 401 sk-proj-real-looking-key"),
      new SyntaxError('Unexpected token < in JSON at position 0: "<html>…"'),
      { code: "23505", message: "duplicate key value violates unique constraint" },
      "a bare string",
      null,
    ]
  ) {
    const code = classifyJobFailure(thrown);
    assertStrictEquals(code, "unexpected_error");
    assert(!isTerminalJobFailureCode(code), "an unknown failure must remain retryable");
  }
});

Deno.test("a JobFailure keeps its code, across realms", () => {
  assertStrictEquals(classifyJobFailure(new JobFailure("invalid_key")), "invalid_key");
  // The structural arm, for a `JobFailure` that failed `instanceof` — but only
  // when the code is declared. A `{ code }` carrying prose must not slip through.
  assertStrictEquals(classifyJobFailure({ code: "revoked" }), "revoked");
  assertStrictEquals(
    classifyJobFailure({ code: "the provider said: invalid api key sk-proj-x" }),
    "unexpected_error",
  );
});

Deno.test("a JobFailure's own message is a declared code, so even error.message is safe", () => {
  // Belt-and-braces, and the reason it matters: a future handler that reverts to
  // `p_error: error.message` still writes a code rather than prose.
  for (const code of JOB_FAILURE_CODES) {
    assertStrictEquals(new JobFailure(code).message, code);
  }
});

Deno.test("provider responses classify by status, and 429 is split by body", async () => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  assertStrictEquals(await classifyProviderResponse(new Response(null, { status: 401 })), "invalid_key");
  assertStrictEquals(await classifyProviderResponse(new Response(null, { status: 403 })), "revoked");
  assertStrictEquals(await classifyProviderResponse(new Response(null, { status: 500 })), "provider_unavailable");
  assertStrictEquals(await classifyProviderResponse(new Response(null, { status: 503 })), "provider_unavailable");
  assertStrictEquals(await classifyProviderResponse(new Response(null, { status: 400 })), "provider_response_invalid");

  // The split that the status alone cannot make. Both spellings OpenAI uses.
  assertStrictEquals(
    await classifyProviderResponse(json(429, { error: { code: "insufficient_quota" } })),
    "insufficient_quota",
  );
  assertStrictEquals(
    await classifyProviderResponse(json(429, { error: { type: "insufficient_quota" } })),
    "insufficient_quota",
  );
  assertStrictEquals(
    await classifyProviderResponse(json(429, { error: { code: "rate_limit_exceeded" } })),
    "rate_limited",
  );

  // An unreadable body falls to the retryable reading — the one that cannot
  // strand a job that would have succeeded.
  assertStrictEquals(
    await classifyProviderResponse(new Response("not json", { status: 429 })),
    "rate_limited",
  );

  // And the retry policy that follows from all of it.
  assert(isTerminalJobFailureCode("invalid_key"));
  assert(isTerminalJobFailureCode("insufficient_quota"));
  assert(!isTerminalJobFailureCode("rate_limited"));
  assert(!isTerminalJobFailureCode("provider_unavailable"));
});

Deno.test("classifyProviderResponse leaves the caller's response body readable", async () => {
  // It clones before reading. Without that, the 429 branch would consume the
  // body and a caller that wanted it afterwards would get an empty stream — a
  // bug that would only appear on the rate-limited path.
  const response = new Response(JSON.stringify({ error: { code: "rate_limit_exceeded" } }), {
    status: 429,
  });
  await classifyProviderResponse(response);
  assertEquals(await response.json(), { error: { code: "rate_limit_exceeded" } });
});

Deno.test("transport failures classify by shape, never by message", () => {
  const timeout = new DOMException("Signal timed out.", "TimeoutError");
  assertStrictEquals(classifyTransportError(timeout), "provider_transport");

  const aborted = new Error("aborted");
  aborted.name = "AbortError";
  assertStrictEquals(classifyTransportError(aborted), "provider_transport");

  // A rejected `fetch` in Deno is a TypeError whose message names the host.
  const rejected = new TypeError("error sending request for url (https://api.openai.com/v1/responses)");
  assertStrictEquals(classifyTransportError(rejected), "provider_transport");

  assertStrictEquals(classifyTransportError(new RangeError("nope")), "unexpected_error");
  assertStrictEquals(classifyTransportError(new JobFailure("revoked")), "revoked");
});

// ---------------------------------------------------------------------------
// `failJob` — the routing that makes the retry policy real.
// ---------------------------------------------------------------------------

type RecordedCall = { name: string; args: Record<string, unknown> };

function recordingService(result: { data?: unknown; error?: { code: string } | null } = {}) {
  const calls: RecordedCall[] = [];
  // `"data" in result` rather than `result.data ??`: the lost-lease case is
  // *explicitly* `null`, and a nullish default would have silently replaced it
  // with a success. The first draft of this double did exactly that and made the
  // lease test pass against the wrong value.
  const overridden = Object.prototype.hasOwnProperty.call(result, "data");
  const service = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve({
        data: overridden
          ? result.data
          : { status: name === "fail_job_terminal" ? "exhausted" : "failed" },
        error: result.error ?? null,
      });
    },
    // deno-lint-ignore no-explicit-any
  } as any;
  return { service, calls };
}

Deno.test("a terminal code goes to fail_job_terminal and schedules nothing", async () => {
  for (const code of TERMINAL_JOB_FAILURE_CODES) {
    const { service, calls } = recordingService();
    const outcome = await failJob(service, {
      jobId: "job-1",
      workerId: "worker-1",
      code,
      baseDelaySeconds: 60,
    });

    assertEquals(calls.length, 1);
    assertStrictEquals(calls[0].name, "fail_job_terminal", `${code} must not be rescheduled`);
    // The RPC has no delay parameter at all, which is what makes "consumes no
    // retry" a property of the signature rather than of the caller remembering.
    assert(!("p_base_delay_seconds" in calls[0].args));
    assertStrictEquals(outcome?.terminal, true);
    assertStrictEquals(outcome?.status, "exhausted");
  }
});

Deno.test("a retryable code goes to fail_job with its backoff intact", async () => {
  for (const code of RETRYABLE_JOB_FAILURE_CODES) {
    const { service, calls } = recordingService();
    const outcome = await failJob(service, {
      jobId: "job-1",
      workerId: "worker-1",
      code,
      baseDelaySeconds: 60,
    });

    assertEquals(calls.length, 1);
    assertStrictEquals(calls[0].name, "fail_job", `${code} must keep its retry budget`);
    assertStrictEquals(calls[0].args.p_base_delay_seconds, 60);
    assertStrictEquals(outcome?.terminal, false);
  }
});

Deno.test("p_error receives the code and nothing else, on every path", async () => {
  // Gate D6, stated as an exhaustive property rather than a sample.
  for (const code of JOB_FAILURE_CODES) {
    const { service, calls } = recordingService();
    await failJob(service, { jobId: "job-1", workerId: "worker-1", code, baseDelaySeconds: 60 });

    assertStrictEquals(calls[0].args.p_error, code);
    // Nothing else in the argument list may be free text either.
    for (const [name, value] of Object.entries(calls[0].args)) {
      if (name === "p_error") continue;
      if (typeof value !== "string") continue;
      assert(
        !/\s/.test(value),
        `${name} carried something that reads like a sentence: ${value}`,
      );
    }
  }
});

Deno.test("a lost lease and an RPC error both report as no outcome", async () => {
  const lost = recordingService({ data: null });
  assertStrictEquals(
    await failJob(lost.service, {
      jobId: "job-1",
      workerId: "worker-1",
      code: "rate_limited",
      baseDelaySeconds: 60,
    }),
    null,
  );

  const failed = recordingService({ error: { code: "42501" } });
  assertStrictEquals(
    await failJob(failed.service, {
      jobId: "job-1",
      workerId: "worker-1",
      code: "credential_required",
      baseDelaySeconds: 60,
    }),
    null,
  );

  // And an unrecognised status is not trusted either: `fail_job_terminal` could
  // only return `exhausted`, so anything else means the contract moved.
  const strange = recordingService({ data: { status: "somehow_running" } });
  assertStrictEquals(
    await failJob(strange.service, {
      jobId: "job-1",
      workerId: "worker-1",
      code: "invalid_key" as JobFailureCode,
      baseDelaySeconds: 60,
    }),
    null,
  );
});
