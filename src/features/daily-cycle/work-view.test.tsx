import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkItemView } from "./contracts";

vi.mock("server-only", () => ({}));
const workViewViewed = vi.hoisted(() => vi.fn(() => null));
vi.mock("@/features/product-analytics/interaction-events", () => ({
  WorkViewViewed: workViewViewed,
}));

type WorkViewModule = {
  WorkView?: (props: {
    locale: "pt-BR" | "en";
    timezone: string;
    view: "today" | "all" | "waiting";
    page: number;
    items: readonly WorkItemView[];
    hasNext: boolean;
  }) => React.ReactNode;
};

const modulePath = `./${"work-view"}.tsx`;
const workViewModule = await vi.importActual<WorkViewModule>(modulePath).catch(() => ({})) as WorkViewModule;

afterEach(cleanup);

function renderWork(overrides: Partial<Parameters<NonNullable<WorkViewModule["WorkView"]>>[0]> = {}) {
  expect(workViewModule.WorkView).toBeTypeOf("function");
  const WorkView = workViewModule.WorkView!;
  return render(<WorkView
    locale="en"
    timezone="America/Sao_Paulo"
    view="all"
    page={1}
    items={[]}
    hasNext={false}
    {...overrides}
  />);
}

describe("WorkView", () => {
  it("records the visible work view with its canonical filter", () => {
    renderWork({ locale: "en", view: "waiting" });

    expect(workViewViewed).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "en", view: "waiting" }),
      undefined,
    );
  });

  it("localizes the accessible view control and marks the active view", () => {
    renderWork({ locale: "pt-BR", view: "today" });

    const navigation = screen.getByRole("navigation", { name: "Visões de Trabalho" });
    expect(within(navigation).getByRole("link", { name: "Hoje" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("link", { name: "Todas" })).not.toHaveAttribute("aria-current");
    expect(within(navigation).getByRole("link", { name: "Aguardando" })).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Prazos de hoje e atrasos que ainda estão abertos.")).toBeVisible();
  });

  it("preserves manual task creation on the canonical surface", () => {
    renderWork({ locale: "en", view: "all" });

    expect(screen.getByLabelText("New task")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add new task" })).toBeVisible();
  });

  it("renders localized human state, origin, due date, and existing mutation actions without raw enums", () => {
    renderWork({
      locale: "en",
      timezone: "America/New_York",
      items: [{
        taskId: "task-1",
        title: "Send proposal",
        dueAt: "2026-07-19T01:00:00.000Z",
        humanState: "waiting_on_someone",
        origin: "brain",
        availableActions: [{ id: "complete_task" }, { id: "resume_task" }],
      }],
    });

    expect(screen.getByText("Waiting on someone")).toBeVisible();
    expect(screen.getByText("Suggested by Brain")).toBeVisible();
    expect(screen.getByText("7/18/26, 9:00 PM")).toBeVisible();
    expect(screen.queryByText("waiting_on_someone")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Resume" })).toBeVisible();
    expect((document.querySelector('input[name="operationKey"]') as HTMLInputElement).value).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("explains the intentionally limited Waiting view without presenting a fake follow-up control", () => {
    renderWork({ locale: "en", view: "waiting" });

    expect(screen.getByText("Person context and complete follow-up will arrive in a later phase.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /follow-up/i })).not.toBeInTheDocument();
  });

  it("preserves the active view in page-based pagination URLs", () => {
    renderWork({ locale: "en", view: "waiting", page: 2, hasNext: true });

    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/en/app/work?view=waiting&page=1",
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/en/app/work?view=waiting&page=3",
    );
  });
});
