import { expect, test } from "@playwright/test";

import { onlineEnvironment, signInOnline } from "./support/online-session";

/**
 * Brain's lenses and Dados e IA, navigated the way an owner navigates them.
 *
 * ## What only a session can prove here
 *
 * Both strips are `<Link>`s to separate documents, so every claim about them is
 * a claim about **routing**: that a deep link lands, that the right tab is
 * marked, that a refresh keeps it, and that the browser's back button means what
 * it meant. None of that is visible to a jsdom test — which renders one
 * component and never navigates — nor to the layout-contract lane, which
 * composes its own markup and has no router at all.
 *
 * `online-redesign-visual.spec.ts` already proves each surface *renders*. This
 * proves you can get between them and know where you are.
 *
 * Skips itself without credentials, exactly as every other online lane does.
 * `--workers=1` is a hard requirement: GoTrue issues one magiclink OTP per user.
 */

const EMAIL = process.env.ONLINE_AUTH_TEST_EMAIL ?? "";

/**
 * The nine, in the strip's own order — the overview first, then Conversar.
 *
 * `2P-CHAT-004` (`OD-2P-7`) moved Conversar from last to first among the
 * domains. This list is hand-written because the spec runs in a browser and
 * cannot import the registry, so it has to be kept in step deliberately — and
 * the panel test below now derives its destination from `DOMAINS[0]` rather than
 * naming a route, so the next reorder cannot leave a passing-looking assertion
 * waiting on a URL the product no longer navigates to.
 */
const LENSES = [
  { route: "library", label: "Visão geral" },
  { route: "chat", label: "Conversar" },
  { route: "people", label: "Pessoas" },
  { route: "projects", label: "Projetos" },
  { route: "organizations", label: "Empresas" },
  { route: "contexts", label: "Contextos" },
  { route: "memories", label: "Memórias" },
  { route: "files", label: "Arquivos" },
  { route: "relations", label: "Relações" },
] as const;

/** The eight the overview draws a panel for: every lens but the overview itself. */
const DOMAINS = LENSES.slice(1);

test.describe("Brain's lenses are one space", () => {
  test.skip(!onlineEnvironment.configured || !EMAIL, "linked Supabase credentials or ONLINE_AUTH_TEST_EMAIL absent");
  test.describe.configure({ mode: "serial" });

  test("every lens is a deep link that lands and marks itself", async ({ page }, testInfo) => {
    testInfo.setTimeout(10 * 60_000);
    await signInOnline(page, { email: EMAIL, locale: "pt-BR", appOrigin: testInfo.project.use.baseURL });

    for (const lens of LENSES) {
      await page.goto(`/pt-BR/app/${lens.route}`);
      const strip = page.getByRole("navigation", { name: "Lentes do Brain" });

      await expect(strip, `${lens.route} does not carry the lens strip`).toBeVisible({ timeout: 30_000 });
      // Nine links on every one of the nine surfaces: the strip is the same
      // strip, not a per-page subset.
      await expect(strip.getByRole("link")).toHaveCount(LENSES.length);

      const current = strip.locator('[aria-current="page"]');
      await expect(current, `${lens.route} marks more or less than one lens`).toHaveCount(1);
      await expect(current, `${lens.route} marks the wrong lens`).toHaveText(lens.label);
    }
  });

  test("following a lens navigates, and back returns to where you were", async ({ page }, testInfo) => {
    testInfo.setTimeout(10 * 60_000);
    await signInOnline(page, { email: EMAIL, locale: "pt-BR", appOrigin: testInfo.project.use.baseURL });

    await page.goto("/pt-BR/app/library");
    const strip = page.getByRole("navigation", { name: "Lentes do Brain" });
    await expect(strip).toBeVisible({ timeout: 30_000 });

    await strip.getByRole("link", { name: "Memórias" }).click();
    await page.waitForURL(/\/app\/memories$/, { timeout: 30_000 });
    await expect(strip.locator('[aria-current="page"]')).toHaveText("Memórias");

    // A refresh must keep the lens: the strip is server-rendered from the route,
    // so a marked tab that survived only in client state would be a lie the
    // first reload exposed.
    await page.reload();
    await expect(strip.locator('[aria-current="page"]')).toHaveText("Memórias");

    await page.goBack();
    await page.waitForURL(/\/app\/library$/, { timeout: 30_000 });
    await expect(strip.locator('[aria-current="page"]')).toHaveText("Visão geral");

    await page.goForward();
    await page.waitForURL(/\/app\/memories$/, { timeout: 30_000 });
    await expect(strip.locator('[aria-current="page"]')).toHaveText("Memórias");
  });

  test("the overview's panels open the routes they name", async ({ page }, testInfo) => {
    testInfo.setTimeout(10 * 60_000);
    await signInOnline(page, { email: EMAIL, locale: "pt-BR", appOrigin: testInfo.project.use.baseURL });

    await page.goto("/pt-BR/app/library");
    const panels = page.locator(".brain-domain");
    // Eight domains, one panel each. A page that rendered none would satisfy
    // every per-panel assertion below by never running one.
    await expect(panels).toHaveCount(DOMAINS.length);

    /*
     * Derived, not named. This asserted `/app/people` because People was the
     * first domain; `2P-CHAT-004` made Conversar first, and the hardcoded URL
     * would have left this waiting thirty seconds for a navigation the product
     * no longer performs — in a lane CI does not run, so nothing would have said
     * so until someone ran it by hand.
     */
    const first = DOMAINS[0]!;
    await panels.first().getByRole("link").first().click();
    await page.waitForURL(new RegExp(`/app/${first.route}$`), { timeout: 30_000 });
    await expect(page.locator("h1")).toBeVisible();
  });
});

test.describe("Dados e IA is one place", () => {
  test.skip(!onlineEnvironment.configured || !EMAIL, "linked Supabase credentials or ONLINE_AUTH_TEST_EMAIL absent");
  test.describe.configure({ mode: "serial" });

  const VIEWS = [
    { route: "history", label: "Atividade" },
    { route: "costs", label: "Custos" },
    { route: "jobs", label: "Processamento" },
  ] as const;

  test("each view is a deep link that lands, marks itself, and offers the way up", async ({ page }, testInfo) => {
    testInfo.setTimeout(10 * 60_000);
    await signInOnline(page, { email: EMAIL, locale: "pt-BR", appOrigin: testInfo.project.use.baseURL });

    for (const view of VIEWS) {
      await page.goto(`/pt-BR/app/${view.route}`);
      const strip = page.getByRole("navigation", { name: "Dados e IA" });
      await expect(strip, `${view.route} does not carry the Dados e IA strip`).toBeVisible({ timeout: 30_000 });

      const current = strip.locator('[aria-current="page"]');
      await expect(current, `${view.route} marks more or less than one view`).toHaveCount(1);
      await expect(current).toHaveText(view.label);

      // The way up is what a tab of Settings would have given for free.
      await expect(strip.getByRole("link", { name: "Ajustes" })).toHaveAttribute(
        "href",
        "/pt-BR/app/settings",
      );
    }
  });

  test("Ajustes reaches all three, and the routes still render rather than redirect", async ({ page }, testInfo) => {
    testInfo.setTimeout(10 * 60_000);
    await signInOnline(page, { email: EMAIL, locale: "pt-BR", appOrigin: testInfo.project.use.baseURL });

    await page.goto("/pt-BR/app/settings");
    const section = page.getByRole("region", { name: "Dados e IA" });
    await expect(section).toBeVisible({ timeout: 30_000 });
    await expect(section.getByRole("link")).toHaveCount(3);

    for (const view of VIEWS) {
      await page.goto("/pt-BR/app/settings");
      await section.getByRole("link", { name: view.label }).click();
      await page.waitForURL(new RegExp(`/app/${view.route}$`), { timeout: 30_000 });
      // The URL did not move on: a redirect into Ajustes would have landed here
      // as `/app/settings`, which is precisely the consolidation this branch
      // refused to build.
      expect(page.url()).toMatch(new RegExp(`/pt-BR/app/${view.route}$`));
      await expect(page.locator("h1")).toBeVisible();
    }
  });
});
