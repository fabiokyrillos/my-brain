import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `ui.css` loads before every feature sheet and is global, like all of them.
 * The one thing that keeps it from silently restyling a page it never meant
 * to touch is the prefix: every class selector it declares starts with `ui-`,
 * and it reads tokens rather than declaring literals. Both are asserted here.
 */
const REPO = process.cwd();
const css = readFileSync(join(REPO, "src/app/ui.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const classSelectors = [...css.matchAll(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g)].map((m) => m[1]!);

describe("ui.css stays inside its prefix", () => {
  it("declares a real number of classes", () => {
    expect(new Set(classSelectors).size).toBeGreaterThan(40);
  });

  it("names no class outside the ui- prefix", () => {
    const foreign = [...new Set(classSelectors.filter((name) => !name.startsWith("ui-")))];
    expect(foreign, "a selector in ui.css reaches a class another surface owns").toEqual([]);
  });

  it("anchors every compound selector on a ui- class, so bare elements are never restyled", () => {
    // Every rule's selector list, split on commas; each selector must contain
    // `.ui-` somewhere — `textarea.ui-input` and `.ui-button__icon > svg` do,
    // a bare `textarea` or `li` would not. At-rule preludes are skipped.
    const withoutAtRules = css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
    const selectors = [...withoutAtRules.matchAll(/(^|[{}])\s*([^{}]+)\{/g)]
      .flatMap((m) => m[2]!.split(",").map((s) => s.trim()))
      .filter((s) => s && !s.startsWith("@"));
    expect(selectors.length).toBeGreaterThan(60);
    const unanchored = selectors.filter((selector) => !/\.ui-/.test(selector));
    expect(unanchored).toEqual([]);
  });

  it("declares no colour, shadow or radius literal — those belong to tokens.css", () => {
    const declarations = css.replace(/@keyframes[\s\S]*?\}\s*\}/g, "");
    expect(declarations.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(declarations.match(/rgba?\(/g) ?? []).toEqual([]);
    expect(declarations.match(/box-shadow\s*:(?!\s*(?:var\(|none))/g) ?? []).toEqual([]);
    expect(declarations.match(/border-radius\s*:(?!\s*(?:var\(|calc\(var\())/g) ?? []).toEqual([]);
  });
});
