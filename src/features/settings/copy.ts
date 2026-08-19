/**
 * The Settings sections' words, typed, in the canonical feature `copy.ts` shape
 * `docs/ENGINEERING_STANDARDS.md` names.
 *
 * Two things live here and nothing else: what each section is called, and one
 * sentence saying what a reader will find in it. The controls inside each
 * section keep their own copy — moving a control must not move its words, or
 * `2P-SETTINGS-008`'s *"no setting changes semantics through the
 * reorganization alone"* would be untestable.
 */

import type { Locale } from "@/lib/preferences";
import type { SettingsSection } from "./sections";

export type SettingsSectionCopy = Readonly<{
  /** The nav label and the panel's accessible name. Short, because the nav is narrow. */
  readonly name: string;
  /** One sentence at the top of the panel: what is in here, in the reader's terms. */
  readonly summary: string;
}>;

export type SettingsCopy = Readonly<{
  readonly title: string;
  readonly intro: string;
  readonly navLabel: string;
  readonly sections: Readonly<Record<SettingsSection, SettingsSectionCopy>>;
  /** `2P-SETTINGS-007` — the sentence that names the section a save failed in. */
  readonly saveFailedIn: (section: string) => string;
  /** The one discreet link `2P-SETTINGS-008` allows on the notifications page. */
  readonly notificationPreferencesLink: string;
}>;

const copy: Readonly<Record<Locale, SettingsCopy>> = {
  "pt-BR": {
    title: "Configurações",
    intro: "Somente preferências com consumer verificável. Cada seção tem link próprio.",
    navLabel: "Seções das configurações",
    sections: {
      general: {
        name: "Geral",
        summary: "O fuso horário que define o que “hoje” e “amanhã” significam, e o guia inicial.",
      },
      assistant: {
        name: "Assistente",
        summary: "Como o assistente se chama, como responde, e o que ele pode escrever sem perguntar.",
      },
      ai: {
        name: "IA",
        summary: "Sua chave de provedor e qual modelo atende cada função.",
      },
      planning: {
        name: "Planejamento",
        summary: "Quando o produto pode interromper, quanto pode insistir, e quando oferece fechar o dia.",
      },
      notifications: {
        name: "Notificações",
        summary: "Consentimento, tipos, frequência, silêncio e limite diário. O histórico fica na própria página de Notificações.",
      },
      privacy: {
        name: "Privacidade e dados",
        summary: "O que está guardado sobre você, o que você aceitou, e o que já foi feito com isso.",
      },
      appearance: {
        name: "Aparência",
        summary: "Como o produto aparece neste aparelho, e como instalá-lo nele.",
      },
      account: {
        name: "Conta",
        summary: "Documentos, avisos recebidos e o encerramento da conta.",
      },
    },
    saveFailedIn: (section) => `Não foi possível salvar em ${section}. Nada foi alterado — revise e tente novamente.`,
    notificationPreferencesLink: "Preferências de notificação",
  },
  en: {
    title: "Settings",
    intro: "Only preferences with a verifiable consumer. Every section has its own link.",
    navLabel: "Settings sections",
    sections: {
      general: {
        name: "General",
        summary: "The time zone that decides what today and tomorrow mean, and the getting-started guide.",
      },
      assistant: {
        name: "Assistant",
        summary: "What the assistant is called, how it answers, and what it may write without asking.",
      },
      ai: {
        name: "AI",
        summary: "Your provider key and which model serves each function.",
      },
      planning: {
        name: "Planning",
        summary: "When the product may interrupt, how much it may insist, and when it offers to close the day.",
      },
      notifications: {
        name: "Notifications",
        summary: "Consent, types, frequency, quiet hours and the daily cap. The history stays on the Notifications page itself.",
      },
      privacy: {
        name: "Privacy and data",
        summary: "What is stored about you, what you agreed to, and what has been done with it.",
      },
      appearance: {
        name: "Appearance",
        summary: "How the product looks on this device, and how to install it here.",
      },
      account: {
        name: "Account",
        summary: "Documents, the alerts you received, and ending the account.",
      },
    },
    saveFailedIn: (section) => `Could not save in ${section}. Nothing changed — review the fields and try again.`,
    notificationPreferencesLink: "Notification preferences",
  },
};

export function getSettingsCopy(locale: string): SettingsCopy {
  return locale === "en" ? copy.en : copy["pt-BR"];
}
