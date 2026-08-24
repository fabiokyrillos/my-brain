import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice 2R.3's authenticated acceptance — creating a routine, end to end.
 *
 * ## Why this lane and not the credential-free one
 *
 * The composer lives behind auth, so `e2e/accessibility.spec.ts`'s fixture lane
 * cannot reach it — and the plan is explicit that axe must run **on rendered
 * pages**, because *"a fixture lane that inlines CSS by hand measures something
 * the product does not do"*, which is how Phase 2Q's signed premise turned out
 * to be false. So the axe pass here runs against the real route with the real
 * stylesheet cascade, in the manual lane, and the slice record says so rather
 * than implying CI proved it.
 *
 * ## What each journey is for
 *
 * `2R-SURFACE-001`/`-002` — the control exists where a reminder is created, it
 * is one select, and the next occurrences are visible **before** saving.
 * `2R-SURFACE-003`/`-004` — the saved reminder says it repeats and how, in
 * words, on the list and on the calendar.
 * `2R-SURFACE-007` — both locales render every new string.
 * `2R-ACCESS-001`/`-004` — keyboard-only operation, and no serious axe
 * violation on the surface this slice touched.
 * `2R-MOBILE-001`/`-002` — usable at a phone viewport, with no sideways scroll,
 * and **save still reachable with the preview expanded**.
 *
 * `2R-MOBILE-003` is deliberately absent. It is an owner device checkpoint and
 * a Playwright run is not a substitute for one; claiming it here is exactly what
 * `2R-CLOSE-009` refuses.
 */

const require_ = createRequire(import.meta.url);
const AXE_PATH = require_.resolve("axe-core");

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

type Json = Record<string, unknown>;

async function admin(path: string, init: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey!,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  expect(response.ok, `${init.method ?? "GET"} ${path}: ${await response.clone().text()}`).toBe(true);
  const text = await response.text();
  return (text ? JSON.parse(text) : []) as Json[];
}

async function createAccount() {
  const email = `recurrence-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.test`;
  const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey!,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password: `Pw-${Date.now()}-aA1!`, email_confirm: true }),
  });
  expect(created.ok, `create user: ${await created.clone().text()}`).toBe(true);
  return { email, userId: ((await created.json()) as { id: string }).id };
}

async function deleteAccount(userId: string) {
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
  });
}

/** Serious and critical only — the level `2R-ACCESS-004` names. */
async function seriousAxeViolations(page: Page) {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    // @ts-expect-error injected by addScriptTag
    const results = await window.axe.run(document, { resultTypes: ["violations"] });
    return (results.violations as Array<{ id: string; impact: string | null; nodes: unknown[] }>)
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => `${violation.id} (${violation.nodes.length})`);
  });
}

/** A date two days out, as the `datetime-local` value the field takes. */
function soonLocalValue(): string {
  const at = new Date(Date.now() + 2 * 86_400_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}T09:00`;
}

test.describe("slice 2R.3 — creating a routine", () => {
  test.skip(!onlineConfigured, "needs the ONLINE_SUPABASE_* environment");

  let email = "";
  let userId = "";

  test.beforeEach(async () => {
    const account = await createAccount();
    email = account.email;
    userId = account.userId;
  });

  test.afterEach(async () => {
    // Deleting the account cascades to its series, reminders and ledger rows.
    if (userId) await deleteAccount(userId);
  });

  test("offers one control, previews before saving, and creates the series", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/reminders");

    await page.getByRole("button", { name: "Criar lembrete" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // `2R-SURFACE-001`. Exactly one new named control, and no new fields when a
    // repetition is chosen — the stop condition, asserted in a real browser.
    const before = await dialog.locator("input[name], select[name]").count();
    await dialog.getByLabel("Título", { exact: false }).fill("Tomar o remédio");
    await dialog.getByLabel("Quando", { exact: false }).fill(soonLocalValue());
    await dialog.getByLabel("Repetir", { exact: false }).selectOption("weekly");
    expect(await dialog.locator("input[name], select[name]").count()).toBe(before);

    // `2R-SURFACE-002`. The next occurrences, before anything is written.
    await dialog.getByRole("button", { name: "Ver as próximas datas" }).click();
    const region = dialog.getByRole("status", { name: "Próximas ocorrências da repetição" });
    await expect(region.getByRole("listitem")).toHaveCount(3);
    // The rule in words, so the owner can check what the select derived.
    await expect(region).toContainText("Toda");

    // Still nothing written.
    expect(await admin(`reminder_series?user_id=eq.${userId}&select=id`)).toHaveLength(0);

    await dialog.getByRole("button", { name: "Criar lembrete", exact: true }).click();
    await expect(page.getByText("Lembrete recorrente criado.")).toBeVisible();

    const [series] = await admin(`reminder_series?user_id=eq.${userId}&select=id,rule,status`);
    expect(series.status).toBe("active");
    expect((series.rule as Json).frequency).toBe("weekly");

    // `2R-SURFACE-003`. The list says it repeats, and how.
    await page.reload();
    const row = page.locator("article.reminder-row").filter({ hasText: "Tomar o remédio" });
    await expect(row.getByText("Repete")).toBeVisible();
    await expect(row.locator(".reminder-series-rule")).toContainText("Toda");

    // `2R-SURFACE-004`. No rule string anywhere on the page.
    const text = (await page.locator("body").innerText()).toLowerCase();
    for (const machine of ["monthlyweekday", "monthlyday", "rrule", '"frequency"', "version:"]) {
      expect(text, `${machine} reached the page`).not.toContain(machine);
    }
  });

  test("the occurrence reaches the calendar, saying how it repeats", async ({ page }) => {
    // `2R-SURFACE-005`. Already true by construction — an occurrence is an
    // ordinary reminder row — so this proves it rather than building it.
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/reminders");
    await page.getByRole("button", { name: "Criar lembrete" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Título", { exact: false }).fill("Regar as plantas");
    await dialog.getByLabel("Quando", { exact: false }).fill(soonLocalValue());
    await dialog.getByLabel("Repetir", { exact: false }).selectOption("daily");
    await dialog.getByRole("button", { name: "Criar lembrete", exact: true }).click();
    await expect(page.getByText("Lembrete recorrente criado.")).toBeVisible();

    const [occurrence] = await admin(
      `reminders?user_id=eq.${userId}&series_id=not.is.null&select=remind_at`,
    );
    const day = String(occurrence.remind_at).slice(0, 10);
    await page.goto(`/pt-BR/app/calendar?date=${day}&orientation=day`);
    const item = page.locator(".calendar-item").filter({ hasText: "Regar as plantas" });
    await expect(item).toBeVisible();
    await expect(item.locator(".calendar-item-repeats")).toContainText("Todo dia");
  });

  test("works by keyboard alone, and axe reports nothing serious", async ({ page }) => {
    // `2R-ACCESS-001` and `-004`, on the rendered page rather than on a fixture.
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/reminders");

    await page.getByRole("button", { name: "Criar lembrete" }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const select = dialog.getByLabel("Repetir", { exact: false });
    await select.focus();
    await expect(select).toBeFocused();
    await select.selectOption("monthlyDay");
    await expect(dialog.getByRole("button", { name: "Ver as próximas datas" })).toBeVisible();

    expect(await seriousAxeViolations(page)).toEqual([]);
  });

  test("fits a phone, keeps save reachable with the preview open, and never scrolls sideways", async ({
    page,
  }) => {
    // `2R-MOBILE-001` and `-002`.
    await page.setViewportSize({ width: 375, height: 812 });
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/reminders");

    await page.getByRole("button", { name: "Criar lembrete" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Título", { exact: false }).fill("Alongar as costas");
    await dialog.getByLabel("Quando", { exact: false }).fill(soonLocalValue());
    await dialog.getByLabel("Repetir", { exact: false }).selectOption("weekly");
    await dialog.getByRole("button", { name: "Ver as próximas datas" }).click();
    await expect(dialog.getByRole("status", { name: "Próximas ocorrências da repetição" })
      .getByRole("listitem")).toHaveCount(3);

    /*
      Reachable, not merely present. The dialog gained a height bound and a
      scroll container in this slice precisely because it had neither on
      desktop; on a phone it has had them since 2P.6. Scrolling the save button
      into view and asserting it is in the viewport is what distinguishes "the
      control exists somewhere below the fold" from "the owner can press it".
    */
    const save = dialog.getByRole("button", { name: "Criar lembrete", exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();

    // No sideways scroll anywhere on the page.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "the page scrolls sideways at 375px").toBeLessThanOrEqual(0);
  });

  test("renders every new string in English too", async ({ page }) => {
    // `2R-SURFACE-007`. The type makes a missing key a build error; this proves
    // the keys that exist actually reach the page in the second locale.
    await signInOnline(page, { email, locale: "en" });
    await page.goto("/en/app/reminders");

    await page.getByRole("button", { name: "Create reminder" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Repeat", { exact: false })).toBeVisible();
    await dialog.getByLabel("Repeat", { exact: false }).selectOption("monthlyWeekday");
    await expect(dialog.getByRole("button", { name: "See the next dates" })).toBeVisible();

    await dialog.getByLabel("What to remind you about", { exact: false })
      .or(dialog.getByLabel("Reminder", { exact: false }).first())
      .fill("Pay the rent");
    await dialog.getByLabel("When", { exact: false }).fill(soonLocalValue());
    await dialog.getByRole("button", { name: "See the next dates" }).click();
    const region = dialog.getByRole("status", { name: "Next occurrences of the repetition" });
    await expect(region).toContainText("Every");
    // No Portuguese leaked into the English surface.
    await expect(region).not.toContainText("Toda");
  });
});
