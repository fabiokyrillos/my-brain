"use client";

import { useActionState } from "react";
import { LoaderCircle, Plus } from "lucide-react";

export type CreateRecordState = { status: "idle" | "success" | "error"; message: string };
export type CreateRecordAction = (
  state: CreateRecordState,
  formData: FormData,
) => Promise<CreateRecordState>;

const idleState: CreateRecordState = { status: "idle", message: "" };

const labels = {
  task: { pt: "Nova tarefa", en: "New task" },
  project: { pt: "Nome do projeto", en: "Project name" },
  person: { pt: "Nome da pessoa", en: "Person name" },
  memory: { pt: "Nova memória", en: "New memory" },
} as const;

export function InlineCreateForm({
  action,
  kind,
  locale,
}: {
  action: CreateRecordAction;
  kind: keyof typeof labels;
  locale: "pt-BR" | "en";
}) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const pt = locale === "pt-BR";
  const label = labels[kind][pt ? "pt" : "en"];

  return (
    <div>
      <form action={formAction} className="inline-create">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="locale" value={locale} />
        <label htmlFor={`new-${kind}`} className="sr-only">{label}</label>
        <input id={`new-${kind}`} name="name" required maxLength={kind === "memory" ? 4000 : kind === "task" ? 240 : 160} placeholder={label} />
        <button type="submit" disabled={pending} aria-label={pt ? `Adicionar ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}>
          {pending ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}
          {pt ? "Adicionar" : "Add"}
        </button>
      </form>
      {state.status !== "idle" && <span className="inline-create-feedback" role={state.status === "success" ? "status" : "alert"}>{state.message}</span>}
    </div>
  );
}
