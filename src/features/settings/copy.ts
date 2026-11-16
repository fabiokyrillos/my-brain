/**
 * The Settings groups' words, typed, in the canonical feature `copy.ts` shape
 * `docs/ENGINEERING_STANDARDS.md` names.
 *
 * What each group is called, the sentence that says what is in it, and the
 * words the surface itself owns (the back link, the save receipt, the
 * disclosures). The controls inside each group keep their own copy — moving a
 * control must not move its words, or `2P-SETTINGS-008`'s *"no setting changes
 * semantics through the reorganization alone"* would be untestable.
 *
 * Life Brain E.1 (ADR-169): no engineering vocabulary here. The old intro said
 * *"Somente preferências com consumer verificável"*, which is true and is a
 * sentence for the people who build the product; it now lives behind "O que
 * cada ajuste muda", where `CapabilitySummary` already says it in full.
 */

import type { Locale } from "@/lib/preferences";
import type { SettingsSection } from "./sections";

export type SettingsSectionCopy = Readonly<{
  /** The nav label, the panel's title and its accessible name. */
  readonly name: string;
  /** One sentence at the top of the panel: what is in here, in the reader's terms. */
  readonly summary: string;
}>;

export type SettingsCopy = Readonly<{
  readonly title: string;
  readonly intro: string;
  readonly navLabel: string;
  readonly sections: Readonly<Record<SettingsSection, SettingsSectionCopy>>;
  /** The phone's way back from a group to the list of groups. */
  readonly back: string;
  /** The receipt a save on change shows, and its undo. */
  readonly saved: string;
  readonly undone: string;
  readonly undo: string;
  readonly saving: string;
  /** Disclosures that hold the explanations the surface no longer leads with. */
  readonly howItWorks: Readonly<{
    readonly capabilities: string;
    readonly ai: string;
    readonly stored: string;
    readonly notifications: string;
  }>;
  /** Group headings inside the forms. */
  readonly groups: Readonly<{
    readonly assistant: string;
    readonly whereWhen: string;
    readonly start: string;
    readonly quiet: string;
    readonly reviews: string;
    readonly key: string;
    readonly profile: string;
    readonly models: string;
  }>;
  readonly language: Readonly<{ readonly label: string; readonly hint: string }>;
  /** `2P-SETTINGS-007` — the sentence that names the group a save failed in. */
  readonly saveFailedIn: (section: string) => string;
  /** The one discreet link `2P-SETTINGS-008` allows on the notifications page. */
  readonly notificationPreferencesLink: string;
}>;

const copy: Readonly<Record<Locale, SettingsCopy>> = {
  "pt-BR": {
    title: "Ajustes",
    intro: "O que o assistente é, quando ele pode falar com você, e o que fica guardado.",
    navLabel: "Grupos dos ajustes",
    sections: {
      general: {
        name: "Você e o assistente",
        summary: "Como ele se chama, como responde, e o seu fuso horário.",
      },
      day: {
        name: "Seu dia e avisos",
        summary: "Quando ele pode interromper, quantas vezes por dia, e quando oferece fechar o dia.",
      },
      autonomy: {
        name: "O que ele faz sozinho",
        summary: "Onde ele só sugere e onde você deixa que ele aja sem perguntar.",
      },
      ai: {
        name: "IA e custos",
        summary: "A sua chave da OpenAI e qual modelo atende cada função.",
      },
      appearance: {
        name: "Aparência",
        summary: "Tema claro ou escuro neste aparelho, e como instalar como app.",
      },
      privacy: {
        name: "Privacidade e conta",
        summary: "O que está guardado, como levar uma cópia, e como encerrar a conta.",
      },
    },
    back: "Ajustes",
    saved: "Salvo",
    undone: "Desfeito",
    undo: "Desfazer",
    saving: "Salvando…",
    howItWorks: {
      capabilities: "O que cada ajuste muda",
      ai: "Como a IA é usada",
      stored: "Ver tudo por categoria e por quanto tempo guardamos",
      notifications: "Como os avisos funcionam",
    },
    groups: {
      assistant: "O assistente",
      whereWhen: "Onde e quando",
      start: "Começo",
      quiet: "Silêncio e frequência",
      reviews: "Revisões",
      key: "Chave",
      profile: "Qualidade e custo",
      models: "Modelo por função",
    },
    language: { label: "Idioma", hint: "O mesmo que o “EN” no topo da tela." },
    saveFailedIn: (section) => `Não foi possível salvar em ${section}. Nada foi alterado — revise e tente novamente.`,
    notificationPreferencesLink: "Preferências de notificação",
  },
  en: {
    title: "Settings",
    intro: "What the assistant is, when it may reach you, and what is stored.",
    navLabel: "Settings groups",
    sections: {
      general: {
        name: "You and the assistant",
        summary: "What it is called, how it answers, and your time zone.",
      },
      day: {
        name: "Your day and alerts",
        summary: "When it may interrupt, how often a day, and when it offers to close the day.",
      },
      autonomy: {
        name: "What it does alone",
        summary: "Where it only suggests and where you let it act without asking.",
      },
      ai: {
        name: "AI and costs",
        summary: "Your OpenAI key and which model serves each function.",
      },
      appearance: {
        name: "Appearance",
        summary: "Light or dark on this device, and how to install it as an app.",
      },
      privacy: {
        name: "Privacy and account",
        summary: "What is stored, how to take a copy, and how to close the account.",
      },
    },
    back: "Settings",
    saved: "Saved",
    undone: "Undone",
    undo: "Undo",
    saving: "Saving…",
    howItWorks: {
      capabilities: "What each setting changes",
      ai: "How AI is used",
      stored: "See everything by category and how long we keep it",
      notifications: "How alerts work",
    },
    groups: {
      assistant: "The assistant",
      whereWhen: "Where and when",
      start: "Getting started",
      quiet: "Quiet hours and frequency",
      reviews: "Reviews",
      key: "Key",
      profile: "Quality and cost",
      models: "Model per function",
    },
    language: { label: "Language", hint: "The same as “PT” at the top of the screen." },
    saveFailedIn: (section) => `Could not save in ${section}. Nothing changed — review the fields and try again.`,
    notificationPreferencesLink: "Notification preferences",
  },
};

export function getSettingsCopy(locale: string): SettingsCopy {
  return locale === "en" ? copy.en : copy["pt-BR"];
}
