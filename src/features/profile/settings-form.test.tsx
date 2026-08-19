import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsForm, type ProfileFormAction } from "./settings-form";
import { PROFILE_SECTION_FIELDS } from "./settings-sections";

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

/**
 * Slice 2P.5 gave this form a `section`, so each test names the section whose
 * controls it is about. The assertions themselves are unchanged wherever the
 * control did not move — a reorganization that altered what a test checks would
 * be a reorganization that altered what a setting means, which is exactly what
 * `2P-SETTINGS-008` forbids.
 */
describe("SettingsForm — Geral", () => {
  it("shows only common settings backed by active consumers", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "Preferências salvas." })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="pt-BR" section="general" values={values} />);

    expect(screen.getByLabelText("Fuso horário")).toHaveValue("America/Sao_Paulo");
    expect(screen.getByRole("button", { name: "Salvar preferências" })).toHaveAttribute("type", "submit");

    /*
     * `2O-PREF-004` removed two names from this list, and the removal is the
     * point rather than a concession.
     *
     * "Resumo diário" and "Revisão semanal" were here because
     * `daily_review_time`, `weekly_review_time` and `weekly_review_day` had no
     * control. They have one now, under labels that say what they actually do,
     * so asserting their old names are absent would be asserting nothing.
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

  it("keeps every labelled control's name free of the hint that describes it", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "" })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="en" section="general" values={values} />);

    // A hint nested inside a `<label>` becomes part of the control's accessible
    // NAME, not its description — the label's whole subtree is the name. This
    // field must stay findable by its own label alone.
    expect(screen.getByRole("combobox", { name: "Time zone" })).toBeVisible();
  });
});

describe("SettingsForm — Assistente", () => {
  it("renders how the assistant sounds, and nothing from another section", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "ok" })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="pt-BR" section="assistant" values={values} />);

    expect(screen.getByLabelText("Personalidade")).toHaveValue("proactive");
    expect(screen.getByLabelText("Tom")).toHaveValue("direct");
    expect(screen.getByLabelText("Detalhe das respostas")).toHaveValue("short");
    expect(screen.queryByLabelText("Fuso horário")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Período silencioso começa")).not.toBeInTheDocument();
  });

  /**
   * A hint nested inside a `<label>` becomes part of the control's accessible
   * **name**, not its description — the label's whole subtree is the name.
   *
   * Slice H measured which label shapes actually pollute a name (Chromium's AX
   * tree, Playwright and `dom-accessibility-api` agree): a label that wraps its
   * control and nothing else is fine, and a label that wraps its control *plus*
   * other content is not. The assistant-name field UX-06 added did not, so a
   * screen reader announced it as "Nome do assistente Como o assistente se
   * chama nas telas e nas respostas. O produto continua sendo My Brain."
   */
  it("names the assistant-name field after its label, with the hint as a description", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "" })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="pt-BR" section="assistant" values={values} />);

    const field = screen.getByRole("textbox", { name: "Nome do assistente" });
    expect(field).toHaveValue("Brain");

    const describedBy = field.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toContain("Como o assistente se chama");
  });

  /**
   * `2O-PREF-012` — every preference is revisable with the same control that set
   * it, and nothing here is one-way.
   */
  it("lets every preference be set back with the control that set it", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ status: "success" as const, message: "ok" })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="pt-BR" section="assistant" values={values} />);

    const tone = screen.getByLabelText("Tom");
    await user.selectOptions(tone, "professional");
    expect(tone).toHaveValue("professional");
    await user.selectOptions(tone, "direct");
    expect(tone).toHaveValue("direct");

    // No control disables itself after use, which is what a one-way choice
    // looks like in a form.
    for (const control of screen.getAllByRole("combobox")) expect(control).toBeEnabled();
  });
});

describe("SettingsForm — Planejamento", () => {
  /**
   * `2O-PREF-004` and `2O-PREF-005` — the three controls, and what they promise.
   *
   * The values are asserted because a control that renders but ignores the
   * stored value is the shape `2M-AUDIT-005` found: a field that looks like a
   * preference and round-trips a constant.
   */
  it("renders the three review preferences and says they schedule nothing", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "ok" })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="pt-BR" section="planning" values={values} />);

    expect(screen.getByLabelText("Período silencioso começa")).toHaveValue("22:30");
    expect(screen.getByLabelText("Fechamento do dia a partir de")).toHaveValue("22:00");
    expect(screen.getByLabelText("Fechamento da semana a partir de")).toHaveValue("19:00");
    expect(screen.getByLabelText("Dia do fechamento da semana")).toHaveValue("5");

    // `2O-PREF-005`: the section repeats the promise `/app/reviews` makes, so a
    // reader cannot conclude from these fields that something now runs.
    expect(screen.getByText(/Nada é executado por horário configurado/i)).toBeInTheDocument();
  });

  it("offers the same three in English, with the same promise", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "ok" })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="en" section="planning" values={values} />);

    expect(screen.getByLabelText("Offer to close the day from")).toHaveValue("22:00");
    expect(screen.getByLabelText("Day the week closes")).toHaveValue("5");
    expect(screen.getByText(/Nothing runs from a configured schedule/i)).toBeInTheDocument();
  });

  it("keeps the important-reminder override reversible", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ status: "success" as const, message: "ok" })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="pt-BR" section="planning" values={values} />);

    const override = screen.getByRole("checkbox");
    const initial = (override as HTMLInputElement).checked;
    await user.click(override);
    expect((override as HTMLInputElement).checked).toBe(!initial);
    await user.click(override);
    expect((override as HTMLInputElement).checked).toBe(initial);
  });
});

describe("SettingsForm — IA", () => {
  it("keeps real model routing behind an accessible Advanced disclosure", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ status: "success" as const, message: "Preferências salvas." })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="pt-BR" section="ai" values={values} />);

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
    render(<SettingsForm action={action} locale="pt-BR" section="ai" values={values} />);

    const disclosure = screen.getByText("IA avançada").closest("details");
    expect(disclosure, "the advanced section is not a disclosure").not.toBeNull();
    expect(disclosure, "advanced is the default view").not.toHaveAttribute("open");
    // In the DOM while closed: reachable, not conditional.
    expect(screen.getByLabelText("Chat principal")).toBeInTheDocument();

    await user.click(screen.getByText("IA avançada").closest("summary")!);
    expect(disclosure).toHaveAttribute("open");
  });

  it("leaves the non-advanced sections open on arrival, in their own sections", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "ok" })) as ProfileFormAction;
    const { rerender } = render(<SettingsForm action={action} locale="pt-BR" section="general" values={values} />);
    expect(screen.getByLabelText("Fuso horário").closest("details")).toBeNull();

    rerender(<SettingsForm action={action} locale="pt-BR" section="assistant" values={values} />);
    expect(screen.getByLabelText("Tom").closest("details")).toBeNull();

    rerender(<SettingsForm action={action} locale="pt-BR" section="planning" values={values} />);
    expect(screen.getByLabelText("Fechamento do dia a partir de").closest("details")).toBeNull();
  });
});

/**
 * `2P-SETTINGS-004`, at the boundary this component controls.
 *
 * The action's half — writing only the owned columns and reading the rest from
 * the stored row — is proved in `actions.test.ts`. This half is that a section
 * **submits nothing it does not own**, which is what makes the action's filter
 * safe rather than merely careful.
 */
describe("a section submits its own fields, `section`, and `locale` — nothing else", () => {
  for (const section of ["general", "assistant", "planning", "ai"] as const) {
    it(`submits exactly the ${section} fields`, async () => {
      const user = userEvent.setup();
      const action = vi.fn<ProfileFormAction>(async () => ({ status: "success" as const, message: "ok" }));
      render(<SettingsForm action={action} locale="en" section={section} values={values} />);

      await user.click(screen.getByRole("button", { name: "Save preferences" }));
      await waitFor(() => expect(action).toHaveBeenCalled());

      const formData = action.mock.calls[0][1] as FormData;
      const keys = [...formData.keys()].filter((key) => !key.startsWith("$ACTION_")).sort();
      expect(keys).toEqual([...PROFILE_SECTION_FIELDS[section], "locale", "section"].sort());
    });
  }

  it("names the section it owns in the payload", async () => {
    const user = userEvent.setup();
    const action = vi.fn<ProfileFormAction>(async () => ({ status: "success" as const, message: "ok" }));
    render(<SettingsForm action={action} locale="en" section="planning" values={values} />);

    await user.click(screen.getByRole("button", { name: "Save preferences" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect((action.mock.calls[0][1] as FormData).get("section")).toBe("planning");
  });

  /*
   * `2O-PREF-007`, asserted as a submitted-key absence rather than only as a
   * missing label. A hidden input carrying `planningDay` would render no label
   * and pass the checks above, and `profileSchema` is `.strict()` — so it would
   * fail every save with "review the fields" and no clue which one.
   */
  it("submits no retired preference from any section", async () => {
    const user = userEvent.setup();
    for (const section of ["general", "assistant", "planning", "ai"] as const) {
      const action = vi.fn<ProfileFormAction>(async () => ({ status: "success" as const, message: "ok" }));
      const view = render(<SettingsForm action={action} locale="en" section={section} values={values} />);
      await user.click(screen.getByRole("button", { name: "Save preferences" }));
      await waitFor(() => expect(action).toHaveBeenCalled());
      const keys = [...(action.mock.calls[0][1] as FormData).keys()];
      expect(keys, section).not.toContain("planningDay");
      expect(keys, section).not.toContain("planningTime");
      view.unmount();
    }
  });
});

describe("`2P-SETTINGS-007` — a failed save keeps the input and names its section", () => {
  /**
   * The input surviving is a property of the action **returning** rather than
   * redirecting or revalidating: React keeps the form it is holding. Asserted
   * against a value the reader typed, because the fixture's defaults would pass
   * this even if the form had been rebuilt from scratch.
   */
  it("keeps what the reader typed when the save fails, and offers the retry", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({
      status: "error" as const,
      section: "assistant" as const,
      message: "Não foi possível salvar em Assistente.",
    })) as ProfileFormAction;
    render(<SettingsForm action={action} locale="pt-BR" section="assistant" values={values} />);

    const agentName = screen.getByLabelText("Nome do assistente");
    await user.clear(agentName);
    await user.type(agentName, "Aurora");
    await user.selectOptions(screen.getByLabelText("Tom"), "professional");
    await user.click(screen.getByRole("button", { name: "Salvar preferências" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    // It says so, as an alert rather than a status — a failure the reader must
    // notice, not a result they may.
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível salvar em Assistente");
    // The input is still theirs.
    expect(agentName).toHaveValue("Aurora");
    expect(screen.getByLabelText("Tom")).toHaveValue("professional");
    // And the retry is the same control, still enabled.
    expect(screen.getByRole("button", { name: "Salvar preferências" })).toBeEnabled();
  });

  /**
   * A failure belongs to the section that produced it.
   *
   * Without this, a reader who submitted Planejamento, moved to Geral and came
   * back would find a stale failure attached to a section that never failed —
   * and with the state seeded from the server, that is a real sequence.
   */
  it("does not show another section's failure", () => {
    const action = vi.fn(async () => ({ status: "error" as const, message: "x" })) as ProfileFormAction;
    render(
      <SettingsForm
        action={action}
        initialState={{ status: "error", section: "planning", message: "Falhou em Planejamento." }}
        locale="pt-BR"
        section="general"
        values={values}
      />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows its own section's failure", () => {
    const action = vi.fn(async () => ({ status: "error" as const, message: "x" })) as ProfileFormAction;
    render(
      <SettingsForm
        action={action}
        initialState={{ status: "error", section: "planning", message: "Falhou em Planejamento." }}
        locale="pt-BR"
        section="planning"
        values={values}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Falhou em Planejamento.");
  });

  it("announces the localized result returned by the server", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "Preferences saved." })) as ProfileFormAction;
    render(<SettingsForm action={action} initialState={{ status: "success", message: "Preferences saved." }} locale="en" section="general" values={values} />);
    expect(screen.getByRole("status")).toHaveTextContent("Preferences saved.");
  });
});
