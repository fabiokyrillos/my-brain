import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("SettingsPage data pipeline", () => {
  it("starts its independent settings projections together", () => {
    const source = readFileSync(join(process.cwd(), "src/app/[locale]/app/settings/page.tsx"), "utf8");

    expect(source).toMatch(
      /Promise\.all\(\[\s*loadSettingsFormValues\([\s\S]*loadCredentialMetadata\([\s\S]*loadPendingEntryCount\(/,
    );
  });
});
