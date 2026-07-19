import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { dailyCycleCopy } from "@/features/daily-cycle/copy";

const auditedVisibleSurfaces = [
  "src/features/shell/home-dashboard.tsx",
  "src/features/profile/settings-form.tsx",
  "src/app/[locale]/app/settings/page.tsx",
  "src/app/[locale]/app/reviews/page.tsx",
  "src/i18n/messages.ts",
];

describe("operational copy", () => {
  it("contains no unsupported continuous or scheduled promise on audited surfaces", () => {
    const source = auditedVisibleSurfaces.map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");
    for (const forbidden of [
      /Brain atento/i,
      /Brain active/i,
      /Brain ativo/i,
      /Brain attentive/i,
      /revisões programadas/i,
      /scheduled reviews/i,
      /próxima revisão/i,
      /next review/i,
      /nível de autonomia/i,
      /autonomy level/i,
      /privacidade padrão/i,
      /default privacy/i,
    ]) {
      expect(source).not.toMatch(forbidden);
    }
  });

  it("uses different semantic copy for saved, queued, organizing, retry, and completed outcomes", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const copy = dailyCycleCopy[locale];
      const lifecycleCopy = [
        copy.messages.capture_saved,
        copy.messages.reprocessing_queued,
        copy.productStates.organizing.description,
        copy.messages.retry_scheduled,
        copy.productStates.ready.description,
      ];
      expect(new Set(lifecycleCopy).size).toBe(lifecycleCopy.length);
    }
    expect(dailyCycleCopy["pt-BR"].messages.capture_saved).toBe("Salvo. A organização foi solicitada.");
    expect(dailyCycleCopy.en.messages.capture_saved).toBe("Saved. Organization was queued.");
  });
});
