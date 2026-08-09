/**
 * `2J-PRIVACY-001` … `2J-PRIVACY-005` — slice 2J.6's convergence proof.
 *
 * `sensitivity-boundary.test.ts` proves the **negative**: no surface branches on
 * a literal level of its own. That is necessary and not sufficient — a surface
 * can comply by simply never asking. This file proves the **positive**: every
 * surface OD-2J-1 names either consumes the contract, or is shown to have
 * nothing to consume it for.
 *
 * Two of the five turned out to be the second kind, and saying so is more
 * honest than adding a mask to something that carries no content.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("2J-PRIVACY-001: the surfaces that render classified content consume the contract", () => {
  it("Hoje reads the contract for its attention rows", () => {
    expect(code("src/features/shell/home-view.tsx")).toMatch(/presentationFor\(\s*"hoje"/);
  });

  it("the attention queue reads the contract", () => {
    expect(code("src/features/daily-cycle/needs-attention-list.tsx"))
      .toMatch(/presentationFor\(\s*"attention"/);
  });

  it("review summaries read the contract", () => {
    expect(code("src/features/reviews/review-body.tsx"))
      .toMatch(/resolveContent\(\s*\n?\s*"review_summary"/);
  });

  it("the conversation card reads the contract (2K-PRIVACY-001)", () => {
    // `chat` joined `GOVERNED_SURFACES` in Phase 2K. The negative guard would
    // pass if the card simply never asked; this is the positive half.
    expect(code("src/features/conversation-cards/card.tsx"))
      .toMatch(/resolveContent\(\s*\n?\s*"chat"/);
  });

  it("carries the classification all the way to the row that renders content", () => {
    // `2J-PRIVACY-005`. The attention row renders a 240-character preview of
    // `entries.original_content`, so the projection must carry the entry's
    // level next to the preview rather than leaving the surface to guess.
    expect(code("src/features/daily-cycle/attention-projection.ts"))
      .toMatch(/original_content,sensitivity/);
    expect(read("src/features/daily-cycle/contracts.ts")).toMatch(/sensitivity: SensitivityLevel/);
  });
});

describe("2J-PRIVACY-001: the capture receipt has nothing to mask", () => {
  const receipt = code("src/features/daily-cycle/capture-receipt.tsx");

  it("renders a message key and a link, never the captured text", () => {
    /*
     * OD-2J-1 allows the receipt to say capture succeeded while masking
     * sensitive text. It turns out there is no text to mask: the component
     * renders `copy.messages[receipt.messageKey]` and an optional href, and
     * `CaptureReceipt` carries no content field at all.
     *
     * An evidenced negative, re-derived here rather than asserted, so a future
     * edit that starts echoing the entry breaks this test.
     */
    expect(receipt).toMatch(/copy\.messages\[receipt\.messageKey\]/);
    expect(receipt).not.toMatch(/originalContent|content|preview|title/);
  });

  it("has no content field on the receipt contract itself", () => {
    const contracts = read("src/features/daily-cycle/contracts.ts");
    const shape = contracts.match(/export type CaptureReceipt = \{[\s\S]*?\};/)?.[0] ?? "";
    expect(shape, "CaptureReceipt not found").not.toBe("");
    expect(shape).not.toMatch(/\bcontent\b|\bpreview\b|originalContent/);
  });
});

describe("2J-PRIVACY-001: the notification clause governs a surface that does not exist yet", () => {
  it("has no push, service-worker or lock-screen payload anywhere", () => {
    /*
     * OD-2J-1 forbids `highly_sensitive` content in a notification payload.
     * There is no payload: notifications are rows rendered inside the
     * authenticated app, and nothing in this repository registers a push
     * subscription or calls `showNotification`.
     *
     * So the requirement has no current violation AND no current
     * implementation. This asserts the absence, which turns the rule into
     * something a future push surface must satisfy rather than something a
     * closing report can claim was enforced.
     */
    const sources = [
      "src/features/pwa",
      "src/features/agent",
      "src/app",
    ];
    const walk = (dir: string, found: string[] = []): string[] => {
      const absolute = join(REPO, dir);
      for (const entry of readdirSync(absolute)) {
        const full = join(absolute, entry);
        if (statSync(full).isDirectory()) walk(join(dir, entry), found);
        else if (/\.(ts|tsx)$/.test(entry)) found.push(join(dir, entry));
      }
      return found;
    };
    const offenders = sources
      .flatMap((dir) => walk(dir))
      .filter((file) => /showNotification|PushManager|pushSubscription|web-push/.test(code(file)));
    expect(offenders).toEqual([]);
  });

  it("provides the copy any future payload must use, and it cannot carry content", () => {
    const contract = read("src/features/sensitivity/contracts.ts");
    expect(contract).toMatch(/export function notificationCopy\(locale: "pt-BR" \| "en"\)/);
  });

  it("records that in-app notification rows carry task and reminder titles", () => {
    /*
     * Stated because it is true and because a closing report that implied
     * otherwise would be wrong. `run_user_heartbeat` writes `task.title` and
     * `reminder.title` into `notifications.body`. Those rows carry NO
     * sensitivity column -- neither `tasks`, nor `reminders`, nor
     * `notifications` has one -- so there is nothing to mask against, and
     * inventing a classification for them would be a migration this phase's
     * budget does not have.
     *
     * The exposure is in-app and behind authentication, which is the surface
     * OD-2J-1 treats as ordinary. Recorded as a named limit, not as a fix.
     */
    const types = read("src/lib/supabase/database.types.ts");
    for (const table of ["tasks", "reminders", "notifications"]) {
      const start = types.indexOf(`      ${table}: {`);
      expect(start, `${table} missing from the generated types`).toBeGreaterThan(0);
      const row = types.slice(start, types.indexOf("Insert: {", start));
      expect(row, `${table} unexpectedly gained a sensitivity column`).not.toContain("sensitivity");
    }
  });
});

describe("2J-PRIVACY-002: the reveal is local everywhere it exists", () => {
  it("writes no preference, cookie or storage from any revealing surface", () => {
    for (const file of [
      "src/features/reviews/review-body.tsx",
      "src/features/shell/home-view.tsx",
      "src/features/daily-cycle/needs-attention-list.tsx",
      "src/features/conversation-cards/card.tsx",
    ]) {
      expect(code(file), file).not.toMatch(/localStorage|sessionStorage|document\.cookie|agent_preferences/);
    }
  });
});
