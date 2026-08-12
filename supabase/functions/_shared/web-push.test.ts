import { assertEquals, assertRejects } from "jsr:@std/assert@1";

import {
  base64UrlDecode,
  base64UrlEncode,
  createVapidAuthorization,
  encryptPushPayload,
  importSenderKeyPair,
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
