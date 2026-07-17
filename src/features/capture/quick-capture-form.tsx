"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowUpRight, LoaderCircle, Sparkles } from "lucide-react";
import { CaptureReceiptView } from "@/features/daily-cycle/capture-receipt";
import type { CaptureReceipt } from "@/features/daily-cycle/contracts";
import type { DailyCycleActionFailureCode } from "@/features/daily-cycle/action-result";

export type CaptureState =
  | { status: "idle" }
  | { status: "success"; receipt: CaptureReceipt }
  | { status: "error"; code: DailyCycleActionFailureCode; message: string };

export type CaptureAction = (
  state: CaptureState,
  formData: FormData,
) => Promise<CaptureState>;

const idleState: CaptureState = { status: "idle" };

export function QuickCaptureForm({
  action,
  initialState = idleState,
  locale,
  captureSource,
}: {
  action: CaptureAction;
  initialState?: CaptureState;
  locale: "pt-BR" | "en";
  captureSource: "home" | "capture_page";
}) {
  const idempotencyKeyRef = useRef<string | null>(null);
  if (idempotencyKeyRef.current === null) idempotencyKeyRef.current = crypto.randomUUID();

  async function submitCapture(state: CaptureState, formData: FormData): Promise<CaptureState> {
    formData.set("idempotencyKey", idempotencyKeyRef.current!);
    formData.set("captureSource", captureSource);
    const result = await action(state, formData);
    if (result.status === "success") idempotencyKeyRef.current = crypto.randomUUID();
    return result;
  }

  const [state, formAction, pending] = useActionState(submitCapture, initialState);
  const [online, setOnline] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  useEffect(() => {
    if (state.status !== "success") return;
    formRef.current?.reset();
    textareaRef.current?.focus();
  }, [state]);

  return (
    <div className="capture-card-wrapper">
      <form ref={formRef} action={formAction} className="capture-card" onSubmit={(event) => { if (!online) event.preventDefault(); }}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="source" value="web" />
        <label htmlFor="quick-entry" className="sr-only">{pt ? "Nova entrada" : "New entry"}</label>
        <textarea
          ref={textareaRef}
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
            {pending ? (pt ? "Salvando…" : "Saving…") : (pt ? "Registrar" : "Capture")}
            {!pending && <ArrowUpRight size={17} />}
          </button>
        </div>
      </form>
      {state.status === "success" && <CaptureReceiptView receipt={state.receipt} locale={locale} />}
    </div>
  );
}
