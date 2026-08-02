import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  CURRENT_KEY_VERSION_DEFAULT,
  keyForVersion,
  MAX_PREVIOUS_KEY_WINDOW_DAYS,
  previousKeyWindowState,
  resolveMasterKeyRing,
  summarizeRotation,
} from "./rotation";

const NOW = new Date("2026-08-02T12:00:00.000Z");
const keyOne = randomBytes(32).toString("base64");
const keyTwo = randomBytes(32).toString("base64");

function daysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

describe("the master-key ring", () => {
  it("resolves a single current key when no window is declared", () => {
    const ring = resolveMasterKeyRing({ BYOK_MASTER_KEY: keyOne }, NOW);

    expect(ring.currentVersion).toBe(CURRENT_KEY_VERSION_DEFAULT);
    expect(ring.previous).toBeNull();
    expect(ring.previousVersion).toBeNull();
  });

  it("refuses to start on a malformed current key", () => {
    expect(() => resolveMasterKeyRing({ BYOK_MASTER_KEY: "not-base64!!" }, NOW))
      .toThrow(/BYOK_MASTER_KEY/);
    expect(() => resolveMasterKeyRing({}, NOW)).toThrow(/BYOK_MASTER_KEY/);
  });

  it("refuses to start on a malformed previous key, even inside an open window", () => {
    expect(() => resolveMasterKeyRing({
      BYOK_MASTER_KEY: keyOne,
      BYOK_MASTER_KEY_VERSION: "2",
      BYOK_PREVIOUS_MASTER_KEY: randomBytes(16).toString("base64"),
      BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT: daysFromNow(5),
    }, NOW)).toThrow(/BYOK_PREVIOUS_MASTER_KEY/);
  });

  it("refuses an expiry declared without a key", () => {
    expect(() => resolveMasterKeyRing({
      BYOK_MASTER_KEY: keyOne,
      BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT: daysFromNow(5),
    }, NOW)).toThrow(/without BYOK_PREVIOUS_MASTER_KEY/);
  });

  it("refuses a previous key while the current version still says 1", () => {
    expect(() => resolveMasterKeyRing({
      BYOK_MASTER_KEY: keyTwo,
      BYOK_PREVIOUS_MASTER_KEY: keyOne,
      BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT: daysFromNow(5),
    }, NOW)).toThrow(/at least 2/);
  });

  it("opens the window when a key and an unexpired expiry are both present", () => {
    const ring = resolveMasterKeyRing({
      BYOK_MASTER_KEY: keyTwo,
      BYOK_MASTER_KEY_VERSION: "2",
      BYOK_PREVIOUS_MASTER_KEY: keyOne,
      BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT: daysFromNow(5),
    }, NOW);

    expect(ring.currentVersion).toBe(2);
    expect(ring.previousVersion).toBe(1);
    expect(ring.previous).not.toBeNull();
  });

  it("closes the window on expiry without taking the runtime down", () => {
    const ring = resolveMasterKeyRing({
      BYOK_MASTER_KEY: keyTwo,
      BYOK_MASTER_KEY_VERSION: "2",
      BYOK_PREVIOUS_MASTER_KEY: keyOne,
      BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT: daysFromNow(-1),
    }, NOW);

    expect(ring.previous).toBeNull();
    expect(ring.previousVersion).toBeNull();
    expect(ring.current).toHaveLength(32);
  });

  it(`refuses a window longer than ${MAX_PREVIOUS_KEY_WINDOW_DAYS} days rather than truncating it`, () => {
    expect(() => resolveMasterKeyRing({
      BYOK_MASTER_KEY: keyTwo,
      BYOK_MASTER_KEY_VERSION: "2",
      BYOK_PREVIOUS_MASTER_KEY: keyOne,
      BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT: daysFromNow(MAX_PREVIOUS_KEY_WINDOW_DAYS + 1),
    }, NOW)).toThrow(new RegExp(`${MAX_PREVIOUS_KEY_WINDOW_DAYS} days`));
  });

  it("accepts a window of exactly the maximum", () => {
    const ring = resolveMasterKeyRing({
      BYOK_MASTER_KEY: keyTwo,
      BYOK_MASTER_KEY_VERSION: "2",
      BYOK_PREVIOUS_MASTER_KEY: keyOne,
      BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT: daysFromNow(MAX_PREVIOUS_KEY_WINDOW_DAYS),
    }, NOW);

    expect(ring.previous).not.toBeNull();
  });

  it("refuses an unparseable expiry", () => {
    expect(() => previousKeyWindowState("whenever", NOW)).toThrow(/valid instant/);
  });

  it("refuses a non-integer current version", () => {
    expect(() => resolveMasterKeyRing({
      BYOK_MASTER_KEY: keyOne,
      BYOK_MASTER_KEY_VERSION: "1.5",
    }, NOW)).toThrow(/positive integer/);
    expect(() => resolveMasterKeyRing({
      BYOK_MASTER_KEY: keyOne,
      BYOK_MASTER_KEY_VERSION: "0",
    }, NOW)).toThrow(/positive integer/);
  });

  it("reads exactly two key names and no third", () => {
    const source = resolveMasterKeyRing.toString() + previousKeyWindowState.toString();
    const names = source.match(/BYOK_[A-Z_]*MASTER_KEY[A-Z_]*/g) ?? [];

    expect(new Set(names)).toEqual(new Set([
      "BYOK_MASTER_KEY",
      "BYOK_MASTER_KEY_VERSION",
      "BYOK_PREVIOUS_MASTER_KEY",
      "BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT",
    ]));
  });
});

describe("selecting the key for a row", () => {
  const openRing = resolveMasterKeyRing({
    BYOK_MASTER_KEY: keyTwo,
    BYOK_MASTER_KEY_VERSION: "2",
    BYOK_PREVIOUS_MASTER_KEY: keyOne,
    BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT: daysFromNow(5),
  }, NOW);
  const closedRing = resolveMasterKeyRing({ BYOK_MASTER_KEY: keyOne }, NOW);

  it("selects the current key for a current row", () => {
    expect(keyForVersion(openRing, 2)).toEqual(openRing.current);
  });

  it("selects the previous key for a previous row, inside the window", () => {
    expect(keyForVersion(openRing, 1)).toEqual(openRing.previous);
  });

  it("selects nothing for a version neither key seals", () => {
    expect(keyForVersion(openRing, 3)).toBeNull();
    expect(keyForVersion(openRing, 0)).toBeNull();
  });

  /**
   * The anti-oracle property. With the window closed, an old row is not
   * "tried and failed" — no key is offered for it at all, so it fails exactly
   * as a corrupt row does and the failure carries no information about which
   * key would have worked.
   */
  it("offers no key at all for an old row once the window has closed", () => {
    expect(keyForVersion(closedRing, 0)).toBeNull();
    expect(keyForVersion(closedRing, 2)).toBeNull();
    expect(keyForVersion(closedRing, 1)).toEqual(closedRing.current);
  });

  it("never returns more than one candidate", () => {
    for (const version of [-1, 0, 1, 2, 3, 99]) {
      const selected = keyForVersion(openRing, version);
      expect(selected === null || selected instanceof Uint8Array).toBe(true);
    }
  });
});

describe("rotation progress", () => {
  const ring = resolveMasterKeyRing({
    BYOK_MASTER_KEY: keyTwo,
    BYOK_MASTER_KEY_VERSION: "2",
    BYOK_PREVIOUS_MASTER_KEY: keyOne,
    BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT: daysFromNow(5),
  }, NOW);

  it("counts what is done and what is left", () => {
    const progress = summarizeRotation(
      [{ key_version: 2 }, { key_version: 2 }, { key_version: 1 }],
      ring,
    );

    expect(progress.atCurrentVersion).toBe(2);
    expect(progress.atPreviousVersion).toBe(1);
    expect(progress.remaining).toBe(1);
    expect(progress.complete).toBe(false);
  });

  it("reports completion only when nothing is left", () => {
    const progress = summarizeRotation([{ key_version: 2 }, { key_version: 2 }], ring);

    expect(progress.remaining).toBe(0);
    expect(progress.complete).toBe(true);
  });

  it("counts an unreadable row as remaining rather than as done", () => {
    const progress = summarizeRotation(
      [{ key_version: 2 }, { key_version: 7 }, { key_version: null }],
      ring,
    );

    expect(progress.unreadable).toBe(2);
    expect(progress.remaining).toBe(2);
    expect(progress.complete).toBe(false);
  });

  it("is complete for an empty table, which is the honest answer", () => {
    expect(summarizeRotation([], ring).complete).toBe(true);
  });
});
