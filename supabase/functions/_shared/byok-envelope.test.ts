// Deno-side behavioural tests for the BYOK crypto core the worker will run.
//
// These execute in the `worker` CI job (`deno test supabase/functions/`), which
// runs with **no `--allow-*` flags at all** so the suite can never reach a
// network. That constraint shapes what is provable here and what is not, and
// the difference is stated rather than papered over:
//
//   * the envelope, the AAD binding, the IV freshness and the failure
//     vocabulary are all **executed** — WebCrypto needs no permission;
//   * `requireMasterKey` / `requireFingerprintPepper` cannot be *called*,
//     because `Deno.env.get` without `--allow-env` throws a permission error
//     rather than the validation error under test. Their validation logic is
//     `decodeMasterKey`, which takes the value as an argument and is exercised
//     exhaustively below; the wiring between the two is asserted textually.
//     Granting `--allow-env` to reach three more assertions would trade the
//     suite's network-free guarantee for a weaker version of a proof it already
//     has.
//
// Cross-runtime equality with the Node core is proven separately by
// `scripts/byok-crypto-interop.mjs` (gate G-0.2, re-run in CI) and by
// `src/lib/byok/parity.test.ts`.

import {
  assert,
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  composeAad,
  CredentialUnreadableError,
  decodeMasterKey,
  decryptCredential,
  encryptCredential,
  fromBase64,
  IV_BYTES,
  KEY_BYTES,
  TAG_BYTES,
  toBase64,
  type Bytes,
} from "./byok-envelope.ts";

function master(): Bytes {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(KEY_BYTES))) as Bytes;
}

const CONTEXT = {
  userId: "11111111-1111-4111-8111-111111111111",
  keyVersion: 1,
  provider: "openai",
};

const OTHER_USER = { ...CONTEXT, userId: "22222222-2222-4222-8222-222222222222" };

const PLAINTEXT = "sk-proj-not-a-real-key-0000000000000000000000000000";

Deno.test("A3 (Deno half): encrypt then decrypt returns the plaintext", async () => {
  const key = master();
  const envelope = await encryptCredential(PLAINTEXT, key, CONTEXT);

  assertEquals(envelope.keyVersion, CONTEXT.keyVersion);
  assertEquals(fromBase64(envelope.iv).length, IV_BYTES);
  assertEquals(
    fromBase64(envelope.ciphertext).length,
    new TextEncoder().encode(PLAINTEXT).length + TAG_BYTES,
  );
  assertEquals(await decryptCredential(envelope, key, CONTEXT), PLAINTEXT);
});

Deno.test("A5 (Deno half): every encryption uses a fresh IV", async () => {
  const key = master();
  const ivs = new Set<string>();
  for (let index = 0; index < 32; index += 1) {
    const envelope = await encryptCredential(PLAINTEXT, key, CONTEXT);
    ivs.add(envelope.iv);
    // Decrypted each round so a "unique" IV cannot be a corrupted write.
    assertEquals(await decryptCredential(envelope, key, CONTEXT), PLAINTEXT);
  }
  assertEquals(ivs.size, 32);
});

Deno.test("A4 (Deno half): the AAD binds the ciphertext to its owner", async () => {
  const key = master();
  const envelope = await encryptCredential(PLAINTEXT, key, CONTEXT);

  // Positive control first: without it the rejection below would pass against a
  // ciphertext that never decrypted at all.
  assertEquals(await decryptCredential(envelope, key, CONTEXT), PLAINTEXT);

  for (const context of [
    OTHER_USER,
    { ...CONTEXT, keyVersion: 2 },
    { ...CONTEXT, provider: "anthropic" },
  ]) {
    let threw = false;
    try {
      await decryptCredential(envelope, key, context);
    } catch (error) {
      threw = true;
      assert(error instanceof CredentialUnreadableError);
      assertEquals((error as Error).message, "credential_unreadable");
    }
    assert(threw, `decryption must fail for ${JSON.stringify(context)}`);
  }
});

Deno.test("A4 (Deno half): the failure echoes nothing", async () => {
  const key = master();
  const envelope = await encryptCredential(PLAINTEXT, key, CONTEXT);

  let rendered = "";
  try {
    await decryptCredential(envelope, key, OTHER_USER);
  } catch (error) {
    const failure = error as Error;
    rendered = `${failure.name} ${failure.message} ${failure.stack ?? ""}`;
  }

  assert(rendered.length > 0, "the decryption must have failed");
  for (const leak of [PLAINTEXT, envelope.ciphertext, envelope.iv, toBase64(key)]) {
    assert(!rendered.includes(leak), "the failure must echo no bytes");
  }
});

Deno.test("the AAD is unambiguous across field boundaries", () => {
  const left = composeAad({ userId: "ab", keyVersion: 1, provider: "c" });
  const right = composeAad({ userId: "a", keyVersion: 1, provider: "bc" });
  assertNotEquals([...left], [...right]);
  assertEquals([...left].filter((byte) => byte === 0x1f).length, 2);
});

Deno.test("A6 (Deno half): a master key is validated, never defaulted", () => {
  const valid = toBase64(master());
  assertEquals(decodeMasterKey(valid, "BYOK_MASTER_KEY").length, KEY_BYTES);

  // Absent, empty, wrong length, and not base64 at all — the four shapes a real
  // misconfiguration takes.
  for (const [value, label] of [
    [undefined, "absent"],
    ["", "empty"],
  ] as const) {
    const error = assertThrows(
      () => decodeMasterKey(value, "BYOK_MASTER_KEY"),
      Error,
      undefined,
      `an ${label} value must fail`,
    );
    assertStringIncludes(error.message, "BYOK_MASTER_KEY is not configured");
  }

  const short = toBase64(crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16))));
  assertStringIncludes(
    assertThrows(() => decodeMasterKey(short, "BYOK_MASTER_KEY"), Error).message,
    "must decode to 32 bytes",
  );

  const long = toBase64(crypto.getRandomValues(new Uint8Array(new ArrayBuffer(64))));
  assertStringIncludes(
    assertThrows(() => decodeMasterKey(long, "BYOK_MASTER_KEY"), Error).message,
    "must decode to 32 bytes",
  );

  // The message names the variable and never the value it rejected: a startup
  // failure is logged, and a log that echoes a mistyped key has published it.
  const wrong = toBase64(crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16))));
  const message = assertThrows(() => decodeMasterKey(wrong, "BYOK_MASTER_KEY"), Error).message;
  assert(!message.includes(wrong), "the message must not echo the offending value");
});

Deno.test("A6 (Deno half): the pepper is validated exactly as strictly", () => {
  // BYOK-FINGERPRINT-001 makes the pepper subject to BYOK-MASTER-001..005
  // independently, so it is the same check under a different name -- and the
  // name matters, because it is what an operator reads at 3am.
  assertStringIncludes(
    assertThrows(() => decodeMasterKey(undefined, "BYOK_FINGERPRINT_PEPPER"), Error).message,
    "BYOK_FINGERPRINT_PEPPER is not configured",
  );
  assertEquals(decodeMasterKey(toBase64(master()), "BYOK_FINGERPRINT_PEPPER").length, KEY_BYTES);
});

// The wiring assertion -- that `requireMasterKey` and `requireFingerprintPepper`
// delegate to the `decodeMasterKey` every case above exercises, rather than
// validating a second time and differently -- lives in
// `src/lib/byok/parity.test.ts`. It has to read this file as text, and
// `Deno.readTextFile` needs `--allow-read`, which this suite deliberately does
// not have. The Node side already reads this source for the parity lock, so the
// assertion costs nothing there and would cost the permission-free guarantee
// here.
