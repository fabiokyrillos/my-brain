import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsForm, type ProfileFormAction } from "./settings-form";

const values = {
  displayName: "Fábio",
  agentName: "Brain",
  locale: "pt-BR" as const,
  timezone: "America/Sao_Paulo",
  followUpIntensity: "balanced" as const,
  dailyReviewTime: "22:00",
};

describe("SettingsForm", () => {
  it("renders an explicit submit control and a friendly timezone selector", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "Preferências salvas." })) as ProfileFormAction;

    render(<SettingsForm action={action} locale="pt-BR" values={values} />);

    expect(screen.getByRole("button", { name: "Salvar preferências" })).toHaveAttribute("type", "submit");
    expect(screen.getByLabelText("Fuso horário")).toHaveValue("America/Sao_Paulo");
    expect(screen.getByRole("option", { name: "Horário de Brasília · São Paulo e Rio (UTC−03:00)" })).toBeInTheDocument();
  });

  it("announces a confirmed save returned by the server", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "Preferências salvas." })) as ProfileFormAction;

    render(
      <SettingsForm
        action={action}
        initialState={{ status: "success", message: "Preferências salvas." }}
        locale="pt-BR"
        values={values}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Preferências salvas.");
  });
});
