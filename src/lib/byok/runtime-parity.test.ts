import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  digestMatches,
  evaluateRuntimeParity,
  isParityFailure,
  parseSecretListing,
} from "../../../scripts/byok-verify-runtime-parity.mjs";

/**
 * `BYOK-MASTER` — the runtime-parity check, and the defect that made it
 * necessary.
 *
 * The first BYOK deployment put three freshly generated secrets in the Supabase
 * Edge Function store and configured the owner's credential through a Node
 * runtime holding *different* values. Every layer behaved exactly as designed —
 * the save succeeded, the fingerprint was computed, Settings reported
 * "configured" — and the deployed worker then failed the owner's first entry
 * `credential_unreadable`, terminally, forever.
 *
 * Nothing in the product could have told anybody that, and nothing should: a
 * decryption failure that named which of key, tag or AAD was wrong would be an
 * oracle (`BYOK-CRYPTO-005`). The check therefore has to live outside the
 * product, and these are its cases.
 */

const DIGEST = (value: string) => createHash("sha256").update(value).digest("hex");

const URL_VALUE = "https://example-project.supabase.co";
const MASTER = "bWFzdGVyLWtleS12YWx1ZS1leGFjdGx5LTMyLWJ5dGVz";
const PEPPER = "ZmluZ2VycHJpbnQtcGVwcGVyLXZhbHVlLXNhbXBsZQ==";
const RATE = "cmF0ZS1saW1pdC1wZXBwZXItdmFsdWUtc2FtcGxlLTA=";

function alignedRuntimes() {
  const local = new Map([
    ["NEXT_PUBLIC_SUPABASE_URL", URL_VALUE],
    ["BYOK_MASTER_KEY", MASTER],
    ["BYOK_FINGERPRINT_PEPPER", PEPPER],
    ["BYOK_RATE_LIMIT_PEPPER", RATE],
  ]);
  const deployed = new Map([
    ["SUPABASE_URL", DIGEST(URL_VALUE)],
    ["BYOK_MASTER_KEY", DIGEST(MASTER)],
    ["BYOK_FINGERPRINT_PEPPER", DIGEST(PEPPER)],
    ["BYOK_RATE_LIMIT_PEPPER", DIGEST(RATE)],
  ]);
  return { local, deployed };
}

function statusOf(findings: { name: string; status: string }[], name: string) {
  return findings.find((finding) => finding.name === name)?.status;
}

describe("parseSecretListing", () => {
  it("reads the bare-array shape the CLI emits under --output json", () => {
    const output = JSON.stringify([
      { name: "BYOK_MASTER_KEY", updated_at: "2026-08-02T02:40:40.929Z", value: DIGEST(MASTER) },
    ]);

    expect(parseSecretListing(output).get("BYOK_MASTER_KEY")).toBe(DIGEST(MASTER));
  });

  it("reads the { secrets: [...] } shape the CLI emits without the flag", () => {
    const output = `${JSON.stringify({
      secrets: [{ name: "BYOK_MASTER_KEY", value: DIGEST(MASTER), updated_at: "x" }],
      message: "",
    })}\nA new version of Supabase CLI is available`;

    expect(parseSecretListing(output).get("BYOK_MASTER_KEY")).toBe(DIGEST(MASTER));
  });

  // A third shape must degrade to "I could not read this", which the caller
  // reports as UNVERIFIABLE. Returning a partial map would let a missing name
  // read as a mismatch, and a mismatch is an instruction to re-key every user.
  it("returns an empty map rather than a partial one when the shape is unrecognized", () => {
    expect(parseSecretListing("NAME  DIGEST\nBYOK_MASTER_KEY  abc").size).toBe(0);
    expect(parseSecretListing("").size).toBe(0);
  });
});

describe("digestMatches", () => {
  it("accepts the forms a value legitimately takes between an env file and a secret store", () => {
    expect(digestMatches(MASTER, DIGEST(MASTER))).toBe(true);
    expect(digestMatches(`  ${MASTER}  `, DIGEST(MASTER))).toBe(true);
    expect(digestMatches(`"${MASTER}"`, DIGEST(MASTER))).toBe(true);
    expect(digestMatches(MASTER, DIGEST(`${MASTER}\n`))).toBe(true);
  });

  // Base64 padding is the failure this guards: splitting an env line on every
  // `=` truncates exactly the values being compared.
  it("does not accept a value whose base64 padding was lost", () => {
    expect(PEPPER.endsWith("=")).toBe(true);
    expect(digestMatches(PEPPER.replace(/=+$/, ""), DIGEST(PEPPER))).toBe(false);
  });

  it("rejects a different value", () => {
    expect(digestMatches(MASTER, DIGEST(PEPPER))).toBe(false);
    expect(digestMatches("", DIGEST(MASTER))).toBe(false);
    expect(digestMatches(MASTER, undefined)).toBe(false);
  });
});

describe("evaluateRuntimeParity", () => {
  it("passes when both runtimes hold the same three secrets and the project key is gone", () => {
    const findings = evaluateRuntimeParity(alignedRuntimes());

    expect(statusOf(findings, "digest-algorithm-control")).toBe("PASS");
    expect(statusOf(findings, "BYOK_MASTER_KEY")).toBe("PASS");
    expect(statusOf(findings, "BYOK_FINGERPRINT_PEPPER")).toBe("PASS");
    expect(statusOf(findings, "BYOK_RATE_LIMIT_PEPPER")).toBe("PASS");
    expect(statusOf(findings, "OPENAI_API_KEY")).toBe("PASS");
    expect(isParityFailure(findings)).toBe(false);
  });

  // The defect this file exists for, reproduced as a unit case.
  it("fails when the Node runtime holds a different master key from the worker", () => {
    const { local, deployed } = alignedRuntimes();
    deployed.set("BYOK_MASTER_KEY", DIGEST("a-different-master-key-entirely"));

    const findings = evaluateRuntimeParity({ local, deployed });

    expect(statusOf(findings, "BYOK_MASTER_KEY")).toBe("FAIL");
    expect(statusOf(findings, "BYOK_FINGERPRINT_PEPPER")).toBe("PASS");
    expect(isParityFailure(findings)).toBe(true);
  });

  it("fails when a required secret is missing from either side", () => {
    const missingLocally = alignedRuntimes();
    missingLocally.local.delete("BYOK_RATE_LIMIT_PEPPER");
    expect(statusOf(evaluateRuntimeParity(missingLocally), "BYOK_RATE_LIMIT_PEPPER")).toBe("FAIL");

    const missingRemotely = alignedRuntimes();
    missingRemotely.deployed.delete("BYOK_RATE_LIMIT_PEPPER");
    expect(statusOf(evaluateRuntimeParity(missingRemotely), "BYOK_RATE_LIMIT_PEPPER")).toBe("FAIL");
  });

  // Without a reproduced control the script cannot tell "different values" from
  // "different hash function", and a wrong answer here costs every user their
  // stored credential.
  it("reports UNVERIFIABLE, not a verdict, when the digest algorithm cannot be confirmed", () => {
    const { local, deployed } = alignedRuntimes();
    deployed.set("SUPABASE_URL", DIGEST("some-other-url"));

    const findings = evaluateRuntimeParity({ local, deployed });

    expect(statusOf(findings, "digest-algorithm-control")).toBe("UNVERIFIABLE");
    expect(statusOf(findings, "BYOK_MASTER_KEY")).toBeUndefined();
    expect(isParityFailure(findings)).toBe(true);
  });

  it("reports UNVERIFIABLE when the env file or the secret listing is unavailable", () => {
    expect(statusOf(evaluateRuntimeParity({ local: null, deployed: null }), "env-file")).toBe("UNVERIFIABLE");
    expect(
      statusOf(evaluateRuntimeParity({ local: alignedRuntimes().local, deployed: new Map() }), "deployed-secrets"),
    ).toBe("UNVERIFIABLE");
  });

  it("fails while the project key is still present in the deployed secret store", () => {
    const { local, deployed } = alignedRuntimes();
    deployed.set("OPENAI_API_KEY", DIGEST("sk-proj-whatever"));

    const findings = evaluateRuntimeParity({ local, deployed });

    expect(statusOf(findings, "OPENAI_API_KEY")).toBe("FAIL");
    expect(isParityFailure(findings)).toBe(true);
  });

  // BYOK-CRYPTO-005 applies to this tool as much as to the product: a check that
  // proves a mismatch by printing the values would be worse than the mismatch.
  it("never puts a secret value, digest or length into a finding", () => {
    const { local, deployed } = alignedRuntimes();
    deployed.set("BYOK_MASTER_KEY", DIGEST("a-different-master-key-entirely"));

    const rendered = JSON.stringify(evaluateRuntimeParity({ local, deployed }));

    for (const secret of [MASTER, PEPPER, RATE, DIGEST(MASTER), DIGEST(PEPPER), DIGEST(RATE)]) {
      expect(rendered).not.toContain(secret);
    }
    expect(rendered).not.toMatch(/\b(32|43|44)\s*(bytes|chars)/);
  });
});
