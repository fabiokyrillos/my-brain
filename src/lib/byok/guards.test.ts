import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * BYOK-GUARD-005 (crypto and secret locality) and implementation-plan task 1.8
 * (the chain scan).
 *
 * ## Why a guard rather than a convention
 *
 * "The master key is only read in one place" is true today because two files
 * were written carefully. It stays true only if something fails when it stops
 * being true. The failure this guards against is not malice — it is the
 * perfectly reasonable-looking `process.env.BYOK_MASTER_KEY` added inside a
 * Server Action six months from now by someone who needed a key and found the
 * name in a comment.
 *
 * ## Both directions, always
 *
 * Each allowlist below is compared **both ways**: a file that reads a secret and
 * is not listed fails, and a listed file that no longer reads one fails too. The
 * second half is the one people leave out, and it is what stops an allowlist
 * becoming a graveyard of entries nobody can justify — the shape
 * `direct-write-guard.test.ts` established.
 */

const REPO = path.resolve(__dirname, "../../..");

/** Where product and worker code lives. Everything here is in scope. */
const SCANNED_ROOTS = ["src", "supabase/functions", "supabase/migrations", "scripts", "e2e"];

const SKIPPED_DIRECTORIES = new Set(["node_modules", ".next", "dist", "coverage"]);

function walk(root: string): string[] {
  const absolute = path.join(REPO, root);
  const found: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
        visit(path.join(directory, entry.name));
        continue;
      }
      found.push(path.relative(REPO, path.join(directory, entry.name)).replace(/\\/g, "/"));
    }
  };
  try {
    if (statSync(absolute).isDirectory()) visit(absolute);
  } catch {
    // A root that does not exist is a bug in this list, caught below.
    throw new Error(`scanned root is missing: ${root}`);
  }
  return found;
}

const ALL_FILES = SCANNED_ROOTS.flatMap(walk).sort();

function read(relative: string): string {
  return readFileSync(path.join(REPO, relative), "utf8").replace(/\r\n/g, "\n");
}

/**
 * Comments are stripped before every locality scan.
 *
 * Without this the guard forbids *documenting* the thing it guards, and the
 * documentation is how the next person learns why the rule exists. The parity
 * lock hit exactly this and the fix was the same.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/[^\n]*$/gm, "")
    .replace(/^\s*--[^\n]*$/gm, "");
}

/** The one crypto module per runtime, and nothing else. */
const CRYPTO_MODULES = [
  "src/lib/byok/crypto.ts",
  "supabase/functions/_shared/byok-envelope.ts",
];

/**
 * The rotation-window modules, which read the **master key names** without
 * being crypto cores.
 *
 * `BYOK-ROTATION` needs to answer *which* key material applies to a row before
 * anything decrypts, and that answer depends on `BYOK_MASTER_KEY`,
 * `BYOK_PREVIOUS_MASTER_KEY` and the window's expiry. So these two files read
 * key names — and nothing else: they never call `subtle`, never construct a
 * `CryptoKey`, never see a ciphertext and never see a plaintext. They are
 * listed here rather than folded into `CRYPTO_MODULES` precisely so the
 * `subtle`-locality guard keeps naming **two** files, which is the stricter
 * claim and the one that matters.
 *
 * They do **not** read `BYOK_FINGERPRINT_PEPPER`, which is why the allowlist
 * below is per-secret rather than shared.
 */
const ROTATION_MODULES = [
  "src/lib/byok/rotation.ts",
  "supabase/functions/_shared/byok-rotation.ts",
];

const SECRET_READERS: Record<string, readonly string[]> = {
  BYOK_MASTER_KEY: [...CRYPTO_MODULES, ...ROTATION_MODULES].sort(),
  BYOK_FINGERPRINT_PEPPER: CRYPTO_MODULES,
};

/**
 * Files that legitimately mention the primitives while not being product code.
 *
 * `parity.test.ts` and this file read the crypto sources as *text* to assert
 * things about them; `byok-crypto-interop.mjs` is gate G-0.2's executable proof
 * and is a script, not a runtime path. `crypto.test.ts` and `fingerprint.test.ts`
 * exercise the core through its exports.
 */
const SCAN_EXEMPT = [
  "src/lib/byok/parity.test.ts",
  "src/lib/byok/guards.test.ts",
  "src/lib/byok/crypto.test.ts",
  "src/lib/byok/fingerprint.test.ts",
  "scripts/byok-crypto-interop.mjs",
  // BYOK.6's bounded rotation, and the same class as the interop proof: an
  // **operator** script, not a runtime path. Nothing in the product imports it,
  // no request can reach it, and it runs only where the master keys already
  // are. It genuinely performs keyed crypto — re-sealing a credential under the
  // current key is the entire operation — and pretending otherwise by routing
  // it through the core would mean shipping a runtime module whose only caller
  // is an operator command.
  //
  // The exemption is bounded by the assertion below, which requires this file
  // to re-seal under the *row's own* declared version and never to trial a
  // second key.
  "scripts/byok-rotate-master-key.mjs",
];

function filesMatching(pattern: RegExp): string[] {
  return ALL_FILES.filter((file) => {
    if (SCAN_EXEMPT.includes(file)) return false;
    if (!/\.(ts|tsx|mjs|js|sql)$/.test(file)) return false;
    return pattern.test(code(read(file)));
  });
}

/**
 * The one pre-existing `crypto.subtle` call outside the cores, named rather than
 * excused.
 *
 * `process-jobs/product-events.ts:28` computes a **keyless** `SHA-256` digest for
 * an analytics idempotency key. It predates BYOK, it takes no key parameter, and
 * there is therefore no reachable path by which it can encrypt, decrypt, sign or
 * otherwise touch a credential — which is the property BYOK-GUARD-005 exists to
 * protect. Read literally the requirement forbids it; read for its purpose it
 * does not, and rewriting a working analytics hash to route through the BYOK
 * crypto core would couple product analytics to the credential system for no
 * gain in safety.
 *
 * The exception is bounded three ways: it is one named file, the keyed-operation
 * assertion below admits **no** exceptions at all, and a test asserts this file
 * still contains only the keyless call.
 */
const KEYLESS_DIGEST_EXCEPTION = "supabase/functions/process-jobs/product-events.ts";

/**
 * Phase 2M slice 2M.4b — the one module that performs KEYED crypto outside the
 * cores, and the reason the rule bends here rather than breaking.
 *
 * ## What changed
 *
 * Until this slice, the keyed-operation assertion admitted **no** exceptions at
 * all, and that was the right shape while the only keyed crypto in the
 * repository was BYOK's. Web Push is the first thing that genuinely needs its
 * own: RFC 8291 is ECDH + HKDF + AES-128-GCM to a **per-subscription** key the
 * browser generated, and RFC 8292 is an ES256 signature over a VAPID pair. None
 * of those primitives, key types or key sources exist in the BYOK core.
 *
 * ## Why routing it through the core would be WORSE, not stricter
 *
 * `byok-envelope.ts` seals credentials under the master key. Teaching it ECDH
 * and ECDSA would put the push sender's code inside the module that holds
 * `BYOK_MASTER_KEY` — giving a notification path a call site inside the
 * credential crypto core. The rule exists so that nothing outside the cores can
 * touch a credential; satisfying it literally here would achieve the opposite of
 * its purpose.
 *
 * ## What the exception is bounded by, so it stays as strong as the rule
 *
 * The property BYOK-GUARD-005 protects is *credential* locality, and the four
 * assertions below keep it exactly: these files may never read a BYOK secret
 * name, may never import a BYOK module, may never be imported BY one, and the
 * list itself is closed. A push module that acquired any path to key material
 * reds the build.
 */
const PUSH_CRYPTO_EXCEPTION = [
  "supabase/functions/_shared/web-push.ts",
  "supabase/functions/_shared/web-push.test.ts",
];

/** Every BYOK secret whose name must never appear in the push crypto module. */
const BYOK_SECRET_NAMES = /BYOK_MASTER_KEY|BYOK_PREVIOUS_MASTER_KEY|BYOK_FINGERPRINT_PEPPER|BYOK_RATE_LIMIT_PEPPER/;

describe("BYOK-GUARD-005: crypto locality", () => {
  it("no module outside the two crypto cores performs a KEYED crypto operation", () => {
    // The strict half. `fingerprint.ts` is the module this rule was most likely
    // to be bent for: it needs HMAC, and reaching for `crypto.subtle` there
    // would have been the obvious thing to write. It calls `hmacSha256` in the
    // core instead, and this assertion is why.
    //
    // The push crypto module is the ONE named exception, and the four
    // assertions after this block are what keep it from being a hole.
    expect(
      filesMatching(/\bsubtle\.(?:importKey|deriveKey|deriveBits|encrypt|decrypt|sign|verify|wrapKey|unwrapKey)\b/),
    ).toEqual([...CRYPTO_MODULES, ...PUSH_CRYPTO_EXCEPTION].sort());
  });

  it("no module outside the two crypto cores creates an AES-GCM or HMAC key", () => {
    // Only the push crypto IMPLEMENTATION names these algorithms, not its test:
    // the test drives the module through its exports and reaches for ECDH and
    // ECDSA directly to build fixtures. Listing the test here anyway would be a
    // permission granted to a file that is not using it.
    expect(filesMatching(/["']AES-GCM["']|["']HMAC["']/)).toEqual(
      [...CRYPTO_MODULES, "supabase/functions/_shared/web-push.ts"].sort(),
    );
  });

  it("touches the WebCrypto subtle surface at all only in the cores and the named exceptions", () => {
    // Both spellings. The Node core reaches it as `webcrypto.subtle` (the
    // `node:crypto` export), Deno and the Edge runtime as the global
    // `crypto.subtle`; a pattern matching only one of them would have declared
    // the Node core clean while it was doing all the encryption.
    expect(filesMatching(/\b(?:crypto|webcrypto)\.subtle\b/)).toEqual(
      [
        ...CRYPTO_MODULES,
        KEYLESS_DIGEST_EXCEPTION,
        ...PUSH_CRYPTO_EXCEPTION,
        // The sender's orchestration computes the suppression event's
        // idempotency digest, keyless, exactly as `product-events.ts` does.
        "supabase/functions/send-push/deliver.ts",
        "supabase/functions/send-push/deliver.test.ts",
      ].sort(),
    );
  });

  it("keeps the push crypto exception to exactly the files that earned it", () => {
    expect([...PUSH_CRYPTO_EXCEPTION].sort()).toEqual([
      "supabase/functions/_shared/web-push.test.ts",
      "supabase/functions/_shared/web-push.ts",
    ]);
  });

  it("keeps the push crypto module unable to read ANY BYOK secret", () => {
    /*
     * The bound that makes the exception safe. BYOK-GUARD-005 protects
     * *credential* locality, so what matters is not that this module performs
     * keyed crypto — it must — but that no key material it can reach is a
     * credential's. It reads a VAPID pair from its own environment and a
     * per-subscription key from its caller, and nothing else.
     */
    for (const file of PUSH_CRYPTO_EXCEPTION) {
      const body = read(file);
      expect(body, `${file} names a BYOK secret`).not.toMatch(BYOK_SECRET_NAMES);
    }
    // Non-vacuity: the pattern really does fire on a file that names one, so
    // the loop above is not passing against a regex that matches nothing.
    expect(read("supabase/functions/_shared/byok-envelope.ts")).toMatch(BYOK_SECRET_NAMES);
  });

  it("keeps the push crypto module and the BYOK cores mutually unreachable", () => {
    // Neither direction. An import either way would give one system a call site
    // inside the other, which is the whole thing this requirement forbids —
    // and it is the failure mode that "route it through the core instead" would
    // have created deliberately.
    for (const file of PUSH_CRYPTO_EXCEPTION) {
      expect(read(file), `${file} imports BYOK`).not.toMatch(/from\s+["'][^"']*byok[^"']*["']/i);
    }
    for (const core of CRYPTO_MODULES) {
      expect(read(core), `${core} imports the push crypto`).not.toMatch(/web-push/);
    }
  });

  it("and that exception is still keyless — asserted, not assumed", () => {
    // If somebody adds an `importKey` here, the strict assertion above reds
    // first. This is the belt: the exception's own body may contain `digest` and
    // nothing else from the `subtle` surface.
    const body = code(read(KEYLESS_DIGEST_EXCEPTION));
    const calls = [...body.matchAll(/\bsubtle\.(\w+)\b/g)].map((match) => match[1]);

    expect(calls.length).toBeGreaterThan(0);
    expect([...new Set(calls)]).toEqual(["digest"]);
    expect(body).not.toMatch(/BYOK_MASTER_KEY|BYOK_FINGERPRINT_PEPPER/);
  });
});

describe("BYOK-GUARD-005: secret locality", () => {
  for (const secret of ["BYOK_MASTER_KEY", "BYOK_FINGERPRINT_PEPPER"] as const) {
    it(`${secret} is read only from its declared readers`, () => {
      // The *read*, not the mention. A name in a Zod schema, a docs table or an
      // error message is not access; `process.env.X`, `env.X` and
      // `Deno.env.get("X")` are.
      const reads = new RegExp(
        `(?:process\\.env\\.${secret}\\b` +
          `|process\\.env\\[["']${secret}["']\\]` +
          `|\\benv\\.${secret}\\b` +
          `|Deno\\.env\\.get\\(\\s*["']${secret}["']` +
          `)`,
        "g",
      );
      expect(filesMatching(reads).sort()).toEqual([...SECRET_READERS[secret]].sort());
    });
  }

  it("the allowlist names files that exist and still read a secret", () => {
    // The other direction. An allowlist entry that has stopped being true is a
    // permission nobody is checking any more.
    // Not named `module`: Next's lint rule forbids assigning that identifier,
    // and a `for…of` binding counts.
    for (const core of CRYPTO_MODULES) {
      expect(ALL_FILES, `${core} must exist`).toContain(core);
      const body = code(read(core));
      expect(body, `${core} must still read a secret`).toMatch(
        /BYOK_MASTER_KEY|BYOK_FINGERPRINT_PEPPER/,
      );
      expect(body, `${core} must still be the crypto core`).toMatch(/subtle/);
    }
  });

  it("the rotation operator script never trials a second key", () => {
    // The bound on its exemption. The script may decrypt — that is its job —
    // but it must select by the row's declared version, and a `catch` that
    // reached for the other key would turn an operator tool into the oracle
    // `BYOK-CRYPTO-005` forbids. Asserted textually because the script is a
    // `.mjs` operator command with no import surface to test through.
    const script = code(read("scripts/byok-rotate-master-key.mjs"));

    expect(script, "must select by the row's own version").toMatch(
      /row\.key_version !== ring\.previousVersion/,
    );
    // Exactly two imported keys, each with a single declared usage.
    expect(script).toMatch(/importKey\(\s*"raw",\s*ring\.current,[^)]*\[\s*\n?\s*"encrypt",/);
    expect(script).toMatch(/importKey\(\s*"raw",\s*ring\.previous,[^)]*\[\s*\n?\s*"decrypt",/);
    // A failed open is skipped, never retried under another key.
    expect(script).toMatch(/UNREADABLE under the previous key/);
    expect(script.match(/subtle\.decrypt/g) ?? []).toHaveLength(1);
    expect(script.match(/subtle\.encrypt/g) ?? []).toHaveLength(1);
  });

  it("the rotation modules read key names and nothing more", () => {
    // The same both-ways discipline, with the narrower claim these files make:
    // they decide which key applies, so they must still read `BYOK_MASTER_KEY`
    // — and they must still never reach the crypto primitives, because a
    // rotation module that started decrypting would be a trial-decrypt path
    // wearing a different name.
    for (const rotationModule of ROTATION_MODULES) {
      expect(ALL_FILES, `${rotationModule} must exist`).toContain(rotationModule);
      const body = code(read(rotationModule));
      expect(body, `${rotationModule} must still read the master key name`)
        .toMatch(/BYOK_MASTER_KEY/);
      expect(body, `${rotationModule} must not touch the crypto primitives`)
        .not.toMatch(/subtle|encrypt|decrypt/);
      expect(body, `${rotationModule} must not read the fingerprint pepper`)
        .not.toMatch(/BYOK_FINGERPRINT_PEPPER/);
    }
  });

  it("fails when a fourth reader appears — proven by executing the mutation", () => {
    // A guard whose failure mode is untested is a guard nobody has run. The
    // probe is a string this test builds, matched by the same regex the
    // assertions above use, so a change that weakened the pattern would show up
    // here as a probe that stopped being detected.
    const probe = `const leaked = process.env.${"BYOK_MASTER_KEY"};`;
    const detector = /process\.env\.BYOK_MASTER_KEY\b/;

    expect(detector.test(code(probe))).toBe(true);
    // And the comment-stripping does not create a hole: a read that happens to
    // sit on the same line as a trailing comment is still a read.
    expect(detector.test(code(`${probe} // needed for a one-off`))).toBe(true);
  });
});

describe("task 1.8: the chain scan finds no key material anywhere", () => {
  it(".env.example carries every secret name with an empty value", () => {
    // Four names now. `BYOK_RATE_LIMIT_PEPPER` arrived with ADR-070 as the third
    // independent secret, and `BYOK_VALIDATION_OPENAI_API_KEY` is the opt-in
    // lane's key — deliberately not `OPENAI_API_KEY`, so the lane cannot be
    // satisfied by the project key. Every one of them carries a name and no
    // value, which is the whole contract `.env.example` has.
    const example = read(".env.example");
    for (const name of [
      "BYOK_MASTER_KEY",
      "BYOK_FINGERPRINT_PEPPER",
      "BYOK_RATE_LIMIT_PEPPER",
      "BYOK_VALIDATION_OPENAI_API_KEY",
    ]) {
      expect(example, `${name} must be present with an empty value`).toMatch(
        new RegExp(`^${name}=\\s*$`, "m"),
      );
    }
  });

  it("the validation key is never conflated with the project key", () => {
    // BYOK-GUARD-001's allowlist can only distinguish the two if they are two.
    // A future edit that "simplified" the lane onto OPENAI_API_KEY would defeat
    // the entire point of the dedicated low-limit project, so the distinctness
    // is asserted rather than assumed.
    //
    // The project key's own line is gone as of BYOK.7's convergence audit — no
    // runtime read it after the cutover — so the assertion inverts: the
    // validation lane's name must be present, and the project key's name must
    // not be offered at all. `\b` does not fire inside
    // `BYOK_VALIDATION_OPENAI_API_KEY`, since `_` is a word character, so the
    // two assertions cannot satisfy each other by accident.
    const example = read(".env.example");
    expect(example).toMatch(/^BYOK_VALIDATION_OPENAI_API_KEY=\s*$/m);
    expect(example).not.toMatch(/^OPENAI_API_KEY\s*=/m);
    expect("BYOK_VALIDATION_OPENAI_API_KEY").not.toBe("OPENAI_API_KEY");
  });

  it("no tracked file assigns a value to either secret", () => {
    // The complement of the one-shot scan recorded in
    // `BYOK_G03_MASTER_KEY_PROCEDURE.md` §7. That one ran locally, where it could
    // read `.env.local` and search for the exact provisioned bytes. This one runs
    // in CI, where those files do not exist and must not — so it asserts the
    // property from the other side: **no assignment anywhere carries a value.**
    const offenders: string[] = [];
    for (const file of [...ALL_FILES, ".env.example", "README.md"]) {
      let body: string;
      try {
        body = read(file);
      } catch {
        continue;
      }
      for (const match of body.matchAll(
        /(BYOK_MASTER_KEY|BYOK_FINGERPRINT_PEPPER|BYOK_RATE_LIMIT_PEPPER|BYOK_VALIDATION_OPENAI_API_KEY)\s*[=:]\s*(\S+)/g,
      )) {
        const value = match[2];
        // Permitted: an empty value, a placeholder, or a reference to the name
        // rather than to a literal.
        if (/^(["']?\s*["']?|\.\.\.|<[^>]*>|\$\{[^}]*\}|\$[A-Z_]+)$/.test(value)) continue;
        if (/^(process\.env|Deno\.env|env)\b/.test(value)) continue;
        // A base64-or-hex run long enough to be 32 bytes is the thing that must
        // never appear. Anything shorter cannot be a valid value: `decodeMasterKey`
        // rejects it, so it is a placeholder, not a secret.
        if (/[A-Za-z0-9+/_-]{40,}={0,2}/.test(value)) {
          offenders.push(`${file}: ${match[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no migration READS a secret, though one may explain why it does not", () => {
    // BYOK-MASTER-004: the master key must never enter the database — not as a
    // column, not in a Vault secret, not in a function body.
    //
    // The scan is over **executable** SQL, not over the whole file. The first
    // version scanned everything and reddened on `202608010067`, whose header
    // explains at length that the rate-limit pepper lives in the application
    // environment and never here. That is the third time a guard in this
    // initiative has forbidden documenting the thing it guards, and the fix is
    // the same: strip `--` lines and `comment on … is '…'` bodies, then scan.
    //
    // What survives the strip is what matters — a migration that actually
    // referenced one of these names in a function body or a `current_setting`
    // call would be reading a secret into the database, which is the defect.
    const executable = (source: string) =>
      source.replace(/^\s*--[^\n]*$/gm, "").replace(/comment on [\s\S]*?;\n/g, "");

    const offenders = ALL_FILES.filter(
      (file) =>
        file.startsWith("supabase/migrations/") &&
        /BYOK_MASTER_KEY|BYOK_FINGERPRINT_PEPPER|BYOK_RATE_LIMIT_PEPPER/.test(
          executable(read(file)),
        ),
    );
    expect(offenders).toEqual([]);

    // Non-vacuity: the stripper must not be emptying the files it scans.
    const throttle = executable(read("supabase/migrations/202608010067_byok_validation_throttle.sql"));
    expect(throttle).toContain("add column ip_hash");
    expect(throttle.length).toBeGreaterThan(500);
  });

  it("the scan actually covers the tree it claims to", () => {
    // A scan over an empty file list passes every assertion above. This is the
    // non-vacuity control.
    expect(ALL_FILES.length).toBeGreaterThan(400);
    expect(ALL_FILES).toContain("src/lib/byok/crypto.ts");
    expect(ALL_FILES).toContain("supabase/functions/_shared/byok-envelope.ts");
    expect(ALL_FILES).toContain("supabase/migrations/202608010065_byok_credential_store.sql");
  });
});
