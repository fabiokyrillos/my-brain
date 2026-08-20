"use client";

/**
 * `2P-CAPTURE-001` … `2P-CAPTURE-010` — one composer, every modality.
 *
 * ## One surface, two forms, and why that is not a compromise
 *
 * The owner meets a single box with a paperclip at the left and a microphone
 * beside send. Underneath there are **two `<form>` elements**, because one
 * `<form>` has one action and there are two write paths that must stay
 * separate (`T-1`): `captureEntry` creates an entry the worker interprets;
 * `uploadAttachment` stores a file the `process_attachment` job analyses. They
 * have different idempotency, different retries and different failure shapes.
 *
 * The obvious alternative — one action that branches on whether a file is
 * attached — is the *"third write path with a friendly name"* the plan names
 * as a stop condition. It would look entirely reasonable in review, which is
 * exactly why the constraint is structural rather than a comment: the file
 * input and the send button belong to **different form owners**, joined only
 * visually. HTML's `form="…"` attribute is what makes that possible, and it is
 * the whole reason this component can be one surface without being one write.
 *
 * `composer.test.tsx` asserts `fileInput.form !== textarea.form` from three
 * angles, and `capture-write-path-guard.test.ts` proves no second entry writer
 * exists anywhere in the tree.
 *
 * ## What this component does not own
 *
 * Both actions arrive as **props**. This file imports neither, touches no
 * Supabase client and declares no `"use server"` — the same posture the tab
 * surface it replaces held, and asserted by the same guard.
 *
 * ## Where the transcript goes
 *
 * Into this composer's own field, at the caret (`2P-CAPTURE-006`). The
 * microphone no longer owns a draft of its own: a second editable box meant a
 * transcript could never join a sentence the owner had already started, and
 * meant a second form submitting entries. `VoiceComposer` is now a control that
 * reports text and holds nothing.
 */

import { useActionState, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight, LoaderCircle, Paperclip, Sparkles, X } from "lucide-react";

import { CaptureReceiptView } from "@/features/daily-cycle/capture-receipt";
import { UniversalStateLine } from "@/features/experience/universal-state";
import {
  recordCaptureModeSelected,
  recordCaptureStarted,
  recordVoiceTranscriptionFinished,
} from "@/features/product-analytics/interaction-events";
import { ATTACHMENT_LIMITS } from "@/lib/quotas";
import type { AgentFormAction, AgentFormState } from "@/features/agent/forms";
import type { CaptureReceipt } from "@/features/daily-cycle/contracts";
import type { DailyCycleActionFailureCode } from "@/features/daily-cycle/action-result";

import { clearDraft, draftKey, readDraft, writeDraft } from "./composer-draft";
import { composerCopy } from "./composer-copy";
import { VoiceComposer, type TranscribeAction } from "./voice-composer";

export type CaptureState =
  | { status: "idle" }
  | { status: "success"; receipt: CaptureReceipt }
  | { status: "error"; code: DailyCycleActionFailureCode; message: string };

export type CaptureAction = (state: CaptureState, formData: FormData) => Promise<CaptureState>;

export type CaptureSource = "home" | "capture_page";

const idleState: CaptureState = { status: "idle" };
const idleAttachmentState = { status: "idle" as const, message: "" };

/**
 * The picker's filter, derived from the allowlist the Server Action enforces.
 *
 * Not a hand-written second copy: `2P-CAPTURE-005` requires drag, drop and
 * paste to carry "the same validation as file selection", and the cheapest way
 * for two validations to disagree is for one of them to be a string somebody
 * typed. The two `.docx`/`.xlsx` extensions are appended as *picker hints* for
 * desktop file dialogs — they widen no decision, because every acceptance below
 * tests the MIME type against the same set the server does.
 */
const ALLOWED_MIME_TYPES = new Set<string>(ATTACHMENT_LIMITS.mimeAllowlist);
const ACCEPT_ATTRIBUTE = [...ATTACHMENT_LIMITS.mimeAllowlist, ".docx", ".xlsx"].join(",");

type ModalityChoice = "text" | "attachment" | "voice";

export function Composer({
  action,
  attachmentAction,
  transcribeAction,
  initialState = idleState,
  locale,
  agentName,
  captureSource,
}: {
  /** Bound to `captureEntry` by the page. Never imported here. */
  action: CaptureAction;
  /** Bound to `uploadAttachment` by the page. Never imported here. */
  attachmentAction: AgentFormAction;
  transcribeAction: TranscribeAction;
  initialState?: CaptureState;
  locale: "pt-BR" | "en";
  agentName: string;
  captureSource: CaptureSource;
}) {
  const copy = composerCopy[locale];
  const pt = locale === "pt-BR";

  // Two ids and two form owners. `useId` rather than a constant because both
  // surfaces can mount a composer in one page tree during a client transition,
  // and two forms sharing an id would silently make the second one's controls
  // submit the first one's action.
  const attachmentFormId = useId();
  const fileInputId = useId();

  const idempotencyKeyRef = useRef<string | null>(null);
  if (idempotencyKeyRef.current === null) idempotencyKeyRef.current = crypto.randomUUID();
  const attemptIdRef = useRef<string | null>(null);
  if (attemptIdRef.current === null) attemptIdRef.current = crypto.randomUUID();

  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [hasDraft, setHasDraft] = useState(false);
  const [attachedName, setAttachedName] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [online, setOnline] = useState(true);

  /*
   * The caret, remembered rather than read at insertion time.
   *
   * `selectionStart` survives blur, so reading it when the transcript arrives
   * would usually work — but it reads 0 on a field that was never focused, and
   * a draft restored from a previous visit is exactly that field. Inserting a
   * transcript at position 0 of text the owner wrote yesterday is the kind of
   * defect that looks like corruption. `null` means "no boundary was placed",
   * and the transcript goes to the end.
   */
  const caretRef = useRef<{ start: number; end: number } | null>(null);
  /** The composer's value immediately after the last insertion. */
  const afterInsertRef = useRef<string | null>(null);
  const voiceSegmentsRef = useRef(0);
  const reportedModalities = useRef<Set<ModalityChoice>>(new Set());

  /** `2J-METRICS-003`, re-wired. Content-free, and once per modality per mount. */
  function reportModality(modality: ModalityChoice) {
    if (reportedModalities.current.has(modality)) return;
    reportedModalities.current.add(modality);
    recordCaptureModeSelected({
      attemptId: attemptIdRef.current!,
      captureMode: modality,
      captureSource,
      locale,
    });
  }

  async function submitCapture(state: CaptureState, formData: FormData): Promise<CaptureState> {
    recordCaptureStarted({ attemptId: attemptIdRef.current!, captureSource, locale });
    formData.set("idempotencyKey", idempotencyKeyRef.current!);
    formData.set("captureSource", captureSource);

    /*
     * `2J-METRICS-004`, restated for the shared field. The old comparison asked
     * "is the submitted text still the transcript" — meaningful only while the
     * transcript WAS the whole draft. Here it is one insertion inside whatever
     * else the owner wrote, so the question becomes "did anything change after
     * the transcript landed", which is the same question and is answerable.
     */
    const submitted = String(formData.get("content") ?? "");
    if (voiceSegmentsRef.current > 0 && afterInsertRef.current !== null
      && submitted.trim() !== afterInsertRef.current.trim()) {
      recordVoiceTranscriptionFinished({
        attemptId: `${attemptIdRef.current}:edited`,
        outcome: "succeeded",
        draftEdited: true,
        additionalSegment: voiceSegmentsRef.current > 1,
        locale,
      });
    }

    const result = await action(state, formData);
    if (result.status === "success") {
      idempotencyKeyRef.current = crypto.randomUUID();
      /*
       * `2O-RECOVER-006`. Cleared here rather than in an effect, and only on
       * success — a failed capture keeps the draft, which is the whole reason
       * the draft exists and the mirror of the defect slice 2O.3 found where
       * React reset an uncontrolled form it could not tell had failed.
       */
      clearDraft(draftKey(captureSource));
      setHasDraft(false);
      caretRef.current = null;
      afterInsertRef.current = null;
      voiceSegmentsRef.current = 0;
    }
    attemptIdRef.current = crypto.randomUUID();
    return result;
  }

  /**
   * The attachment leaves the composer when it has actually been sent.
   *
   * In the action rather than an effect keyed on the result, for the reason
   * `submitCapture` gives above and which is not stylistic: an effect cannot
   * tell "this success just happened" from "this success is still the current
   * state while the owner attaches the next file", so the second file's chip
   * would be cleared by the first file's success.
   */
  async function submitAttachment(state: AgentFormState, formData: FormData): Promise<AgentFormState> {
    const result = await attachmentAction(state, formData);
    if (result.status === "success") {
      setAttachedName(null);
      if (fileInputRef.current !== null) fileInputRef.current.value = "";
    }
    return result;
  }

  const [state, formAction, pending] = useActionState(submitCapture, initialState);
  const [attachmentState, attachmentFormAction, attachmentPending] = useActionState(
    submitAttachment,
    idleAttachmentState,
  );

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

  /** `2O-RECOVER-006`. Per surface, so Today and Capture never show each other's text. */
  const draftStorageKey = draftKey(captureSource);

  /*
   * Restore in a LAYOUT effect so the value lands before paint. A restore in a
   * passive effect is visible as an empty box that fills in. `defaultValue` is
   * not usable: the field is uncontrolled and this component remounts on
   * navigation back to the surface, which is the case that matters.
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

  function rememberCaret(field: HTMLTextAreaElement) {
    caretRef.current = { start: field.selectionStart, end: field.selectionEnd };
  }

  function noteDraft(value: string) {
    writeDraft(draftStorageKey, value);
    setHasDraft(value.length > 0);
  }

  /** `2P-CAPTURE-006`. The transcript joins the sentence rather than replacing it. */
  function insertTranscript(text: string) {
    const field = textareaRef.current;
    if (field === null) return;
    const boundary = caretRef.current ?? { start: field.value.length, end: field.value.length };
    const start = Math.min(boundary.start, field.value.length);
    const end = Math.min(Math.max(boundary.end, start), field.value.length);
    const before = field.value.slice(0, start);
    const after = field.value.slice(end);
    // A transcript dropped straight against the previous word would read as one
    // word. A leading space is added only where one is missing.
    const separated = before.length > 0 && !/\s$/.test(before) ? ` ${text}` : text;
    field.value = `${before}${separated}${after}`;
    const caret = before.length + separated.length;
    field.setSelectionRange(caret, caret);
    caretRef.current = { start: caret, end: caret };
    afterInsertRef.current = field.value;
    voiceSegmentsRef.current += 1;
    noteDraft(field.value);
    field.focus();
  }

  /**
   * The one rule, stated once.
   *
   * `2P-CAPTURE-005` requires drag, drop and paste to carry "the same
   * validation as file selection", so there is exactly one predicate and all
   * three arrival routes ask it. It mirrors `uploadAttachment`'s own checks --
   * a client check is a courtesy and the server check is the control, and the
   * two share `ATTACHMENT_LIMITS` so they cannot drift apart.
   */
  function rejectionFor(file: File): string | null {
    if (!ALLOWED_MIME_TYPES.has(file.type)) return copy.rejectedType;
    if (file.size === 0 || file.size > ATTACHMENT_LIMITS.maxBytes) return copy.rejectedSize;
    return null;
  }

  /** The picker already put the file in the input; only the decision is left. */
  function acceptSelection(file: File | undefined): void {
    if (file === undefined) return;
    const rejection = rejectionFor(file);
    if (rejection !== null) {
      clearAttachment();
      setAttachmentError(rejection);
      return;
    }
    setAttachmentError(null);
    setAttachedName(file.name);
    reportModality("attachment");
  }

  /**
   * A dropped or pasted file has to be *put into* that same input, so that it
   * reaches the same form, the same action and the same server-side checks.
   * Nothing downstream is aware this happened, which is the point: there is no
   * second upload path, only a second way to fill the first one.
   */
  function acceptTransferredFile(file: File | undefined): void {
    if (file === undefined) return;
    const rejection = rejectionFor(file);
    if (rejection !== null) {
      setAttachmentError(rejection);
      return;
    }
    const input = fileInputRef.current;
    if (input === null) return;
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
    } catch {
      // A browser that exposes a drop but not a constructible `DataTransfer`
      // cannot be handed the file. Says so instead of appearing to accept it --
      // the requirement's own words are "where the browser exposes them".
      setAttachmentError(copy.dropUnavailable);
      return;
    }
    setAttachmentError(null);
    setAttachedName(file.name);
    reportModality("attachment");
  }

  function clearAttachment() {
    setAttachedName(null);
    setAttachmentError(null);
    if (fileInputRef.current !== null) fileInputRef.current.value = "";
  }

  const showAttachmentFeedback = attachmentState.status === "error"
    || (attachmentState.status === "success" && attachedName === null);

  return (
    <div
      className="composer"
      data-dragging={dragging ? "true" : undefined}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        // Without `preventDefault` the browser navigates to the dropped file.
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        if (event.dataTransfer.files.length === 0) return;
        event.preventDefault();
        setDragging(false);
        acceptTransferredFile(event.dataTransfer.files[0]);
      }}
      onPaste={(event) => {
        // Only files are intercepted. A text paste is the overwhelmingly common
        // case and must keep behaving exactly as the browser intends.
        const file = event.clipboardData?.files?.[0];
        if (file === undefined) return;
        event.preventDefault();
        acceptTransferredFile(file);
      }}
    >
      {/*
        The attachment form. A SIBLING of the text form, never a parent or a
        child -- nested forms are invalid, and merging the two is the write path
        this slice must not create. Its only control lives inside the composer
        row below and points back here with `form={attachmentFormId}`.
      */}
      <form id={attachmentFormId} action={attachmentFormAction} className="composer-attachment-form">
        <input type="hidden" name="locale" value={locale} />
      </form>

      <form
        ref={formRef}
        action={formAction}
        className="capture-card"
        onSubmit={(event) => { if (!online) event.preventDefault(); }}
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="source" value="web" />
        <label htmlFor="quick-entry" className="sr-only">{copy.entryLabel}</label>
        <textarea
          ref={textareaRef}
          id="quick-entry"
          name="content"
          required
          maxLength={12000}
          disabled={pending}
          placeholder={copy.placeholder}
          aria-describedby={state.status === "error" ? "capture-error" : undefined}
          onSelect={(event) => rememberCaret(event.currentTarget)}
          onChange={(event) => {
            // The field stays uncontrolled -- controlling it would re-render the
            // whole composer on every keystroke -- so the draft is written from
            // the event and read back only on mount.
            rememberCaret(event.currentTarget);
            noteDraft(event.target.value);
            if (event.target.value.length > 0) reportModality("text");
          }}
        />

        {/*
          `2O-RECOVER-006` -- "and says so". A draft the reader cannot see is
          kept is a draft they will retype, and one they do not know exists is
          one they cannot choose to remove.
        */}
        {hasDraft ? (
          <p className="capture-draft-note" data-composer-draft="kept">
            {copy.draftKept}
            <button
              className="capture-draft-discard"
              type="button"
              onClick={() => {
                // Cleared first, then the field -- the same order as the
                // success path, and for the same reason.
                clearDraft(draftStorageKey);
                if (textareaRef.current !== null) textareaRef.current.value = "";
                caretRef.current = null;
                afterInsertRef.current = null;
                voiceSegmentsRef.current = 0;
                setHasDraft(false);
                textareaRef.current?.focus();
              }}
            >
              {copy.discard}
            </button>
          </p>
        ) : null}

        {attachedName !== null ? (
          <p className="composer-attachment" data-composer-attachment="pending">
            <Paperclip size={15} aria-hidden="true" />
            <span className="composer-attachment-name">{attachedName}</span>
            {/*
              `form={attachmentFormId}` -- this button sits inside the text form
              and submits the OTHER one. It is the mechanism that lets one
              surface keep two write paths, and the reason send below can never
              be the control that uploads a file.
            */}
            <button type="submit" form={attachmentFormId} disabled={attachmentPending}>
              {attachmentPending ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : null}
              {copy.sendFile}
            </button>
            <button type="button" className="composer-attachment-remove" onClick={clearAttachment}>
              <X size={14} aria-hidden="true" />
              <span className="sr-only">{copy.removeFile}</span>
            </button>
          </p>
        ) : null}

        {attachmentError !== null ? (
          <p className="capture-error" role="alert">{attachmentError}</p>
        ) : null}
        {/*
          The composer's one persistent status channel (`2P-ACCESS-001`).

          **A live region has to exist before its text arrives.** Every announcing
          element on this surface used to be rendered conditionally — the
          attachment result appeared *with* its `role="status"` already
          populated, and a region created in the same commit as its content is
          frequently not announced at all, because there was no region for the
          screen reader to have been observing. Slice 2P.8 measured it: the idle
          composer carried no live region of any kind, so "announce upload and
          send states" was true of the visible text and not of the audible one.

          `role="alert"` is deliberately left where it is. An alert is announced
          on insertion by design, which is exactly why errors use it and why
          they are not routed through here — and routing them through here as
          well would announce every failure twice.

          Empty when idle, `sr-only` always: the visible echoes below stay
          visible and stay silent, so nothing is read out twice.
        */}
        <div aria-atomic="true" aria-live="polite" className="sr-only" role="status">
          {pending
            ? copy.sending
            : attachmentPending
              ? copy.attachmentSending
              : showAttachmentFeedback && attachmentState.status === "success"
                ? attachmentState.message
                : ""}
        </div>

        {showAttachmentFeedback && attachmentState.message.length > 0 ? (
          <p
            className={attachmentState.status === "error" ? "capture-error" : "composer-attachment-sent"}
            // The success echo is now visual only: its sentence reaches a screen
            // reader through the persistent region above, and carrying a second
            // `role="status"` here would deliver it twice.
            role={attachmentState.status === "error" ? "alert" : undefined}
          >
            {attachmentState.message}
          </p>
        ) : null}

        {/*
          The offline sentence states what actually happens: the draft stays in
          this tab, and nothing is queued or sent.
        */}
        {!online && (
          <UniversalStateLine
            className="capture-error"
            description={copy.offline}
            locale={locale}
            state="offline"
          />
        )}
        {state.status === "error" && (
          <p id="capture-error" className="capture-error" role="alert">{state.message}</p>
        )}

        <div className="capture-actions">
          {/*
            `2P-CAPTURE-003`. First in the row, and the input it labels belongs
            to the attachment form -- so the picker, a drop and a paste all
            arrive at one place.
          */}
          <label className="composer-attach" htmlFor={fileInputId} aria-label={copy.attach}>
            <Paperclip size={18} aria-hidden="true" />
            <input
              ref={fileInputRef}
              id={fileInputId}
              form={attachmentFormId}
              name="file"
              type="file"
              /*
                No `required`. The standalone upload form carried it because its
                submit button was always on screen with nothing chosen; here the
                only control that submits this form is rendered *by* a chosen
                file, so the attribute could never fire for anyone. Leaving it
                would have been a constraint nobody can reach that still blocks
                submission whenever the browser and the element disagree about
                what is in the input. `uploadAttachment` refuses an absent or
                empty file on arrival, which is the control that matters.
              */
              accept={ACCEPT_ATTRIBUTE}
              onChange={(event) => acceptSelection(event.target.files?.[0])}
            />
          </label>

          <span className="composer-hint">
            <Sparkles size={15} aria-hidden="true" />
            {pt
              ? `O ${agentName} organiza sem alterar o original`
              : `${agentName} organizes without changing the original`}
          </span>

          {/* `2P-CAPTURE-004`. The microphone is beside send, not a mode. */}
          <div className="composer-send">
            <VoiceComposer
              locale={locale}
              transcribeAction={transcribeAction}
              onTranscript={insertTranscript}
              onRecordingStart={() => reportModality("voice")}
            />
            <button type="submit" disabled={pending || !online}>
              {pending ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : null}
              {pending ? copy.sending : copy.send}
              {!pending && <ArrowUpRight size={17} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </form>

      {/* `2J-CAPTURE-005`. Stated, because the absence of a rule is invisible. */}
      <p className="capture-no-classification">{copy.noClassification}</p>

      {state.status === "success" && (
        <CaptureReceiptView receipt={state.receipt} locale={locale} agentName={agentName} />
      )}
    </div>
  );
}
