import { UsersRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createRecord } from "@/features/operations/actions";
import { InlineCreateForm } from "@/features/operations/inline-create-form";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

export default async function PeoplePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const page = parsePage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { supabase } = await requireUser(locale);
  const result = await supabase.from("people").select("id,name,notes,updated_at").order("updated_at", { ascending: false }).range(from, to);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load people") ?? []);

  return <div className="content-page"><header className="list-header"><div><p className="eyebrow">{pt ? "RELAÇÕES" : "RELATIONSHIPS"}</p><h1>{pt ? "Pessoas" : "People"}</h1><p>{pt ? "Quem aparece nas suas conversas, decisões e acompanhamentos." : "People who appear in your conversations, decisions, and follow-ups."}</p></div><InlineCreateForm action={createRecord} kind="person" locale={locale} /></header>{items.length ? <div className="list-stack">{items.map((person) => <Link href={`/${locale}/app/people/${person.id}`} className="list-row" key={person.id}><div className="list-row-main"><strong>{person.name}</strong><p>{person.notes ?? (pt ? "Reconhecida no seu contexto" : "Recognized in your context")}</p></div></Link>)}</div> : <div className="empty-list"><UsersRound size={30} /><strong>{pt ? "Nenhuma pessoa ainda" : "No people yet"}</strong><p>{pt ? "Pessoas citadas nas capturas aparecem aqui automaticamente." : "People mentioned in captures appear here automatically."}</p></div>}<PaginationLinks locale={locale} path="people" page={page} hasNext={hasNext} /></div>;
}
