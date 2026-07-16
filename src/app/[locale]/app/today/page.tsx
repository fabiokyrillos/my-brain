import { notFound } from "next/navigation";
import { TaskList, type TaskRecord } from "@/features/operations/task-list";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";

export default async function TodayPage({ params }: { params: Promise<{ locale: string }> }) {
  const {locale:rawLocale}=await params;if(!isLocale(rawLocale))notFound();const locale=rawLocale;const pt=locale==="pt-BR";const {supabase}=await requireUser(locale);
  const end=new Date();end.setHours(23,59,59,999);
  const {data}=await supabase.from("tasks").select("id,title,description,status,due_at,created_by").not("due_at","is",null).lte("due_at",end.toISOString()).not("status","in","(completed,cancelled)").order("due_at");
  return <div className="content-page"><header className="list-header"><div><p className="eyebrow">{new Intl.DateTimeFormat(locale,{weekday:"long",day:"numeric",month:"long"}).format(new Date()).toUpperCase()}</p><h1>{pt?"Hoje":"Today"}</h1><p>{pt?"Prazos de hoje e atrasos que ainda precisam de atenção.":"Today's deadlines and overdue work that still needs attention."}</p></div></header><TaskList emptyHint={pt?"Nenhum prazo exige sua atenção hoje.":"No deadline needs your attention today."} locale={locale} tasks={(data??[]) as TaskRecord[]}/></div>;
}
