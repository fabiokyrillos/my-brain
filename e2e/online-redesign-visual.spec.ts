import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { onlineEnvironment, signInOnline, type OnlineLocale } from "./support/online-session";

/**
 * The same scanner `accessibility.spec.ts` uses, injected the same way.
 *
 * `axe-core` is a declared devDependency; `@axe-core/playwright` is not in the
 * tree, and adding a dependency to run a scan the repository already knows how
 * to run would be a second mechanism for one job.
 */
const require_ = createRequire(__filename);
const AXE_PATH = require_.resolve("axe-core");

/**
 * The Papel e Console redesign, seen — authenticated, with the owner's own data.
 *
 * The closing report of the foundation named this the largest residual risk: the
 * product's main surfaces had been changed and never once rendered with a real
 * session. Component tests assert markup, the layout-contract lane inlines its
 * own CSS by hand, and neither of them can see a column that starved, a token
 * that did not resolve, or a row that overflowed at 375px.
 *
 * This lane runs against a **local** dev server signed in to the linked Supabase
 * project. It skips itself when the credentials are absent — the same contract
 * every other online spec follows, which is what keeps this out of CI without a
 * second mechanism to remember.
 *
 * Two objective checks run everywhere, because they are the two that a person
 * looking at a screenshot reliably misses:
 *
 *  - **no horizontal scroll** at any width, which `07-acessibilidade.md` states
 *    outright and which is the failure mode of a fixed grid at 375px;
 *  - **axe**, in both themes, because contrast is not visible to jsdom and a new
 *    tint can tip an inherited colour below threshold.
 *
 * Screenshots are written for the reviewer to compare against the mockups. They
 * are artefacts, not assertions: a screenshot that changed is not a defect, and
 * the checks above are what actually fail.
 */

const SHOTS = process.env.REDESIGN_SHOT_DIR ?? "test-results/redesign";

/** `05-responsividade.md`'s matrix, exactly. */
const WIDTHS = [375, 412, 768, 1024, 1440, 1920] as const;

type Surface = {
  readonly name: string;
  readonly path: (locale: OnlineLocale) => string;
  /** A selector that proves the page really rendered, not that it 200'd. */
  readonly proof: string;
};

const SURFACES: readonly Surface[] = [
  { name: "hoje", path: (l) => `/${l}/app`, proof: "h1" },
  { name: "registros", path: (l) => `/${l}/app/inbox`, proof: "h1" },
  { name: "registros-tudo", path: (l) => `/${l}/app/inbox?view=all`, proof: "h1" },
  { name: "trabalho", path: (l) => `/${l}/app/work`, proof: "h1" },
  { name: "calendario", path: (l) => `/${l}/app/calendar`, proof: "h1" },
  { name: "planejar", path: (l) => `/${l}/app/calendar/plan`, proof: "h1" },
  { name: "revisoes", path: (l) => `/${l}/app/reviews`, proof: "h1" },
  { name: "brain", path: (l) => `/${l}/app/library`, proof: "h1" },
  { name: "pessoas", path: (l) => `/${l}/app/people`, proof: "h1" },
  { name: "projetos", path: (l) => `/${l}/app/projects`, proof: "h1" },
  { name: "memorias", path: (l) => `/${l}/app/memories`, proof: "h1" },
  { name: "arquivos", path: (l) => `/${l}/app/files`, proof: "h1" },
  { name: "relacoes", path: (l) => `/${l}/app/relations`, proof: "h1" },
  { name: "conversar", path: (l) => `/${l}/app/chat`, proof: "h1" },
  { name: "perguntas", path: (l) => `/${l}/app/questions`, proof: "h1" },
  { name: "avisos", path: (l) => `/${l}/app/notifications`, proof: "h1" },
  { name: "ajustes", path: (l) => `/${l}/app/settings`, proof: "h1" },
  { name: "historico", path: (l) => `/${l}/app/history`, proof: "h1" },
  { name: "custos", path: (l) => `/${l}/app/costs`, proof: "h1" },
  { name: "processamento", path: (l) => `/${l}/app/jobs`, proof: "h1" },
];

const EMAIL = process.env.ONLINE_AUTH_TEST_EMAIL ?? "";

const BY_LOCALE = (what: string, locale: string) => what + " in " + locale;
const BY_LOCALE_PATH = (path: string, locale: string) => "/" + locale + path;

test.describe("Papel e Console, authenticated", () => {
  test.skip(!onlineEnvironment.configured || !EMAIL, "linked Supabase credentials or ONLINE_AUTH_TEST_EMAIL absent");
  test.describe.configure({ mode: "serial" });

  /**
   * `--workers=1` is a hard requirement of this lane, not a preference: GoTrue
   * issues one magiclink OTP per user, so two workers signing in as the same
   * account invalidate each other's link and whichever `verify` arrives late is
   * refused.
   */
  async function setTheme(page: Page, theme: "light" | "dark") {
    // The explicit choice, the way the product stores it — not
    // `prefers-color-scheme`, which cannot express "light on a dark machine"
    // and is therefore not what a user who picked a theme gets.
    await page.evaluate((value) => {
      document.documentElement.setAttribute("data-theme", value);
    }, theme);
  }

  async function assertNoHorizontalScroll(page: Page, where: string) {
    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    // One pixel of tolerance for sub-pixel rounding on fractional device ratios.
    expect(overflow.scroll, `${where} scrolls horizontally`).toBeLessThanOrEqual(overflow.client + 1);
  }

  for (const locale of ["pt-BR", "en"] as const) {
    test(`every surface holds its shape in ${locale}`, async ({ page }, testInfo) => {
      testInfo.setTimeout(15 * 60_000);
      mkdirSync(SHOTS, { recursive: true });

      await signInOnline(page, { email: EMAIL, locale, appOrigin: testInfo.project.use.baseURL });

      for (const surface of SURFACES) {
        await page.goto(surface.path(locale));
        // A page that never rendered satisfies every absence assertion below,
        // so the proof comes first.
        await expect(
          page.locator(surface.proof).first(),
          `${surface.name} did not render in ${locale}`,
        ).toBeVisible({ timeout: 30_000 });

        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 900 });
          for (const theme of ["light", "dark"] as const) {
            await setTheme(page, theme);
            await assertNoHorizontalScroll(page, `${surface.name} @${width} ${theme} ${locale}`);

            const isShotWidth = width === 375 || width === 1440;
            if (isShotWidth && (locale === "pt-BR" || width === 1440)) {
              await page.screenshot({
                path: `${SHOTS}/${surface.name}-${locale}-${width}-${theme}.png`,
                fullPage: true,
              });
            }
          }
        }

        // Back to a desktop viewport before the next surface, so the first
        // paint of each page is the one the shell was designed for.
        await page.setViewportSize({ width: 1440, height: 900 });
        await setTheme(page, "light");
      }
    });
  }

  /**
   * axe, on the real page, in both themes.
   *
   * `jsdom` cannot see contrast, and the layout-contract lane scans markup it
   * styled itself — so this is the only place a colour that fell below AA on a
   * live surface is caught.
   */
  for (const theme of ["light", "dark"] as const) {
    test(`axe finds no violation in ${theme}`, async ({ page }, testInfo) => {
      testInfo.setTimeout(15 * 60_000);
      await signInOnline(page, { email: EMAIL, locale: "pt-BR", appOrigin: testInfo.project.use.baseURL });

      /*
        Scan with motion reduced.

        The first run of this lane reported three contrast failures on Custos
        with *blended* values — `#807c77` on `#fdfdfc`, which are neither of the
        tokens involved. They were an entrance animation caught mid-flight: the
        settled colours are `#55504a` on `#ffffff`, measured directly. A scanner
        that races an animation reports the product as broken when the lane is,
        and the fix is not a longer wait — it is scanning the state the product
        actually rests in. The product removes those animations under this media
        query, so this is also the more faithful thing to measure.
      */
      await page.emulateMedia({ reducedMotion: "reduce" });

      const failures: string[] = [];
      for (const surface of SURFACES) {
        await page.goto(surface.path("pt-BR"));
        await expect(page.locator(surface.proof).first()).toBeVisible({ timeout: 30_000 });
        await setTheme(page, theme);

        // The control: prove the theme really applied before trusting a pass.
        // A scan of a light page that believed it was dark is the false verdict
        // this repository has already published once.
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

        await page.addScriptTag({ path: AXE_PATH });
        const violations = await page.evaluate(async () => {
          // @ts-expect-error injected by addScriptTag
          const results = await window.axe.run(document, { resultTypes: ["violations"] });
          return (results.violations as Array<{ id: string; impact: string | null; nodes: unknown[]; help: string }>)
            /*
              `serious` and `critical` only, matching `accessibility.spec.ts`.
              Unlike that lane this one scans the *real* page, so the usual
              caveat about fixture artefacts does not apply — but keeping the
              threshold identical is what lets the two lanes' verdicts be
              compared instead of argued about.
            */
            .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
            /*
              The failing selectors, not only the count. A rule name and a number
              tell you a page is wrong; the target tells you which element, and
              without it the next step is guessing at CSS — which is how a fix
              lands on the wrong rule and the violation survives.
            */
            .map((violation) => {
              const targets = (violation.nodes as Array<{ target: string[]; failureSummary?: string }>)
                .slice(0, 4)
                .map((node) => node.target.join(" "))
                .join(" | ");
              return `${violation.id} (${violation.nodes.length}) — ${violation.help} → ${targets}`;
            });
        });
        for (const violation of violations) failures.push(`${surface.name}: ${violation}`);
      }

      expect(failures, `axe violations in ${theme}:\n${failures.join("\n")}`).toEqual([]);
    });
  }
/**
   * The three workspaces, which no path-based list can reach.
   *
   * Person, project and memory details live behind an id, so the lane above —
   * which navigates to fixed paths — has never seen one. They are reached the
   * way an owner reaches them: open the list, follow the first row. That also
   * makes the assertion stronger than a hard-coded id would, because it proves
   * the list's own link works.
   *
   * With the dense fixture loaded these are the widest rows the schema permits:
   * a 110-character name, a 240-character task title, and a memory body longer
   * than any line. A workspace column that refuses to shrink below its content
   * shows up here and nowhere else.
   */
  const WORKSPACES = [
    { name: "pessoa", list: "/app/people", row: ".list-row" },
    { name: "projeto", list: "/app/projects", row: ".list-row" },
    { name: "memoria", list: "/app/memories", row: ".memory-row a[href*='/app/memories/']" },
  ] as const;

  for (const locale of ["pt-BR", "en"] as const) {
    test(BY_LOCALE("each workspace holds its shape", locale), async ({ page }, testInfo) => {
      testInfo.setTimeout(15 * 60_000);
      mkdirSync(SHOTS, { recursive: true });
      await signInOnline(page, { email: EMAIL, locale, appOrigin: testInfo.project.use.baseURL });

      for (const workspace of WORKSPACES) {
        await page.goto(BY_LOCALE_PATH(workspace.list, locale));
        const first = page.locator(workspace.row).first();
        // A list that rendered nothing would let every assertion below pass by
        // never navigating. The row has to be there before it is followed.
        await expect(
          first,
          workspace.name + " list rendered no row in " + locale,
        ).toBeVisible({ timeout: 30_000 });
        await first.click();

        /*
         * Wait for the **URL**, not for an `<h1>`.
         *
         * The list has an `<h1>` too, so a click that navigated nowhere would
         * satisfy a visibility assertion instantly — which is exactly what the
         * first run of this block did, and what the URL check below caught. The
         * wait is the fix; the check stays, because a wait that timed out
         * differently tomorrow should still not be able to pass on a list.
         */
        await page.waitForURL(/\/app\/(people|projects|memories)\/[0-9a-f-]{36}/, {
          timeout: 30_000,
        });
        await expect(
          page.locator("h1").first(),
          workspace.name + " detail did not render in " + locale,
        ).toBeVisible({ timeout: 30_000 });
        expect(page.url(), workspace.name + " did not open a detail route").toMatch(
          /\/app\/(people|projects|memories)\/[0-9a-f-]{36}/,
        );

        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 900 });
          for (const theme of ["light", "dark"] as const) {
            await setTheme(page, theme);
            await assertNoHorizontalScroll(
              page,
              workspace.name + " @" + width + " " + theme + " " + locale,
            );
            if ((width === 375 || width === 1440) && (locale === "pt-BR" || width === 1440)) {
              await page.screenshot({
                path: SHOTS + "/" + workspace.name + "-" + locale + "-" + width + "-" + theme + ".png",
                fullPage: true,
              });
            }
          }
        }

        await page.setViewportSize({ width: 1440, height: 900 });
        await setTheme(page, "light");
      }
    });
  }
});
