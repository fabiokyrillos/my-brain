import type { Locale } from "@/lib/preferences";
import type { AccountCentreDestination, AccountCentreStripRoute } from "./contracts";

/**
 * Conta e dados copy — `2O-PREF-002`, and the same typed-record shape
 * `transparency/copy.ts` uses one section over.
 *
 * `Record<AccountCentreDestination, …>` is the guarantee: a fourth destination
 * added to the closed set fails to compile here until someone has said what it
 * is, in both languages. The links inside `consent` are keyed by
 * `POLICY_DOCUMENTS`, so a third policy document does the same.
 */
export type AccountCentreLinkCopy = Readonly<{ label: string; description: string }>;

/**
 * A destination's doors.
 *
 * `consent` has two — the closed set `POLICY_DOCUMENTS` names — and each gets
 * its own description rather than sharing the destination's. A shared one read
 * as *"Terms of use · the documents you accepted"* twice over, which tells a
 * reader nothing about which door to open.
 */
export type AccountCentreEntryCopy = Readonly<{
  title: string;
  links: Readonly<Record<string, AccountCentreLinkCopy>>;
}>;

export type AccountCentreCopy = Readonly<{
  title: string;
  intro: string;
  entries: Readonly<Record<AccountCentreDestination, AccountCentreEntryCopy>>;
  /** The strip's own words, worn by the routes this section reaches. */
  backToSettings: string;
  stripLabel: Readonly<Record<AccountCentreStripRoute, string>>;
}>;

const copy: Record<Locale, AccountCentreCopy> = {
  "pt-BR": {
    title: "Conta e dados",
    intro:
      "Cada item abaixo abre a própria página, com o próprio endereço. Nada aqui muda sozinho.",
    entries: {
      notifications: {
        title: "Notificações",
        links: {
          notifications: {
            label: "Notificações",
            description: "O que o produto já enviou e o que você autorizou receber.",
          },
        },
      },
      consent: {
        title: "Termos e privacidade",
        links: {
          terms: {
            label: "Termos de uso",
            description: "O texto atual do documento que você aceitou para usar o produto.",
          },
          privacy: {
            label: "Política de privacidade",
            description: "O que é guardado sobre você e por quanto tempo.",
          },
        },
      },
      deletion: {
        title: "Apagar a conta",
        links: {
          deletion: {
            label: "Apagar a conta",
            description: "Pede confirmação e sua senha, e abre uma janela de recuperação antes de apagar.",
          },
        },
      },
    },
    backToSettings: "Voltar para Ajustes",
    stripLabel: {
      notifications: "Notificações",
      deletion: "Apagar a conta",
    },
  },
  en: {
    title: "Account and data",
    intro: "Each item below opens its own page, at its own address. Nothing here changes on its own.",
    entries: {
      notifications: {
        title: "Notifications",
        links: {
          notifications: {
            label: "Notifications",
            description: "What the product has already sent, and what you agreed to receive.",
          },
        },
      },
      consent: {
        title: "Terms and privacy",
        links: {
          terms: {
            label: "Terms of use",
            description: "The current text of the document you accepted in order to use the product.",
          },
          privacy: {
            label: "Privacy policy",
            description: "What is kept about you, and for how long.",
          },
        },
      },
      deletion: {
        title: "Delete the account",
        links: {
          deletion: {
            label: "Delete the account",
            description: "It asks for confirmation and your password, and opens a recovery window before deleting.",
          },
        },
      },
    },
    backToSettings: "Back to Settings",
    stripLabel: {
      notifications: "Notifications",
      deletion: "Delete the account",
    },
  },
};

export function getAccountCentreCopy(locale: Locale): AccountCentreCopy {
  return copy[locale];
}
