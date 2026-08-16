"use client";

import { useActionState, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight, LoaderCircle, Sparkles } from "lucide-react";
import { CaptureReceiptView } from "@/features/daily-cycle/capture-receipt";
import { clearDraft, draftKey, readDraft, writeDraft } from "./composer-draft";
import { UniversalStateLine } from "@/features/experience/universal-state";
import type { CaptureReceipt } from "@/features/daily-cycle/contracts";
import type { DailyCycleActionFailureCode } from "@/features/daily-cycle/action-result";
import { recordCaptureStarted } from "@/features/product-analytics/interaction-events";

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
  agentName,
  captureSource,
}: {
  action: CaptureAction;
  initialState?: CaptureState;
  locale: "pt-BR" | "en";
  agentName: string;
  captureSource: "home" | "capture_page";
}) {
  const idempotencyKeyRef = useRef<string | null>(null);
  if (idempotencyKeyRef.current === null) idempotencyKeyRef.current = crypto.randomUUID();
  const attemptIdRef = useRef<string | null>(null);
  if (attemptIdRef.current === null) attemptIdRef.current = crypto.randomUUID();
  // Declared above `submitCapture`, which clears it on a successful capture.
  const [hasDraft, setHasDraft] = useState(false);

  async function submitCapture(state: CaptureState, formData: FormData): Promise<CaptureState> {
    recordCaptureStarted({ attemptId: attemptIdRef.current!, captureSource, locale });
    formData.set("idempotencyKey", idempotencyKeyRef.current!);
    formData.set("captureSource", captureSource);
    const result = await action(state, formData);
    if (result.status === "success") {
      idempotencyKeyRef.current = crypto.randomUUID();
      /*
       * `2O-RECOVER-006`. Cleared here rather than in an effect, and the
       * placement is the point twice over.
       *
       * It runs ONLY on success, so a failed capture keeps the draft — which
       * is the whole reason the draft exists, and the mirror of the defect
       * slice 2O.3 found in the settings form, where React reset an
       * uncontrolled form it could not tell had failed.
       *
       * And it runs in the action rather than in an effect keyed on `state`:
       * an effect cannot distinguish "this success just happened" from "this
       * success is still the current state while the reader types the next
       * entry", so the note would stay hidden for the next draft.
       */
      clearDraft(draftKey(captureSource));
      setHasDraft(false);
    }
    attemptIdRef.current = crypto.randomUUID();
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

  /*
   * `2O-RECOVER-006`. The key is per surface, so the cockpit composer and the
   * capture page keep separate drafts and neither can show the other's text.
   */
  const draftStorageKey = draftKey(captureSource);

  /*
   * Restore on mount, in a LAYOUT effect so the value lands before paint —
   * the same reason slice 2O.3 used one for the settings form. A restore in a
   * passive effect is visible as an empty box that fills in.
   *
   * `defaultValue` was not used: the textarea is uncontrolled and React would
   * only honour it on first render, while this component remounts on
   * navigation back to the surface, which is precisely the case that matters.
   */
  useLayoutEffect(() => {
    const restored = readDraft(draftStorageKey);
    if (restored === null) return;
    const field = textareaRef.current;
    if (field === null || field.value.length > 0) return;
    field.value = restored;
    setHasDraft(true);
  }, [draftStorageKey]);

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
          onChange={(event) => {
            // `2O-RECOVER-006`. The textarea stays uncontrolled — making it
            // controlled would re-render the whole composer on every keystroke
            // — so the draft is written from the event and read back only on
            // mount.
            writeDraft(draftStorageKey, event.target.value);
            setHasDraft(event.target.value.length > 0);
          }}
        />
        {/*
          `2O-RECOVER-006` — "and says so". A draft the reader cannot see is
          kept is a draft they will retype, and one they do not know exists is
          one they cannot choose to remove.
        */}
        {hasDraft ? (
          <p className="capture-draft-note" data-composer-draft="kept">
            {pt
              ? "Guardado como rascunho nesta aba. Continua aqui se você navegar e voltar, e some quando você fechar a aba."
              : "Kept as a draft in this tab. It stays if you navigate away and come back, and goes when you close the tab."}
            <button
              className="capture-draft-discard"
              onClick={() => {
                // Cleared first, then the field — the same order as the
                // success path, and for the same reason.
                clearDraft(draftStorageKey);
                if (textareaRef.current !== null) textareaRef.current.value = "";
                setHasDraft(false);
                textareaRef.current?.focus();
              }}
              type="button"
            >
              {pt ? "Descartar" : "Discard"}
            </button>
          </p>
        ) : null}
        {/*
          The offline sentence USED to end "…but is not stored in the browser
          for security", which stopped being true the moment this composer kept
          a draft. Two surfaces disagreeing about where the reader's text lives
          is worse than either answer, so the sentence now states what actually
          happens and keeps the part that still matters: nothing is queued and
          nothing is sent.
        */}
        {!online && <UniversalStateLine className="capture-error" description={pt ? "Você está offline. O texto continua nesta aba como rascunho, mas nada é enviado nem fica na fila — quando voltar a conexão, envie você mesmo." : "You are offline. The text stays in this tab as a draft, but nothing is sent and nothing is queued — send it yourself when the connection is back."} locale={locale} state="offline" />}
        {state.status === "error" && <p id="capture-error" className="capture-error" role="alert">{state.message}</p>}
        <div className="capture-actions">
          <span><Sparkles size={15} />{pt ? `O ${agentName} organiza sem alterar o original` : `${agentName} organizes without changing the original`}</span>
          <button type="submit" disabled={pending || !online}>
            {pending ? <LoaderCircle className="spin" size={17} /> : null}
            {pending ? (pt ? "Salvando…" : "Saving…") : (pt ? "Registrar" : "Capture")}
            {!pending && <ArrowUpRight size={17} />}
          </button>
        </div>
      </form>
      {state.status === "success" && <CaptureReceiptView receipt={state.receipt} locale={locale} agentName={agentName} />}
    </div>
  );
}
