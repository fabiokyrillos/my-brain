"use client";

/**
 * `2J-VOICE-001` … `2J-VOICE-015`, and `2P-CAPTURE-004`/`006`/`007`/`009` —
 * record, transcribe, hand the text over.
 *
 * ## What changed in slice 2P.3, and why it made the component smaller
 *
 * This used to be a *panel*: a microphone, its own editable draft box, and its
 * own form submitting entries through the shared action. Two boxes meant a
 * transcript could never join a sentence the owner had already begun, and meant
 * a second `<form>` creating entries.
 *
 * It is now a **control**. It records, transcribes, and calls `onTranscript`.
 * It owns no draft, renders no textarea, submits nothing, and never sees
 * `captureEntry` at all — the composer inserts the text at the caret and the
 * owner sends it, once, on purpose.
 *
 * ## The shape of the flow, and why each step is still separate
 *
 * record → transcribe → **the composer's editable field** → (type more, or
 * record another part) → **explicit send** → audio already gone.
 *
 * The editable step is still the whole feature. Transcription is wrong often
 * enough that a flow which captured straight from the microphone would be a
 * machine putting words in someone's mouth and filing them under their own
 * memory. Nothing is captured until the owner presses send (`2J-VOICE-015`,
 * `2P-CAPTURE-008`).
 *
 * ## Where the audio lives, and for how long
 *
 * In memory, inside this component, until the transcript comes back — then it
 * is dropped. No upload to storage, no object URL kept past its use, no cache,
 * no "keep it in case they retry". Cancelling stops the tracks and drops the
 * chunks immediately, and unmounting does the same (`2J-VOICE-008`,
 * `2P-CAPTURE-009`). `no-durable-audio-guard.test.ts` re-derives that absence
 * from the schema and the source tree on every run rather than trusting this
 * comment.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LoaderCircle, Mic, Square } from "lucide-react";

import type { Locale } from "@/lib/preferences";

import { transcriptionCopy } from "./voice-copy";
import { recordVoiceTranscriptionFinished } from "@/features/product-analytics/interaction-events";

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
  onTranscript,
  onRecordingStart,
}: {
  locale: Locale;
  transcribeAction: TranscribeAction;
  /** `2P-CAPTURE-006`. The only thing this component produces. */
  onTranscript: (text: string) => void;
  /** Content-free. Reports that the microphone modality was chosen. */
  onRecordingStart?: () => void;
}) {
  const text = transcriptionCopy[locale];
  const [phase, setPhase] = useState<RecordingPhase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /*
    `2J-METRICS-004`. Two facts worth knowing and neither of them is content:
    whether one recording was enough, and how the attempt ended. Refs rather
    than state because they are reported, not displayed.
  */
  const attemptIdRef = useRef<string | null>(null);
  if (attemptIdRef.current === null) attemptIdRef.current = crypto.randomUUID();
  /*
    State rather than a ref, unlike the id above: how many segments have landed
    decides both the record button's label and whether the discard notice is
    showing, so it has to cause a render.
  */
  const [segments, setSegments] = useState(0);

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
    onRecordingStart?.();
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

  /** `2J-VOICE-007`. Cancel discards the audio and touches no text. */
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
    // against, which is exactly why a failure must not disturb the composer.
    const additionalSegment = segments > 0;
    const landed = result.status === "success" ? segments + 1 : segments;
    if (result.status === "success") {
      setSegments(landed);
      // `2J-VOICE-012` / `2P-CAPTURE-006`. Handed over, never held: the
      // composer decides where in the sentence it belongs.
      onTranscript(result.text);
      setError(null);
    } else if (result.status === "error") {
      setError(result.message);
    }
    recordVoiceTranscriptionFinished({
      attemptId: `${attemptIdRef.current}:${landed}`,
      outcome: result.status === "success" ? "succeeded" : "failed",
      // Compared at send time by the composer, which is the only place that can
      // see whether the owner changed anything afterwards. `false` is the
      // truthful answer at this instant.
      draftEdited: false,
      additionalSegment,
      locale,
    });
    setElapsed(0);
    setPhase("idle");
  }

  if (!supported) {
    return <p className="quiet-state voice-unsupported">{text.unsupported}</p>;
  }

  return (
    <div className="voice-control">
      {phase === "idle" ? (
        <button type="button" className="composer-mic" onClick={start}>
          <Mic size={18} aria-hidden="true" />
          <span className="sr-only">{segments > 0 ? text.addSegment : text.recordLabel}</span>
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

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {/*
        `2J-VOICE-013`, told to the owner before anything is sent — and only
        while it is about them. A permanent line in the action row would be a
        standing statement about a feature most captures never touch; shown from
        the moment the microphone is live until the composer is sent, it is
        visible exactly when the owner is deciding.
      */}
      {phase !== "idle" || segments > 0 ? (
        <p className="voice-notice">{text.discardedNotice}</p>
      ) : null}
    </div>
  );
}
