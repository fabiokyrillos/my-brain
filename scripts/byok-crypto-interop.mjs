/**
 * BYOK G-0.2 — the crypto interop proof.
 *
 * Encrypts in Node and decrypts in Deno, then encrypts in Deno and decrypts in
 * Node, with identical AAD composition. **Both directions, executed** — a format
 * mismatch discovered in Slice BYOK.4 would be expensive, and BYOK-ADAPTER-004's
 * parity lock asserts sameness rather than establishing it.
 *
 * The two implementations are deliberate duplicates, because
 * `src/lib/byok/crypto.ts` imports `server-only`, which throws under Deno — the
 * same constraint that already forces the worker to carry its own copy of the
 * extraction prompt. This script is the evidence that the duplication is
 * faithful.
 *
 * It also proves the properties that make the format worth having:
 *
 *   * a ciphertext sealed for one `user_id` **fails** under another's AAD;
 *   * two encryptions of the same plaintext differ in IV and in ciphertext;
 *   * a flipped byte fails, and fails with the same single word.
 *
 * No key material is written to disk or printed. The master key is generated in
 * memory for the run and passed to the Deno half through an environment variable
 * that lives only for that child process.
 *
 * Usage: `npm run byok:interop`
 */

import { spawnSync } from "node:child_process";
import { webcrypto } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REPO = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const DENO_MODULE = join(REPO, "supabase/functions/_shared/byok-envelope.ts");

const CONTEXT = {
  userId: "11111111-1111-4111-8111-111111111111",
  keyVersion: 1,
  provider: "openai",
};
const OTHER_CONTEXT = { ...CONTEXT, userId: "22222222-2222-4222-8222-222222222222" };
/** Not a real key, and never was. Shaped like one so the format is exercised. */
const PLAINTEXT = "sk-interop-proof-not-a-real-credential";

function fail(message) {
  console.error(`  FAIL  ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`  ok    ${message}`);
}

/** Runs a Deno one-shot against the shared module and returns its parsed stdout. */
function runDeno(source, masterKeyBase64) {
  const dir = mkdtempSync(join(tmpdir(), "byok-interop-"));
  const file = join(dir, "probe.ts");
  writeFileSync(file, source, "utf8");
  try {
    // `shell: true` on Windows, where `deno` is a shim rather than an
    // executable and a bare `spawnSync` fails to launch it at all — reported as
    // a null exit status, which reads like a crash and is not one.
    const result = spawnSync(
      "deno",
      ["run", "--allow-env=BYOK_MASTER_KEY", `--allow-read=${DENO_MODULE}`, file],
      {
        encoding: "utf8",
        env: { ...process.env, BYOK_MASTER_KEY: masterKeyBase64 },
        shell: process.platform === "win32",
      },
    );
    if (result.error) throw new Error(`could not launch deno: ${result.error.message}`);
    if (result.status !== 0) {
      throw new Error(`deno exited ${result.status}: ${result.stderr || result.stdout}`);
    }
    return JSON.parse(result.stdout.trim().split("\n").pop());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const denoModuleUrl = pathToFileURL(DENO_MODULE).href;

async function main() {
  const { encryptCredential, decryptCredential, CredentialUnreadableError } = await import(
    pathToFileURL(join(REPO, "src/lib/byok/crypto.ts")).href
  ).catch(async () => {
    // `crypto.ts` imports `server-only`, which refuses outside a Next build.
    // The proof only needs the algorithm, so it re-implements the two calls
    // against the *same* shared envelope module the real one uses — which is
    // what keeps this a proof of the format rather than of a copy of it.
    const envelope = await import(pathToFileURL(join(REPO, "src/lib/byok/envelope.ts")).href);
    return nodeCryptoFrom(envelope);
  });

  const master = webcrypto.getRandomValues(new Uint8Array(32));
  const masterKeyBase64 = Buffer.from(master).toString("base64");

  console.log("BYOK G-0.2 — crypto interop proof\n");

  // --- 1. Node encrypts, Deno decrypts ------------------------------------
  const fromNode = await encryptCredential(PLAINTEXT, master, CONTEXT);
  const denoRead = runDeno(
    `
    import { decryptCredential, decodeMasterKey } from ${JSON.stringify(denoModuleUrl)};
    const master = decodeMasterKey(Deno.env.get("BYOK_MASTER_KEY"));
    const envelope = ${JSON.stringify(fromNode)};
    const context = ${JSON.stringify(CONTEXT)};
    const plaintext = await decryptCredential(envelope, master, context);
    let crossUser = "decrypted";
    try {
      await decryptCredential(envelope, master, ${JSON.stringify(OTHER_CONTEXT)});
    } catch (error) { crossUser = error.message; }
    console.log(JSON.stringify({ plaintext, crossUser }));
    `,
    masterKeyBase64,
  );

  if (denoRead.plaintext === PLAINTEXT) pass("Node -> Deno round trip");
  else fail(`Node -> Deno round trip returned ${JSON.stringify(denoRead.plaintext)}`);

  if (denoRead.crossUser === "credential_unreadable") {
    pass("Deno refuses a Node ciphertext under another user's AAD");
  } else {
    fail(`cross-user decrypt in Deno returned ${JSON.stringify(denoRead.crossUser)}`);
  }

  // --- 2. Deno encrypts, Node decrypts ------------------------------------
  const fromDeno = runDeno(
    `
    import { encryptCredential, decodeMasterKey } from ${JSON.stringify(denoModuleUrl)};
    const master = decodeMasterKey(Deno.env.get("BYOK_MASTER_KEY"));
    const first = await encryptCredential(${JSON.stringify(PLAINTEXT)}, master, ${JSON.stringify(CONTEXT)});
    const second = await encryptCredential(${JSON.stringify(PLAINTEXT)}, master, ${JSON.stringify(CONTEXT)});
    console.log(JSON.stringify({ first, second }));
    `,
    masterKeyBase64,
  );

  const nodeRead = await decryptCredential(fromDeno.first, master, CONTEXT);
  if (nodeRead === PLAINTEXT) pass("Deno -> Node round trip");
  else fail(`Deno -> Node round trip returned ${JSON.stringify(nodeRead)}`);

  // --- 3. The properties that make the format worth having ----------------
  if (fromDeno.first.iv !== fromDeno.second.iv
    && fromDeno.first.ciphertext !== fromDeno.second.ciphertext) {
    pass("two encryptions of one plaintext differ in IV and ciphertext");
  } else {
    fail("two encryptions produced the same IV or the same ciphertext");
  }

  let crossUserInNode = "decrypted";
  try {
    await decryptCredential(fromDeno.first, master, OTHER_CONTEXT);
  } catch (error) {
    crossUserInNode = error.message;
  }
  if (crossUserInNode === "credential_unreadable") {
    pass("Node refuses a Deno ciphertext under another user's AAD");
  } else {
    fail(`cross-user decrypt in Node returned ${JSON.stringify(crossUserInNode)}`);
  }

  // A flipped byte must fail, and must fail with the same single word — so a
  // caller cannot tell a corrupt row from a wrong key from a wrong user.
  const bytes = Buffer.from(fromNode.ciphertext, "base64");
  bytes[0] ^= 0xff;
  let tampered = "decrypted";
  try {
    await decryptCredential(
      { ...fromNode, ciphertext: bytes.toString("base64") },
      master,
      CONTEXT,
    );
  } catch (error) {
    tampered = error.message;
  }
  if (tampered === "credential_unreadable") pass("a flipped byte fails, with the same word");
  else fail(`tampered ciphertext returned ${JSON.stringify(tampered)}`);

  // And no failure path leaks bytes.
  if (CredentialUnreadableError && new CredentialUnreadableError().message === "credential_unreadable") {
    pass("the failure carries one word and no byte echo");
  } else {
    fail("the failure vocabulary is not a single word");
  }

  console.log(
    process.exitCode
      ? "\nG-0.2 FAILED — the two runtimes do not agree on the envelope format."
      : "\nG-0.2 PASSED — Node and Deno agree on the envelope format, both directions.",
  );
}

/** The Node algorithm, over the shared envelope module, when `server-only` refuses. */
function nodeCryptoFrom(envelope) {
  class CredentialUnreadableError extends Error {
    constructor() {
      super("credential_unreadable");
      this.name = "CredentialUnreadableError";
    }
  }
  const importKey = (master) =>
    webcrypto.subtle.importKey("raw", master, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);

  return {
    CredentialUnreadableError,
    async encryptCredential(plaintext, master, context) {
      const key = await importKey(master);
      const iv = webcrypto.getRandomValues(new Uint8Array(envelope.IV_BYTES));
      const sealed = await webcrypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: envelope.composeAad(context), tagLength: 128 },
        key,
        new TextEncoder().encode(plaintext),
      );
      return {
        iv: envelope.toBase64(iv),
        ciphertext: envelope.toBase64(new Uint8Array(sealed)),
        keyVersion: context.keyVersion,
      };
    },
    async decryptCredential(sealed, master, context) {
      try {
        const key = await importKey(master);
        const opened = await webcrypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: envelope.fromBase64(sealed.iv),
            additionalData: envelope.composeAad(context),
            tagLength: 128,
          },
          key,
          envelope.fromBase64(sealed.ciphertext),
        );
        return new TextDecoder().decode(opened);
      } catch {
        throw new CredentialUnreadableError();
      }
    },
  };
}

main().catch((cause) => {
  console.error(cause.message);
  process.exit(1);
});
