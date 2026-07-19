import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

type Surface = {
  label: string;
  filePath: string;
  forbidden: RegExp[];
  required: RegExp[];
};

const surfaces: Surface[] = [
  {
    label: "Home dashboard",
    filePath: "src/features/shell/home-dashboard.tsx",
    forbidden: [
      /database\.types/i,
      /Database\s*\[\s*["']public["']\s*\]/,
      /\.from\(\s*["'](tasks|pending_questions|entries|entry_interpretations)["']\s*\)/,
      /task\.status/,
    ],
    required: [
      /from\s*["']@\/features\/daily-cycle\/work-projection["']/,
      /from\s*["']@\/features\/daily-cycle\/home-projection["']/,
    ],
  },
  {
    label: "Task candidate form",
    filePath: "src/features/tasks/task-candidate-form.tsx",
    forbidden: [
      /from\s*["']@\/lib\/ai\/extraction-schema["']/,
      /confidence/i,
    ],
    required: [
      /from\s*["']@\/features\/daily-cycle\/contracts["']/,
    ],
  },
  {
    label: "Inbox list page (Caixa)",
    filePath: "src/app/[locale]/app/inbox/page.tsx",
    forbidden: [
      /database\.types/i,
      /Database\s*\[\s*["']public["']\s*\]/,
      /from\s*["']@\/lib\/supabase\/server["']/,
      /\.from\(\s*["']/,
    ],
    required: [
      /from\s*["']@\/features\/daily-cycle\/inbox-projection["']/,
      /from\s*["']@\/features\/daily-cycle\/attention-projection["']/,
    ],
  },
  {
    label: "Work page (canonical Work)",
    filePath: "src/app/[locale]/app/work/page.tsx",
    forbidden: [
      /database\.types/i,
      /\.from\(\s*["']tasks["']\s*\)/,
      /TaskRecord/,
    ],
    required: [
      /from\s*["']@\/features\/daily-cycle\/work-projection["']/,
    ],
  },
  {
    label: "Entry detail page (Review)",
    filePath: "src/app/[locale]/app/inbox/[entryId]/page.tsx",
    forbidden: [
      /database\.types/i,
      /Database\s*\[\s*["']public["']\s*\]/,
      /from\s*["']@\/lib\/supabase\/server["']/,
      /from\s*["']@\/features\/interpretations\/data["']/,
      /loadInterpretationReview/,
      /entry\.status/,
    ],
    required: [
      /from\s*["']@\/features\/daily-cycle\/review-projection["']/,
      /from\s*["']@\/features\/daily-cycle\/technical-details-projection["']/,
    ],
  },
];

describe("daily-cycle projection boundary (Slice 2X.16)", () => {
  it.each(surfaces)("$label imports no raw rows and routes through its projection", ({ filePath, forbidden, required }) => {
    const text = source(filePath);
    for (const pattern of forbidden) expect(text).not.toMatch(pattern);
    for (const pattern of required) expect(text).toMatch(pattern);
  });

  it("interpretations/data.ts is guarded as server-only infrastructure with no direct central-component consumer", () => {
    const text = source("src/features/interpretations/data.ts");
    expect(text).toMatch(/^import\s+["']server-only["'];/m);
  });
});
