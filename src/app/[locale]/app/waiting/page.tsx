import { notFound } from "next/navigation";
import { TaskList, type TaskRecord } from "@/features/operations/task-list";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";

export default async function WaitingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale }=await params;if(!isLocale(rawLocale))notFound();const locale=rawLocale;const pt=locale==="pt-BR";const {supabase}=await requireUser(locale);
  const {data}=await supabase.from("tasks").select("id,title,description,status,due_at,created_by").eq("status","waiting").order("updated_at",{ascending:false});
  return <div className="content-page"><header className="list-header"><div><p className="eyebrow">{pt?"ACOMPANHAMENTO":"FOLLOW-UP"}</p><h1>{pt?"Aguardando":"Waiting"}</h1><p>{pt?"O que depende de outra pessoa e merece acompanhamento.":"What depends on someone else and needs follow-up."}</p></div></header><TaskList emptyHint={pt?"Quando algo depender de terceiros, mova a tarefa para Aguardando.":"Move tasks here when they depend on someone else."} locale={locale} tasks={(data??[]) as TaskRecord[]}/></div>;
}
