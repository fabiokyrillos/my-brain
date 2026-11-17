import type { Locale } from "@/lib/preferences";

/**
 * Life Brain E.6 (ADR-176) — the words of the Conversar surface: the header,
 * the conversations menu and the new-conversation screen.
 */
export type ChatSurfaceCopy = Readonly<{
  /** The menu button's name; `aria-expanded` says whether it is open. */
  openMenu: string;
  closeMenu: string;
  /** The menu's accessible name. */
  menuLabel: string;
  newConversation: string;
  searchLabel: string;
  searchPlaceholder: string;
  noConversations: string;
  noMatches: string;
  /** Shown when the menu holds the most recent conversations only. */
  olderHidden: (count: number) => string;
  /** The group a search past the menu's limit adds (ADR-177). */
  olderGroup: string;
  groups: Readonly<{ today: string; yesterday: string; week: string; month: string }>;
  /** The new-conversation screen. */
  hello: string;
  helloDescription: (agent: string) => string;
}>;

const copy = {
  "pt-BR": {
    openMenu: "Mostrar conversas",
    closeMenu: "Fechar conversas",
    menuLabel: "Conversas",
    newConversation: "Nova conversa",
    searchLabel: "Buscar conversas",
    searchPlaceholder: "Buscar conversas",
    noConversations: "Nenhuma conversa ainda.",
    noMatches: "Nenhuma conversa com esse texto.",
    olderHidden: (count) => `Mostrando as ${count} mais recentes. A busca encontra as outras.`,
    olderGroup: "Mais antigas",
    groups: { today: "Hoje", yesterday: "Ontem", week: "Últimos 7 dias", month: "Últimos 30 dias" },
    hello: "O que você quer saber?",
    helloDescription: (agent) => `O ${agent} responde com o que você já registrou e diz de onde veio.`,
  },
  en: {
    openMenu: "Show conversations",
    closeMenu: "Close conversations",
    menuLabel: "Conversations",
    newConversation: "New conversation",
    searchLabel: "Search conversations",
    searchPlaceholder: "Search conversations",
    noConversations: "No conversations yet.",
    noMatches: "No conversation matches that.",
    olderHidden: (count) => `Showing the ${count} most recent. Search finds the rest.`,
    olderGroup: "Older",
    groups: { today: "Today", yesterday: "Yesterday", week: "Previous 7 days", month: "Previous 30 days" },
    hello: "What do you want to know?",
    helloDescription: (agent) => `${agent} answers from what you have recorded and says where it came from.`,
  },
} satisfies Record<Locale, ChatSurfaceCopy>;

export function getChatSurfaceCopy(locale: Locale): ChatSurfaceCopy {
  return copy[locale];
}
