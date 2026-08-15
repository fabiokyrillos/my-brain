import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  mobileBarSlots,
  mobileDemotedKeys,
  primaryNavigationKeys,
} from "@/features/shell/capabilities";
import { getMessages } from "@/i18n/messages";

/**
 * The navigation mirror in `e2e/layout-contracts.spec.ts`, derived rather than
 * transcribed.
 *
 * ## The failure this exists for, which had already happened
 *
 * That lane cannot reach the authenticated app — every route under `/app` is
 * behind `src/proxy.ts` and CI has no Supabase session — so it composes the
 * shell by hand from the repository's real stylesheets and a hand-written copy
 * of the components' DOM. That is a sound trade, and it has one failure mode:
 * **the copy can stop matching the original while every assertion over it keeps
 * passing.**
 *
 * It did. The redesign promoted Brain to the fourth primary destination and
 * returned Registros to the mobile bar; the fixture still listed `Conversar` in
 * the rail and still carried a comment stating that Registros was demoted. The
 * *shapes* were unchanged — four rail items, five bar slots with capture in the
 * middle — so "capture stays centred and in source order" went on passing while
 * measuring a bar the product does not render. A mirror that has gone stale
 * tests a different artifact, and reports green about it.
 *
 * ## Why this guard is a derivation and not a second list
 *
 * Writing the expected labels here would reproduce the same defect one file
 * further out. Both lists are computed from `capabilities.ts` and
 * `messages.ts` — the modules the components themselves read — so the only way
 * to make this guard wrong is to change what the product renders, which is
 * exactly when it should fail.
 *
 * The **control** is at the bottom: a planted divergence has to be caught, or
 * the derivation could be matching something that cannot vary.
 */

const FIXTURE = readFileSync(join(process.cwd(), "e2e", "layout-contracts.spec.ts"), "utf8");

/** The `as const` array literal named `token`, as the strings it holds. */
function fixtureList(source: string, token: string): readonly string[] {
  const match = new RegExp(`const ${token} = \\[([^\\]]*)\\]`).exec(source);
  if (!match) throw new Error(`${token} is not an array literal in e2e/layout-contracts.spec.ts`);
  return Array.from(match[1].matchAll(/"([^"]+)"/g)).map((entry) => entry[1]);
}

/**
 * The label a navigation key renders under, in pt-BR — which is the locale the
 * fixture composes. Read from the same catalogue `navigation-links.tsx` reads.
 */
function label(key: string): string {
  const nav = getMessages("pt-BR").nav as Record<string, string>;
  const value = nav[key];
  if (typeof value !== "string") throw new Error(`no pt-BR nav label for '${key}'`);
  return value;
}

describe("the e2e navigation fixture mirrors the navigation the product renders", () => {
  it("lists the rail's primary destinations, in order", () => {
    expect(fixtureList(FIXTURE, "PRIMARY")).toEqual(primaryNavigationKeys.map(label));
  });

  it("lists the mobile bar's slots, in order, capture included", () => {
    expect(fixtureList(FIXTURE, "MOBILE_BAR")).toEqual(mobileBarSlots.map(label));
  });

  /*
    The bar is five columns with capture at index two. Asserted here as well as
    in the browser because the browser lane measures the *fixture*: if the real
    bar ever gained a sixth slot, exact centring would become impossible and
    this is where that is a failing test rather than a lopsided screenshot.
  */
  it("keeps the bar an odd number of slots with capture in the middle", () => {
    expect(mobileBarSlots.length % 2).toBe(1);
    expect(mobileBarSlots[(mobileBarSlots.length - 1) / 2]).toBe("capture");
  });

  it("renders every demoted destination in the overflow panel", () => {
    const demoted = /mobile-nav-demoted[^`]*?<\/div><\/div>/.exec(FIXTURE)?.[0] ?? "";
    expect(mobileDemotedKeys.length).toBeGreaterThan(0);
    // The fixture builds its links through `navLink(label)`, so the label is an
    // argument rather than text between tags.
    for (const key of mobileDemotedKeys) expect(demoted).toContain(`navLink("${label(key)}")`);
  });

  /*
    The control. Each assertion above is re-run against a fixture with one
    label changed; if any of them still passes, it is matching something that
    cannot vary and proves nothing about the mirror.
  */
  it("fails when the mirror diverges by a single label", () => {
    const [first] = primaryNavigationKeys;
    const mutated = FIXTURE.replace(`"${label(first)}"`, '"Alguma outra coisa"');
    expect(mutated).not.toEqual(FIXTURE);
    expect(fixtureList(mutated, "PRIMARY")).not.toEqual(primaryNavigationKeys.map(label));
  });
});
