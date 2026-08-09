/**
 * The sensitivity contract's own tests (`2J-PRIVACY-001` … `005`).
 *
 * This is the one file permitted to name literal sensitivity levels outside the
 * contract module — `sensitivity-boundary.test.ts` grants it that exemption
 * explicitly, and grants it to nothing else. A control that is exempt from the
 * mechanism it controls proves nothing, so the exemption is narrow and named.
 */

import { describe, expect, it } from "vitest";

import {
  GOVERNED_SURFACES,
  NO_REVEALS,
  SENSITIVITY_LEVELS,
  isRevealed,
  notificationCopy,
  presentationFor,
  resolveContent,
  toSensitivityLevel,
  visibleCount,
  type GovernedSurface,
  type SensitivityLevel,
} from "./contracts";

describe("2J-PRIVACY-001: one contract governs every surface it names", () => {
  it("answers for every surface/level pair, with no gaps", () => {
    for (const surface of GOVERNED_SURFACES) {
      for (const level of SENSITIVITY_LEVELS) {
        const presentation = presentationFor(surface, level);
        expect(presentation.outcome, `${surface}/${level}`).toMatch(/^(show|mask|omit)$/);
      }
    }
  });

  it("leaves normal and private unchanged on every in-app surface", () => {
    const inApp = GOVERNED_SURFACES.filter((surface) => surface !== "notification");
    for (const surface of inApp) {
      for (const level of ["normal", "private"] as const) {
        expect(presentationFor(surface, level).outcome, `${surface}/${level}`).toBe("show");
      }
    }
  });

  it("masks highly_sensitive on every in-app surface, and offers a reveal", () => {
    const inApp = GOVERNED_SURFACES.filter((surface) => surface !== "notification");
    for (const surface of inApp) {
      const presentation = presentationFor(surface, "highly_sensitive");
      expect(presentation.outcome, surface).toBe("mask");
      expect(presentation.revealable, surface).toBe(true);
    }
  });

  it("does not govern search, because ADR-093 already signed it", () => {
    expect(GOVERNED_SURFACES).not.toContain("search");
  });

  it("governs chat, which Phase 2K added and Phase 2J did not reach (2K-PRIVACY-001)", () => {
    // Named rather than left to the loops above: `chat` was the one content
    // surface with no policy at all, and a list that silently lost it would
    // still satisfy every generic assertion in this describe block.
    expect(GOVERNED_SURFACES).toContain("chat");
    expect(presentationFor("chat", "normal").outcome).toBe("show");
    expect(presentationFor("chat", "private").outcome).toBe("show");
    expect(presentationFor("chat", "highly_sensitive")).toEqual({ outcome: "mask", revealable: true });
  });
});

describe("2J-PRIVACY-001: notifications carry no user content at any level", () => {
  it("omits content for every level, not merely for highly_sensitive", () => {
    for (const level of SENSITIVITY_LEVELS) {
      expect(presentationFor("notification", level).outcome, level).toBe("omit");
    }
  });

  it("offers no reveal, because the payload has already left the application", () => {
    for (const level of SENSITIVITY_LEVELS) {
      expect(presentationFor("notification", level).revealable).toBe(false);
    }
    expect(resolveContent("notification", "normal", "k", { revealed: new Set(["k"]) })).toEqual({
      show: false,
      masked: false,
      revealable: false,
    });
  });

  it("takes no content parameter at all, in either locale", () => {
    // The signature is the enforcement. If this ever grows a content argument,
    // the privacy property degrades to a promise callers make.
    expect(notificationCopy.length).toBe(1);
    for (const locale of ["pt-BR", "en"] as const) {
      const copy = notificationCopy(locale);
      expect(copy.title).toBe("My Brain");
      expect(copy.body.length).toBeGreaterThan(10);
      // No entity name, no excerpt, no title of anything the user wrote.
      expect(copy.body).not.toMatch(/Aurora|contrato|task|entry|memory/i);
    }
  });
});

describe("2J-PRIVACY-004: masking never leaks a count", () => {
  it("counts masked and unmasked items alike", () => {
    const items = [
      { level: "normal" as SensitivityLevel },
      { level: "highly_sensitive" as SensitivityLevel },
      { level: "private" as SensitivityLevel },
    ];
    expect(visibleCount(items)).toBe(3);
    // The property that matters: the count does not change when the sensitive
    // item is present, so an observer cannot difference two renders to learn
    // that something was withheld.
    const withoutSensitive = items.filter((item) => item.level !== "highly_sensitive");
    expect(visibleCount(items)).not.toBe(visibleCount(withoutSensitive));
    expect(visibleCount(items)).toBe(items.length);
  });

  it("masks in place rather than excluding, so the row still exists", () => {
    const resolved = resolveContent("attention", "highly_sensitive", "entry-1");
    expect(resolved.masked).toBe(true);
    expect(resolved.show).toBe(false);
    expect(resolved.revealable).toBe(true);
  });
});

describe("2J-PRIVACY-002: the reveal is local, explicit and transient", () => {
  it("hides by default", () => {
    expect(isRevealed(NO_REVEALS, "anything")).toBe(false);
    expect(resolveContent("hoje", "highly_sensitive", "a").show).toBe(false);
  });

  it("reveals only the key that was asked for", () => {
    const state = { revealed: new Set(["a"]) };
    expect(resolveContent("hoje", "highly_sensitive", "a", state).show).toBe(true);
    expect(resolveContent("hoje", "highly_sensitive", "b", state).show).toBe(false);
  });

  it("has no persisted form", async () => {
    // A durable "show sensitive forever" mode would need a preference contract
    // OD-2J-1 says does not exist. The absence is asserted from the module's
    // own source so a future serializer cannot arrive unnoticed.
    //
    // Comments are stripped first. The first draft of this assertion failed on
    // the contract's own doc block, which uses the word "persisted" to explain
    // why nothing is persisted -- a probe reading its own prose as the defect
    // it was written to prevent.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(__dirname, "contracts.ts"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/localStorage|sessionStorage|document\.cookie/i);
  });
});

describe("2J-PRIVACY-003: unreadable classification fails closed", () => {
  it("treats an unknown or missing level as the most protective one", () => {
    for (const value of [null, undefined, "", "restricted", "SECRET", "Normal "]) {
      expect(toSensitivityLevel(value as string | null | undefined), String(value))
        .toBe("highly_sensitive");
    }
  });

  it("passes through the three legitimate values unchanged", () => {
    for (const level of SENSITIVITY_LEVELS) {
      expect(toSensitivityLevel(level)).toBe(level);
    }
  });
});

describe("the contract is exhaustive by construction", () => {
  it("has a rule for every declared surface", () => {
    // Catches the failure mode where a surface is added to the vocabulary but
    // never given rules -- which would throw at render time on a real user's
    // sensitive row rather than here.
    for (const surface of GOVERNED_SURFACES) {
      expect(() => presentationFor(surface as GovernedSurface, "highly_sensitive")).not.toThrow();
    }
  });
});
