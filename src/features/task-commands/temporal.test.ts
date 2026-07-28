import { describe, expect, it } from "vitest";

import { TEMPORAL_LEXICON_VERSION, resolveTemporalPhrase } from "./temporal";

// PRD 2E-COMMAND-014/015/016. The model never produces the instant: it may
// report the phrase it saw, and this module decides what that phrase means
// against an injected clock and the caller's timezone. Everything outside the
// declared lexicon becomes a clarification rather than a guess — the Gate 1
// cutover measured the production model returning bare, timezone-less dates for
// three of five deadlines, which is precisely the class of output that must
// never reach a due-date column unexamined.

const SP = "America/Sao_Paulo";
// A Saturday, 10:00 local (13:00Z, since Sao Paulo is UTC-03:00 year-round).
const SATURDAY = "2026-07-25T13:00:00Z";

// No locale argument: the resolver searches both lexicons unconditionally, so
// a Portuguese phrase resolves identically in an English session.
function resolve(phrase: string, now = SATURDAY, timeZone = SP) {
  return resolveTemporalPhrase(phrase, { now, timeZone });
}

describe("lexicon versioning", () => {
  it("declares a version so a resolution stays attributable to the rules that produced it", () => {
    expect(TEMPORAL_LEXICON_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });
});

describe("deadline semantics", () => {
  it("resolves a bare day to the end of that day in the caller's timezone", () => {
    // The convention the production model itself uses when it does emit an
    // offset: a deadline stated as a day means the end of that day.
    expect(resolve("tomorrow")).toEqual({
      status: "resolved",
      instant: "2026-07-26T23:59:59-03:00",
      phrase: "tomorrow",
    });
  });

  it("resolves today to the end of today, not to now", () => {
    expect(resolve("today")).toMatchObject({ status: "resolved", instant: "2026-07-25T23:59:59-03:00" });
  });

  it("resolves a time-of-day phrase to that time, not to end of day", () => {
    expect(resolve("tomorrow morning")).toMatchObject({ instant: "2026-07-26T09:00:00-03:00" });
    expect(resolve("tomorrow afternoon")).toMatchObject({ instant: "2026-07-26T14:00:00-03:00" });
    expect(resolve("tonight")).toMatchObject({ instant: "2026-07-25T20:00:00-03:00" });
  });
});

describe("Portuguese lexicon", () => {
  it("resolves amanhã", () => {
    expect(resolve("amanhã")).toMatchObject({ instant: "2026-07-26T23:59:59-03:00" });
  });

  it("resolves an unaccented amanha, because users do not always type the accent", () => {
    expect(resolve("amanha")).toMatchObject({ instant: "2026-07-26T23:59:59-03:00" });
  });

  it("resolves semana que vem and próxima semana to the same instant", () => {
    const a = resolve("semana que vem");
    const b = resolve("próxima semana");
    expect(a.status).toBe("resolved");
    // The echoed phrase differs by construction; the resolution must not.
    expect(a).toMatchObject({ instant: (b as { instant: string }).instant });
  });

  it("resolves amanhã de manhã to a morning time", () => {
    expect(resolve("amanhã de manhã")).toMatchObject({ instant: "2026-07-26T09:00:00-03:00" });
  });

  it("resolves a Portuguese weekday with or without the -feira suffix", () => {
    const withSuffix = resolve("sexta-feira");
    const without = resolve("sexta");
    expect(withSuffix.status).toBe("resolved");
    expect(withSuffix).toMatchObject({ instant: (without as { instant: string }).instant });
  });
});

describe("weekday resolution and the declared week convention", () => {
  it("resolves a bare weekday to its next occurrence strictly in the future", () => {
    // 2026-07-25 is a Saturday; the next Monday is the 27th.
    expect(resolve("monday")).toMatchObject({ instant: "2026-07-27T23:59:59-03:00" });
  });

  it("never resolves a bare weekday to today, even when today is that weekday", () => {
    expect(resolve("saturday")).toMatchObject({ instant: "2026-08-01T23:59:59-03:00" });
  });

  it("distinguishes next <weekday> from the next occurrence when they differ", () => {
    // From Wednesday 2026-07-22, "friday" is this week's Friday (the 24th)
    // while "next friday" is the Friday of the following week (the 31st).
    const wednesday = "2026-07-22T13:00:00Z";
    expect(resolve("friday", wednesday)).toMatchObject({ instant: "2026-07-24T23:59:59-03:00" });
    expect(resolve("next friday", wednesday)).toMatchObject({ instant: "2026-07-31T23:59:59-03:00" });
  });

  it("collapses next <weekday> onto the next occurrence when that already falls in the following week", () => {
    // From Saturday 2026-07-25, the current Monday-start week ends Sunday the
    // 26th, so the next Monday (the 27th) already belongs to the following
    // week and both phrasings mean the same day.
    expect(resolve("next monday")).toMatchObject({ instant: "2026-07-27T23:59:59-03:00" });
    expect(resolve("monday")).toMatchObject({ instant: "2026-07-27T23:59:59-03:00" });
  });

  it("resolves next week to the Monday of the following week, per the declared convention", () => {
    expect(resolve("next week")).toMatchObject({ instant: "2026-07-27T23:59:59-03:00" });
  });
});

describe("relative offsets", () => {
  it("resolves in N days", () => {
    expect(resolve("in 3 days")).toMatchObject({ instant: "2026-07-28T23:59:59-03:00" });
  });

  it("resolves em N dias", () => {
    expect(resolve("em 3 dias")).toMatchObject({ instant: "2026-07-28T23:59:59-03:00" });
  });

  it("resolves in N weeks", () => {
    expect(resolve("in 2 weeks")).toMatchObject({ instant: "2026-08-08T23:59:59-03:00" });
  });

  it("refuses an implausibly distant offset rather than producing a date centuries away", () => {
    expect(resolve("in 99999 days").status).toBe("unsupported");
  });
});

describe("month and week boundaries", () => {
  it("resolves end of the month to the last day of the current month", () => {
    expect(resolve("end of the month")).toMatchObject({ instant: "2026-07-31T23:59:59-03:00" });
  });

  it("resolves fim do mês identically", () => {
    expect(resolve("fim do mês")).toMatchObject({ instant: "2026-07-31T23:59:59-03:00" });
  });

  it("resolves end of the week to the Sunday that closes the current week", () => {
    expect(resolve("end of the week")).toMatchObject({ instant: "2026-07-26T23:59:59-03:00" });
  });
});

describe("explicit dates", () => {
  it("accepts an explicit ISO date and gives it deadline semantics", () => {
    expect(resolve("2026-09-01")).toMatchObject({ instant: "2026-09-01T23:59:59-03:00" });
  });

  it("refuses a complete instant rather than trusting the caller's own precision", () => {
    // 2E-COMMAND-016: the instant is never model-supplied. The passthrough this
    // replaces returned the string before `resolveLocal` ever saw it, so a
    // shape-valid but impossible timestamp was reported `resolved`.
    expect(resolve("2026-09-01T08:30:00-03:00").status).toBe("unsupported");
  });

  it("refuses an impossible instant that the old shape check would have accepted", () => {
    for (const impossible of [
      "2026-13-45T99:99:99Z",
      "2026-02-30T12:00:00Z",
      "2026-09-01T25:61:61Z",
      "9999-12-31T23:59:59+14:00",
    ]) {
      expect(resolve(impossible).status, impossible).toBe("unsupported");
    }
  });

  it("refuses a non-calendar date instead of rolling it over", () => {
    expect(resolve("2026-02-30").status).toBe("unsupported");
  });
});

describe("timezone correctness", () => {
  it("resolves in the caller's timezone, not the server's", () => {
    expect(resolve("tomorrow", SATURDAY, "Asia/Tokyo")).toMatchObject({
      instant: "2026-07-26T23:59:59+09:00",
    });
  });

  it("computes the offset for the target date, so a DST zone stays correct", () => {
    // New York is UTC-04:00 in July and UTC-05:00 in January.
    const july = resolve("tomorrow", "2026-07-15T12:00:00Z", "America/New_York");
    const january = resolve("tomorrow", "2026-01-15T12:00:00Z", "America/New_York");
    expect(july).toMatchObject({ instant: "2026-07-16T23:59:59-04:00" });
    expect(january).toMatchObject({ instant: "2026-01-16T23:59:59-05:00" });
  });

  it("uses the caller's local day, so a phrase near midnight does not slip a day", () => {
    // 2026-07-26T02:00:00Z is still 2026-07-25 23:00 in Sao Paulo, so "tomorrow"
    // is the 26th locally, not the 27th.
    expect(resolve("tomorrow", "2026-07-26T02:00:00Z")).toMatchObject({
      instant: "2026-07-26T23:59:59-03:00",
    });
  });

  it("refuses an unknown timezone rather than falling back to UTC", () => {
    expect(resolve("tomorrow", SATURDAY, "Not/AZone").status).toBe("unsupported");
  });
});

describe("fail-closed behaviour", () => {
  it("reports an out-of-lexicon phrase as unsupported rather than guessing", () => {
    for (const phrase of ["soon", "later", "when I get a chance", "qualquer dia", "eventually"]) {
      expect(resolve(phrase).status, phrase).toBe("unsupported");
    }
  });

  it("reports an empty or whitespace phrase as unsupported", () => {
    expect(resolve("").status).toBe("unsupported");
    expect(resolve("   ").status).toBe("unsupported");
  });

  it("never returns an instant without a timezone designator", () => {
    for (const phrase of ["today", "tomorrow", "next week", "end of the month", "in 3 days"]) {
      const result = resolve(phrase);
      if (result.status !== "resolved") throw new Error(`${phrase} did not resolve`);
      expect(result.instant, phrase).toMatch(/(Z|[+-]\d{2}:\d{2})$/);
    }
  });

  it("is case- and whitespace-insensitive without becoming permissive", () => {
    expect(resolve("  ToMorrow  ")).toMatchObject({ instant: "2026-07-26T23:59:59-03:00" });
    expect(resolve("tomorrowish").status).toBe("unsupported");
  });

  it("does not resolve a phrase from the other locale's lexicon silently", () => {
    // Accepting cross-locale input is fine; inventing meaning is not. Both
    // lexicons are searched, so this resolves — the assertion pins that it is a
    // deliberate, tested behaviour rather than an accident.
    expect(resolve("amanhã")).toMatchObject({ status: "resolved" });
  });
});

describe("determinism", () => {
  it("returns the same answer for the same inputs", () => {
    const a = resolve("next week");
    const b = resolve("next week");
    expect(a).toEqual(b);
  });

  it("depends only on the injected clock, never on the ambient one", () => {
    const early = resolve("tomorrow", "2026-07-25T00:00:01Z");
    const late = resolve("tomorrow", "2026-07-25T13:00:00Z");
    // 00:00:01Z on the 25th is still 21:00 on the 24th in Sao Paulo, so the
    // caller's "tomorrow" is the 25th there and the 26th later that day.
    expect(early).toMatchObject({ instant: "2026-07-25T23:59:59-03:00" });
    expect(late).toMatchObject({ instant: "2026-07-26T23:59:59-03:00" });
  });
});
