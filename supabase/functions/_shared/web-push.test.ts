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

/*
 * ============================================================================
 * RFC 8292's own VAPID vector, checked by a verifier written from the curve
 * equations rather than by the runtime that produced the signature.
 * ============================================================================
 *
 * Every VAPID assertion in this file until now signed with `crypto.subtle` and
 * verified with `crypto.subtle`. That agrees with itself by construction: a
 * construction that hashed the wrong bytes, ordered `r` and `s` backwards, or
 * emitted DER where JOSE wants raw `r ‖ s` would round-trip perfectly and be
 * rejected by every push service on earth. Apple answered `BadJwtToken` to a
 * token this file already called correct, which is exactly the shape of failure
 * a same-implementation round trip cannot see.
 *
 * So ECDSA verification is done below in ~40 lines of BigInt arithmetic over
 * P-256 — no WebCrypto, no library, nothing shared with the signer except
 * SHA-256 itself, which is not the part under test. It is pinned first against
 * RFC 8292 section 2.4's published token (a known answer, produced years ago by
 * somebody else's implementation), then pointed at ours.
 */

/** NIST P-256. */
const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
const GX = 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n;
const GY = 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n;

type Point = { x: bigint; y: bigint } | null; // null is the point at infinity

const mod = (a: bigint, m: bigint): bigint => ((a % m) + m) % m;

/** Fermat inversion; `p` is prime, so a^(p-2) = a^-1. */
function inverse(a: bigint, m: bigint): bigint {
  let result = 1n;
  let base = mod(a, m);
  let exponent = m - 2n;
  while (exponent > 0n) {
    if (exponent & 1n) result = (result * base) % m;
    base = (base * base) % m;
    exponent >>= 1n;
  }
  return result;
}

function add(p1: Point, p2: Point): Point {
  if (p1 === null) return p2;
  if (p2 === null) return p1;
  if (p1.x === p2.x && mod(p1.y + p2.y, P) === 0n) return null;
  const slope = p1.x === p2.x && p1.y === p2.y
    // Doubling: (3x² - 3) / 2y, since a = -3 on this curve.
    ? mod((3n * p1.x * p1.x - 3n) * inverse(2n * p1.y, P), P)
    : mod((p2.y - p1.y) * inverse(p2.x - p1.x, P), P);
  const x = mod(slope * slope - p1.x - p2.x, P);
  return { x, y: mod(slope * (p1.x - x) - p1.y, P) };
}

function multiply(k: bigint, point: Point): Point {
  let result: Point = null;
  let addend = point;
  let scalar = mod(k, N);
  while (scalar > 0n) {
    if (scalar & 1n) result = add(result, addend);
    addend = add(addend, addend);
    scalar >>= 1n;
  }
  return result;
}

const toBigInt = (bytes: Uint8Array): bigint =>
  bytes.reduce((total, byte) => (total << 8n) | BigInt(byte), 0n);

function onCurve(point: { x: bigint; y: bigint }): boolean {
  return mod(point.y * point.y, P) === mod(point.x * point.x * point.x - 3n * point.x + B, P);
}

/**
 * ECDSA-SHA256 verification, from the definition. Returns false rather than
 * throwing for anything out of range, so a malformed input is a rejection.
 */
async function verifyP256(
  publicKeyPoint: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  if (publicKeyPoint.length !== 65 || publicKeyPoint[0] !== 0x04) return false;
  if (signature.length !== 64) return false;
  const Q = { x: toBigInt(publicKeyPoint.slice(1, 33)), y: toBigInt(publicKeyPoint.slice(33, 65)) };
  if (!onCurve(Q)) return false;

  const r = toBigInt(signature.slice(0, 32));
  const s = toBigInt(signature.slice(32, 64));
  if (r <= 0n || r >= N || s <= 0n || s >= N) return false;

  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", message as BufferSource));
  const e = toBigInt(digest); // 256-bit curve, so no truncation is needed
  const w = inverse(s, N);
  const point = add(multiply(mod(e * w, N), { x: GX, y: GY }), multiply(mod(r * w, N), Q));
  if (point === null) return false;
  return mod(point.x, N) === r;
}

/** RFC 8292 section 2.4, Figure 1 and Figure 2. Public test data. */
const RFC8292 = {
  jwt:
    "eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJodHRwczovL3B1c2guZXhhbXBsZS5uZXQiLCJleHAiOjE0NTM1MjM3NjgsInN1YiI6Im1haWx0bzpwdXNoQGV4YW1wbGUuY29tIn0.i3CYb7t4xfxCDquptFOepC9GAu_HLGkMlMuCGSK2rpiUfnK9ojFwDXb1JrErtmysazNjjvW2L9OkSSHzvoD1oA",
  k: "BA1Hxzyi1RUM1b5wjxsn7nGxAszw2u61m164i3MrAIxHF6YK5h4SDYic-dRuU_RCPCfA5aq9ojSwk5Y2EmClBPs",
  header: { typ: "JWT", alg: "ES256" },
  claims: { aud: "https://push.example.net", exp: 1453523768, sub: "mailto:push@example.com" },
} as const;

function splitToken(authorization: string) {
  const match = /^vapid t=([^.]+)\.([^.]+)\.([A-Za-z0-9_-]+), k=([A-Za-z0-9_-]+)$/.exec(authorization);
  if (match === null) throw new Error("the Authorization header did not parse");
  const [, header, claims, signature, key] = match;
  return { header, claims, signature, key, signingInput: `${header}.${claims}` };
}

Deno.test("the independent verifier accepts RFC 8292's published token and rejects a corrupted one", async () => {
  const [header, claims, signature] = RFC8292.jwt.split(".");
  const message = new TextEncoder().encode(`${header}.${claims}`);
  const key = base64UrlDecode(RFC8292.k);

  // Known answer: a signature produced years ago by another implementation.
  assertEquals(await verifyP256(key, message, base64UrlDecode(signature)), true);

  // Non-vacuity: the verifier must be able to say no. One bit.
  const corrupted = base64UrlDecode(signature);
  corrupted[corrupted.length - 1] ^= 0x01;
  assertEquals(await verifyP256(key, message, corrupted), false);

  // And the decoded values are the ones the RFC prints, so the encoding this
  // repository produces is being compared against the right thing.
  assertEquals(JSON.parse(new TextDecoder().decode(base64UrlDecode(header))), RFC8292.header);
  assertEquals(JSON.parse(new TextDecoder().decode(base64UrlDecode(claims))), RFC8292.claims);
});

Deno.test("OUR VAPID token verifies under the independent verifier, and matches the RFC's shape", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);

  const authorization = await createVapidAuthorization({
    endpoint: "https://push.example.net/p/JzLQ3raZJfFBR0aqvOMsLrt54w4rJUsV",
    publicKey: base64UrlEncode(raw),
    privateKey: jwk.d as string,
    subject: "mailto:push@example.com",
    expiresAtSeconds: RFC8292.claims.exp,
  });
  const token = splitToken(authorization);

  // The signature is ours; the verifier is not.
  assertEquals(
    await verifyP256(
      base64UrlDecode(token.key),
      new TextEncoder().encode(token.signingInput),
      base64UrlDecode(token.signature),
    ),
    true,
  );

  // JOSE wants raw `r ‖ s`. A DER-wrapped signature is 70-72 bytes and would be
  // rejected by every push service while verifying happily against itself.
  assertEquals(base64UrlDecode(token.signature).length, 64);

  // The protected header is byte-identical to the RFC's, which pins `typ`,
  // `alg`, the key order and the absence of padding in one assertion.
  assertEquals(token.header, RFC8292.jwt.split(".")[0]);
  // And the claim set is the RFC's, key for key and in the same order.
  assertEquals(token.claims, RFC8292.jwt.split(".")[1]);
  // `k=` is the uncompressed point that signed it, verbatim and canonical.
  assertEquals(base64UrlDecode(token.key).length, 65);
  assertEquals(base64UrlDecode(token.key)[0], 0x04);
});

Deno.test("a token signed by a DIFFERENT key does not verify against the advertised one", async () => {
  /*
   * The failure mode `vapidKeyPairAgrees` exists for, restated against a
   * verifier that shares no code with the signer — because the runtime that
   * signs imports an EC private JWK from `d` alone and never consults `x`/`y`.
   */
  const mine = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const other = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const mineJwk = await crypto.subtle.exportKey("jwk", mine.privateKey);
  const otherRaw = new Uint8Array(await crypto.subtle.exportKey("raw", other.publicKey));

  const authorization = await createVapidAuthorization({
    endpoint: "https://push.example.net/p/abc",
    publicKey: base64UrlEncode(otherRaw), // advertised
    privateKey: mineJwk.d as string, // actually signing
    subject: "mailto:push@example.com",
    expiresAtSeconds: 1453523768,
  });
  const token = splitToken(authorization);
  assertEquals(
    await verifyP256(
      base64UrlDecode(token.key),
      new TextEncoder().encode(token.signingInput),
      base64UrlDecode(token.signature),
    ),
    false,
  );
});
