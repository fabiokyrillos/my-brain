import { describe, expect, it } from "vitest";
import { decideQuestionSurfacing, type QuestionSurfacingInput } from "./question-surfacing";

// A deterministic baseline: São Paulo (UTC-3), well outside quiet hours,
// under cap, no recent nudge, one open question. Every branch test overrides
// exactly the field it exercises so the surfaced/suppressed reason is never
// ambiguous.
function baseInput(overrides: Partial<QuestionSurfacingInput> = {}): QuestionSurfacingInput {
  return {
    now: new Date("2026-07-24T17:00:00Z"), // 14:00 in America/Sao_Paulo
    timezone: "America/Sao_Paulo",
    quietStart: "22:30:00",
    quietEnd: "07:00:00",
    maxFollowupsPerDay: 5,
    importantReminderOverride: false,
    openQuestionCount: 1,
    hasImportantQuestion: false,
    deliveredToday: 0,
    lastProactiveNudgeAt: null,
    ...overrides,
  };
}

describe("decideQuestionSurfacing", () => {
  it("surfaces when there is an open question, outside quiet hours, under cap, and past cooldown", () => {
    const decision = decideQuestionSurfacing(baseInput());
    expect(decision).toEqual({ surface: true, reason: "surface", openQuestionCount: 1 });
  });

  it("never surfaces when there are no open questions", () => {
    const decision = decideQuestionSurfacing(baseInput({ openQuestionCount: 0 }));
    expect(decision).toEqual({ surface: false, reason: "no_open_questions", openQuestionCount: 0 });
  });

  it("passes the open-question count through unchanged", () => {
    const decision = decideQuestionSurfacing(baseInput({ openQuestionCount: 4 }));
    expect(decision.openQuestionCount).toBe(4);
  });

  it("suppresses inside local quiet hours", () => {
    // 04:00 in São Paulo → inside the 22:30–07:00 window.
    const decision = decideQuestionSurfacing(baseInput({ now: new Date("2026-07-24T07:00:00Z") }));
    expect(decision).toEqual({ surface: false, reason: "quiet_hours", openQuestionCount: 1 });
  });

  it("computes quiet hours in the user's own timezone, not UTC", () => {
    // 23:00 UTC is 20:00 in São Paulo (awake) but 08:00 in Asia/Tokyo (awake);
    // the same instant is inside a Tokyo night window only when evaluated there.
    const awake = decideQuestionSurfacing(baseInput({ now: new Date("2026-07-24T23:00:00Z") }));
    expect(awake.surface).toBe(true);
    const tokyoNight = decideQuestionSurfacing(
      baseInput({ now: new Date("2026-07-24T15:00:00Z"), timezone: "Asia/Tokyo" }), // 00:00 in Tokyo
    );
    expect(tokyoNight).toEqual({ surface: false, reason: "quiet_hours", openQuestionCount: 1 });
  });

  it("treats an empty quiet window (start === end) as never quiet", () => {
    const decision = decideQuestionSurfacing(
      baseInput({ now: new Date("2026-07-24T07:00:00Z"), quietStart: "00:00:00", quietEnd: "00:00:00" }),
    );
    expect(decision.surface).toBe(true);
  });

  it("suppresses once the daily cap has been reached", () => {
    const decision = decideQuestionSurfacing(baseInput({ maxFollowupsPerDay: 3, deliveredToday: 3 }));
    expect(decision).toEqual({ surface: false, reason: "daily_cap_reached", openQuestionCount: 1 });
  });

  it("suppresses when the cap is zero (nudges disabled)", () => {
    const decision = decideQuestionSurfacing(baseInput({ maxFollowupsPerDay: 0, deliveredToday: 0 }));
    expect(decision).toEqual({ surface: false, reason: "daily_cap_reached", openQuestionCount: 1 });
  });

  it("still surfaces while below the cap", () => {
    const decision = decideQuestionSurfacing(baseInput({ maxFollowupsPerDay: 3, deliveredToday: 2 }));
    expect(decision.surface).toBe(true);
  });

  it("suppresses inside the rolling cooldown after a recent nudge", () => {
    const decision = decideQuestionSurfacing(
      baseInput({ lastProactiveNudgeAt: "2026-07-24T10:00:00Z" }), // 7h before now
    );
    expect(decision).toEqual({ surface: false, reason: "cooldown", openQuestionCount: 1 });
  });

  it("surfaces again once the cooldown window has fully elapsed", () => {
    const decision = decideQuestionSurfacing(
      baseInput({ lastProactiveNudgeAt: "2026-07-23T16:00:00Z" }), // >24h before now
    );
    expect(decision.surface).toBe(true);
  });

  it("honors a custom cooldown window", () => {
    const decision = decideQuestionSurfacing(
      baseInput({ lastProactiveNudgeAt: "2026-07-24T16:00:00Z", cooldownMs: 30 * 60 * 1000 }),
    );
    expect(decision.surface).toBe(true); // 1h ago, cooldown only 30m
  });

  it("ignores an unparseable last-nudge timestamp instead of blocking forever", () => {
    const decision = decideQuestionSurfacing(baseInput({ lastProactiveNudgeAt: "not-a-date" }));
    expect(decision.surface).toBe(true);
  });

  it("lets an important question with the override bypass quiet hours", () => {
    const decision = decideQuestionSurfacing(
      baseInput({
        now: new Date("2026-07-24T07:00:00Z"),
        hasImportantQuestion: true,
        importantReminderOverride: true,
      }),
    );
    expect(decision.surface).toBe(true);
  });

  it("does not bypass quiet hours when the override is off", () => {
    const decision = decideQuestionSurfacing(
      baseInput({
        now: new Date("2026-07-24T07:00:00Z"),
        hasImportantQuestion: true,
        importantReminderOverride: false,
      }),
    );
    expect(decision).toEqual({ surface: false, reason: "quiet_hours", openQuestionCount: 1 });
  });

  it("does not bypass quiet hours for a non-important question even with the override on", () => {
    const decision = decideQuestionSurfacing(
      baseInput({
        now: new Date("2026-07-24T07:00:00Z"),
        hasImportantQuestion: false,
        importantReminderOverride: true,
      }),
    );
    expect(decision).toEqual({ surface: false, reason: "quiet_hours", openQuestionCount: 1 });
  });

  it("lets an important override bypass the cap and cooldown too", () => {
    const decision = decideQuestionSurfacing(
      baseInput({
        maxFollowupsPerDay: 1,
        deliveredToday: 5,
        lastProactiveNudgeAt: "2026-07-24T16:30:00Z",
        hasImportantQuestion: true,
        importantReminderOverride: true,
      }),
    );
    expect(decision.surface).toBe(true);
  });

  it("evaluates gates in a stable order: quiet hours before cap before cooldown", () => {
    const decision = decideQuestionSurfacing(
      baseInput({
        now: new Date("2026-07-24T07:00:00Z"), // quiet
        maxFollowupsPerDay: 1,
        deliveredToday: 5, // also over cap
        lastProactiveNudgeAt: "2026-07-24T06:30:00Z", // also within cooldown
      }),
    );
    expect(decision.reason).toBe("quiet_hours");
  });
});
