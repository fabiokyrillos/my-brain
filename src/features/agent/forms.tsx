"use client";

import { useActionState } from "react";
import { BellPlus, FileUp, LoaderCircle, Sparkles } from "lucide-react";

export type AgentFormState = { status: "idle" | "success" | "error"; message: string };
export type AgentFormAction = (state: AgentFormState, formData: FormData) => Promise<AgentFormState>;
const idleState: AgentFormState = { status: "idle", message: "" };

function Feedback({ state }: { state: AgentFormState }) {
  return state.status === "idle" ? null : <span className="inline-create-feedback" role={state.status === "success" ? "status" : "alert"}>{state.message}</span>;
}

export function ReminderForm({ action, locale }: { action: AgentFormAction; locale: "pt-BR" | "en" }) {
  const [state, formAction, pending] = useActionState(action, idleState);const pt=locale==="pt-BR";
  return <div><form action={formAction} className="stacked-create"><input type="hidden" name="locale" value={locale}/><label>{pt?"Lembrete":"Reminder"}<input name="title" required maxLength={500}/></label><label>{pt?"Quando":"When"}<input name="remindAt" type="datetime-local" required/></label><label className="inline-check"><input name="important" type="checkbox"/> {pt?"Importante":"Important"}</label><button type="submit" disabled={pending}>{pending?<LoaderCircle className="spin" size={16}/>:<BellPlus size={16}/>} {pt?"Criar lembrete":"Create reminder"}</button></form><Feedback state={state}/></div>;
}

export function QuestionAnswerForm({ action, locale, questionId }: { action: AgentFormAction; locale: "pt-BR" | "en"; questionId: string }) {
  const [state, formAction, pending] = useActionState(action, idleState);const pt=locale==="pt-BR";
  return <div><form action={formAction} className="question-answer-form"><input type="hidden" name="locale" value={locale}/><input type="hidden" name="questionId" value={questionId}/><input name="answer" required placeholder={pt?"Sua resposta…":"Your answer…"}/><button type="submit" disabled={pending}>{pending?"…":pt?"Responder":"Answer"}</button></form><Feedback state={state}/></div>;
}

export function UploadForm({ action, locale }: { action: AgentFormAction; locale: "pt-BR" | "en" }) {
  const [state, formAction, pending] = useActionState(action, idleState);const pt=locale==="pt-BR";
  return <div><form action={formAction} className="upload-form"><input type="hidden" name="locale" value={locale}/><label><FileUp size={25}/><span>{pt?"Imagem, PDF, documento ou planilha":"Image, PDF, document, or spreadsheet"}</span><small>{pt?"Privado · até 25 MB":"Private · up to 25 MB"}</small><input name="file" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,text/csv,.docx,.xlsx"/></label><button type="submit" disabled={pending}>{pending?<LoaderCircle className="spin" size={16}/>:<FileUp size={16}/>} {pt?"Enviar arquivo":"Upload file"}</button></form><Feedback state={state}/></div>;
}

export function ReviewButton({ action, locale, period }: { action: AgentFormAction; locale: "pt-BR" | "en"; period: "daily" | "weekly_review" | "weekly_plan" | "monthly" }) {
  const [state, formAction, pending] = useActionState(action, idleState);const pt=locale==="pt-BR";const labels={daily:pt?"Resumo do dia":"Daily summary",weekly_review:pt?"Revisão da semana":"Weekly review",weekly_plan:pt?"Planejar a semana":"Plan the week",monthly:pt?"Revisão do mês":"Monthly review"};
  return <div className="review-action"><form action={formAction}><input type="hidden" name="locale" value={locale}/><input type="hidden" name="period" value={period}/><button type="submit" disabled={pending}>{pending?<LoaderCircle className="spin" size={16}/>:<Sparkles size={16}/>} {labels[period]}</button></form><Feedback state={state}/></div>;
}
