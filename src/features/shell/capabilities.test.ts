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
  type CapabilityDefinition,
  type ProductCapabilityState,
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
      /*
       * `2O-AICONFIG-004`, and the state's first real subject.
       *
       * Directly below `ai_routing`, which is the only other row about model
       * routing and the one that has controls. Four behavioural readers and no
       * authorized control is exactly what `uncontrolled` was added to say, and
       * ADR-117 Decision 1 made that reading the owner's rather than an agent's.
       */
      { key: "embedding_route", state: "uncontrolled", visible: false },
      { key: "identity_names", state: "operational", visible: true },
      { key: "locale_preference", state: "future", visible: false },
      /*
       * `2O-PREF-004` finished what `2O-ACTIVATION-006` deferred here.
       *
       * That requirement set this row to `uncontrolled` — real consumers, no
       * authorized control — and said in as many words that its **final wording
       * and `visible` value** belong to `2O-PREF-004`. The controls now ship, so
       * `uncontrolled` would be the false reading and `operational` is the true
       * one.
       */
      { key: "scheduled_reviews", state: "operational", visible: true },
      /*
       * Phase 2P slice 2P.4 added `automation_categories` and left `autonomy`
       * exactly where it was. The two rows sitting adjacent is the point.
       *
       * `autonomy` governs `agent_preferences.autonomy_level` — one global
       * `text`, `NOT NULL DEFAULT 'autonomous'`, which nothing reads. It stays
       * `future` and invisible, because a control for it would let a schema
       * default nobody chose be read as consent for six categories of automatic
       * write.
       *
       * `automation_categories` governs the per-category policy: a different
       * store, a different vocabulary, a different authority, and real
       * behavioural consumers. Merging them would recreate exactly the
       * ambiguity `2O-ACTIVATION-006` added `uncontrolled` to remove.
       */
      { key: "autonomy", state: "future", visible: false },
      { key: "automation_categories", state: "operational", visible: true },
      /*
       * Slice 2P.5, and the row exists because a guard found the gap rather
       * than because the slice added a control.
       *
       * `2P-SETTINGS-008` moved the notification preferences into Settings, and
       * `capability-registry-guard` — which walks the preferences centre
       * transitively — immediately reported five rendered controls the registry
       * had never heard of. They shipped ungoverned in slice 2M.4b and were out
       * of the guard's scope until the move brought them in.
       *
       * `operational` rather than `uncontrolled`: `public.begin_push_delivery`
       * reads the enabled types, the frequency, the local quiet window and the
       * daily cap before every send, which is a behavioural consumer inside the
       * database. `visible: true` because the controls are offered, and
       * `2O-ACTIVATION-004`'s summary must therefore say what they do.
       */
      { key: "notification_delivery", state: "operational", visible: true },
      { key: "follow_up_intensity", state: "future", visible: false },
      { key: "privacy_default", state: "future", visible: false },
      { key: "reasoning_route", state: "future", visible: false },
      { key: "background_route", state: "future", visible: false },
      // `2O-ACTIVATION-007`'s four that had no row at all.
      { key: "privacy_preferences", state: "future", visible: false },
      { key: "quiet_periods", state: "future", visible: false },
      { key: "avatar", state: "future", visible: false },
      { key: "ai_provider", state: "future", visible: false },
      /*
       * `2O-PREF-008`'s three, and only the appearance choice is listed to the
       * reader.
       *
       * `ai_credential` was found by widening the guard from one file to the
       * settings page's own mounts, not by anyone remembering it — the panel has
       * been first on that page since BYOK shipped. It is `visible: false`
       * because `CapabilitySummary` says *what these preferences change* and a
       * credential is not a preference; `2O-AICONFIG-002` explains it in 2O.4.
       *
       * `onboarding_restore` is `visible: false` because its control renders
       * only when the guide is dismissed, so a permanent paragraph would
       * describe an affordance the page usually does not offer.
       */
      { key: "ai_credential", state: "operational", visible: false },
      { key: "appearance", state: "operational", visible: true },
      { key: "onboarding_restore", state: "operational", visible: false },
    ]);

    for (const capability of capabilityRegistry.filter((item) => item.visible)) {
      expect(capability.consumerEvidence.length, capability.key).toBeGreaterThan(0);
    }
  });

  /**
   * `2O-ACTIVATION-006`'s invariant, restated as a function so it survives its
   * own subject going away.
   *
   * Slice 2O.3 moved `scheduled_reviews` off `uncontrolled` — `2O-PREF-004`
   * built the controls `OD-2O-6` **A** signed, so *"real consumers, no
   * authorized control"* stopped being true of it. That left **no row in the
   * state at all**, and `capabilityRegistry` is `as const`, so `tsc` correctly
   * reported the old `if (capability.state === "uncontrolled")` branch as
   * comparing types with no overlap: dead code.
   *
   * Three ways out, and the third is taken. *Cast the state to the wide union*
   * — declined, a cast is precisely what slice 2O.0 refused when it made
   * `getCapabilityRegistryView` generic, and it would silently remove the
   * guarantee. *Delete the `uncontrolled` half and re-add it in 2O.4* —
   * declined, a rule with no test is a convention, and ADR-117 needs this exact
   * vocabulary one slice from now. *Extract the invariant over the widened
   * type* — taken: it is checkable against the real registry **and** against
   * planted rows, so the `uncontrolled` half is proved to still work before it
   * has a subject rather than after.
   */
  function stateInvariantFailures(capability: CapabilityDefinition): readonly string[] {
    const failures: string[] = [];
    if (capability.state === "future" && capability.consumerEvidence.length > 0) {
      failures.push(`${capability.key} is \`future\` with evidence`);
    }
    if (capability.state === "uncontrolled") {
      if (capability.consumerEvidence.length === 0) {
        failures.push(`${capability.key} is \`uncontrolled\` and names no consumer`);
      }
      if (capability.visible) failures.push(`${capability.key} is \`uncontrolled\` and rendered`);
    }
    return failures;
  }

  it("keeps `future` meaning no consumer, across the whole registry", () => {
    for (const capability of capabilityRegistry) {
      expect(stateInvariantFailures(capability), capability.key).toEqual([]);
    }
    // Non-vacuous: `future` really is in use, so the branch above is exercised.
    expect(capabilityRegistry.some((item) => item.state === "future")).toBe(true);
  });

  it("still refuses a dishonest `uncontrolled` row, which is why the rule outlived its subject", () => {
    const base = { surface: "settings", columns: ["x"], controls: [] } as const;
    // Valid: real consumers, no control offered.
    expect(stateInvariantFailures({
      ...base, key: "embedding_model", state: "uncontrolled",
      consumerEvidence: ["chat/actions"], visible: false,
    })).toEqual([]);
    // The two ways it can lie, both caught.
    expect(stateInvariantFailures({
      ...base, key: "no_consumer", state: "uncontrolled", consumerEvidence: [], visible: false,
    })).toHaveLength(1);
    expect(stateInvariantFailures({
      ...base, key: "rendered", state: "uncontrolled", consumerEvidence: ["x"], visible: true,
    })).toHaveLength(1);
    // And `future` still fails the other way, so neither half is dead.
    expect(stateInvariantFailures({
      ...base, key: "future_with_evidence", state: "future", consumerEvidence: ["x"], visible: false,
    })).toHaveLength(1);
  });

  /**
   * `uncontrolled` has its subject — the re-arming slice 2O.3 demanded.
   *
   * *(Inverted by `2O-AICONFIG-004`, and kept rather than deleted.)* The prior
   * form asserted the state was **empty** and named where its next row would
   * come from. It fired the moment `embedding_route` was added, which is
   * precisely what it was written to do: slice 2O.3 chose an exact count over a
   * loose one **so that whoever added the row could not do it without noticing**,
   * and §81 recorded that the correct response is to re-arm the claim
   * deliberately rather than weaken it.
   *
   * *Superseded form, retained: "records that `uncontrolled` is currently empty,
   * and where its next row comes from" —* `expect(states.filter((state) => state
   * === "uncontrolled")).toEqual([])`.
   *
   * Weakening it was the alternative and would have looked like
   * `toHaveLength(1)` or a `toBeGreaterThanOrEqual`. Both are satisfied by a
   * second `uncontrolled` row that nobody signed, and ADR-117 authorized exactly
   * one. The count stays exact and now names its member, so a row added without
   * an owner decision still fails here.
   */
  it("holds `uncontrolled` at exactly the one row ADR-117 authorized", () => {
    const uncontrolled = capabilityRegistry.filter(
      (item) => (item.state as ProductCapabilityState) === "uncontrolled",
    );
    expect(uncontrolled.map((item) => item.key)).toEqual(["embedding_route"]);
    expect(uncontrolled.flatMap((item) => item.columns)).toEqual(["embedding_model"]);
    // The row says the true thing rather than either false one: it names real
    // consumers (not `future`'s "none") and offers no control (not
    // `operational`'s "yours to change").
    expect(uncontrolled[0]!.consumerEvidence.length).toBeGreaterThan(0);
    expect(uncontrolled[0]!.visible).toBe(false);
    expect(uncontrolled[0]!.controls).toEqual([]);
    expect(capabilityRegistry.length).toBeGreaterThan(15);
  });

  it("re-arms the non-vacuity the exact count was protecting", () => {
    /*
     * The claim that had to be re-armed, and it is stronger than the one it
     * replaces rather than merely different.
     *
     * While the state was empty, `stateInvariantFailures`'s `uncontrolled`
     * branch could only be exercised by **planted** rows — the test below this
     * one. It now has a real subject, so the branch is exercised by the shipped
     * registry, and this asserts that rather than assuming it.
     */
    const real = capabilityRegistry.filter(
      (item) => (item.state as ProductCapabilityState) === "uncontrolled",
    );
    expect(real.length).toBeGreaterThan(0);
    for (const capability of real) {
      expect(stateInvariantFailures(capability), capability.key).toEqual([]);
    }
    // And the branch still fails on a real registry row mutated to lie, which
    // is what proves the pass above is not the invariant having gone quiet.
    expect(stateInvariantFailures({ ...real[0]!, consumerEvidence: [] })).toHaveLength(1);
    expect(stateInvariantFailures({ ...real[0]!, visible: true })).toHaveLength(1);
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
