/**
 * **No Server Component calls a function that lives in a `"use client"` module.**
 *
 * ## The defect this exists because of
 *
 * Slice 2S.3 shipped `isOwnerScopedDestination` from `notice-open-control.tsx`,
 * which carries `"use client"`. `attention-notice-row.tsx` is a Server
 * Component and called it during render. React refuses:
 *
 * > Attempted to call isOwnerScopedDestination() from the server but
 * > isOwnerScopedDestination is on the client.
 *
 * `/app` fell into its error boundary for **every owner with an unanswered
 * notice** — the whole point of the slice, broken for exactly the accounts it
 * was built for.
 *
 * **Nothing caught it, and nothing could have.** jsdom renders a Server
 * Component and a Client Component as the same function in the same bundle, so
 * every one of the feature's three hundred component assertions passed. The
 * boundary exists only when Next draws it. This repository already records the
 * lesson — *the RSC boundary is only tested in production* — and had no
 * executable guard for it. This is that guard.
 *
 * ## What it checks, and what it deliberately does not
 *
 * A `"use client"` directive marks the **module**, not the export. So the rule
 * is about what a server module *imports as a value*:
 *
 * - a **type-only** import is erased and is always fine;
 * - importing a **component** from a client module is the whole point of the
 *   boundary and is always fine;
 * - importing a **plain function** and calling it is the defect.
 *
 * Distinguishing a component from a function by name is a heuristic, and a
 * heuristic in a guard is a guard that argues. So this checks the narrower,
 * decidable thing: a server module may import a client module, but every
 * value it imports must be **rendered**, never **called**. A call site
 * `name(` in a server module whose `name` came from a client module fails.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /^\s*\/\/.*$/gm;

/** Source with comments removed, so a scan measures the act rather than prose. */
function code(relative: string): string {
  return read(relative).replace(BLOCK_COMMENT, "").replace(LINE_COMMENT, "");
}

function sourceFiles(dir = "src", acc: string[] = []): string[] {
  for (const entry of readdirSync(join(REPO, dir), { withFileTypes: true })) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(relative, acc);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) acc.push(relative);
  }
  return acc;
}

const SOURCES = sourceFiles();

/**
 * A module is client code when its first **statement** is the directive — read
 * from the source with comments removed.
 *
 * The first draft read the first non-empty *line*, and three modules in this
 * repository open with a docblock and declare `"use client"` after it —
 * `deletion-surface.tsx`, `consent-surface.tsx`, `account-state-surface.tsx`.
 * All three were therefore filed as SERVER modules, which is the worst of both
 * outcomes: a value imported from one of them and called would never have been
 * flagged, and the three were themselves scanned under a rule that does not
 * apply to them. A guard against an invisible boundary cannot afford a blind
 * spot in the classifier it depends on, so `directiveIsMissed` below fails if
 * one ever reappears.
 */
function isClientModule(relative: string): boolean {
  const first = code(relative).split(/\r?\n/).find((line) => line.trim() !== "");
  return first?.trim().replace(/;$/, "") === '"use client"' || first?.trim().replace(/;$/, "") === "'use client'";
}

/** A module carrying the directive on a line of its own, comments removed. */
const DIRECTIVE_LINE = /^\s*["']use client["'];?\s*$/m;

const CLIENT_MODULES = new Set(SOURCES.filter(isClientModule));

/** A server module is any source file that is not a client module. */
const SERVER_MODULES = SOURCES.filter((file) => !CLIENT_MODULES.has(file));

/** Resolves a relative or aliased specifier to a repo path, or null. */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = `src/${specifier.slice(2)}`;
  else if (specifier.startsWith(".")) {
    const dir = fromFile.split("/").slice(0, -1).join("/");
    const parts = `${dir}/${specifier}`.split("/");
    const stack: string[] = [];
    for (const part of parts) {
      if (part === "." || part === "") continue;
      if (part === "..") stack.pop();
      else stack.push(part);
    }
    base = stack.join("/");
  } else return null;

  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (SOURCES.includes(candidate)) return candidate;
  }
  return null;
}

/** Every VALUE imported by `file` from a client module, with its origin. */
function clientValuesImportedBy(file: string): { name: string; from: string }[] {
  const body = code(file);
  const found: { name: string; from: string }[] = [];
  for (const match of body.matchAll(/import\s+([^;]*?)\s+from\s+["']([^"']+)["']/g)) {
    const clause = match[1];
    const specifier = match[2];
    // `import type { … }` and `import type X` are erased entirely.
    if (/^type\s/.test(clause.trim())) continue;
    const target = resolveSpecifier(file, specifier);
    if (!target || !CLIENT_MODULES.has(target)) continue;

    const braced = /\{([^}]*)\}/.exec(clause);
    const names = braced
      ? braced[1].split(",").map((part) => part.trim()).filter(Boolean)
      : [clause.trim()];
    for (const raw of names) {
      // Per-specifier `type` markers are erased too.
      if (/^type\s/.test(raw)) continue;
      const name = (raw.split(/\s+as\s+/).pop() ?? raw).trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) found.push({ name, from: target });
    }
  }
  return found;
}

describe("the RSC boundary, enforced rather than remembered", () => {
  it("finds both kinds of module, so neither list is empty", () => {
    /*
     * THE NON-VACUITY CONTROL. Every assertion below is about what server
     * modules must not do, and an empty set of either kind satisfies all of
     * them — which is exactly how a guard reports green over a tree it cannot
     * read.
     */
    expect(CLIENT_MODULES.size, "no client module was discovered").toBeGreaterThan(10);
    expect(SERVER_MODULES.length, "no server module was discovered").toBeGreaterThan(10);
    // And the two are disjoint by construction.
    expect(SERVER_MODULES.filter((file) => CLIENT_MODULES.has(file))).toEqual([]);
  });

  it("files no `\"use client\"` module as server code", () => {
    /*
     * The classifier's own control. A client module read as a server module is
     * invisible twice over — nothing it exports is treated as living on the
     * client, and the module itself is scanned under a rule written for the
     * other side. This is the check the first draft would have failed, three
     * times.
     */
    const missed = SERVER_MODULES.filter((file) => DIRECTIVE_LINE.test(code(file)));
    expect(missed, 'a module carrying "use client" was filed as server code').toEqual([]);
  });

  it("resolves the imports it is asked about", () => {
    // A resolver that returned null for everything would make the rule below
    // pass over a tree full of violations.
    const reachable = SERVER_MODULES.filter((file) => clientValuesImportedBy(file).length > 0);
    expect(reachable.length, "no server module imports any client value at all")
      .toBeGreaterThan(0);
  });

  it("has no server module CALL a value it imported from a client module", () => {
    const offenders: string[] = [];
    for (const file of SERVER_MODULES) {
      const body = code(file);
      for (const { name, from } of clientValuesImportedBy(file)) {
        /*
         * A call, not a render. `<Name` is the boundary working as intended;
         * `Name(` is the defect. The negative lookbehind keeps `.name(` — a
         * method on something else that happens to share the identifier — out
         * of it.
         */
        const called = new RegExp(`(?<![.\\w$<])${name}\\s*\\(`).test(body);
        if (called) offenders.push(`${file} calls ${name}() imported from the client module ${from}`);
      }
    }
    expect(offenders, "a Server Component cannot call a function that lives on the client").toEqual([]);
  });
});
