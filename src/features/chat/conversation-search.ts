"use server";

import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { locales } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

import { CONVERSATION_SEARCH_LIMIT, type ConversationLink } from "./conversation-groups";

const searchInput = z.object({
  locale: z.enum(locales),
  query: z.string().trim().min(2).max(100),
});

/** `%`, `_` and the escape itself are literal in a title search, never wildcards. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * Life Brain E.7 (ADR-177) — the conversations menu's search beyond the 100
 * conversations it holds.
 *
 * The menu filters the titles it already has on the client. When the owner has
 * more than the menu holds, this reads the rest: titles containing the text,
 * newest first, at most {@link CONVERSATION_SEARCH_LIMIT}. Read-only; RLS
 * scopes the rows to the owner, and `requireUser` stops a signed-out or
 * inactive caller before any read. Case-insensitive; unlike the local filter it
 * is not accent-insensitive (`ilike` without an extension), which the owner's
 * own spelling of a title usually makes moot.
 */
export async function searchConversations(locale: string, query: string): Promise<readonly ConversationLink[]> {
  const parsed = searchInput.safeParse({ locale, query });
  if (!parsed.success) return [];
  const { supabase } = await requireUser(parsed.data.locale);
  const result = await supabase
    .from("conversations")
    .select("id,title")
    .ilike("title", `%${escapeLike(parsed.data.query)}%`)
    .order("updated_at", { ascending: false })
    .limit(CONVERSATION_SEARCH_LIMIT);
  const rows = requireSupabaseData(result, "search conversations") ?? [];
  return rows.map((row) => ({ id: row.id, title: row.title }));
}
