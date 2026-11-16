import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { requireSupabaseData } from "@/lib/supabase/result";
import type { Locale } from "@/lib/preferences";

import {
  CONVERSATION_MENU_LIMIT,
  groupConversations,
  type ConversationGroup,
} from "./conversation-groups";
import { getChatSurfaceCopy } from "./surface-copy";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type ConversationMenu = Readonly<{
  groups: readonly ConversationGroup[];
  /** The limit, when the owner has more conversations than the menu holds; otherwise null. */
  limited: number | null;
}>;

/**
 * Life Brain E.6 (ADR-176) — the conversations menu's one read: the owner's
 * most recent conversations (RLS scopes the rows), one past the limit so the
 * menu can say it holds only the most recent ones.
 */
export async function loadConversationMenu(
  supabase: SupabaseClient,
  locale: Locale,
  timeZone: string,
  now: Date = new Date(),
): Promise<ConversationMenu> {
  const result = await supabase
    .from("conversations")
    .select("id,title,updated_at")
    .order("updated_at", { ascending: false })
    .limit(CONVERSATION_MENU_LIMIT + 1);
  const rows = requireSupabaseData(result, "load conversation menu") ?? [];
  const limited = rows.length > CONVERSATION_MENU_LIMIT ? CONVERSATION_MENU_LIMIT : null;
  return {
    groups: groupConversations(rows.slice(0, CONVERSATION_MENU_LIMIT), now, timeZone, locale, getChatSurfaceCopy(locale).groups),
    limited,
  };
}
