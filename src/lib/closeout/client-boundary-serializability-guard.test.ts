/**
 * A function may not cross the server → client boundary as a prop.
 *
 * ## The defect this exists to prevent, which it was written after
 *
 * `/pt-BR/app/reviews` and `/pt-BR/app/calendar/plan` — two surfaces slices 2M.2
 * and 2M.3 shipped, merged with CI green, and deployed — **had never rendered.**
 * Both passed a plain arrow function to a `"use client"` component:
 *
 * ```tsx
 * scopeHref={(value) => `/${locale}/app/reviews?scope=${value}`}
 * dayHref={(value) => `/${locale}/app/calendar/plan?date=${value}`}
 * ```
 *
 * React refuses to serialize a function into the RSC payload — *"Functions
 * cannot be passed directly to Client Components unless you explicitly expose
 * it by marking it with `use server`"* — so the render threw and both routes
 * answered with their error boundary. Measured on 2026-08-12 against the
 * deployment and reproduced locally against the same database.
 *
 * **Nothing in the repository could have caught it.** A component test mounts
 * the client component directly and hands it a function, which is entirely valid
 * in that context — `planner-view.test.tsx:66` does exactly that and is correct.
 * Both surfaces' browser lanes compose them with `setContent`, which never runs
 * a server render. The boundary only exists when a real server renders a real
 * page, and until this file no test did.
 *
 * ## Why it resolves the receiving element rather than scanning the file
 *
 * The first version of this guard checked every prop in any server module that
 * imported a client component, and immediately failed on
 * `src/app/[locale]/app/reminders/page.tsx`, which hands two local formatters to
 * a **server** component — legal, shipped, and proved working by
 * `online-reminders.spec.ts`. A guard that fails on correct code is a guard
 * somebody weakens, so the receiving element is resolved instead: a prop is only
 * a finding when the component receiving it is imported from a `"use client"`
 * module.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APP_ROOT = join(process.cwd(), "src", "app");
const SOURCE_ROOT = join(process.cwd(), "src");

function walk(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else found.push(path);
  }
  return found;
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/** `"use client"` as the module's first statement, which is the only place it counts. */
export function isClientModule(source: string): boolean {
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(source);
}

/** Resolves a `@/` or relative import to a file on disk, or `null`. */
function resolveImport(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(SOURCE_ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(fromFile), specifier)
      : null;
  if (base === null) return null;
  for (
    const candidate of [base, `${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")]
  ) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Not this one.
    }
  }
  return null;
}

/** Every named or default import, mapped to the module specifier it came from. */
export function importedSymbols(source: string): Map<string, string> {
  const symbols = new Map<string, string>();
  for (const match of source.matchAll(/import\s+([^;]+?)\s+from\s+["']([^"']+)["']/g)) {
    const [, clause, specifier] = match;
    const named = /\{([\s\S]*?)\}/.exec(clause);
    if (named) {
      for (const entry of named[1].split(",")) {
        const local = entry.trim().split(/\s+as\s+/).pop()?.trim();
        if (local) symbols.set(local, specifier);
      }
    }
    const defaultImport = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:,|$)/.exec(clause.replace(/\{[\s\S]*?\}/, ""));
    if (defaultImport) symbols.set(defaultImport[1], specifier);
  }
  return symbols;
}

/**
 * Every JSX opening tag for a capitalised component, with its attribute span.
 *
 * The span ends at the first `>` that is not inside braces or a string, so a
 * multi-line element, a nested object literal and a template literal containing
 * `${...}` are all handled — and a template literal is exactly what both
 * defective props contained.
 */
export function jsxElements(source: string): { name: string; attributes: string }[] {
  const elements: { name: string; attributes: string }[] = [];
  for (const match of source.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)) {
    let index = match.index + match[0].length;
    let depth = 0;
    let quote: string | null = null;
    while (index < source.length) {
      const character = source[index];
      if (quote !== null) {
        if (character === quote && source[index - 1] !== "\\") quote = null;
      } else if (character === '"' || character === "'" || character === "`") {
        quote = character;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
      } else if (character === ">" && depth === 0) {
        break;
      }
      index += 1;
    }
    elements.push({ name: match[1], attributes: source.slice(match.index, index) });
  }
  return elements;
}

/**
 * A prop whose value is a function literal.
 *
 * Deliberately does not match `prop={identifier}` — an imported Server Action is
 * exactly that shape and is legal. Locally declared functions are caught
 * separately, where the file's own declarations are known.
 */
const FUNCTION_LITERAL_PROP =
  /\s([A-Za-z][A-Za-z0-9_]*)=\{\s*(?:async\s+)?(?:function\b|\([^{}()]*\)\s*=>|[A-Za-z_$][A-Za-z0-9_$]*\s*=>)/g;

/** `prop={name}` — a reference, which only matters when `name` is a local function. */
const IDENTIFIER_PROP = /\s([A-Za-z][A-Za-z0-9_]*)=\{\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\}/g;

/**
 * Functions this module declares, minus the ones that are Server Actions.
 *
 * An inline `async function x() { "use server"; ... }` is the one function React
 * does serialize, so it is the one this guard must not fire on.
 */
export function localFunctionNames(source: string): Set<string> {
  const names = new Set<string>();
  for (
    const match of source.matchAll(
      /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g,
    )
  ) {
    names.add(match[1]);
  }
  for (
    const match of source.matchAll(
      /(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/g,
    )
  ) {
    names.add(match[1]);
  }
  for (const name of [...names]) {
    const serverAction = new RegExp(
      `function\\s+${name}\\s*\\([^)]*\\)\\s*(?::[^{]+)?\\{\\s*['"]use server['"]`,
    );
    if (serverAction.test(source)) names.delete(name);
  }
  return names;
}

/** Findings for one element's attribute span, given the file's local functions. */
export function unserializablePropsIn(attributes: string, locals: Set<string>): string[] {
  const findings: string[] = [];
  for (const match of attributes.matchAll(FUNCTION_LITERAL_PROP)) {
    findings.push(`${match[1]}={<function literal>}`);
  }
  for (const match of attributes.matchAll(IDENTIFIER_PROP)) {
    if (locals.has(match[2])) findings.push(`${match[1]}={${match[2]}} (a function this file declares)`);
  }
  return findings;
}

/** Every `<ClientComponent …>` rendered by a server module under `src/app/`. */
function clientElementsUnderApp(): { path: string; name: string; findings: string[] }[] {
  const rendered: { path: string; name: string; findings: string[] }[] = [];
  for (const path of walk(APP_ROOT).filter((candidate) => /\.tsx$/.test(candidate))) {
    const source = read(path);
    if (isClientModule(source)) continue;
    const imports = importedSymbols(source);
    const locals = localFunctionNames(source);
    for (const element of jsxElements(source)) {
      const specifier = imports.get(element.name);
      if (specifier === undefined) continue;
      const target = resolveImport(path, specifier);
      if (target === null || !isClientModule(read(target))) continue;
      rendered.push({ path, name: element.name, findings: unserializablePropsIn(element.attributes, locals) });
    }
  }
  return rendered;
}

const clientElements = clientElementsUnderApp();

describe("no function crosses the server to client boundary as a prop", () => {
  it("finds the client components it is meant to check", () => {
    /*
     * A guard over an empty set passes without meaning anything — and this one
     * would have, silently, if its import resolution were wrong. Both defective
     * elements were found this way, so a corpus that cannot see many is broken.
     */
    expect(clientElements.length).toBeGreaterThan(5);
  });

  it.each(clientElements.map((element, index) => [`${element.path} <${element.name}> #${index}`, index]))(
    "%s receives no function",
    (_label, index) => {
      const element = clientElements[index as number];
      expect(
        element.findings,
        `${element.path} would throw at render: React cannot serialize `
          + `${element.findings.join(", ")} into <${element.name}>. `
          + 'Hoist it to data — a string, a record — or mark it "use server".',
      ).toEqual([]);
    },
  );

  it("fires on the exact shape that shipped twice, and not on the legal ones", () => {
    /*
     * The mutation control. Without it this file passes the moment its regexes
     * stop matching anything, which is how a corpus scan dies quietly.
     */
    const none = new Set<string>();
    expect(unserializablePropsIn('<View scopeHref={(value) => `/x?scope=${value}`} />', none))
      .toEqual(["scopeHref={<function literal>}"]);
    expect(unserializablePropsIn("<View onPick={function pick() {}} />", none))
      .toEqual(["onPick={<function literal>}"]);

    // An imported Server Action, which is the shape these pages legitimately use
    // for `action` and `undoAction`. Firing on it would teach the next author to
    // stop passing Server Actions, which is the opposite of the point.
    expect(unserializablePropsIn("<View action={applyTaskDetailCommand} />", none)).toEqual([]);
    // Serializable data, however nested.
    expect(unserializablePropsIn("<View dateBounds={{ min: 1 }} projection={projection} />", none))
      .toEqual([]);
    // A locally declared function passed by name — the same defect in a hat.
    expect(unserializablePropsIn("<View scopeHref={href} />", new Set(["href"])))
      .toEqual(["scopeHref={href} (a function this file declares)"]);
    // An inline Server Action is a local function React DOES serialize, so it is
    // removed from the local set before any element is examined.
    expect(localFunctionNames('async function save() { "use server"; }\n')).toEqual(new Set());
    expect(localFunctionNames("function href(x) { return x; }\n")).toEqual(new Set(["href"]));
  });

  it("ends an element's attributes at the tag, not at the first brace or backtick", () => {
    /*
     * The span scanner is the part most able to be subtly wrong, and a wrong one
     * fails open: an element whose span ended early would simply stop containing
     * the defective prop. Both shipped defects carried a template literal with
     * `${…}` inside, which is exactly what would break a naive scan.
     */
    const source = "<View\n  dateBounds={{ a: 1 }}\n  href={`/x/${y}?z=${w}`}\n/>\n<Other bad={() => 1} />";
    const elements = jsxElements(source);
    expect(elements.map((element) => element.name)).toEqual(["View", "Other"]);
    expect(elements[0].attributes).toContain("href={`/x/${y}?z=${w}`}");
    expect(elements[0].attributes).not.toContain("Other");
    expect(unserializablePropsIn(elements[1].attributes, new Set())).toEqual(["bad={<function literal>}"]);
  });
});
