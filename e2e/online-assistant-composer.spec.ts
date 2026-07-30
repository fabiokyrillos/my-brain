import { expect, test } from "@playwright/test";

/**
 * Slice E's authenticated acceptance for the unified composer (UX-07).
 *
 * Runs against the linked live database with a disposable account created and
 * deleted by the deployment-session harness — the same mechanism
 * `online-mobile-navigation.spec.ts` established. Credentials never appear in
 * source, in a fixture name or in an assertion.
 *
 * The order of the cases is chosen around cost as well as coverage. Everything
 * up to the last case is **deterministic**: the composer's structure, the
 * submission refusals and the proposed-memory route all resolve without a
 * provider call, so the expensive evidence is spent once, on the one thing only
 * a live round can prove — that a question still reaches its grounded answer
 * through the `not_a_task_command` fallthrough rather than through a second
 * form.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

const strings = {
  "pt-BR": {
    loginEmail: "E-mail",
    loginPassword: "Senha",
    loginSubmit: "Entrar",
    composerLabel: "O que você quer dizer ao Brain?",
    submit: "Enviar",
    hint: "Enter envia · Shift+Enter quebra a linha",
    memoryText: "Lembre disso sempre: eu reviso faturas às sextas",
    memoryHeading: "Isso parece algo para guardar como memória",
    memoryNextStep: "Criar essa memória em Memórias",
    echoLabel: "Você escreveu",
    emptyHeading: "Escreva algo primeiro",
    memoriesPath: "/pt-BR/app/memories",
    emptyMemories: "Nenhuma memória ainda",
  },
  en: {
    // Not localized: the login form renders the literal `E-mail` in both
    // locales, as `account-session.spec.ts` already records.
    loginEmail: "E-mail",
    loginPassword: "Password",
    loginSubmit: "Sign in",
    composerLabel: "What do you want to tell Brain?",
    submit: "Send",
    hint: "Enter sends · Shift+Enter adds a line",
    memoryText: "Remember this always: I review invoices on Fridays",
    memoryHeading: "That looks like something to keep as a memory",
    memoryNextStep: "Create this memory in Memories",
    echoLabel: "You wrote",
    emptyHeading: "Write something first",
    memoriesPath: "/en/app/memories",
    emptyMemories: "No memories yet",
  },
} as const;

test.describe("the unified composer", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-composer-${crypto.randomUUID()}@example.com`;
  const password = `Composer!${crypto.randomUUID()}A7`;
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
        user_metadata: { display_name: "Composer E2E" },
      }),
    });
    expect(response.ok).toBe(true);
    userId = ((await response.json()) as { id: string }).id;
  });

  // Fail-closed: the disposable account is removed whatever the journey did, so
  // a failing assertion cannot leave a user behind.
  test.afterAll(async () => {
    if (!userId) return;
    const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(deletion.ok).toBe(true);
  });

  for (const locale of ["pt-BR", "en"] as const) {
    test(`presents one composer and routes without a mode switch — ${locale}`, async ({ page }, testInfo) => {
      const text = strings[locale];
      const mobile = testInfo.project.name === "mobile";

      await page.goto(`/${locale}/auth/login`);
      await page.getByLabel(text.loginEmail).fill(email);
      await page.getByLabel(text.loginPassword).fill(password);
      await page.getByRole("button", { name: text.loginSubmit }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/app$`), { timeout: 30_000 });

      await page.goto(`/${locale}/app/chat`);

      // UX-07's acceptance, asserted structurally: the page carries exactly one
      // permanent primary text field. Before Slice E it carried two, plus a
      // third inside each proactive question card.
      const composer = page.getByLabel(text.composerLabel);
      await expect(composer).toBeVisible();
      await expect(page.locator(".assistant-composer-form textarea")).toHaveCount(1);
      await expect(page.locator(".chat-form")).toHaveCount(0);
      await expect(page.locator(".task-command-form")).toHaveCount(0);

      // No mode to choose before typing (DEC-3).
      await expect(page.locator(".assistant-composer").getByRole("radiogroup")).toHaveCount(0);
      await expect(page.locator(".assistant-composer").getByRole("combobox")).toHaveCount(0);

      await expect(page.getByText(text.hint)).toBeVisible();

      const submit = page.getByRole("button", { name: text.submit });
      if (mobile) {
        // 44×44 on both controls, and the composer must not overflow the
        // viewport at Pixel 7's width.
        const submitBox = await submit.boundingBox();
        expect(submitBox?.height ?? 0).toBeGreaterThanOrEqual(44);
        const composerBox = await composer.boundingBox();
        expect(composerBox?.height ?? 0).toBeGreaterThanOrEqual(44);
        expect((await page.locator("body").boundingBox())?.width ?? 0)
          .toBeLessThanOrEqual(page.viewportSize()!.width);
      }

      // An empty submission is refused before any provider call, with localized
      // copy rather than a browser-default bubble.
      await composer.fill("   ");
      await submit.click();
      // Addressed by role: the same sentence is also in the polite live region,
      // which is the announcement working rather than a duplicate to avoid.
      await expect(page.getByRole("heading", { name: text.emptyHeading }))
        .toBeVisible({ timeout: 30_000 });

      // The proposed-memory route (DEC-5): recognised without a provider call,
      // it names what was understood, echoes what the user wrote, and offers a
      // link rather than anything that could persist.
      await composer.fill(text.memoryText);
      await submit.click();
      const notice = page.locator(".assistant-composer-notice");
      await expect(notice).toBeVisible({ timeout: 30_000 });
      await expect(notice).toHaveAttribute("data-route", "memory_intent");
      await expect(notice.getByRole("heading", { name: text.memoryHeading })).toBeVisible();
      await expect(notice.getByText(text.echoLabel)).toBeVisible();
      const nextStep = notice.getByRole("link", { name: text.memoryNextStep });
      await expect(nextStep).toHaveAttribute("href", text.memoriesPath);

      // Nothing was written. The memories surface still renders its empty state
      // for this account, which is the whole of DEC-5's guarantee for Slice E.
      await page.goto(text.memoriesPath);
      await expect(page.locator(".list-row")).toHaveCount(0);
      await expect(page.getByText(text.emptyMemories)).toBeVisible();
    });
  }

  test("a question still reaches its grounded answer through the fallthrough", async ({ page }) => {
    const text = strings["pt-BR"];

    await page.goto("/pt-BR/auth/login");
    await page.getByLabel(text.loginEmail).fill(email);
    await page.getByLabel(text.loginPassword).fill(password);
    await page.getByRole("button", { name: text.loginSubmit }).click();
    await expect(page).toHaveURL(/\/pt-BR\/app$/, { timeout: 30_000 });

    await page.goto("/pt-BR/app/chat");
    await page.getByLabel(text.composerLabel).fill("O que eu combinei com a Marina?");
    await page.getByRole("button", { name: text.submit }).click();

    // The command parse declines with `not_a_task_command`, the composer routes
    // to the knowledge answer, and the answer redirects into its thread — the
    // pre-Slice-E behaviour of a question, reached from the one field.
    await expect(page).toHaveURL(/\/pt-BR\/app\/chat\/[0-9a-f-]+$/, { timeout: 180_000 });
    await expect(page.locator(".chat-message.assistant")).toBeVisible();

    // And the thread carries the same one composer, not a second pair of fields.
    await expect(page.locator(".assistant-composer-form textarea")).toHaveCount(1);
    await expect(page.locator(".chat-form")).toHaveCount(0);
  });
});
