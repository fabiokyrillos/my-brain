import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsForm, type ProfileFormAction } from "./settings-form";

const values = {
  timezone: "America/Sao_Paulo",
  agentName: "Brain",
  personality: "proactive" as const,
  tone: "direct" as const,
  quietStart: "22:30",
  quietEnd: "07:00",
  importantReminderOverride: true,
  maxFollowupsPerDay: 3,
  responseDetail: "short" as const,
  dailyReviewTime: "22:00",
  weeklyReviewTime: "19:00",
  weeklyReviewDay: 5,
  aiProfile: "quality" as const,
  chatModel: "gpt-5.6-terra" as const,
  extractionModel: "gpt-5.6-luna" as const,
  reviewModel: "gpt-5.6-terra" as const,
  fileModel: "gpt-5.6-luna" as const,
};

afterEach(cleanup);

describe("SettingsForm", () => {
  it("shows only common settings backed by active consumers", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "Preferências salvas." })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="pt-BR" values={values} />);

    expect(screen.getByLabelText("Fuso horário")).toHaveValue("America/Sao_Paulo");
    expect(screen.getByLabelText("Personalidade")).toHaveValue("proactive");
    expect(screen.getByLabelText("Tom")).toHaveValue("direct");
    expect(screen.getByLabelText("Detalhe das respostas")).toHaveValue("short");
    expect(screen.getByLabelText("Período silencioso começa")).toHaveValue("22:30");
    expect(screen.getByRole("button", { name: "Salvar preferências" })).toHaveAttribute("type", "submit");

    /*
     * `2O-PREF-004` removed two names from this list, and the removal is the
     * point rather than a concession.
     *
     * "Resumo diário" and "Revisão semanal" were here because
     * `daily_review_time`, `weekly_review_time` and `weekly_review_day` had no
     * control. They have one now, under labels that say what they actually do
     * (see below), so asserting their old names are absent would be asserting
     * nothing — the strings were never rendered under those words either.
     *
     * Everything else stays, and `2O-PREF-007` is why "Planejamento semanal"
     * is still here: `2M-AUDIT-005` retired `planning_day` and `planning_time`,
     * and this phase does not reverse a signed outcome.
     */
    for (const hiddenControl of [
      "Seu nome",
      "Nome do agente",
      "Idioma",
      "Nível de autonomia",
      "Intensidade das cobranças",
      "Planejamento semanal",
      "Privacidade padrão",
      "Raciocínio avançado",
      "Rotinas internas",
    ]) {
      expect(screen.queryByLabelText(hiddenControl)).not.toBeInTheDocument();
    }
  });

  /**
   * `2O-PREF-004` and `2O-PREF-005` — the three controls, and what they promise.
   *
   * The values are asserted because a control that renders but ignores the
   * stored value is the shape `2M-AUDIT-005` found: a field that looks like a
   * preference and round-trips a constant.
   */
  it("renders the three review preferences and says they schedule nothing", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "ok" })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="pt-BR" values={values} />);

    expect(screen.getByLabelText("Fechamento do dia a partir de")).toHaveValue("22:00");
    expect(screen.getByLabelText("Fechamento da semana a partir de")).toHaveValue("19:00");
    expect(screen.getByLabelText("Dia do fechamento da semana")).toHaveValue("5");

    // `2O-PREF-005`: the section repeats the promise `/app/reviews` makes, so a
    // reader cannot conclude from these fields that something now runs.
    expect(screen.getByText(/Nada é executado por horário configurado/i)).toBeInTheDocument();
    for (const control of ["Fechamento do dia a partir de", "Dia do fechamento da semana", "Fechamento da semana a partir de"]) {
      expect(screen.getByLabelText(control)).toBeInTheDocument();
    }
  });

  it("offers the same three in English, with the same promise", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "ok" })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="en" values={values} />);

    expect(screen.getByLabelText("Offer to close the day from")).toHaveValue("22:00");
    expect(screen.getByLabelText("Day the week closes")).toHaveValue("5");
    expect(screen.getByText(/Nothing runs from a configured schedule/i)).toBeInTheDocument();
  });

  it("keeps real model routing behind an accessible Advanced disclosure", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ status: "success" as const, message: "Preferências salvas." })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="pt-BR" values={values} />);

    const summary = screen.getByText("IA avançada").closest("summary");
    const disclosure = summary?.closest("details");
    expect(summary).not.toBeNull();
    expect(disclosure).not.toHaveAttribute("open");
    expect(screen.getByRole("link", { name: "Ver custos de IA" })).toHaveAttribute("href", "/pt-BR/app/costs");

    await user.click(summary!);
    expect(disclosure).toHaveAttribute("open");
    expect(screen.getByRole("radio", { name: /Qualidade máxima.*Recomendado/ })).toBeChecked();
    expect(screen.getByLabelText("Chat principal")).toHaveValue("gpt-5.6-terra");

    await user.click(screen.getByRole("radio", { name: /Econômico/ }));
    expect(screen.getByLabelText("Chat principal")).toHaveValue("gpt-5-mini");
    expect(screen.getByLabelText("Revisões e resumos")).toHaveValue("gpt-5-mini");
  });

  it("submits no future or hidden preference field", async () => {
    const user = userEvent.setup();
    const action = vi.fn<ProfileFormAction>(async () => ({ status: "success" as const, message: "Preferências salvas." }));
    render(<SettingsForm action={action} locale="en" values={values} />);

    await user.click(screen.getByRole("button", { name: "Save preferences" }));
    await waitFor(() => expect(action).toHaveBeenCalled());

    const formData = action.mock.calls[0][1] as FormData;
    expect([...formData.keys()].sort()).toEqual([
      "agentName",
      "aiProfile",
      "chatModel",
      "dailyReviewTime",
      "extractionModel",
      "fileModel",
      "importantReminderOverride",
      "locale",
      "maxFollowupsPerDay",
      "personality",
      "quietEnd",
      "quietStart",
      "responseDetail",
      "reviewModel",
      "timezone",
      "tone",
      "weeklyReviewDay",
      "weeklyReviewTime",
    ]);
    /*
     * `2O-PREF-007`, asserted as a submitted-key absence rather than only as a
     * missing label. A hidden input carrying `planningDay` would render no label
     * and pass the check above, and `profileSchema` is `.strict()` — so it would
     * fail every save with "review the fields" and no clue which one.
     */
    expect([...formData.keys()]).not.toContain("planningDay");
    expect([...formData.keys()]).not.toContain("planningTime");
  });

  /**
   * `2O-PREF-009` — advanced preferences are **disclosed**, not hidden.
   *
   * The distinction the requirement draws: a reader can reach every one of them,
   * and none is the default view. A `<details>` with no `open` satisfies both —
   * closed on arrival, one activation away, and present in the DOM the whole
   * time, so find-in-page and a screen reader's element list both reach it.
   * Rendering it conditionally would have been hiding.
   */
  it("discloses the advanced preferences without hiding them", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ status: "success" as const, message: "ok" })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="pt-BR" values={values} />);

    const disclosure = screen.getByText("IA avançada").closest("details");
    expect(disclosure, "the advanced section is not a disclosure").not.toBeNull();
    expect(disclosure, "advanced is the default view").not.toHaveAttribute("open");
    // In the DOM while closed: reachable, not conditional.
    expect(screen.getByLabelText("Chat principal")).toBeInTheDocument();

    await user.click(screen.getByText("IA avançada").closest("summary")!);
    expect(disclosure).toHaveAttribute("open");

    // And everything that is *not* advanced is open on arrival, so the disclosure
    // is a ceiling on complexity rather than a place preferences go to hide.
    for (const control of ["Fuso horário", "Tom", "Fechamento do dia a partir de"]) {
      expect(screen.getByLabelText(control).closest("details"), control).toBeNull();
    }
  });

  /**
   * `2O-PREF-011` — a failed save says so, keeps the input, and offers a retry.
   *
   * The input surviving is a property of the action **returning** rather than
   * redirecting or revalidating: React keeps the form it is holding. Asserted
   * against a value the reader typed, because the fixture's defaults would pass
   * this even if the form had been rebuilt from scratch.
   */
  it("keeps what the reader typed when the save fails, and offers the retry", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({
      status: "error" as const,
      message: "Não foi possível salvar. Tente novamente.",
    })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="pt-BR" values={values} />);

    const agentName = screen.getByLabelText("Nome do assistente");
    await user.clear(agentName);
    await user.type(agentName, "Aurora");
    await user.selectOptions(screen.getByLabelText("Tom"), "professional");
    await user.click(screen.getByRole("button", { name: "Salvar preferências" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    // It says so, as an alert rather than a status — a failure the reader must
    // notice, not a result they may.
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível salvar");
    // The input is still theirs.
    expect(agentName).toHaveValue("Aurora");
    expect(screen.getByLabelText("Tom")).toHaveValue("professional");
    // And the retry is the same control, still enabled.
    expect(screen.getByRole("button", { name: "Salvar preferências" })).toBeEnabled();
  });

  /**
   * `2O-PREF-012` — every preference is revisable with the same control that set
   * it, and nothing here is one-way.
   */
  it("lets every preference be set back with the control that set it", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ status: "success" as const, message: "ok" })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="pt-BR" values={values} />);

    const tone = screen.getByLabelText("Tom");
    await user.selectOptions(tone, "professional");
    expect(tone).toHaveValue("professional");
    await user.selectOptions(tone, "direct");
    expect(tone).toHaveValue("direct");

    const override = screen.getByRole("checkbox");
    const initial = (override as HTMLInputElement).checked;
    await user.click(override);
    expect((override as HTMLInputElement).checked).toBe(!initial);
    await user.click(override);
    expect((override as HTMLInputElement).checked).toBe(initial);

    // No control disables itself after use, which is what a one-way choice
    // looks like in a form.
    for (const control of screen.getAllByRole("combobox")) expect(control).toBeEnabled();
  });

  it("announces the localized result returned by the server", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "Preferences saved." })) as ProfileFormAction;
    render(<SettingsForm action={action} initialState={{ status: "success", message: "Preferences saved." }} locale="en" values={values} />);
    expect(screen.getByRole("status")).toHaveTextContent("Preferences saved.");
  });

  /**
   * A hint nested inside a `<label>` becomes part of the control's accessible
   * **name**, not its description — the label's whole subtree is the name.
   *
   * Slice H measured which label shapes actually pollute a name (Chromium's AX
   * tree, Playwright and `dom-accessibility-api` agree): a label that wraps its
   * control and nothing else is fine, and a label that wraps its control *plus*
   * other content is not. This form already knew that in two places —
   * `ai-route` and `timezone` both carry an explicit `aria-label` for exactly
   * this reason — but the assistant-name field UX-06 added did not, so a screen
   * reader announced it as "Nome do assistente Como o assistente se chama nas
   * telas e nas respostas. O produto continua sendo My Brain."
   *
   * `aria-describedby` is what a hint is for, and it is what the field now uses.
   */
  it("names the assistant-name field after its label, with the hint as a description", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "" })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="pt-BR" values={values} />);

    const field = screen.getByRole("textbox", { name: "Nome do assistente" });
    expect(field).toHaveValue("Brain");

    const describedBy = field.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toContain("Como o assistente se chama");
  });

  it("keeps every labelled control's name free of the hint that describes it", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "" })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="en" values={values} />);

    // The three fields whose labels carry a `<small>` hint. Each must be
    // findable by its own label alone, which fails the moment the hint joins it.
    expect(screen.getByRole("combobox", { name: "Time zone" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Assistant name" })).toBeVisible();
  });
});
