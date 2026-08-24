import { expect, test, type Page } from "@playwright/test";

import { mintOnlineAccessToken, signInOnline } from "./support/online-session";

/**
 * The **second** device checkpoint's three findings, in a real browser —
 * slice 2R.3, corrective round two.
 *
 * ## What these are for, and what they are not
 *
 * `2R-MOBILE-003` is an owner device checkpoint and **nothing here discharges
 * it**. `2R-CLOSE-009` refuses a record that closes a device checkpoint with a
 * Playwright run, and this file makes no such claim. Its job is the layer
 * between a jsdom unit test and an iPhone, because all three defects live in
 * behaviours jsdom models rather than performs:
 *
 *   * React's post-action **form reset** — jsdom runs React, so this one is
 *     reproducible there, but only a browser proves the fix under a real
 *     submission;
 *   * a document that **actually scrolls** — jsdom has no layout, so a page
 *     without a scroll lock and a page with one look identical to it;
 *   * a backdrop that **actually receives pointer events**, including a drag
 *     that begins inside a field and ends outside the panel.
 *
 * ## Why a file of its own rather than the recurrence lane
 *
 * `online-phase-2r-recurrence.spec.ts` resolves `axe-core` through
 * `createRequire(import.meta.url)`, and that spec cannot be listed or run in
 * this repository's Windows development environment at all — Playwright's
 * loader transforms it to CommonJS and Node then refuses the `import.meta`.
 * That is a pre-existing condition, unrelated to this slice and reproduced
 * against the pristine file before anything was added to it. Putting these
 * journeys there would have made them unrunnable for the same reason, so they
 * live here, where they can actually be executed.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

type Json = Record<string, unknown>;

/**
 * Reads a table **as the owner**, never as the service role.
 *
 * Not a stylistic choice: `public.reminder_series` grants `authenticated`
 * select and nothing else, so a service-role read of it comes back
 * `42501 permission denied` — which the first run of this file demonstrated. The
 * owner's own token is both the only key that works and the more honest one,
 * because it reads the row through the same boundary the product does, with RLS
 * applied.
 */
async function asOwner(owner: string, path: string) {
  const { accessToken } = await mintOnlineAccessToken({
    email: owner,
    publishableKey: publishableKey!,
    serviceRoleKey: serviceRoleKey!,
    supabaseUrl: supabaseUrl!,
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: publishableKey!,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
  });
  expect(response.ok, `GET ${path}: ${await response.clone().text()}`).toBe(true);
  const text = await response.text();
  return (text ? JSON.parse(text) : []) as Json[];
}

async function createAccount() {
  const email = `checkpoint-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.test`;
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
  const user = (await created.json()) as { id: string };
  return { email, userId: user.id };
}

async function deleteAccount(userId: string) {
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
  });
}

test.describe("slice 2R.3 — the second device checkpoint's findings", () => {
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

  const openComposer = async (page: Page) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/reminders");
    // `copy.creation.open` is *Novo lembrete*; *Criar lembrete* is the SAVE.
    await page.getByRole("button", { name: "Novo lembrete" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    return dialog;
  };

  /** The composer with a title, an instant and `weekly` already chosen. */
  const openWeekly = async (page: Page) => {
    const dialog = await openComposer(page);
    await dialog.getByLabel("O que lembrar", { exact: false }).fill("Academia");
    // 2026-12-07 is a Monday, so the date seeds day 1; the owner adds 3 and 5.
    await dialog.getByLabel("Quando avisar", { exact: false }).fill("2026-12-07T07:00");
    await dialog.getByLabel("Repetir", { exact: false }).selectOption("weekly");
    return dialog;
  };

  const ticked = (page: Page) => page.locator('input[name="weekdays"]:checked');

  test("the days stay ticked across the preview, and the save carries them", async ({ page }) => {
    /*
      DEFECT ONE, as reported: *"Ao selecionar segunda, quarta e sexta e tocar em
      'Ver próximas datas', os dias ficam visualmente desmarcados. Apesar de
      desmarcados na interface, a prévia continua correta."*

      It was never only visual. React resets a form it submitted once the action
      settles, and the reset returns every control to its `defaultChecked` — so
      the preview, computed from the `FormData` captured at submit time, was
      right, and the save that followed read the DOM the reset had emptied. The
      dialog showed three days, promised three days, and wrote one.
    */
    const dialog = await openWeekly(page);
    await dialog.getByLabel("quarta-feira", { exact: false }).check();
    await dialog.getByLabel("sexta-feira", { exact: false }).check();
    await expect(ticked(page)).toHaveCount(3);

    await dialog.getByRole("button", { name: "Ver as próximas datas" }).click();
    const region = dialog.getByRole("status", { name: "Próximas ocorrências da repetição" });
    await expect(region.getByRole("listitem")).toHaveCount(3);

    // THE ASSERTION THE CHECKPOINT WOULD HAVE MADE.
    await expect(ticked(page), "the preview unticked the days").toHaveCount(3);

    // And the half the checkpoint could not see: what actually gets written.
    await dialog.getByRole("button", { name: "Criar lembrete", exact: true }).click();
    await expect(page.getByText("Lembrete recorrente criado.")).toBeVisible();
    const [series] = await asOwner(email, "reminder_series?select=rule");
    expect((series.rule as Json).weekdays).toEqual([1, 3, 5]);
  });

  test("the page behind does not scroll while the dialog is open", async ({ browserName, page }) => {
    /*
      DEFECT TWO. jsdom cannot answer this at all: it performs no layout, so a
      page with a scroll lock and a page without one are indistinguishable
      there. Only a real document says whether it moved.
    */
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/reminders");
    // Give the document something to scroll, whatever the account holds.
    await page.addStyleTag({ content: "body::after{content:'';display:block;height:3000px}" });
    await page.evaluate(() => window.scrollTo(0, 400));
    const before = await page.evaluate(() => window.scrollY);
    expect(before, "the page never scrolled, so this would prove nothing").toBeGreaterThan(0);

    /*
      Opened from the page rather than through Playwright's own click.

      `locator.click()` scrolls its target into view first, and the opener is at
      the top of a page this test has deliberately scrolled away from — so
      Playwright put the document back to zero before the lock ever engaged, and
      the round trip below measured the harness instead of the product. The
      first version of this test did exactly that, and read `top: 0px`.
    */
    await page.evaluate(() => {
      const open = [...document.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Novo lembrete"));
      open?.click();
    });
    await expect(page.getByRole("dialog")).toBeVisible();
    // The offset the lock captured, which is the one it owes back.
    expect(await page.evaluate(() => document.body.style.top)).toBe(`-${before}px`);

    /*
      Three inputs, and the engine decides which are available.

      Mobile WebKit — the `iphone-emulated` project, the closest thing here to
      the device the checkpoint was performed on — has no mouse wheel at all and
      throws rather than ignoring one. So the wheel runs where there is one, and
      the key and the programmatic scroll run everywhere: with the body out of
      flow there is no scrolling box for any of them to move.
    */
    if (browserName !== "webkit") {
      await page.mouse.move(10, 300);
      await page.mouse.wheel(0, 900);
    }
    await page.keyboard.press("End");
    await page.evaluate(() => window.scrollBy(0, 900));
    expect(await page.evaluate(() => window.scrollY), "the page moved behind the dialog").toBe(0);
    // Held by taking the body out of flow, which is the only technique iOS honours.
    expect(await page.evaluate(() => getComputedStyle(document.body).position)).toBe("fixed");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    // *"Ao fechar, a página retorna exatamente à posição anterior."*
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });

  test("tapping outside closes a clean dialog and asks about a written one", async ({ page }) => {
    // DEFECT THREE. The backdrop had no handler at all, so an outside tap did
    // nothing — on every dialog in the product, not only this one.
    const backdrop = page.locator(".task-command-dialog-backdrop");
    await openComposer(page);

    // Clean: an outside tap is cancel, and cancel is safe.
    await backdrop.click({ position: { x: 8, y: 8 } });
    await expect(page.getByRole("dialog")).toBeHidden();

    // Written: it asks, and going back changes nothing.
    // `copy.creation.open` is *Novo lembrete*; *Criar lembrete* is the SAVE.
    await page.getByRole("button", { name: "Novo lembrete" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("O que lembrar", { exact: false }).fill("Academia");
    await dialog.getByLabel("Marcar como importante", { exact: false }).check();
    await backdrop.click({ position: { x: 8, y: 8 } });

    await expect(page.getByText("Descartar este lembrete? O que você escreveu será perdido.")).toBeVisible();
    await page.getByRole("button", { name: "Continuar editando" }).click();
    await expect(dialog.getByLabel("O que lembrar", { exact: false })).toHaveValue("Academia");
    await expect(dialog.getByLabel("Marcar como importante", { exact: false })).toBeChecked();

    // And discarding is what closes it — without writing anything.
    await backdrop.click({ position: { x: 8, y: 8 } });
    await page.getByRole("button", { name: "Descartar" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(await asOwner(email, "reminders?select=id")).toHaveLength(0);
  });

  test("Escape follows the same rule as the backdrop", async ({ page }) => {
    await openComposer(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog"), "a clean dialog should simply close").toBeHidden();

    await page.getByRole("button", { name: "Novo lembrete" }).click();
    await page.getByRole("dialog").getByLabel("O que lembrar", { exact: false }).fill("Academia");
    await page.keyboard.press("Escape");
    await expect(page.getByText("Descartar este lembrete? O que você escreveu será perdido.")).toBeVisible();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("a drag that starts in a field and ends outside does not dismiss", async ({ page }) => {
    /*
      Selecting the text of a field and releasing past the edge of the panel
      produces a `click` whose target IS the backdrop. This is the case jsdom
      can only simulate by synthesising the two events by hand; here the pointer
      really travels.
    */
    const dialog = await openComposer(page);
    const field = dialog.getByLabel("O que lembrar", { exact: false });
    await field.fill("Academia");

    const box = (await field.boundingBox())!;
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(8, 8, { steps: 8 });
    await page.mouse.up();

    await expect(dialog).toBeVisible();
    await expect(page.getByText("Descartar este lembrete? O que você escreveu será perdido.")).toBeHidden();
  });
});
