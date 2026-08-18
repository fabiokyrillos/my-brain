/**
 * `2J-VOICE-006` … `2J-VOICE-015`, as behaviour, under the slice 2P.3 contract.
 *
 * MediaRecorder and getUserMedia are faked. That is a real limit and it is
 * named rather than glossed: this proves the **component's** contract — which
 * states it enters, what it sends, what it keeps, what it releases — and proves
 * nothing about how Safari or Android Chrome actually behave. Gate G-2J.4b
 * requires measurement on real devices and is NOT discharged here.
 *
 * ## What moved, and what did not
 *
 * The component stopped owning a draft and a capture form; it now reports a
 * transcript through `onTranscript` and the composer decides where it lands.
 * So every assertion about a *draft textarea* moved to `composer.test.tsx`,
 * where the draft actually lives, and the assertions here became assertions
 * about **what is handed over**: the same requirements, read at the new seam.
 *
 * `2J-VOICE-011` is the one worth watching. It used to mean "a failure does not
 * clear this component's textarea". It now means something stronger and easier
 * to get wrong: a failure must not call `onTranscript` at all, because a single
 * spurious call would insert something into text the owner wrote by hand.
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

function renderComposer(overrides: {
  transcribe?: TranscribeFn;
  onTranscript?: (text: string) => void;
  onRecordingStart?: () => void;
} = {}) {
  return render(
    <VoiceComposer
      locale="pt-BR"
      transcribeAction={overrides.transcribe ?? okTranscribe()}
      onTranscript={overrides.onTranscript ?? (() => {})}
      onRecordingStart={overrides.onRecordingStart}
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

describe("2J-VOICE-010/012 and 2P-CAPTURE-006: the transcript is handed over, never held", () => {
  it("reports the transcribed text exactly once, and keeps no field of its own", async () => {
    const onTranscript = vi.fn();
    renderComposer({ transcribe: okTranscribe("comprar pão amanhã"), onTranscript });
    await recordAndFinish();

    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("comprar pão amanhã"));
    expect(onTranscript).toHaveBeenCalledTimes(1);
    // The second textarea is what slice 2P.3 removed. Its absence is why a
    // transcript can join a sentence the owner had already begun.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByLabelText("Rascunho")).toBeNull();
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

  it("reports a second segment as its own hand-over rather than a replacement", async () => {
    const onTranscript = vi.fn();
    const transcribe = vi
      .fn<TranscribeFn>()
      .mockResolvedValueOnce({ status: "success", text: "primeira parte" })
      .mockResolvedValueOnce({ status: "success", text: "segunda parte" });
    renderComposer({ transcribe, onTranscript });

    await recordAndFinish();
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("primeira parte"));

    // The record button becomes "record another part" once a segment has landed.
    fireEvent.click(screen.getByRole("button", { name: /Gravar mais um trecho/ }));
    await screen.findByRole("button", { name: "Concluir" });
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));

    await waitFor(() => expect(onTranscript).toHaveBeenCalledTimes(2));
    // Each call carries only the NEW text. Handing over the accumulated draft
    // would make the composer's caret insertion duplicate everything before it.
    expect(onTranscript.mock.calls.map(([text]) => text)).toEqual(["primeira parte", "segunda parte"]);
  });
});

describe("2J-VOICE-011: a transcription failure disturbs nothing the owner wrote", () => {
  it("hands over nothing at all when transcription fails", async () => {
    const onTranscript = vi.fn();
    renderComposer({ transcribe: failTranscribe(), onTranscript });
    await recordAndFinish();

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    // The stronger form of the old assertion: there is no field here to
    // preserve any more, so the requirement is that the composer's field is
    // never touched -- and the only way this component could touch it is a call.
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("leaves an earlier segment's hand-over standing when a later one fails", async () => {
    const onTranscript = vi.fn();
    const transcribe = vi
      .fn<TranscribeFn>()
      .mockResolvedValueOnce({ status: "success", text: "texto que já existia" })
      .mockResolvedValueOnce({
        status: "error",
        code: "transcription_failed",
        message: "Não foi possível transcrever agora. Seu texto continua aqui.",
      });
    renderComposer({ transcribe, onTranscript });

    await recordAndFinish();
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("texto que já existia"));

    fireEvent.click(screen.getByRole("button", { name: /Gravar mais um trecho/ }));
    await screen.findByRole("button", { name: "Concluir" });
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onTranscript).toHaveBeenCalledTimes(1);
  });

  it("surfaces no provider detail, only the product's own message", async () => {
    renderComposer({ transcribe: failTranscribe() });
    await recordAndFinish();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent).toMatch(/Seu texto continua aqui/);
  });
});

describe("2J-VOICE-013/015: the audio rule is stated where the owner is deciding", () => {
  it("says nothing about audio before the microphone is involved", () => {
    // The control lives in the composer's action row now. A standing sentence
    // about recordings would be a permanent statement about a feature most
    // captures never touch.
    renderComposer();
    expect(screen.queryByText(/O áudio é descartado/)).toBeNull();
  });

  it("says it while recording, and keeps saying it once a segment has landed", async () => {
    renderComposer({ transcribe: okTranscribe("uma ideia") });
    fireEvent.click(screen.getByRole("button", { name: /Gravar/ }));
    await screen.findByText("Gravando");
    expect(screen.getByText(/O áudio é descartado/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Gravar mais um trecho/ })).toBeInTheDocument());
    expect(screen.getByText(/O áudio é descartado/)).toBeInTheDocument();
  });

  it("submits nothing itself, because it no longer owns a form", () => {
    const { container } = renderComposer();
    // `2P-CAPTURE-008`. This component cannot create an entry: there is no form
    // and no submit control in it to do so.
    expect(container.querySelectorAll("form")).toHaveLength(0);
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(0);
  });
});

describe("2P-CAPTURE-004: choosing the microphone is reported before anything is recorded", () => {
  it("reports the modality when record is pressed, not when audio arrives", async () => {
    const onRecordingStart = vi.fn();
    renderComposer({ onRecordingStart });
    expect(onRecordingStart).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Gravar/ }));
    await screen.findByText("Gravando");
    expect(onRecordingStart).toHaveBeenCalledTimes(1);
    // Content-free: there is no argument through which a transcript could go.
    expect(onRecordingStart.mock.calls[0]).toHaveLength(0);
  });

  it("reports it even when permission is then refused, because the choice was made", async () => {
    getUserMedia.mockRejectedValueOnce(new Error("denied"));
    const onRecordingStart = vi.fn();
    renderComposer({ onRecordingStart });

    fireEvent.click(screen.getByRole("button", { name: /Gravar/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onRecordingStart).toHaveBeenCalledTimes(1);
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
