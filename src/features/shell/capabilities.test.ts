import { describe, expect, it } from "vitest";
import {
  classifyNavigationPath,
  getLocaleSwitchHref,
  getNavigationHref,
  isNavigationActive,
  moreNavigationGroups,
  navigationCapabilities,
  primaryNavigationKeys,
} from "./capabilities";

describe("navigation capabilities", () => {
  it("classifies every authenticated page without exposing Jobs in common navigation", () => {
    const routes = [
      ["/pt-BR/app", "home", "primary"],
      ["/pt-BR/app/capture", "capture", "global"],
      ["/pt-BR/app/chat", "chat", "primary"],
      ["/pt-BR/app/chat/conversation-1", "chat", "primary"],
      ["/pt-BR/app/costs", "costs", "transparency"],
      ["/pt-BR/app/files", "files", "context"],
      ["/pt-BR/app/history", "history", "transparency"],
      ["/pt-BR/app/inbox", "inbox", "primary"],
      ["/pt-BR/app/inbox/entry-1", "inbox", "primary"],
      ["/pt-BR/app/jobs", "jobs", "advanced"],
      ["/pt-BR/app/memories", "memories", "context"],
      ["/pt-BR/app/notifications", "notifications", "global"],
      ["/pt-BR/app/people", "people", "context"],
      ["/pt-BR/app/people/person-1", "people", "context"],
      ["/pt-BR/app/projects", "projects", "context"],
      ["/pt-BR/app/projects/project-1", "projects", "context"],
      ["/pt-BR/app/questions", "questions", "reflection"],
      ["/pt-BR/app/reminders", "reminders", "organization"],
      ["/pt-BR/app/reviews", "reviews", "reflection"],
      ["/pt-BR/app/settings", "settings", "preferences"],
      ["/pt-BR/app/tasks", "work", "primary"],
      ["/pt-BR/app/today", "work", "primary"],
      ["/pt-BR/app/waiting", "work", "primary"],
      ["/pt-BR/app/work", "work", "primary"],
    ] as const;

    for (const [pathname, key, group] of routes) {
      expect(classifyNavigationPath(pathname)).toMatchObject({ key, group });
    }

    expect(navigationCapabilities.find((item) => item.key === "jobs")).toMatchObject({
      visibility: "context-only",
    });
    expect(primaryNavigationKeys).not.toContain("jobs");
    expect(moreNavigationGroups.flatMap((group) => group.items)).not.toContain("jobs");

    const commonCapabilities = navigationCapabilities
      .filter((item) => item.visibility === "primary" || item.visibility === "more")
      .map((item) => item.key);
    const renderedCapabilities = [
      ...primaryNavigationKeys,
      ...moreNavigationGroups.flatMap((group) => group.items),
    ];
    expect(renderedCapabilities).toHaveLength(new Set(renderedCapabilities).size);
    expect(new Set(renderedCapabilities)).toEqual(new Set(commonCapabilities));
  });

  it("defines the same ordered hierarchy for desktop and mobile More", () => {
    expect(primaryNavigationKeys).toEqual(["home", "inbox", "work", "chat"]);
    expect(moreNavigationGroups).toEqual([
      { key: "context", items: ["projects", "people", "memories", "files"] },
      { key: "reflection", items: ["reviews", "questions"] },
      { key: "organization", items: ["reminders"] },
      { key: "transparency", items: ["history", "costs"] },
      { key: "preferences", items: ["settings"] },
    ]);
  });

  it("uses one deterministic primary active state for aliases, nested routes, and query views", () => {
    const cases = [
      ["/pt-BR/app", "home"],
      ["/pt-BR/app/inbox?view=needs-you", "inbox"],
      ["/pt-BR/app/inbox/entry-1", "inbox"],
      ["/pt-BR/app/work?view=waiting&page=2", "work"],
      ["/pt-BR/app/today?page=3", "work"],
      ["/pt-BR/app/tasks?page=2", "work"],
      ["/pt-BR/app/waiting?page=4", "work"],
      ["/pt-BR/app/chat/conversation-1", "chat"],
    ] as const;

    for (const [pathname, expectedKey] of cases) {
      expect(primaryNavigationKeys.filter((key) => isNavigationActive(pathname, key))).toEqual([
        expectedKey,
      ]);
    }

    expect(isNavigationActive("/pt-BR/app/inbox-archive", "inbox")).toBe(false);
    expect(isNavigationActive("/pt-BR/app/tasks/unknown", "work")).toBe(false);
  });

  it("builds canonical destinations while preserving the selected locale", () => {
    expect(getNavigationHref("pt-BR", "home")).toBe("/pt-BR/app");
    expect(getNavigationHref("pt-BR", "work")).toBe("/pt-BR/app/work");
    expect(getNavigationHref("en", "inbox")).toBe("/en/app/inbox");
    expect(getNavigationHref("en", "chat")).toBe("/en/app/chat");
    expect(
      getLocaleSwitchHref("/pt-BR/app/inbox", "view=needs-you&page=2", "en"),
    ).toBe("/en/app/inbox?view=needs-you&page=2");
  });
});
