import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  capabilityRegistry,
  consumerlessPreferenceColumns,
  type CapabilityDefinition,
} from "@/features/shell/capabilities";

/**
 * `2O-ACTIVATION-004`, `-005`, `-006` and `-007` — the guard that turns
 * `capabilityRegistry` from a comment into a mechanism.
 *
 * ## What was wrong with the registry before this file
 *
 * Sixteen rows recorded which preferences are real, and **nothing in the product
 * read any of them**. `consumerEvidence` was a string array nobody checked
 * against anything, so a row could name a function that does not exist and the
 * build would stay green — which makes `R-24` (*the settings surface never
 * offers a control that changes nothing*) a convention rather than a rule.
 *
 * ## The two directions, and why one is not enough
 *
 * `2O-ACTIVATION-005` requires both, and the requirement says so because a
 * one-directional check is the easier half and looks identical from the passing
 * side:
 *
 * - **A — a row may not claim a consumer that does not exist.** Every
 *   `consumerEvidence` token is resolved against the tree. A fabricated one
 *   fails.
 * - **B — a rendered control may not exist without a row.** Every control the
 *   preferences interface renders is resolved to the column it writes and then
 *   to the row that governs it. An ungoverned control fails.
 *
 * Each carries a **planted divergence** rather than a claim that it works: the
 * fabricated row and the ungoverned control are constructed here, on every run,
 * and asserted to be rejected. A guard nobody has watched fail is a guard nobody
 * knows the shape of.
 *
 * ## What `consumerEvidence` means, stated because it is about to be ambiguous
 *
 * It records **behavioural** consumers — code whose output changes because of
 * the stored value. It deliberately does not record a read that merely observes
 * whether a value is set: `activation-view.ts` reads `profiles.locale` to answer
 * *"has this account been set up"*, and that is a derivation about setup rather
 * than product behaviour driven by the column. Conflating the two would let any
 * column acquire a "consumer" by being counted.
 */

const REPO = resolve(__dirname, "../../..");

/**
 * Every product source file, with tests excluded **on purpose**.
 *
 * A token that appears only in a test is not a consumer — it is a fixture, and
 * counting it would let a row prove itself by being asserted about. The SQL
 * directories are included because four rows name database objects.
 */
function productSources(): { paths: string[]; text: string } {
  const paths: string[] = [];
  const chunks: string[] = [];

  const walk = (absolute: string, relative: string) => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const nextAbsolute = join(absolute, entry.name);
      const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(nextAbsolute, nextRelative);
        continue;
      }
      if (!/\.(ts|tsx|sql)$/.test(entry.name)) continue;
      if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
      paths.push(nextRelative);
      chunks.push(readFileSync(nextAbsolute, "utf8"));
    }
  };

  for (const root of ["src", "supabase/functions", "supabase/migrations"]) {
    walk(join(REPO, root), root);
  }

  return { paths, text: chunks.join("\n") };
}

const SOURCES = productSources();

/**
 * Does this evidence token resolve to something that exists?
 *
 * Two shapes, because the registry names two kinds of thing. A token containing
 * `/` names a module — `chat/actions`, `process-jobs/entry` — and is resolved
 * against the file paths. Everything else is an identifier — `generateReview`,
 * `get_ai_cost_summary`, `audit_events` — and is resolved against the source
 * text. Both are deliberately generous: the failure being caught is a token
 * that matches **nothing**, which is what a fabricated claim looks like.
 */
function resolvesInTree(token: string): boolean {
  if (token.includes("/")) {
    return SOURCES.paths.some((path) => path.includes(token));
  }
  return new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(SOURCES.text);
}

describe("2O-ACTIVATION-005 direction A: a row may not claim a consumer that does not exist", () => {
  it("resolves every evidence token in the tree", () => {
    for (const capability of capabilityRegistry) {
      for (const token of capability.consumerEvidence) {
        expect(resolvesInTree(token), `${capability.key} claims \`${token}\`, which resolves to nothing`).toBe(true);
      }
    }
  });

  it("is non-vacuous: the corpus and the claims are both real", () => {
    // Every assertion above passes trivially over an empty corpus or an empty
    // registry, and both have been empty in this repository before — once
    // because a scan ran from the wrong working directory.
    expect(SOURCES.paths.length).toBeGreaterThan(500);
    expect(SOURCES.text.length).toBeGreaterThan(1_000_000);
    expect(capabilityRegistry.flatMap((item) => item.consumerEvidence).length).toBeGreaterThan(15);
  });

  it("rejects a planted row whose consumer does not exist", () => {
    // The divergence, constructed rather than described. If `resolvesInTree`
    // ever starts answering `true` for everything — a corpus that silently
    // became the whole disk, a regex that lost its anchors — this fails.
    const fabricated: CapabilityDefinition = {
      key: "planted_capability",
      state: "operational",
      surface: "settings",
      consumerEvidence: ["readsAbsolutelyNothing2O", "features/no-such-module/actions"],
      visible: true,
      columns: [],
      controls: [],
    };
    for (const token of fabricated.consumerEvidence) {
      expect(resolvesInTree(token), `the planted token \`${token}\` resolved`).toBe(false);
    }
  });

  it("resolves a token that does exist, so the rejection above is not blanket", () => {
    // The other half of the control. A checker that answers `false` for
    // everything would pass the planted case and be worthless.
    expect(resolvesInTree("generateReview")).toBe(true);
    expect(resolvesInTree("chat/actions")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

const PREFERENCES_FORM = "src/features/profile/settings-form.tsx";

/** `quietStart` → `quiet_start`. The form speaks camelCase; the schema does not. */
function toColumn(field: string): string {
  return field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * The controls the preferences interface actually offers.
 *
 * Hidden inputs are removed first, and that is a distinction rather than an
 * exemption: `<input type="hidden" name="locale">` carries the current route
 * back to the Server Action and is not a control offered to anyone. `R-24` is
 * about what the surface *offers*. The planted case below proves the removal
 * does not swallow a real control along with it.
 */
function renderedControlNames(source: string): string[] {
  const withoutHidden = source.replace(/<input[^>]*type="hidden"[^>]*\/>/g, "");
  return [...new Set([...withoutHidden.matchAll(/\bname="([A-Za-z][A-Za-z0-9]*)"/g)].map((match) => match[1]))];
}

/**
 * Widened to `string` deliberately.
 *
 * `capabilityRegistry` is `as const`, so an inferred `Set` would carry the union
 * of the column names it already contains — and `has()` would then only accept
 * a name already in the registry, which is the exact question this guard exists
 * to ask. The membership test has to be able to receive a name that is *not* a
 * member, or the planted control below could not be written at all.
 */
const GOVERNED_COLUMNS: ReadonlySet<string> = new Set<string>(
  capabilityRegistry.flatMap((capability) => capability.columns),
);

/**
 * The non-column half, widened for the same reason `GOVERNED_COLUMNS` is.
 *
 * `2O-PREF-008` put two controls in the centre that set no column at all — the
 * appearance choice and the onboarding restore — so a guard that could only
 * resolve a control to a column would have had to exempt them.
 */
const GOVERNED_CONTROLS: ReadonlySet<string> = new Set<string>(
  capabilityRegistry.flatMap((capability) => capability.controls),
);

/**
 * `2O-PREF-008`: **the whole preferences centre**, not one file.
 *
 * The list is **derived from the settings page's own JSX**, so a component
 * mounted there without a row cannot escape by not being listed here — which is
 * exactly how `OnboardingRestore` went uncovered between slices 2O.2 and 2O.3.
 * A hand-written array would have needed someone to remember to extend it, and
 * §79 records that nobody did.
 */
const SETTINGS_PAGE = "src/app/[locale]/app/settings/page.tsx";

function centreControlSources(): readonly string[] {
  const page = readFileSync(join(REPO, SETTINGS_PAGE), "utf8");
  const mounted = new Set([...page.matchAll(/<([A-Z][A-Za-z]*)\b/g)].map((match) => match[1]));
  const imports = [...page.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)];
  const files: string[] = [];
  for (const [, names, specifier] of imports) {
    if (!specifier.startsWith("@/")) continue;
    if (!names.split(",").some((name) => mounted.has(name.trim()))) continue;
    const relative = specifier.replace(/^@\//, "src/");
    for (const candidate of [`${relative}.tsx`, `${relative}.ts`]) {
      if (existsSync(join(REPO, candidate))) {
        files.push(candidate);
        break;
      }
    }
  }
  return files;
}

describe("2O-ACTIVATION-005 direction B: a rendered control may not exist without a row", () => {
  const controls = renderedControlNames(readFileSync(join(REPO, PREFERENCES_FORM), "utf8"));

  it("governs every control the preferences form renders", () => {
    for (const field of controls) {
      const column = toColumn(field);
      expect(
        GOVERNED_COLUMNS.has(column),
        `${PREFERENCES_FORM} renders \`${field}\` (\`${column}\`) and no capability row governs it`,
      ).toBe(true);
    }
  });

  /**
   * `2O-PREF-008`, and the obligation slice 2O.2 created and §79 recorded.
   *
   * The scan reaches every component the settings page mounts, and each control
   * must resolve **either** to a governed column **or** to a governed control
   * name. A control that resolves to neither fails, which is the whole point: it
   * is a preference the product offers and the registry has never heard of.
   */
  it("governs every control in the whole centre, not only the form", () => {
    const sources = centreControlSources();
    // Non-vacuous, in the direction that matters: the derivation really did find
    // the page's mounted components, including the two that govern no column.
    expect(sources, "the settings page's mounts were not resolved").toContain(PREFERENCES_FORM);
    expect(sources).toContain("src/features/appearance/appearance-control.tsx");
    expect(sources).toContain("src/features/onboarding/onboarding-restore.tsx");

    let seen = 0;
    for (const path of sources) {
      for (const field of renderedControlNames(readFileSync(join(REPO, path), "utf8"))) {
        seen += 1;
        expect(
          GOVERNED_COLUMNS.has(toColumn(field)) || GOVERNED_CONTROLS.has(field),
          `${path} renders \`${field}\` and no capability row governs it`,
        ).toBe(true);
      }
    }
    expect(seen, "no control was extracted from the centre at all").toBeGreaterThan(14);
  });

  it("resolves the two non-column controls through `controls`, not through `columns`", () => {
    // Stated separately so the mechanism is visible: if either ever acquired a
    // column, this fails and the row has to say so.
    for (const control of ["appearance", "restoreOnboarding"]) {
      expect(GOVERNED_CONTROLS.has(control), `${control} has no row`).toBe(true);
      expect(GOVERNED_COLUMNS.has(toColumn(control)), `${control} unexpectedly has a column`).toBe(false);
    }
  });

  it("rejects a control in the centre that no row governs, by either anchor", () => {
    const planted = renderedControlNames('<input name="favouriteTheme" />');
    expect(planted).toEqual(["favouriteTheme"]);
    expect(GOVERNED_COLUMNS.has(toColumn("favouriteTheme"))).toBe(false);
    expect(GOVERNED_CONTROLS.has("favouriteTheme")).toBe(false);
  });

  it("is non-vacuous: the form really does render the controls it is known to render", () => {
    // A regex that stopped matching would make the assertion above pass over an
    // empty list, which is the failure this whole file is shaped around.
    expect(controls.length).toBeGreaterThanOrEqual(10);
    for (const known of ["timezone", "agentName", "quietStart", "chatModel", "aiProfile"]) {
      expect(controls, `${known} is no longer extracted from the form`).toContain(known);
    }
  });

  it("does not extract the hidden routing field as a control", () => {
    expect(controls).not.toContain("locale");
  });

  it("rejects a planted control that no row governs", () => {
    const planted = renderedControlNames(
      '<select id="x" name="autonomyLevel"></select><input type="hidden" name="locale" />',
    );
    expect(planted).toEqual(["autonomyLevel"]);
    // `autonomy_level` is one of the nine: it has a row, and the row governs it
    // — so the *column* is known. What must fail is the control existing at all,
    // which is `2O-ACTIVATION-007`'s assertion below rather than this one. The
    // genuinely ungoverned case is a column no row names.
    const unknown = renderedControlNames('<input name="favouriteColour" />');
    expect(unknown).toEqual(["favouriteColour"]);
    expect(GOVERNED_COLUMNS.has(toColumn("favouriteColour"))).toBe(false);
  });

  it("keeps the hidden-input removal from swallowing a real control beside it", () => {
    const mixed = renderedControlNames(
      '<input type="hidden" name="locale" /><input name="quietStart" type="time" />',
    );
    expect(mixed).toEqual(["quietStart"]);
  });
});

/* -------------------------------------------------------------------------- */

describe("2O-ACTIVATION-004: the registry is load-bearing", () => {
  it("is read by a product surface, not only by its own test", () => {
    const readers = SOURCES.paths.filter((path) => {
      if (path.endsWith("src/features/shell/capabilities.ts")) return false;
      const source = readFileSync(join(REPO, path), "utf8");
      return /getCapabilityRegistryView|\bcapabilityRegistry\b/.test(source);
    });
    expect(readers, "no product file reads the capability registry").not.toEqual([]);
    expect(readers).toContain("src/features/shell/capability-summary.tsx");
  });

  it("reaches a page, so a stale row changes what a user sees", () => {
    // A component nothing mounts is not a consumer either. This is the second
    // half of "load-bearing" and the reason the first half alone is not enough.
    const page = readFileSync(join(REPO, "src/app/[locale]/app/settings/page.tsx"), "utf8");
    expect(page).toContain("CapabilitySummary");
    expect(page).toMatch(/from "@\/features\/shell\/capability-summary"/);
  });

  it("renders exactly the visible settings rows", () => {
    // The property that makes a stale row observable. Asserted here as well as
    // in the component's own test, because this is the file a future author
    // reads when they wonder whether the registry still governs anything.
    const visible = capabilityRegistry.filter((item) => item.surface === "settings" && item.visible);
    expect(visible.length).toBeGreaterThan(0);
    const copy = readFileSync(join(REPO, "src/features/shell/capability-copy.ts"), "utf8");
    for (const capability of visible) {
      expect(copy, `${capability.key} is rendered with no copy`).toContain(`${capability.key}:`);
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("2O-ACTIVATION-006 → 2O-PREF-004: `scheduled_reviews` reaches its final wording", () => {
  const row = capabilityRegistry.find((item) => item.key === "scheduled_reviews");

  /**
   * **Inverted by slice 2O.3, not deleted.** Superseded form, quoted:
   *
   * > ``expect(row!.state, "`future` cannot be told from `no control`")
   * > .toBe("uncontrolled")``
   *
   * `2O-ACTIVATION-006` set this row to `uncontrolled` — real consumers, no
   * authorized control — and said in as many words that its **final wording and
   * `visible` value belong to `2O-PREF-004`**. Slice 2O.3 built the three
   * controls `OD-2O-6` **A** signed, so `uncontrolled` became the false reading
   * and would now be the ambiguity rather than the cure.
   *
   * The failure being prevented is unchanged — the registry disagreeing with
   * the tree about what the owner can control. Only the direction moved.
   */
  it("exists, names its real consumer, and now says it is controlled", () => {
    expect(row, "the scheduled_reviews row is gone").toBeDefined();
    expect(row!.state, "the controls ship — `uncontrolled` is now false").toBe("operational");
    expect(row!.visible, "its controls are visible, so the row must be too").toBe(true);
    expect(row!.consumerEvidence.length).toBeGreaterThan(0);
    for (const token of row!.consumerEvidence) {
      expect(resolvesInTree(token), `${token} resolves to nothing`).toBe(true);
    }
  });

  it("has the controls that justify the change, in the form itself", () => {
    // The other half. A row claiming `operational` while the form offers
    // nothing would be the mirror of the state this inversion just left.
    const form = readFileSync(join(REPO, "src/features/profile/settings-form.tsx"), "utf8");
    for (const field of ["dailyReviewTime", "weeklyReviewTime", "weeklyReviewDay"]) {
      expect(form, `${field} has no control — the row claims otherwise`).toContain(`name="${field}"`);
    }
  });

  it("names the three columns its consumer actually reads", () => {
    expect([...row!.columns].sort()).toEqual(["daily_review_time", "weekly_review_day", "weekly_review_time"]);
    const schedule = readFileSync(join(REPO, "src/features/day-review/review-schedule.ts"), "utf8");
    for (const field of ["dailyReviewTime", "weeklyReviewTime", "weeklyReviewDay"]) {
      expect(schedule, `${field} is no longer read — reconcile the row`).toContain(field);
    }
  });

  it("keeps `/app/reviews` free to say nothing runs from a schedule", () => {
    // `2O-PREF-006`. The row now says these columns have a consumer, and that
    // must not be read as "a review runs by itself". What they steer is when the
    // surface offers to close the day. If this phase ever schedules anything,
    // this assertion is what forces the copy to be corrected with it.
    const schedule = readFileSync(join(REPO, "src/features/day-review/review-schedule.ts"), "utf8");
    expect(schedule).not.toMatch(/\bcron\b|pg_cron|scheduleJob/i);
  });
});

/* -------------------------------------------------------------------------- */

describe("2O-ACTIVATION-007: the nine consumer-less columns are recorded and uncontrolled", () => {
  const NINE = [
    "ai_provider",
    "autonomy_level",
    "avatar_path",
    "background_model",
    "follow_up_intensity",
    "privacy_default",
    "privacy_preferences",
    "quiet_periods",
    "reasoning_model",
  ] as const;

  it("derives exactly the nine the requirement names", () => {
    expect([...consumerlessPreferenceColumns].sort()).toEqual([...NINE]);
  });

  it("keeps every one of them a real column, so the list cannot go stale silently", () => {
    // `OD-2O-7` **A** keeps the columns. A row naming a column that was dropped
    // would be a record of nothing, and the guard would go on passing.
    const types = readFileSync(join(REPO, "src/lib/supabase/database.types.ts"), "utf8");
    for (const column of NINE) {
      expect(types, `${column} is no longer in the schema`).toMatch(new RegExp(`\\n\\s+${column}:`));
    }
    // Non-vacuous: the pattern really does distinguish a present column from an
    // absent one.
    expect(types).not.toMatch(/\n\s+column_that_was_never_added:/);
  });

  it("offers none of them a control", () => {
    // `R-24` and `OD-2O-7` **A** together. The preferences form is the interface;
    // a field for any of the nine is the failure.
    const form = readFileSync(join(REPO, PREFERENCES_FORM), "utf8");
    const controls = renderedControlNames(form).map(toColumn);
    for (const column of NINE) {
      expect(controls, `${column} has a control`).not.toContain(column);
    }
    // Non-vacuous: the extraction really produced the form's controls.
    expect(controls).toContain("timezone");
  });

  it("keeps all nine invisible, so none reaches the preferences interface", () => {
    for (const capability of capabilityRegistry) {
      if (capability.columns.some((column) => (NINE as readonly string[]).includes(column))) {
        expect(capability.visible, `${capability.key} is rendered`).toBe(false);
        expect(capability.state, `${capability.key} claims a consumer`).toBe("future");
      }
    }
  });

  it("keeps `planning_day` and `planning_time` retired, and gives them no row either", () => {
    // `R-2O-13`. They are not among the nine — `2M-AUDIT-005` retired them by
    // decision rather than for want of a consumer — and this phase does not
    // reverse a signed outcome by quietly cataloguing them into scope.
    expect(consumerlessPreferenceColumns).not.toContain("planning_day");
    expect(consumerlessPreferenceColumns).not.toContain("planning_time");
    const form = readFileSync(join(REPO, PREFERENCES_FORM), "utf8");
    expect(form).not.toContain("planningDay");
    expect(form).not.toContain("planningTime");
  });

  /**
   * `2O-AICONFIG-004` delivers the row, and the half that mattered is unchanged.
   *
   * *(Inverted in part by slice 2O.4, and kept rather than deleted.)* Two things
   * were asserted here, and only one of them was about `R-2O-13b`.
   *
   * **`embedding_model` is still not one of the nine**, and that is the claim
   * ADR-117 forbids getting wrong: it has four behavioural readers, so recording
   * it as consumer-less would be the false statement. That assertion is
   * untouched below.
   *
   * The second — *"no row names it at all"* — expressed slice 2O.0's deliberate
   * **absence**, and `2O-ACTIVATION-006` said in as many words that the row was
   * `2O-AICONFIG-004`'s. It is now satisfied rather than broken, so it inverts:
   * the row must exist, must be `uncontrolled`, and must still be outside the
   * nine.
   *
   * *Superseded form, retained:* `expect(capabilityRegistry.flatMap((item) =>
   * item.columns)).not.toContain("embedding_model")`.
   */
  it("gives `embedding_model` its row and still keeps it out of the nine", () => {
    // Unchanged, and the reason it is unchanged: `consumerlessPreferenceColumns`
    // derives from `future` + no evidence, and this column has readers.
    expect(consumerlessPreferenceColumns).not.toContain("embedding_model");

    const row = capabilityRegistry.find((item) =>
      (item.columns as readonly string[]).includes("embedding_model"),
    );
    expect(row, "`2O-AICONFIG-004` requires a row recording why there is no control").toBeDefined();
    expect(row!.state).toBe("uncontrolled");
    expect(row!.visible, "a row for a column nobody can change is not a rendered promise").toBe(false);
    expect(row!.controls, "`R-2O-13b` forbids a control").toEqual([]);
    expect(row!.consumerEvidence.length, "never `no consumer`, which would be false").toBeGreaterThan(0);
  });

  it("offers no input for `embedding_model` anywhere in the preferences centre", () => {
    /*
     * `R-2O-13b`, asserted against the rendered form rather than against the
     * registry, because the registry is what the row *says* and this is what the
     * page *does*. The same shape `planning_day` and `planning_time` are held to
     * one test above.
     */
    for (const path of [PREFERENCES_FORM, "src/app/[locale]/app/settings/page.tsx"]) {
      const source = readFileSync(join(REPO, path), "utf8");
      expect(source, `${path} renders an embedding control`).not.toMatch(/name="embeddingModel"/);
      expect(source, `${path} names the column`).not.toContain("embedding_model");
    }
  });

  it("does not remove, rename or re-default the column ADR-117 protects", () => {
    // ADR-117 Decision 4. The absence of a control is not a licence to tidy the
    // schema, and the tidying would most plausibly arrive as part of this slice's
    // catalogue work.
    const types = readFileSync(join(REPO, "src/lib/supabase/database.types.ts"), "utf8");
    expect(types).toMatch(/\n\s+embedding_model:/);
    const migrations = readdirSync(join(REPO, "supabase", "migrations"));
    expect(migrations.filter((name) => /phase[_-]?2o/i.test(name))).toEqual([]);
  });
});
