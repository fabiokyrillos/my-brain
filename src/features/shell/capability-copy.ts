/** The capability summary's copy — typed, both locales, no inline ternary. */

import type { Locale } from "@/lib/preferences";

import { capabilityRegistry } from "./capabilities";

/**
 * The settings capabilities that are actually rendered.
 *
 * Derived from the registry as a **type**, which is what makes the copy below
 * impossible to forget: a row that becomes `visible: true` on the `settings`
 * surface widens this union, and `CapabilitySummaryCopy` stops compiling until
 * someone writes what it is and what reads it.
 *
 * This is the shape `transparency/contracts.ts` argued for and this repository
 * has paid for the alternative: a list composed at runtime renders a heading of
 * `undefined` for anything nobody wrote copy for, and does it in production
 * rather than in CI.
 */
export type VisibleSettingsCapabilityKey = Extract<
  (typeof capabilityRegistry)[number],
  { surface: "settings"; visible: true }
>["key"];

export type CapabilitySummaryEntry = Readonly<{
  /** What the capability is called, in the user's words. */
  name: string;
  /** What already behaves differently because of it. Never a field list. */
  effect: string;
}>;

export type CapabilitySummaryCopy = Readonly<{
  title: string;
  /** Said once above the list. */
  intro: string;
  /** The accessible name of the list itself. */
  listLabel: string;
  entries: Readonly<Record<VisibleSettingsCapabilityKey, CapabilitySummaryEntry>>;
}>;

const copy: Record<Locale, CapabilitySummaryCopy> = {
  "pt-BR": {
    title: "O que estas preferências mudam",
    intro:
      "Cada item abaixo já tem efeito hoje. Se uma preferência não aparece aqui, é porque nada no produto a lê ainda — e por isso ela não tem controle.",
    listLabel: "Preferências com efeito real",
    entries: {
      timezone: {
        name: "Fuso horário",
        effect: "Define qual é o seu dia. Prazos, revisões e expressões como “amanhã” usam esta escolha.",
      },
      response_style: {
        name: "Como o assistente responde",
        effect: "Muda o texto que você recebe no chat e nas revisões geradas sob demanda.",
      },
      quiet_hours: {
        name: "Silêncio e frequência",
        effect: "Limita quando um lembrete pode chegar e quantos acompanhamentos cabem em um dia.",
      },
      ai_routing: {
        name: "Roteamento de IA",
        effect: "Escolhe qual modelo executa cada função — conversa, captura, revisões e arquivos.",
      },
      identity_names: {
        name: "Nome do assistente",
        effect: "Muda como o assistente se chama nas telas e nas próprias respostas.",
      },
    },
  },
  en: {
    title: "What these preferences change",
    intro:
      "Each item below already has an effect today. A preference that is not here is one nothing in the product reads yet — which is why it has no control.",
    listLabel: "Preferences with a real effect",
    entries: {
      timezone: {
        name: "Time zone",
        effect: "Defines which day is yours. Deadlines, reviews and phrases such as “tomorrow” use it.",
      },
      response_style: {
        name: "How the assistant answers",
        effect: "Changes the text you get in chat and in reviews generated on demand.",
      },
      quiet_hours: {
        name: "Quiet hours and frequency",
        effect: "Bounds when a reminder may arrive and how many follow-ups fit in a day.",
      },
      ai_routing: {
        name: "AI routing",
        effect: "Chooses which model performs each function — chat, capture, reviews and files.",
      },
      identity_names: {
        name: "Assistant name",
        effect: "Changes what the assistant is called on screen and in its own answers.",
      },
    },
  },
};

export function getCapabilitySummaryCopy(locale: Locale): CapabilitySummaryCopy {
  return copy[locale] ?? copy["pt-BR"];
}
