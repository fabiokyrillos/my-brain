import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { navigationCapabilities } from "@/features/shell/capabilities";

import {
  TRANSPARENCY_ADVANCED_MEMBER,
  TRANSPARENCY_LENSES,
  TRANSPARENCY_MENU_MEMBERS,
} from "./contracts";
import { getTransparencyCopy } from "./copy";
import { DataAiSection } from "./data-ai-section";
import { DataAiTabs } from "./data-ai-tabs";

/**
 * Dados e IA — the three surfaces the handoff consolidates, and the two rules
 * that consolidation must not break: **no route dies**, and **none of the three
 * appears in primary navigation**.
 */
describe("the strip reaches all three, at the URLs they already had", () => {
  it("offers Atividade, Custos and Processamento in reading order", () => {
    render(<DataAiTabs active="history" locale="pt-BR" />);
    const strip = screen.getByRole("navigation", { name: "Dados e IA" });

    expect(
      within(strip)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual([
      // The way up first, so a deep link learns what it belongs to.
      "/pt-BR/app/settings",
      "/pt-BR/app/history",
      "/pt-BR/app/costs",
      "/pt-BR/app/jobs",
    ]);
  });

  it("marks exactly one lens as current", () => {
    render(<DataAiTabs active="jobs" locale="pt-BR" />);
    const current = screen
      .getByRole("navigation", { name: "Dados e IA" })
      .querySelectorAll('[aria-current="page"]');

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Processamento");
  });

  it("is a navigation landmark, never a tablist", () => {
    render(<DataAiTabs active="costs" locale="en" />);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });

  it("translates rather than reusing one locale's words", () => {
    const pt = getTransparencyCopy("pt-BR");
    const en = getTransparencyCopy("en");
    for (const lens of TRANSPARENCY_LENSES) {
      expect(pt.lenses[lens], `${lens} is untranslated`).not.toBe(en.lenses[lens]);
      expect(pt.descriptions[lens], `${lens}'s description is untranslated`).not.toBe(
        en.descriptions[lens],
      );
    }
    expect(pt.title).not.toBe(en.title);
  });
});

describe("the section inside Ajustes names all three and controls none", () => {
  it("offers one door per view, and nothing else", () => {
    render(<DataAiSection locale="pt-BR" />);
    const section = screen.getByRole("region", { name: "Dados e IA" });

    expect(within(section).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/pt-BR/app/history",
      "/pt-BR/app/costs",
      "/pt-BR/app/jobs",
    ]);
  });

  /*
   * ADR-114 Decision 7 forbids the affordance before it forbids the feature. A
   * transparency section is exactly where a "clear history" or an "export"
   * would look natural and be a lie — neither exists behind any of these.
   */
  it("renders no control at all — every element is a link", () => {
    render(<DataAiSection locale="pt-BR" />);
    const section = screen.getByRole("region", { name: "Dados e IA" });

    expect(within(section).queryAllByRole("button")).toHaveLength(0);
    expect(within(section).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(section).queryAllByRole("switch")).toHaveLength(0);
    expect(section.querySelectorAll("form")).toHaveLength(0);
  });

  it("says what each view holds, so the door is not a mystery", () => {
    render(<DataAiSection locale="en" />);
    const copy = getTransparencyCopy("en");
    for (const lens of TRANSPARENCY_LENSES) {
      expect(screen.getByText(copy.descriptions[lens])).toBeInTheDocument();
    }
  });
});

describe("consolidating does not promote anything into primary navigation", () => {
  it("keeps Atividade and Custos behind the More disclosure", () => {
    for (const key of TRANSPARENCY_MENU_MEMBERS) {
      const capability = navigationCapabilities.find((item) => item.key === key)!;
      expect(capability.visibility, `${key} left the overflow`).toBe("more");
    }
  });

  it("keeps Processamento out of the menu entirely", () => {
    // `02-arquitetura-e-rotas.md`: *sem entrada de menu*. `context-only` is how
    // this repository spells that, and it predates the handoff.
    const jobs = navigationCapabilities.find((item) => item.key === TRANSPARENCY_ADVANCED_MEMBER)!;
    expect(jobs.visibility).toBe("context-only");
    expect(jobs.group).toBe("advanced");
  });

  it("covers every menu-visible transparency destination, and adds the advanced one", () => {
    // Derived in one direction and declared in the other, so a fourth
    // transparency surface cannot be added without appearing here.
    expect([...TRANSPARENCY_LENSES].sort()).toEqual(
      [...TRANSPARENCY_MENU_MEMBERS, TRANSPARENCY_ADVANCED_MEMBER].sort(),
    );
    expect(TRANSPARENCY_MENU_MEMBERS.length).toBeGreaterThan(0);
  });
});

describe("each surface mounts the strip, and marks itself", () => {
  /*
   * The strip is mounted by hand on three pages and told which one it is on. A
   * page passing another lens's key would light the wrong tab, and nothing about
   * the page would look wrong while it did — so the expected key is re-derived
   * from each route's own directory and compared with what the file passes.
   */
  it.each(TRANSPARENCY_LENSES)("/app/%s carries DataAiTabs with its own key", (lens) => {
    const source = readFileSync(
      join(process.cwd(), `src/app/[locale]/app/${lens}/page.tsx`),
      "utf8",
    );
    const mount = source.match(/<DataAiTabs\s+active="([a-z]+)"/);
    expect(mount, `/app/${lens} does not mount DataAiTabs`).not.toBeNull();
    expect(mount![1], `/app/${lens} marks the ${mount![1]} lens as current`).toBe(lens);
  });

  it("keeps every route alive — none of the three redirects away", () => {
    // ADR-114 Decision 6, and the reason the handoff's redirect is not built:
    // a redirect would end three rendering surfaces and take History's filters,
    // Costs' RPC and Processamento's states with them.
    for (const lens of TRANSPARENCY_LENSES) {
      const source = readFileSync(
        join(process.cwd(), `src/app/[locale]/app/${lens}/page.tsx`),
        "utf8",
      );
      expect(source, `/app/${lens} redirects instead of rendering`).not.toMatch(
        /\bredirect\s*\(/,
      );
      expect(source, `/app/${lens} stopped being a page`).toMatch(/export default async function/);
    }
  });

  it("reaches Processamento from a failure, which is how the handoff routes it", () => {
    const files = readFileSync(join(process.cwd(), "src/app/[locale]/app/files/page.tsx"), "utf8");
    // The failed-jobs section is the product's one place that knows something
    // went wrong. Before this it offered no way to see what.
    expect(files).toContain("app/jobs");
    expect(files).toContain("openProcessing");
  });
});
