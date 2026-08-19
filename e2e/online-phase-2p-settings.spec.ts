import { expect, test } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice 2P.5's authenticated acceptance — `2P-SETTINGS-001` … `-008` and
 * `2P-CHAT-004-MOBILE`.
 *
 * ## What only a real authenticated browser can answer
 *
 *  1. **The RSC boundary, times nine.** Slice 2P.5 adds a layout, a parent page
 *     and a dynamic-segment page over eight sections. Every one compiles and is
 *     unit-tested, and neither fact means any of them renders in production —
 *     the failure this repository recorded as *"the RSC boundary is only tested
 *     in production"*, where two surfaces shipped green and never rendered.
 *     CI's foundation journey is unauthenticated and cannot reach `/app/settings`
 *     at all.
 *  2. **Deep links, back and forward.** A section's URL is a routing claim, and
 *     `history.back()` is the only thing that can falsify it. A redirect from
 *     the parent would trap the button, which is why there is none — and why a
 *     test has to press it.
 *  3. **That a save refreshes the surface.** Slice 2P.4 measured four different
 *     mechanisms against the deployed app and three of them silently did
 *     nothing under a dynamic `[locale]` segment. Nothing below the browser can
 *     see that: the write commits either way.
 *  4. **That a failed save keeps what was typed and names its section.** The
 *     unit test proves the state is returned; only a navigation proves it is on
 *     the screen and that the input survived it.
 *  5. **That no BYOK key is on the page.** A guard can prove the component does
 *     not read one. Only the rendered document can prove nothing put one there.
 *
 * ## The account is disposable and its cascade cleans it up
 *
 * The same fixture shape the other online lanes use. This one writes at most one
 * profile row and one policy row, and both go with the account.
 *
 * **No BYOK credential is ever saved here**, so no provider call happens and no
 * credit is spent. The AI section is opened and read; it is not exercised.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && serviceRoleKey && publishableKey);

/** The eight, and the URL each one is claimed to have. */
const SECTIONS = [
  { slug: "", name: "Geral" },
  { slug: "/assistant", name: "Assistente" },
  { slug: "/ai", name: "IA" },
  { slug: "/planning", name: "Planejamento" },
  { slug: "/notifications", name: "Notificações" },
  { slug: "/privacy", name: "Privacidade e dados" },
  { slug: "/appearance", name: "Aparência" },
  { slug: "/account", name: "Conta" },
] as const;

test.describe("Settings is eight sections, each with its own URL", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-settings-${crypto.randomUUID()}@example.com`;
  const password = `Settings!${crypto.randomUUID()}A7`;
  let userId: string | undefined;

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
        user_metadata: { display_name: "Settings E2E" },
      }),
    });
    expect(response.ok).toBe(true);
    userId = ((await response.json()) as { id: string }).id;
  });

  test.afterAll(async () => {
    if (!userId) return;
    const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(deletion.ok).toBe(true);
  });

  test("`2P-SETTINGS-001`/`-002`: every section renders at its own URL, entered directly", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });

    for (const section of SECTIONS) {
      // Entered directly rather than clicked: a deep link is a claim about what
      // a cold navigation produces, and clicking through would never test it.
      await page.goto(`/pt-BR/app/settings${section.slug}`);

      // The RSC assertion, per section: it rendered at all.
      await expect(page.getByRole("heading", { level: 1, name: "Configurações" })).toBeVisible();
      const panel = page.locator("#settings-panel");
      await expect(panel, `${section.name} did not render`).toBeVisible();
      await expect(panel).toHaveAttribute("aria-label", section.name);
      await expect(panel).toHaveAttribute("data-settings-section", section.slug.slice(1) || "general");

      // …and the nav says which one you are in, to a screen reader as well.
      await expect(
        page.getByRole("navigation", { name: "Seções das configurações" })
          .getByRole("link", { name: section.name, exact: true }),
      ).toHaveAttribute("aria-current", "page");
    }
  });

  test("`2P-SETTINGS-002`: back and forward mean what they mean", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/settings");
    await expect(page.locator("#settings-panel")).toHaveAttribute("aria-label", "Geral");

    const nav = page.getByRole("navigation", { name: "Seções das configurações" });
    await nav.getByRole("link", { name: "Aparência" }).click();
    await expect(page).toHaveURL(/\/pt-BR\/app\/settings\/appearance$/);
    await expect(page.locator("#settings-panel")).toHaveAttribute("aria-label", "Aparência");

    await nav.getByRole("link", { name: "Conta" }).click();
    await expect(page).toHaveURL(/\/pt-BR\/app\/settings\/account$/);

    /*
      The back-button trap this design exists to avoid.

      A redirect from `/app/settings` to `/app/settings/general` would make the
      first `goBack()` below land on the parent and be sent straight forward
      again — so the reader could never leave. There is no redirect, and this is
      what proves it: two steps back reach Geral and stop there.
    */
    await page.goBack();
    await expect(page).toHaveURL(/\/pt-BR\/app\/settings\/appearance$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/pt-BR\/app\/settings$/);
    await expect(page.locator("#settings-panel")).toHaveAttribute("aria-label", "Geral");

    await page.goForward();
    await expect(page).toHaveURL(/\/pt-BR\/app\/settings\/appearance$/);
    await expect(page.locator("#settings-panel")).toHaveAttribute("aria-label", "Aparência");
  });

  test("focus follows a section change, and does not steal it on arrival", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/settings");

    // On arrival the panel must NOT hold focus: the skip link is first in DOM
    // order precisely so a keyboard reader meets it first.
    await expect(page.locator("#settings-panel")).not.toBeFocused();

    await page.getByRole("navigation", { name: "Seções das configurações" })
      .getByRole("link", { name: "Planejamento" })
      .click();

    // On a change it must: otherwise a screen-reader user activates the link and
    // the content behind them silently becomes something else.
    await expect(page.locator("#settings-panel")).toBeFocused();
    await expect(page.locator("#settings-panel")).toHaveAttribute("aria-label", "Planejamento");
  });

  test("`2P-SETTINGS-004`: saving one section leaves another's stored value alone", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });

    // Change something in Assistente, and read it back.
    await page.goto("/pt-BR/app/settings/assistant");
    /*
      By id, which is the convention the other online lanes already use for a
      select — `online-ai-configuration.spec.ts` picks `#chat-model` the same
      way.

      `getByLabel("Tom")` does not work here, and the reason is worth recording
      so nobody reads it as a defect. The label WRAPS its select, so Playwright's
      label locator takes the label element's whole `textContent` and reports the
      control as `TomDiretoInformalNaturalProfissional`. That is Playwright's
      naive label text rather than the accessible name Chromium computes — the
      accname algorithm contributes an embedded control's VALUE, not all of its
      options — and `settings-form.test.tsx` finds the same control by "Tom" in
      jsdom. So it is a locator quirk to route around, and routing around it by
      id keeps the assertion pointed at the control rather than at a name.
    */
    await page.locator("#tone").selectOption("professional");
    await page.getByRole("button", { name: "Salvar preferências" }).click();
    await expect(page.getByRole("status")).toBeVisible();

    /*
      Read back from the SERVER, by leaving and coming back rather than by
      trusting the select.

      Every field in this form is uncontrolled, so after a click the DOM holds
      the owner's own choice whatever the server did — the exact false positive
      slice 2P.4's journey found on the automation select.
    */
    await page.goto("/pt-BR/app/settings/assistant");
    await expect(page.locator("#tone")).toHaveValue("professional");

    // Now save a DIFFERENT section, changing something it owns.
    await page.goto("/pt-BR/app/settings/planning");
    await page.locator("#max-followups").fill("7");
    await page.getByRole("button", { name: "Salvar preferências" }).click();
    await expect(page.getByRole("status")).toBeVisible();

    // Its own value landed…
    await page.goto("/pt-BR/app/settings/planning");
    await expect(page.locator("#max-followups")).toHaveValue("7");

    // …and Assistente's is untouched. This is the whole requirement: before the
    // section-scoped writer, Planejamento's save would have sent four fields and
    // blanked the other thirteen.
    await page.goto("/pt-BR/app/settings/assistant");
    await expect(page.locator("#tone")).toHaveValue("professional");
  });

  test("`2P-SETTINGS-007`: a failed save keeps the input and names the section", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/settings/assistant");

    /*
      The failure is provoked at the schema rather than by breaking the network,
      because that is the failure a person actually meets: `agentName` is bounded
      1–60 to match the column's own CHECK, and the browser's `maxLength` is
      removed here so the submission really reaches the action.

      A network failure would prove the same code path and would also prove
      nothing about which section the message names, because the action would
      never see the payload.
    */
    const name = page.locator("#agent-name");
    await name.evaluate((input) => input.removeAttribute("maxlength"));
    await name.fill("x".repeat(80));
    await page.getByRole("button", { name: "Salvar preferências" }).click();

    // It says so, as an alert — a failure the reader must notice.
    const alert = page.locator(".settings-feedback[role='alert']");
    await expect(alert).toBeVisible();
    await expect(alert, "the failure does not name its section").toContainText("Assistente");

    // And the input is still theirs: the action returns rather than redirecting
    // or revalidating, so React keeps the form it is holding.
    await expect(name).toHaveValue("x".repeat(80));
  });

  test("`2P-SETTINGS-006`: the BYOK panel exposes no key, and the page contains none", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/settings/ai");

    await expect(page.locator(".byok-panel")).toBeVisible();

    /*
      No credential is saved by this lane, so the strongest available claim is
      that the surface offers no way to read one back and carries no value
      shaped like a key. Both halves matter: a reveal control would be a way in,
      and a rendered `sk-…` would be a leak with no control at all.
    */
    const document = (await page.locator("body").innerText()).toLowerCase();
    expect(document).not.toContain("sk-");
    for (const forbidden of ["mostrar chave", "revelar", "reveal key", "show key"]) {
      expect(document, `the panel offers to reveal the key: ${forbidden}`).not.toContain(forbidden);
    }
    // The input is write-only: a password field with no value attribute.
    const field = page.locator('.byok-form input[name="apiKey"]');
    await expect(field).toHaveAttribute("type", "password");
    await expect(field).toHaveValue("");
  });

  test("`2P-SETTINGS-008`: Notificações is history, and its controls are in Settings", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/notifications");

    // The page it became.
    await expect(page.getByRole("heading", { level: 1, name: "Notificações" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Avisos recebidos" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText(/aviso/i);

    // The controls it no longer holds. Asserted as absence WITH the positive
    // control above, because an absence assertion passes on a page that never
    // rendered.
    await expect(page.getByRole("heading", { name: "Notificações no aparelho" })).toHaveCount(0);
    await expect(page.locator(".push-controls")).toHaveCount(0);
    await expect(page.getByLabel("Limite diário")).toHaveCount(0);

    // Exactly one discreet way back, and it goes where the controls went.
    const link = page.getByRole("link", { name: "Ajustar preferências de notificação" });
    await expect(link).toHaveCount(1);
    await link.click();
    await expect(page).toHaveURL(/\/pt-BR\/app\/settings\/notifications$/);
    await expect(page.getByRole("heading", { name: "Notificações no aparelho" })).toBeVisible();
  });

  test("no automation was enabled, and the thresholds read as signed rather than proposed", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/settings/assistant");

    const section = page.locator(".automation-section");
    await expect(section.getByText(/nenhuma categoria age sozinha/i)).toBeVisible();
    await expect(section.getByText(/Os mínimos abaixo estão assinados por você/)).toBeVisible();
    // Six categories, six refusals, and not one eligible.
    await expect(page.getByText("Configurada para apenas sugerir.")).toHaveCount(6);
    await expect(section.locator(".automation-state-active")).toHaveCount(0);

    // The four with no producer say waiting changes nothing, rather than showing
    // a zero that reads as "not enough yet".
    await expect(page.getByText(/esperar não muda isso/i)).toHaveCount(4);
  });
});

test.describe("the mobile bar is the handoff's bar", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-mobilebar-${crypto.randomUUID()}@example.com`;
  const password = `Bar!${crypto.randomUUID()}A7`;
  let userId: string | undefined;

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
        user_metadata: { display_name: "Mobile Bar E2E" },
      }),
    });
    expect(response.ok).toBe(true);
    userId = ((await response.json()) as { id: string }).id;
  });

  test.afterAll(async () => {
    if (!userId) return;
    const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(deletion.ok).toBe(true);
  });

  test("`2P-CHAT-004-MOBILE`: five slots, Brain among them, and nothing stranded", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/pt-BR/app");

    const bar = page.getByRole("navigation", { name: "Navegação móvel" });
    await expect(bar.locator(":scope > a")).toHaveCount(5);
    await expect(bar.locator(":scope > details")).toHaveCount(0);
    await expect(bar.getByRole("link", { name: "Brain" })).toBeVisible();

    // The account, in the header, without opening anything else first.
    const account = page.locator(".top-account .account-menu-header");
    await expect(account).toBeVisible();
    await account.locator("summary").click();
    await expect(account.getByRole("link", { name: "Configurações" })).toBeVisible();
    await expect(account.getByRole("button", { name: "Sair da conta" })).toBeVisible();

    // Perguntas, from Registros, with no open question to produce a link.
    await page.goto("/pt-BR/app/inbox");
    const questions = page.getByRole("link", { name: "Ver perguntas pendentes" });
    await expect(questions).toBeVisible();
    await questions.click();
    await expect(page).toHaveURL(/\/pt-BR\/app\/questions$/);

    // Conversation, as Brain's first lens — which is what `2P-CHAT-004` says it
    // is, and now one tap from a bar slot.
    await page.goto("/pt-BR/app/library");
    await expect(page.getByRole("link", { name: "Conversar", exact: true }).first()).toBeVisible();
  });

  test("the bar and the settings nav survive a phone viewport without sideways scroll", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.setViewportSize({ width: 375, height: 812 });

    for (const path of ["/pt-BR/app/settings", "/pt-BR/app/settings/privacy", "/pt-BR/app/notifications"]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(1);
    }

    // `2P-SETTINGS-003`: a list, not an overflowing tab row. The eight links
    // stack, so the last one is far below the first rather than off to its side.
    await page.goto("/pt-BR/app/settings");
    const nav = page.getByRole("navigation", { name: "Seções das configurações" });
    const first = await nav.getByRole("link", { name: "Geral" }).boundingBox();
    const last = await nav.getByRole("link", { name: "Conta" }).boundingBox();
    expect(last!.y).toBeGreaterThan(first!.y);
    expect(Math.abs(last!.x - first!.x)).toBeLessThanOrEqual(1);

    // Every section link is a real target on a phone.
    for (const section of SECTIONS) {
      const box = await nav.getByRole("link", { name: section.name, exact: true }).boundingBox();
      expect(box?.height ?? 0, `${section.name} is under the touch target`).toBeGreaterThanOrEqual(44);
    }

    // Safe areas: the bar sits above the home indicator rather than under it.
    const barBox = await page.getByRole("navigation", { name: "Navegação móvel" }).boundingBox();
    expect(barBox!.y + barBox!.height).toBeLessThanOrEqual(812);
  });
});
