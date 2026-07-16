import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuickCaptureForm, type CaptureAction } from "./quick-capture-form";

describe("QuickCaptureForm", () => {
  it("submits a web entry through the provided action", () => {
    const action = vi.fn(async () => ({ status: "idle" as const, message: "" })) as CaptureAction;
    render(<QuickCaptureForm action={action} locale="pt-BR" />);

    expect(screen.getByRole("textbox", { name: "Nova entrada" })).toHaveAttribute("name", "content");
    expect(screen.getByRole("button", { name: "Registrar" })).toHaveAttribute("type", "submit");
  });

  it("shows a processing failure without losing the form", () => {
    const action = vi.fn(async () => ({ status: "error" as const, message: "Não foi possível interpretar agora." })) as CaptureAction;
    render(
      <QuickCaptureForm
        action={action}
        initialState={{ status: "error", message: "Não foi possível interpretar agora." }}
        locale="pt-BR"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível interpretar agora.");
  });
});
