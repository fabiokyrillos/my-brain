import { describe, expect, it } from "vitest";

import { getDailyCycleCopy } from "@/features/daily-cycle/copy";
import { getTaskDetailCopy } from "@/features/daily-cycle/task-detail-copy";
import { getHomeCopy } from "@/features/shell/home-copy";
import { locales } from "@/lib/preferences";

import { AGENT_NAME_TOKEN, withAgentName } from "./agent-name";

describe("withAgentName", () => {
  it("substitutes the token wherever it appears, however deeply", () => {
    const copy = {
      shallow: "{agent} says hello",
      nested: { deeper: { message: "ask {agent} about it" } },
      list: ["{agent} first", "then {agent}"],
    };
    expect(withAgentName(copy, "Ada")).toEqual({
      shallow: "Ada says hello",
      nested: { deeper: { message: "ask Ada about it" } },
      list: ["Ada first", "then Ada"],
    });
  });

  it("replaces every occurrence in one string, not just the first", () => {
    expect(withAgentName({ s: "{agent} and {agent}" }, "Ada")).toEqual({ s: "Ada and Ada" });
  });

  it("leaves strings without the token exactly as they were", () => {
    const copy = { untouched: "Nothing to replace here" };
    expect(withAgentName(copy, "Ada")).toEqual(copy);
  });

  it("passes functions through by reference", () => {
    // Several copy entries are already `(count: number) => string`. Re-wrapping
    // them would break identity for no gain.
    const fn = (count: number) => `${count} items`;
    const result = withAgentName({ fn }, "Ada");
    expect(result.fn).toBe(fn);
  });

  it("does not mutate its input", () => {
    const copy = { s: "{agent}" };
    withAgentName(copy, "Ada");
    expect(copy.s).toBe("{agent}");
  });

  it("survives null and non-string leaves", () => {
    const copy = { nothing: null, count: 3, flag: true, s: "{agent}" };
    expect(withAgentName(copy, "Ada")).toEqual({ nothing: null, count: 3, flag: true, s: "Ada" });
  });

  it("accepts a name that itself looks like a token", () => {
    // Pathological but reachable: the column accepts any 1–60 characters. The
    // replacement must not then re-scan its own output.
    expect(withAgentName({ s: "{agent}" }, "{agent}")).toEqual({ s: "{agent}" });
  });
});

describe("no copy module leaks the token to a user", () => {
  // The one failure mode the token design has: a string carrying `{agent}` that
  // never reaches a getter would render the literal braces on screen. Asserted
  // against each getter's actual output rather than by grepping the source, so
  // a new token in a new key is covered the day it is added.
  function assertNoToken(value: unknown, path: string): void {
    if (typeof value === "string") {
      expect(value, `${path} still contains ${AGENT_NAME_TOKEN}`).not.toContain(AGENT_NAME_TOKEN);
      return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      assertNoToken(nested, `${path}.${key}`);
    }
  }

  for (const locale of locales) {
    it(`daily-cycle copy — ${locale}`, () => {
      assertNoToken(getDailyCycleCopy(locale, "Ada"), `dailyCycle[${locale}]`);
    });

    it(`task-detail copy — ${locale}`, () => {
      assertNoToken(getTaskDetailCopy(locale, "Ada"), `taskDetail[${locale}]`);
    });

    it(`home copy — ${locale}`, () => {
      assertNoToken(getHomeCopy(locale, "Ada"), `home[${locale}]`);
    });
  }

  for (const locale of locales) {
    it(`the substitution actually happened — ${locale}`, () => {
      // The mirror of the assertion above: proving no token survives is only
      // meaningful if a name reached the copy at all.
      expect(JSON.stringify(getDailyCycleCopy(locale, "Ada"))).toContain("Ada");
      expect(JSON.stringify(getTaskDetailCopy(locale, "Ada"))).toContain("Ada");
      expect(JSON.stringify(getHomeCopy(locale, "Ada"))).toContain("Ada");
    });
  }
});
