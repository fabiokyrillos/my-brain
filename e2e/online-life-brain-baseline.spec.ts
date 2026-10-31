import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { onlineEnvironment, signInOnline } from "./support/online-session";

/**
 * Life Brain — baseline visual audit of every authenticated route.
 *
 * Produces the "before" evidence for the life-brain initiative: one screenshot
 * per route at an iPhone-sized viewport and at desktop, in pt-BR (and English
 * for the surfaces whose copy the initiative changes first), plus a JSON file of
 * mechanical measurements per route: horizontal overflow, interactive targets
 * under 44px, distinct button class signatures, raw underlined links, h1 count,
 * and technical vocabulary leaking into visible text.
 *
 * Runs against the account named by `ONLINE_AUTH_TEST_EMAIL` through
 * `scripts/online-playwright.mjs`, `--workers=1` (one magiclink OTP per user).
 * It asserts only that each route answered; the measurements are evidence, not
 * a gate — the gate is the initiative's acceptance criteria, slice by slice.
 */

/**
 * Where the evidence lands and which routes to visit. The defaults are the
 * baseline; a slice re-runs the same instrument on the routes it touched:
 *   LIFE_BRAIN_EVIDENCE=docs/reports/life-brain/evidence/slice-a1  *   LIFE_BRAIN_ROUTES=home,chat,capture npm run test:e2e:online -- …
 */
const EVIDENCE = process.env.LIFE_BRAIN_EVIDENCE?.trim() || "docs/reports/life-brain/evidence/baseline";
const ROUTE_FILTER = (process.env.LIFE_BRAIN_ROUTES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
/** `LIFE_BRAIN_THEME=dark` emulates `prefers-color-scheme: dark` and suffixes every file with `-dark`. */
const THEME: "light" | "dark" = process.env.LIFE_BRAIN_THEME === "dark" ? "dark" : "light";
const THEME_SUFFIX = THEME === "dark" ? "-dark" : "";
const onlyNamed = <T extends { readonly name: string }>(routes: readonly T[]): readonly T[] =>
  ROUTE_FILTER.length === 0 ? routes : routes.filter((route) => ROUTE_FILTER.includes(route.name));
const EMAIL = process.env.ONLINE_AUTH_TEST_EMAIL ?? "";

const VIEWPORTS = [
  { name: "iphone-390", width: 390, height: 844, phone: true },
  { name: "desktop-1440", width: 1440, height: 900, phone: false },
] as const;

type Route = {
  readonly name: string;
  readonly path: string;
  /** Section whose first detail link should also be captured. */
  readonly detail?: RegExp;
  readonly en?: boolean;
};

const ROUTES: readonly Route[] = [
  { name: "home", path: "/app", en: true },
  { name: "today", path: "/app/today" },
  { name: "capture", path: "/app/capture", en: true },
  { name: "inbox", path: "/app/inbox", detail: /\/app\/inbox\/[0-9a-f-]{36}/, en: true },
  { name: "work", path: "/app/work", detail: /\/app\/work\/[0-9a-f-]{36}/, en: true },
  { name: "work-cancelled", path: "/app/work/cancelled" },
  { name: "tasks", path: "/app/tasks" },
  { name: "waiting", path: "/app/waiting" },
  { name: "projects", path: "/app/projects", detail: /\/app\/projects\/[0-9a-f-]{36}/ },
  { name: "people", path: "/app/people", detail: /\/app\/people\/[0-9a-f-]{36}/ },
  { name: "organizations", path: "/app/organizations", detail: /\/app\/organizations\/[0-9a-f-]{36}/ },
  { name: "contexts", path: "/app/contexts", detail: /\/app\/contexts\/[0-9a-f-]{36}/ },
  { name: "relations", path: "/app/relations" },
  { name: "calendar", path: "/app/calendar", en: true },
  { name: "calendar-plan", path: "/app/calendar/plan" },
  { name: "reminders", path: "/app/reminders", detail: /\/app\/reminders\/[0-9a-f-]{36}/ },
  { name: "reviews", path: "/app/reviews", detail: /\/app\/reviews\/[0-9a-f-]{36}/ },
  { name: "library", path: "/app/library" },
  { name: "memories", path: "/app/memories", detail: /\/app\/memories\/[0-9a-f-]{36}/ },
  { name: "files", path: "/app/files" },
  { name: "search", path: "/app/search?q=médico" },
  { name: "chat", path: "/app/chat", detail: /\/app\/chat\/[0-9a-f-]{36}/, en: true },
  { name: "questions", path: "/app/questions" },
  { name: "notifications", path: "/app/notifications" },
  { name: "history", path: "/app/history" },
  { name: "jobs", path: "/app/jobs" },
  { name: "costs", path: "/app/costs" },
  { name: "settings", path: "/app/settings", en: true },
  { name: "settings-ai", path: "/app/settings/ai" },
  { name: "settings-notifications", path: "/app/settings/notifications" },
  { name: "settings-appearance", path: "/app/settings/appearance" },
  { name: "settings-privacy", path: "/app/settings/privacy" },
  { name: "settings-account", path: "/app/settings/account" },
];

const PUBLIC_ROUTES: readonly Route[] = [
  { name: "auth-login", path: "/auth/login", en: true },
  { name: "auth-register", path: "/auth/register" },
  { name: "auth-recover", path: "/auth/recover" },
];

const TECHNICAL_WORDS = [
  "in_progress", "interpret_entry", "process_attachment", "needs_attention",
  "could_not_organize", "service_role", "uuid", "idempot", "job", "lease", "rpc",
  "embedding", "tokens", "confidence", "confiança", "interpretação", "interpretation",
  "payload", "enum", "status:", "null", "undefined", "nan",
];

type Measurement = {
  route: string;
  locale: string;
  viewport: string;
  status: number;
  finalUrl: string;
  overflowPx: number;
  h1Count: number;
  h1Text: string;
  buttons: number;
  buttonClassSignatures: number;
  links: number;
  underlinedLinks: number;
  smallTargets: number;
  smallTargetSamples: string[];
  technicalWords: string[];
  textLength: number;
  navItems: string[];
};

const measurements: Measurement[] = [];

async function measure(page: Page, route: string, locale: string, viewport: string, status: number): Promise<Measurement> {
  const measured = await page.evaluate((technicalWords: string[]) => {
    const doc = document.documentElement;
    const visible = document.body.innerText ?? "";
    const lower = visible.toLowerCase();
    const buttons = [...document.querySelectorAll("button, [role='button'], input[type='submit']")];
    const signatures = new Set(
      buttons.map((b) => (b.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).sort().join(" ")),
    );
    const links = [...document.querySelectorAll("a[href]")];
    const underlined = links.filter((a) => {
      const style = getComputedStyle(a);
      return style.textDecorationLine.includes("underline");
    });
    const interactive = [...document.querySelectorAll("a[href], button, [role='button'], input, select, textarea, summary")];
    const small = interactive.filter((el) => {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return false;
      if (box.bottom < 0 || box.top > window.innerHeight) return false;
      return box.width < 44 || box.height < 44;
    });
    const sampleOf = (el: Element) => {
      const box = el.getBoundingClientRect();
      const label = (el.textContent ?? el.getAttribute("aria-label") ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `${el.tagName.toLowerCase()} ${Math.round(box.width)}x${Math.round(box.height)} "${label}"`;
    };
    const nav = [...document.querySelectorAll("nav a")].map((a) => (a.textContent ?? "").trim().replace(/\s+/g, " ")).filter(Boolean);
    return {
      overflowPx: Math.max(0, doc.scrollWidth - doc.clientWidth),
      h1Count: document.querySelectorAll("h1").length,
      h1Text: [...document.querySelectorAll("h1")].map((h) => (h.textContent ?? "").trim()).join(" | ").slice(0, 120),
      buttons: buttons.length,
      buttonClassSignatures: signatures.size,
      links: links.length,
      underlinedLinks: underlined.length,
      smallTargets: small.length,
      smallTargetSamples: small.slice(0, 6).map(sampleOf),
      technicalWords: technicalWords.filter((w) => lower.includes(w)),
      textLength: visible.length,
      navItems: [...new Set(nav)],
    };
  }, TECHNICAL_WORDS);
  return { route, locale, viewport, status, finalUrl: page.url().replace(/^https?:\/\/[^/]+/, ""), ...measured };
}

async function capture(page: Page, route: Route, path: string, locale: string, viewport: (typeof VIEWPORTS)[number], suffix = "") {
  const response = await page.goto(`/${locale}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(400);
  const status = response?.status() ?? 0;
  const file = `${EVIDENCE}/${route.name}${suffix}-${locale}-${viewport.name}${THEME_SUFFIX}.png`;
  await page.screenshot({ path: file, fullPage: true });
  measurements.push(await measure(page, `${route.name}${suffix}${THEME_SUFFIX}`, locale, viewport.name, status));
  return status;
}

test.describe("Life Brain — baseline route audit", () => {
  test.skip(!onlineEnvironment.configured || !EMAIL, "linked Supabase credentials or ONLINE_AUTH_TEST_EMAIL absent");
  test.describe.configure({ mode: "serial" });

  test.afterAll(() => {
    mkdirSync(EVIDENCE, { recursive: true });
    writeFileSync(`${EVIDENCE}/measurements${THEME_SUFFIX}.json`, JSON.stringify(measurements, null, 2) + "\n");
  });

  for (const viewport of VIEWPORTS) {
    test(`public routes at ${viewport.name}`, async ({ browser }, testInfo) => {
      testInfo.setTimeout(5 * 60_000);
      mkdirSync(EVIDENCE, { recursive: true });
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: THEME });
      const page = await context.newPage();
      for (const route of onlyNamed(PUBLIC_ROUTES)) {
        for (const locale of route.en ? (["pt-BR", "en"] as const) : (["pt-BR"] as const)) {
          const status = await capture(page, route, route.path, locale, viewport);
          expect(status, `${route.path} answered`).toBeLessThan(500);
        }
      }
      await context.close();
    });

    test(`authenticated routes at ${viewport.name}`, async ({ browser }, testInfo) => {
      testInfo.setTimeout(25 * 60_000);
      mkdirSync(EVIDENCE, { recursive: true });
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.phone ? 2 : 1,
        isMobile: viewport.phone,
        hasTouch: viewport.phone,
        colorScheme: THEME,
      });
      const page = await context.newPage();
      await signInOnline(page, { email: EMAIL, locale: "pt-BR", appOrigin: testInfo.project.use.baseURL });

      for (const route of onlyNamed(ROUTES)) {
        const locales = route.en ? (["pt-BR", "en"] as const) : (["pt-BR"] as const);
        for (const locale of locales) {
          const status = await capture(page, route, route.path, locale, viewport);
          expect(status, `${route.path} answered`).toBeLessThan(500);
          if (route.detail && locale === "pt-BR") {
            const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") ?? ""));
            const first = hrefs.find((h) => route.detail!.test(h));
            if (first) {
              await capture(page, route, first.replace(/^\/(pt-BR|en)/, ""), locale, viewport, "-detail");
            } else {
              measurements.push({
                route: `${route.name}-detail`, locale, viewport: viewport.name, status: 0, finalUrl: "(no detail link found)",
                overflowPx: 0, h1Count: 0, h1Text: "", buttons: 0, buttonClassSignatures: 0, links: 0, underlinedLinks: 0,
                smallTargets: 0, smallTargetSamples: [], technicalWords: [], textLength: 0, navItems: [],
              });
            }
          }
        }
      }
      await context.close();
    });
  }
});
