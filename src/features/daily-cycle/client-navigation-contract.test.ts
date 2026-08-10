import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("daily-cycle internal navigation", () => {
  it.each(["inbox-item.tsx", "capture-receipt.tsx"])("uses Next Link in %s", (file) => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");

    expect(source).toContain('from "next/link"');
    expect(source).not.toMatch(/<a\s+href=/);
  });
});
