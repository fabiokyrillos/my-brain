import { readFileSync, readdirSync } from "node:fs";
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

describe("2O-ACTIVATION-006: `scheduled_reviews` is no longer readable two ways", () => {
  const row = capabilityRegistry.find((item) => item.key === "scheduled_reviews");

  it("exists and names the consumer it really has", () => {
    expect(row, "the scheduled_reviews row is gone").toBeDefined();
    expect(row!.state, "`future` cannot be told from `no control`").toBe("uncontrolled");
    expect(row!.consumerEvidence.length).toBeGreaterThan(0);
    for (const token of row!.consumerEvidence) {
      expect(resolvesInTree(token), `${token} resolves to nothing`).toBe(true);
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

  it("keeps `embedding_model` out of the nine, because it has six consumers", () => {
    // `R-2O-13b` / ADR-117. It is **not** consumer-less, so recording it here
    // would be the false claim the ADR forbids. Its row is `2O-AICONFIG-004`'s
    // work in slice 2O.4 and is deliberately absent from this slice.
    expect(consumerlessPreferenceColumns).not.toContain("embedding_model");
    expect(capabilityRegistry.flatMap((item) => item.columns)).not.toContain("embedding_model");
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
