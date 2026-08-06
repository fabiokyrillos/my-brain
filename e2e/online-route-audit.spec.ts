import { expect, test, type Browser, type Page } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice H — the final authenticated route re-audit.
 *
 * Audit 1 photographed the real components through a static harness, because
 * BLOCK-1 meant no session could be established. This walks the **current**
 * route inventory — read from `src/app/[locale]/app` rather than from the
 * audit's list, which is now five routes out of date — as a signed-in owner, at
 * every supported viewport in both locales, and asserts the invariants the
 * remediation established:
 *
 * - no horizontal overflow at any viewport (UX-16, UX-14);
 * - exactly one `<h1>`, so the page says what it is (UX-01, UX-03);
 * - navigation is present and marks where the owner is (UX-01);
 * - the account surface is reachable from every page (UX-26);
 * - no raw database enum reaches the screen (UX-21);
 * - every row that carries a hover affordance is a real link (UX-20);
 * - touch targets clear 44 px on phone viewports (UX-24).
 *
 * Evidence is captured at the four viewports in both locales. All content is
 * synthetic and the account is deleted fail-closed in `afterAll`.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const fixtureEmailDomain = process.env.ONLINE_AUTH_TEST_EMAIL_DOMAIN?.trim() || "example.com";
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

const EVIDENCE = "docs/reports/product-ux/ux-evidence/slice-h";

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900, phone: false },
  { name: "desktop-1920", width: 1920, height: 1080, phone: false },
  { name: "iphone-se-375", width: 375, height: 667, phone: true },
  { name: "pixel7-412", width: 412, height: 915, phone: true },
] as const;

const LOCALES = ["pt-BR", "en"] as const;

/**
 * The current inventory, not audit 1's. `capture` and `today` and `waiting`
 * were in the original sweep; `work/[taskId]`, `work/cancelled` and
 * `memories/[memoryId]` did not exist yet.
 */
const STATIC_ROUTES = [
  "",
  "/capture",
  "/inbox",
  "/work",
  "/work/cancelled",
  "/today",
  "/waiting",
  "/tasks",
  "/projects",
  "/people",
  // EGC.1. Both must appear here or the sweep would measure a shrinking share
  // of the product while still calling itself the current inventory.
  "/organizations",
  "/contexts",
  "/memories",
  "/reminders",
  "/reviews",
  "/chat",
  "/files",
  "/history",
  "/questions",
  "/notifications",
  "/jobs",
  "/costs",
  "/settings",
] as const;

/** The frames worth keeping as evidence; every route is still *measured*. */
const CAPTURED = new Set(["", "/inbox", "/work", "/projects", "/memories", "/reminders", "/history", "/settings"]);

/**
 * Routes that deliberately do not appear in navigation, so nothing can mark
 * them current.
 *
 * `jobs` is `visibility: "context-only"` in `capabilities.ts` and is excluded
 * from `VisibleNavigationKey` by the type system — a private technical queue
 * reached by URL, not a destination the owner navigates to. Every other route
 * must mark itself, and Slice H's first sweep found that `/notifications` did
 * not: its bell is on every page and never said when you had arrived at it.
 * That is fixed (UX-34); this exception is the one that survives, by argument.
 */
const NOT_IN_NAVIGATION = new Set(["/jobs"]);

/**
 * Words that would mean a stored enum reached the screen (UX-21). Matched as
 * whole words against visible text, so "Concluída" and "Completed" are fine and
 * `completed` is not — and an underscore-joined value is never fine.
 */
const RAW_ENUM_WORDS = [
  "in_progress", "recurring_info", "professional_context", "task_created", "task_updated",
  "process_attachment", "interpret_entry", "needs_attention", "could_not_organize",
];

const ADMIN_HEADERS = {
  apikey: serviceRoleKey ?? "",
  authorization: `Bearer ${serviceRoleKey}`,
  "content-type": "application/json",
};

type RouteReport = {
  route: string;
  locale: string;
  viewport: string;
  overflowPx: number;
  h1Count: number;
  navVisible: boolean;
  activeNav: boolean;
  accountReachable: boolean;
  rawEnums: string[];
  identityLeaks: string[];
  inertHoverRows: number;
  smallTargets: number;
  status: number;
};

const reports: RouteReport[] = [];

async function auditPage(page: Page, route: string, locale: string, viewport: string, phone: boolean): Promise<RouteReport> {
  const response = await page.goto(`/${locale}/app${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);

  const measured = await page.evaluate((rawEnumWords: string[]) => {
    const doc = document.documentElement;
    const overflowPx = Math.max(0, doc.scrollWidth - doc.clientWidth);

    const visibleText = (document.body.innerText ?? "").toLowerCase();
    const rawEnums = rawEnumWords.filter((word) => {
      const pattern = new RegExp(`(^|[^a-z0-9_])${word}([^a-z0-9_]|$)`, "i");
      return pattern.test(visibleText);
    });

    // A row that carries the interactive affordance but is not itself a link or
    // inside one, and holds no control of its own (UX-20).
    const inertHoverRows = [...document.querySelectorAll(".list-row")].filter((row) => {
      if (row.tagName === "A" || row.closest("a") !== null) return false;
      return row.querySelector("a, button, input, select, textarea") === null;
    }).length;

    const interactive = [...document.querySelectorAll(
      ".bottom-nav a, .mobile-more summary, .row-action, .work-view-tabs a, .entry-outcome-title",
    )];
    const smallTargets = interactive.filter((element) => {
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return false;
      return box.width < 44 || box.height < 44;
    }).length;

    return {
      overflowPx,
      h1Count: document.querySelectorAll("h1").length,
      navVisible: document.querySelector("nav") !== null,
      activeNav: document.querySelector("[aria-current='page'], .active[href], a.active") !== null,
      /**
       * Asserted structurally, not by visible text (UX-26). The account surface
       * is a collapsed `<details>` — Slice D3 mounted it in the desktop rail
       * footer and inside the mobile `Mais` overlay — and `innerText` omits
       * everything a closed disclosure contains. Reading text here measured
       * whether the *page* happened to use the word "conta", which some do and
       * most do not, and said nothing about whether the owner can sign out.
       */
      accountReachable:
        document.querySelector(".account-menu .account-sign-out") !== null
        && document.querySelector(".account-menu > summary") !== null,
      rawEnums,
      /**
       * Evidence hygiene, asserted on the DOM the screenshots were taken from.
       *
       * The closeout claims every captured frame is synthetic and contains no
       * account identity, email, user id or credential. Eyeballing 67 PNGs is
       * not a proof and OCR is not a gate, so the claim is made where it is
       * mechanically checkable: the rendered text of the exact pages that were
       * captured. `account-identity.ts` is explicit that it renders a display
       * name and never an email or a user id — this is what holds it to that.
       */
      identityLeaks: (() => {
        const visible = document.body.innerText ?? "";
        const leaks: string[] = [];
        const email = visible.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
        if (email) leaks.push(`email:${email[0]}`);
        const uuid = visible.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
        if (uuid) leaks.push(`uuid:${uuid[0]}`);
        // The harness's own fixture markers, which must never reach a frame.
        if (/codex-h-audit|E2e!/.test(visible)) leaks.push("fixture-credential-or-account");
        return leaks;
      })(),
      inertHoverRows,
      smallTargets,
    };
  }, RAW_ENUM_WORDS);

  return {
    route: route === "" ? "/(home)" : route,
    locale,
    viewport,
    status: response?.status() ?? 0,
    ...measured,
    smallTargets: phone ? measured.smallTargets : 0,
  };
}

test.describe("Slice H — authenticated route re-audit", () => {
  test.describe.configure({ mode: "serial", timeout: 900_000 });
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-h-audit-${crypto.randomUUID()}@${fixtureEmailDomain}`;
  const password = `E2e!${crypto.randomUUID()}a7`;
  let userId: string | undefined;

  test.beforeAll(async () => {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: "Codex H" } }),
    });
    expect(response.ok).toBe(true);
    userId = ((await response.json()) as { id: string }).id;
  });

  /** Fail-closed: the account goes even if every assertion above it failed. */
  test.afterAll(async () => {
    if (!userId) return;
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: ADMIN_HEADERS,
    });
  });

  async function signedInPage(browser: Browser, width: number, height: number, locale: string) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await signInOnline(page, { email, locale: locale === "en" ? "en" : "pt-BR" });
    return { context, page };
  }

  for (const locale of LOCALES) {
    for (const viewport of VIEWPORTS) {
      test(`every route holds its invariants at ${viewport.name} in ${locale}`, async ({ browser }) => {
        const { context, page } = await signedInPage(browser, viewport.width, viewport.height, locale);
        try {
          for (const route of STATIC_ROUTES) {
            const report = await auditPage(page, route, locale, viewport.name, viewport.phone);
            reports.push(report);

            if (CAPTURED.has(route)) {
              const slug = route === "" ? "home" : route.slice(1).replaceAll("/", "-");
              await page.screenshot({
                path: `${EVIDENCE}/${slug}__${locale}__${viewport.name}.png`,
                fullPage: false,
              });
            }
          }
        } finally {
          await context.close();
        }
      });
    }
  }

  test("the sweep found no regression on any measured invariant", async () => {
    expect(reports.length).toBe(LOCALES.length * VIEWPORTS.length * STATIC_ROUTES.length);

    const describe = (report: RouteReport) => `${report.route} · ${report.locale} · ${report.viewport}`;

    const failed = reports.filter((report) => report.status >= 400);
    expect(failed.map(describe), "every route answers").toEqual([]);

    const overflowing = reports.filter((report) => report.overflowPx > 0);
    expect(overflowing.map((report) => `${describe(report)} = ${report.overflowPx}px`), "no horizontal overflow").toEqual([]);

    const headings = reports.filter((report) => report.h1Count !== 1);
    expect(headings.map((report) => `${describe(report)} has ${report.h1Count} h1`), "exactly one h1").toEqual([]);

    const navless = reports.filter((report) => !report.navVisible);
    expect(navless.map(describe), "navigation on every page").toEqual([]);

    const unmarked = reports.filter((report) => !report.activeNav && !NOT_IN_NAVIGATION.has(report.route));
    expect(unmarked.map(describe), "navigation marks where the owner is").toEqual([]);

    const strandedAccount = reports.filter((report) => !report.accountReachable);
    expect(strandedAccount.map(describe), "the account surface is reachable (UX-26)").toEqual([]);

    const rawVocabulary = reports.filter((report) => report.rawEnums.length > 0);
    expect(
      rawVocabulary.map((report) => `${describe(report)}: ${report.rawEnums.join(", ")}`),
      "no stored enum reaches the screen (UX-21)",
    ).toEqual([]);

    const inert = reports.filter((report) => report.inertHoverRows > 0);
    expect(
      inert.map((report) => `${describe(report)} = ${report.inertHoverRows} rows`),
      "nothing that looks interactive is inert (UX-20)",
    ).toEqual([]);

    const tiny = reports.filter((report) => report.smallTargets > 0);
    expect(
      tiny.map((report) => `${describe(report)} = ${report.smallTargets} targets`),
      "touch targets clear 44px (UX-24)",
    ).toEqual([]);

    /**
     * The closeout's evidence-hygiene claim, made where it can be checked. Every
     * frame captured by this sweep comes from a page that passed this.
     */
    const leaking = reports.filter((report) => report.identityLeaks.length > 0);
    expect(
      leaking.map((report) => `${describe(report)}: ${report.identityLeaks.join(", ")}`),
      "no account identity, email, user id or credential is rendered",
    ).toEqual([]);
  });
});
