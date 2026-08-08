import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TodayAlias from "../today/page";
import TasksAlias from "../tasks/page";
import WaitingAlias from "../waiting/page";

const navigation = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
  notFound: vi.fn(),
}));

vi.mock("next/navigation", () => navigation);
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(() => {
    throw new Error("legacy page queried data instead of redirecting");
  }),
}));

describe("canonical Work page architecture", () => {
  it("loads tasks only through the server-only Work projection and passes product DTOs to WorkView", () => {
    const filePath = path.resolve(process.cwd(), "src/app/[locale]/app/work/page.tsx");
    expect(existsSync(filePath)).toBe(true);
    const source = readFileSync(filePath, "utf8");

    expect(source).toMatch(/from\s*["']@\/features\/daily-cycle\/work-projection["']/);
    expect(source).toMatch(/from\s*["']@\/features\/daily-cycle\/work-view["']/);
    expect(source).not.toMatch(/database\.types/i);
    expect(source).not.toMatch(/\.from\(\s*["']tasks["']\s*\)/);
    expect(source).not.toMatch(/TaskRecord/);
  });
});

describe("legacy Work route aliases", () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * `2J-HOJE-001`/`002`. `/app/today` is no longer a Work alias -- it resolves
   * to Hoje, the surface the word actually names. The URL still works, which is
   * what `2J-HOJE-002` requires; what changed is where it lands.
   *
   * Asserted here rather than deleted, because "the alias was removed" and "the
   * alias silently stopped redirecting anywhere" are the same green test
   * otherwise.
   */
  it("sends /app/today to Hoje, not to a filtered task list", async () => {
    await expect(TodayAlias({
      params: Promise.resolve({ locale: "pt-BR" }),
    })).rejects.toThrow("NEXT_REDIRECT:/pt-BR/app");
    expect(navigation.redirect).toHaveBeenCalledWith("/pt-BR/app");
  });

  it.each([
    [TasksAlias, "en", "all"],
    [WaitingAlias, "pt-BR", "waiting"],
  ] as const)("preserves locale, equivalent view, and page", async (Page, locale, view) => {
    await expect(Page({
      params: Promise.resolve({ locale }),
      searchParams: Promise.resolve({ page: "3" }),
    })).rejects.toThrow(`NEXT_REDIRECT:/${locale}/app/work?view=${view}&page=3`);
    expect(navigation.redirect).toHaveBeenCalledWith(`/${locale}/app/work?view=${view}&page=3`);
  });
});
