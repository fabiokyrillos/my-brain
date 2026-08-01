import "server-only";

import { hmacSha256 } from "./crypto";
import type { Bytes } from "./envelope";

/**
 * The per-IP half of the validation throttle — `BYOK-SCHEMA-010` and P-1.3.
 *
 * ## Why canonicalization is in the contract
 *
 * `HMAC-SHA256` over whatever string arrived in a header is not a throttle. The
 * same address reaches a server spelled many ways — `::ffff:203.0.113.7` and
 * `203.0.113.7`, `2001:DB8::1` and `2001:db8:0:0:0:0:0:1`, with and without a
 * port — and each spelling hashes to a different bucket. An attacker does not
 * even have to know that: a proxy chain produces the variation for free. The
 * ceiling would appear to work and would count nothing.
 *
 * So canonicalization is a **declared** part of `BYOK-SCHEMA-010`, and this
 * module is its one implementation.
 *
 * ## Why unparseable input hashes rather than being dropped
 *
 * A malformed `X-Forwarded-For` must not mint an unlimited supply of distinct
 * buckets, and it must not be silently exempt from the ceiling either. Every
 * unparseable value collapses into **one** shared bucket, so an attacker who
 * garbles the header throttles against everyone else doing the same — a strictly
 * worse position than a real address, which is the correct incentive.
 *
 * ## What this module never does
 *
 * It never returns the address, never logs it, and never stores it. The only
 * value that leaves here is a 64-character hex digest, which is what the
 * `ip_hash` CHECK in `202608010067` accepts and nothing else.
 */

/** The single bucket every unparseable value shares. */
export const UNPARSEABLE_IP = "unparseable";

function canonicalizeIpv4(value: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    // No leading zeros: `01.02.03.04` and `1.2.3.4` are the same address, and
    // some parsers read a leading zero as octal. Rejecting the form and
    // re-rendering from the number removes both problems.
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    octets.push(octet);
  }
  return octets.join(".");
}

/**
 * IPv6 to its canonical text form: lower-case, fully expanded, then compressed
 * at the longest run of zero groups.
 *
 * Hand-rolled rather than delegated to `node:net`, which validates but does not
 * canonicalize — `net.isIP("2001:DB8::1")` is 6 and tells us nothing about the
 * spelling.
 */
function canonicalizeIpv6(value: string): string | null {
  const lower = value.toLowerCase();
  if (!/^[0-9a-f:.]+$/.test(lower)) return null;

  const doubleColonCount = (lower.match(/::/g) ?? []).length;
  if (doubleColonCount > 1) return null;

  const [head, tail] = doubleColonCount === 1 ? lower.split("::") : [lower, null];
  const headGroups = head === "" ? [] : head.split(":");
  const tailGroups = tail === undefined || tail === null || tail === "" ? [] : tail.split(":");

  // A trailing IPv4 literal (`::ffff:203.0.113.7`) becomes two groups. The
  // IPv4-mapped case is handled after expansion, because that is where the
  // prefix is recognisable.
  const expandTrailingIpv4 = (groups: string[]): string[] | null => {
    if (groups.length === 0) return groups;
    const last = groups[groups.length - 1];
    if (!last.includes(".")) return groups;
    const v4 = canonicalizeIpv4(last);
    if (v4 === null) return null;
    const [a, b, c, d] = v4.split(".").map(Number);
    return [
      ...groups.slice(0, -1),
      ((a << 8) | b).toString(16),
      ((c << 8) | d).toString(16),
    ];
  };

  const expandedHead = expandTrailingIpv4(headGroups);
  const expandedTail = expandTrailingIpv4(tailGroups);
  if (expandedHead === null || expandedTail === null) return null;

  const missing = 8 - (expandedHead.length + expandedTail.length);
  if (doubleColonCount === 0 ? missing !== 0 : missing < 1) return null;

  const groups = [
    ...expandedHead,
    ...Array.from({ length: doubleColonCount === 1 ? missing : 0 }, () => "0"),
    ...expandedTail,
  ];
  if (groups.length !== 8) return null;

  const numeric: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    numeric.push(Number.parseInt(group, 16));
  }

  // IPv4-mapped (`::ffff:a.b.c.d`) normalizes to the IPv4 form, so the same host
  // reaching us over a dual-stack listener and over IPv4 lands in one bucket.
  if (numeric.slice(0, 5).every((group) => group === 0) && numeric[5] === 0xffff) {
    const a = numeric[6] >> 8;
    const b = numeric[6] & 0xff;
    const c = numeric[7] >> 8;
    const d = numeric[7] & 0xff;
    return `${a}.${b}.${c}.${d}`;
  }

  const hex = numeric.map((group) => group.toString(16));

  // Compress the longest run of two or more zero groups, leftmost on a tie —
  // RFC 5952's rule, so two implementations of "canonical" agree.
  let bestStart = -1;
  let bestLength = 0;
  let runStart = -1;
  for (let index = 0; index <= hex.length; index += 1) {
    if (index < hex.length && hex[index] === "0") {
      if (runStart === -1) runStart = index;
      continue;
    }
    if (runStart !== -1) {
      const length = index - runStart;
      if (length > bestLength) {
        bestLength = length;
        bestStart = runStart;
      }
      runStart = -1;
    }
  }

  if (bestLength < 2) return hex.join(":");
  const before = hex.slice(0, bestStart).join(":");
  const after = hex.slice(bestStart + bestLength).join(":");
  return `${before}::${after}`;
}

/**
 * The canonical form of one client address, or `UNPARSEABLE_IP`.
 *
 * Total by construction: every input produces a bucket, and no input produces
 * the raw string it was given unless that string was already canonical.
 */
export function canonicalizeIp(value: string | null | undefined): string {
  if (typeof value !== "string") return UNPARSEABLE_IP;

  let candidate = value.trim();
  if (candidate === "") return UNPARSEABLE_IP;

  // `[2001:db8::1]:443` — the bracketed form a proxy uses when it needs to
  // attach a port to an IPv6 address.
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(candidate);
  if (bracketed) candidate = bracketed[1];

  // `203.0.113.7:443` — a port on an IPv4 address. Only stripped when exactly
  // one colon is present, because a bare IPv6 address is full of them.
  if ((candidate.match(/:/g) ?? []).length === 1 && candidate.includes(".")) {
    candidate = candidate.slice(0, candidate.lastIndexOf(":"));
  }

  // A zone index (`fe80::1%eth0`) identifies a local interface, not a host.
  const zoneIndex = candidate.indexOf("%");
  if (zoneIndex !== -1) candidate = candidate.slice(0, zoneIndex);

  if (candidate.includes(":")) return canonicalizeIpv6(candidate) ?? UNPARSEABLE_IP;
  return canonicalizeIpv4(candidate) ?? UNPARSEABLE_IP;
}

function toHex(bytes: Bytes): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/**
 * The stored `ip_hash` for one client address.
 *
 * Takes the pepper as an argument, like every other secret consumer in this
 * feature: the only sanctioned reader of `BYOK_RATE_LIMIT_PEPPER` is
 * `requireRateLimitPepper` in the crypto core, and `BYOK-GUARD-005` asserts that
 * no other module reads it.
 *
 * Returns the full 64-character digest, untruncated — unlike the fingerprint,
 * which is shown to a human and is truncated for that reason. Nothing displays
 * this, so there is no reason to weaken it.
 */
export async function hashClientIp(
  value: string | null | undefined,
  pepper: Bytes,
): Promise<string> {
  return toHex(await hmacSha256(pepper, canonicalizeIp(value)));
}
