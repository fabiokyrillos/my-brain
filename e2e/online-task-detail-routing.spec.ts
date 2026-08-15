import { expect, test } from "@playwright/test";

import { onlineEnvironment, signInOnline } from "./support/online-session";

/**
 * The task detail's route contract, exercised in a real browser with a real
 * session — `2L-EDIT-007`, `2L-RETURN-001`.
 *
 * ## Why this lane has to exist for the redesign to be verified
 *
 * The detail is reachable two ways and the difference between them is decided
 * by **Next's router**, not by this repository's code: `work/@panel/(.)[taskId]`
 * answers a client-side navigation from inside `/app/work`, and
 * `work/[taskId]/page.tsx` answers everything else. Nothing below the router can
 * be unit-tested into proving that, and the fixture lanes compose their own
 * markup, so they cannot either. A `default.tsx` that stopped returning `null`,
 * a missing `[...catchAll]`, or an interception that silently stopped matching
 * would all render green everywhere else in this repository.
 *
 * The redesign recomposed the surface inside both frames, which is exactly the
 * kind of change that can break the frames themselves. So the six behaviours the
 * architecture promises are asserted here: panel on soft navigation, page on
 * hard navigation, survival of a refresh, back, forward, and a shareable URL.
 *
 * ## What it does not do
 *
 * It presses no control that mutates a task's state. The command paths have
 * their own lanes (`task-detail-commands.spec.ts`, `work-actions.spec.ts`) and
 * duplicating them here would be a second place the same write is asserted.
 *
 * **It writes nothing at all.** Every step is a navigation.
 *
 * ## `?view=all`, and why the default view is the wrong door
 *
 * `/app/work` opens on **Hoje** — today's deadlines and what is overdue — so an
 * account whose tasks all sit further out renders an empty list there. A first
 * draft of this lane read that as "the account has no task", skipped itself, and
 * reported green: an assertion that cannot fail on an empty list is not
 * evidence. `?view=all` is the archive, it is a URL the product itself links to,
 * and the fixture marker below is what stops the skip from coming back.
 *
 * It skips itself when the linked credentials are absent, exactly as every other
 * online spec does.
 *
 * ## RUN IT AGAINST `next start`, NOT `next dev`
 *
 * This lane **fails under the Turbopack dev server** and passes against the
 * production build, and the difference is a defect in the dev server rather than
 * in the product. Dev answers the RSC request for an intercepted task with a
 * 500:
 *
 *     Invalid interception route:
 *     /pt-BR/app/work/(.)(.)(.)…(.)<taskId>
 *
 * — the `(.)` marker repeated eighty-six times before the id, which
 * `extractInterceptionRouteInformation` refuses. The router then falls back to a
 * full document navigation, `default.tsx` answers the slot with `null`, and the
 * detail renders as the whole page. Every route file involved is **untouched by
 * this branch** (`git log main..HEAD -- src/app/[locale]/app/work` is empty), and
 * `next build` compiles `/[locale]/app/work/(.)[taskId]` without complaint.
 *
 * It is recorded here rather than worked around, because a lane that quietly
 * accepted "no panel" would stop being able to tell that failure apart from the
 * interception genuinely breaking. Run it with the production server up:
 *
 *     npm run build && npx next start
 *     npm run test:e2e:online -- e2e/online-task-detail-routing.spec.ts --project=desktop --workers=1
 */

/** The Work archive. The default view is date-filtered and may legitimately be empty. */
const WORK_LIST = "/pt-BR/app/work?view=all";

const EMAIL = process.env.ONLINE_AUTH_TEST_EMAIL ?? "";

test.describe("the task detail is a panel, a page, and one URL", () => {
  test.skip(!onlineEnvironment.configured || !EMAIL, "linked Supabase credentials or ONLINE_AUTH_TEST_EMAIL absent");
  /*
    `--workers=1`, for the reason every lane in this family carries: GoTrue
    issues one magiclink OTP per user, so two workers signing in as the same
    account invalidate each other's link.
  */
  test.describe.configure({ mode: "serial" });

  test("panel on soft navigation, page on hard, and the same URL for both", async ({ page }, testInfo) => {
    testInfo.setTimeout(5 * 60_000);
    await signInOnline(page, { email: EMAIL, locale: "pt-BR", appOrigin: testInfo.project.use.baseURL });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(WORK_LIST);
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });

    const firstTask = page.locator("a.work-title-link").first();
    /*
      The fixture marker, and it is the reason this lane is worth anything.
      Every assertion below is about a task detail, and every one of them is
      vacuously satisfiable by a Work list with no rows — so the lane proves it
      has something to open before it opens anything, and **fails** rather than
      skips when it does not.
    */
    await expect(firstTask, "the Work archive holds no task to open").toBeVisible({ timeout: 30_000 });

    const href = await firstTask.getAttribute("href");
    expect(href, "the Work row carries no link to a task").toBeTruthy();

    // ---- soft navigation: the panel, beside a list that is still mounted ----
    await firstTask.click();
    await expect(page.locator(".task-detail-panel")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".work-shell-main")).toBeVisible();
    expect(page.url()).toContain(href!.split("?")[0]);

    // The recomposition, inside the panel: one column, and every control the
    // page has. The panel must not be a lesser surface (`2L-EDIT-007`).
    const [primary, secondary] = await Promise.all([
      page.locator(".task-detail-panel .task-detail-primary").boundingBox(),
      page.locator(".task-detail-panel .task-detail-secondary").boundingBox(),
    ]);
    expect(primary, "the panel has no decide column").not.toBeNull();
    expect(secondary, "the panel has no understand column").not.toBeNull();
    expect(primary!.x).toBeCloseTo(secondary!.x, 0);

    // ---- refresh: the same URL, now the whole page ----
    await page.reload();
    await expect(page.locator(".task-detail-page")).toBeVisible({ timeout: 30_000 });
    // `default.tsx` returns null for the slot, so the panel frame is absent and
    // the list is not rendered behind it.
    await expect(page.locator(".task-detail-panel")).toHaveCount(0);
    await expect(page.locator(".work-shell-main .list-stack")).toHaveCount(0);

    // On a wide viewport the page mount takes the two-column split the panel
    // does not.
    const [pagePrimary, pageSecondary] = await Promise.all([
      page.locator(".task-detail-primary").boundingBox(),
      page.locator(".task-detail-secondary").boundingBox(),
    ]);
    expect(pagePrimary!.x).toBeLessThan(pageSecondary!.x);

    // ---- back: the list ----
    await page.goBack();
    await expect(page.locator("a.work-title-link").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".task-detail-page")).toHaveCount(0);

    // ---- forward: the detail again ----
    await page.goForward();
    await expect(page.locator(".task-detail-page")).toBeVisible({ timeout: 30_000 });

    // ---- the shareable URL, loaded cold ----
    const shared = page.url();
    await page.goto("/pt-BR/app");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
    await page.goto(shared);
    await expect(page.locator(".task-detail-page")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".task-detail-panel")).toHaveCount(0);
  });

  test("a narrow viewport gives the panel the whole surface, with the list removed", async ({ page }, testInfo) => {
    testInfo.setTimeout(5 * 60_000);
    await signInOnline(page, { email: EMAIL, locale: "pt-BR", appOrigin: testInfo.project.use.baseURL });

    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto(WORK_LIST);
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });

    await page.locator("a.work-title-link").first().click();
    await expect(page.locator(".task-detail-panel")).toBeVisible({ timeout: 30_000 });

    // `display:none`, not covered — the difference between a surface and an
    // untrapped modal. A covered list stays in the accessibility tree and stays
    // reachable while the user believes they are on the task.
    await expect(page.locator(".work-shell-main")).toBeHidden();

    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(overflow.scroll, "the task panel scrolls horizontally at 412px")
      .toBeLessThanOrEqual(overflow.client + 1);
  });

  test("a route under /app/work that is not a task closes the panel", async ({ page }, testInfo) => {
    testInfo.setTimeout(5 * 60_000);
    await signInOnline(page, { email: EMAIL, locale: "pt-BR", appOrigin: testInfo.project.use.baseURL });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(WORK_LIST);
    await page.locator("a.work-title-link").first().click();
    await expect(page.locator(".task-detail-panel")).toBeVisible({ timeout: 30_000 });

    /*
      The `[...catchAll]` slot's whole reason for existing: a parallel route
      keeps its active subpage across a client-side navigation that no longer
      matches it, so without that file a user who followed a link to the
      recovery route would carry the panel there.
    */
    await page.goto("/pt-BR/app/work/cancelled");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".task-detail-panel")).toHaveCount(0);
  });

});
