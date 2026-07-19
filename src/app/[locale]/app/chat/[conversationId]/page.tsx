import { ArrowLeft, BookOpenText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sendChatMessage } from "@/features/chat/actions";
import { ChatForm } from "@/features/chat/chat-form";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

type Citation = { id: string; type: "entry" | "memory"; sourceId: string; excerpt: string };

export default async function ConversationPage({ params }: { params: Promise<{ locale: string; conversationId: string }> }) {
  const { locale: candidate, conversationId } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const { supabase } = await requireUser(locale);
  const [conversationResult, messageResult] = await Promise.all([
    supabase.from("conversations").select("id,title").eq("id", conversationId).maybeSingle(),
    supabase.from("conversation_messages").select("id,role,content,citations,model,created_at").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(200),
  ]);
  const conversation = requireSupabaseData(conversationResult, "load conversation");
  const messages = (requireSupabaseData(messageResult, "load conversation messages") ?? []).reverse();
  if (!conversation) notFound();

  return <div className="content-page chat-thread"><Link href={`/${locale}/app/chat`} className="back-link"><ArrowLeft size={16} />{pt ? "Conversas" : "Conversations"}</Link><header><p className="eyebrow">{pt ? "BRAIN COM FONTES" : "BRAIN WITH SOURCES"}</p><h1>{conversation.title}</h1></header><div className="message-stream">{messages.map((message) => { const citations = Array.isArray(message.citations) ? message.citations as Citation[] : []; return <article className={`chat-message ${message.role}`} key={message.id}><span>{message.role === "user" ? (pt ? "Você" : "You") : "Brain"}</span><p>{message.content}</p>{citations.length > 0 && <div className="message-sources"><strong><BookOpenText size={14} />{pt ? "Fontes internas" : "Internal sources"}</strong>{citations.map((citation) => citation.type === "entry" ? <Link href={`/${locale}/app/inbox/${citation.sourceId}`} key={citation.id}>{citation.excerpt}</Link> : <Link href={`/${locale}/app/memories`} key={citation.id}>{citation.excerpt}</Link>)}</div>}{message.model && <small>{message.model}</small>}</article>; })}</div><ChatForm action={sendChatMessage} conversationId={conversationId} locale={locale} /></div>;
}
