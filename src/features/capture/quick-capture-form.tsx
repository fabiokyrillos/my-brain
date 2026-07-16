"use client";

import { useActionState, useEffect, useState } from "react";
import { ArrowUpRight, LoaderCircle, Sparkles } from "lucide-react";

export type CaptureState = {
  status: "idle" | "error";
  message: string;
};

export type CaptureAction = (
  state: CaptureState,
  formData: FormData,
) => Promise<CaptureState>;

const idleState: CaptureState = { status: "idle", message: "" };

export function QuickCaptureForm({
  action,
  initialState = idleState,
  locale,
}: {
  action: CaptureAction;
  initialState?: CaptureState;
  locale: "pt-BR" | "en";
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [online, setOnline] = useState(true);
  const pt = locale === "pt-BR";

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <form action={formAction} className="capture-card" onSubmit={(event) => { if (!online) event.preventDefault(); }}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="source" value="web" />
      <label htmlFor="quick-entry" className="sr-only">{pt ? "Nova entrada" : "New entry"}</label>
      <textarea
        id="quick-entry"
        name="content"
        required
        maxLength={12000}
        disabled={pending}
        placeholder={pt
          ? "Registre uma tarefa, decisão, conversa ou ideia…"
          : "Capture a task, decision, conversation, or idea…"}
        aria-describedby={state.status === "error" ? "capture-error" : undefined}
      />
      {!online && <p className="capture-error" role="status">{pt ? "Você está offline. O texto permanece nesta tela, mas não será salvo no navegador por segurança." : "You are offline. The text stays on this screen but is not stored in the browser for security."}</p>}
      {state.status === "error" && <p id="capture-error" className="capture-error" role="alert">{state.message}</p>}
      <div className="capture-actions">
        <span><Sparkles size={15} />{pt ? "O Brain organiza sem alterar o original" : "Brain organizes without changing the original"}</span>
        <button type="submit" disabled={pending || !online}>
          {pending ? <LoaderCircle className="spin" size={17} /> : null}
          {pending ? (pt ? "Interpretando…" : "Interpreting…") : (pt ? "Registrar" : "Capture")}
          {!pending && <ArrowUpRight size={17} />}
        </button>
      </div>
    </form>
  );
}
