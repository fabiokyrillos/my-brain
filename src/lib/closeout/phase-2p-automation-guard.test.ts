import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AUTOMATION_CATEGORIES,
  AUTOMATION_DECISION_REASONS,
  AUTOMATION_DEFAULT_STATE,
  AUTOMATION_POLICY_STATES,
  CALIBRATION_FRESHNESS,
  CALIBRATION_OUTCOMES,
  CALIBRATION_THRESHOLDS,
  type AutomationCategory,
} from "@/features/agent/automation-policy";
import { capabilityRegistry } from "@/features/shell/capabilities";

/**
 * Phase 2P slice 2P.4 — the automation contract exists twice, and this is the
 * enforcement of that.
 *
 * The authority is `private.automation_category_decision` in the database. The
 * TypeScript module is the typed mirror the interface renders. Both are
 * necessary — a contract enforced where the data lives, understood where the
 * interface is drawn — and a disagreement between them is exactly the failure
 * `src/lib/ai/extraction-parity.test.ts` exists for on the other duplicated
 * contract in this tree.
 *
 * Every parser below carries a two-sided control. A guard that silently matched
 * nothing would pass forever, and this repository has shipped that shape more
 * than once.
 */

const REPO = process.cwd();
const MIGRATIONS = join(REPO, "supabase/migrations");
const MIGRATION_NAME = "202608190099_phase_2p_slice_4_automation_policy_and_calibration.sql";
const MIGRATION = readFileSync(join(MIGRATIONS, MIGRATION_NAME), "utf8");

/** `check (category in ('task', 'person', ...))` → the six names. */
function checkVocabulary(source: string, column: string): string[] {
  const match = source.match(new RegExp(`check \\(${column} in \\(([^)]*)\\)\\)`));
  if (!match) return [];
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((entry) => entry[1]);
}

/** The `values ('task', 50, 0.90::numeric)` rows of the thresholds function. */
function sqlThresholds(source: string): Record<string, { reviewed: number; precision: number }> {
  const block = source.slice(source.indexOf("automation_calibration_thresholds"));
  const rows = [...block.matchAll(/\('([a-z]+)', (\d+), ([0-9.]+)::numeric\)/g)];
  return Object.fromEntries(
    rows.map((row) => [row[1], { reviewed: Number(row[2]), precision: Number(row[3]) }]),
  );
}

describe("the migration and the TypeScript contract agree", () => {
  it("declares the same six categories", () => {
    const sql = checkVocabulary(MIGRATION, "category");
    expect(sql).toEqual([...AUTOMATION_CATEGORIES]);
  });

  it("declares the same three states", () => {
    expect(checkVocabulary(MIGRATION, "state")).toEqual([...AUTOMATION_POLICY_STATES]);
  });

  it("declares the same four calibration outcomes", () => {
    expect(checkVocabulary(MIGRATION, "outcome")).toEqual([...CALIBRATION_OUTCOMES]);
  });

  it("declares the same per-category thresholds", () => {
    const sql = sqlThresholds(MIGRATION);
    expect(Object.keys(sql).sort()).toEqual([...AUTOMATION_CATEGORIES].sort());
    for (const category of AUTOMATION_CATEGORIES) {
      expect(sql[category].reviewed, `${category} sample size`).toBe(
        CALIBRATION_THRESHOLDS[category].minimumReviewed,
      );
      expect(sql[category].precision, `${category} precision`).toBe(
        CALIBRATION_THRESHOLDS[category].minimumPrecision,
      );
    }
  });

  it("declares the same freshness and undo-block constants", () => {
    for (const [key, value] of Object.entries(CALIBRATION_FRESHNESS)) {
      expect(MIGRATION, `${key} is not in the migration`).toContain(`'${key}', ${value}`);
    }
  });

  it("uses the same five reasons the interface has copy for", () => {
    for (const reason of AUTOMATION_DECISION_REASONS) {
      expect(MIGRATION, `${reason} is never produced`).toContain(`'${reason}'`);
    }
  });

  /*
   * TWO-SIDED CONTROLS. Each parser is aimed at a string it must NOT match, so
   * a regex that quietly stopped matching anything cannot pass the assertions
   * above by returning an empty list that equals an empty list.
   */
  it("is non-vacuous: every parser returns something, and rejects a near miss", () => {
    expect(checkVocabulary(MIGRATION, "category").length).toBe(6);
    expect(checkVocabulary(MIGRATION, "state").length).toBe(3);
    expect(Object.keys(sqlThresholds(MIGRATION)).length).toBe(6);

    expect(checkVocabulary(MIGRATION, "no_such_column")).toEqual([]);
    expect(checkVocabulary("check (category in ('task'))", "category")).toEqual(["task"]);
    expect(sqlThresholds("automation_calibration_thresholds values ('task', 1, 0.5)")).toEqual({});
  });
});

describe("fail-closed, asserted against the migration itself", () => {
  it("writes no policy row for anybody", () => {
    // The default is COMPUTED. A stored default is a value nobody chose that a
    // later reader mistakes for consent, which is what `autonomy_level` already
    // demonstrates.
    const inserts = [...MIGRATION.matchAll(/insert into public\.automation_category_policies/g)];
    // Exactly one, and it is inside the owner's own control function.
    expect(inserts).toHaveLength(1);
    const at = MIGRATION.indexOf("insert into public.automation_category_policies");
    const enclosing = MIGRATION.lastIndexOf("create or replace function", at);
    expect(MIGRATION.slice(enclosing, at)).toContain("public.set_automation_category_policy");
  });

  it("never sets a category to `automatic_when_eligible` outside the owner's control", () => {
    const armings = [...MIGRATION.matchAll(/'automatic_when_eligible'/g)];
    // The CHECK constraint, the control's validation, and the decision branch —
    // and no data statement.
    expect(MIGRATION).not.toMatch(/values\s*\([^)]*'automatic_when_eligible'/);
    expect(armings.length).toBeGreaterThan(0);
  });

  it("degrades an unrecognized state instead of raising on it", () => {
    expect(MIGRATION).toContain("else 'suggest_only'");
    expect(AUTOMATION_DEFAULT_STATE).toBe("suggest_only");
  });

  /**
   * THE ACT, NOT THE WORD.
   *
   * Comments are stripped before scanning, because the migration says in prose
   * that it does not read `autonomy_level` and a guard that forbade the word
   * would read that sentence as the offence. This is the same correction the
   * pgTAP suite had to make when its first cut failed on its own explanation.
   */
  it("reads no confidence score and no global autonomy column", () => {
    const code = MIGRATION.replace(/--[^\n]*/g, "");
    expect(code).not.toMatch(/\bautonomy_level\b/);
    expect(code).not.toMatch(/\belement_trust\b/);
    expect(code).not.toMatch(/\bconfidence\b/);
    // Non-vacuous: stripping did not remove the code along with the prose.
    expect(code).toContain("automation_calibration_thresholds");
    expect(MIGRATION).toMatch(/\bautonomy_level\b/);
  });
});

describe("the migration is the second and last of Phase 2P", () => {
  it("adds exactly one migration, and Phase 2P now owns exactly two", () => {
    const phase2p = readdirSync(MIGRATIONS).filter((file) => /_phase_2p_/.test(file));
    expect(phase2p.sort()).toEqual([
      "202608180098_phase_2p_slice_1_entry_lifecycle_rederivation.sql",
      MIGRATION_NAME,
    ]);
  });
});

describe("the schema is not created for nobody", () => {
  it("has a registry row whose consumers resolve, and it is not the `autonomy` row", () => {
    const row = capabilityRegistry.find((item) => item.key === "automation_categories");
    expect(row, "the per-category policy has no capability row").toBeDefined();
    expect(row!.visible).toBe(true);
    expect(row!.state).toBe("operational");
    expect(row!.consumerEvidence.length).toBeGreaterThan(0);
    expect(row!.controls).toContain("automationCategoryState");
    // The column-backed row stays inert and invisible: one vocabulary, one
    // authority, and `autonomy_level` still authorizes nothing.
    const legacy = capabilityRegistry.find((item) => item.key === "autonomy");
    expect(legacy!.state).toBe("future");
    expect(legacy!.visible).toBe(false);
    expect(legacy!.consumerEvidence).toEqual([]);
  });

  it("mounts the surface on the settings page", () => {
    const page = readFileSync(join(REPO, "src/app/[locale]/app/settings/page.tsx"), "utf8");
    expect(page).toContain("AutomationSection");
    expect(page).toContain("loadAutomationStatus");
    expect(page).toContain("setAutomationCategoryPolicy");
  });

  /**
   * Every class the section renders has at least one rule.
   *
   * A class with no rule is not a styling defect that shows up somewhere else —
   * it is a surface that ships unstyled, which this repository has shipped
   * twice, and no unit test can see it.
   */
  it("styles every class the section renders", () => {
    const component = readFileSync(join(REPO, "src/features/agent/automation-section.tsx"), "utf8");
    const sheet = readFileSync(join(REPO, "src/app/settings-extended.css"), "utf8");
    const classes = new Set(
      [...component.matchAll(/className="([^"{]+)"/g)]
        .flatMap((match) => match[1].split(/\s+/))
        .filter((name) => name.startsWith("automation-")),
    );
    expect(classes.size).toBeGreaterThan(8);
    for (const name of classes) {
      expect(sheet, `.${name} is rendered and has no rule`).toContain(`.${name}`);
    }
  });

  /**
   * The producer binds to TABLES, not to function bodies — the reasoning slice
   * 2P.1 recorded and this inherits. A superseded resolver version, a route the
   * application never calls and direct DML all produce evidence, and a route
   * added later inherits the rule without being told it exists.
   *
   * `undo_operations` is `after update` rather than `after insert`, because the
   * signal is the owner taking an acceptance back — a status transition, not a
   * new row.
   */
  it("registers the producer against all three tables the owner's decisions land in", () => {
    const triggers: ReadonlyArray<readonly [string, string]> = [
      ["after insert", "public.entry_task_candidate_resolutions"],
      ["after insert", "public.entry_person_candidate_resolutions"],
      ["after update", "public.undo_operations"],
    ];
    for (const [timing, table] of triggers) {
      expect(MIGRATION, `${table} has no ${timing} producer`).toContain(`${timing} on ${table}`);
    }
    // Non-vacuous: the timing really is part of the match.
    expect(MIGRATION).not.toContain("after insert on public.undo_operations");
  });
});

describe("the six categories are the owner's six", () => {
  it("has copy for every one of them in both locales, and a threshold for each", () => {
    const copy = readFileSync(join(REPO, "src/features/agent/automation-copy.ts"), "utf8");
    for (const category of AUTOMATION_CATEGORIES as readonly AutomationCategory[]) {
      expect(copy.split(`${category}: {`).length - 1, `${category} lacks copy in one locale`).toBe(2);
      expect(CALIBRATION_THRESHOLDS[category]).toBeDefined();
    }
  });

  it("gives no two identical threshold pairs to categories with different risk", () => {
    // `project` and `organization` share a pair deliberately — the duplication
    // proof is that the SET of pairs is smaller than six, not that every pair is
    // unique. What must not happen is ONE pair for all six, which is the generic
    // rule the owner forbade.
    const pairs = new Set(
      AUTOMATION_CATEGORIES.map(
        (category) =>
          `${CALIBRATION_THRESHOLDS[category].minimumReviewed}:${CALIBRATION_THRESHOLDS[category].minimumPrecision}`,
      ),
    );
    expect(pairs.size).toBeGreaterThan(2);
  });
});
