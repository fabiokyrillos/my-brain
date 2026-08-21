import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { APPEARANCE_SCRIPT, APPEARANCE_STORAGE_KEY } from "../src/features/appearance/contracts";
import { onlineEnvironment, signInOnline } from "./support/online-session";

/**
 * `2Q-ACCESS-001` … `2Q-ACCESS-004` — **the fixture lane and the real app must
 * agree, and this is where that is proved.**
 *
 * ## Why this file exists
 *
 * Phase 2Q's slice 2Q.4 began by reproducing `A11Y-WEBKIT-DARK-CONTRAST`: six
 * and seven `color-contrast` violations, `serious`, on global search and the
 * Work bulk bar, in dark, on the WebKit project only. The obvious reading was a
 * live product defect, and `OD-2Q-6` was signed on it.
 *
 * **Measurement contradicted the premise.** The same surfaces, on the real
 * running app, in the same engine, resolve `#f0ede7` on `#1c1b18` — correct.
 * The *lane* was inventing the failure: a `setContent` document with a viewport
 * meta and no real origin makes WebKit resolve **no custom properties** on
 * `body` or on form controls, so `color: var(--text-primary)` became invalid at
 * computed-value time and fell back to initial black.
 *
 * The owner's decision was explicit: **change no product colour, token, CSS or
 * component; fix the lane to apply the theme by the product's own mechanism;
 * prove fixture and real app converge; only then widen CI.**
 *
 * This file is the proof. It cannot live in `accessibility.spec.ts`, because
 * half of it needs a **session** — that is the whole point: one half is the
 * fixture, the other half is the product, and the assertion is that they match.
 *
 * ## What it does not claim
 *
 * **Nothing here is screen-reader evidence.** `2P-ACCESS-005` stays **WAIVED,
 * NOT PASSED**, and no assertion in this phase changes that waiver.
 */

const { supabaseUrl, serviceRoleKey } = onlineEnvironment;
const onlineConfigured = onlineEnvironment.configured;

const ROOT = join(__dirname, "..");
const FIXTURE_URL = "http://localhost:3000/__accessibility-fidelity-fixture__";

/**
 * The same stylesheet set the fixture lane inlines, read the same way.
 *
 * Duplicated deliberately rather than exported from `accessibility.spec.ts`:
 * importing a spec from a spec makes Playwright collect the other file's tests
 * too. The list is asserted against that file's own list below, so the two
 * cannot drift silently — which is the failure these arrays have caused here
 * before.
 *
 * **Named `STYLESHEETS`, and that name is load-bearing.**
 * `src/lib/closeout/stylesheet-registry-guard.test.ts` discovers every lane that
 * inlines product CSS by exactly that declaration and requires the token sheets
 * to come first. A private name would have kept this list outside the guard —
 * which is the drift the guard exists to prevent, and this file has precisely
 * the kind of list it was written for.
 */
const STYLESHEETS = [
  "tokens.css", "experience.css", "globals.css", "palette.css", "operations.css",
  "mobile-navigation.css", "pagination.css", "conversation-cards.css", "chat.css",
  "assistant.css", "brain.css", "timelines.css", "entities.css", "memories.css", "history.css",
] as const;

const css = STYLESHEETS.map((file) => readFileSync(join(ROOT, "src", "app", file), "utf8"))
  .join("\n")
  .replace(/@import\s+"tailwindcss";?/g, "")
  .replace(/@import\s+"\.\/[a-z-]+\.css";?/g, "");

/** The properties the defect touched, measured identically on both halves. */
async function measure(page: Page, selectSelector: string) {
  return page.evaluate((selector) => {
    const cs = getComputedStyle;
    const select = document.querySelector(selector) as HTMLElement | null;
    return {
      theme: document.documentElement.getAttribute("data-theme"),
      rootToken: cs(document.documentElement).getPropertyValue("--text-primary").trim(),
      bodyToken: cs(document.body).getPropertyValue("--text-primary").trim(),
      bodyBg: cs(document.body).backgroundColor,
      bodyColor: cs(document.body).color,
      selectFound: Boolean(select),
      selectToken: select ? cs(select).getPropertyValue("--text-primary").trim() : null,
      selectColor: select ? cs(select).color : null,
      selectBg: select ? cs(select).backgroundColor : null,
    };
  }, selectSelector);
}

/** The fixture half, rendered exactly as the corrected lane renders it. */
async function renderFixture(page: Page, body: string, theme: "light" | "dark") {
  await page.route(FIXTURE_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><head><meta charset="utf-8">`
        + `<meta name="viewport" content="width=device-width, initial-scale=1">`
        + `</head><body></body></html>`,
    }));
  await page.addInitScript(([key, choice]) => {
    try { window.localStorage.setItem(key as string, choice as string); } catch { /* no origin */ }
  }, [APPEARANCE_STORAGE_KEY, theme]);
  await page.goto(FIXTURE_URL, { waitUntil: "load" });
  await page.setContent(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">`
      + `<meta name="viewport" content="width=device-width, initial-scale=1">`
      + `<script>${APPEARANCE_SCRIPT}</script>`
      + `<title>Fidelidade</title><style>`
      + `:root{--font-plex-sans:system-ui,sans-serif;--font-newsreader:Georgia,serif;--font-plex-mono:ui-monospace,monospace}`
      /*
        The one Tailwind preflight rule this lane depends on, restored by hand.

        `css` above strips `@import "tailwindcss"`, so the preflight the product
        actually ships never reaches this fixture — and preflight is what makes a
        form control inherit its colour:
        `button,input,optgroup,select,textarea{font:inherit;color:inherit}`.

        **Without it a <select> falls back to the UA's `FieldText`**, which under
        `color-scheme: dark` is white in Chromium and BLACK in WebKit. That is
        the whole of `A11Y-WEBKIT-DARK-CONTRAST`: black on the dark canvas, 1.13:1,
        on exactly the two surfaces whose text sits on a select. The product was
        never affected — measured on the real app, the same select inherits
        `#f0ede7` through eight ancestors.

        Restored rather than worked around, and asserted against the real page by
        `online-phase-2q-accessibility-fidelity.spec.ts`.
      */
      + `button,input,optgroup,select,textarea{font:inherit;color:inherit}`
      + `${css}</style></head><body><div class="app-shell">${body}</div></body></html>`,
    { waitUntil: "load" },
  );
}

/** Mirrors the two surfaces the false positive named, and nothing else. */
const SEARCH_FIXTURE =
  `<section class="search-surface"><h1 class="search-title">Buscar</h1>`
  + `<form class="search-form" role="search"><div class="search-filters">`
  + `<label for="search-type">Tipo</label>`
  + `<select id="search-type"><option>Tudo</option></select>`
  + `</div></form></section>`;

const BULK_FIXTURE =
  `<section aria-label="Bulk actions" class="work-bulk-bar"><form class="work-bulk-form">`
  + `<label for="work-bulk-action">O que fazer</label>`
  + `<select id="work-bulk-action"><option value="set_priority">Definir prioridade</option></select>`
  + `</form></section>`;

async function createAccount() {
  const email = `codex-2qfid-${crypto.randomUUID()}@example.com`;
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey!,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password: `Fd!${crypto.randomUUID()}A7`, email_confirm: true }),
  });
  expect(response.ok, await response.clone().text()).toBe(true);
  const { id } = (await response.json()) as { id: string };
  return { email, id };
}

test.describe("the fixture lane and the real app agree", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");
  test.describe.configure({ mode: "serial" });

  let userId: string | null = null;
  let email = "";

  test.beforeAll(async () => {
    const owner = await createAccount();
    userId = owner.id;
    email = owner.email;
    /*
      One task, so `/app/work` has a row to select and the bulk bar can appear.
      `tasks_status_check` admits inbox / todo / in_progress / waiting / blocked
      / deferred / completed / cancelled — there is no `done`.
    */
    const seeded = await fetch(`${supabaseUrl}/rest/v1/tasks`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify([{ user_id: owner.id, title: "Tarefa de fidelidade", status: "todo" }]),
    });
    expect(seeded.ok, await seeded.clone().text()).toBe(true);
  });

  test.afterAll(async () => {
    if (!userId) return;
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(response.ok, `deleting the fidelity account failed: ${await response.clone().text()}`).toBe(true);
    userId = null;
  });

  test("the stylesheet list this file inlines is the one the lane inlines", () => {
    /*
     * The guard against the failure this repository has already paid for: a
     * hand-written stylesheet array going stale, so a fixture measures
     * unstyled markup and agrees with nothing. Both lists are parsed from the
     * lane's own source rather than trusted.
     */
    const lane = readFileSync(join(ROOT, "e2e", "accessibility.spec.ts"), "utf8");
    const declared = lane.slice(lane.indexOf("const STYLESHEETS = ["));
    const names = [...declared.slice(0, declared.indexOf("]")).matchAll(/"([a-z-]+\.css)"/g)]
      .map((match) => match[1]);
    expect(names, "the fidelity proof and the lane inline different CSS").toEqual([...STYLESHEETS]);
  });

  test("2Q-ACCESS-002: global search — the fixture and the REAL page compute the same colours in dark", async ({ page }) => {
    /*
     * **This is the assertion that decides `2Q-ACCESS-002`'s class.** It is
     * `baseline`: the real page was already correct, and no product colour was
     * changed to make this pass. The fixture was brought up to the product, not
     * the other way round.
     */
    await signInOnline(page, { email, locale: "pt-BR", next: "/pt-BR/app" });
    await page.evaluate(
      ([key, choice]) => localStorage.setItem(key as string, choice as string),
      [APPEARANCE_STORAGE_KEY, "dark"],
    );
    await page.goto("/pt-BR/app/search");
    await page.waitForSelector("select", { timeout: 20_000 });
    const real = await measure(page, "select");

    await renderFixture(page, SEARCH_FIXTURE, "dark");
    const fixture = await measure(page, "#search-type");

    // The real page really is in dark, and really has a select — so an
    // agreement below cannot be two blanks agreeing.
    expect(real.theme).toBe("dark");
    expect(real.selectFound).toBe(true);
    expect(fixture.selectFound).toBe(true);

    for (const property of ["theme", "rootToken", "bodyToken", "bodyBg", "bodyColor", "selectToken", "selectColor", "selectBg"] as const) {
      expect(fixture[property], `the fixture and the real page disagree on ${property}`)
        .toBe(real[property]);
    }
    // And the value is the dark palette, not merely the same wrong thing twice.
    expect(real.selectColor).toBe("rgb(240, 237, 231)");
    expect(real.selectBg).toBe("rgb(28, 27, 24)");
  });

  test("2Q-ACCESS-003: the Work bulk bar — same agreement, same reason", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR", next: "/pt-BR/app" });
    await page.evaluate(
      ([key, choice]) => localStorage.setItem(key as string, choice as string),
      [APPEARANCE_STORAGE_KEY, "dark"],
    );
    await page.goto("/pt-BR/app/work?view=all");
    /*
     * **The bulk bar renders only when a row is selected** (`bulk-bar.tsx:137`),
     * so the account is seeded with a task and a row is actually ticked. An
     * earlier version of this test skipped the select comparison whenever the
     * real page had none — which made "they agree" true of two blanks, and a
     * missing control is not evidence of agreement.
     */
    // `attached`, not `visible`: the row checkbox is visually replaced by a
    // styled indicator, so it is present and operable without being "visible"
    // to a strict visibility check.
    await page.waitForSelector('input[type="checkbox"]', { state: "attached", timeout: 20_000 });
    /*
      Clicked through the DOM rather than through `check()`.

      The row checkbox is visually replaced by a styled indicator, so Playwright
      reports it as not visible — `check({ force: true })` still refused it on
      the mobile-sized WebKit project while passing on desktop. A real
      `HTMLElement.click()` fires the same event React's `onChange` listens for,
      on every viewport, and this test is about colour rather than about how a
      row is selected.
    */
    await page.locator('input[type="checkbox"]').first()
      .evaluate((element) => (element as HTMLInputElement).click());
    await page.waitForSelector(".work-bulk-bar select", { timeout: 20_000 });
    const real = await measure(page, ".work-bulk-bar select");

    await renderFixture(page, BULK_FIXTURE, "dark");
    const fixture = await measure(page, ".work-bulk-bar select");

    expect(real.theme).toBe("dark");
    expect(real.selectFound, "the real bulk bar never appeared").toBe(true);
    expect(fixture.selectFound).toBe(true);

    for (const property of ["theme", "rootToken", "bodyToken", "bodyBg", "bodyColor", "selectToken", "selectColor", "selectBg"] as const) {
      expect(fixture[property], `the fixture and the real bulk bar disagree on ${property}`)
        .toBe(real[property]);
    }
    /*
     * Non-vacuity, stated as the defect's own signature rather than as a colour
     * I expect. The false positive made a select compute initial **black**
     * because `--text-primary` did not resolve; the value it should have is
     * whatever the real page has, which the loop above already pinned.
     */
    expect(fixture.selectColor, "the select fell back to the initial colour — the false positive is back")
      .not.toBe("rgb(0, 0, 0)");
    expect(fixture.selectToken, "the select resolved no custom property at all").not.toBe("");
  });

  test("the agreement holds in light too, so it is not a dark-only coincidence", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR", next: "/pt-BR/app" });
    await page.evaluate(
      ([key, choice]) => localStorage.setItem(key as string, choice as string),
      [APPEARANCE_STORAGE_KEY, "light"],
    );
    await page.goto("/pt-BR/app/search");
    await page.waitForSelector("select", { timeout: 20_000 });
    const real = await measure(page, "select");

    await renderFixture(page, SEARCH_FIXTURE, "light");
    const fixture = await measure(page, "#search-type");

    expect(real.theme).toBe("light");
    for (const property of ["theme", "rootToken", "bodyToken", "bodyBg", "selectColor", "selectBg"] as const) {
      expect(fixture[property], `light disagrees on ${property}`).toBe(real[property]);
    }
    // Two-sided against the dark run above: the palettes really are different,
    // so "they agree" is not "everything is the same everywhere".
    expect(real.bodyBg).not.toBe("rgb(20, 19, 17)");
  });
});
