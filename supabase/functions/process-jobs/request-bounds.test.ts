import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";

import { MAX_REQUEST_BODY_BYTES, readBoundedBody } from "./request-bounds.ts";

/**
 * SH-QUOTA-008 — `process-jobs` refuses an oversized body before parsing it.
 *
 * ## What each case is actually guarding
 *
 * The bound has two halves and they fail differently. The `Content-Length`
 * check is the cheap one and can be defeated simply by not sending the header;
 * the measured-bytes check is the real one and costs a read. A test that only
 * exercised the header would pass against an implementation with no bound at
 * all for any chunked request, which is why the second case below constructs a
 * request whose header is absent.
 *
 * Runs with no `--allow-*` flags, like every other test in this directory.
 */

function bodyOf(size: number): string {
  // A JSON document of a known encoded size, so "just under" and "just over"
  // mean exactly that rather than approximately.
  const padding = "x".repeat(size - '{"jobId":""}'.length);
  return `{"jobId":"${padding}"}`;
}

Deno.test("a body at the limit is accepted", async () => {
  const raw = bodyOf(MAX_REQUEST_BODY_BYTES);
  assertEquals(new TextEncoder().encode(raw).length, MAX_REQUEST_BODY_BYTES);

  const parsed = await readBoundedBody(
    new Request("https://worker.test", { method: "POST", body: raw }),
  );
  assertNotEquals(parsed, null);
});

Deno.test("a body one byte over the limit is refused", async () => {
  const raw = bodyOf(MAX_REQUEST_BODY_BYTES + 1);
  const parsed = await readBoundedBody(
    new Request("https://worker.test", { method: "POST", body: raw }),
  );
  assertEquals(parsed, null, "the equality boundary must refuse at limit + 1");
});

Deno.test("an oversized Content-Length is refused without reading the body", async () => {
  // The header is a claim, and refusing on it is what makes the common case
  // cheap. `body` is deliberately small so that only the header can be the
  // reason this is refused.
  const request = new Request("https://worker.test", {
    method: "POST",
    body: '{"mode":"dispatch"}',
    headers: { "content-length": String(MAX_REQUEST_BODY_BYTES + 1) },
  });
  assertEquals(await readBoundedBody(request), null);
});

Deno.test("a missing Content-Length does not opt out of the bound", async () => {
  // A chunked request carries no length. If the header were the whole bound,
  // omitting it would be the bypass.
  const raw = bodyOf(MAX_REQUEST_BODY_BYTES + 512);
  const request = new Request("https://worker.test", { method: "POST", body: raw });
  request.headers.delete("content-length");
  assertEquals(request.headers.get("content-length"), null);
  assertEquals(await readBoundedBody(request), null);
});

Deno.test("the two real request shapes still parse", async () => {
  const dispatch = await readBoundedBody(
    new Request("https://worker.test", { method: "POST", body: '{"mode":"dispatch"}' }),
  );
  assertEquals(dispatch?.mode, "dispatch");

  const direct = await readBoundedBody(
    new Request("https://worker.test", {
      method: "POST",
      body: '{"jobId":"11111111-2222-4333-8444-555555555555"}',
    }),
  );
  assertEquals(direct?.jobId, "11111111-2222-4333-8444-555555555555");
});

Deno.test("malformed and empty bodies stay the pre-existing empty object", async () => {
  // Not `null`: conflating "unparseable" with "too large" would tell a caller
  // which of the two it tripped, and the previous behaviour was already to
  // fall through to the same refusal.
  assertEquals(
    await readBoundedBody(new Request("https://worker.test", { method: "POST", body: "not json" })),
    {},
  );
  assertEquals(
    await readBoundedBody(new Request("https://worker.test", { method: "POST", body: "" })),
    {},
  );
  assertEquals(
    await readBoundedBody(new Request("https://worker.test", { method: "POST", body: "[1,2,3]" })),
    {},
  );
});
