"use client";

/**
 * `2J-VOICE-001` … `2J-VOICE-015` — record, transcribe, edit, confirm.
 *
 * ## The shape of the flow, and why each step is separate
 *
 * record → transcribe → **editable draft** → (type more, or record another
 * part) → **explicit confirm** → audio discarded.
 *
 * The draft step is the whole feature. Transcription is wrong often enough that
 * a flow which captured straight from the microphone would be a machine putting
 * words in someone's mouth and filing them under their own memory. So the
 * transcript arrives as text in a box the user owns, and **nothing is captured
 * until they press the button** (`2J-VOICE-015`).
 *
 * ## Where the audio lives, and for how long
 *
 * In memory, inside this component, until the transcript comes back — then it
 * is dropped on the floor. There is no upload to storage, no object URL kept
 * past its use, no cache, and no "keep it in case they retry". Cancelling stops
 * the tracks and drops the chunks immediately (`2J-VOICE-008`).
 * `no-durable-audio-guard.test.ts` re-derives that absence from the schema and
 * the source tree on every run rather than trusting this comment.
 *
 * ## What it will not do
 *
 * It never calls `captureEntry` on its own. Confirmation submits the **draft
 * text** through the same action the typed composer uses, injected as a prop —
 * so voice adds no write path, and a transcript is text like any other text.
 */

import { useActionState, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LoaderCircle, Mic, Square } from "lucide-react";

import type { Locale } from "@/lib/preferences";

import { transcriptionCopy } from "./voice-copy";
import type { CaptureAction, CaptureState } from "./quick-capture-form";
import { MAX_RECORDING_BYTES, type TranscribeState } from "./voice-contracts";

export type TranscribeAction = (
  state: TranscribeState,
  formData: FormData,
) => Promise<TranscribeState>;

/** `2J-VOICE-006`. Every state the user can be in, named. */
type RecordingPhase = "idle" | "recording" | "paused" | "transcribing" | "denied";


function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The container this browser will actually produce.
 *
 * Chromium supports `audio/webm`; Safari — every browser on iOS — does not, and
 * produces `audio/mp4`. Asking `MediaRecorder` rather than assuming is the
 * difference between working on half the target devices and all of them.
 * Returning `undefined` lets the browser pick its own default, which is the
 * correct fallback for anything not in the list.
 */
function preferredMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const candidate of ["audio/webm", "audio/mp4", "audio/ogg"]) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return undefined;
}

export function VoiceComposer({
  locale,
  transcribeAction,
  captureAction,
  agentName,
}: {
  locale: Locale;
  transcribeAction: TranscribeAction;
  /** The SAME action the typed composer uses. Voice adds no write path. */
  captureAction: CaptureAction;
  agentName: string;
}) {
  const text = transcriptionCopy[locale];
  const [phase, setPhase] = useState<RecordingPhase>("idle");
  const [draft, setDraft] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  if (idempotencyKeyRef.current === null) idempotencyKeyRef.current = crypto.randomUUID();

  /** Stops everything and releases the microphone. Safe to call twice. */
  const teardown = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    recorderRef.current = null;
    // Releasing the tracks is what turns the browser's recording indicator off.
    // Leaving them open would keep the microphone live after the user thinks
    // they stopped, which is worse than any storage question.
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    chunksRef.current = [];
  }, []);

  // The microphone must not outlive the component under any exit -- navigation,
  // an error, a parent unmount.
  useEffect(() => teardown, [teardown]);

  /*
    Capability detection without writing state from an effect.

    `useSyncExternalStore`'s third argument is the SERVER snapshot, which is why
    this is the right hook rather than `useEffect` + `setState`: the server
    renders "supported" and the client corrects it on its first paint, with no
    hydration mismatch and no state write during an effect. Subscribing to
    nothing is deliberate -- MediaRecorder support does not change while the
    page is open.
  */
  const supported = useSyncExternalStore(
    () => () => {},
    () => typeof navigator !== "undefined" && Boolean(navigator.mediaDevices) && typeof MediaRecorder !== "undefined",
    () => true,
  );

  async function start() {
    setError(null);
    try {
      // `2J-VOICE-009`. Permission is requested here -- at the point of value,
      // when the user has pressed record -- not on page load.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start();
      recorderRef.current = recorder;
      setElapsed(0);
      setPhase("recording");
      timerRef.current = setInterval(() => setElapsed((value) => value + 1), 1000);
    } catch {
      // Denial and "no microphone at all" are indistinguishable here by design:
      // the browser deliberately does not say which, and guessing would produce
      // confidently wrong advice.
      teardown();
      setPhase("denied");
    }
  }

  function pause() {
    recorderRef.current?.pause();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setPhase("paused");
  }

  function resume() {
    recorderRef.current?.resume();
    timerRef.current = setInterval(() => setElapsed((value) => value + 1), 1000);
    setPhase("recording");
  }

  /** `2J-VOICE-007`. Cancel discards the audio and keeps the draft. */
  function cancel() {
    try {
      recorderRef.current?.stop();
    } catch {
      // Already stopped. Teardown is what matters and runs either way.
    }
    teardown();
    setElapsed(0);
    setPhase("idle");
  }

  async function finish() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    const mimeType = recorder.mimeType || "audio/webm";
    setPhase("transcribing");

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: mimeType }));
      try {
        recorder.stop();
      } catch {
        resolve(new Blob(chunksRef.current, { type: mimeType }));
      }
    });
    // The microphone is released the instant the audio is in hand, before the
    // network call -- the user is done speaking, so the light goes out.
    teardown();

    if (blob.size === 0 || blob.size > MAX_RECORDING_BYTES) {
      setError(blob.size === 0 ? text.unsupportedFormat : text.tooLarge);
      setPhase("idle");
      return;
    }

    const form = new FormData();
    form.set("audio", new File([blob], "recording", { type: mimeType }));
    form.set("mimeType", mimeType);
    form.set("locale", locale);

    const result = await transcribeAction({ status: "idle" }, form);
    // Whatever happened, the audio is gone by now. There is nothing to retry
    // against, which is exactly why a failure must not clear the draft.
    if (result.status === "success") {
      // `2J-VOICE-012`. Appended, never replaced: a second segment adds to what
      // the user already has, including anything they typed themselves.
      setDraft((previous) => (previous ? `${previous.trimEnd()} ${result.text}` : result.text));
      setError(null);
    } else if (result.status === "error") {
      setError(result.message);
    }
    setElapsed(0);
    setPhase("idle");
  }

  async function submitCapture(state: CaptureState, formData: FormData): Promise<CaptureState> {
    formData.set("idempotencyKey", idempotencyKeyRef.current!);
    formData.set("captureSource", "capture_page");
    const result = await captureAction(state, formData);
    if (result.status === "success") {
      idempotencyKeyRef.current = crypto.randomUUID();
      setDraft("");
    }
    return result;
  }

  const [captureState, captureFormAction, capturePending] = useActionState(submitCapture, {
    status: "idle",
  } as CaptureState);

  if (!supported) {
    return <p className="quiet-state voice-unsupported">{text.unsupported}</p>;
  }

  return (
    <div className="voice-composer">
      <div className="voice-controls">
        {phase === "idle" ? (
          <button type="button" className="voice-record" onClick={start}>
            <Mic size={16} aria-hidden="true" />
            {draft ? text.addSegment : text.recordLabel}
          </button>
        ) : null}

        {phase === "recording" || phase === "paused" ? (
          <div className="voice-live" role="status">
            <span className="voice-indicator" data-recording={phase === "recording"} aria-hidden="true" />
            <span>{phase === "recording" ? text.recording : text.pause}</span>
            {/* `2J-VOICE-006`. The duration is always visible while recording. */}
            <span className="voice-duration">{formatDuration(elapsed)}</span>
            {phase === "recording" ? (
              <button type="button" onClick={pause}>{text.pause}</button>
            ) : (
              <button type="button" onClick={resume}>{text.resume}</button>
            )}
            <button type="button" className="voice-finish" onClick={finish}>
              <Square size={14} aria-hidden="true" />
              {text.finish}
            </button>
            <button type="button" className="voice-cancel" onClick={cancel}>{text.cancel}</button>
          </div>
        ) : null}

        {phase === "transcribing" ? (
          <p className="voice-transcribing" role="status">
            <LoaderCircle className="spin" size={16} aria-hidden="true" />
            {text.transcribing}
          </p>
        ) : null}

        {phase === "denied" ? (
          <div className="voice-denied" role="alert">
            <strong>{text.permissionDenied}</strong>
            <p>{text.permissionHelp}</p>
            <button type="button" onClick={start}>{text.recordLabel}</button>
          </div>
        ) : null}
      </div>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {/*
        The draft. Present from the first transcript onward and editable
        throughout -- the user can fix a word, type a whole sentence the
        microphone never heard, or record another part and watch it append.
      */}
      <form action={captureFormAction} className="voice-draft-form">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="source" value="web" />
        <label htmlFor="voice-draft">{text.draftLabel}</label>
        <textarea
          id="voice-draft"
          name="content"
          className="voice-draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={5}
          placeholder={text.draftHint}
        />
        <p className="voice-notice">{text.discardedNotice}</p>
        <button type="submit" className="ux-action ux-action-primary" disabled={!draft.trim() || capturePending}>
          {capturePending ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : null}
          {locale === "pt-BR" ? `Capturar para o ${agentName}` : `Capture to ${agentName}`}
        </button>
        {captureState.status === "error" ? (
          <p className="form-error" role="alert">{captureState.message}</p>
        ) : null}
      </form>
    </div>
  );
}
