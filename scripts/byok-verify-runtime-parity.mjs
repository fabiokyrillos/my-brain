/**
 * BYOK runtime parity — does the Next.js runtime hold the same BYOK secrets as
 * the deployed Supabase Edge Function runtime?
 *
 * ## Why this exists
 *
 * A credential saved by the Node runtime is AES-GCM sealed under whatever
 * `BYOK_MASTER_KEY` that process happened to hold. The worker opens it under
 * whatever `BYOK_MASTER_KEY` *it* holds. When those two differ, nothing warns
 * anybody: the save succeeds, Settings reports "configured", the fingerprint
 * looks right, and every asynchronous job then fails `credential_unreadable`
 * forever. There is no message on either side that names the real cause, because
 * `BYOK-CRYPTO-005` deliberately forbids a decryption failure from saying which
 * of key, tag or AAD was wrong.
 *
 * That is not hypothetical. It is exactly what the first BYOK deployment did:
 * three freshly generated secrets went into the Supabase secret store, the owner
 * configured a key through Settings against a Node runtime holding *different*
 * values, and the deployed worker terminally failed the owner's first entry with
 * `credential_unreadable`. The architecture behaved perfectly — it failed
 * closed, it consumed no retries, it leaked nothing. It was the *configuration*
 * that was wrong, and configuration is the part no test in CI can see.
 *
 * So this is the check that makes the invisible visible, in one command, before
 * a user's key is sealed under a key nothing else can open.
 *
 * ## What it compares, and why that is sound
 *
 * `supabase secrets list` never returns a secret value. It returns a **digest**.
 * This script hashes the local value and compares digests, so no plaintext is
 * read out of the platform and no value is printed on either side.
 *
 * The digest algorithm is not a documented part of the CLI's contract, so this
 * script refuses to trust its own assumption. It first reproduces the digest of
 * a value it can obtain independently — `SUPABASE_URL`, which is not a secret
 * and appears in the env file as `NEXT_PUBLIC_SUPABASE_URL`. If that positive
 * control does not reproduce, the script reports **UNVERIFIABLE** and exits
 * non-zero rather than emitting a pass or a fail it cannot justify. A comparison
 * that cannot tell "different values" from "different hash function" is worse
 * than no comparison, because it would be believed.
 *
 * ## What it does not do
 *
 * It reads an **env file**, not a running process. A runtime started with
 * exported shell variables can still disagree with the file this checks, and
 * nothing here can see that. It also cannot compare two runtimes it has no
 * access to — if a hosted Next.js environment exists, its variables live in that
 * platform's store and must be checked there.
 *
 * Nothing here prints a value, a digest, a length or a prefix. The output is
 * booleans and names.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** The three secrets both runtimes must agree on, byte for byte. */
const BYOK_SECRET_NAMES = ["BYOK_MASTER_KEY", "BYOK_FINGERPRINT_PEPPER", "BYOK_RATE_LIMIT_PEPPER"];

/**
 * The name that must be *absent* from the deployed secret store after the
 * cutover. Checked here so the one command covers the whole posture.
 */
const FORBIDDEN_DEPLOYED_SECRET = "OPENAI_API_KEY";

function parseArguments(argv) {
  const options = { envFile: ".env.local" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--env-file" && argv[index + 1]) {
      options.envFile = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

/**
 * Env-file parsing that keeps the value byte-exact.
 *
 * Split on the *first* `=` only: a base64 value ends in `=` padding, and a
 * greedy split would silently truncate exactly the secrets this checks.
 */
export function readEnvFile(path) {
  const values = new Map();
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  for (const line of raw.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim();
    if (!/^[A-Z0-9_]+$/.test(name)) continue;
    values.set(name, line.slice(separator + 1));
  }
  return values;
}

/**
 * The forms a value may legitimately take between an env file and a `secrets
 * set`, so a quoted or newline-terminated write is not reported as a mismatch.
 * A real difference survives all of them.
 */
export function candidateForms(value) {
  const trimmed = value.trim();
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;
  return [...new Set([value, trimmed, unquoted, `${unquoted}\n`, `${unquoted}\r\n`])];
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function digestMatches(localValue, remoteDigest) {
  if (!localValue || !remoteDigest) return false;
  return candidateForms(localValue).some((form) => sha256(form) === remoteDigest);
}

/**
 * The deployed secret listing, as `{ name -> digest }`.
 *
 * Tolerates the CLI's post-result telemetry flush for the reason
 * `linked-supabase.mjs` records, and never re-raises the CLI error object.
 */
function fetchDeployedSecretDigests() {
  const command = process.platform === "win32" ? process.env.ComSpec : "npx";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npx supabase secrets list --output json"]
      : ["supabase", "secrets", "list", "--output", "json"];

  let output = "";
  try {
    output = execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    output = typeof error?.stdout === "string" ? error.stdout : "";
  }

  return parseSecretListing(output);
}

/**
 * The CLI has shipped two shapes for this listing — a bare array under
 * `--output json` and a `{ secrets: [...] }` object without it — and the two
 * order `updated_at` and `value` differently. Parsing the JSON rather than
 * pattern-matching it means a third shape breaks loudly here instead of
 * silently returning an empty map, which this script would have to read as
 * "unverifiable" and a reader might read as "fine".
 */
export function parseSecretListing(output) {
  const digests = new Map();
  const start = output.search(/[[{]/);
  if (start === -1) return digests;
  const end = Math.max(output.lastIndexOf("]"), output.lastIndexOf("}"));
  let parsed;
  try {
    parsed = JSON.parse(output.slice(start, end + 1));
  } catch {
    return digests;
  }
  const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.secrets) ? parsed.secrets : [];
  for (const row of rows) {
    if (typeof row?.name === "string" && typeof row?.value === "string") digests.set(row.name, row.value);
  }
  return digests;
}

/**
 * The whole verdict, as data.
 *
 * Separated from printing and from the CLI call so the decision table is
 * testable without a linked project — `runtime-parity.test.ts` drives it with
 * synthetic maps, including the case this script was written for.
 */
export function evaluateRuntimeParity({ local, deployed, envFileLabel = ".env.local" }) {
  const findings = [];
  const add = (name, status, detail) => findings.push({ name, status, detail });

  if (!local) {
    add("env-file", "UNVERIFIABLE", `cannot read ${envFileLabel}`);
    return findings;
  }
  if (!deployed || deployed.size === 0) {
    add("deployed-secrets", "UNVERIFIABLE", "the Supabase CLI returned no secret listing");
    return findings;
  }

  // Positive control before any verdict. See the header comment.
  const controlValue = local.get("NEXT_PUBLIC_SUPABASE_URL") ?? "";
  const controlDigest = deployed.get("SUPABASE_URL");
  const controlHolds =
    digestMatches(controlValue, controlDigest) ||
    // The URL is stored with or without a trailing slash depending on how it was
    // set; both name the same environment.
    digestMatches(controlValue.replace(/\/$/, ""), controlDigest);

  if (!controlHolds) {
    add(
      "digest-algorithm-control",
      "UNVERIFIABLE",
      "SUPABASE_URL's digest could not be reproduced, so a mismatch below would be unattributable",
    );
  } else {
    add("digest-algorithm-control", "PASS", "SUPABASE_URL digest reproduced");

    for (const name of BYOK_SECRET_NAMES) {
      const localValue = local.get(name);
      const remoteDigest = deployed.get(name);
      if (!localValue) add(name, "FAIL", `absent from ${envFileLabel}`);
      else if (!remoteDigest) add(name, "FAIL", "absent from the deployed Edge Function secrets");
      else if (digestMatches(localValue, remoteDigest)) add(name, "PASS", "both runtimes hold the same value");
      else {
        add(
          name,
          "FAIL",
          "the two runtimes hold DIFFERENT values — credentials sealed by one cannot be opened by the other",
        );
      }
    }
  }

  add(
    FORBIDDEN_DEPLOYED_SECRET,
    deployed.has(FORBIDDEN_DEPLOYED_SECRET) ? "FAIL" : "PASS",
    deployed.has(FORBIDDEN_DEPLOYED_SECRET)
      ? "still present in the deployed Edge Function secrets"
      : "absent from the deployed Edge Function secrets",
  );

  return findings;
}

export function isParityFailure(findings) {
  return findings.some((finding) => finding.status === "FAIL" || finding.status === "UNVERIFIABLE");
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  console.log(`BYOK runtime parity — env file: ${options.envFile}\n`);

  const local = readEnvFile(options.envFile);
  const findings = evaluateRuntimeParity({
    local,
    deployed: local ? fetchDeployedSecretDigests() : null,
    envFileLabel: options.envFile,
  });

  for (const finding of findings) {
    console.log(`${finding.status.padEnd(12)} ${finding.name}${finding.detail ? ` — ${finding.detail}` : ""}`);
  }

  const count = (status) => findings.filter((finding) => finding.status === status).length;
  const failed = isParityFailure(findings);
  console.log(
    `\n${failed ? "NOT IN PARITY" : "IN PARITY"} — ${count("PASS")} pass, ${count("FAIL")} fail, ` +
      `${count("UNVERIFIABLE")} unverifiable`,
  );

  if (failed) {
    console.log(
      "\nA BYOK secret mismatch is silent at save time and terminal at execution time.\n" +
        "Fix the runtime configuration first, then re-enter every affected credential\n" +
        "through Settings: ciphertext sealed under a key no runtime holds is not recoverable.",
    );
  }

  process.exitCode = failed ? 1 : 0;
}

// Importing this module for its pure helpers must not shell out to the CLI.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
