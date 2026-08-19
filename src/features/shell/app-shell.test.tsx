import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePathname } from "next/navigation";
import { AppShell } from "./app-shell";
import { mobileBarCentreIndex, mobileBarSlots, mobileDemotedKeys } from "./capabilities";

/**
 * The route is mocked rather than left to fall through.
 *
 * `NavigationLinks` reads `usePathname()` and falls back to `/{locale}/app` when
 * it is absent, which is why these tests passed without a router before. The
 * active-state assertions need to *choose* a route — and one of them is the whole
 * point of demoting Registros: a phone user standing in it must still see the
 * disclosure that now contains it marked active.
 */
// The shell reaches the auth actions, which now reach the throttle and through
// it the BYOK crypto core's `server-only` marker. Under jsdom that module
// resolves to its client build and throws on import. The marker is a BUILD-time
// guard and `npm run build` in CI is what enforces it; stubbing it here removes
// nothing real. The idiom `ip.test.ts` established.
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/pt-BR/app"),
  useSearchParams: () => new URLSearchParams(),
  // Added when the shell began rendering the command palette (2I.4). The
  // palette's only effect is `router.push`, so a shell test that could not
  // construct it would be unable to assert the top bar at all.
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.mocked(usePathname).mockReturnValue("/pt-BR/app");
});

describe("AppShell", () => {
  it("exposes the converged primary hierarchy and global actions in Portuguese", () => {
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);

    const desktopNavigation = screen.getByRole("navigation", { name: "Navegação principal" });
    const primary = within(desktopNavigation).getByRole("group", { name: "Principal" });

    expect(within(primary).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Hoje",
      "Registros",
      "Trabalho",
      // The fourth destination named by `02-arquitetura-e-rotas.md`. Conversar
      // moves inside it as the Conversas lens; the route is untouched.
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

    expect(alwaysVisible).toEqual(["Hoje", "Registros", "Trabalho", "Brain", "Captura rápida"]);
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
      /*
        Conversar leads the context group since the redesign. It is a lens of
        Brain rather than a rail destination (`02-arquitetura-e-rotas.md`), and
        the route is unchanged — what moved is where it is listed.
      */
      "/pt-BR/app/chat",
      "/pt-BR/app/projects",
      "/pt-BR/app/people",
      "/pt-BR/app/organizations",
      "/pt-BR/app/contexts",
      "/pt-BR/app/memories",
      "/pt-BR/app/files",
      // 2N.6, last in the context group: it is the surface about how the six
      // above connect, so it reads after them rather than among them.
      "/pt-BR/app/relations",
      "/pt-BR/app/reviews",
      "/pt-BR/app/questions",
      // `2M-CAL-001`. In the organization group, ahead of reminders: a calendar
      // is the surface a reminder appears on.
      "/pt-BR/app/calendar",
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

    /*
      The desktop rail, and the header account — the two disclosures that exist
      after slice 2P.5. The mobile bar's `Mais` retired with the slot it
      occupied, so this is asserted where the disclosures actually live rather
      than dropped for having lost one of its two subjects.
    */
    const rail = screen
      .getByRole("navigation", { name: "Navegação principal" })
      .querySelector(":scope > details") as HTMLDetailsElement;
    const account = document.querySelector(".account-menu-header") as HTMLDetailsElement;

    for (const [name, details] of [["rail", rail], ["header account", account]] as const) {
      details.open = true;

      // A tap on the page behind the overlay. Without this the only ways out were
      // Escape and following a link, so on a phone the panel could not be
      // dismissed by tapping away from it (UX-23).
      fireEvent.pointerDown(document.body);

      expect(details.open, `the ${name} disclosure stayed open`).toBe(false);
    }
  });

  it("keeps a More disclosure open while the pointer goes down inside it", () => {
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);
    const navigation = screen.getByRole("navigation", { name: "Navegação principal" });
    const details = navigation.querySelector(":scope > details") as HTMLDetailsElement;
    details.open = true;

    fireEvent.pointerDown(within(details).getByRole("link", { name: "Projetos" }));

    expect(details.open).toBe(true);
  });

  /**
   * `2P-CHAT-004-MOBILE`, closed — and this is the assertion that says the bar
   * is the handoff's bar rather than the one with a menu in it.
   *
   * Written as an absence with a positive control beside it: a mobile nav that
   * rendered nothing at all would satisfy "contains no `<details>`" for free.
   */
  it("carries five destinations and no disclosure on the mobile bar", () => {
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);
    const mobile = screen.getByRole("navigation", { name: "Navegação móvel" });

    expect(mobile.querySelectorAll(":scope > details"), "`Mais` is back on the bar").toHaveLength(0);
    expect(within(mobile).queryByText("Mais")).not.toBeInTheDocument();
    // The control: five real links, so the absence above is not vacuous.
    expect(mobile.querySelectorAll(":scope > a")).toHaveLength(5);
  });

  /**
   * The secondary destinations kept their grouped index — on the rail, which is
   * where the disclosure still is.
   *
   * The mobile half of this claim moved to `mobile-reachability-guard`, which
   * re-derives every path from the components that emit it rather than reading
   * one nav's links. That is the honest place for it now: on a phone these are
   * reached from Brain, Trabalho, Registros, the calendar, the account and the
   * palette, and no single component can answer for all six.
   */
  it("keeps secondary destinations grouped and reachable from the rail's More", () => {
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);
    const railNavigation = screen.getByRole("navigation", { name: "Navegação principal" });
    const hrefs = within(railNavigation)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));

    expect(within(railNavigation).getByText("Mais")).toBeInTheDocument();
    expect(hrefs).toEqual(expect.arrayContaining([
      "/pt-BR/app",
      "/pt-BR/app/inbox",
      "/pt-BR/app/work",
      "/pt-BR/app/chat",
      "/pt-BR/app/projects",
      "/pt-BR/app/people",
      "/pt-BR/app/organizations",
      "/pt-BR/app/contexts",
      "/pt-BR/app/memories",
      "/pt-BR/app/files",
      // 2N.6, last in the context group: it is the surface about how the six
      // above connect, so it reads after them rather than among them.
      "/pt-BR/app/relations",
      "/pt-BR/app/reviews",
      "/pt-BR/app/questions",
      // `2M-CAL-001`. In the organization group, ahead of reminders: a calendar
      // is the surface a reminder appears on.
      "/pt-BR/app/calendar",
      "/pt-BR/app/reminders",
      "/pt-BR/app/history",
      "/pt-BR/app/costs",
      "/pt-BR/app/settings",
      "/pt-BR/app/capture",
    ]));
    expect(hrefs).not.toContain("/pt-BR/app/jobs");
    expect(hrefs).not.toContain("/pt-BR/app/notifications");
    for (const group of ["Contexto", "Reflexão", "Organização", "Transparência", "Preferências"]) {
      expect(within(railNavigation).getByRole("group", { name: group })).toBeInTheDocument();
    }
  });

  /**
   * The account is now the disclosure a phone opens, so it inherits the
   * behaviour `Mais` used to be held to.
   *
   * `2P-CHAT-004-MOBILE` freed the slot by moving this control into the header;
   * dropping the Escape-and-restore-focus assertion along with the panel would
   * have traded a proved keyboard behaviour for a slot.
   */
  it("closes the header account with Escape and restores focus to its summary", () => {
    render(<AppShell identity={{ displayName: "Marina Duarte" }} locale="pt-BR"><div>Conteúdo</div></AppShell>);
    const account = document.querySelector(".account-menu-header") as HTMLDetailsElement;
    const summary = account.querySelector("summary");

    expect(summary).not.toBeNull();
    account.setAttribute("open", "");
    fireEvent.keyDown(account, { key: "Escape" });

    expect(account).not.toHaveAttribute("open");
    expect(summary).toHaveFocus();
  });

  it("keeps mobile DOM order aligned with the visual tab order", () => {
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);
    const mobileNavigation = screen.getByRole("navigation", { name: "Navegação móvel" });
    const topLevelControls = Array.from(
      mobileNavigation.querySelectorAll(":scope > a, :scope > details > summary"),
    ).map((control) => control.textContent);

    /*
     * Five slots, capture in the middle (UX-14, DEC-1).
     *
     * The bar used to carry six controls with capture third, which cannot be
     * centred in an even number of columns — the reason exact centring was gated.
     * It has carried five ever since; the redesign changed *which* four
     * destinations, not the geometry.
     *
     * Registros is back on the bar, because its default view is now the decision
     * queue and `02-arquitetura-e-rotas.md` says a queue cannot live in overflow.
     *
     * **Brain took the fifth slot in slice 2P.5**, when the two destinations
     * `capabilities.ts` recorded as the release condition got paths that do not
     * go through a menu: the account reached the top bar, and Perguntas got an
     * unconditional link in Registros' header.
     *
     * DOM order is asserted here and *is* the visual order, because the grid
     * assigns columns in source order and nothing sets `order`.
     */
    expect(topLevelControls).toEqual([
      "Hoje",
      "Registros",
      "Captura rápida",
      "Trabalho",
      "Brain",
    ]);
  });

  it("centres the capture control by putting it in the middle slot", () => {
    // Geometry as a structural property rather than a measurement: an odd number
    // of equal columns with capture at the midpoint. The pixel assertion lives in
    // `e2e/layout-contracts.spec.ts`, which can measure; this is what makes that
    // measurement true by construction.
    expect(mobileBarSlots).toHaveLength(5);
    expect(mobileBarSlots.length % 2).toBe(1);
    expect(mobileBarSlots[mobileBarCentreIndex]).toBe("capture");
    expect(mobileBarSlots.slice(0, mobileBarCentreIndex)).toHaveLength(
      mobileBarSlots.slice(mobileBarCentreIndex + 1).length,
    );
  });

  /**
   * The demotion reversed direction with the redesign.
   *
   * Registros left the overflow and returned to the bar — `02-arquitetura-e-rotas.md`
   * requires it, because its default view is now the decision queue and a queue
   * cannot live behind a disclosure. Brain took the slot it vacated, since `more`
   * has to stay: it is the only route to fourteen destinations on a phone (see
   * `mobileBarSlots`).
   *
   * The protection is unchanged and still worth having: whatever is demoted must
   * lead the panel's destinations rather than joining a secondary group, so it
   * needs no scrolling to reach.
   */
  it("demotes nothing, because every primary destination is a slot", () => {
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);
    const mobile = screen.getByRole("navigation", { name: "Navegação móvel" });

    /*
      Derived, not listed: `mobileDemotedKeys` is `primaryNavigationKeys` minus
      the bar. It was `["library"]` and is empty now, which is the arithmetic
      statement of *the handoff's bar shipped* — and it is why the overflow panel
      that used to hold the demoted destination has nothing left to hold.
    */
    expect(mobileDemotedKeys).toEqual([]);
    expect(mobile.querySelector('a[href="/pt-BR/app/library"]')).toHaveTextContent("Brain");
  });

  it("carries Registros on the bar itself, not behind the disclosure", () => {
    // The requirement in one line: *Registros volta para a barra — é a fila de
    // decisão, e não pode viver em overflow.*
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);
    const mobile = screen.getByRole("navigation", { name: "Navegação móvel" });

    const onTheBar = Array.from(mobile.querySelectorAll(":scope > a"))
      .map((link) => link.getAttribute("href"));
    expect(onTheBar).toContain("/pt-BR/app/inbox");
  });

  it("marks Brain as the current page from the bar itself", () => {
    // The failure this prevents is unchanged: a phone user standing in a
    // destination sees no active state anywhere. It used to be answered by
    // marking `Mais` active while Brain hid inside it; Brain is a slot now, so
    // the slot says it directly.
    vi.mocked(usePathname).mockReturnValue("/pt-BR/app/library");
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);

    const mobile = screen.getByRole("navigation", { name: "Navegação móvel" });
    expect(mobile.querySelector('a[href="/pt-BR/app/library"]')).toHaveAttribute("aria-current", "page");

    // Desktop is unchanged: Brain is a primary rail destination, so the rail's own
    // More disclosure must *not* claim the active state.
    const desktop = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(desktop.querySelector(":scope > details")).not.toHaveClass("active");
    vi.mocked(usePathname).mockReturnValue("/pt-BR/app");
  });

  /**
   * UX-34. The bell is a navigation link on every page in the product and was
   * the one that never said when the owner had arrived at it — the same
   * "navigation marks where you are" rule the rail and the bar already keep.
   * Found by Slice H's route sweep, which asserts it on all 168 page loads.
   */
  it("marks the notifications bell as the current page while the owner is on it", () => {
    vi.mocked(usePathname).mockReturnValue("/pt-BR/app/notifications");
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);

    expect(screen.getByRole("link", { name: "Notificações" })).toHaveAttribute("aria-current", "page");
    vi.mocked(usePathname).mockReturnValue("/pt-BR/app");
  });

  it("leaves the bell unmarked everywhere else, so it does not claim a page it is not", () => {
    vi.mocked(usePathname).mockReturnValue("/pt-BR/app/inbox");
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);

    expect(screen.getByRole("link", { name: "Notificações" })).not.toHaveAttribute("aria-current");
    vi.mocked(usePathname).mockReturnValue("/pt-BR/app");
  });

  it("closes the disclosure when a destination inside it is followed", () => {
    // Asserted on the rail, which is where the disclosure lives after slice
    // 2P.5. The behaviour is unchanged and so is its reason — otherwise the
    // panel stays open over the page the user just navigated to.
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);
    const rail = screen.getByRole("navigation", { name: "Navegação principal" });
    const details = rail.querySelector(":scope > details") as HTMLDetailsElement;
    details.open = true;

    fireEvent.click(details.querySelector('a[href="/pt-BR/app/projects"]') as HTMLAnchorElement);

    expect(details.open).toBe(false);
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
      /*
        `header` since slice 2P.5, where it was `overflow`.

        The mount moved rather than multiplied: the overflow panel retired with
        the bar slot it occupied, and the top bar carries the account on every
        viewport instead. Still two mounts of one component, so a phone user and
        a desktop user have the same way out and neither surface can end a
        session the other does not.
      */
      expect(document.querySelectorAll(".account-menu-header")).toHaveLength(1);
      expect(document.querySelectorAll(".account-menu-overflow")).toHaveLength(0);
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

    /**
     * `2P-CHAT-004-MOBILE`'s release condition, asserted as the thing that
     * actually freed the slot.
     *
     * Placement was always the requirement — *reachable without scrolling past
     * product destinations* — and the top bar satisfies it more strongly than
     * the panel did: nothing has to be opened first, and it is in the same place
     * on every viewport. `mobile-reachability-guard` holds the other direction,
     * failing if the account leaves the header while the slot stays Brain.
     */
    it("sits in the top bar, reachable without opening anything else", () => {
      render(<AppShell identity={identity} locale="pt-BR"><div>Conteúdo</div></AppShell>);

      const account = document.querySelector(".top-bar .top-actions .account-menu-header");
      expect(account, "the account left the top bar — the fifth slot must go back to `Mais`").toBeTruthy();
      // Not nested in a second disclosure: its own summary is the first and only
      // control to press.
      expect((account as HTMLElement).closest("details")).toBe(account);
      // And it is not inside either navigation, so it adds no destination.
      for (const name of ["Navegação principal", "Navegação móvel"]) {
        expect(screen.getByRole("navigation", { name }).contains(account)).toBe(false);
      }
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

    /**
     * The nesting this was written for is gone, and the property it proves is
     * not.
     *
     * The mobile account block used to live *inside* the overflow panel, and
     * before `stopPropagation` one Escape closed both — so the summary the inner
     * handler had just focused was hidden by the time the press finished, and
     * focus was lost. Caught by the live Pixel 7 run.
     *
     * Slice 2P.5 removed that nesting by moving the account to the top bar, so
     * the mobile pair no longer exists. The desktop rail still nests nothing
     * inside its disclosure either — but the `stopPropagation` that fixed the
     * defect is still in `useDismissableDisclosure` and still has to work, so
     * this now proves it on the two disclosures that DO coexist: closing one
     * must not close the other.
     */
    it("closes one disclosure per Escape, leaving the other alone", () => {
      render(<AppShell identity={identity} locale="pt-BR"><div>Conteúdo</div></AppShell>);
      const rail = screen
        .getByRole("navigation", { name: "Navegação principal" })
        .querySelector(":scope > details") as HTMLDetailsElement;
      const account = document.querySelector(".account-menu-header") as HTMLDetailsElement;

      rail.open = true;
      account.open = true;
      fireEvent.keyDown(account, { key: "Escape" });

      expect(account.open).toBe(false);
      expect(rail.open, "one Escape collapsed a disclosure it was not aimed at").toBe(true);
      expect(document.activeElement).toBe(account.querySelector("summary"));

      // And the other one still answers its own Escape.
      fireEvent.keyDown(rail, { key: "Escape" });
      expect(rail.open).toBe(false);
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
      "Today",
      "Records",
      "Work",
      "Brain",
    ]);
    expect(within(desktopNavigation).getByRole("link", { name: "Work" })).toHaveAttribute(
      "href",
      "/en/app/work",
    );
  });
});
