/**
 * `2N-PERSON-003`, `2N-PROJECT-006`, `2N-KNOWS-008` — the bounds proofs.
 *
 * The assertions that matter are the two boundary cases either side of the
 * limit, because that is where both available wrong answers live: a silent
 * truncation at exactly `limit`, and a confident falsehood at exactly `limit`.
 */

import { describe, expect, it } from "vitest";

import { BOUND_PROBE, boundedList, CONTEXTUAL_LIMIT, shownCount, withProbe } from "./contracts";
import { getBoundsCopy } from "./copy";
import { locales } from "@/lib/preferences";

const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `row-${index}` }));

describe("2N-PERSON-003: a bounded list knows that it is bounded", () => {
  it("is not bounded when fewer rows than the limit came back", () => {
    const list = boundedList(rows(3), 10);
    expect(list.bounded).toBe(false);
    expect(list.items).toHaveLength(3);
  });

  it("is NOT bounded when exactly the limit came back", () => {
    /*
     * The case that makes the probe necessary. A surface asking for `limit` and
     * receiving `limit` cannot distinguish "exactly this many exist" from "more
     * exist", so it must either stay silent (the audited defect) or claim a
     * truncation that may not have happened. Asking for `limit + 1` and getting
     * `limit` back settles it: there is no further row.
     */
    const list = boundedList(rows(10), 10);
    expect(list.bounded).toBe(false);
    expect(list.items).toHaveLength(10);
  });

  it("IS bounded when the probe row came back", () => {
    const list = boundedList(rows(11), 10);
    expect(list.bounded).toBe(true);
  });

  it("never renders the probe row", () => {
    const list = boundedList(rows(11), 10);
    expect(list.items).toHaveLength(10);
    expect(list.items.map((row) => row.id)).not.toContain("row-10");
  });

  it("asks for exactly one row more than it intends to show", () => {
    expect(withProbe(CONTEXTUAL_LIMIT)).toBe(CONTEXTUAL_LIMIT + 1);
    expect(BOUND_PROBE).toBe(1);
  });

  it("survives a null or undefined row set without claiming a bound", () => {
    for (const empty of [null, undefined]) {
      const list = boundedList(empty, 10);
      expect(list.bounded).toBe(false);
      expect(list.items).toHaveLength(0);
    }
  });

  it("reports a bound the FIRST hop hit, even when the second returned fewer rows", () => {
    /*
     * The two-hop case the contextual pages actually read in: 101 links come
     * back, only 95 resolve to rows. Without the upstream signal this reports
     * `bounded: false` and the page looks complete while a hundred-and-first
     * link exists — the same silent truncation, one hop earlier.
     */
    const list = boundedList(rows(95), 100, true);
    expect(list.bounded).toBe(true);
    expect(list.items).toHaveLength(95);
  });

  it("still reports the bound when only the second hop hit it", () => {
    expect(boundedList(rows(101), 100, false).bounded).toBe(true);
  });

  it("reports no bound when neither hop hit it", () => {
    // The disjunction must not become "always bounded".
    expect(boundedList(rows(95), 100, false).bounded).toBe(false);
  });

  it("defaults the upstream signal to absent, so an unaware caller is unchanged", () => {
    expect(boundedList(rows(95), 100).bounded).toBe(false);
    expect(boundedList(rows(101), 100).bounded).toBe(true);
  });

  it("reports the bound that was applied, so a notice cannot restate a different number", () => {
    expect(boundedList(rows(11), 10).limit).toBe(10);
    expect(shownCount(boundedList(rows(11), 10))).toBe(10);
  });
});

describe("2N-PERSON-003: the notice is true in both locales", () => {
  it.each(locales)("states the number actually shown in %s", (locale) => {
    const list = boundedList(rows(101), CONTEXTUAL_LIMIT);
    const text = getBoundsCopy(locale).bounded(list.items.length);
    expect(text).toContain(String(CONTEXTUAL_LIMIT));
    expect(text.length).toBeGreaterThan(0);
  });

  it.each(locales)("carries an accessible name for the region in %s", (locale) => {
    expect(getBoundsCopy(locale).boundedLabel.length).toBeGreaterThan(0);
  });

  it("says different words in the two locales, so neither is a placeholder", () => {
    expect(getBoundsCopy("pt-BR").bounded(10)).not.toBe(getBoundsCopy("en").bounded(10));
    expect(getBoundsCopy("pt-BR").boundedLabel).not.toBe(getBoundsCopy("en").boundedLabel);
  });
});

describe("mutation controls: the assertions above reject the wrong implementations", () => {
  it("catches the silent truncation the audit found", () => {
    // The defect: fetch `limit`, render `limit`, say nothing. It cannot ever
    // report a bound, which is exactly what this test proves it gets wrong.
    const silent = <T,>(fetched: readonly T[], limit: number) => ({
      items: fetched.slice(0, limit),
      bounded: false,
    });
    expect(silent(rows(101), 100).bounded).toBe(false);
    expect(boundedList(rows(101), 100).bounded).toBe(true);
  });

  it("catches the confident falsehood that would replace it", () => {
    // The plausible wrong fix: `bounded = rows.length === limit`, with no probe.
    // It claims a truncation whenever the total is exactly the limit.
    const guessing = <T,>(fetched: readonly T[], limit: number) => ({
      bounded: fetched.length === limit,
    });
    expect(guessing(rows(10), 10).bounded).toBe(true);
    expect(boundedList(rows(10), 10).bounded).toBe(false);
  });

  it("catches a probe row leaking into the rendered list", () => {
    const leaking = <T,>(fetched: readonly T[], limit: number) => ({
      items: fetched,
      bounded: fetched.length > limit,
    });
    expect(leaking(rows(11), 10).items).toHaveLength(11);
    expect(boundedList(rows(11), 10).items).toHaveLength(10);
  });
});
