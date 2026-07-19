import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppShell } from "./app-shell";

afterEach(cleanup);

describe("AppShell", () => {
  it("exposes the converged primary hierarchy and global actions in Portuguese", () => {
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);

    const desktopNavigation = screen.getByRole("navigation", { name: "Navegação principal" });
    const primary = within(desktopNavigation).getByRole("group", { name: "Principal" });

    expect(within(primary).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Início",
      "Caixa",
      "Trabalho",
      "Brain",
    ]);
    expect(screen.getAllByRole("link", { name: "Captura rápida" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Notificações" })).toHaveAttribute(
      "href",
      "/pt-BR/app/notifications",
    );
    expect(screen.queryByText("Brain atento")).not.toBeInTheDocument();
    expect(screen.queryByText("Brain ativo")).not.toBeInTheDocument();
    expect(screen.getByText("Conteúdo")).toBeInTheDocument();
  });

  it("keeps secondary destinations grouped and reachable from mobile More", () => {
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);
    const mobileNavigation = screen.getByRole("navigation", { name: "Navegação móvel" });
    const hrefs = within(mobileNavigation)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));

    expect(within(mobileNavigation).getByText("Mais")).toBeInTheDocument();
    expect(hrefs).toEqual(expect.arrayContaining([
      "/pt-BR/app",
      "/pt-BR/app/inbox",
      "/pt-BR/app/work",
      "/pt-BR/app/chat",
      "/pt-BR/app/projects",
      "/pt-BR/app/people",
      "/pt-BR/app/memories",
      "/pt-BR/app/files",
      "/pt-BR/app/reviews",
      "/pt-BR/app/questions",
      "/pt-BR/app/reminders",
      "/pt-BR/app/history",
      "/pt-BR/app/costs",
      "/pt-BR/app/settings",
      "/pt-BR/app/capture",
    ]));
    expect(hrefs).not.toContain("/pt-BR/app/jobs");
    expect(hrefs).not.toContain("/pt-BR/app/notifications");
    for (const group of ["Contexto", "Reflexão", "Organização", "Transparência", "Preferências"]) {
      expect(within(mobileNavigation).getByRole("group", { name: group })).toBeInTheDocument();
    }
  });

  it("closes mobile More with Escape and restores focus to its summary", () => {
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);
    const mobileNavigation = screen.getByRole("navigation", { name: "Navegação móvel" });
    const summary = within(mobileNavigation).getByText("Mais").closest("summary");
    const details = summary?.closest("details");

    expect(summary).not.toBeNull();
    expect(details).not.toBeNull();
    details?.setAttribute("open", "");
    fireEvent.keyDown(details!, { key: "Escape" });

    expect(details).not.toHaveAttribute("open");
    expect(summary).toHaveFocus();
  });

  it("keeps mobile DOM order aligned with the visual tab order", () => {
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);
    const mobileNavigation = screen.getByRole("navigation", { name: "Navegação móvel" });
    const topLevelControls = Array.from(
      mobileNavigation.querySelectorAll(":scope > a, :scope > details > summary"),
    ).map((control) => control.textContent);

    expect(topLevelControls).toEqual([
      "Início",
      "Caixa",
      "Captura rápida",
      "Trabalho",
      "Brain",
      "Mais",
    ]);
  });

  it("localizes the hierarchy and preserves English destinations", () => {
    render(<AppShell locale="en"><div>Content</div></AppShell>);
    const desktopNavigation = screen.getByRole("navigation", { name: "Main navigation" });
    const primary = within(desktopNavigation).getByRole("group", { name: "Primary" });

    expect(within(primary).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Home",
      "Inbox",
      "Work",
      "Brain",
    ]);
    expect(within(desktopNavigation).getByRole("link", { name: "Work" })).toHaveAttribute(
      "href",
      "/en/app/work",
    );
  });
});
