import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice 2S.3's rendered half — `2S-ATTENTION-001` … `-006`, `2S-ACCESS-004`,
 * `2S-ACCESS-006`, `2S-MOBILE-001`, `-002`, `-006`, `-007`.
 *
 * ## Why this lane exists, and why it is NOT a CI gate
 *
 * Every requirement above names the **rendered page**. `2S-MOBILE-006` says so
 * twice over: *"measured against the rendered page at a phone viewport — never
 * against a media query, because headless Chromium reports `pointer: coarse` at
 * 1280px and a pointer query is not a device."*
 *
 * The two surfaces are `/app` and `/app/notifications`, and both are behind a
 * session. `phase-2o-mobile-accessibility.spec.ts` proves the rendered floor in
 * CI and reaches only the **public** routes, precisely because they are the ones
 * reachable without one. So this lane needs the hosted project and runs by hand,
 * exactly as `online-phase-2o-mobile-accessibility.spec.ts` does — and the
 * acceptance record says so rather than implying these run on every push.
 *
 * ## Why it plants its own rows
 *
 * A fresh account has no notices, and `run_user_heartbeat` would need a stale
 * task, a qualifying local hour and quiet hours out of the way to make one. The
 * rows are planted directly instead: this lane is measuring the SURFACE, and
 * slice 2S.2's pgTAP suite is where the cadence that produces them is exercised
 * by calling the function.
 *
 * **`2S-ATTENTION-004` is why the planting order matters.** *"The control plants
 * rows first, so a zero that could never be false would fail."* The empty state
 * is therefore asserted **after** the same account has been proved to render
 * rows — never on a fresh account, where an empty attention section proves
 * nothing about the empty state and everything about the account.
 *
 * ## The account is disposable and is deleted in `afterAll`
 */

const require_ = createRequire(__filename);
const AXE_PATH = require_.resolve("axe-core");

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && serviceRoleKey && publishableKey);

const SURFACES = [
  { name: "home (pt-BR)", path: "/pt-BR/app" },
  { name: "notifications (en)", path: "/en/app/notifications" },
  { name: "needs-you queue (pt-BR)", path: "/pt-BR/app/inbox?view=needs-you" },
] as const;

async function axeViolations(page: Page, only?: string[]) {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async (runOnly) => {
    // @ts-expect-error injected by addScriptTag
    const results = await window.axe.run(document, {
      resultTypes: ["violations"],
      ...(runOnly ? { runOnly } : {}),
    });
    return (results.violations as Array<{ id: string; impact: string | null; nodes: Array<{ target: unknown; failureSummary?: string }> }>)
      .filter((violation) => runOnly !== undefined || violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => `${violation.id} ×${violation.nodes.length}: ${violation.nodes.slice(0, 8).map((node) => `${String(node.target)} ${(node.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 120)}`).join(" || ")}`);
  }, only);
}

/** Waits until every finite animation has finished. Copied contract, not copied code. */
async function settle(page: Page) {
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .filter((animation) => Number.isFinite(animation.effect?.getTiming().iterations ?? 1))
          .every((animation) => animation.playState === "finished"),
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => undefined);
}

test.describe("the unanswered notices, on the pages that actually render them", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-2s3-${crypto.randomUUID()}@example.com`;
  const password = `Attention!${crypto.randomUUID()}A7`;
  let userId: string | undefined;
  const taskIds: string[] = [];

  async function rest(path: string, init: RequestInit & { body?: string }) {
    return fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        prefer: "return=representation",
        ...(init.headers ?? {}),
      },
    });
  }

  /**
   * Two subjects, three notices — and the third is the duplicate.
   *
   * `2S-ATTENTION-002` collapses a subject that already has a row, so the
   * rendered page must show **two** rows for three unanswered notices. Planting
   * the duplicate is what makes that assertion mean anything: two rows out of
   * two notices would prove nothing at all.
   */
  async function plantNotices() {
    const today = new Date().toISOString().slice(0, 10);
    for (const title of ["Pagar o aluguel", "Enviar o contrato"]) {
      const created = await rest("tasks", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, title, status: "inbox" }),
      });
      expect(created.ok, `planting the task ${title}`).toBe(true);
      taskIds.push(((await created.json()) as Array<{ id: string }>)[0].id);
    }

    const rows = [
      { task: taskIds[0], type: "task_stale", prefix: "stale", day: today, title: "Tarefa sem movimento", body: "Pagar o aluguel" },
      { task: taskIds[1], type: "task_stale", prefix: "stale", day: today, title: "Tarefa sem movimento", body: "Enviar o contrato" },
      // The duplicate: same subject as the first, a different day.
      { task: taskIds[0], type: "task_stale", prefix: "stale", day: "2026-01-02", title: "Tarefa sem movimento", body: "Pagar o aluguel" },
    ];

    const inserted = await rest("notifications", {
      method: "POST",
      body: JSON.stringify(
        rows.map((row) => ({
          user_id: userId,
          type: row.type,
          title: row.title,
          body: row.body,
          action_url: `/pt-BR/app/work/${row.task}`,
          priority: "normal",
          status: "unread",
          dedupe_key: `${row.prefix}:${row.task}:${row.day}`,
        })),
      ),
    });
    expect(inserted.ok, "planting the notices").toBe(true);
  }

  async function clearNotices() {
    const cleared = await rest(`notifications?user_id=eq.${userId}`, { method: "DELETE" });
    expect(cleared.ok, "clearing the notices").toBe(true);
  }

  test.beforeAll(async () => {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: "Attention E2E" },
      }),
    });
    expect(response.ok).toBe(true);
    userId = ((await response.json()) as { id: string }).id;
    await plantNotices();
  });

  test.afterAll(async () => {
    if (!userId) return;
    // The user's deletion cascades to tasks and notifications, so this is the
    // whole cleanup rather than the first step of it.
    const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(deletion.ok).toBe(true);
  });

  async function visit(page: Page, path: string) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    await settle(page);
  }

  /* ---------------------------------------------------------------------- *
   * `2S-ATTENTION-001` / `-005` — they render on `/app`, on a real page.
   * ---------------------------------------------------------------------- */

  test("2S-ATTENTION-001/-005: the unanswered notices render on the real /app", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await visit(page, "/pt-BR/app");

    const rows = page.locator(".notice-attention-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toBeVisible();
    // The verbs came with them, from the one shared mount.
    await expect(page.locator(".notice-attention-row .notification-menu-trigger").first()).toBeVisible();
  });

  test("2S-ATTENTION-002: three unanswered notices about two subjects render two rows", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await visit(page, "/pt-BR/app");

    /*
     * The planted set is 3 notices / 2 subjects. Two rows is the collapse; three
     * would be its absence. The duplicate is planted in `beforeAll` precisely so
     * this number can be wrong.
     */
    await expect(page.locator(".notice-attention-row")).toHaveCount(2);
  });

  test("2S-ATTENTION-003: the count rendered equals the rows rendered", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await visit(page, "/pt-BR/app");

    const section = page.locator("section.home-section", { hasText: "Precisa de você" }).first();
    const shown = (await section.locator("header .count").innerText()).replace("+", "").trim();
    const rows = await section.locator(".notice-attention-row, .needs-attention-row, .attention-lead, [data-conflict=\"row\"]").count();

    // Derived, never typed: the number on the heading is the number of rows the
    // reader can see under it.
    expect(Number(shown)).toBe(rows);
  });

  test("2S-ATTENTION-006: opening a notice from home marks it seen", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await visit(page, "/pt-BR/app");

    const before = await page.locator(".notice-attention-row").count();
    expect(before).toBeGreaterThan(0);

    await page.locator(".notice-attention-row .notice-open-control").first().click();
    await page.waitForURL(/\/app\/work\//);

    /*
     * THE ASSERTION READS THE ROW AFTER THE INTERACTION, which is the
     * requirement's own wording. The attention surface shows the UNANSWERED
     * notices, so a notice that was marked seen is one fewer row here.
     */
    await visit(page, "/pt-BR/app");
    await expect(page.locator(".notice-attention-row")).toHaveCount(before - 1);
  });

  /* ---------------------------------------------------------------------- *
   * `2S-ATTENTION-004` — the empty state, reached AFTER rows were proved.
   * ---------------------------------------------------------------------- */

  test("2S-ATTENTION-004: the empty state is reachable, and only after rows were there", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await visit(page, "/pt-BR/app");

    // FIRST: this account renders notice rows. A zero that could never be false
    // would fail right here.
    await expect(page.locator(".notice-attention-row").first()).toBeVisible();

    await clearNotices();
    await visit(page, "/pt-BR/app");
    await expect(page.locator(".notice-attention-row")).toHaveCount(0);

    // And it is a REAL empty state rather than a section that vanished.
    await expect(page.getByText("Nada precisa de você agora.")).toBeVisible();

    await plantNotices();
  });

  /* ---------------------------------------------------------------------- *
   * `2S-ACCESS-004` — axe on the rendered routes.
   * ---------------------------------------------------------------------- */

  for (const surface of SURFACES) {
    test(`2S-ACCESS-004: axe finds no serious violation on ${surface.name}`, async ({ page }) => {
      await signInOnline(page, { email, locale: "pt-BR" });
      await visit(page, surface.path);
      expect(await axeViolations(page)).toEqual([]);
    });

    test(`2S-ACCESS-004: axe finds none with the compact menu OPEN on ${surface.name}`, async ({ page }) => {
      /*
       * The closed menu is the easy half. `role="menu"`, `role="menuitem"`,
       * `aria-expanded` and `aria-describedby` only exist while it is open, and
       * a lane that never opened it would scan markup the owner never meets.
       */
      await signInOnline(page, { email, locale: "pt-BR" });
      await visit(page, surface.path);
      const trigger = page.locator(".notification-menu-trigger").first();
      if ((await trigger.count()) === 0) test.skip(true, "no notice row on this surface");
      await trigger.click();
      await expect(page.locator('[role="menu"]').first()).toBeVisible();
      await settle(page);
      expect(await axeViolations(page)).toEqual([]);
    });
  }

  /* ---------------------------------------------------------------------- *
   * `2S-ACCESS-006` — the compact menu, by keyboard, on the rendered page.
   * ---------------------------------------------------------------------- */

  test("2S-ACCESS-006: the menu opens, moves, activates and closes by keyboard alone", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await visit(page, "/pt-BR/app");

    const trigger = page.locator(".notice-attention-row .notification-menu-trigger").first();
    await trigger.focus();
    await page.keyboard.press("Enter");

    const items = page.locator('[role="menuitem"]');
    await expect(items.first()).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(items.nth(1)).toBeFocused();

    await page.keyboard.press("End");
    await expect(items.last()).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.locator('[role="menu"]')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  /* ---------------------------------------------------------------------- *
   * `2S-MOBILE-*` — measured on the rendered page at a phone viewport.
   * ---------------------------------------------------------------------- */

  for (const width of [320, 375] as const) {
    test(`2S-MOBILE-001: nothing scrolls sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await signInOnline(page, { email, locale: "pt-BR" });
      for (const surface of SURFACES) {
        await visit(page, surface.path);
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          widest: [...document.querySelectorAll("body *")]
            .map((element) => ({ tag: element.tagName, cls: element.className, width: element.getBoundingClientRect().width }))
            .sort((a, b) => b.width - a.width)
            .slice(0, 3),
        }));
        expect(overflow.scrollWidth, `${surface.name}: widest ${JSON.stringify(overflow.widest)}`)
          .toBeLessThanOrEqual(overflow.clientWidth + 1);
      }
    });
  }

  test("2S-MOBILE-006: the primary action and the menu trigger are both thumb-sized", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signInOnline(page, { email, locale: "pt-BR" });
    await visit(page, "/pt-BR/app");

    /*
     * Measured on the RENDERED PAGE, never against a media query: headless
     * Chromium reports `pointer: coarse` at 1280px, so a pointer query proves
     * nothing about a device.
     */
    for (const selector of [".notification-primary-action", ".notification-menu-trigger", ".notice-open-control"]) {
      const box = await page.locator(`.notice-attention-row ${selector}`).first().boundingBox();
      expect(box, `${selector} did not render`).not.toBeNull();
      expect(box!.height, `${selector} is ${box!.height}px tall`).toBeGreaterThanOrEqual(44);
    }
  });

  test("2S-MOBILE-007: the open menu does not cover the row it acts on", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signInOnline(page, { email, locale: "pt-BR" });
    await visit(page, "/pt-BR/app");

    const row = page.locator(".notice-attention-row").first();
    const title = row.locator("strong").first();
    const beforeText = await title.innerText();

    await row.locator(".notification-menu-trigger").click();
    const menu = page.locator('[role="menu"]').first();
    await expect(menu).toBeVisible();

    // The row is still readable behind — asserted geometrically, because
    // "visible" alone would pass for an element a panel sits on top of.
    const titleBox = await title.boundingBox();
    const menuBox = await menu.boundingBox();
    expect(titleBox).not.toBeNull();
    expect(menuBox).not.toBeNull();
    expect(await title.innerText()).toBe(beforeText);
    expect(
      menuBox!.y >= titleBox!.y + titleBox!.height,
      `the menu at y=${menuBox!.y} overlaps the title ending at y=${titleBox!.y + titleBox!.height}`,
    ).toBe(true);
  });

  test("2S-MOBILE-002: no control causes a zoom on focus", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signInOnline(page, { email, locale: "pt-BR" });
    await visit(page, "/pt-BR/app");

    await page.locator(".notice-attention-row .notification-menu-trigger").first().click();
    await page.locator('[role="menuitem"]', { hasText: "Silenciar por um tempo" }).first().click();

    const field = page.locator(".notification-verb-panel-field input").first();
    await expect(field).toBeVisible();
    const size = await field.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
    // iOS zooms a focused field below 16px. Read from the computed style on the
    // rendered page rather than from the rule that was meant to set it.
    expect(size).toBeGreaterThanOrEqual(16);
  });

  test("2S-ACCESS-002: the silence panel states the consequence before it acts", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await visit(page, "/pt-BR/app");

    await page.locator(".notice-attention-row .notification-menu-trigger").first().click();
    await page.locator('[role="menuitem"]', { hasText: "Silenciar por um tempo" }).first().click();

    const consequence = page.locator(".notification-verb-panel-consequence");
    await expect(consequence).toBeVisible();
    await expect(consequence).toHaveAttribute("role", "status");

    const until = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    await page.locator(".notification-verb-panel-field input").first().fill(until);
    await expect(consequence).toContainText("dias");
    await expect(consequence).toContainText(until);
  });
});
