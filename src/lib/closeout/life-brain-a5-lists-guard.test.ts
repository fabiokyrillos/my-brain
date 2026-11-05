/**
 * Life Brain slice A.5 — the list routes open with the shared header.
 *
 * The baseline opened every page with an eyebrow, a display title and a lead,
 * which spent a third of an iPhone screen before any content
 * (`DESIGN_DIRECTION.md` §1). A.5 moves Registros, Notificações, Memória and its
 * lenses onto `PageHeader size="compact"` — no eyebrow, the lead hidden on a
 * phone — and makes their empty states quiet (`ux-state-quiet`: no blue box for
 * an empty list, `DESIGN_DIRECTION.md` §4). This guard keeps each route there:
 *
 *  1. the route renders `PageHeader` with `size="compact"` (directly, or through
 *     the one component that owns it — Buscar's surface);
 *  2. no `className="eyebrow"` and no `list-header` remains on it;
 *  3. every empty `UniversalStateView` it renders opts into the quiet style;
 *  4. no `pt ? … : …` ternary is left for copy (the A.5 copy lives in typed
 *     modules).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO = process.cwd();
const ROUTES = [
  "inbox",
  "notifications",
  "library",
  "people",
  "projects",
  "organizations",
  "contexts",
  "files",
  "memories",
] as const;

function routeSource(route: string): string {
  return readFileSync(join(REPO, "src/app/[locale]/app", route, "page.tsx"), "utf8");
}

describe("Life Brain A.5 — list routes use the compact shared header", () => {
  it.each(ROUTES)("%s renders a compact PageHeader", (route) => {
    const code = routeSource(route);
    expect(code).toContain("<PageHeader");
    expect(code).toMatch(/<PageHeader[\s\S]*?size="compact"/);
  });

  it("Buscar's surface renders it too", () => {
    const code = readFileSync(join(REPO, "src/features/search/search-surface.tsx"), "utf8");
    expect(code).toMatch(/<PageHeader[^>]*size="compact"/);
    expect(code).not.toContain('className="search-title"');
  });

  it.each(ROUTES)("%s carries no eyebrow and no legacy list header", (route) => {
    const code = routeSource(route);
    expect(code).not.toContain('className="eyebrow"');
    expect(code).not.toContain('className="list-header"');
  });

  it.each(ROUTES)("%s keeps its empty states quiet", (route) => {
    const code = routeSource(route);
    const empties = code.match(/<UniversalStateView[\s\S]*?\/>/g) ?? [];
    for (const element of empties.filter((tag) => tag.includes('state="empty"'))) {
      expect(element, `${route}: ${element.slice(0, 80)}`).toContain('className="ux-state-quiet"');
    }
  });

  it.each(ROUTES)("%s has no inline locale ternary left", (route) => {
    expect(routeSource(route)).not.toMatch(/\bpt \? ["`]/);
  });

  it("the quiet style exists and removes the box", () => {
    const css = readFileSync(join(REPO, "src/app/experience.css"), "utf8");
    const rule = css.match(/\.ux-state\.ux-state-quiet\s*\{([^}]*)\}/);
    expect(rule?.[1]).toMatch(/border:\s*0/);
    expect(rule?.[1]).toMatch(/background:\s*transparent/);
  });
});
