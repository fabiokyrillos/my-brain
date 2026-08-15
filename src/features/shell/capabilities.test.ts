import { describe, expect, it } from "vitest";
import {
  capabilityRegistry,
  classifyNavigationPath,
  consumerlessPreferenceColumns,
  deriveHomeOperationalStatus,
  getCapabilityRegistryView,
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
      // Conversar is a lens of Brain since the redesign, so it classifies in the
      // `context` group beside the other lenses. The route is unchanged.
      ["/pt-BR/app/chat", "chat", "context"],
      ["/pt-BR/app/chat/conversation-1", "chat", "context"],
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
      ["/pt-BR/app/today", "home", "primary"],
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
    // The four the architecture names: Hoje · Registros · Trabalho · Brain.
    // `library` is the route; "Brain" is what it is called.
    expect(primaryNavigationKeys).toEqual(["home", "inbox", "work", "library"]);
    expect(moreNavigationGroups).toEqual([
      // EGC.1 puts organizations and contexts beside the two entity destinations
      // they relate, and ahead of the two that are stores rather than graph
      // members. Declared order is rendered order, so this pins both.
      // `2N-RELATION-006` adds `relations` last in this group and NOT among the
      // primaries — that requirement forbids the graph becoming primary
      // navigation, and `2I-SHELL-001`'s four are asserted unchanged above.
      {
        key: "context",
        // `chat` leads the group since the redesign: Conversar is the lens through
        // which you ask about everything else Brain holds.
        items: ["chat", "projects", "people", "organizations", "contexts", "memories", "files", "relations"],
      },
      { key: "reflection", items: ["reviews", "questions"] },
      // `2M-CAL-001` puts the calendar here rather than among the primaries:
      // `2I-SHELL-001` pins those four as a delivered baseline, and promoting a
      // destination into the rail is an IA decision Phase 2M was not authorized
      // to make. It leads the group because a calendar is the surface a reminder
      // appears *on*.
      { key: "organization", items: ["calendar", "reminders"] },
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
      ["/pt-BR/app/today?page=3", "home"],
      ["/pt-BR/app/tasks?page=2", "work"],
      ["/pt-BR/app/waiting?page=4", "work"],
      ["/pt-BR/app/library", "library"],
    ] as const;

    /*
      `chat` is no longer primary, so it has no primary active state to be
      deterministic about — and asserting an empty result for it would be
      asserting nothing. The claim that matters is the inverse: standing inside
      a lens must not light up a rail destination that does not contain it.
    */
    expect(primaryNavigationKeys.filter((key) => isNavigationActive("/pt-BR/app/chat/conversation-1", key))).toEqual([]);

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

  it("classifies visible product promises by real consumer evidence", () => {
    expect(getCapabilityRegistryView("settings").map(({ key, state, visible }) => ({ key, state, visible }))).toEqual([
      { key: "timezone", state: "operational", visible: true },
      { key: "response_style", state: "operational", visible: true },
      { key: "quiet_hours", state: "operational", visible: true },
      { key: "ai_routing", state: "advanced", visible: true },
      { key: "identity_names", state: "operational", visible: true },
      { key: "locale_preference", state: "future", visible: false },
      // `2O-ACTIVATION-006`: `uncontrolled` rather than `future`, because the
      // three review columns have a consumer and no control, and `future` could
      // be read as either.
      { key: "scheduled_reviews", state: "uncontrolled", visible: false },
      { key: "autonomy", state: "future", visible: false },
      { key: "follow_up_intensity", state: "future", visible: false },
      { key: "privacy_default", state: "future", visible: false },
      { key: "reasoning_route", state: "future", visible: false },
      { key: "background_route", state: "future", visible: false },
      // `2O-ACTIVATION-007`'s four that had no row at all.
      { key: "privacy_preferences", state: "future", visible: false },
      { key: "quiet_periods", state: "future", visible: false },
      { key: "avatar", state: "future", visible: false },
      { key: "ai_provider", state: "future", visible: false },
    ]);

    for (const capability of capabilityRegistry.filter((item) => item.visible)) {
      expect(capability.consumerEvidence.length, capability.key).toBeGreaterThan(0);
    }
  });

  it("keeps `future` meaning no consumer, and `uncontrolled` meaning the opposite", () => {
    // `2O-ACTIVATION-006`. The two states are only worth having if they cannot
    // be confused, so the invariant is asserted rather than left to the comment.
    for (const capability of capabilityRegistry) {
      if (capability.state === "future") {
        expect(capability.consumerEvidence, `${capability.key} is \`future\` with evidence`).toEqual([]);
      }
      if (capability.state === "uncontrolled") {
        expect(
          capability.consumerEvidence.length,
          `${capability.key} is \`uncontrolled\` and names no consumer`,
        ).toBeGreaterThan(0);
        expect(capability.visible, `${capability.key} is \`uncontrolled\` and rendered`).toBe(false);
      }
    }
    // Non-vacuous: both states really are in use.
    expect(capabilityRegistry.some((item) => item.state === "future")).toBe(true);
    expect(capabilityRegistry.some((item) => item.state === "uncontrolled")).toBe(true);
  });

  it("derives the nine consumer-less columns `2O-ACTIVATION-007` names", () => {
    expect([...consumerlessPreferenceColumns].sort()).toEqual([
      "ai_provider",
      "autonomy_level",
      "avatar_path",
      "background_model",
      "follow_up_intensity",
      "privacy_default",
      "privacy_preferences",
      "quiet_periods",
      "reasoning_model",
    ]);
  });

  it("derives the observable Home status with attention before organizing before saved", () => {
    expect(deriveHomeOperationalStatus({
      items: [{ productState: "organizing" }],
      attentionCount: 2,
      attentionHasNext: true,
      conflictCount: 0,
    })).toEqual({ kind: "attention", count: 2, hasMore: true });

    expect(deriveHomeOperationalStatus({
      items: [{ productState: "saved" }, { productState: "organizing" }],
      attentionCount: 0,
      attentionHasNext: false,
      conflictCount: 0,
    })).toEqual({ kind: "organizing", count: 1, hasMore: false });

    expect(deriveHomeOperationalStatus({
      items: [{ productState: "saved" }, { productState: "ready" }],
      attentionCount: 0,
      attentionHasNext: false,
      conflictCount: 0,
    })).toEqual({ kind: "saved", count: 0, hasMore: false });
  });

  /**
   * `2N-CONFLICT-004`. The `saved` branch says *"Nada pendente. Tudo salvo."*, so
   * a conflict that did not reach this function would turn the queue's silence
   * into a claim about the whole product.
   */
  it("counts a derived conflict as pending, so Home cannot say nothing is pending", () => {
    expect(deriveHomeOperationalStatus({
      items: [{ productState: "ready" }],
      attentionCount: 0,
      attentionHasNext: false,
      conflictCount: 1,
    })).toEqual({ kind: "attention", count: 1, hasMore: false });
  });

  it("adds conflicts to the entry count rather than replacing it", () => {
    expect(deriveHomeOperationalStatus({
      items: [],
      attentionCount: 2,
      attentionHasNext: false,
      conflictCount: 3,
    })).toEqual({ kind: "attention", count: 5, hasMore: false });
  });

  it("still reports organizing when there is neither attention nor a conflict", () => {
    expect(deriveHomeOperationalStatus({
      items: [{ productState: "organizing" }],
      attentionCount: 0,
      attentionHasNext: false,
      conflictCount: 0,
    })).toEqual({ kind: "organizing", count: 1, hasMore: false });
  });
});
