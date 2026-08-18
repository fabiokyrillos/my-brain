import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BrainLensTabs } from "./brain-lenses";
import { BRAIN_LENSES } from "./lenses";

/**
 * The lens strip — the one component that makes Brain a place rather than a
 * menu, and the one that could quietly strand a destination.
 */
describe("BrainLensTabs", () => {
  it("offers every lens, in reading order, with the overview first", () => {
    render(<BrainLensTabs active="overview" locale="pt-BR" />);
    const strip = screen.getByRole("navigation", { name: "Lentes do Brain" });

    expect(within(strip).getAllByRole("link").map((link) => link.textContent)).toEqual([
      // `2P-CHAT-004` (`OD-2P-7`). Conversar moved from last to first among the
      // domains: it is the one interactive destination in a strip of seven
      // browse destinations, and it used to sit at the far end of them.
      "Visão geral",
      "Conversar",
      "Pessoas",
      "Projetos",
      "Empresas",
      "Contextos",
      "Memórias",
      "Arquivos",
      "Relações",
    ]);
  });

  it("keeps every current URL, so no deep link dies at the lens", () => {
    render(<BrainLensTabs active="people" locale="pt-BR" />);
    const strip = screen.getByRole("navigation", { name: "Lentes do Brain" });

    /*
     * The whole compatibility rule, asserted as hrefs rather than as prose.
     * `overview` resolves to `/app/library` — the route did not move when the
     * destination was renamed, and a lens that pointed at `/app/brain` would be
     * the duplication ADR-114 Decision 6 refused.
     */
    expect(within(strip).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      // `2P-CHAT-004` (`OD-2P-7`): Conversas leads the domain lenses, and the
      // overview still leads the strip. Every href is unchanged — this is a
      // reordering, and no deep link moved.
      "/pt-BR/app/library",
      "/pt-BR/app/chat",
      "/pt-BR/app/people",
      "/pt-BR/app/projects",
      "/pt-BR/app/organizations",
      "/pt-BR/app/contexts",
      "/pt-BR/app/memories",
      "/pt-BR/app/files",
      "/pt-BR/app/relations",
    ]);
  });

  it("marks exactly one lens as current, and it is the one it was told", () => {
    render(<BrainLensTabs active="memories" locale="pt-BR" />);
    const strip = screen.getByRole("navigation", { name: "Lentes do Brain" });
    const current = within(strip)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Memórias");
  });

  it("marks the overview when Brain's own route is the one being read", () => {
    render(<BrainLensTabs active="overview" locale="en" />);
    const current = screen
      .getByRole("navigation", { name: "Brain lenses" })
      .querySelectorAll('[aria-current="page"]');

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Overview");
  });

  it("translates the strip rather than reusing one locale's words", () => {
    const { unmount } = render(<BrainLensTabs active="overview" locale="pt-BR" />);
    const pt = screen.getByRole("navigation", { name: "Lentes do Brain" }).textContent;
    unmount();

    render(<BrainLensTabs active="overview" locale="en" />);
    const en = screen.getByRole("navigation", { name: "Brain lenses" }).textContent;

    expect(pt).not.toBe(en);
  });

  /*
   * `role="tablist"` would promise a panel that swaps in place. These navigate
   * to separate documents, and announcing them as tabs is the promise
   * `03-componentes.md` says not to make.
   */
  it("is a navigation landmark, never a tablist", () => {
    render(<BrainLensTabs active="overview" locale="pt-BR" />);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });

  it("renders one link per declared lens, so none is dropped in the mapping", () => {
    render(<BrainLensTabs active="overview" locale="pt-BR" />);
    expect(
      screen.getByRole("navigation", { name: "Lentes do Brain" }).querySelectorAll("a"),
    ).toHaveLength(BRAIN_LENSES.length);
  });
});
