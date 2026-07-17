import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsForm, type ProfileFormAction } from "./settings-form";

const values = {
  displayName: "Fábio", agentName: "Brain", locale: "pt-BR" as const, timezone: "America/Sao_Paulo",
  followUpIntensity: "balanced" as const, dailyReviewTime: "22:00",
  aiProfile: "quality" as const, chatModel: "gpt-5.6-terra" as const,
  extractionModel: "gpt-5.6-luna" as const, reasoningModel: "gpt-5.6-terra" as const,
  reviewModel: "gpt-5.6-terra" as const, fileModel: "gpt-5.6-luna" as const,
  backgroundModel: "gpt-5-mini" as const, embeddingModel: "text-embedding-3-small" as const,
};

afterEach(cleanup);

describe("SettingsForm", () => {
  it("renders a working submit control and friendly time preferences", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "Preferências salvas." })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="pt-BR" values={values} />);
    expect(screen.getByRole("button", { name: "Salvar preferências" })).toHaveAttribute("type", "submit");
    expect(screen.getByLabelText("Fuso horário")).toHaveValue("America/Sao_Paulo");
    expect(screen.getByRole("option", { name: "Horário de Brasília · São Paulo e Rio (UTC−03:00)" })).toBeInTheDocument();
    expect(screen.getByLabelText("Período silencioso começa")).toHaveValue("22:30");
  });

  it("announces a confirmed save returned by the server", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "Preferências salvas." })) as ProfileFormAction;
    render(<SettingsForm action={action} initialState={{ status: "success", message: "Preferências salvas." }} locale="pt-BR" values={values} />);
    expect(screen.getByRole("status")).toHaveTextContent("Preferências salvas.");
  });

  it("shows maximum quality routes and applies the economy preset", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ status: "success" as const, message: "Preferências salvas." })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="pt-BR" values={values} />);

    expect(screen.getByRole("radio", { name: /Qualidade máxima/ })).toBeChecked();
    expect(screen.getByLabelText("Chat principal")).toHaveValue("gpt-5.6-terra");
    expect(screen.getByLabelText("Captura e organização")).toHaveValue("gpt-5.6-luna");

    await user.click(screen.getByRole("radio", { name: /Econômico/ }));

    expect(screen.getByLabelText("Chat principal")).toHaveValue("gpt-5-mini");
    expect(screen.getByLabelText("Revisões e resumos")).toHaveValue("gpt-5-mini");
  });

  it("switches to custom when one route changes", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ status: "success" as const, message: "Preferências salvas." })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="pt-BR" values={values} />);

    await user.selectOptions(screen.getByLabelText("Análise de arquivos"), "gpt-5.6-terra");

    expect(screen.getByRole("radio", { name: /Personalizado/ })).toBeChecked();
  });
});
