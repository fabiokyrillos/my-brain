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

/* -------------------------------------------------------------------------- *
 * `2L-EDIT-007` — one task detail, two frames.
 * -------------------------------------------------------------------------- */

describe("the responsive task detail", () => {
  const read = (relative: string) =>
    readFileSync(path.resolve(process.cwd(), relative), "utf8");
  /**
   * Comments stripped before matching, for the reason this repository has
   * relearned several times: a file that *documents* what it no longer does is
   * not a file that does it, and a guard that reads its own explanatory prose as
   * a violation fails the module written to satisfy it.
   */
  const code = (relative: string) =>
    read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const WORK = "src/app/[locale]/app/work";

  it("mounts one surface from both routes", () => {
    // The property the requirement is actually about: not that the two look
    // alike, but that there are not two of them. Both routes are a locale check
    // and a call; everything else lives in `TaskDetailSurface`.
    for (const route of [`${WORK}/[taskId]/page.tsx`, `${WORK}/@panel/(.)[taskId]/page.tsx`]) {
      expect(read(route)).toMatch(/TaskDetailSurface/);
    }
  });

  it("keeps the data load, the control set and the actions out of both routes", () => {
    // A route that started loading its own projection or deriving its own
    // controls would be the second surface this extraction removed.
    for (const route of [`${WORK}/[taskId]/page.tsx`, `${WORK}/@panel/(.)[taskId]/page.tsx`]) {
      const source = code(route);
      expect(source).not.toMatch(/loadTaskDetailProjection|detailControlsFor|applyTaskDetailCommand/);
    }
  });

  it("differs between the two mounts by exactly one prop", () => {
    // `panel` selects a frame and a back affordance. If a viewport could ever
    // select a *control*, the requirement would be broken while both files
    // still imported one component.
    const full = code(`${WORK}/[taskId]/page.tsx`);
    const panel = code(`${WORK}/@panel/(.)[taskId]/page.tsx`);
    expect(panel).toMatch(/panel/);
    expect(full).not.toMatch(/panel/);
  });

  it("renders nothing in the slot for every route that is not an intercepted task", () => {
    // Without these, a hard load answers 404 for the slot, and a client-side
    // navigation away leaves the panel open over a list it no longer belongs to.
    for (const fallback of [
      `${WORK}/@panel/default.tsx`,
      `${WORK}/@panel/page.tsx`,
      `${WORK}/@panel/[...catchAll]/page.tsx`,
    ]) {
      expect(read(fallback)).toMatch(/return null;/);
    }
  });

  it("makes the narrow viewport a surface rather than an untrapped overlay", () => {
    // A covered list is still in the accessibility tree and still reachable by a
    // screen reader while the user believes they are on the task. The list is
    // removed, so there is nothing behind to escape from and no focus trap to
    // get wrong.
    const css = read("src/app/operations.css");
    expect(css).toMatch(/\.work-shell:has\(\.task-detail-panel\) \.work-shell-main\{display:none\}/);
  });
});
