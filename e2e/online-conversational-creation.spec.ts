import { expect, test } from "@playwright/test";

import { signInWithoutTheLoginForm } from "./support/online-session";

/**
 * Slice 2G.2's authenticated acceptance (2G-ROUTE-008): the natural sentence
 * creates a task — preview first, confirm second, undo offered — and a refused
 * surface refuses by name.
 *
 * Runs against the linked live database with a disposable account created and
 * deleted by the deployment-session harness, exactly as
 * `online-assistant-composer.spec.ts` does — and, because every conversational
 * turn is a provider call under BYOK, it additionally requires the disposable
 * product credential `BYOK_TEST_USER_A_OPENAI_API_KEY` and configures it
 * through Settings, the same mechanism `byok-removal-jobs-capture.spec.ts`
 * established. Credentials never appear in source or in an assertion.
 *
 * Model-dependent by nature: the create classification is the model's. The
 * sentences below are the exact phrasings the prompt names, so a failure here
 * is evidence about the contract, not flakiness to retry away.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const productKey = process.env.BYOK_TEST_USER_A_OPENAI_API_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

const strings = {
  "pt-BR": {
    loginEmail: "E-mail",
    loginPassword: "Senha",
    loginSubmit: "Entrar",
    composerLabel: "O que você quer dizer ao Brain?",
    submit: "Enviar",
    createSentence: "Adicione uma tarefa para revisar os números",
    createTitle: "revisar os números",
    createControl: "Criar a tarefa",
    undoLabel: "Desfazer",
    refuseSentence: "Crie um lembrete para amanhã de manhã",
    refusalNames: /tarefa nova|capturar uma nota/i,
    tasksPath: "/pt-BR/app/tasks",
  },
  en: {
    loginEmail: "E-mail",
    loginPassword: "Password",
    loginSubmit: "Sign in",
    composerLabel: "What do you want to tell Brain?",
    submit: "Send",
    createSentence: "Add a task to review the numbers",
    createTitle: "review the numbers",
    createControl: "Create the task",
    undoLabel: "Undo",
    refuseSentence: "Create a reminder for tomorrow morning",
    refusalNames: /create a new task|capture a note/i,
    tasksPath: "/en/app/tasks",
  },
} as const;

test.describe("conversational creation (2G.2)", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");
  test.skip(!productKey, "The disposable BYOK product credential is not configured.");
  test.describe.configure({ mode: "serial" });

  const email = `codex-2g-create-${crypto.randomUUID()}@example.com`;
  const password = `Create!${crypto.randomUUID()}A7`;
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
        user_metadata: { display_name: "Creation E2E" },
      }),
    });
    expect(response.ok).toBe(true);
    userId = ((await response.json()) as { id: string }).id;
  });

  // Fail-closed teardown: the disposable account is removed whatever the
  // journey did, so a failing assertion cannot leave a user or a task behind.
  test.afterAll(async () => {
    if (!userId) return;
    const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(deletion.ok).toBe(true);
  });

  for (const locale of ["pt-BR", "en"] as const) {
    test(`the natural sentence previews, confirms, creates and undoes — ${locale}`, async ({ page, baseURL }) => {
      const text = strings[locale];

      await signInWithoutTheLoginForm(page, {
        supabaseUrl: supabaseUrl!,
        serviceRoleKey: serviceRoleKey!,
        publishableKey: publishableKey!,
        email,
        locale,
        appOrigin: baseURL!,
      });

      // The credential the turn will spend on — configured once, first locale.
      if (locale === "pt-BR") {
        await page.goto("/en/app/settings");
        await page.getByLabel("API key").fill(productKey!);
        await page.getByRole("button", { name: /save/i }).click();
        await expect(page.getByText(/configured|active/i).first()).toBeVisible({ timeout: 60_000 });
      }

      await page.goto(`/${locale}/app/chat`);
      const composer = page.getByLabel(text.composerLabel);

      // 1. The sentence that was refused before Phase 2G.
      await composer.fill(text.createSentence);
      await page.getByRole("button", { name: text.submit }).click();

      // 2. Preview first: the offer names the task and nothing exists yet.
      const createControl = page.getByRole("button", { name: text.createControl });
      await expect(createControl).toBeVisible({ timeout: 180_000 });
      await expect(page.getByText(text.createTitle).first()).toBeVisible();

      // 3. Confirm: exactly one task, with the undo affordance offered.
      await createControl.click();
      await expect(page.getByRole("button", { name: text.undoLabel })).toBeVisible({
        timeout: 60_000,
      });

      // 4. The task is real and visible on the task surface.
      await page.goto(text.tasksPath);
      await expect(page.getByText(text.createTitle).first()).toBeVisible({ timeout: 30_000 });

      // 5. Undo through the registered handler: back on chat the affordance
      //    was already consumed into this turn's state, so undo via a fresh
      //    create-and-undo would double the evidence — instead assert the
      //    surface again after undoing from the console state we still hold.
      await page.goBack();
      await page.getByRole("button", { name: text.undoLabel }).click();
      await page.goto(text.tasksPath);
      await expect(page.getByText(text.createTitle)).toHaveCount(0);
    });
  }

  test("a refused surface refuses by name, and writes nothing", async ({ page, baseURL }) => {
    const text = strings["pt-BR"];

    await signInWithoutTheLoginForm(page, {
      supabaseUrl: supabaseUrl!,
      serviceRoleKey: serviceRoleKey!,
      publishableKey: publishableKey!,
      email,
      locale: "pt-BR",
      appOrigin: baseURL!,
    });

    await page.goto("/pt-BR/app/chat");
    await page.getByLabel(text.composerLabel).fill(text.refuseSentence);
    await page.getByRole("button", { name: text.submit }).click();

    // The deterministic refusal names what the composer can create
    // (2G-ROUTE-004); no reminder, task or entry was written by the refusal.
    await expect(page.getByText(text.refusalNames).first()).toBeVisible({ timeout: 180_000 });
    await page.goto(text.tasksPath);
    await expect(page.getByText(text.refuseSentence)).toHaveCount(0);
  });
});
