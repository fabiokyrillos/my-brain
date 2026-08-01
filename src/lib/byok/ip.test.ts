import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { canonicalizeIp, hashClientIp, UNPARSEABLE_IP } from "./ip";
import { KEY_BYTES, type Bytes } from "./envelope";

/**
 * `BYOK-SCHEMA-010` and PRD Amendment P-1.3.
 *
 * The assertions that matter here are the **equivalence classes**: two spellings
 * of one address must land in one bucket, or the daily ceiling counts nothing
 * while appearing to work. Everything else in this file supports that one claim.
 */

function pepper(): Bytes {
  return new Uint8Array(randomBytes(KEY_BYTES)) as Bytes;
}

describe("canonicalizeIp collapses every spelling of one address", () => {
  it("IPv4: leading zeros and ports do not create new buckets", () => {
    for (const spelling of ["203.0.113.7", "203.0.113.007", "203.0.113.7:443", " 203.0.113.7 "]) {
      expect(canonicalizeIp(spelling), spelling).toBe("203.0.113.7");
    }
  });

  it("IPv6: case, expansion and compression do not create new buckets", () => {
    for (const spelling of [
      "2001:db8::1",
      "2001:DB8::1",
      "2001:0db8:0000:0000:0000:0000:0000:0001",
      "2001:db8:0:0:0:0:0:1",
      "[2001:db8::1]",
      "[2001:db8::1]:443",
      "  2001:db8::1  ",
    ]) {
      expect(canonicalizeIp(spelling), spelling).toBe("2001:db8::1");
    }
  });

  it("IPv4-mapped IPv6 lands in the SAME bucket as the plain IPv4 address", () => {
    // The one that actually bites in production: a dual-stack listener reports
    // `::ffff:203.0.113.7` for a client that a second request reaches as
    // `203.0.113.7`. Two buckets would double every attacker's ceiling.
    for (const mapped of ["::ffff:203.0.113.7", "::FFFF:203.0.113.7", "[::ffff:203.0.113.7]:443"]) {
      expect(canonicalizeIp(mapped), mapped).toBe("203.0.113.7");
    }
    expect(canonicalizeIp("::ffff:203.0.113.7")).toBe(canonicalizeIp("203.0.113.7"));
  });

  it("a zone index identifies an interface, not a host, and is dropped", () => {
    expect(canonicalizeIp("fe80::1%eth0")).toBe(canonicalizeIp("fe80::1"));
  });

  it("compresses at the longest zero run, leftmost on a tie (RFC 5952)", () => {
    // Two implementations of "canonical" must agree, or the same address hashes
    // differently depending on which one saw it first.
    expect(canonicalizeIp("2001:0:0:1:0:0:0:1")).toBe("2001:0:0:1::1");
    expect(canonicalizeIp("1:0:0:1:0:0:1:1")).toBe("1::1:0:0:1:1");
    expect(canonicalizeIp("::")).toBe("::");
    expect(canonicalizeIp("::1")).toBe("::1");
  });
});

describe("canonicalizeIp is total, and unparseable input shares ONE bucket", () => {
  it("collapses every malformed value into the same bucket", () => {
    for (const hostile of [
      "",
      "   ",
      "not-an-ip",
      "999.999.999.999",
      "203.0.113",
      "203.0.113.7.8",
      "2001:db8::1::2",
      "0x7f000001",
      "<script>",
      "203.0.113.7, 198.51.100.4",
    ]) {
      expect(canonicalizeIp(hostile), hostile).toBe(UNPARSEABLE_IP);
    }
    expect(canonicalizeIp(null)).toBe(UNPARSEABLE_IP);
    expect(canonicalizeIp(undefined)).toBe(UNPARSEABLE_IP);
  });

  it("a garbled header cannot mint unlimited distinct buckets", () => {
    // The attack this closes: if each malformed value hashed to its own bucket,
    // an attacker would send a fresh garbage header per attempt and never meet a
    // ceiling. One shared bucket means garbling is strictly *worse* than sending
    // a real address, which is the correct incentive.
    const buckets = new Set(
      Array.from({ length: 200 }, (_, index) => canonicalizeIp(`garbage-${index}`)),
    );
    expect(buckets.size).toBe(1);
  });

  it("never returns anything outside the canonical set", () => {
    // Total by construction: no input escapes as itself unless it was already
    // canonical, so a raw header value cannot reach the hash unprocessed.
    for (let index = 0; index < 200; index += 1) {
      const random = randomBytes(12).toString("base64url");
      expect(canonicalizeIp(random)).toBe(UNPARSEABLE_IP);
    }
  });
});

describe("hashClientIp produces the stored shape and nothing else", () => {
  it("is 64 lowercase hex characters — the shape the CHECK constraint accepts", () => {
    // The migration's CHECK is `^[0-9a-f]{64}$`. If these two ever disagree the
    // insert fails in production and passes in every unit test, so the shape is
    // asserted against the same pattern the database uses.
    return hashClientIp("203.0.113.7", pepper()).then((hash) => {
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  it("never contains the address, and is not derived from any part of it", async () => {
    const hash = await hashClientIp("203.0.113.7", pepper());

    // The whole address. Deterministic: a 64-character hex digest cannot
    // contain a `.`, so this can never be a coin flip.
    expect(hash).not.toContain("203.0.113.7");
    expect(hash).not.toMatch(/\./);

    // **The first draft of this test asserted `not.toContain("113")` and was
    // flaky by construction.** "113" is three hex digits, and a random
    // 64-character hex string contains any given three-digit sequence about 1.5%
    // of the time — so it passed locally, passed one CI run, and failed the
    // next. A probabilistic assertion is worse than no assertion: it fails at
    // random and teaches everyone to re-run the suite.
    //
    // The property that assertion was reaching for is *derivation*, and this is
    // how to state it deterministically: two addresses sharing every octet but
    // one produce unrelated digests, so no part of the input survives into the
    // output.
    const secret = pepper();
    const [a, b] = await Promise.all([
      hashClientIp("203.0.113.7", secret),
      hashClientIp("203.0.113.8", secret),
    ]);
    expect(a).not.toBe(b);
    // And they share no long common prefix, which a truncating or
    // prefix-preserving transform would produce.
    let shared = 0;
    while (shared < a.length && a[shared] === b[shared]) shared += 1;
    expect(shared).toBeLessThan(8);
  });

  it("hashes equal for equivalent spellings and differs for different addresses", async () => {
    const secret = pepper();
    const [plain, mapped, other] = await Promise.all([
      hashClientIp("203.0.113.7", secret),
      hashClientIp("::ffff:203.0.113.7", secret),
      hashClientIp("198.51.100.4", secret),
    ]);

    expect(mapped).toBe(plain);
    expect(other).not.toBe(plain);
  });

  it("differs under a different pepper, so a stolen table cannot confirm a guess", async () => {
    const first = await hashClientIp("203.0.113.7", pepper());
    const second = await hashClientIp("203.0.113.7", pepper());
    expect(first).not.toBe(second);
  });

  it("hashes an absent address to the shared unparseable bucket", async () => {
    const secret = pepper();
    const [absent, garbled] = await Promise.all([
      hashClientIp(null, secret),
      hashClientIp("not-an-ip", secret),
    ]);
    expect(absent).toBe(garbled);
  });
});
