import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { getHistoryCopy } from "./copy";
import { parseHistoryFilters } from "./filters";
import { HistoryFilterControls } from "./history-filters";
import type { Locale } from "@/lib/preferences";

afterEach(cleanup);

function renderFilters(
  search: Record<string, string | string[] | undefined> = {},
  locale: Locale = "pt-BR",
) {
  const copy = getHistoryCopy(locale, "Brain");
  return render(
    <HistoryFilterControls copy={copy} filters={parseHistoryFilters(search)} locale={locale} />,
  );
}

describe("HistoryFilterControls", () => {
  it("submits as a GET form to the history route, so filters land in the URL", () => {
    renderFilters();
    const form = document.querySelector("form");
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/pt-BR/app/history");
  });

  it("carries no page field, so applying a filter returns to page 1", () => {
    renderFilters({ page: "4" });
    expect(document.querySelector('[name="page"]')).toBeNull();
  });

  it("gives every control an accessible name", () => {
    renderFilters();
    expect(screen.getByLabelText("De")).toBeInTheDocument();
    expect(screen.getByLabelText("Até")).toBeInTheDocument();
    expect(screen.getByLabelText("Quem")).toBeInTheDocument();
    expect(screen.getByLabelText("Tipo de item")).toBeInTheDocument();
    expect(screen.getByLabelText("Tipo de ação")).toBeInTheDocument();
  });

  it("uses real date inputs rather than free text", () => {
    renderFilters();
    expect(screen.getByLabelText("De")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Até")).toHaveAttribute("type", "date");
  });

  it("offers localized options, never the raw enum values", () => {
    renderFilters();
    const actor = screen.getByLabelText("Quem");
    expect(within(actor).getByRole("option", { name: "Você" })).toBeInTheDocument();
    expect(within(actor).getByRole("option", { name: "O Brain" })).toBeInTheDocument();
    expect(within(actor).getByRole("option", { name: "O sistema" })).toBeInTheDocument();

    const entity = screen.getByLabelText("Tipo de item");
    expect(within(entity).getByRole("option", { name: "tarefa" })).toBeInTheDocument();
    expect(within(entity).getByRole("option", { name: "memória" })).toBeInTheDocument();
    // The values submitted are still the database tokens; only the labels differ.
    expect(within(entity).getByRole("option", { name: "tarefa" })).toHaveValue("task");
  });

  it("reflects the active filters back into the controls", () => {
    renderFilters({ from: "2026-07-01", actor: "agent", entity: "memory", category: "lifecycle" });

    expect(screen.getByLabelText("De")).toHaveValue("2026-07-01");
    expect(screen.getByLabelText("Quem")).toHaveValue("agent");
    expect(screen.getByLabelText("Tipo de item")).toHaveValue("memory");
    expect(screen.getByLabelText("Tipo de ação")).toHaveValue("lifecycle");
  });

  it("summarises the active filters outside the disclosure, so a phone still shows them", () => {
    renderFilters({ actor: "user", entity: "task" });

    const summary = screen.getByRole("list", { name: "Filtros ativos" });
    expect(within(summary).getByText("Quem: Você")).toBeInTheDocument();
    expect(within(summary).getByText("Tipo de item: tarefa")).toBeInTheDocument();
    // Outside `<details>`, so folding the controls away does not hide it.
    expect(summary.closest("details")).toBeNull();
  });

  it("shows a clear control only when something is filtered", () => {
    renderFilters();
    expect(screen.queryByRole("link", { name: "Limpar filtros" })).toBeNull();

    cleanup();
    renderFilters({ actor: "user" });
    expect(screen.getByRole("link", { name: "Limpar filtros" })).toHaveAttribute(
      "href",
      "/pt-BR/app/history",
    );
  });

  it("opens the disclosure when filters are active and folds it when they are not", () => {
    renderFilters();
    expect(document.querySelector("details")).not.toHaveAttribute("open");

    cleanup();
    renderFilters({ actor: "user" });
    expect(document.querySelector("details")).toHaveAttribute("open");
  });

  it("preserves a specific-subject filter through a submit without exposing the uuid", () => {
    renderFilters({ subject: "11111111-2222-3333-4444-555555555555" });

    expect(document.querySelector('input[name="subject"]')).toHaveAttribute("type", "hidden");
    // A uuid means nothing to a reader; the summary says what it is instead.
    expect(screen.getByText("Um item específico")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("11111111-2222");
  });

  it("says so when the address contained filters it could not use", () => {
    renderFilters({ actor: "root", entity: "widget" });
    expect(
      screen.getByText("Alguns filtros do endereço não foram reconhecidos e foram ignorados."),
    ).toBeInTheDocument();
  });

  it("stays silent when every filter was understood", () => {
    renderFilters({ actor: "user" });
    expect(screen.queryByText(/não foram reconhecidos/)).toBeNull();
  });

  it("renders in English without leaking Portuguese", () => {
    renderFilters({ actor: "user" }, "en");

    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("Who")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filters" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Você|Filtros|Limpar|tarefa/);
  });
});
