import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppShell } from "./app-shell";

afterEach(cleanup);

describe("AppShell", () => {
  it("exposes primary navigation and quick capture accessibly", () => {
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);

    expect(screen.getByRole("navigation", { name: "Navegação principal" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /captura rápida/i }).length).toBeGreaterThan(0);
    expect(screen.getByText("Conteúdo")).toBeInTheDocument();
  });

  it("keeps every application destination reachable from mobile navigation", () => {
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);
    const mobileNavigation = screen.getByRole("navigation", { name: "Navegação móvel" });
    const hrefs = within(mobileNavigation)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));

    expect(within(mobileNavigation).getByText("Mais")).toBeInTheDocument();
    expect(hrefs).toEqual(expect.arrayContaining([
      "/pt-BR/app",
      "/pt-BR/app/today",
      "/pt-BR/app/inbox",
      "/pt-BR/app/tasks",
      "/pt-BR/app/waiting",
      "/pt-BR/app/projects",
      "/pt-BR/app/people",
      "/pt-BR/app/reminders",
      "/pt-BR/app/questions",
      "/pt-BR/app/chat",
      "/pt-BR/app/memories",
      "/pt-BR/app/reviews",
      "/pt-BR/app/files",
      "/pt-BR/app/history",
      "/pt-BR/app/costs",
      "/pt-BR/app/notifications",
      "/pt-BR/app/settings",
      "/pt-BR/app/capture",
    ]));
  });
});
