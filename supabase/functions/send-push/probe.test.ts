import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";

import { base64UrlEncode, createVapidAuthorization } from "../_shared/web-push.ts";
import { APPLE_PUSH_ORIGIN, corruptVapidSignature, probeVapid } from "./probe.ts";
import type { SenderConfig } from "./deliver.ts";

/**
 * The device-free probe, proved without a network.
 *
 * Two hardware runs spent two of the owner's three strikes to learn one number.
 * This file's job is to make sure the thing that replaces them cannot make the
 * same mistake in the other direction: **a probe that over-concludes is worse
 * than no probe**, because it would retire a hypothesis on evidence that never
 * supported it. So most of what follows asserts that the verdict stays
 * `inconclusive` — including in the case that looks most like an answer.
 */

async function vapidConfig(): Promise<SenderConfig> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return {
    vapidPublicKey: base64UrlEncode(raw),
    vapidPrivateKey: jwk.d as string,
    vapidSubject: "mailto:ops@push-fixture.dev",
  };
}

type Seen = { url: string; authorization: string; body: Uint8Array };

/** Answers each request in order, recording exactly what went out. */
function scriptedFetch(answers: readonly Response[]) {
  const seen: Seen[] = [];
  const spy: typeof fetch = ((url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    seen.push({
      url,
      authorization: headers.get("Authorization") ?? "",
      body: new Uint8Array(init.body as ArrayBuffer),
    });
    return Promise.resolve(answers[Math.min(seen.length - 1, answers.length - 1)]);
  }) as unknown as typeof fetch;
  return { seen, fetch: spy };
}

const json = (reason: string, status: number) => new Response(JSON.stringify({ reason }), { status });

function probed(report: Awaited<ReturnType<typeof probeVapid>>) {
  assertEquals("verdict" in report, true, "the probe refused instead of running");
  if (!("verdict" in report)) throw new Error("unreachable");
  return report;
}

Deno.test("the negative control really mutates the token, and says so when it cannot", async () => {
  const config = await vapidConfig();
  const authorization = await createVapidAuthorization({
    endpoint: `${APPLE_PUSH_ORIGIN}/abc`,
    publicKey: config.vapidPublicKey,
    privateKey: config.vapidPrivateKey,
    subject: config.vapidSubject,
    expiresAtSeconds: 1_800_000_000,
  });

  const corrupted = corruptVapidSignature(authorization);
  assertNotEquals(corrupted, null);
  // Different from the original — the whole worth of a negative control.
  assertNotEquals(corrupted, authorization);
  // And different ONLY in the signature: same claims, same advertised key, so
  // what a service rejects can only be the signature itself.
  const [realHead, realKey] = [authorization.split(".").slice(0, 2).join("."), authorization.split(", k=")[1]];
  assertEquals(corrupted!.startsWith(realHead), true);
  assertEquals(corrupted!.split(", k=")[1], realKey);

  // A header it cannot take apart yields `null` rather than an unmutated copy
  // silently passed off as a control.
  assertEquals(corruptVapidSignature("vapid t=nonsense, k=abc"), null);
  assertEquals(corruptVapidSignature("Bearer something"), null);
});

Deno.test("BOTH answering 403 is NOT enough to conclude the VAPID was rejected", async () => {
  /*
   * The inference this residual has already been tempted into twice. A
   * fabricated path can produce a 403 on its own, and a status is not a reason.
   */
  const { fetch, seen } = scriptedFetch([new Response(null, { status: 403 })]);
  const report = probed(await probeVapid({
    config: await vapidConfig(),
    fetch,
    nowSeconds: () => 1_800_000_000,
  }));

  assertEquals(report.real.status, 403);
  assertEquals(report.control.status, 403);
  assertEquals(report.verdict, "inconclusive");
  assertEquals(report.signals, ["no_vapid_signal"]);
  assertEquals(report.mutation, "applied");
  // The control was genuinely a different request on the wire, not the same one
  // sent twice.
  assertEquals(seen.length, 2);
  assertNotEquals(seen[0].authorization, seen[1].authorization);
});

Deno.test("the ONE conclusive verdict needs the service to NAME an authentication failure", async () => {
  for (const reason of ["BadJwtToken", "InvalidProviderToken", "ExpiredProviderToken", "MissingProviderToken"]) {
    const { fetch } = scriptedFetch([json(reason, 403)]);
    const report = probed(await probeVapid({
      config: await vapidConfig(),
      fetch,
      nowSeconds: () => 1_800_000_000,
    }));
    assertEquals(report.verdict, "vapid_rejected", reason);
    assertEquals(report.signals.includes("real_rejected_as_vapid"), true, reason);
  }
});

Deno.test("an answer the FABRICATED PATH could have caused stays inconclusive", async () => {
  /*
   * `BadSubscription` for a resource we invented is exactly what a healthy
   * service should say, and it is suggestive that the token got past
   * authentication — but the path is ours, so the answer is about our path. It
   * is recorded as a SIGNAL and never as a verdict.
   */
  for (const reason of ["BadSubscription", "BadDeviceToken", "Unregistered"]) {
    const { fetch } = scriptedFetch([json(reason, 404)]);
    const report = probed(await probeVapid({
      config: await vapidConfig(),
      fetch,
      nowSeconds: () => 1_800_000_000,
    }));
    assertEquals(report.verdict, "inconclusive", reason);
    assertEquals(report.signals.includes("real_answered_about_resource"), true, reason);
    assertEquals(report.signals.includes("real_rejected_as_vapid"), false, reason);
  }
});

Deno.test("a reason outside the closed set collapses, and cannot carry the body with it", async () => {
  const MARKERS = {
    rawProse: "Forbidden: JWT for ops@my-brain.app at https://web.push.apple.com/SUB-PATH failed",
    unknownToken: "SomeReasonAppleNeverDocumented",
    endpointInBody: "https://web.push.apple.com/ENDPOINT-MARKER",
    email: "ops@leak-marker.example",
  };
  const bodies = [
    // Not JSON at all, and carrying a valid token inside prose.
    new Response(MARKERS.rawProse, { status: 403 }),
    // JSON, but the reason is not on the list.
    new Response(JSON.stringify({ reason: MARKERS.unknownToken }), { status: 403 }),
    // JSON whose reason field is an endpoint, an e-mail, or an object.
    new Response(JSON.stringify({ reason: MARKERS.endpointInBody }), { status: 403 }),
    new Response(JSON.stringify({ reason: MARKERS.email, error: MARKERS.endpointInBody }), { status: 403 }),
    new Response(JSON.stringify({ reason: { nested: "BadJwtToken" } }), { status: 403 }),
    // A JSON array, and a body far too large to be a reason document.
    new Response(JSON.stringify(["BadJwtToken"]), { status: 403 }),
    new Response(`{"reason":"BadJwtToken","pad":"${"x".repeat(4096)}"}`, { status: 403 }),
  ];

  for (const body of bodies) {
    const { fetch } = scriptedFetch([body]);
    const report = probed(await probeVapid({
      config: await vapidConfig(),
      fetch,
      nowSeconds: () => 1_800_000_000,
    }));
    assertEquals(report.real.reason, "vendor_unknown");
    assertEquals(report.verdict, "inconclusive");
    const observed = JSON.stringify(report);
    for (const [name, marker] of Object.entries(MARKERS)) {
      assertEquals(observed.includes(marker), false, `${name} leaked out of the reason parser`);
    }
  }
});

Deno.test("the report names no endpoint, no path, no key and no token", async () => {
  const config = await vapidConfig();
  const { fetch, seen } = scriptedFetch([json("BadJwtToken", 403)]);
  const report = probed(await probeVapid({ config, fetch, nowSeconds: () => 1_800_000_000 }));

  const observed = JSON.stringify(report);
  // The fabricated path was really sent, and really is absent from the report.
  const path = new URL(seen[0].url).pathname;
  assertEquals(path.length > 1, true);
  assertEquals(observed.includes(path.slice(1)), false, "the fabricated path leaked");
  assertEquals(observed.includes(config.vapidPublicKey), false, "the public key leaked");
  assertEquals(observed.includes(config.vapidPrivateKey), false, "the private key leaked");
  assertEquals(observed.includes(config.vapidSubject), false, "the subject leaked");
  assertEquals(observed.includes("ops@"), false, "an address leaked");
  assertEquals(observed.includes(seen[0].authorization), false, "the token leaked");
  // The origin — a vendor's public address — is the one thing it does carry.
  assertEquals(report.origin, APPLE_PUSH_ORIGIN);
});

Deno.test("every probe is ephemeral: a second run reuses no path and no recipient", async () => {
  const config = await vapidConfig();
  const first = scriptedFetch([json("BadJwtToken", 403)]);
  const second = scriptedFetch([json("BadJwtToken", 403)]);
  await probeVapid({ config, fetch: first.fetch, nowSeconds: () => 1_800_000_000 });
  await probeVapid({ config, fetch: second.fetch, nowSeconds: () => 1_800_000_000 });

  assertNotEquals(first.seen[0].url, second.seen[0].url);
  // The recipient keys are generated per call and never stored, so the
  // ciphertext cannot repeat either.
  assertNotEquals(
    base64UrlEncode(first.seen[0].body),
    base64UrlEncode(second.seen[0].body),
  );
});

Deno.test("the probe obeys the same egress allowlist the delivery path does", async () => {
  let fetched = 0;
  const report = await probeVapid({
    config: await vapidConfig(),
    fetch: (() => {
      fetched += 1;
      return Promise.resolve(new Response(null, { status: 201 }));
    }) as unknown as typeof fetch,
    nowSeconds: () => 1_800_000_000,
    // MUTATION CONTROL: an allowlist that admits nothing must stop the probe.
    allowedHosts: [/^nothing\.example\.test$/],
  });
  assertEquals(fetched, 0);
  assertEquals(report, { status: "vapid_probe", refused: "host_not_allowed" });
});

Deno.test("a transport failure is an answer the probe can report, not a throw", async () => {
  const report = probed(await probeVapid({
    config: await vapidConfig(),
    fetch: (() => Promise.reject(new TypeError("dns"))) as unknown as typeof fetch,
    nowSeconds: () => 1_800_000_000,
  }));
  assertEquals(report.real, { status: 0, reason: "vendor_absent" });
  assertEquals(report.verdict, "inconclusive");
});

Deno.test("a malformed VAPID pair refuses before any request is made", async () => {
  let fetched = 0;
  const report = await probeVapid({
    config: { vapidPublicKey: "not-a-key", vapidPrivateKey: "nor-this", vapidSubject: "mailto:ops@x.dev" },
    fetch: (() => {
      fetched += 1;
      return Promise.resolve(new Response(null, { status: 201 }));
    }) as unknown as typeof fetch,
    nowSeconds: () => 1_800_000_000,
  });
  assertEquals(fetched, 0);
  assertEquals(report, { status: "vapid_probe", refused: "vapid_key_malformed" });
});
