import { MessageCircleMore } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sendChatMessage } from "@/features/chat/actions";
import { ChatForm } from "@/features/chat/chat-form";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

export default async function ChatPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const page = parsePage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { supabase } = await requireUser(locale);
  const result = await supabase.from("conversations").select("id,title,updated_at").order("updated_at", { ascending: false }).range(from, to);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load conversations") ?? []);

  return <div className="content-page chat-page"><header className="list-header"><div><p className="eyebrow">{pt ? "CONVERSA COM CONTEXTO" : "CONTEXTUAL CHAT"}</p><h1>{pt ? "Fale com o Brain" : "Talk to Brain"}</h1><p>{pt ? "Pergunte sobre o que você registrou. Cada resposta mostra as fontes internas usadas." : "Ask about what you captured. Every answer shows its internal sources."}</p></div></header><ChatForm action={sendChatMessage} locale={locale} />{items.length ? <section className="conversation-list"><h2>{pt ? "Conversas recentes" : "Recent conversations"}</h2>{items.map((conversation) => <Link href={`/${locale}/app/chat/${conversation.id}`} className="list-row" key={conversation.id}><div className="list-row-main"><strong>{conversation.title}</strong><p>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(conversation.updated_at))}</p></div></Link>)}</section> : <div className="chat-empty"><MessageCircleMore size={32} /><strong>{pt ? "Seu histórico responde junto" : "Your history answers with you"}</strong><p>{pt ? "Experimente: “O que combinei com Marina?”" : "Try: “What did I agree with Marina?”"}</p></div>}<PaginationLinks locale={locale} path="chat" page={page} hasNext={hasNext} /></div>;
}
