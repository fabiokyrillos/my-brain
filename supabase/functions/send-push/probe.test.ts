import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";

import { base64UrlEncode, createVapidAuthorization } from "../_shared/web-push.ts";
import { APPLE_PUSH_ORIGIN, corruptVapidSignature, probeVapid, probeVariants } from "./probe.ts";
import type { SenderConfig } from "./deliver.ts";

/**
 * The device-free probe, proved without a network.
 *
 * Run 1 of this probe concluded "our VAPID is rejected" from two requests that
 * both named a fabricated resource, and it was wrong to be that sure: a service
 * that answers the same thing to anything it cannot find would have produced the
 * identical reading. Most of what follows therefore asserts that the verdict
 * stays `inconclusive` — including in the cases that look most like an answer.
 *
 * **A probe that over-concludes is worse than no probe**, because it retires a
 * hypothesis on evidence that never supported it.
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

type Seen = { url: string; authorization: string | null; body: Uint8Array };

/** Answers the five requests in order, recording exactly what went out. */
function scriptedFetch(answers: readonly Response[] | ((index: number) => Response)) {
  const seen: Seen[] = [];
  const spy: typeof fetch = ((url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    const index = seen.length;
    seen.push({
      url,
      authorization: headers.get("Authorization"),
      body: new Uint8Array(init.body as ArrayBuffer),
    });
    const answer = typeof answers === "function"
      ? answers(index)
      : answers[Math.min(index, answers.length - 1)];
    return Promise.resolve(answer);
  }) as unknown as typeof fetch;
  return { seen, fetch: spy };
}

const json = (reason: string, status: number) => new Response(JSON.stringify({ reason }), { status });

/** The five, in the order `probeVapid` sends them. */
const ORDER = ["real", "corrupted", "absent", "ephemeral", "expired"] as const;
const at = (variant: (typeof ORDER)[number]) => ORDER.indexOf(variant);

function probed(report: Awaited<ReturnType<typeof probeVapid>>) {
  assertEquals("verdict" in report, true, "the probe refused instead of running");
  if (!("verdict" in report)) throw new Error("unreachable");
  return report;
}

const reasonOf = (report: ReturnType<typeof probed>, variant: string) =>
  report.answers.find((answer) => answer.variant === variant)?.reason;

function run(answers: (index: number) => Response) {
  return (async () => {
    const { fetch, seen } = scriptedFetch(answers);
    const report = probed(await probeVapid({
      config: await vapidConfig(),
      fetch,
      nowSeconds: () => 1_800_000_000,
    }));
    return { report, seen };
  })();
}

Deno.test("the five variants are sent in a known order, and only ONE of them omits the token", async () => {
  const { report, seen } = await run(() => json("BadSubscription", 404));
  assertEquals(report.answers.map((answer) => answer.variant), [...ORDER]);
  assertEquals(seen.length, 5);

  // The control that decides whether any other reading means anything must
  // differ from `real` in exactly one way: no Authorization header.
  assertEquals(seen[at("absent")].authorization, null);
  for (const variant of ["real", "corrupted", "ephemeral", "expired"] as const) {
    assertEquals(typeof seen[at(variant)].authorization, "string", variant);
  }
  // Everything else about the request is identical, including the endpoint.
  assertEquals(new Set(seen.map((s) => s.url)).size, 1);
  // The real and the corrupted token differ only in their signature.
  assertNotEquals(seen[at("real")].authorization, seen[at("corrupted")].authorization);
  assertEquals(
    seen[at("real")].authorization!.split(".").slice(0, 2).join("."),
    seen[at("corrupted")].authorization!.split(".").slice(0, 2).join("."),
  );
  // The ephemeral variant advertises a DIFFERENT key from the configured one.
  assertNotEquals(
    seen[at("real")].authorization!.split(", k=")[1],
    seen[at("ephemeral")].authorization!.split(", k=")[1],
  );
  // ...and the expired one shares that fresh key, so exp is its only difference.
  assertEquals(
    seen[at("ephemeral")].authorization!.split(", k=")[1],
    seen[at("expired")].authorization!.split(", k=")[1],
  );
});

Deno.test("THE control: if the unauthenticated request draws the same answer, nothing is concluded", async () => {
  /*
   * Run 1's blind spot, made into an assertion. `BadJwtToken` to every request
   * — including one carrying no token at all — is a service answering about the
   * fabricated resource, not about our credentials.
   */
  const { report } = await run(() => json("BadJwtToken", 403));
  assertEquals(report.verdict, "inconclusive");
  assertEquals(report.signals.includes("answer_does_not_depend_on_token"), true);
  // The rejection is still visible; it is simply not evidence.
  assertEquals(report.signals.includes("real_rejected_as_vapid"), true);
});

Deno.test("the construction is blamed only when a freshly generated, valid identity is rejected too", async () => {
  const { report } = await run((index) =>
    index === at("absent")
      ? json("MissingProviderToken", 401)
      : index === at("expired")
      ? json("ExpiredProviderToken", 403)
      : json("BadJwtToken", 403)
  );
  assertEquals(report.verdict, "construction_rejected");
  assertEquals(report.signals.includes("answer_does_not_depend_on_token"), false);
  assertEquals(report.signals.includes("service_validates_claims"), true);
  assertEquals(report.signals.includes("ephemeral_rejected_as_vapid"), true);
});

Deno.test("the configured key is blamed only when a fresh one gets PAST authentication", async () => {
  const { report } = await run((index) =>
    index === at("absent")
      ? json("MissingProviderToken", 401)
      : index === at("ephemeral")
      ? json("BadSubscription", 404)
      : index === at("expired")
      ? json("ExpiredProviderToken", 403)
      : json("BadJwtToken", 403)
  );
  assertEquals(report.verdict, "configured_key_rejected");
  assertEquals(reasonOf(report, "ephemeral"), "BadSubscription");
});

Deno.test("a rejection the controls cannot attribute stays unresolved rather than becoming a cause", async () => {
  const { report } = await run((index) =>
    index === at("absent")
      ? json("MissingProviderToken", 401)
      // The fresh identity draws an answer that belongs to NEITHER closed set,
      // so it cannot separate "the key we hold" from "the token we build".
      : index === at("ephemeral")
      ? json("ServiceUnavailable", 503)
      : json("BadJwtToken", 403)
  );
  // The rejection is real and unattributed, and says so in its own name rather
  // than defaulting to whichever repair happens to be nearest.
  assertEquals(report.verdict, "vapid_rejected_cause_unresolved");
  assertEquals(report.signals.includes("ephemeral_rejected_as_vapid"), false);
});

Deno.test("an answer the FABRICATED PATH could have caused never becomes a verdict", async () => {
  for (const reason of ["BadSubscription", "BadDeviceToken", "Unregistered"]) {
    const { report } = await run((index) =>
      index === at("absent") ? json("MissingProviderToken", 401) : json(reason, 404)
    );
    assertEquals(report.verdict, "inconclusive", reason);
    assertEquals(report.signals.includes("real_answered_about_resource"), true, reason);
  }
});

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
  assertNotEquals(corrupted, authorization);
  assertEquals(corrupted!.split(", k=")[1], authorization.split(", k=")[1]);
  assertEquals(corruptVapidSignature("vapid t=nonsense, k=abc"), null);
  assertEquals(corruptVapidSignature("Bearer something"), null);
});

Deno.test("a reason outside the closed set collapses, and cannot carry the body with it", async () => {
  const MARKERS = {
    rawProse: "Forbidden: JWT for ops@my-brain.app at https://web.push.apple.com/SUB-PATH failed",
    unknownToken: "SomeReasonAppleNeverDocumented",
    endpointInBody: "https://web.push.apple.com/ENDPOINT-MARKER",
    email: "ops@leak-marker.example",
  };
  const bodies = [
    new Response(MARKERS.rawProse, { status: 403 }),
    new Response(JSON.stringify({ reason: MARKERS.unknownToken }), { status: 403 }),
    new Response(JSON.stringify({ reason: MARKERS.endpointInBody }), { status: 403 }),
    new Response(JSON.stringify({ reason: MARKERS.email, error: MARKERS.endpointInBody }), { status: 403 }),
    new Response(JSON.stringify({ reason: { nested: "BadJwtToken" } }), { status: 403 }),
    new Response(JSON.stringify(["BadJwtToken"]), { status: 403 }),
    new Response(`{"reason":"BadJwtToken","pad":"${"x".repeat(4096)}"}`, { status: 403 }),
  ];

  for (const body of bodies) {
    const { fetch } = scriptedFetch(() => body.clone());
    const report = probed(await probeVapid({
      config: await vapidConfig(),
      fetch,
      nowSeconds: () => 1_800_000_000,
    }));
    assertEquals(reasonOf(report, "real"), "vendor_unknown");
    assertEquals(report.verdict, "inconclusive");
    const observed = JSON.stringify(report);
    for (const [name, marker] of Object.entries(MARKERS)) {
      assertEquals(observed.includes(marker), false, `${name} leaked out of the reason parser`);
    }
  }
});

Deno.test("the report names no endpoint, no path, no key and no token", async () => {
  const config = await vapidConfig();
  const { fetch, seen } = scriptedFetch(() => json("BadJwtToken", 403));
  const report = probed(await probeVapid({ config, fetch, nowSeconds: () => 1_800_000_000 }));

  const observed = JSON.stringify(report);
  const path = new URL(seen[0].url).pathname;
  assertEquals(path.length > 1, true);
  assertEquals(observed.includes(path.slice(1)), false, "the fabricated path leaked");
  assertEquals(observed.includes(config.vapidPublicKey), false, "the public key leaked");
  assertEquals(observed.includes(config.vapidPrivateKey), false, "the private key leaked");
  assertEquals(observed.includes(config.vapidSubject), false, "the subject leaked");
  assertEquals(observed.includes("ops@"), false, "an address leaked");
  assertEquals(observed.includes(seen[0].authorization!), false, "the token leaked");
  assertEquals(report.origin, APPLE_PUSH_ORIGIN);
});

Deno.test("every probe is ephemeral: a second run reuses no path, no recipient and no fresh key", async () => {
  const config = await vapidConfig();
  const first = scriptedFetch(() => json("BadJwtToken", 403));
  const second = scriptedFetch(() => json("BadJwtToken", 403));
  await probeVapid({ config, fetch: first.fetch, nowSeconds: () => 1_800_000_000 });
  await probeVapid({ config, fetch: second.fetch, nowSeconds: () => 1_800_000_000 });

  assertNotEquals(first.seen[0].url, second.seen[0].url);
  assertNotEquals(base64UrlEncode(first.seen[0].body), base64UrlEncode(second.seen[0].body));
  // The throwaway application-server identity is new every time too, or two runs
  // would be one experiment repeated.
  assertNotEquals(
    first.seen[at("ephemeral")].authorization!.split(", k=")[1],
    second.seen[at("ephemeral")].authorization!.split(", k=")[1],
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
  const { report } = await run(() => {
    throw new TypeError("dns");
  });
  assertEquals(reasonOf(report, "real"), "vendor_absent");
  assertEquals(report.answers[0].status, 0);
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

Deno.test("the variant vocabulary is closed and matches what is actually sent", async () => {
  assertEquals([...probeVariants], [...ORDER]);
  assertEquals(new Set(probeVariants).size, probeVariants.length);
});
