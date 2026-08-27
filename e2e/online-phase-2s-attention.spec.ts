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
 * The surfaces are `/app`, `/app/notifications` and `/app/inbox?view=needs-you`,
 * and every one of them is behind a session. `phase-2o-mobile-accessibility.spec.ts` proves the rendered floor in
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

/**
 * The three rendered surfaces — **each with its own row contract, never a
 * borrowed one.**
 *
 * `rowSelector` is not a convenience. The first hardened run of this lane
 * failed four tests because one selector was applied to all three: `/app` and
 * `/app/inbox?view=needs-you` both mount `AttentionNoticeRow`, whose element
 * carries `.notice-attention-row` — and `/app/notifications` does not mount it
 * at all. That page renders `li.list-row.notification-row`, its own contract
 * since long before this phase, and it renders **three** rows where the
 * attention surface renders two, because the collapse by subject is the
 * attention surface's rule and not the history's.
 *
 * A surface measured through another surface's selector reports zero rows and
 * says "the page is empty" about a page that is full. Borrowing a selector is
 * therefore the same class of mistake as measuring a fixture instead of the
 * page: the number that comes back is about the wrong object.
 */
const SURFACES = [
  { name: "home (pt-BR)", path: "/pt-BR/app", rowSelector: ".notice-attention-row" },
  { name: "notifications (en)", path: "/en/app/notifications", rowSelector: "li.notification-row" },
  { name: "needs-you queue (pt-BR)", path: "/pt-BR/app/inbox?view=needs-you", rowSelector: ".notice-attention-row" },
] as const;

/** The attention surface's row, named once so no test spells it by hand. */
const ATTENTION_ROW = ".notice-attention-row";

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
  /**
   * ONE WORKER, IN DECLARATION ORDER — and the run that lacked this line is why.
   *
   * `playwright.config.ts` sets `fullyParallel: true`, so without a mode here
   * these eighteen tests are handed to six workers. Each worker evaluates this
   * describe body of its own, so `crypto.randomUUID()` runs six times and the
   * lane silently created and deleted **six disposable accounts** rather than
   * one — six sets of hosted writes, six teardowns to trust, and a residue
   * guarantee six times as easy to lose if one worker dies.
   *
   * It also made the file's own stated ordering fiction. `2S-ATTENTION-004`
   * clears every notice and re-plants them; a sibling running concurrently on
   * the same account would have measured whichever half of that it happened to
   * catch. That the run did not visibly corrupt itself is an accident of the
   * per-worker email, not a property of the lane.
   *
   * `"default"` rather than `"serial"`, unlike the other online specs here, and
   * the difference is deliberate: `"serial"` SKIPS the remaining tests after a
   * failure, and this lane exists to be read in full. A test downstream of a
   * half-applied fixture fails at `expectRows`, which names the cause out loud —
   * that is a finding, where a skip is a silence.
   */
  test.describe.configure({ mode: "default" });

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
    /*
      The ids THIS planting made, kept locally as well as appended to the
      lane's record.

      The rows below used to index `taskIds`, which is append-only — so the
      SECOND planting (`2S-ATTENTION-004` re-plants after it clears) created two
      tasks it then never referenced and hung its notices back on the first two.
      Nothing failed, which is exactly why it survived a run: two hosted rows
      written for nothing, and a fixture that does not mean what it reads like.
    */
    const planted: string[] = [];
    for (const title of ["Pagar o aluguel", "Enviar o contrato"]) {
      const created = await rest("tasks", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, title, status: "inbox" }),
      });
      expect(created.ok, `planting the task ${title}`).toBe(true);
      const id = ((await created.json()) as Array<{ id: string }>)[0].id;
      planted.push(id);
      taskIds.push(id);
    }

    const rows = [
      { task: planted[0], type: "task_stale", prefix: "stale", day: today, title: "Tarefa sem movimento", body: "Pagar o aluguel" },
      { task: planted[1], type: "task_stale", prefix: "stale", day: today, title: "Tarefa sem movimento", body: "Enviar o contrato" },
      // The duplicate: same subject as the first, a different day.
      { task: planted[0], type: "task_stale", prefix: "stale", day: "2026-01-02", title: "Tarefa sem movimento", body: "Pagar o aluguel" },
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

  /**
   * A page that really rendered, and a row that is really there.
   *
   * ## Why this is not "goto and settle"
   *
   * The first run of this lane reported **thirteen passes over the error
   * boundary**. `/app` was throwing — a Server Component was calling a function
   * that lived in a `"use client"` module — and the page it served instead
   * satisfied almost every measurement: axe finds no serious violation on an
   * error page, an error page does not scroll sideways, and the menu scan
   * SKIPPED itself because it could not find a trigger.
   *
   * Only the three tests that demanded a control failed. The rest were the trap
   * this repository already has a name for: **a test that cannot fail on a blank
   * page**.
   *
   * So every visit now refuses the error boundary by name, and `expectRows` is
   * the precondition every rendered measurement states before measuring — in
   * this surface's own row contract, never in a neighbour's.
   */
  async function visit(page: Page, path: string) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();

    /*
     * `src/app/[locale]/app/error.tsx` is the boundary. If it rendered, the
     * measurement below would be of a page the owner never wanted to see, and
     * every silent assertion would pass over it.
     */
    const boundary = page.locator('[data-ux-state="error_recoverable"]');
    if ((await boundary.count()) > 0) {
      throw new Error(`${path} rendered its error boundary; nothing below it can be measured`);
    }
    /*
     * The boundary's own heading, as the second reading — read from the copy the
     * component actually renders rather than guessed. The first draft of this
     * check guessed "algo deu errado", which appears nowhere in this product,
     * so it would have detected nothing at all: a detector that cannot fire is
     * the same thing as no detector.
     */
    const heading = (await page.locator("h1").first().innerText()).toLowerCase();
    if (heading.includes("não foi possível carregar") || heading.includes("could not load this page")) {
      throw new Error(`${path} rendered an error heading; nothing below it can be measured`);
    }

    await settle(page);
  }

  /**
   * The precondition for every rendered measurement: **this surface's own rows
   * are on this surface's page.**
   *
   * Stated rather than assumed, because "no violation" and "no sideways scroll"
   * are both true of a page with nothing on it — and the selector is a
   * parameter rather than a constant because the first version of this helper
   * hard-coded the attention surface's class and then asked `/app/notifications`
   * about it. The history page renders `li.notification-row`, has never
   * rendered `.notice-attention-row`, and was reported empty for four tests
   * while it was in fact rendering all three planted notices.
   */
  async function expectRows(page: Page, selector: string, atLeast = 1) {
    const rows = page.locator(selector);
    await expect(
      rows,
      `the surface rendered no \`${selector}\`, so nothing below measures what it claims to`,
    ).not.toHaveCount(0);
    expect(await rows.count(), `${selector} rows`).toBeGreaterThanOrEqual(atLeast);
  }

  /**
   * The notices as the DATABASE holds them, read with the service role.
   *
   * `2S-ATTENTION-006` is a claim about a WRITE, and a row disappearing from a
   * projection is not the same statement: the attention surface collapses a
   * subject to one row, so a count can stay put for an entirely correct write
   * and can move for a reason that has nothing to do with one. This reads the
   * three rows themselves, so the assertion can name which one moved.
   */
  async function noticeStates(): Promise<Array<{ id: string; body: string; status: string }>> {
    const response = await rest(
      `notifications?user_id=eq.${userId}&select=id,body,status&order=body.asc,id.asc`,
      { method: "GET" },
    );
    expect(response.ok, "reading the notices back").toBe(true);
    return (await response.json()) as Array<{ id: string; body: string; status: string }>;
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

  /**
   * `2S-ATTENTION-006` — and the two things the first version of this test got
   * wrong, both of which the hosted run found.
   *
   * ## 1. It opened `.first()`, and `.first()` is a coin toss here
   *
   * The three planted notices are inserted by **one** statement, so all three
   * carry the same `created_at`. `loadAttentionNotices` orders by
   * `created_at desc` with no tiebreaker, and Postgres is free to return equal
   * keys in any order — so which subject leads the page is undefined, and this
   * test passed or failed on that draw.
   *
   * ## 2. `before - 1` was a claim about the projection, not about the write
   *
   * The fixture deliberately gives one subject **two** unanswered notices, so
   * `2S-ATTENTION-002` has something to collapse. Marking one of that pair seen
   * is a completely correct write that leaves the row exactly where it was —
   * because the subject still has an unanswered notice, and the attention
   * surface is telling the truth when it keeps showing it. The hosted run
   * reported `expected 1, received 2` for precisely that, and the product was
   * right both times.
   *
   * ## So the write is proved where the write happens
   *
   * The row opened is the one whose subject has exactly **one** notice, which
   * makes the projection's answer unambiguous — and the database is read either
   * side of the interaction, so the assertion names *which* notice moved rather
   * than counting rows and hoping.
   *
   * The database read also proves the **order** the control promises.
   * `NoticeOpenControl` awaits the write and navigates in the statement after
   * it, so by the moment the destination URL is on screen the write is already
   * committed. The read below runs at that moment and does not retry: a control
   * that navigated first would be caught here, not tolerated.
   */
  test("2S-ATTENTION-006: opening a notice from home marks it seen", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await visit(page, "/pt-BR/app");
    await expectRows(page, ATTENTION_ROW, 2);

    const before = await page.locator(ATTENTION_ROW).count();
    expect(before).toBe(2);

    const planted = await noticeStates();
    expect(planted.filter((notice) => notice.status === "unread")).toHaveLength(3);
    // The subject with exactly one notice. The other has two, by construction.
    const singles = planted.filter((notice) => notice.body === "Enviar o contrato");
    expect(singles, "the single-notice subject").toHaveLength(1);
    const target = singles[0];

    const row = page.locator(ATTENTION_ROW, { hasText: "Enviar o contrato" });
    await expect(row).toHaveCount(1);
    await row.locator(".notice-open-control").click();
    await page.waitForURL(/\/app\/work\//);

    const after = await noticeStates();
    // The write happened, it happened BEFORE the navigation, and it touched
    // exactly one row — no second write from the same press, no widening of the
    // verb to every notice about the subject.
    expect(after.filter((notice) => notice.status === "read").map((notice) => notice.id)).toEqual([target.id]);
    expect(after.filter((notice) => notice.status === "unread")).toHaveLength(2);

    /*
     * THE ASSERTION READS THE ROW AFTER THE INTERACTION, which is the
     * requirement's own wording. The surface shows the UNANSWERED notices, so
     * the row whose only notice was answered is gone — and the row whose subject
     * still has one is still here, which is the same rule read from the other
     * side.
     */
    await visit(page, "/pt-BR/app");
    await expect(page.locator(ATTENTION_ROW, { hasText: "Enviar o contrato" })).toHaveCount(0);
    await expect(page.locator(ATTENTION_ROW, { hasText: "Pagar o aluguel" })).toHaveCount(1);
    await expect(page.locator(ATTENTION_ROW)).toHaveCount(before - 1);
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
      // The surface is measured with rows ON it: an empty page has no violations.
      await expectRows(page, surface.rowSelector);
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
      /*
       * NO SKIP. The first version skipped itself when it found no trigger —
       * and it found none because the page had thrown, so the lane reported a
       * pass for the surface it had most failed to measure. A missing trigger is
       * now a failure, which is what it always was.
       */
      await expectRows(page, surface.rowSelector);
      /*
       * The trigger is taken from INSIDE this surface's own row. A bare
       * `.notification-menu-trigger` would happily find one anywhere on the
       * page — a shell, a header, another list — and then the scan would be of
       * a menu that does not belong to the row this surface renders.
       */
      const trigger = page.locator(`${surface.rowSelector} .notification-menu-trigger`).first();
      await expect(trigger).toBeVisible();
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
    await expectRows(page, ATTENTION_ROW);

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
        // A page with nothing on it does not scroll sideways either.
        await expectRows(page, surface.rowSelector);
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
    await expectRows(page, ATTENTION_ROW);

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
    await expectRows(page, ATTENTION_ROW);

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
    await expectRows(page, ATTENTION_ROW);

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
    await expectRows(page, ATTENTION_ROW);

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
