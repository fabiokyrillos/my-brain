import { assertEquals } from "jsr:@std/assert@1";

import {
  deliverPush,
  isAllowedPushHost,
  parseDeliveryRequest,
  recordSuppression,
} from "./deliver.ts";
import { base64UrlEncode } from "../_shared/web-push.ts";

/**
 * The sender's behaviour, proved without a network and without a database.
 *
 * `web-push.test.ts` already proved the CRYPTOGRAPHY against RFC 8291's own
 * vector. This file proves the AUTHORITY: that no path sends without the
 * database's permission, that a refusal is recorded as the control that made it,
 * that a retry is bounded, that a gone subscription is retired and a merely
 * failing one is not, and that nothing the sender holds could carry content.
 */

type RpcCall = { name: string; payload: Record<string, unknown> };

function recordingClient(responses: Record<string, { data?: unknown; error?: { code?: string } | null }>) {
  const calls: RpcCall[] = [];
  return {
    calls,
    client: {
      rpc(name: string, payload: Record<string, unknown>) {
        calls.push({ name, payload });
        const response = responses[name] ?? { data: null, error: null };
        return Promise.resolve({ data: response.data ?? null, error: response.error ?? null });
      },
    },
  };
}

/** A real 65-byte P-256 point and a real 16-byte auth secret, so encryption runs for real. */
async function realSubscriptionKeys(): Promise<{ p256dh: string; auth: string }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { p256dh: base64UrlEncode(raw), auth: base64UrlEncode(crypto.getRandomValues(new Uint8Array(16))) };
}

async function vapidPair(): Promise<{ vapidPublicKey: string; vapidPrivateKey: string; vapidSubject: string }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return {
    vapidPublicKey: base64UrlEncode(raw),
    vapidPrivateKey: jwk.d as string,
    vapidSubject: "mailto:ops@example.test",
  };
}

const ALLOWED_TEST_HOSTS = [/^push\.example\.test$/];
const REQUEST = {
  userId: "2f4b0001-0000-4000-8000-000000000001",
  type: "reminder",
  locale: "pt-BR",
  dedupeHash: "a".repeat(64),
} as const;

Deno.test("the request boundary is parsed, not trusted", () => {
  assertEquals(parseDeliveryRequest(REQUEST)?.userId, REQUEST.userId);
  assertEquals(parseDeliveryRequest(null), null);
  assertEquals(parseDeliveryRequest({ ...REQUEST, userId: "not-a-uuid" }), null);
  assertEquals(parseDeliveryRequest({ ...REQUEST, dedupeHash: "short" }), null);
  // A record identifier where a digest belongs is refused: the digest shape is
  // what makes the dedupe key incapable of carrying a title.
  assertEquals(parseDeliveryRequest({ ...REQUEST, dedupeHash: "reminder:7f3c" }), null);
  assertEquals(parseDeliveryRequest({ ...REQUEST, type: "recurrence" }), null);
  assertEquals(parseDeliveryRequest({ ...REQUEST, locale: "fr" }), null);
});

Deno.test("a title offered alongside a valid request is discarded, not forwarded", () => {
  const parsed = parseDeliveryRequest({
    ...REQUEST,
    title: "Comprar remédio para a consulta de quinta",
    body: "leaked",
  });
  assertEquals(parsed !== null, true);
  assertEquals(Object.keys(parsed!).sort(), ["dedupeHash", "locale", "type", "userId"]);
  assertEquals(JSON.stringify(parsed).includes("remédio"), false);
});

Deno.test("a suppressed decision sends nothing and records the control that refused", async () => {
  for (const reason of ["not_consented", "quiet_hours", "daily_cap", "cooldown", "duplicate", "type_muted"]) {
    const { client, calls } = recordingClient({
      begin_push_delivery: { data: { permitted: false, reason } },
    });
    let fetched = 0;
    const outcome = await deliverPush(REQUEST, {
      client,
      config: await vapidPair(),
      fetch: (() => {
        fetched += 1;
        return Promise.resolve(new Response(null, { status: 201 }));
      }) as unknown as typeof fetch,
      nowSeconds: () => 1_800_000_000,
      allowedHosts: ALLOWED_TEST_HOSTS,
    });

    assertEquals(outcome, { status: "suppressed", reason });
    // The claim that matters: a refusal reached no push service at all.
    assertEquals(fetched, 0);
    assertEquals(calls.some((call) => call.name === "finish_push_delivery"), false);

    const event = calls.find((call) => call.name === "record_product_event_for_user");
    assertEquals(event?.payload.p_event_name, "notification_suppressed");
    assertEquals(event?.payload.p_surface, "server");
    assertEquals(event?.payload.p_properties, { channel: "push", reason });
    // Content-free: the event names the control and never the item.
    assertEquals(JSON.stringify(event?.payload).includes(REQUEST.dedupeHash), false);
  }
});

Deno.test("notification_suppressed is produced ONLY on the suppression path", async () => {
  const keys = await realSubscriptionKeys();
  const { client, calls } = recordingClient({
    begin_push_delivery: {
      data: {
        permitted: true,
        delivery_id: "2f4b0001-0000-4000-8000-0000000000d1",
        subscriptions: [{ id: "2f4b0001-0000-4000-8000-0000000000c1", endpoint: "https://push.example.test/a", ...keys }],
      },
    },
  });
  await deliverPush(REQUEST, {
    client,
    config: await vapidPair(),
    fetch: (() => Promise.resolve(new Response(null, { status: 201 }))) as unknown as typeof fetch,
    nowSeconds: () => 1_800_000_000,
    allowedHosts: ALLOWED_TEST_HOSTS,
  });
  // A successful delivery must not emit a suppression, or the funnel would
  // report a refusal for every message that actually arrived.
  assertEquals(calls.some((call) => call.name === "record_product_event_for_user"), false);
});

Deno.test("the permitted path encrypts, signs and posts, then finishes the ledger row", async () => {
  const keys = await realSubscriptionKeys();
  const { client, calls } = recordingClient({
    begin_push_delivery: {
      data: {
        permitted: true,
        delivery_id: "2f4b0001-0000-4000-8000-0000000000d1",
        subscriptions: [{ id: "2f4b0001-0000-4000-8000-0000000000c1", endpoint: "https://push.example.test/a", ...keys }],
      },
    },
  });

  const seen: { url: string; headers: Headers; body: Uint8Array }[] = [];
  const outcome = await deliverPush(REQUEST, {
    client,
    config: await vapidPair(),
    fetch: (async (url: string, init: RequestInit) => {
      seen.push({
        url,
        headers: new Headers(init.headers),
        body: new Uint8Array(init.body as ArrayBuffer),
      });
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch,
    nowSeconds: () => 1_800_000_000,
    allowedHosts: ALLOWED_TEST_HOSTS,
  });

  assertEquals(outcome, { status: "sent", delivered: 1, retired: 0, failed: 0 });
  assertEquals(seen.length, 1);
  assertEquals(seen[0].headers.get("Content-Encoding"), "aes128gcm");
  assertEquals(seen[0].headers.get("Authorization")?.startsWith("vapid t="), true);

  // THE BODY IS CIPHERTEXT, and the assertion is made against the actual bytes
  // rather than against the fact that we called an encrypt function: the
  // readable payload must not appear on the wire even though the push service
  // could not read it anyway, because this is the property the whole
  // construction exists for.
  const wire = new TextDecoder().decode(seen[0].body);
  assertEquals(wire.includes("lembrete"), false);
  assertEquals(wire.includes("/app/reminders"), false);

  const finish = calls.find((call) => call.name === "finish_push_delivery");
  assertEquals(finish?.payload.p_outcome, "delivered");
  assertEquals(finish?.payload.p_gone_subscription_ids, []);
  assertEquals(finish?.payload.p_failed_subscription_ids, []);
});

Deno.test("the VAPID PRIVATE key never appears in a request, a header or a response", async () => {
  const keys = await realSubscriptionKeys();
  const config = await vapidPair();
  const { client, calls } = recordingClient({
    begin_push_delivery: {
      data: {
        permitted: true,
        delivery_id: "2f4b0001-0000-4000-8000-0000000000d1",
        subscriptions: [{ id: "2f4b0001-0000-4000-8000-0000000000c1", endpoint: "https://push.example.test/a", ...keys }],
      },
    },
  });

  let observed = "";
  const outcome = await deliverPush(REQUEST, {
    client,
    config,
    fetch: (async (url: string, init: RequestInit) => {
      observed += `${url}${JSON.stringify([...new Headers(init.headers)])}`;
      observed += new TextDecoder().decode(new Uint8Array(init.body as ArrayBuffer));
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch,
    nowSeconds: () => 1_800_000_000,
    allowedHosts: ALLOWED_TEST_HOSTS,
  });

  observed += JSON.stringify(calls) + JSON.stringify(outcome);
  assertEquals(observed.includes(config.vapidPrivateKey), false);
  // The PUBLIC half must be present, or the assertion above would pass against
  // a sender that sent no VAPID material at all.
  assertEquals(observed.includes(config.vapidPublicKey), true);
});

Deno.test("a 410 retires the subscription; a 500 only strikes it", async () => {
  const keys = await realSubscriptionKeys();
  const gone = "2f4b0001-0000-4000-8000-0000000000c1";
  const flaky = "2f4b0001-0000-4000-8000-0000000000c2";
  const { client, calls } = recordingClient({
    begin_push_delivery: {
      data: {
        permitted: true,
        delivery_id: "2f4b0001-0000-4000-8000-0000000000d1",
        subscriptions: [
          { id: gone, endpoint: "https://push.example.test/gone", ...keys },
          { id: flaky, endpoint: "https://push.example.test/flaky", ...keys },
        ],
      },
    },
  });

  const outcome = await deliverPush(REQUEST, {
    client,
    config: await vapidPair(),
    fetch: (async (url: string) =>
      new Response(null, { status: url.endsWith("/gone") ? 410 : 500 })) as unknown as typeof fetch,
    nowSeconds: () => 1_800_000_000,
    allowedHosts: ALLOWED_TEST_HOSTS,
  });

  assertEquals(outcome, { status: "sent", delivered: 0, retired: 1, failed: 1 });
  const finish = calls.find((call) => call.name === "finish_push_delivery");
  // The distinction is the whole point: a browser that discarded the
  // subscription is retired at once, and a push service having a bad afternoon
  // costs one strike out of three.
  assertEquals(finish?.payload.p_gone_subscription_ids, [gone]);
  assertEquals(finish?.payload.p_failed_subscription_ids, [flaky]);
  assertEquals(finish?.payload.p_outcome, "failed");
});

Deno.test("one device's failure never stops another device's delivery", async () => {
  const keys = await realSubscriptionKeys();
  const { client } = recordingClient({
    begin_push_delivery: {
      data: {
        permitted: true,
        delivery_id: "2f4b0001-0000-4000-8000-0000000000d1",
        subscriptions: [
          // A key that cannot be encrypted to: this one throws inside the loop.
          { id: "2f4b0001-0000-4000-8000-0000000000c1", endpoint: "https://push.example.test/broken", p256dh: "AAAA", auth: "AAAA" },
          { id: "2f4b0001-0000-4000-8000-0000000000c2", endpoint: "https://push.example.test/good", ...keys },
        ],
      },
    },
  });
  const outcome = await deliverPush(REQUEST, {
    client,
    config: await vapidPair(),
    fetch: (async () => new Response(null, { status: 201 })) as unknown as typeof fetch,
    nowSeconds: () => 1_800_000_000,
    allowedHosts: ALLOWED_TEST_HOSTS,
  });
  assertEquals(outcome, { status: "sent", delivered: 1, retired: 0, failed: 1 });
});

Deno.test("a delivery that began is ALWAYS finished, even when every device fails", async () => {
  const keys = await realSubscriptionKeys();
  const { client, calls } = recordingClient({
    begin_push_delivery: {
      data: {
        permitted: true,
        delivery_id: "2f4b0001-0000-4000-8000-0000000000d1",
        subscriptions: [{ id: "2f4b0001-0000-4000-8000-0000000000c1", endpoint: "https://push.example.test/a", ...keys }],
      },
    },
  });
  await deliverPush(REQUEST, {
    client,
    config: await vapidPair(),
    fetch: (() => Promise.reject(new Error("network"))) as unknown as typeof fetch,
    nowSeconds: () => 1_800_000_000,
    allowedHosts: ALLOWED_TEST_HOSTS,
  });
  // A `pending` row nobody finishes holds its dedupe slot forever, and that item
  // is then silently undeliverable for good.
  assertEquals(calls.filter((call) => call.name === "finish_push_delivery").length, 1);
});

Deno.test("an endpoint outside the push-service allowlist is never contacted", async () => {
  const keys = await realSubscriptionKeys();
  const { client, calls } = recordingClient({
    begin_push_delivery: {
      data: {
        permitted: true,
        delivery_id: "2f4b0001-0000-4000-8000-0000000000d1",
        subscriptions: [{ id: "2f4b0001-0000-4000-8000-0000000000c1", endpoint: "https://attacker.example.test/x", ...keys }],
      },
    },
  });
  let fetched = 0;
  const outcome = await deliverPush(REQUEST, {
    client,
    config: await vapidPair(),
    fetch: (() => {
      fetched += 1;
      return Promise.resolve(new Response(null, { status: 201 }));
    }) as unknown as typeof fetch,
    nowSeconds: () => 1_800_000_000,
    allowedHosts: ALLOWED_TEST_HOSTS,
  });
  assertEquals(fetched, 0);
  assertEquals(outcome, { status: "sent", delivered: 0, retired: 0, failed: 1 });
  // Struck rather than retired: an unrecognised host is our list being out of
  // date, not the user's browser having thrown the subscription away.
  const finish = calls.find((call) => call.name === "finish_push_delivery");
  assertEquals(finish?.payload.p_gone_subscription_ids, []);
});

Deno.test("the real allowlist admits the shipping push services and refuses everything else", () => {
  for (const endpoint of [
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://web.push.apple.com/QAB",
    "https://par02p.notify.windows.com/w/?token=x",
  ]) {
    assertEquals(isAllowedPushHost(endpoint), true, endpoint);
  }
  for (const endpoint of [
    "https://attacker.example.test/x",
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://127.0.0.1/x",
    "https://googleapis.com.attacker.test/x",
    "https://fcm.googleapis.com.evil.test/x",
    "not-a-url",
  ]) {
    assertEquals(isAllowedPushHost(endpoint), false, endpoint);
  }
});

Deno.test("an unknown type refuses BEFORE a delivery is begun", async () => {
  const { client, calls } = recordingClient({});
  const outcome = await deliverPush(
    { ...REQUEST, type: "recurrence" as never },
    {
      client,
      config: await vapidPair(),
      fetch: (() => Promise.reject(new Error("must not be reached"))) as unknown as typeof fetch,
      nowSeconds: () => 1_800_000_000,
      allowedHosts: ALLOWED_TEST_HOSTS,
    },
  );
  assertEquals(outcome, { status: "refused", code: "payload_unavailable" });
  // Nothing was begun, so no dedupe slot was consumed by a message that could
  // never have been built.
  assertEquals(calls.length, 0);
});

Deno.test("a database refusal is not treated as permission", async () => {
  const { client } = recordingClient({
    begin_push_delivery: { data: null, error: { code: "42501" } },
  });
  const outcome = await deliverPush(REQUEST, {
    client,
    config: await vapidPair(),
    fetch: (() => Promise.reject(new Error("must not be reached"))) as unknown as typeof fetch,
    nowSeconds: () => 1_800_000_000,
    allowedHosts: ALLOWED_TEST_HOSTS,
  });
  assertEquals(outcome, { status: "refused", code: "begin_failed" });
});

Deno.test("a telemetry failure never turns a correct suppression into an error", async () => {
  const { client } = recordingClient({
    begin_push_delivery: { data: { permitted: false, reason: "quiet_hours" } },
    record_product_event_for_user: { data: null, error: { code: "P0001" } },
  });
  const outcome = await deliverPush(REQUEST, {
    client,
    config: await vapidPair(),
    fetch: (() => Promise.reject(new Error("must not be reached"))) as unknown as typeof fetch,
    nowSeconds: () => 1_800_000_000,
    allowedHosts: ALLOWED_TEST_HOSTS,
  });
  // The user's quiet hours were already honoured; a ledger problem must not
  // undo that or make it look like a delivery failure.
  assertEquals(outcome, { status: "suppressed", reason: "quiet_hours" });
});

Deno.test("the suppression event's idempotency key is stable per item and distinct per reason", async () => {
  const keyFor = async (reason: string, dedupeHash: string) => {
    const { client, calls } = recordingClient({});
    await recordSuppression(client, {
      userId: REQUEST.userId,
      locale: "pt-BR",
      reason,
      dedupeHash,
    });
    return calls[0].payload.p_idempotency_key as string;
  };
  const first = await keyFor("quiet_hours", "a".repeat(64));
  assertEquals(await keyFor("quiet_hours", "a".repeat(64)), first);
  assertEquals((await keyFor("daily_cap", "a".repeat(64))) === first, false);
  assertEquals((await keyFor("quiet_hours", "b".repeat(64))) === first, false);
  assertEquals(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(first), true);
});
