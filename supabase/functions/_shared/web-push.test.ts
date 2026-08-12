import { assertEquals, assertRejects } from "jsr:@std/assert@1";

import {
  base64UrlDecode,
  base64UrlEncode,
  createVapidAuthorization,
  encryptPushPayload,
  importSenderKeyPair,
  vapidKeyPairAgrees,
} from "./web-push.ts";

/**
 * The RFC's own vector, not a round trip.
 *
 * A round-trip test — encrypt, then decrypt with the receiver's private key —
 * proves the two halves agree with each other, which they would also do if both
 * used the wrong info string, the wrong salt order or the wrong padding
 * delimiter. Every one of those produces a body a real push service accepts and
 * a real browser silently discards, and the symptom is "nothing arrives on the
 * phone" at the owner's hardware checkpoint.
 *
 * RFC 8291 section 5 publishes a complete worked example: both key pairs, the
 * auth secret, the salt and the exact expected body. Pinning the ephemeral
 * sender pair and the salt makes the whole construction deterministic, so this
 * asserts the bytes an independent implementation produced.
 */
const RFC8291 = {
  plaintext: "When I grow up, I want to be a watermelon",
  userAgentPublic:
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  senderPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  senderPublic:
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  expectedBody:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
} as const;

Deno.test("RFC 8291 section 5: the encrypted body matches the published vector byte for byte", async () => {
  const sender = await importSenderKeyPair(
    base64UrlDecode(RFC8291.senderPrivate),
    base64UrlDecode(RFC8291.senderPublic),
  );
  const body = await encryptPushPayload({
    plaintext: new TextEncoder().encode(RFC8291.plaintext),
    keys: { p256dh: RFC8291.userAgentPublic, auth: RFC8291.authSecret },
    sender,
    salt: base64UrlDecode(RFC8291.salt),
  });
  assertEquals(base64UrlEncode(body), RFC8291.expectedBody);
});

Deno.test("the RFC 8188 header layout is what a receiver parses", async () => {
  const sender = await importSenderKeyPair(
    base64UrlDecode(RFC8291.senderPrivate),
    base64UrlDecode(RFC8291.senderPublic),
  );
  const body = await encryptPushPayload({
    plaintext: new TextEncoder().encode("x"),
    keys: { p256dh: RFC8291.userAgentPublic, auth: RFC8291.authSecret },
    sender,
    salt: base64UrlDecode(RFC8291.salt),
  });
  assertEquals(base64UrlEncode(body.slice(0, 16)), RFC8291.salt);
  // Record size is a big-endian uint32. Little-endian here would be accepted by
  // the push service and rejected by the browser.
  assertEquals(new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0, false), 4096);
  assertEquals(body[20], 65);
  assertEquals(base64UrlEncode(body.slice(21, 86)), RFC8291.senderPublic);
});

Deno.test("a fresh sender pair produces a different body for the same plaintext", async () => {
  const keys = { p256dh: RFC8291.userAgentPublic, auth: RFC8291.authSecret };
  const plaintext = new TextEncoder().encode(RFC8291.plaintext);
  const first = await encryptPushPayload({ plaintext, keys });
  const second = await encryptPushPayload({ plaintext, keys });
  // Non-vacuity for the ephemeral half: if this ever passes trivially, the
  // sender key or the salt has stopped being per-message and the same
  // ciphertext would be replayable.
  assertEquals(first.length, second.length);
  assertEquals(base64UrlEncode(first) === base64UrlEncode(second), false);
});

Deno.test("a malformed subscription key is refused rather than encrypted to nothing", async () => {
  await assertRejects(
    () =>
      encryptPushPayload({
        plaintext: new TextEncoder().encode("x"),
        keys: { p256dh: base64UrlEncode(new Uint8Array(10)), auth: RFC8291.authSecret },
      }),
    Error,
    "subscription_key_invalid",
  );
  await assertRejects(
    () =>
      encryptPushPayload({
        plaintext: new TextEncoder().encode("x"),
        keys: { p256dh: RFC8291.userAgentPublic, auth: base64UrlEncode(new Uint8Array(4)) },
      }),
    Error,
    "subscription_auth_invalid",
  );
});

/**
 * VAPID. The key pair below is generated for this test and is not the
 * deployment's: the deployment's private half exists only in the Edge Function
 * environment, and a test fixture that shared it would put it in the repository.
 */
async function testVapidPair(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey: base64UrlEncode(raw), privateKey: jwk.d as string };
}

Deno.test("RFC 8292: the authorization header is a verifiable ES256 token over the endpoint ORIGIN", async () => {
  const { publicKey, privateKey } = await testVapidPair();
  const header = await createVapidAuthorization({
    endpoint: "https://push.example.test/subscription/abc123?token=xyz",
    publicKey,
    privateKey,
    subject: "mailto:ops@example.test",
    expiresAtSeconds: 1_800_000_000,
  });

  const match = /^vapid t=([^,]+), k=(.+)$/.exec(header);
  assertEquals(match !== null, true);
  const [, token, advertisedKey] = match!;
  assertEquals(advertisedKey, publicKey);

  const [encodedHeader, encodedClaims, encodedSignature] = token.split(".");
  assertEquals(JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedHeader))), {
    typ: "JWT",
    alg: "ES256",
  });
  const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedClaims)));
  // The ORIGIN, never the path: a push endpoint's path IS the subscription
  // identifier, and signing it into a token would put a per-user secret into a
  // header that transits intermediaries.
  assertEquals(claims.aud, "https://push.example.test");
  assertEquals(claims.exp, 1_800_000_000);
  assertEquals(claims.sub, "mailto:ops@example.test");

  // Verified with the ADVERTISED public key, which is what a push service does.
  // Checking the signature merely parses would pass against an unsigned token.
  const verifier = await crypto.subtle.importKey(
    "raw",
    base64UrlDecode(advertisedKey) as BufferSource,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    verifier,
    base64UrlDecode(encodedSignature) as BufferSource,
    new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`) as BufferSource,
  );
  assertEquals(valid, true);

  // The negative control: the same signature must NOT verify over tampered
  // input, or the assertion above would pass against a verifier that says yes.
  const tampered = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    verifier,
    base64UrlDecode(encodedSignature) as BufferSource,
    new TextEncoder().encode(`${encodedHeader}.${encodedClaims}x`) as BufferSource,
  );
  assertEquals(tampered, false);
});

Deno.test("a malformed VAPID key is refused rather than signing with a truncated one", async () => {
  const { privateKey } = await testVapidPair();
  await assertRejects(
    () =>
      createVapidAuthorization({
        endpoint: "https://push.example.test/x",
        publicKey: base64UrlEncode(new Uint8Array(31)),
        privateKey,
        subject: "mailto:ops@example.test",
        expiresAtSeconds: 1,
      }),
    Error,
    "vapid_public_key_invalid",
  );
});

/**
 * The gap an iPhone found, stated as a test rather than as a hypothesis.
 *
 * Every assertion above this line is handed a pair generated in one call, so
 * `d` has always belonged to `x`/`y`. That is the same shape of blind spot §56
 * recorded: a suite that always supplies a coherent input cannot notice that
 * an incoherent one travels silently. And it does travel — this runtime imports
 * an EC private JWK from `d` alone, so a `VAPID_PRIVATE_KEY` and a
 * `VAPID_PUBLIC_KEY` set from two different generations produce a perfectly
 * well-formed `Authorization` header carrying a signature that verifies against
 * NOTHING the push service was given. The service's only available answer is
 * 401/403, which is exactly what a rejected `sub`, a wrong `aud` and a bad
 * signature all look like from here.
 */
Deno.test("RFC 8292: a private key that does not belong to the advertised public key is DETECTED", async () => {
  const a = await testVapidPair();
  const b = await testVapidPair();

  // The positive control first: a real pair must agree, or the negative below
  // would pass against a function that always answers `false`.
  assertEquals(await vapidKeyPairAgrees({ publicKey: a.publicKey, privateKey: a.privateKey }), true);
  assertEquals(await vapidKeyPairAgrees({ publicKey: b.publicKey, privateKey: b.privateKey }), true);

  // Both halves are individually valid — a length check cannot see this.
  assertEquals(await vapidKeyPairAgrees({ publicKey: b.publicKey, privateKey: a.privateKey }), false);
  assertEquals(await vapidKeyPairAgrees({ publicKey: a.publicKey, privateKey: b.privateKey }), false);
});

Deno.test("the pair check refuses a malformed half rather than answering `false` for it", async () => {
  const { publicKey, privateKey } = await testVapidPair();
  // `false` would read as "the keys disagree", pointing at a rotation that never
  // happened. A key that is not a key is a different repair.
  await assertRejects(
    () => vapidKeyPairAgrees({ publicKey: base64UrlEncode(new Uint8Array(31)), privateKey }),
    Error,
    "vapid_public_key_invalid",
  );
  await assertRejects(
    () => vapidKeyPairAgrees({ publicKey, privateKey: base64UrlEncode(new Uint8Array(31)) }),
    Error,
    "vapid_private_key_invalid",
  );
});

/**
 * Why the check above cannot be replaced by trusting the runtime.
 *
 * Written to survive a runtime that starts validating: the invariant asserted is
 * not "the import succeeds" but "a mismatched pair never yields a token a push
 * service would accept". If a future Deno refuses the import outright, this
 * still passes and `vapidKeyPairAgrees` becomes belt and braces; if it keeps
 * accepting it, this is the proof that the belt is load-bearing.
 */
Deno.test("a mismatched pair never yields a token the advertised key can verify", async () => {
  const a = await testVapidPair();
  const b = await testVapidPair();

  let header: string | null = null;
  try {
    header = await createVapidAuthorization({
      endpoint: "https://push.example.test/subscription/abc123",
      publicKey: b.publicKey,
      privateKey: a.privateKey,
      subject: "mailto:ops@example.test",
      expiresAtSeconds: 1_800_000_000,
    });
  } catch {
    // The runtime refused the incoherent key outright. Nothing was sent.
    return;
  }

  const [, token, advertisedKey] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
  const [encodedHeader, encodedClaims, encodedSignature] = token.split(".");
  const verifier = await crypto.subtle.importKey(
    "raw",
    base64UrlDecode(advertisedKey) as BufferSource,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    verifier,
    base64UrlDecode(encodedSignature) as BufferSource,
    new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`) as BufferSource,
  );
  assertEquals(valid, false);
});
