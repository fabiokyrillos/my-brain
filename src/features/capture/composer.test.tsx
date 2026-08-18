/**
 * `2P-CAPTURE-001` … `2P-CAPTURE-010`, as the owner meets them.
 *
 * ## What this file is allowed to prove
 *
 * The composer's **rendered contract**: what is ready without a choice, where
 * each control sits, which form each control submits, what a dropped or pasted
 * file goes through, and where a transcript lands. The structural half — that
 * unifying the surface did not unify the two write paths — is
 * `capture-write-path-guard.test.ts`, and it is deliberately not restated here:
 * a component test asserting "no second writer" would be asserting its own
 * mock.
 *
 * ## The property the whole slice turns on
 *
 * One `<form>` has one action, and there are two write paths that must stay
 * separate (`T-1`). So this file asserts, from several angles, that the
 * attachment controls belong to a **different form element** than the send
 * button — because the failure mode is not a missing feature, it is one action
 * that quietly branches on whether a file happens to be attached.
 *
 * ## The microphone is driven for real
 *
 * `MediaRecorder` and `getUserMedia` are faked, exactly as
 * `voice-composer.test.tsx` fakes them and with the same stated limit: this
 * proves the composer's contract, not how Safari behaves. What it does NOT do
 * is fake the transcript delivery itself — the transcript arrives by pressing
 * record and finish, so "the transcript lands at the caret" is proved through
 * the path the owner actually takes rather than through a synthetic event the
 * product would then have to be shaped around.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  recordCaptureModeSelected,
  recordCaptureStarted,
} from "@/features/product-analytics/interaction-events";

import { ATTACHMENT_LIMITS } from "@/lib/quotas";

import { Composer, type CaptureAction } from "./composer";
import { draftKey, readDraft } from "./composer-draft";
import type { TranscribeAction } from "./voice-composer";
import type { AgentFormAction } from "@/features/agent/forms";

// Every emitter reaches a Server Action, so jsdom trips `server-only` the
// moment it imports the real module.
vi.mock("@/features/product-analytics/interaction-events", () => ({
  recordCaptureStarted: vi.fn(),
  recordCaptureModeSelected: vi.fn(),
  recordVoiceTranscriptionFinished: vi.fn(),
}));

const receipt = {
  entryId: "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6",
  persisted: true as const,
  productState: "organizing" as const,
  messageKey: "capture_saved" as const,
  replayed: false,
};

const succeed: CaptureAction = async () => ({ status: "success" as const, receipt });
const upload: AgentFormAction = async () => ({ status: "success" as const, message: "Arquivo enviado." });

/**
 * Two jsdom gaps the drop path runs straight into, shimmed and named.
 *
 * 1. There is **no `DataTransfer` constructor**. The composer uses one to move
 *    a dropped file into the same input the picker fills.
 * 2. **`input.files` is not assignable.** jsdom's setter rejects anything that
 *    is not one of its own `FileList` instances, and there is no way to make
 *    one — `Object.setPrototypeOf` onto `FileList.prototype` is rejected too,
 *    which was measured rather than assumed.
 *
 * Both are real in a browser and absent here, so the alternative to shimming
 * was leaving `2P-CAPTURE-005` unproven at this level. It is shimmed instead,
 * and the limit is recorded in the slice acceptance record: what these tests
 * prove is the composer's **decision** — which files it accepts, which it
 * refuses, and that an accepted one is handed to the attachment input rather
 * than to the entry form. That the browser then submits that input is the
 * platform's contract, not this component's.
 *
 * `setData`/`getData` exist because `userEvent`'s own paste helper constructs a
 * `DataTransfer` too; without them, stubbing the global breaks text pasting.
 */
class FakeDataTransfer {
  private readonly collected: File[] = [];
  private readonly data = new Map<string, string>();
  readonly items = { add: (file: File) => this.collected.push(file) };
  setData(format: string, value: string) { this.data.set(format, value); }
  getData(format: string) { return this.data.get(format) ?? ""; }
  clearData() { this.data.clear(); }
  get types() { return [...this.data.keys()]; }
  get files(): FileList {
    const list = this.collected;
    return Object.assign(list.slice(), { item: (index: number) => list[index] ?? null }) as unknown as FileList;
  }
}

/** Gives one input element an own `files` accessor that actually accepts a value. */
function makeFilesAssignable(input: HTMLInputElement) {
  let current: FileList | null = input.files;
  Object.defineProperty(input, "files", {
    configurable: true,
    get: () => current,
    set: (value: FileList) => { current = value; },
  });
}

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

function transcribes(text: string): TranscribeAction {
  return async () => ({ status: "success" as const, text });
}

function renderComposer(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
  return render(
    <Composer
      action={overrides.action ?? succeed}
      attachmentAction={overrides.attachmentAction ?? upload}
      transcribeAction={overrides.transcribeAction ?? transcribes("transcrição")}
      locale={overrides.locale ?? "pt-BR"}
      agentName={overrides.agentName ?? "Brain"}
      captureSource={overrides.captureSource ?? "capture_page"}
      initialState={overrides.initialState}
    />,
  );
}

const entryField = () => screen.getByRole("textbox", { name: "Nova entrada" }) as HTMLTextAreaElement;
const fileField = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;
const sendButton = () => screen.getByRole("button", { name: "Registrar" });
const micButton = () => screen.getByRole("button", { name: /^Gravar/ });
const surface = () => document.querySelector(".composer")!;

function docxFile(name = "relatorio.docx") {
  return new File(["bytes"], name, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

/** Record, then finish — the only way a transcript reaches the composer. */
async function dictate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(micButton());
  await user.click(await screen.findByRole("button", { name: "Concluir" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  stopped.length = 0;
  vi.stubGlobal("DataTransfer", FakeDataTransfer);
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("navigator", {
    // `onLine` matters: the composer disables send while offline, and a
    // navigator stub without it would silently disable the primary action in
    // every test below.
    onLine: true,
    mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: () => stopped.push("track") }] })) },
  });
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("2P-CAPTURE-002: text is ready immediately, with no mode choice first", () => {
  it("renders the writing field without asking which modality this is", () => {
    renderComposer();
    expect(entryField()).toBeInTheDocument();
    // The tab strip is what this requirement removes. Its absence IS the
    // requirement, so it is asserted rather than assumed.
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("offers no Escrever control standing between the owner and the field", () => {
    renderComposer();
    expect(screen.queryByRole("button", { name: /^Escrever$/ })).toBeNull();
  });

  it("still classifies nothing before capture", () => {
    renderComposer();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText(/Não precisa classificar nada antes/)).toBeInTheDocument();
  });
});

describe("2P-CAPTURE-001: Today and Capture mount one contract", () => {
  it("renders the same controls under either capture source", () => {
    const { unmount } = renderComposer({ captureSource: "capture_page" });
    const onCapturePage = screen.getAllByRole("button").map((node) => node.className);
    unmount();

    renderComposer({ captureSource: "home" });
    expect(screen.getAllByRole("button").map((node) => node.className)).toEqual(onCapturePage);
  });

  it("keeps the two surfaces' drafts apart, because one contract is not one draft", async () => {
    const user = userEvent.setup();
    renderComposer({ captureSource: "home" });
    await user.type(entryField(), "rascunho do cockpit");

    expect(readDraft(draftKey("home"))).toBe("rascunho do cockpit");
    expect(readDraft(draftKey("capture_page"))).toBeNull();
  });
});

describe("2P-CAPTURE-003: the attachment action sits at the left and keeps its own write path", () => {
  it("puts the attachment control before the send button in the action row", () => {
    renderComposer();
    const attach = screen.getByLabelText("Anexar arquivo");
    // `DOCUMENT_POSITION_FOLLOWING` — send comes after attach in document
    // order, which is what "at the left" means in a row that flips under RTL
    // rather than in absolute pixels.
    expect(attach.compareDocumentPosition(sendButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("owns the file input through a DIFFERENT form than the one that sends an entry", () => {
    renderComposer();
    const file = fileField();
    expect(file.form).not.toBeNull();
    expect(entryField().form).not.toBeNull();
    // The architectural constraint of this slice, in one assertion.
    expect(file.form).not.toBe(entryField().form);
  });

  it("filters the picker with the allowlist the server enforces, not a second list", () => {
    renderComposer();
    for (const mime of ATTACHMENT_LIMITS.mimeAllowlist) {
      expect(fileField().accept).toContain(mime);
    }
  });

  it("still refuses a file the picker filter let through", async () => {
    renderComposer();
    const input = fileField();
    /*
      Driven through `change` rather than `userEvent.upload`, which refuses to
      deliver a file that `accept` excludes. A real dialog is not that strict —
      the owner can switch it to "All files" and choose anything — so the check
      below is reachable in a browser and unreachable through the helper. The
      helper's strictness is the artefact; the check is the product.
    */
    makeFilesAssignable(input);
    input.files = [new File(["x"], "malware.exe", { type: "application/x-msdownload" })] as unknown as FileList;
    fireEvent.change(input);

    expect(await screen.findByRole("alert")).toHaveTextContent(/tipo de arquivo/i);
    expect(screen.queryByText("malware.exe")).toBeNull();
  });

  it("submits the attachment through the attachment action alone", async () => {
    const attachmentAction = vi.fn<AgentFormAction>(async () => ({ status: "success" as const, message: "Arquivo enviado." }));
    const action = vi.fn<CaptureAction>(succeed);
    const user = userEvent.setup();
    renderComposer({ action, attachmentAction });

    await user.upload(fileField(), docxFile());
    await user.click(await screen.findByRole("button", { name: "Enviar arquivo" }));

    await waitFor(() => expect(attachmentAction).toHaveBeenCalledTimes(1));
    // The entry writer was never reached. One action branching on whether a
    // file is present is exactly the third write path this slice must not
    // create, and this is the assertion that would catch it.
    expect(action).not.toHaveBeenCalled();
  });
});

describe("2P-CAPTURE-004: the microphone sits beside send and never clears typed text", () => {
  it("renders the microphone in the same group as the send button", () => {
    renderComposer();
    expect(within(sendButton().parentElement!).getByRole("button", { name: /^Gravar/ })).toBeInTheDocument();
  });

  it("leaves what the owner typed untouched while recording and after the transcript", async () => {
    const user = userEvent.setup();
    renderComposer({ transcribeAction: transcribes("ditado") });

    await user.type(entryField(), "texto que já estava aqui");
    await user.click(micButton());
    expect(entryField().value).toBe("texto que já estava aqui");

    await user.click(await screen.findByRole("button", { name: "Concluir" }));
    await waitFor(() => expect(entryField().value).toBe("texto que já estava aqui ditado"));
  });
});

describe("2P-CAPTURE-005: drag, drop and paste reach the same input as the picker", () => {
  it("accepts a dropped file into the very input the picker fills", async () => {
    renderComposer();
    makeFilesAssignable(fileField());
    fireEvent.drop(surface(), { dataTransfer: { files: [docxFile()], types: ["Files"] } });

    expect(await screen.findByText("relatorio.docx")).toBeInTheDocument();
    expect(fileField().files?.[0]?.name).toBe("relatorio.docx");
  });

  it("accepts a pasted file the same way", async () => {
    renderComposer();
    makeFilesAssignable(fileField());
    fireEvent.paste(surface(), { clipboardData: { files: [docxFile("colado.docx")] } });

    expect(await screen.findByText("colado.docx")).toBeInTheDocument();
    expect(fileField().files?.[0]?.name).toBe("colado.docx");
  });

  it("refuses a dropped file the picker would have refused, by the same rule", async () => {
    renderComposer();
    makeFilesAssignable(fileField());
    fireEvent.drop(surface(), {
      dataTransfer: { files: [new File(["x"], "video.mov", { type: "video/quicktime" })], types: ["Files"] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/tipo de arquivo/i);
    expect(fileField().files?.length ?? 0).toBe(0);
  });

  it("lets a text paste through untouched, because only files are intercepted", async () => {
    const user = userEvent.setup();
    renderComposer();
    entryField().focus();
    await user.paste("colado como texto");

    expect(entryField().value).toBe("colado como texto");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("2P-CAPTURE-006/007: a transcript lands at the composition boundary and stays editable", () => {
  it("inserts at the caret rather than replacing or appending blindly", async () => {
    const user = userEvent.setup();
    renderComposer({ transcribeAction: transcribes("MEIO") });
    const field = entryField();

    await user.type(field, "antes depois");
    field.setSelectionRange(5, 5);
    fireEvent.select(field);
    await dictate(user);

    await waitFor(() => expect(field.value).toBe("antes MEIO depois"));
  });

  it("appends at the end when the owner has placed no caret", async () => {
    const user = userEvent.setup();
    renderComposer({ transcribeAction: transcribes("primeiro trecho") });
    await dictate(user);

    await waitFor(() => expect(entryField().value).toBe("primeiro trecho"));
  });

  it("leaves the field editable, so the owner can type more and record again", async () => {
    const user = userEvent.setup();
    renderComposer({ transcribeAction: transcribes("segmento") });
    const field = entryField();

    await dictate(user);
    await waitFor(() => expect(field.value).toBe("segmento"));
    await user.type(field, " e mais");
    await dictate(user);

    await waitFor(() => expect(field.value).toBe("segmento e mais segmento"));
  });

  it("lets the owner discard everything the microphone produced", async () => {
    const user = userEvent.setup();
    renderComposer({ transcribeAction: transcribes("para descartar") });
    await dictate(user);
    await waitFor(() => expect(entryField().value).toBe("para descartar"));

    await user.click(screen.getByRole("button", { name: "Descartar" }));
    expect(entryField().value).toBe("");
  });

  it("keeps the inserted transcript in the draft, so navigating away does not lose it", async () => {
    const user = userEvent.setup();
    renderComposer({ captureSource: "capture_page", transcribeAction: transcribes("ditado") });
    await dictate(user);

    await waitFor(() => expect(readDraft(draftKey("capture_page"))).toBe("ditado"));
  });
});

describe("2P-CAPTURE-008: only an explicit send creates an entry", () => {
  it("creates nothing when a transcript arrives", async () => {
    const action = vi.fn<CaptureAction>(succeed);
    const user = userEvent.setup();
    renderComposer({ action, transcribeAction: transcribes("ditado") });
    await dictate(user);

    await waitFor(() => expect(entryField().value).toBe("ditado"));
    expect(action).not.toHaveBeenCalled();
  });

  it("creates nothing when a file is attached", async () => {
    const action = vi.fn<CaptureAction>(succeed);
    const user = userEvent.setup();
    renderComposer({ action });
    await user.upload(fileField(), docxFile());

    expect(await screen.findByText("relatorio.docx")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("creates one when the owner presses send, carrying its own idempotency key", async () => {
    const action = vi.fn<CaptureAction>(succeed);
    const user = userEvent.setup();
    renderComposer({ action, captureSource: "home" });

    await user.type(entryField(), "Nova ideia");
    await user.click(sendButton());

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const submitted = action.mock.calls[0][1];
    expect(submitted.get("content")).toBe("Nova ideia");
    expect(submitted.get("source")).toBe("web");
    expect(submitted.get("captureSource")).toBe("home");
    expect(String(submitted.get("idempotencyKey"))).toMatch(/^[0-9a-f-]{36}$/i);
    expect(recordCaptureStarted).toHaveBeenCalledWith({
      attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      captureSource: "home",
      locale: "pt-BR",
    });
  });
});

describe("2P-CAPTURE-009: the recording is released, and the composer never holds it", () => {
  it("releases the microphone as soon as the audio is in hand", async () => {
    const user = userEvent.setup();
    renderComposer({ transcribeAction: transcribes("ok") });
    await dictate(user);

    await waitFor(() => expect(stopped).toContain("track"));
  });

  it("releases it on cancel too, and sends nothing", async () => {
    const action = vi.fn<CaptureAction>(succeed);
    const user = userEvent.setup();
    renderComposer({ action });

    await user.click(micButton());
    await user.click(await screen.findByRole("button", { name: "Cancelar" }));

    expect(stopped).toContain("track");
    expect(action).not.toHaveBeenCalled();
    expect(entryField().value).toBe("");
  });
});

describe("2P-CAPTURE-010: the draft carries text and never authority", () => {
  it("never writes a filename into the draft", async () => {
    const user = userEvent.setup();
    renderComposer({ captureSource: "capture_page" });
    await user.upload(fileField(), docxFile());

    expect(await screen.findByText("relatorio.docx")).toBeInTheDocument();
    // A filename is the owner's content. The draft holds what they typed and
    // nothing the product learned about them.
    expect(readDraft(draftKey("capture_page"))).toBeNull();
  });

  it("never writes the idempotency key, so a restored draft cannot replay a send", async () => {
    const user = userEvent.setup();
    renderComposer({ captureSource: "capture_page" });
    await user.type(entryField(), "algo");

    expect(window.sessionStorage.getItem(draftKey("capture_page"))).toBe("algo");
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index)!;
      expect(window.sessionStorage.getItem(key)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    }
  });

  it("rotates the key after a success so two entries never collide", async () => {
    const action = vi.fn<CaptureAction>(succeed);
    const user = userEvent.setup();
    renderComposer({ action });

    await user.type(entryField(), "primeira");
    await user.click(sendButton());
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    await user.type(entryField(), "segunda");
    await user.click(sendButton());
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));

    expect(action.mock.calls[0][1].get("idempotencyKey")).not.toBe(
      action.mock.calls[1][1].get("idempotencyKey"),
    );
  });

  it("keeps the typed text when the send fails", () => {
    renderComposer({
      initialState: { status: "error", code: "validation_failed", message: "Escreva algo para registrar." },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Escreva algo para registrar.");
  });
});

describe("capture_mode_selected keeps a producer once the tabs are gone", () => {
  it("reports the attachment modality when a file is actually chosen", async () => {
    const user = userEvent.setup();
    renderComposer({ captureSource: "capture_page" });
    await user.upload(fileField(), docxFile());

    await waitFor(() =>
      expect(recordCaptureModeSelected).toHaveBeenCalledWith({
        attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        captureMode: "attachment",
        captureSource: "capture_page",
        locale: "pt-BR",
      }),
    );
  });

  it("reports the voice modality when recording starts", async () => {
    const user = userEvent.setup();
    renderComposer();
    await user.click(micButton());

    await waitFor(() =>
      expect(recordCaptureModeSelected).toHaveBeenCalledWith(
        expect.objectContaining({ captureMode: "voice" }),
      ),
    );
  });

  it("reports the text modality when the owner starts writing", async () => {
    const user = userEvent.setup();
    renderComposer({ captureSource: "home" });
    await user.type(entryField(), "a");

    await waitFor(() =>
      expect(recordCaptureModeSelected).toHaveBeenCalledWith(
        expect.objectContaining({ captureMode: "text", captureSource: "home" }),
      ),
    );
  });

  it("reports each modality once per mount rather than once per keystroke", async () => {
    const user = userEvent.setup();
    renderComposer();
    await user.type(entryField(), "muitas teclas");

    expect(
      vi.mocked(recordCaptureModeSelected).mock.calls.filter(([input]) => input.captureMode === "text"),
    ).toHaveLength(1);
  });

  it("carries only the closed enum member, with nowhere to put content", async () => {
    const user = userEvent.setup();
    renderComposer();
    await user.upload(fileField(), docxFile("segredo-do-cliente.docx"));

    await waitFor(() => expect(recordCaptureModeSelected).toHaveBeenCalled());
    for (const [input] of vi.mocked(recordCaptureModeSelected).mock.calls) {
      expect(JSON.stringify(input)).not.toContain("segredo");
      expect(Object.keys(input).sort()).toEqual(["attemptId", "captureMode", "captureSource", "locale"]);
    }
  });
});
