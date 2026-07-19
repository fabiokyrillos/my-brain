import { BrainCircuit } from "lucide-react";
import { notFound } from "next/navigation";
import { createRecord } from "@/features/operations/actions";
import { InlineCreateForm } from "@/features/operations/inline-create-form";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

const kinds: Record<string, string> = { preference: "preferência", relationship: "relacionamento", responsibility: "responsabilidade", rule: "regra", recurring_info: "recorrente", professional_context: "profissional", habit: "hábito", restriction: "restrição", goal: "objetivo", fact: "fato" };

export default async function MemoriesPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const page = parsePage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { supabase } = await requireUser(locale);
  const result = await supabase.from("memories").select("id,content,kind,confidence,important,updated_at").order("important", { ascending: false }).order("updated_at", { ascending: false }).range(from, to);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load memories") ?? []);

  return <div className="content-page"><header className="list-header"><div><p className="eyebrow">{pt ? "CONHECIMENTO DURADOURO" : "LASTING KNOWLEDGE"}</p><h1>{pt ? "Memórias" : "Memories"}</h1><p>{pt ? "Fatos e preferências que ajudam o Brain a responder com contexto." : "Facts and preferences that help Brain answer with context."}</p></div><InlineCreateForm action={createRecord} kind="memory" locale={locale} /></header>{items.length ? <div className="list-stack">{items.map((memory) => <article className="list-row" key={memory.id}><div className="list-row-main"><strong>{memory.content}</strong><p>{pt ? kinds[memory.kind] ?? memory.kind : memory.kind.replaceAll("_", " ")}</p></div><div className="list-meta"><span>{Math.round(Number(memory.confidence) * 100)}%</span>{memory.important && <span className="status-badge">{pt ? "importante" : "important"}</span>}</div></article>)}</div> : <div className="empty-list"><BrainCircuit size={30} /><strong>{pt ? "Nenhuma memória ainda" : "No memories yet"}</strong><p>{pt ? "Adicione uma memória ou registre uma preferência em uma captura." : "Add a memory or capture a lasting preference."}</p></div>}<PaginationLinks locale={locale} path="memories" page={page} hasNext={hasNext} /></div>;
}
