import type { Locale } from "@/lib/preferences";
import type { AppearanceChoice } from "./contracts";

/**
 * Appearance copy, as a typed record rather than inline locale ternaries.
 *
 * `docs/ENGINEERING_STANDARDS.md` makes a feature `copy.ts` in the
 * `daily-cycle/copy.ts` shape the canonical mechanism for new copy, and UX-22's
 * rule is that a slice leaves no more inline ternaries than it found.
 *
 * `Record<AppearanceChoice, …>` is load-bearing: a fourth state added to the
 * closed set fails to compile here until someone has written what it means, in
 * both languages. That is the same guarantee `capability-copy.ts` provides one
 * surface over, and it is why the keys are the choices rather than free strings.
 */
export type AppearanceOptionCopy = Readonly<{ label: string; description: string }>;

export type AppearanceCopy = Readonly<{
  title: string;
  intro: string;
  /**
   * The cost `ADR-116` Decision 8 required to be stated rather than discovered.
   *
   * `2O-PREF-015` forbids any surface describing this as an account setting. It
   * is held in this browser, it does not travel with the account, and on a
   * shared browser it is shared — which is the price of spending no migration,
   * and the owner accepted it knowing that.
   */
  scope: string;
  legend: string;
  options: Record<AppearanceChoice, AppearanceOptionCopy>;
}>;

const copy: Record<Locale, AppearanceCopy> = {
  "pt-BR": {
    title: "Aparência",
    intro: "Escolha como o produto é desenhado. A mudança vale já, sem salvar.",
    scope: "Fica guardado neste navegador — não acompanha a conta em outros aparelhos.",
    legend: "Tema",
    options: {
      system: {
        label: "Seguir o aparelho",
        description: "Acompanha o modo claro ou escuro configurado no sistema.",
      },
      light: {
        label: "Claro",
        description: "Sempre claro, mesmo com o aparelho no escuro.",
      },
      dark: {
        label: "Escuro",
        description: "Sempre escuro, mesmo com o aparelho no claro.",
      },
    },
  },
  en: {
    title: "Appearance",
    intro: "Choose how the product is drawn. The change applies at once, with no save.",
    scope: "Kept in this browser — it does not follow your account to other devices.",
    legend: "Theme",
    options: {
      system: {
        label: "Follow the device",
        description: "Tracks the light or dark mode set on your system.",
      },
      light: {
        label: "Light",
        description: "Always light, even when the device is dark.",
      },
      dark: {
        label: "Dark",
        description: "Always dark, even when the device is light.",
      },
    },
  },
};

export function getAppearanceCopy(locale: Locale): AppearanceCopy {
  return copy[locale];
}
