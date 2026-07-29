/**
 * Phase 2F pre-code Gate 2 — exhaustive writer inventory for `public.tasks` and
 * `public.reminders`.
 *
 * **This is a validation artifact, not product code.** It reads the repository
 * and prints an inventory; it opens no network connection, needs no credentials,
 * and writes nothing outside stdout. Run it before Phase 2F Slice 2F.2 and again
 * before 2F.4, because its whole purpose is to make the revocation blast radius
 * (adversarial review F5) a measured set rather than a remembered one.
 *
 * Two populations are collected and they are not the same question:
 *
 * 1. **Client-role writers** — TypeScript/JS that reaches `tasks`/`reminders`
 *    through PostgREST. These are the rows a `revoke ... from authenticated`
 *    can break. The runtime role is inferred from which key constructs the
 *    client, because that is what the grant check actually sees.
 * 2. **In-database writers** — SQL functions and triggers holding DML. A
 *    `SECURITY DEFINER` function is *unaffected* by revoking table grants from
 *    `authenticated` (it executes as its owner), which is precisely why routing
 *    writes through them is what makes the revocation survivable. They are
 *    inventoried anyway: they are the destination contracts, and a trigger that
 *    writes on behalf of a revoked role is the one shape that could still break.
 *
 * Function declarations are resolved to their **last** declaration in migration
 * order, because `create or replace` means an earlier file's body is history.
 * Reporting every historical declaration would inflate the inventory with bodies
 * no database has executed since the day they were superseded.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const TABLES = ["tasks", "reminders"];

/** Directories swept for client-role writers, in the order the report prints them. */
const CLIENT_ROOTS = ["src", "scripts", "e2e", "supabase/functions"];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

/**
 * The runtime role a Supabase client call executes as.
 *
 * Inferred from the identifier the call chains off, resolved against how that
 * identifier was constructed in the same file. This is deliberately syntactic:
 * a wrong guess here is visible in the report and correctable by a reader, while
 * a clever inference that silently mislabels `admin` as `authenticated` would
 * hide exactly the rows Gate 2 exists to surface.
 */
function inferRole(source, receiver) {
  if (!receiver) return "unknown";
  const base = receiver.split(".")[0];
  if (/^(admin|serviceClient|service)$/i.test(base)) return "service_role";
  const construction = new RegExp(
    `(?:const|let|var)\\s+${base}\\s*=\\s*createClient\\(([^)]*)\\)`,
    "s",
  ).exec(source);
  if (construction) {
    if (/serviceRoleKey|SERVICE_ROLE/i.test(construction[1])) return "service_role";
    if (/publishableKey|anonKey|PUBLISHABLE|ANON/i.test(construction[1])) return "authenticated*";
  }
  if (/createClient\(\)/.test(source) && /@\/lib\/supabase\/server/.test(source)) return "authenticated";
  return "authenticated*";
}

const WRITE_OPS = ["insert", "update", "delete", "upsert"];

function sweepClientWriters() {
  const rows = [];
  for (const rootName of CLIENT_ROOTS) {
    for (const file of walk(join(ROOT, rootName))) {
      if (!/\.(ts|tsx|mjs|js)$/.test(file)) continue;
      const source = readFileSync(file, "utf8");
      for (const table of TABLES) {
        const pattern = new RegExp(
          `([A-Za-z_$][\\w$.]*)\\s*\\n?\\s*\\.from\\(["']${table}["']\\)\\s*\\n?\\s*\\.(\\w+)\\(`,
          "g",
        );
        let match;
        while ((match = pattern.exec(source)) !== null) {
          const [, receiver, op] = match;
          if (!WRITE_OPS.includes(op)) continue;
          rows.push({
            file: relative(ROOT, file).replace(/\\/g, "/"),
            line: source.slice(0, match.index).split("\n").length,
            symbol: enclosingSymbol(source, match.index),
            table,
            op,
            role: inferRole(source, receiver),
            isTest: /\.test\.|\.spec\./.test(file),
          });
        }
      }
    }
  }
  return rows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** The nearest preceding function/const declaration, for a human-readable anchor. */
function enclosingSymbol(source, index) {
  const before = source.slice(0, index);
  const matches = [
    ...before.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g),
    ...before.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/g),
  ];
  const last = matches[matches.length - 1];
  return last ? last[1] : "<module scope>";
}

function migrationFiles() {
  return readdirSync(join(ROOT, "supabase", "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

/**
 * SQL functions and triggers holding DML on the two tables, resolved to their
 * last declaration.
 */
function sweepDatabaseWriters() {
  const declarations = new Map();
  const triggers = new Map();

  for (const name of migrationFiles()) {
    const sql = readFileSync(join(ROOT, "supabase", "migrations", name), "utf8");

    const fnPattern = /create\s+(?:or\s+replace\s+)?function\s+((?:public|private)\.\w+)\s*\(/gi;
    const starts = [...sql.matchAll(fnPattern)].map((m) => ({ name: m[1], index: m.index }));
    for (let i = 0; i < starts.length; i += 1) {
      const body = sql.slice(starts[i].index, starts[i + 1]?.index ?? sql.length);
      const ops = new Set();
      for (const table of TABLES) {
        if (new RegExp(`insert\\s+into\\s+public\\.${table}\\b`, "i").test(body)) ops.add(`${table}:insert`);
        if (new RegExp(`update\\s+public\\.${table}\\b`, "i").test(body)) ops.add(`${table}:update`);
        if (new RegExp(`delete\\s+from\\s+public\\.${table}\\b`, "i").test(body)) ops.add(`${table}:delete`);
      }
      if (ops.size === 0) {
        // Still record the declaration so a later body-less re-declaration does
        // not leave a stale "writes tasks" claim attached to the function.
        if (declarations.has(starts[i].name)) declarations.set(starts[i].name, { file: name, ops: new Set(), definer: /security\s+definer/i.test(body) });
        continue;
      }
      declarations.set(starts[i].name, {
        file: name,
        ops,
        definer: /security\s+definer/i.test(body),
      });
    }

    const trgPattern = /create\s+trigger\s+(\w+)\s+([\s\S]{0,160}?)execute\s+function\s+([\w.]+)/gi;
    let trg;
    while ((trg = trgPattern.exec(sql)) !== null) {
      const [, trigger, clause, fn] = trg;
      if (!/on\s+public\.(tasks|reminders)/i.test(clause)) continue;
      triggers.set(trigger, {
        file: name,
        on: /on\s+public\.(\w+)/i.exec(clause)?.[1] ?? "?",
        timing: clause.replace(/\s+/g, " ").trim().slice(0, 60),
        fn,
      });
    }
  }

  const writers = [...declarations.entries()]
    .filter(([, value]) => value.ops.size > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  return { writers, triggers: [...triggers.entries()].sort(([a], [b]) => a.localeCompare(b)) };
}

/** pgTAP scenarios that assume a client role can write, the F5 blast radius in tests. */
function sweepPgTap() {
  const dir = join(ROOT, "supabase", "tests");
  const rows = [];
  for (const file of walk(dir)) {
    if (!file.endsWith(".sql")) continue;
    const sql = readFileSync(file, "utf8");
    const lines = sql.split("\n");
    let role = null;
    lines.forEach((line, i) => {
      const roleMatch = /set\s+local\s+role\s+(\w+)/i.exec(line);
      if (roleMatch) role = roleMatch[1];
      if (/reset\s+role/i.test(line)) role = null;
      for (const table of TABLES) {
        if (new RegExp(`(insert\\s+into|update|delete\\s+from)\\s+public\\.${table}\\b`, "i").test(line)) {
          rows.push({
            file: relative(ROOT, file).replace(/\\/g, "/"),
            line: i + 1,
            table,
            role: role ?? "<session default>",
            statement: line.trim().slice(0, 90),
          });
        }
      }
    });
  }
  return rows;
}

function table(rows, columns) {
  const widths = columns.map((c) => Math.max(c.header.length, ...rows.map((r) => String(c.get(r) ?? "").length)));
  const line = (cells) => `| ${cells.map((cell, i) => String(cell ?? "").padEnd(widths[i])).join(" | ")} |`;
  return [
    line(columns.map((c) => c.header)),
    `|${widths.map((w) => "-".repeat(w + 2)).join("|")}|`,
    ...rows.map((row) => line(columns.map((c) => c.get(row)))),
  ].join("\n");
}

const clientWriters = sweepClientWriters();
const { writers: dbWriters, triggers } = sweepDatabaseWriters();
const pgtap = sweepPgTap();

console.log("# Gate 2 — writer inventory for public.tasks and public.reminders\n");
console.log(`Generated from repository source. Client roots: ${CLIENT_ROOTS.join(", ")}.`);
console.log("Role marked `authenticated*` is inferred from client construction; verify before revoking.\n");

console.log(`## 1. Client-role writers (${clientWriters.length})\n`);
console.log("These are the rows a table-grant revocation can break.\n");
console.log(table(clientWriters, [
  { header: "File", get: (r) => `${r.file}:${r.line}` },
  { header: "Symbol", get: (r) => r.symbol },
  { header: "Table", get: (r) => r.table },
  { header: "Op", get: (r) => r.op },
  { header: "Role", get: (r) => r.role },
  { header: "Test?", get: (r) => (r.isTest ? "yes" : "no") },
]));

console.log(`\n## 2. In-database writers, last declaration only (${dbWriters.length})\n`);
console.log("SECURITY DEFINER functions execute as owner and are unaffected by revoking");
console.log("table grants from `authenticated`. They are the destination contracts.\n");
console.log(table(dbWriters, [
  { header: "Function", get: ([name]) => name },
  { header: "Last declared in", get: ([, v]) => v.file },
  { header: "DML", get: ([, v]) => [...v.ops].join(", ") },
  { header: "Definer?", get: ([, v]) => (v.definer ? "yes" : "NO — invoker") },
]));

console.log(`\n## 3. Triggers on tasks/reminders (${triggers.length})\n`);
console.log(table(triggers, [
  { header: "Trigger", get: ([name]) => name },
  { header: "On", get: ([, v]) => v.on },
  { header: "Executes", get: ([, v]) => v.fn },
  { header: "Declared in", get: ([, v]) => v.file },
]));

console.log(`\n## 4. pgTAP statements touching tasks/reminders (${pgtap.length})\n`);
console.log(table(pgtap, [
  { header: "File", get: (r) => `${r.file}:${r.line}` },
  { header: "Table", get: (r) => r.table },
  { header: "Role in effect", get: (r) => r.role },
  { header: "Statement", get: (r) => r.statement },
]));

const breakers = clientWriters.filter((r) => r.role.startsWith("authenticated"));
console.log(`\n## 5. Revocation blast radius\n`);
console.log(`${breakers.length} client-role writer(s) execute as \`authenticated\` and would break on revocation:\n`);
for (const row of breakers) {
  console.log(`- ${row.file}:${row.line} — \`${row.symbol}\` — ${row.table}.${row.op}${row.isTest ? " (test/fixture)" : ""}`);
}
