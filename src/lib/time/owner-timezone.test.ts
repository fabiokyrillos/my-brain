import { describe, expect, it } from "vitest";

import { defaultAgentPreferences } from "@/lib/preferences";

import { resolveOwnerTimeZone } from "./owner-timezone";

/**
 * `LDC-CONTRACT-001` — the zone comes from the owner's preference, once.
 *
 * Before this module there were **three byte-identical copies** of the check
 * (`operations/actions.ts`, `task-commands/actions.ts`,
 * `task-commands/detail-actions.ts`) and a fourth, stricter rule inside the
 * local-day contract. Four copies of "is this zone usable" is three chances for
 * one to drift, and the drift would be invisible: every copy answers the same
 * for `America/Sao_Paulo`, and they disagree only on the values that matter.
 */

describe("LDC-CONTRACT-001: one resolver, and it prefers the owner's stored zone", () => {
  it("returns a stored IANA zone unchanged, in both hemispheres", () => {
    for (const zone of ["America/Sao_Paulo", "Australia/Sydney", "Europe/Lisbon", "America/Santiago", "UTC"]) {
      expect(resolveOwnerTimeZone(zone)).toBe(zone);
    }
  });

  it("falls back to the declared default when the profile has no zone", () => {
    for (const missing of [null, undefined, ""]) {
      expect(resolveOwnerTimeZone(missing)).toBe(defaultAgentPreferences.timezone);
    }
  });

  it("falls back rather than throwing on a value that is not a zone at all", () => {
    for (const junk of ["Not/AZone", 42, {}, [], true, "  "]) {
      expect(resolveOwnerTimeZone(junk)).toBe(defaultAgentPreferences.timezone);
    }
  });

  it("refuses a bare abbreviation, because it is a fixed offset wearing a zone's name", () => {
    /*
     * The one place this resolver is deliberately STRICTER than the three copies
     * it replaces. `new Intl.DateTimeFormat("en-US", { timeZone: "EST" })`
     * constructs happily, and `EST` carries no DST rule — a day computed in it
     * would be silently fixed-offset, which is the first thing this initiative
     * forbids.
     *
     * Nothing reachable regresses: `profiles.timezone` is written through
     * `profileSchema`, whose `ianaTimezone` already requires `includes("/")` or
     * `UTC`, so a stored abbreviation cannot be produced by the product. A
     * legacy row carrying one now resolves to the declared default instead of to
     * a zone that lies about summer.
     */
    for (const abbreviation of ["EST", "PST", "GMT", "CET", "BRT"]) {
      expect(resolveOwnerTimeZone(abbreviation)).toBe(defaultAgentPreferences.timezone);
    }
  });

  it("agrees with the write path about what is storable", async () => {
    // The two ends of the same rule, asserted against each other rather than
    // described. If `profileSchema` ever widens, this fails and the reader has
    // to be widened deliberately instead of by accident.
    const { profileSchema } = await import("@/features/profile/schema");
    const field = profileSchema.shape.timezone;
    for (const zone of ["America/Sao_Paulo", "UTC", "Pacific/Auckland"]) {
      expect(field.safeParse(zone).success, `${zone} is storable`).toBe(true);
      expect(resolveOwnerTimeZone(zone), `${zone} survives the read`).toBe(zone);
    }
    for (const refused of ["EST", "Not/AZone", ""]) {
      expect(field.safeParse(refused).success, `${refused} is not storable`).toBe(false);
      expect(resolveOwnerTimeZone(refused)).toBe(defaultAgentPreferences.timezone);
    }
  });

  it("never returns a value the local-day contract would reject", async () => {
    // The property that makes this resolver safe to hand straight to
    // `localDayBounds`, which throws on an unsupported zone. Every output —
    // including every fallback — must be one the contract accepts.
    const { isSupportedTimeZone } = await import("./local-day");
    for (const input of ["America/Sao_Paulo", "EST", null, "", 7, "Not/AZone", undefined]) {
      expect(isSupportedTimeZone(resolveOwnerTimeZone(input))).toBe(true);
    }
  });
});
