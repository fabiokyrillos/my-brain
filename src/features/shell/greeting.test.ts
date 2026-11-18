import { describe, expect, it } from "vitest";

import { GREETING_NAME_MAX_LENGTH, greetingName, partOfDayIn } from "./greeting";

const SAO_PAULO = "America/Sao_Paulo"; // UTC-3 all year since 2019.

describe("partOfDayIn", () => {
  it.each([
    ["04:59", "2026-11-18T07:59:00.000Z", "evening"],
    ["05:00", "2026-11-18T08:00:00.000Z", "morning"],
    ["11:59", "2026-11-18T14:59:00.000Z", "morning"],
    ["12:00", "2026-11-18T15:00:00.000Z", "afternoon"],
    ["17:59", "2026-11-18T20:59:00.000Z", "afternoon"],
    ["18:00", "2026-11-18T21:00:00.000Z", "evening"],
    ["00:00", "2026-11-18T03:00:00.000Z", "evening"],
  ] as const)("reads %s in São Paulo as the right part of the day", (_wallClock, instant, expected) => {
    expect(partOfDayIn(new Date(instant), SAO_PAULO)).toBe(expected);
  });

  it("answers for the owner's zone, not for the instant's UTC hour", () => {
    // The owner's recording: "Boa tarde." at 23:47. That instant is 02:47 UTC
    // on the following day and 11:47 the same morning in Tokyo.
    const instant = new Date("2026-11-18T02:47:00.000Z");

    expect(partOfDayIn(instant, SAO_PAULO)).toBe("evening");
    expect(partOfDayIn(instant, "Asia/Tokyo")).toBe("morning");
    expect(partOfDayIn(instant, "Europe/Lisbon")).toBe("evening");
  });

  it("disagrees with UTC exactly where a host-zone greeting would be wrong", () => {
    // 10:30 UTC is a morning for the server and 07:30 for the owner — the same
    // word. 13:30 UTC is the server's afternoon and still the owner's morning.
    const instant = new Date("2026-11-18T13:30:00.000Z");

    expect(partOfDayIn(instant, "UTC")).toBe("afternoon");
    expect(partOfDayIn(instant, SAO_PAULO)).toBe("morning");
  });

  it("follows a zone through its daylight-saving change", () => {
    // New York is UTC-4 in July and UTC-5 in January: 16:30 UTC is 12:30 in
    // summer and 11:30 in winter.
    expect(partOfDayIn(new Date("2026-07-15T16:30:00.000Z"), "America/New_York")).toBe("afternoon");
    expect(partOfDayIn(new Date("2026-01-15T16:30:00.000Z"), "America/New_York")).toBe("morning");
  });

  it.each(["Mars/Olympus_Mons", "EST", "", "not a zone"])(
    "returns null instead of throwing for the unsupported zone %j",
    (zone) => {
      expect(() => partOfDayIn(new Date("2026-11-18T12:00:00.000Z"), zone)).not.toThrow();
      expect(partOfDayIn(new Date("2026-11-18T12:00:00.000Z"), zone)).toBeNull();
    },
  );

  it("returns null for an instant that is not one", () => {
    expect(partOfDayIn(new Date("nonsense"), SAO_PAULO)).toBeNull();
  });
});

describe("greetingName", () => {
  it("greets by the first word of the display name", () => {
    expect(greetingName("Fábio Kyrillos")).toBe("Fábio");
    expect(greetingName("Ana")).toBe("Ana");
  });

  it("trims, and splits on any whitespace", () => {
    expect(greetingName("   Fábio  ")).toBe("Fábio");
    expect(greetingName("\tMaria Clara")).toBe("Maria");
  });

  it.each([null, undefined, "", "   ", 42, {}])("has no name for %j", (value) => {
    expect(greetingName(value)).toBeNull();
  });

  it.each(["fabio@example.com", "Fábio <fabio@example.com>", "@fabio"])(
    "never greets by something that carries an e-mail address: %s",
    (value) => {
      expect(greetingName(value)).toBeNull();
    },
  );

  it.each(["Usuário", "usuário", "USUARIO", "User", " user ", "Sua conta", "Your account"])(
    "treats the placeholder %j as no name",
    (value) => {
      expect(greetingName(value)).toBeNull();
    },
  );

  it("keeps a real name that merely starts with a placeholder word", () => {
    expect(greetingName("User Friendly")).toBe("User");
    expect(greetingName("Userlândia")).toBe("Userlândia");
  });

  it("caps what it returns, without cutting a character in half", () => {
    const long = "a".repeat(GREETING_NAME_MAX_LENGTH + 25);
    expect(greetingName(long)).toBe("a".repeat(GREETING_NAME_MAX_LENGTH));

    const emoji = "😀".repeat(GREETING_NAME_MAX_LENGTH + 5);
    const capped = greetingName(emoji) ?? "";
    expect(Array.from(capped)).toHaveLength(GREETING_NAME_MAX_LENGTH);
    expect(capped).toBe("😀".repeat(GREETING_NAME_MAX_LENGTH));
  });

  it("returns markup as inert text for the renderer to escape", () => {
    expect(greetingName("<b>Fábio</b> Kyrillos")).toBe("<b>Fábio</b>");
  });
});
