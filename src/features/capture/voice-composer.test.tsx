/**
 * `2J-VOICE-006` … `2J-VOICE-015`, as behaviour.
 *
 * MediaRecorder and getUserMedia are faked. That is a real limit and it is
 * named rather than glossed: this proves the **component's** contract — which
 * states it enters, what it sends, what it keeps, what it releases — and proves
 * nothing about how Safari or Android Chrome actually behave. Gate G-2J.4b
 * requires measurement on real devices and is NOT discharged here.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VoiceComposer } from "./voice-composer";

// The emitter reaches a Server Action, which trips the `server-only` guard the
// moment jsdom imports it. Same reason every other component test here mocks it.
vi.mock("@/features/product-analytics/interaction-events", () => ({
  recordVoiceTranscriptionFinished: vi.fn(),
}));
import type { TranscribeState } from "./voice-contracts";
import type { CaptureState } from "./quick-capture-form";

/** Tracks stopped, so the "microphone is released" claim is observable. */
const stopped: string[] = [];

class FakeMediaRecorder {
  static isTypeSupported = (type: string) => type === "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  state: "inactive" | "recording" | "paused" = "inactive";
  readonly mimeType: string;

  constructor(_stream: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? "audio/webm";
  }
  start() {
    this.state = "recording";
    this.ondataavailable?.({ data: new Blob(["audio-bytes"], { type: this.mimeType }) });
  }
  pause() { this.state = "paused"; }
  resume() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

function fakeStream() {
  return {
    getTracks: () => [{ stop: () => stopped.push("track") }],
  } as unknown as MediaStream;
}

let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  stopped.length = 0;
  getUserMedia = vi.fn(async () => fakeStream());
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Typed so `mock.calls[n][1]` is a `FormData` rather than `undefined`. */
type TranscribeFn = (state: TranscribeState, form: FormData) => Promise<TranscribeState>;

const okTranscribe = (text = "isto é um teste") =>
  vi.fn<TranscribeFn>(async (): Promise<TranscribeState> => ({ status: "success", text }));

const failTranscribe = (message = "Não foi possível transcrever agora. Seu texto continua aqui.") =>
  vi.fn<TranscribeFn>(async (): Promise<TranscribeState> => ({
    status: "error",
    code: "transcription_failed",
    message,
  }));

const okCapture = vi.fn(async (): Promise<CaptureState> => ({ status: "idle" }));

function renderComposer(overrides: {
  transcribe?: TranscribeFn;
  capture?: typeof okCapture;
} = {}) {
  return render(
    <VoiceComposer
      locale="pt-BR"
      transcribeAction={overrides.transcribe ?? okTranscribe()}
      captureAction={overrides.capture ?? okCapture}
      agentName="Brain"
    />,
  );
}

async function recordAndFinish() {
  fireEvent.click(screen.getByRole("button", { name: /Gravar/ }));
  await screen.findByRole("button", { name: "Concluir" });
  fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
}

describe("2J-VOICE-009: permission is asked at the point of value", () => {
  it("does not touch the microphone until the user presses record", () => {
    renderComposer();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("requests it on record, and shows the denied state with a way forward", async () => {
    getUserMedia.mockRejectedValueOnce(new Error("denied"));
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: /Gravar/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("O microfone está bloqueado.")).toBeInTheDocument();
    // A dead end would be a bug: the user can try again from here.
    expect(screen.getAllByRole("button", { name: /Gravar/ }).length).toBeGreaterThan(0);
  });
});

describe("2J-VOICE-006/007: the recording state is explicit and interruptible", () => {
  it("shows a live indicator and a duration while recording", async () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: /Gravar/ }));
    await screen.findByText("Gravando");
    expect(screen.getByText("0:00")).toBeInTheDocument();
  });

  it("offers pause, finish and cancel", async () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: /Gravar/ }));
    await screen.findByText("Gravando");
    for (const label of ["Pausar", "Concluir", "Cancelar"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("releases the microphone on cancel, and sends nothing", async () => {
    const transcribe = okTranscribe();
    renderComposer({ transcribe });
    fireEvent.click(screen.getByRole("button", { name: /Gravar/ }));
    await screen.findByText("Gravando");

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByText("Gravando")).toBeNull());
    // `2J-VOICE-008`. The track is stopped -- the browser's recording light
    // goes out -- and no audio ever left the device.
    expect(stopped.length).toBeGreaterThan(0);
    expect(transcribe).not.toHaveBeenCalled();
  });
});

describe("2J-VOICE-010/012: transcription produces an editable draft", () => {
  it("shows a transcribing state, then the transcript in an editable field", async () => {
    renderComposer({ transcribe: okTranscribe("comprar pão amanhã") });
    await recordAndFinish();

    const draft = await screen.findByLabelText("Rascunho");
    await waitFor(() => expect(draft).toHaveValue("comprar pão amanhã"));
    expect(draft.tagName).toBe("TEXTAREA");
  });

  it("sends the container the recorder actually produced, not an assumed one", async () => {
    const transcribe = okTranscribe();
    renderComposer({ transcribe });
    await recordAndFinish();

    await waitFor(() => expect(transcribe).toHaveBeenCalledTimes(1));
    const form = transcribe.mock.calls[0]![1];
    expect(form.get("mimeType")).toBe("audio/webm");
    expect(form.get("audio")).toBeInstanceOf(File);
  });

  it("appends a second segment instead of replacing the first", async () => {
    const transcribe = vi
      .fn<TranscribeFn>()
      .mockResolvedValueOnce({ status: "success", text: "primeira parte" })
      .mockResolvedValueOnce({ status: "success", text: "segunda parte" });
    renderComposer({ transcribe });

    await recordAndFinish();
    await waitFor(() => expect(screen.getByLabelText("Rascunho")).toHaveValue("primeira parte"));

    // The record button becomes "record another part" once a draft exists.
    fireEvent.click(screen.getByRole("button", { name: /Gravar mais um trecho/ }));
    await screen.findByRole("button", { name: "Concluir" });
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Rascunho")).toHaveValue("primeira parte segunda parte"),
    );
  });

  it("lets the user type alongside what was transcribed", async () => {
    renderComposer({ transcribe: okTranscribe("do microfone") });
    await recordAndFinish();
    const draft = await screen.findByLabelText("Rascunho");
    await waitFor(() => expect(draft).toHaveValue("do microfone"));

    fireEvent.change(draft, { target: { value: "do microfone e digitado" } });
    expect(draft).toHaveValue("do microfone e digitado");
  });
});

describe("2J-VOICE-011: a transcription failure preserves the draft", () => {
  it("keeps existing text and says so, rather than clearing the field", async () => {
    const transcribe = vi
      .fn<TranscribeFn>()
      .mockResolvedValueOnce({ status: "success", text: "texto que já existia" })
      .mockResolvedValueOnce({
        status: "error",
        code: "transcription_failed",
        message: "Não foi possível transcrever agora. Seu texto continua aqui.",
      });
    renderComposer({ transcribe });

    await recordAndFinish();
    await waitFor(() => expect(screen.getByLabelText("Rascunho")).toHaveValue("texto que já existia"));

    fireEvent.click(screen.getByRole("button", { name: /Gravar mais um trecho/ }));
    await screen.findByRole("button", { name: "Concluir" });
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    // The draft is untouched. This is the assertion the requirement exists for.
    expect(screen.getByLabelText("Rascunho")).toHaveValue("texto que já existia");
  });

  it("surfaces no provider detail, only the product's own message", async () => {
    renderComposer({ transcribe: failTranscribe() });
    await recordAndFinish();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent).toMatch(/Seu texto continua aqui/);
  });
});

describe("2J-VOICE-015: nothing is captured without explicit confirmation", () => {
  it("does not capture when a transcript arrives", async () => {
    const capture = vi.fn(async (): Promise<CaptureState> => ({ status: "idle" }));
    renderComposer({ transcribe: okTranscribe("uma ideia"), capture });
    await recordAndFinish();
    await waitFor(() => expect(screen.getByLabelText("Rascunho")).toHaveValue("uma ideia"));
    expect(capture).not.toHaveBeenCalled();
  });

  it("disables confirmation while the draft is empty", () => {
    renderComposer();
    expect(screen.getByRole("button", { name: /Capturar para o Brain/ })).toBeDisabled();
  });

  it("tells the user the audio is discarded, before they confirm", () => {
    renderComposer();
    expect(
      screen.getByText("O áudio é descartado depois da transcrição. Só o texto é guardado."),
    ).toBeInTheDocument();
  });
});

describe("the browser that cannot record says so, and typing still works", () => {
  it("renders a plain explanation when MediaRecorder is absent", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    vi.stubGlobal("navigator", {});
    renderComposer();
    expect(screen.getByText(/Este navegador não grava áudio/)).toBeInTheDocument();
  });
});
