import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { historyCopy } from "./copy";
import {
  actionTypesInCategory,
  asHistoryActionType,
  asHistoryActor,
  asHistoryCategory,
  asHistoryEntityType,
  HISTORY_ACTION_CATEGORY,
  HISTORY_ACTION_TYPES,
  HISTORY_CATEGORIES,
  HISTORY_ENTITY_TYPES,
} from "./vocabulary";

/**
 * Reads what the migrations actually write into `audit_logs`.
 *
 * This is the same technique `task-detail-view.test.tsx` uses for the task
 * subset, widened to every entity type. It parses the column list and the value
 * list of each `insert` and pairs them positionally, rather than grepping for
 * quoted strings, because the payload `jsonb_build_object(…)` calls are full of
 * literals that are not action types.
 */
function writersInMigrations(): { actions: Set<string>; entities: Set<string> } {
  const directory = join(process.cwd(), "supabase", "migrations");
  const actions = new Set<string>();
  const entities = new Set<string>();

  for (const file of readdirSync(directory).filter((name) => name.endsWith(".sql"))) {
    const sql = readFileSync(join(directory, file), "utf8");
    const statements = sql.matchAll(/insert\s+into\s+public\.audit_logs\s*\(([^)]*)\)\s*values\s*\(/gi);

    for (const statement of statements) {
      const columns = statement[1].split(",").map((column) => column.trim());
      const start = (statement.index ?? 0) + statement[0].length;

      // Walk to the matching close paren, so nested calls do not end the list.
      let depth = 1;
      let index = start;
      let body = "";
      while (index < sql.length && depth > 0) {
        const character = sql[index];
        if (character === "(") depth += 1;
        else if (character === ")") depth -= 1;
        if (depth > 0) body += character;
        index += 1;
      }

      const values: string[] = [];
      let current = "";
      let nesting = 0;
      let quoted = false;
      for (const character of body) {
        if (character === "'") quoted = !quoted;
        if (!quoted && character === "(") nesting += 1;
        if (!quoted && character === ")") nesting -= 1;
        if (!quoted && character === "," && nesting === 0) {
          values.push(current.trim());
          current = "";
        } else current += character;
      }
      values.push(current.trim());

      const literal = (column: string) => {
        const position = columns.indexOf(column);
        if (position < 0) return null;
        return /^'([^']+)'$/.exec(values[position] ?? "")?.[1] ?? null;
      };

      const action = literal("action_type");
      if (action !== null) actions.add(action);
      const entity = literal("entity_type");
      if (entity !== null) entities.add(entity);
    }
  }

  return { actions, entities };
}

describe("history vocabulary", () => {
  it("has copy in both locales for every action type the migrations write", () => {
    const { actions } = writersInMigrations();
    expect(actions.size, "no audit_logs inserts were found to check").toBeGreaterThan(0);

    const missing = [...actions].filter((action) => !HISTORY_ACTION_TYPES.includes(action as never));
    expect(
      missing.sort(),
      `these action types would render as the neutral fallback: ${missing.join(", ")}`,
    ).toEqual([]);

    for (const locale of ["pt-BR", "en"] as const) {
      const covered = Object.keys(historyCopy[locale].actions).sort();
      expect(covered, `${locale} is missing action copy`).toEqual([...HISTORY_ACTION_TYPES].sort());
    }
  });

  it("has copy in both locales for every entity type the migrations write", () => {
    const { entities } = writersInMigrations();
    const missing = [...entities].filter(
      (entity) => !HISTORY_ENTITY_TYPES.includes(entity as never),
    );
    expect(missing.sort(), `unmapped entity types: ${missing.join(", ")}`).toEqual([]);

    for (const locale of ["pt-BR", "en"] as const) {
      expect(Object.keys(historyCopy[locale].entityTypes).sort()).toEqual(
        [...HISTORY_ENTITY_TYPES].sort(),
      );
    }
  });

  it("covers the four action types written from TypeScript rather than SQL", () => {
    // `chat/actions.ts`, `entities/actions.ts` (×2) and `memories/actions.ts`
    // insert directly, so the migration scan above cannot see them.
    for (const action of [
      "chat_answered",
      "update_project",
      "update_person",
      "create_memory",
      "update_memory",
      "archive_memory",
      "restore_memory",
    ] as const) {
      expect(HISTORY_ACTION_TYPES).toContain(action);
      expect(historyCopy["pt-BR"].actions[action]).toBeTruthy();
      expect(historyCopy.en.actions[action]).toBeTruthy();
    }
  });

  it("assigns every action type to exactly one category, and no category is empty", () => {
    for (const action of HISTORY_ACTION_TYPES) {
      expect(HISTORY_CATEGORIES).toContain(HISTORY_ACTION_CATEGORY[action]);
    }
    for (const category of HISTORY_CATEGORIES) {
      expect(actionTypesInCategory(category).length, `${category} has no actions`).toBeGreaterThan(0);
    }
  });

  it("never renders a raw token: unknown values narrow to null or to the safe actor", () => {
    expect(asHistoryActionType("some_future_action")).toBeNull();
    expect(asHistoryEntityType("widget")).toBeNull();
    expect(asHistoryCategory("everything")).toBeNull();
    // The actor is the one field with a database check constraint, and the one
    // where a leaked token would be least acceptable, so it folds to `system`.
    expect(asHistoryActor("root")).toBe("system");
    expect(asHistoryActor("agent")).toBe("agent");
  });

  it("keeps both locales structurally identical", () => {
    const shape = (locale: "pt-BR" | "en") => ({
      actors: Object.keys(historyCopy[locale].actors).sort(),
      categories: Object.keys(historyCopy[locale].categories).sort(),
      fields: Object.keys(historyCopy[locale].fields).sort(),
      taskStatuses: Object.keys(historyCopy[locale].taskStatuses).sort(),
      projectStatuses: Object.keys(historyCopy[locale].projectStatuses).sort(),
      taskPriorities: Object.keys(historyCopy[locale].taskPriorities).sort(),
    });
    expect(shape("pt-BR")).toEqual(shape("en"));
  });
});

describe("UX-28 — `reason` is not rendered, and that conclusion is pinned", () => {
  it("no history module reads audit_logs.reason", () => {
    // The decision is that every `reason` any current writer produces merely
    // restates the localized sentence. This asserts the code matches it.
    const directory = join(process.cwd(), "src", "features", "history");
    for (const file of readdirSync(directory).filter((name) => /\.tsx?$/.test(name))) {
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
      const source = readFileSync(join(directory, file), "utf8");
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, `${file} selects or renders reason`).not.toMatch(/\breason\b/);
    }
  });

  it("the page route no longer selects reason either", () => {
    const route = readFileSync(
      join(process.cwd(), "src", "app", "[locale]", "app", "history", "page.tsx"),
      "utf8",
    );
    expect(route.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/reason/);
  });
});
