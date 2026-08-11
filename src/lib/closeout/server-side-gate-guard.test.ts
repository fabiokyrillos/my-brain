/**
 * A gate that runs only in the page is deferred behind `loading.tsx`.
 *
 * ## The defect this exists to prevent, which it was written after
 *
 * `5edc205` ("perf: make authenticated navigation responsive") added
 * `src/app/[locale]/app/loading.tsx`. In the App Router a segment's
 * `loading.tsx` wraps that segment's **children** — its `page.tsx` and every
 * nested segment — in a Suspense boundary, while the segment's own `layout.tsx`
 * renders *outside* it. So from that commit on, a hard request to any
 * `/{locale}/app/**` route flushed the shell immediately and only then reached
 * `requireUser`, whose `redirect()` could no longer become an HTTP 307. It was
 * serialized into the RSC payload and executed by the browser after hydration.
 *
 * Measured against the running app on 2026-08-11, for an authenticated account
 * that had not yet accepted the current policies:
 *
 * | request | before `5edc205` | after |
 * | --- | --- | --- |
 * | `GET /pt-BR/app` | `307 → /pt-BR/consent` | **`200`**, 63 KB of shell |
 * | `GET /pt-BR/app/calendar` | `307 → /pt-BR/consent` | **`200`**, 64 KB |
 *
 * Two consequences, in the order they matter. **The interposition weakened**:
 * SH-LIFECYCLE-008 and SH-LEGAL-008/009 specify a suspended or unconsented
 * account is refused server-side, and an answer that ships the shell and asks
 * the browser to leave is not that — it survives exactly as long as hydration
 * does. **And it broke every deployment journey**: `page.goto` resolves on
 * `load`, which happens before hydration, so `e2e/support/online-session.ts`
 * saw `/{locale}/app`, concluded no consent was interposed, and the redirect
 * then fired *during the next navigation* and aborted it. Eleven of twelve
 * cases in `online-reminders.spec.ts` — a spec that touches nothing this phase
 * changed — failed with `net::ERR_ABORTED`, which reads like a product defect
 * and was not one.
 *
 * ## What is asserted
 *
 * For every `loading.tsx` under `src/app`: if any page in that segment's
 * subtree is gated, the segment's own `layout.tsx` must run the gate too. The
 * page keeps its own call — this adds a boundary above the Suspense one, it
 * does not move the gate — so a Server Action reached without a page render is
 * unaffected and the deeper database predicates stay where they are.
 *
 * The guard is deliberately about `loading.tsx`, not about the app segment: the
 * next `loading.tsx` added to a gated segment is the case this catches, and by
 * then nobody will remember why.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP_ROOT = join(process.cwd(), "src", "app");

/** The one authenticated entry point. A segment is gated iff it calls this. */
const GATE = "requireUser";

function walk(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...walk(path));
    } else {
      found.push(path);
    }
  }
  return found;
}

const everyFile = walk(APP_ROOT);
const loadingBoundaries = everyFile.filter((path) => /[\\/]loading\.tsx$/.test(path));

/** The pages a boundary defers: everything below its own directory. */
function pagesUnder(segment: string): string[] {
  return everyFile.filter(
    (path) => path.startsWith(segment + "\\") || path.startsWith(segment + "/"),
  ).filter((path) => /[\\/]page\.tsx$/.test(path));
}

describe("an authenticated segment gates above its loading boundary", () => {
  it("finds the boundaries it is meant to check", () => {
    // A guard over an empty set passes without meaning anything. If the app
    // ever stops using `loading.tsx` entirely this fails and gets deleted
    // deliberately, rather than going quiet.
    expect(loadingBoundaries.length).toBeGreaterThan(0);
  });

  it.each(loadingBoundaries)("%s does not defer its segment's gate", (boundary) => {
    const segment = boundary.replace(/[\\/]loading\.tsx$/, "");
    const gatedPages = pagesUnder(segment).filter((page) =>
      readFileSync(page, "utf8").includes(GATE),
    );
    if (gatedPages.length === 0) return; // An ungated segment needs no layout gate.

    const layout = join(segment, "layout.tsx");
    const source = (() => {
      try {
        return readFileSync(layout, "utf8");
      } catch {
        return null;
      }
    })();

    expect(
      source,
      `${gatedPages.length} gated page(s) sit behind ${boundary}, so ${layout} must exist and run the gate`,
    ).not.toBeNull();
    expect(
      source!.includes(GATE),
      `${layout} must call ${GATE} — otherwise the gate below ${boundary} answers 200 and redirects in the browser`,
    ).toBe(true);
  });
});
