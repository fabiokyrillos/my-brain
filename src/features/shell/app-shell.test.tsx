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

  it("shows only the primary destinations and capture in the desktop rail", () => {
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);
    const desktopNavigation = screen.getByRole("navigation", { name: "Navegação principal" });

    // Everything the rail offers without the user opening anything. The rail used
    // to render all five secondary groups inline, which is what put fourteen
    // product concepts in front of someone who had not yet captured anything
    // (UX-01) and pushed "Configurações" below the fold at 1440x900 (UX-17).
    const alwaysVisible = Array.from(
      desktopNavigation.querySelectorAll(":scope > .nav-group-primary a, :scope > .capture-fab"),
    ).map((link) => link.textContent);

    expect(alwaysVisible).toEqual(["Início", "Caixa", "Trabalho", "Brain", "Captura rápida"]);
    expect(
      Array.from(desktopNavigation.querySelectorAll(":scope > details > summary")).map(
        (summary) => summary.textContent,
      ),
    ).toEqual(["Mais"]);
  });

  it("keeps every secondary destination reachable from the desktop More disclosure", () => {
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);
    const desktopNavigation = screen.getByRole("navigation", { name: "Navegação principal" });
    const more = desktopNavigation.querySelector(":scope > details")!;

    expect(
      Array.from(more.querySelectorAll("a")).map((link) => link.getAttribute("href")),
    ).toEqual([
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
    ]);
    for (const group of ["Contexto", "Reflexão", "Organização", "Transparência", "Preferências"]) {
      expect(within(more as HTMLElement).getByRole("group", { name: group })).toBeInTheDocument();
    }
  });

  it("closes an open More disclosure when the pointer goes down outside it", () => {
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);

    for (const navigationName of ["Navegação principal", "Navegação móvel"]) {
      const navigation = screen.getByRole("navigation", { name: navigationName });
      const details = navigation.querySelector(":scope > details") as HTMLDetailsElement;
      details.open = true;

      // A tap on the page behind the overlay. Without this the only ways out were
      // Escape and following a link, so on a phone the panel could not be
      // dismissed by tapping away from it (UX-23).
      fireEvent.pointerDown(document.body);

      expect(details.open, `${navigationName} stayed open`).toBe(false);
    }
  });

  it("keeps a More disclosure open while the pointer goes down inside it", () => {
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);
    const navigation = screen.getByRole("navigation", { name: "Navegação móvel" });
    const details = navigation.querySelector(":scope > details") as HTMLDetailsElement;
    details.open = true;

    fireEvent.pointerDown(within(details).getByRole("link", { name: "Projetos" }));

    expect(details.open).toBe(true);
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

  /**
   * Slice D3 — UX-26. Before it, none of the sixteen authenticated routes had a
   * sign-out action or an account surface: the only way to leave was to clear
   * cookies by hand.
   */
  describe("the account and session surface", () => {
    const identity = { displayName: "Marina Duarte" };

    it("is reachable on both surfaces, from one component", () => {
      render(<AppShell identity={identity} locale="pt-BR"><div>Conteúdo</div></AppShell>);

      // Two mounts, so a phone user and a desktop user have the same way out —
      // and both are the same component, so neither can end a session the other
      // does not.
      const controls = screen.getAllByRole("button", { name: "Sair da conta" });
      expect(controls).toHaveLength(2);
      expect(document.querySelectorAll(".account-menu-rail")).toHaveLength(1);
      expect(document.querySelectorAll(".account-menu-overflow")).toHaveLength(1);
    });

    it("sits in the rail foot on desktop, not among the navigation destinations", () => {
      render(<AppShell identity={identity} locale="pt-BR"><div>Conteúdo</div></AppShell>);

      const railAccount = document.querySelector(".side-rail > .rail-footer > .account-menu-rail");
      expect(railAccount).toBeTruthy();
      // 2F-era rule for this initiative: no new permanent primary destination.
      const navigation = screen.getByRole("navigation", { name: "Navegação principal" });
      expect(navigation.contains(railAccount)).toBe(false);
      expect(within(navigation).queryByRole("button", { name: "Sair da conta" })).toBeNull();
    });

    it("is the first thing in the mobile overflow panel, before the secondary destinations", () => {
      render(<AppShell identity={identity} locale="pt-BR"><div>Conteúdo</div></AppShell>);
      const mobile = screen.getByRole("navigation", { name: "Navegação móvel" });
      const panel = mobile.querySelector(":scope > details > .mobile-more-menu")!;

      // Placement is the requirement: reachable without scrolling past product
      // destinations, on a panel that scrolls at 65vh.
      expect(panel.firstElementChild).toHaveClass("mobile-nav-account");
    });

    it("adds no navigation destination, and reaches Settings as the route it already is", () => {
      render(<AppShell identity={identity} locale="pt-BR"><div>Conteúdo</div></AppShell>);

      const settings = screen.getAllByRole("link", { name: "Configurações" });
      // Two from the account panels plus the two existing More disclosures.
      expect(settings.length).toBeGreaterThanOrEqual(2);
      for (const link of settings) expect(link).toHaveAttribute("href", "/pt-BR/app/settings");
    });

    it("names the active account on both surfaces", () => {
      render(<AppShell identity={identity} locale="pt-BR"><div>Conteúdo</div></AppShell>);
      expect(screen.getAllByText("Marina Duarte")).toHaveLength(2);
      expect(screen.getAllByLabelText("Sua conta: Marina Duarte")).toHaveLength(2);
    });

    it("still renders the way out when there is no identity to name", () => {
      render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);
      expect(screen.getAllByRole("button", { name: "Sair da conta" })).toHaveLength(2);
      expect(screen.getAllByText("Sua conta")).toHaveLength(2);
    });

    it("closes one nested layer per Escape, keeping focus on a control that is still there", () => {
      // The mobile account block lives inside the overflow panel. Before
      // `stopPropagation`, one Escape closed both — so the summary the inner
      // handler had just focused was hidden by the time the press finished, and
      // focus was lost. Caught by the live Pixel 7 run, pinned here.
      render(<AppShell identity={identity} locale="pt-BR"><div>Conteúdo</div></AppShell>);
      const mobile = screen.getByRole("navigation", { name: "Navegação móvel" });
      const overflow = mobile.querySelector(":scope > details") as HTMLDetailsElement;
      const account = mobile.querySelector(".account-menu") as HTMLDetailsElement;

      overflow.open = true;
      account.open = true;
      fireEvent.keyDown(account, { key: "Escape" });

      expect(account.open).toBe(false);
      expect(overflow.open, "one Escape must not collapse the layer above it").toBe(true);
      expect(document.activeElement).toBe(account.querySelector("summary"));

      // A second Escape then closes the layer above.
      fireEvent.keyDown(overflow, { key: "Escape" });
      expect(overflow.open).toBe(false);
    });

    it("localizes both mounts in English", () => {
      render(<AppShell identity={identity} locale="en"><div>Content</div></AppShell>);
      expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(2);
      expect(screen.getAllByText("Signed in as")).toHaveLength(2);
    });
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
