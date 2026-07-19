import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("entry detail page architecture guardrail", () => {
  it("never imports database.types or references the raw Database schema (Slice 2X.8)", () => {
    const filePath = path.resolve(process.cwd(), "src/app/[locale]/app/inbox/[entryId]/page.tsx");
    const source = readFileSync(filePath, "utf8");

    expect(source).not.toBe("");
    expect(source).not.toMatch(/database\.types/i);
    expect(source).not.toMatch(/Database\s*\[\s*["']public["']\s*\]/);
    expect(source).not.toMatch(/from\s*["']@\/lib\/supabase\/server["']/);
  });

  it("only loads data through the daily-cycle review and technical-details projections", () => {
    const filePath = path.resolve(process.cwd(), "src/app/[locale]/app/inbox/[entryId]/page.tsx");
    const source = readFileSync(filePath, "utf8");

    expect(source).toMatch(/from\s*["']@\/features\/daily-cycle\/review-projection["']/);
    expect(source).toMatch(/from\s*["']@\/features\/daily-cycle\/technical-details-projection["']/);
    expect(source).not.toMatch(/from\s*["']@\/features\/interpretations\/data["']/);
    expect(source).not.toMatch(/loadInterpretationReview/);
    expect(source).not.toMatch(/entry\.status/);
  });
});
