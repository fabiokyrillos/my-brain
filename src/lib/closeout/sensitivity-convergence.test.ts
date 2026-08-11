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

  it("the Work surfaces read the contract, through one component (2L-PRIVACY-007)", () => {
    /*
     * `work` joined `GOVERNED_SURFACES` in Phase 2L, and it is the surface this
     * positive half matters most for: OD-2L-1 option B names *two* consumers —
     * the list and the task detail — and requires them to converge. Two
     * surfaces each remembering to ask is a convergence one refactor away from
     * ending, silently, in the permissive direction.
     *
     * So the convergence is a component. `protected-content.tsx` is the only
     * thing that asks `resolveTaskContent` what to render, and both surfaces
     * mount it. Asserted in three parts, because any one alone would pass for
     * the wrong reason: the component consumes the contract, and each surface
     * mounts the component.
     */
    const component = code("src/features/operations/protected-content.tsx");
    // Phase 2M made the component multi-surface, so it now *references* the
    // resolvers in a lookup rather than calling one by name. Both must be
    // reachable from it, and the lookup must be what the render path uses --
    // asserted in three parts so a component that imported a resolver and then
    // ignored it would still fail.
    expect(component).toMatch(/resolveTaskContent/);
    expect(component).toMatch(/resolveCalendarContent/);
    expect(component).toMatch(/RESOLVER\[surface\]\(/);
    expect(code("src/features/operations/task-list.tsx")).toMatch(/<ProtectedContent/);
    expect(code("src/features/daily-cycle/task-detail-view.tsx")).toMatch(/<ProtectedContent/);
  });

  it("the calendar reads the contract, through the same component (2M-PRIVACY-001)", () => {
    /*
     * `calendar` joined `GOVERNED_SURFACES` in Phase 2M, in the same change that
     * shipped its first consumer -- which `2M-PRIVACY-001` requires by name,
     * because a governed surface with no consumer is a rule nobody obeys.
     *
     * OD-2M-1 option A names **two** subjects on this surface, and the second is
     * the point: a calendar that masked a task title and printed the reminder
     * title beside it would recreate, one entity over, the divergence slice 2L.1
     * found on Hoje. So the assertion is that the item component wraps content in
     * `ProtectedContent` and that the projection derives BOTH.
     */
    expect(code("src/features/calendar/calendar-item.tsx")).toMatch(/<ProtectedContent/);
    expect(code("src/features/calendar/calendar-item.tsx")).toMatch(/surface="calendar"/);
    const projection = code("src/features/calendar/calendar-projection.ts");
    expect(projection).toMatch(/deriveTaskSensitivity\(/);
    expect(projection).toMatch(/deriveReminderSensitivity\(/);
  });

  it("keeps the calendar rule in one place too, so no surface answers for itself", () => {
    // The same negative half `work` gets, for the surface added beside it.
    const walk = (dir: string, found: string[] = []): string[] => {
      const absolute = join(REPO, dir);
      for (const entry of readdirSync(absolute)) {
        const full = join(absolute, entry);
        if (statSync(full).isDirectory()) walk(join(dir, entry), found);
        else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(join(dir, entry));
      }
      return found;
    };
    const callers = walk("src")
      .filter((file) => /resolveContent\(\s*\n?\s*["']calendar["']/.test(code(file)))
      .map((file) => file.replace(/\\/g, "/"));
    expect(callers).toEqual(["src/features/sensitivity/task-derivation.ts"]);
  });

  it("Hoje withholds a protected task too, because Hoje renders task titles", () => {
    /*
     * Not in `2L-PRIVACY-007`'s enumeration, and it belongs there anyway.
     *
     * `tasks` carried no classification at all before Phase 2L, so Hoje
     * printing a task title was not a divergence — there was nothing to
     * diverge from. The moment the Work list began withholding one, a user
     * could see the same task masked on `/app/work` and printed in full on
     * `/app`, which is precisely the "two surfaces of one product meant two
     * answers" this contract module's own header says it exists to prevent.
     *
     * Note that `home-view.tsx` now consumes the contract twice, for two
     * different subjects: `presentationFor("hoje", …)` for the attention
     * entries Phase 2J governed, and `ProtectedContent` for the task rows this
     * phase classified. Both are the contract; neither is a second rule.
     */
    const home = code("src/features/shell/home-view.tsx");
    expect(home).toMatch(/<ProtectedContent/);
    expect(home).toMatch(/presentationFor\(\s*"hoje"/);
    // And the classification has to reach the row that renders content, rather
    // than the surface being left to fetch it at render time.
    expect(read("src/features/shell/home-view.tsx")).toMatch(/sensitivity: TaskSensitivity/);
    expect(code("src/features/shell/home-dashboard.tsx")).toMatch(/sensitivity: (priority\.item|task)\.sensitivity/);
  });

  it("keeps the Work rule in one place, so a surface cannot answer for itself", () => {
    // The negative half, scoped to `work`: `resolveContent("work", …)` may
    // appear in the contract module and nowhere else. `sensitivity-boundary`
    // proves no surface names a *level*; this proves none of them names the
    // *surface* either, which is the other way a second rule could appear.
    const walk = (dir: string, found: string[] = []): string[] => {
      const absolute = join(REPO, dir);
      for (const entry of readdirSync(absolute)) {
        const full = join(absolute, entry);
        if (statSync(full).isDirectory()) walk(join(dir, entry), found);
        else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(join(dir, entry));
      }
      return found;
    };
    const callers = walk("src")
      .filter((file) => /resolveContent\(\s*\n?\s*["']work["']/.test(code(file)))
      .map((file) => file.replace(/\\/g, "/"));
    expect(callers).toEqual(["src/features/sensitivity/task-derivation.ts"]);
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
      "src/features/operations/protected-content.tsx",
    ]) {
      expect(code(file), file).not.toMatch(/localStorage|sessionStorage|document\.cookie|agent_preferences/);
    }
  });
});
