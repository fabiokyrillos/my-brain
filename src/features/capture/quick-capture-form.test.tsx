import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordCaptureStarted } from "@/features/product-analytics/interaction-events";
import { QuickCaptureForm, type CaptureAction } from "./quick-capture-form";

vi.mock("@/features/product-analytics/interaction-events", () => ({
  recordCaptureStarted: vi.fn(),
}));

const receipt = {
  entryId: "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6",
  persisted: true as const,
  productState: "organizing" as const,
  messageKey: "capture_saved" as const,
  replayed: false,
};

describe("QuickCaptureForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("submits a web entry with a generated idempotency key and the supplied capture source", async () => {
    const action = vi.fn<CaptureAction>(async () => ({ status: "success" as const, receipt }));
    const user = userEvent.setup();
    render(<QuickCaptureForm action={action} locale="pt-BR" captureSource="home" />);

    await user.type(screen.getByRole("textbox", { name: "Nova entrada" }), "Nova ideia");
    await user.click(screen.getByRole("button", { name: "Registrar" }));

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

  it("shows a validation failure without losing the typed text", async () => {
    const action = vi.fn(async () => ({ status: "error" as const, code: "validation_failed" as const, message: "Escreva algo para registrar." }));
    render(
      <QuickCaptureForm
        action={action}
        initialState={{ status: "error", code: "validation_failed", message: "Escreva algo para registrar." }}
        locale="pt-BR"
        captureSource="home"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Escreva algo para registrar.");
  });

  it("shows the save receipt and clears the field for the next capture", async () => {
    const action = vi.fn(async () => ({ status: "success" as const, receipt }));
    const user = userEvent.setup();
    render(<QuickCaptureForm action={action} locale="pt-BR" captureSource="home" />);

    const textbox = screen.getByRole("textbox", { name: "Nova entrada" }) as HTMLTextAreaElement;
    await user.type(textbox, "Primeira captura");
    await user.click(screen.getByRole("button", { name: "Registrar" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Salvo. A organização foi solicitada."));
    await waitFor(() => expect(textbox.value).toBe(""));
    await waitFor(() => expect(textbox).toHaveFocus());
  });

  it("rotates the idempotency key after a successful capture so consecutive entries do not collide", async () => {
    const action = vi.fn<CaptureAction>(async () => ({ status: "success" as const, receipt }));
    const user = userEvent.setup();
    render(<QuickCaptureForm action={action} locale="pt-BR" captureSource="home" />);
    const textbox = screen.getByRole("textbox", { name: "Nova entrada" });

    await user.type(textbox, "Primeira captura");
    await user.click(screen.getByRole("button", { name: "Registrar" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));

    await user.type(textbox, "Segunda captura");
    await user.click(screen.getByRole("button", { name: "Registrar" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));

    const firstKey = action.mock.calls[0][1].get("idempotencyKey");
    const secondKey = action.mock.calls[1][1].get("idempotencyKey");
    expect(firstKey).not.toBe(secondKey);
  });

  it("shows Saving… rather than Interpreting… while the atomic persist is pending", () => {
    const action = vi.fn(() => new Promise<never>(() => {}));
    render(<QuickCaptureForm action={action} locale="en" captureSource="home" />);

    expect(screen.queryByText("Interpreting…")).not.toBeInTheDocument();
  });
});
