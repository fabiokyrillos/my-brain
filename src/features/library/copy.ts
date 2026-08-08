/** `2I-LIB` copy — typed, both locales, no inline ternary. */

import type { Locale } from "@/lib/preferences";
import type { NavigationKey } from "@/features/shell/capabilities";

export type LibraryCopy = {
  readonly title: string;
  readonly intro: string;
  readonly searchLink: string;
  readonly empty: string;
  readonly recentLabel: string;
  readonly open: (label: string) => string;
  readonly descriptions: Readonly<Partial<Record<NavigationKey, string>>>;
};

const copy: Record<Locale, LibraryCopy> = {
  "pt-BR": {
    title: "Biblioteca",
    intro: "Tudo que o Brain sabe sobre o seu mundo, em um lugar só.",
    searchLink: "Buscar em tudo",
    empty: "Nada aqui ainda.",
    recentLabel: "Recentes",
    open: (label) => `Abrir ${label}`,
    descriptions: {
      memories: "O que o Brain lembra sobre você.",
      people: "Quem aparece no seu trabalho.",
      projects: "No que você está trabalhando.",
      organizations: "Empresas e clientes.",
      contexts: "Áreas da sua vida.",
      files: "Documentos e anexos.",
    },
  },
  en: {
    title: "Library",
    intro: "Everything the Brain knows about your world, in one place.",
    searchLink: "Search everything",
    empty: "Nothing here yet.",
    recentLabel: "Recent",
    open: (label) => `Open ${label}`,
    descriptions: {
      memories: "What the Brain remembers about you.",
      people: "Who shows up in your work.",
      projects: "What you are working on.",
      organizations: "Companies and clients.",
      contexts: "Areas of your life.",
      files: "Documents and attachments.",
    },
  },
};

export function getLibraryCopy(locale: Locale): LibraryCopy {
  return copy[locale] ?? copy["pt-BR"];
}
